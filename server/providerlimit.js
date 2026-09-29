// Shared back-off for one provider account. Every feed that uses the same Bzzoiro token (football,
// tennis, basketball, ice hockey, darts, CS2) goes through here: when the provider answers 429
// ("too many requests") all of them pause together until it allows requests again, instead of
// each one hammering it every few seconds.

const paused = new Map(); // account key -> epoch ms until which no request is sent

/** Throws while the account is paused (the caller records it as its last error). */
export function checkPause(key) {
  const until = paused.get(key);
  if (until && Date.now() < until) {
    throw new Error(`limite de pedidos do fornecedor (429) — em pausa até ${new Date(until).toISOString().slice(11, 19)} UTC`);
  }
}

/** Records a 429: waits Retry-After seconds when given, else 60 s (at most 15 min). */
export function notePause(key, res) {
  const header = Number(res?.headers?.get?.('Retry-After'));
  const seconds = Number.isFinite(header) && header > 0 ? Math.min(header, 900) : 60;
  paused.set(key, Date.now() + seconds * 1000);
}

export const pausedUntil = (key) => {
  const until = paused.get(key);
  return until && until > Date.now() ? new Date(until).toISOString() : null;
};

// Requests per minute per account, shared by every feed. Scores and results come first: pre-match
// odds may use at most half of the minute, in-play odds 70 %, everything else all of it. A feed
// that finds no room simply stops its pass and continues on the next one.
const windows = new Map(); // account key -> timestamps of the last minute's requests
let perMinute = Infinity; // set at start-up from BZZOIRO_MAX_RPM (no limit when unset, e.g. tests)
export const setRequestsPerMinute = (n) => { if (n === Infinity || (Number.isFinite(n) && n > 0)) perMinute = n; };
const SHARE = { odds: 0.5, liveOdds: 0.7, other: 1 };

function recent(key) {
  const cut = Date.now() - 60_000;
  const list = (windows.get(key) || []).filter((t) => t > cut);
  windows.set(key, list);
  return list;
}

/** True when a request of this kind fits in the minute (does not reserve it). */
export const hasRoom = (key, kind = 'other') => recent(key).length < Math.floor(perMinute * (SHARE[kind] ?? 1));

/** Records one request, or throws when the minute's share for this kind is used up. */
export function spend(key, kind = 'other') {
  if (!hasRoom(key, kind)) {
    const err = new Error(`limite de ${perMinute} pedidos/min ao fornecedor — adiado para a próxima volta`);
    err.budget = true;
    throw err;
  }
  recent(key).push(Date.now());
}

export const requestsLastMinute = (key) => recent(key).length;

/** Admin view, without the keys (they contain the token): requests in the last minute and pauses. */
export function summary() {
  return [...new Set([...windows.keys(), ...paused.keys()])].map((key) => ({
    requestsLastMinute: recent(key).length, perMinute: Number.isFinite(perMinute) ? perMinute : null, pausedUntil: pausedUntil(key),
  }));
}
