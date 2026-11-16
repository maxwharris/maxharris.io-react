// The radio's pure helpers (npm test): the title line, the Eastern clock, the song list, the station, the calibration
// and the embed's address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleLine, easternClock, parseExpires, normalizeSongs, normalizeStation, stationKey, embedOptions, calibrate } from './format.js';
import { onAir } from './schedule.js';

test('the title line carries the credit when there is one', () => {
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

test('the station: the queue with its anchor and carry, ids as the list spells them, nothing when off', () => {
  const songs = [{ id: 12, title: 'a', durationMs: 10000 }, { id: 13, title: 'b', durationMs: 20000 }];
  const st = normalizeStation({ on: true, now: 1, version: 'abc', songs, anchor: { at: '2000000', songId: '13' }, carry: { songId: 12, startedAt: 1990000, endsAt: 2000000 } });
  assert.deepEqual([st.version, st.songs.map((s) => s.id)], ['abc', [12, 13]]);
  assert.deepEqual(st.anchor, { at: 2000000, songId: 13 });
  assert.deepEqual(st.carry, { songId: 12, startedAt: 1990000, endsAt: 2000000 });
  // the walk reads it as sent: the carried song to its end, then the anchor's
  assert.equal(onAir(st, 1995000).song.id, 12);
  assert.deepEqual([onAir(st, 2000000).song.id, onAir(st, 2000000).offsetMs], [13, 0]);
  // an anchor song the list lacks stays as sent (the walk then starts at the first song, as the catalog's does)
  assert.equal(normalizeStation({ on: true, songs, anchor: { at: 5, songId: 99 } }).anchor.songId, 99);
  // an anchor time that is not a number stays so (the walk counts it as 0, from the anchor's song); a carry that cannot
  // be placed is left out
  const bad = normalizeStation({ on: true, songs, anchor: { at: 'soon', songId: 13 }, carry: { songId: 12, startedAt: null, endsAt: 4 } });
  assert.ok(Number.isNaN(bad.anchor.at));
  assert.equal(bad.carry, null);
  assert.deepEqual([onAir(bad, 0).song.id, onAir(bad, 0).startedAt], [13, 0]);
  assert.deepEqual(normalizeStation({ on: true, songs }), { songs: normalizeSongs(songs), version: '', anchor: null, carry: null });
  // off, or nothing that can play: nothing at all
  const off = { songs: [], version: '', anchor: null, carry: null };
  assert.deepEqual(normalizeStation({ on: false, version: 'abc', songs, anchor: { at: 1, songId: 12 } }), off);
  assert.deepEqual(normalizeStation({ on: true, songs: [{ id: 1, durationMs: 0 }] }), off);
  assert.deepEqual(normalizeStation(null), off);
});

test('the station key changes with the queue, the anchor or the carry, and not with a title', () => {
  const base = { on: true, version: 'v1', songs: [{ id: 1, title: 'a', durationMs: 1000 }, { id: 2, title: 'b', durationMs: 2000 }], anchor: { at: 10, songId: 1 }, carry: null };
  const k = stationKey(normalizeStation(base));
  assert.equal(stationKey(normalizeStation({ ...base, songs: [{ ...base.songs[0], title: 'renamed' }, base.songs[1]] })), k);
  assert.notEqual(stationKey(normalizeStation({ ...base, anchor: { at: 11, songId: 1 } })), k);
  assert.notEqual(stationKey(normalizeStation({ ...base, carry: { songId: 2, startedAt: 0, endsAt: 10 } })), k);
  assert.notEqual(stationKey(normalizeStation({ ...base, songs: [base.songs[1], base.songs[0]] })), k);
  assert.notEqual(stationKey(normalizeStation({ ...base, version: 'v2' })), k);
  assert.equal(stationKey(normalizeStation({ on: false })), '');
});

test("the embed's address: the display alone, the knob and the light, each optional", () => {
  const illums = ['blue', 'amber'];
  assert.deepEqual(embedOptions('', illums), { display: false, volume: null, illum: null });
  assert.deepEqual(embedOptions('?display', illums), { display: true, volume: null, illum: null });
  assert.deepEqual(embedOptions('?display=1&volume=65&illum=Amber', illums), { display: true, volume: 0.65, illum: 'amber' });
  assert.equal(embedOptions('?display=0', illums).display, false);
  assert.equal(embedOptions('?volume=150', illums).volume, 1);
  assert.equal(embedOptions('?volume=-3', illums).volume, 0);
  assert.equal(embedOptions('?volume=0', illums).volume, 0);
  assert.equal(embedOptions('?volume=loud', illums).volume, null);
  assert.equal(embedOptions('?volume=', illums).volume, null);
  assert.equal(embedOptions('?illum=pink', illums).illum, null);
});
