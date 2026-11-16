// The catalog routes the radio admin calls (the catalog repo's docs/app.md). They are on this site's own origin, so the
// catalog's session cookie (catalog_session: HttpOnly, Path=/catalog) goes with every request under /catalog/api and
// nothing here touches it. Every change carries X-Catalog: 1, which the catalog requires of a change (lib/guard.js), and
// its body as JSON. A session route answers 401 {signin: true} when no one is signed in.

export const API = '/catalog/api';
/** Where Max signs in: the catalog itself, in a new tab. */
export const CATALOG_URL = 'https://maxharris.io/catalog/';

export class CatalogError extends Error {
  /** status: the HTTP status, 0 when the catalog could not be reached; signin: no session; data: the answer's body. */
  constructor(status, message, signin = false, data = null) {
    super(message);
    this.status = status;
    this.signin = signin;
    this.data = data;
  }
}

async function call(method, path, body, signal) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers, cache: 'no-store', credentials: 'same-origin', signal };
  if (method !== 'GET') headers['X-Catalog'] = '1';
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(API + path, init);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new CatalogError(0, 'could not reach the catalog.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401) throw new CatalogError(401, 'sign in to the catalog first.', true);
  if (!res.ok) throw new CatalogError(res.status, (data && typeof data.error === 'string' && data.error) || `the catalog answered ${res.status}.`, false, data);
  return data;
}

/** [{id, name, songs (a count), radio, ...}]: the radio's crate is the one with radio: true. */
export const listCrates = () => call('GET', '/crates');
/** {id, name, radio, songs: [compact song rows in crate order, stale and unplayable ones included], ...} */
export const getCrate = (id) => call('GET', `/crates/${id}`);
/** The radio as every listener reads it (no session): {on, now, version, songs, anchor, carry}. */
export const getRadio = () => call('GET', '/radio');
/** A crate named radio, which is the radio's at once. */
export const makeRadioCrate = () => call('POST', '/crates', { name: 'radio' });
/** The crate's new order: every song in it once. Answers like getCrate. */
export const saveOrder = (id, songIds) => call('PUT', `/crates/${id}/order`, { songIds });
/** Adds a song at the end of the crate (200 {added: false} when it is there already). */
export const addSong = (id, songId) => call('POST', `/crates/${id}/songs`, { songId });
export const removeSong = (id, songId) => call('DELETE', `/crates/${id}/songs/${songId}`);
/** {songs: [compact song rows, best first, at most 20], files} */
export const search = (q, signal) => call('GET', `/search?q=${encodeURIComponent(q)}`, undefined, signal);

// ---------------------------------------------------------------- the talk-over (mic.js): Max live over the radio
/**
 * Starts a talk: {id, startedAt, sampleRate (24000), chunkMs (250)}. A talk already live answers 409 (a CatalogError whose
 * data.live is {id, since}); takeOver ends that one first and starts this one. signal: an AbortSignal (mic.js gives up on
 * a catalog that does not answer), which rejects with the browser's AbortError.
 */
export const startTalk = (takeOver = false, signal = undefined) => call('POST', '/radio/talk', takeOver ? { takeOver: true } : {}, signal);

/**
 * One chunk of the talk's voice (raw s16le PCM, mono, 24 kHz) as number seq. Never throws: {outcome: 'ok', 'retry' (no
 * answer, or the catalog was busy), 'gone' (410: the talk has ended) or 'refused' (with status and the catalog's error)}.
 */
export async function sendAudio(id, seq, pcm) {
  let res;
  try {
    res = await fetch(`${API}/radio/talk/${encodeURIComponent(id)}/audio?seq=${seq}`, {
      method: 'POST',
      body: pcm,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Catalog': '1' },
    });
  } catch {
    return { outcome: 'retry' };
  }
  if (res.ok) return { outcome: 'ok' };
  if (res.status === 410) return { outcome: 'gone' };
  if (res.status === 429 || res.status >= 500) return { outcome: 'retry' };
  const data = await res.json().catch(() => null);
  return { outcome: 'refused', status: res.status, error: (data && typeof data.error === 'string' && data.error) || '' };
}

/** Ends a talk (also one that has ended already). Fire and forget, and kept alive so it still goes as the page closes. */
export function endTalk(id) {
  try {
    fetch(`${API}/radio/talk/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: true,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'X-Catalog': '1' },
    }).catch(() => {});
  } catch { /* the catalog ends it by itself 4 s after the last audio */ }
}
