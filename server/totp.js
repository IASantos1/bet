// Two-step sign-in for the administrators: the six-digit code of an authenticator app (Google
// Authenticator, Microsoft Authenticator, 1Password…), RFC 6238 (SHA-1, 30 s steps), the secret in
// base32 as those apps take it. A code is accepted one step either side (a phone's clock a little off).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text) {
  const clean = String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new secret (160 bits, base32). */
export const newSecret = () => base32(randomBytes(20));

/** The code for a time step. */
export function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Whether `code` is right now (one 30 s step either side). */
export function verifyCode(secret, code, now = Date.now()) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!secret || !/^\d{6}$/.test(c)) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => {
    const want = Buffer.from(codeAt(secret, step + d));
    return timingSafeEqual(want, Buffer.from(c));
  });
}

/** The address an authenticator app reads (typed in, or as a QR code). */
export const otpauthUrl = (secret, account, issuer = 'BET62') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
