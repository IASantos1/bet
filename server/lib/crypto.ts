import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

export function hashPassword(password: string, saltHex?: string): { hashHex: string; saltHex: string } {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return { hashHex: key.toString('hex'), saltHex: salt.toString('hex') };
}

export function verifyPassword(password: string, hashHex: string, saltHex: string): boolean {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const key = scryptSync(password, salt, 64);
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length !== key.length) return false;
    return timingSafeEqual(expected, key);
  } catch {
    return false;
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

