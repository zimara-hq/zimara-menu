import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './d1.js';
import { automationReadiness, ticketAutomationStatement, automationCron } from '../src/automation.js';
import { hmac } from '../src/util.js';
import { client, makeEnv, setupOrg } from './helpers.js';

const configured = { AUTOMATION_ENABLED: 'true', AUTOMATION_WEBHOOK_URL: 'https://hooks.zimara.io/webhook/tickets', AUTOMATION_SIGNING_SECRET: 'local-test-signing-key-that-is-not-real' };
async function fixture() {
  const env = { DB: createD1(), ...configured };
  await env.DB.prepare("INSERT INTO orgs(id,slug,name_ar,name_en,created_at) VALUES('org','automation','اختبار','Test',0)").run();
  await env.DB.prepare("INSERT INTO branches(id,org_id,slug,name_ar,name_en,created_at) VALUES('branch','org','automation','اختبار','Test',0)").run();
  await env.DB.prepare("INSERT INTO tickets(id,org_id,branch_id,number,token,status,created_at) VALUES('ticket','org','branch','001','private-token','preparing',0)").run();
  return env;
}
const event = { org_id: 'org', branch_id: 'branch', ticket_id: 'ticket', status: 'collected', version: 2, timestamp: Date.now() };
async function enqueueAutomation(env, event) {
  await env.DB.batch([
    env.DB.prepare('UPDATE tickets SET status=?,version=? WHERE id=? AND version=?').bind(event.status, event.version, event.ticket_id, event.version - 1),
    ticketAutomationStatement(env, event),
  ]);
}

test('automation is opt in; rejects unsafe endpoints and never treats configuration as verification', () => {
  assert.equal(automationReadiness({}).state, 'disabled');
  for (const endpoint of ['http://hooks.zimara.io', 'https://127.0.0.1', 'https://[::1]', 'https://n8n.local', 'https://n8n.internal', 'https://localhost', 'https://u:p@hooks.zimara.io', 'https://hooks.zimara.io:8443', 'https://hooks.zimara.io/#secret']) {
    assert.equal(automationReadiness({ ...configured, AUTOMATION_WEBHOOK_URL: endpoint }).configured, false, endpoint);
  }
  assert.equal(automationReadiness({ ...configured, AUTOMATION_SIGNING_SECRET: 'short' }).configured, false);
  assert.equal(automationReadiness(configured).state, 'configured_unverified');
  assert.equal(automationReadiness(configured).verified, false);
  assert.equal(ticketAutomationStatement({}, event), null);
});

test('conditional ticket transition and outbox event commit atomically; version conflicts create no extra event', async () => {
  const env = await fixture();
  const write = () => env.DB.prepare("UPDATE tickets SET status='collected',version=version+1 WHERE id='ticket' AND version=1");
  await env.DB.batch([write(), ticketAutomationStatement(env, event)]);
  await env.DB.batch([write(), ticketAutomationStatement(env, event)]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM automation_deliveries').first()).n, 1);
  await ticketAutomationStatement(env, { ...event, version: 3 }).run();
  await ticketAutomationStatement(env, { ...event, branch_id: 'wrong' }).run();
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM automation_deliveries').first()).n, 1);
  const row = await env.DB.prepare('SELECT payload FROM automation_deliveries').first();
  assert.equal(row.payload.includes('private-token'), false);
  assert.deepEqual(JSON.parse(row.payload).data, { branch_id: 'branch', ticket_id: 'ticket', status: 'collected', version: 2 });
  await assert.rejects(env.DB.batch([
    env.DB.prepare("UPDATE tickets SET status='cancelled',version=3 WHERE id='ticket'"),
    ticketAutomationStatement(env, { ...event, status: 'cancelled', version: 3 }),
    env.DB.prepare('INSERT INTO missing_table(id) VALUES(1)'),
  ]));
  assert.equal((await env.DB.prepare("SELECT version FROM tickets WHERE id='ticket'").first()).version, 2);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM automation_deliveries').first()).n, 1);
});

test('delivery signs exact raw payload, forbids redirects and coalesces concurrent cron claims', async () => {
  const env = await fixture();
  await enqueueAutomation(env, event);
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url, configured.AUTOMATION_WEBHOOK_URL);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers['x-zimara-signature'], await hmac(configured.AUTOMATION_SIGNING_SECRET, `${init.headers['x-zimara-timestamp']}.${init.body}`));
    assert.equal(init.headers['x-zimara-event-id'], JSON.parse(init.body).id);
    return new Response(null, { status: 204 });
  };
  await Promise.all([automationCron(env, fetcher), automationCron(env, fetcher)]);
  assert.equal(calls, 1);
  const row = await env.DB.prepare('SELECT * FROM automation_deliveries').first();
  assert.equal(row.status, 'delivered');
  assert.equal(row.attempts, 1);
  assert.equal(row.last_status, 204);
  assert.ok(row.delivered_at);
  assert.equal(row.lease_token, null);
  await automationCron(env, fetcher);
  assert.equal(calls, 1);
});

