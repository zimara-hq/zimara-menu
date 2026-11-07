// All occasion boundaries are Saudi civil dates, inclusive start / exclusive end.
const DAY = 86400000;
const RIYADH_OFFSET = 3 * 3600000;
const hijriFormatter = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn', {
  timeZone:'Asia/Riyadh', year:'numeric', month:'numeric', day:'numeric',
});

const occasion = (id,name_ar,name_en,accent,calendar,month,day,duration) => Object.freeze({
  id,name_ar,name_en,motif:id,accent,banner_ar:name_ar,banner_en:name_en,
  rule:Object.freeze({calendar,month,day,duration}),
});
export const BUILTIN_OCCASIONS = Object.freeze([
  occasion('ramadan','رمضان المبارك','Ramadan','#166854','hijri',9,1,'month'),
  occasion('eid-fitr','عيد الفطر','Eid al-Fitr','#A76528','hijri',10,1,3),
  occasion('eid-adha','عيد الأضحى','Eid al-Adha','#74613C','hijri',12,10,4),
  occasion('national','اليوم الوطني','Saudi National Day','#167044','gregorian',9,23,1),
  occasion('founding','يوم التأسيس','Founding Day','#805238','gregorian',2,22,1),
  occasion('winter','موسم الشتاء','Winter','#365E79','gregorian',12,1,90),
]);

export const CITIES = Object.freeze(Object.fromEntries([
  ['riyadh','الرياض','Riyadh',24.7136,46.6753],
  ['jeddah','جدة','Jeddah',21.4858,39.1925],
  ['makkah','مكة المكرمة','Makkah',21.3891,39.8579],
  ['madinah','المدينة المنورة','Madinah',24.5247,39.5692],
  ['dammam','الدمام','Dammam',26.4207,50.0888],
  ['khobar','الخبر','Khobar',26.2172,50.1971],
  ['abha','أبها','Abha',18.2164,42.5053],
  ['tabuk','تبوك','Tabuk',28.3838,36.5550],
  ['buraidah','بريدة','Buraidah',26.3592,43.9818],
  ['hail','حائل','Hail',27.5114,41.7208],
  ['taif','الطائف','Taif',21.2703,40.4158],
  ['jazan','جازان','Jazan',16.8892,42.5511],
  ['najran','نجران','Najran',17.5656,44.2289],
].map(([id,name_ar,name_en,lat,lon]) => [id,Object.freeze({name_ar,name_en,lat,lon})])));

function instant(at) {
  const value = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(value)) throw new RangeError('Invalid calendar date');
  // Bound merchant calendar computation to years where the ICU Umm al-Qura table is useful.
  const year = new Date(value).getUTCFullYear();
  if (year < 1900 || year > 2100) throw new RangeError('Calendar date unavailable');
  return value;
}
function civilDay(at) { return Math.floor((instant(at) + RIYADH_OFFSET) / DAY); }
function iso(day) { return new Date(day * DAY).toISOString().slice(0,10); }

export function hijriParts(at = Date.now()) {
  if (hijriFormatter.resolvedOptions().calendar !== 'islamic-umalqura') throw new RangeError('Umm al-Qura calendar unavailable');
  const parts = hijriFormatter.formatToParts(instant(at));
  return Object.fromEntries(['year','month','day'].map(key => [key,Number(parts.find(p => p.type === key)?.value)]));
}

function gregorianDay(year,month,day) {
  const date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCMonth() === month-1 && date.getUTCDate() === day ? date.getTime()/DAY : null;
}
const hijriKey = ({year,month,day}) => year * 10000 + month * 100 + day;
function hijriDay(year,month,day,near) {
  // Monotonic search through real ICU calendar days; never assume 30-day months.
  const target = hijriKey({year,month,day});
  let low = near - 800, high = near + 3300;
  while (low < high) {
    const middle = Math.floor((low+high)/2);
    const key = hijriKey(hijriParts(middle*DAY+12*3600000));
    if (key < target) low = middle+1; else high = middle;
  }
  return hijriKey(hijriParts(low*DAY+12*3600000)) === target ? low : null;
}

function validateRule(rule) {
  if (!rule || !['hijri','gregorian'].includes(rule.calendar) || !Number.isInteger(rule.month) || rule.month<1 || rule.month>12 || !Number.isInteger(rule.day) || rule.day<1 || rule.day>31) throw new RangeError('Invalid occasion rule');
  if (rule.calendar === 'hijri' ? rule.day>30 : gregorianDay(2000,rule.month,rule.day) === null) throw new RangeError('Invalid occasion day');
  if (rule.duration === 'month') {
    if (rule.calendar !== 'hijri' || rule.day !== 1) throw new RangeError('Invalid month rule');
  } else if (!Number.isInteger(rule.duration) || rule.duration<1 || rule.duration>120) throw new RangeError('Invalid occasion duration');
}

export function occasionRange(occasion, at = Date.now()) {
  const rule = occasion?.rule;
  validateRule(rule);
  const today = civilDay(at);
  const year = rule.calendar === 'hijri' ? hijriParts(at).year : new Date(today*DAY).getUTCFullYear();
  let next = null;
  for (let candidate = year-1; candidate <= year+8; candidate++) {
    const start = rule.calendar === 'hijri' ? hijriDay(candidate,rule.month,rule.day,today) : gregorianDay(candidate,rule.month,rule.day);
    if (start === null) continue;
    const end = rule.duration === 'month'
      ? hijriDay(candidate+(rule.month===12?1:0),rule.month===12?1:rule.month+1,1,today)
      : start+rule.duration;
    if (end === null) throw new RangeError('Occasion end unavailable');
    const range = {starts_on:iso(start),ends_on:iso(end),active:start<=today && today<end};
    if (range.active) return range;
    if (start>today && !next) next = range;
    if (next) return next;
  }
  throw new RangeError('Occasion date unavailable');
}

// NOAA fractional-year solar approximation, sea-level sunset -0.833°, dawn -18.5°.
// These rounded estimates omit terrain/elevation and are not a prayer notification service.
export function cityTimes(city, at = Date.now()) {
  if (typeof city !== 'string' || !Object.hasOwn(CITIES,city)) throw new RangeError('Unknown Saudi city');
  const day = civilDay(at), date = new Date(day*DAY);
  const dayOfYear = day - Date.UTC(date.getUTCFullYear(),0,1)/DAY + 1;
  const daysInYear = (Date.UTC(date.getUTCFullYear()+1,0,1)-Date.UTC(date.getUTCFullYear(),0,1))/DAY;
  const gamma = 2*Math.PI/daysInYear*(dayOfYear-1);
  const equation = 229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  const declination = 0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
  const {lat,lon} = CITIES[city];
  const latitude = lat*Math.PI/180;
  const noon = 720-4*lon-equation+180;
  const angle = altitude => Math.acos((Math.sin(altitude*Math.PI/180)-Math.sin(latitude)*Math.sin(declination))/(Math.cos(latitude)*Math.cos(declination)))*180/Math.PI*4;
  const clock = value => {
    if (!Number.isFinite(value)) throw new RangeError('Solar calculation unavailable');
    const minute = ((Math.round(value)%1440)+1440)%1440;
    return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  };
  return {sunset:clock(noon+angle(-0.833)),fajr:clock(noon-angle(-18.5)),date:iso(day),source:'calculated'};
}
