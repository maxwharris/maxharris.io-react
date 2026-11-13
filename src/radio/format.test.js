// The radio's pure helpers (npm test): the catalog's wording, the Eastern clock, the song list and the calibration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bpmText, keyText, titleLine, easternClock, parseExpires, normalizeSongs, calibrate } from './format.js';

test('tempo, key and title read as the catalog writes them', () => {
  assert.equal(bpmText(110), '110');
  assert.equal(bpmText(87.46), '87.5');
  assert.equal(bpmText(0), '');
  assert.equal(bpmText(null), '');
  assert.equal(keyText('C minor'), 'Cm');
  assert.equal(keyText('F# major'), 'F#');
  assert.equal(keyText('Bb min'), 'Bbm');
  assert.equal(keyText('nonsense'), '');
  assert.equal(titleLine({ title: 'fly low', credit: 'a friend' }), 'fly low (a friend)');
  assert.equal(titleLine({ title: 'hektik', credit: null }), 'hektik');
});

test('the clock is Eastern time whatever the device zone', () => {
  assert.deepEqual(easternClock(Date.UTC(2026, 10, 13, 5, 0, 0)), { time: '12:00', ampm: 'AM', tz: 'EST', text: '12:00 AM' });
  assert.deepEqual(easternClock(Date.UTC(2026, 10, 13, 22, 7, 0)), { time: '5:07', ampm: 'PM', tz: 'EST', text: '5:07 PM' });
  // daylight time in summer: UTC-4, and the display says so
  assert.equal(easternClock(Date.UTC(2027, 6, 1, 16, 30, 0)).text, '12:30 PM');
  assert.equal(easternClock(Date.UTC(2027, 6, 1, 16, 30, 0)).tz, 'EDT');
  assert.equal(easternClock(NaN).time, '--:--');
});

test('link expiry in any of the shapes a server sends', () => {
  const now = 1_800_000_000_000;
  assert.equal(parseExpires(3600, now), now + 3_600_000);
  assert.equal(parseExpires(1_800_003_600, now), 1_800_003_600_000);
  assert.equal(parseExpires(1_800_003_600_000, now), 1_800_003_600_000);
  assert.equal(parseExpires('2027-01-15T00:00:00Z', now), Date.UTC(2027, 0, 15));
  assert.equal(parseExpires(undefined, now), now + 50 * 60 * 1000);
});

test('the song list keeps only what every listener can agree on', () => {
  const list = normalizeSongs([
    { id: 1, title: 'hektik', credit: null, durationMs: 91000, bpm: null, key: null, look: { bg: '#f3f2ee', fg: '#1a1915', card: '#fbfaf7' } },
    { id: 1, title: 'a duplicate', durationMs: 5000 },
    { id: 2, title: ' fly low ', credit: 'a friend', durationMs: 200700, bpm: 110, key: 'C minor', look: { bg: 'red', fg: '#fff' } },
    { id: 3, title: 'no length', durationMs: 0 },
    { id: 4, title: 'fraction', durationMs: 1000.5 },
    { title: 'no id', durationMs: 1000 },
    null,
  ]);
  assert.deepEqual(list.map((s) => s.id), [1, 2]);
  assert.equal(list[1].title, 'fly low');
  assert.equal(list[1].credit, 'a friend');
  assert.equal(list[1].bpm, 110);
  assert.deepEqual(list[0].look, { bg: '#f3f2ee', fg: '#1a1915', card: '#fbfaf7' });
  assert.deepEqual(list[1].look, { bg: '#0b0b0b', fg: '#f0efea', card: '#161616' }); // a bad colour: the catalog's black
  assert.deepEqual(normalizeSongs(undefined), []);
});

test('calibration keeps the tightest recent sample and follows a moved device clock', () => {
  // the server is 5 s ahead; a 200 ms round trip
  let cal = calibrate(null, 10_005_100, 10_000_000, 10_000_200);
  assert.deepEqual(cal, { offset: 5000, rtt: 200, at: 10_000_200 });
  // a looser sample a minute later does not replace it
  cal = calibrate(cal, 10_065_300, 10_060_000, 10_060_600);
  assert.equal(cal.rtt, 200);
  // a tighter one does
  cal = calibrate(cal, 10_125_020, 10_120_000, 10_120_040);
  assert.deepEqual([cal.offset, cal.rtt], [5000, 40]);
  // the device clock jumped 30 s: the new sample wins even though it is looser
  cal = calibrate(cal, 10_185_100, 10_150_000, 10_150_200);
  assert.deepEqual([cal.offset, cal.rtt], [35000, 200]);
  // after ten minutes any sample replaces an old one
  cal = calibrate(cal, 10_935_400, 10_900_000, 10_900_800);
  assert.equal(cal.rtt, 800);
  // a bad answer changes nothing
  assert.equal(calibrate(cal, NaN, 1, 2), cal);
});
