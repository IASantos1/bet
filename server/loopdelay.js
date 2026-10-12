// How long the server takes to get to work it was handed (event-loop delay). Each casino round waits
// on it twice (BigBang asks the balance, then sends the bet): a busy loop — a big feed answer parsed,
// a long synchronous job — is felt as a game that stutters. Admin → Casino shows the last minute.
import { monitorEventLoopDelay } from 'node:perf_hooks';

let h = null;
let last = null; // { at, p50, p99, max } of the last full minute (ms)
const ms = (ns) => Math.round((ns / 1e6) * 10) / 10;

/** Starts measuring (once per process). */
export function startLoopDelay() {
  if (h) return;
  h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  setInterval(() => {
    last = { at: new Date().toISOString(), p50: ms(h.percentile(50)), p99: ms(h.percentile(99)), max: ms(h.max) };
    h.reset();
  }, 60_000).unref();
}

/** The last minute's delay (or what was measured so far): { p50, p99, max } in ms, null when off. */
export function loopDelay() {
  if (!h) return null;
  return last || { at: null, p50: ms(h.percentile(50)), p99: ms(h.percentile(99)), max: ms(h.max) };
}
