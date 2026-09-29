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
