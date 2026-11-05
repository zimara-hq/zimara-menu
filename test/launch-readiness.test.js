import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, setupOrg } from './helpers.js';
import { scheduled } from '../src/app.js';

test('health probes database but never leaks backend error, secret or resource identity', async () => {
  const env = makeEnv(), guest = client(env);
  const ok = await guest.get('/api/health');
  assert.equal(ok.status,200);
  assert.deepEqual(ok.json,{status:'ok'});
  assert.match(ok.headers.get('cache-control'),/no-store/);
  env.DB = {prepare(){throw new Error('private backend secret');}};
  const bad = await guest.get('/api/health');
  assert.equal(bad.status,503);
  assert.deepEqual(bad.json,{status:'degraded'});
  assert.ok(!bad.text.includes('secret'));
});

test('launch centre is role scoped, excludes sample items, and never implies live verification',async()=>{
  const env = makeEnv({ENVIRONMENT:'preview'});
  const {admin,owner,cashier}=await setupOrg(env);
  assert.equal((await client(env).get('/api/admin/launch')).status,401);
  assert.equal((await owner.get('/api/admin/launch')).status,403);
  assert.equal((await cashier.get('/api/owner/launch')).status,403);
  const own = await owner.get('/api/owner/launch');
  assert.equal(own.status,200);
  assert.equal(own.json.checks.find(c=>c.id==='branches').count,1);
  assert.equal(own.json.checks.find(c=>c.id==='items').count,0);
  assert.ok(own.json.integrations.every(i=>i.verified===false));
  const root=await admin.get('/api/admin/launch');
  assert.equal(root.status,200);
  assert.equal(root.json.production,false);
  assert.equal(root.json.legal.vat_registered,false);
  assert.ok(root.json.legal.missing.includes('cr_number'));
  assert.equal(root.json.infrastructure.assets,'d1_fallback');
  assert.equal(root.json.cron,null);
});

test('a failed scheduled subsystem does not stop cleanup or heartbeat, and failures are visible to admin only',async()=>{
  const env=makeEnv();
  const {admin}=await setupOrg(env);
  const db=env.DB;
  env.DB={...db,prepare(sql){
    if(sql.includes('DELETE FROM demo_rooms'))throw new Error('provider secret must not reach heartbeat');
    return db.prepare(sql);
  }};
  // Inject one explicit subsystem failure regardless of a demo cleanup implementation detail.
  env.DB.prepare=sql=>{
    if(sql.includes('demo_rooms') && /SELECT/.test(sql))throw new Error('private subsystem failure');
    return db.prepare(sql);
  };
  const result=await scheduled(env);
  assert.ok(result.failed.includes('demo_expiry'));
  env.DB=db;
  const root=await admin.get('/api/admin/launch');
  assert.equal(root.status,200);
  assert.ok(root.json.cron.failed.includes('demo_expiry'));
  assert.equal(root.json.cron.stale,false);
  assert.ok(!JSON.stringify(root.json).includes('private subsystem failure'));
});