test('network and HTTP failures retry five times with stable event id, then fail visibly', async () => {
  const env = await fixture();
  await enqueueAutomation(env, event);
  const ids = new Set();
  let calls = 0;
  const fetcher = async (_url, init) => {
    ids.add(init.headers['x-zimara-event-id']);
    calls++;
    if (calls === 1) throw new Error('sensitive receiver error');
    return new Response('sensitive receiver body', { status: 503 });
  };
  for (let i = 1; i <= 5; i++) {
    await automationCron(env, fetcher);
    const row = await env.DB.prepare('SELECT * FROM automation_deliveries').first();
    assert.equal(row.attempts, i);
    assert.equal(row.status, i === 5 ? 'failed' : 'pending');
    assert.ok(row.next_attempt_at > Date.now());
    await env.DB.prepare('UPDATE automation_deliveries SET next_attempt_at=0').run();
  }
  await automationCron(env, fetcher);
  assert.equal(calls, 5);
  assert.equal(ids.size, 1);
  assert.equal(JSON.stringify(await env.DB.prepare('SELECT * FROM automation_deliveries').first()).includes('sensitive'), false);
});

test('expired leases recover, suspended organizations do not dispatch, disabled configuration sends nothing', async () => {
  const env = await fixture();
  await enqueueAutomation(env, event);
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(null, { status: 200 }); };
  await env.DB.prepare("UPDATE automation_deliveries SET status='delivering',lease_expires_at=0,attempts=1,lease_token='old'").run();
  await env.DB.prepare('UPDATE orgs SET active=0').run();
  await automationCron(env, fetcher);
  assert.equal(calls, 0);
  await env.DB.prepare('UPDATE orgs SET active=1').run();
  env.AUTOMATION_ENABLED = 'false';
  await automationCron(env, fetcher);
  assert.equal(calls, 0);
  env.AUTOMATION_ENABLED = 'true';
  await automationCron(env, fetcher);
  assert.equal(calls, 1);
});

test('admin automation status and manual retry enforce role access and redact secret/payload', async () => {
  const env = makeEnv(configured);
  const { admin, owner, cashier } = await setupOrg(env);
  assert.equal((await client(env).get('/api/admin/automation')).status, 401);
  assert.equal((await owner.get('/api/admin/automation')).status, 403);
  const made = await cashier.post('/api/branch/tickets', { number: '9000' });
  assert.equal((await cashier.post(`/api/branch/tickets/${made.json.id}/cancel`, { version: 1 })).status, 200);
  await env.DB.prepare("UPDATE automation_deliveries SET status='failed',attempts=5").run();
  const delivery = await env.DB.prepare('SELECT id FROM automation_deliveries').first();
  let status = await admin.get('/api/admin/automation');
  assert.equal(status.status, 200, status.text);
  assert.equal(status.json.deliveries[0].payload, undefined);
  assert.equal(status.text.includes(configured.AUTOMATION_SIGNING_SECRET), false);
  assert.equal(status.text.includes(configured.AUTOMATION_WEBHOOK_URL), false);
  assert.equal((await owner.post(`/api/admin/automation/${delivery.id}/retry`)).status, 403);
  assert.equal((await admin.post(`/api/admin/automation/${delivery.id}/retry`)).status, 200);
  assert.equal((await admin.post(`/api/admin/automation/${delivery.id}/retry`)).status, 404);
  assert.equal((await env.DB.prepare('SELECT attempts FROM automation_deliveries').first()).attempts, 0);
  env.AUTOMATION_ENABLED = 'false';
  assert.equal((await admin.post(`/api/admin/automation/${delivery.id}/retry`)).status, 503);
});

test('cashier status route creates one durable event per successful transition and rejects stale replay', async () => {
  const env = makeEnv(configured);
  const { cashier, branchId } = await setupOrg(env);
  const made = await cashier.post('/api/branch/tickets', { number: '9001' });
  assert.equal(made.status, 201, made.text);
  const ticketId = made.json.id;
  const ready = await cashier.post(`/api/branch/tickets/${ticketId}/ready`, { version: 1 });
  assert.equal(ready.status, 200, ready.text);
  assert.equal((await cashier.post(`/api/branch/tickets/${ticketId}/ready`, { version: 1 })).status, 409);
  const collect = await cashier.post(`/api/branch/tickets/${ticketId}/collect`, { version: 2 });
  assert.equal(collect.status, 200, collect.text);
  const { results } = await env.DB.prepare('SELECT payload FROM automation_deliveries ORDER BY created_at,id').all();
  assert.equal(results.length, 2);
  const events = results.map(row => JSON.parse(row.payload));
  assert.deepEqual(new Set(events.map(e => e.data.status)), new Set(['ready', 'collected']));
  assert.ok(events.every(e => e.data.branch_id === branchId && e.data.ticket_id === ticketId));
  assert.ok(results.every(row => !row.payload.includes(made.json.token)));
  // A transition while disabled is never backfilled by a rejected replay.
  env.AUTOMATION_ENABLED = 'false';
  const second = await cashier.post('/api/branch/tickets', { number: '9002' });
  assert.equal((await cashier.post(`/api/branch/tickets/${second.json.id}/cancel`, { version: 1 })).status, 200);
  env.AUTOMATION_ENABLED = 'true';
  assert.equal((await cashier.post(`/api/branch/tickets/${second.json.id}/cancel`, { version: 1 })).status, 409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM automation_deliveries').first()).n, 2);
});
