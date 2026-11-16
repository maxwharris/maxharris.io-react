// The catalog routes the radio admin calls (the catalog repo's docs/app.md). They are on this site's own origin, so the
// catalog's session cookie (catalog_session: HttpOnly, Path=/catalog) goes with every request under /catalog/api and
// nothing here touches it. Every change carries X-Catalog: 1, which the catalog requires of a change (lib/guard.js), and
// its body as JSON. A session route answers 401 {signin: true} when no one is signed in.

export const API = '/catalog/api';
/** Where Max signs in: the catalog itself, in a new tab. */
export const CATALOG_URL = 'https://maxharris.io/catalog/';

export class CatalogError extends Error {
  /** status: the HTTP status, 0 when the catalog could not be reached; signin: no session. */
  constructor(status, message, signin = false) {
    super(message);
    this.status = status;
    this.signin = signin;
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
  if (!res.ok) throw new CatalogError(res.status, (data && typeof data.error === 'string' && data.error) || `the catalog answered ${res.status}.`);
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
