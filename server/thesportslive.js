// TheSports live manager: joins the MQTT client (mqttws.js) with the tracker decoder (thesports.js).
// It listens to the live feed and keeps, per match topic, the latest ball position, score, statistics
// and players. Nothing here touches the public site — it exists so the admin can watch the feed and
// confirm it works before we draw the 3D court. A match topic is `v3/live/m1/<id>`; the admin test can
// listen to the wildcard `v3/live/m1/#` (every live match at once) or to one id.

import { createMqttClient } from './mqttws.js';
import { decodeTracker, trackerTopic } from './thesports.js';

const WILDCARD = 'v3/live/m1/#';
const idOf = (topic) => String(topic).replace(/^v3\/live\/m1\//, '');

export function createTheSportsLive({
  url, username = '', password = '', maxTopics = 400, listenMinutes = 15,
  log = () => {}, WebSocketImpl = globalThis.WebSocket, mqttFactory = createMqttClient,
} = {}) {
  const matches = new Map(); // id → { id, score, ball, stats, players, msgs, lastAt }
  let client = null, listeningAll = false, autoStop = null;

  function ensureClient() {
    if (client || !url) return client;
    client = mqttFactory({ url, username, password, log, WebSocketImpl });
    client.on('message', ({ topic, payload }) => {
      const id = idOf(topic);
      if (!/^[a-z0-9]{6,40}$/i.test(id)) return;
      const dec = decodeTracker(payload);
      let m = matches.get(id);
      if (!m) { if (matches.size >= maxTopics) return; m = { id, msgs: 0 }; matches.set(id, m); }
      m.msgs += 1; m.lastAt = new Date().toISOString();
      if (dec.type === 'position') { m.score = dec.score; if (dec.ball) m.ball = dec.ball; }
      else if (dec.type === 'stats' && dec.stats.length) m.stats = dec.stats;
      else if (dec.type === 'lineups' && dec.players.length) m.players = dec.players;
    });
    return client;
  }

  return {
    enabled: !!url,
    /** Admin test: listen to every live match. Stops itself after `listenMinutes` so it is never left on. */
    listenAll() {
      if (!url) return false;
      ensureClient().subscribe(WILDCARD);
      listeningAll = true;
      clearTimeout(autoStop);
      autoStop = setTimeout(() => this.stopAll(), listenMinutes * 60_000);
      if (autoStop.unref) autoStop.unref();
      return true;
    },
    stopAll() { if (client) client.unsubscribe(WILDCARD); listeningAll = false; clearTimeout(autoStop); },
    /** Follow one match by its tracker id (what the SportScore match detail carries). */
    watch(trackerId) { const t = trackerTopic(trackerId); if (t) ensureClient()?.subscribe(t); return !!t; },
    unwatch(trackerId) { const t = trackerTopic(trackerId); if (t && client) client.unsubscribe(t); },
    /** The latest decoded state of one match, or null. */
    get(trackerId) { return matches.get(String(trackerId)) || null; },
    clear() { matches.clear(); },
    status() {
      const c = client ? client.status() : { connected: false, messages: 0, lastError: null };
      return { enabled: !!url, listeningAll, connected: c.connected, messages: c.messages, lastError: c.lastError, matches: matches.size };
    },
    /** Matches seen, most recently updated first, for the admin table. */
    snapshot(limit = 120) {
      return [...matches.values()]
        .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, limit)
        .map((m) => ({ id: m.id, score: m.score || null, ball: m.ball || null, stats: m.stats ? m.stats.length : 0, players: m.players ? m.players.length : 0, msgs: m.msgs, lastAt: m.lastAt }));
    },
    close() { try { client?.close(); } catch { /* gone */ } client = null; matches.clear(); clearTimeout(autoStop); },
  };
}
