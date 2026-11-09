// TheSports live tracker feed (the source behind the 3D widgets): a match publishes its live state on
// an MQTT topic `v3/live/m1/<id>`, where <id> is the `tracker.id` the SportScore match detail carries
// (same 15-char code, e.g. "y0or5ofw6p5vmwz"). The payloads are protobuf (binary), not JSON. This file
// only decodes them; the MQTT connection lives in its own module. Nothing here reaches the network.
//
// The point of decoding here (instead of the provider's iframe): we read the ball position, the score
// and the live stats as plain data and draw our own 3D mini-court in the BET62 look.
//
// Message shapes seen in the live feed (top-level field 1 = message type):
//   type 1  → ball position + score: { score:"sets-games-points-?", ball:{x,y} } (x,y are 0..1)
//   type 2  → live statistics: [{ id, home, away }]
//   type 4  → line-ups: [{ name, ... }]
//   types 6 / 7 → the point's animation frames (a path of positions) — kept raw for now.

/** A minimal protobuf reader: enough for these messages. Returns a map field→array of values. */
function readVarint(b, p) {
  let r = 0n, s = 0n;
  for (;;) { const x = b[p++]; r |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) break; s += 7n; if (s > 70n) throw new Error('varint'); }
  return [r, p];
}
function parse(b, p = 0, end = b.length) {
  const out = {};
  while (p < end) {
    let key; [key, p] = readVarint(b, p);
    const field = Number(key >> 3n), wt = Number(key & 7n);
    let v;
    if (wt === 0) { [v, p] = readVarint(b, p); v = Number(v); }
    else if (wt === 2) {
      let len; [len, p] = readVarint(b, p); len = Number(len);
      const slice = b.subarray(p, p + len); p += len;
      const txt = slice.toString('utf8');
      v = /^[\x20-\x7e]+$/.test(txt) && txt.length ? txt : { sub: safeParse(slice) };
    } else if (wt === 5) { v = b.readFloatLE(p); p += 4; }
    else if (wt === 1) { v = b.readDoubleLE(p); p += 8; }
    else throw new Error(`wire ${wt}`);
    (out[field] ||= []).push(v);
  }
  return out;
}
const safeParse = (b) => { try { return parse(b); } catch { return null; } };

const one = (o, f) => (o && o[f] ? o[f][0] : undefined);
const sub = (o, f) => { const v = one(o, f); return v && v.sub ? v.sub : null; };

/** "0.41,0.34" → { x:0.41, y:0.34 } (0..1 across the court), or null. */
function parsePos(str) {
  if (typeof str !== 'string') return null;
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(str.trim());
  if (!m) return null;
  const x = Number(m[1]), y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * Decode one tracker payload. Returns { type, ... } — never throws:
 *   { type:'position', score, ball:{x,y}|null }
 *   { type:'stats', stats:[{id,home,away}] }
 *   { type:'lineups', players:[{name}] }
 *   { type:'other', kind, bytes }   (animation frames and anything new)
 *   { type:'invalid' }
 */
export function decodeTracker(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { type: 'invalid' };
  let top;
  try { top = parse(buffer); } catch { return { type: 'invalid' }; }
  const kind = one(top, 1);
  const body = sub(top, 2);
  if (!body) return { type: 'other', kind, bytes: buffer.length };

  if (kind === 1) {
    // body: {1:1, 2:<ms>, 3:{1:score, 2:{3:"x,y"}, ...}}
    const inner = sub(body, 3);
    const score = one(inner, 1);
    const ball = parsePos(one(sub(inner, 2), 3));
    return { type: 'position', score: typeof score === 'string' ? score : null, ball };
  }
  if (kind === 2) {
    // body.1 = repeated {1:id, 2:home, 3:away}
    const rows = (body[1] || []).map((e) => e && e.sub).filter(Boolean);
    const stats = rows.map((r) => ({ id: one(r, 1) ?? null, home: one(r, 2) ?? 0, away: one(r, 3) ?? 0 }))
      .filter((s) => s.id !== null);
    return { type: 'stats', stats };
  }
  if (kind === 4) {
    const rows = (body[1] || []).map((e) => e && e.sub).filter(Boolean);
    const players = rows.map((r) => ({ name: one(r, 17) ?? null })).filter((p) => p.name);
    return { type: 'lineups', players };
  }
  return { type: 'other', kind, bytes: buffer.length };
}

/** The topic a match's live tracker publishes on, from the SportScore tracker id. null when unknown. */
export function trackerTopic(trackerId) {
  return /^[a-z0-9]{6,40}$/i.test(String(trackerId || '')) ? `v3/live/m1/${trackerId}` : null;
}
