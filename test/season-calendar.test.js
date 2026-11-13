import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_OCCASIONS, CITIES, hijriParts, occasionRange, cityTimes } from '../src/season-calendar.js';

const builtin = id => BUILTIN_OCCASIONS.find(occasion => occasion.id === id);

test('Umm al-Qura follows Riyadh civil midnight rather than UTC or lunar arithmetic', () => {
  assert.deepEqual(hijriParts('2025-02-28T20:59:59Z'), {year:1446,month:8,day:29});
  assert.deepEqual(hijriParts('2025-02-28T21:00:00Z'), {year:1446,month:9,day:1});
  assert.deepEqual(hijriParts('2025-03-29T21:00:00Z'), {year:1446,month:10,day:1});
});

test('29-day Ramadan ends exclusively before Eid, then resolves the next Ramadan', () => {
  assert.deepEqual(occasionRange(builtin('ramadan'), '2025-03-29T20:59:59Z'), {starts_on:'2025-03-01',ends_on:'2025-03-30',active:true});
  assert.deepEqual(occasionRange(builtin('ramadan'), '2025-03-29T21:00:00Z'), {starts_on:'2026-02-18',ends_on:'2026-03-20',active:false});
  assert.deepEqual(occasionRange(builtin('eid-fitr'), '2025-03-29T21:00:00Z'), {starts_on:'2025-03-30',ends_on:'2025-04-02',active:true});
});

test('Hijri Eid al-Adha uses Umm al-Qura and a four-day inclusive/exclusive range', () => {
  assert.deepEqual(occasionRange(builtin('eid-adha'), '2025-06-06T12:00:00Z'), {starts_on:'2025-06-06',ends_on:'2025-06-10',active:true});
});

test('Gregorian one-day occasions use Saudi midnight and return the next year after expiry', () => {
  assert.deepEqual(occasionRange(builtin('national'), '2026-09-22T21:00:00Z'), {starts_on:'2026-09-23',ends_on:'2026-09-24',active:true});
  assert.deepEqual(occasionRange(builtin('national'), '2026-09-23T21:00:00Z'), {starts_on:'2027-09-23',ends_on:'2027-09-24',active:false});
  assert.equal(occasionRange(builtin('founding'), '2026-02-22T12:00:00Z').active, true);
});

test('winter remains active over year wrap and durations count leap days', () => {
  assert.deepEqual(occasionRange(builtin('winter'), '2027-01-02T12:00:00Z'), {starts_on:'2026-12-01',ends_on:'2027-03-01',active:true});
  assert.deepEqual(occasionRange(builtin('winter'), '2024-02-28T12:00:00Z'), {starts_on:'2023-12-01',ends_on:'2024-02-29',active:true});
  const leap = {rule:{calendar:'gregorian',month:2,day:29,duration:1}};
  assert.deepEqual(occasionRange(leap, '2026-01-01T12:00:00Z'), {starts_on:'2028-02-29',ends_on:'2028-03-01',active:false});
});

test('bounded rules and dates reject unavailable or malformed calendar inputs', () => {
  for (const rule of [null,{calendar:'julian',month:1,day:1,duration:1},{calendar:'hijri',month:13,day:1,duration:1},{calendar:'gregorian',month:2,day:30,duration:1},{calendar:'gregorian',month:1,day:1,duration:121},{calendar:'gregorian',month:1,day:1,duration:'month'},{calendar:'hijri',month:9,day:2,duration:'month'}]) {
    assert.throws(() => occasionRange({rule}, '2026-01-01T12:00:00Z'), RangeError);
  }
  assert.throws(() => hijriParts('nonsense'), RangeError);
  assert.throws(() => cityTimes('riyadh', 'nonsense'), RangeError);
});

const minutes = value => { assert.match(value, /^\d{2}:\d{2}$/); const [h,m] = value.split(':').map(Number); assert.ok(h<24 && m<60); return h*60+m; };
test('Saudi city solar estimates are plausible, deterministic, and explicitly calculated', () => {
  for (const city of Object.keys(CITIES)) for (const date of ['2026-06-21T12:00:00Z','2026-12-21T12:00:00Z']) {
    const result = cityTimes(city,date);
    assert.equal(result.source,'calculated');
    assert.equal(result.date,date.slice(0,10));
    assert.ok(minutes(result.fajr)>180 && minutes(result.fajr)<370, `${city} dawn`);
    assert.ok(minutes(result.sunset)>990 && minutes(result.sunset)<1210, `${city} sunset`);
    assert.deepEqual(cityTimes(city,date),result);
  }
  const riyadh = cityTimes('riyadh','2026-03-01T12:00:00Z');
  const jeddah = cityTimes('jeddah','2026-03-01T12:00:00Z');
  const dammam = cityTimes('dammam','2026-03-01T12:00:00Z');
  assert.ok(minutes(dammam.sunset)<minutes(riyadh.sunset));
  assert.ok(minutes(riyadh.sunset)<minutes(jeddah.sunset));
  assert.ok(Math.abs(minutes(riyadh.sunset)-(17*60+55))<12);
  assert.ok(Math.abs(minutes(riyadh.fajr)-(4*60+59))<15);
  assert.equal(cityTimes('riyadh','2026-03-01T21:00:00Z').date,'2026-03-02');
  assert.throws(() => cityTimes('london','2026-03-01T12:00:00Z'),RangeError);
  assert.throws(() => cityTimes('toString','2026-03-01T12:00:00Z'),RangeError);
});
