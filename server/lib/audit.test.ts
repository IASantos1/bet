import { describe, expect, it } from 'vitest';
import { requestIp } from './audit';

describe('requestIp', () => {
  it('prefers X-Forwarded-For over the socket address', () => {
    expect(requestIp({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } })).toBe(
      '203.0.113.5',
    );
  });

  it('falls back to the socket remote address', () => {
    expect(requestIp({ headers: {}, socket: { remoteAddress: '198.51.100.7' } })).toBe('198.51.100.7');
  });

  it('strips the IPv4-mapped IPv6 prefix', () => {
    expect(requestIp({ headers: {}, socket: { remoteAddress: '::ffff:198.51.100.7' } })).toBe('198.51.100.7');
  });

  it('returns an empty string when nothing is available', () => {
    expect(requestIp({ headers: {}, socket: {} })).toBe('');
  });
});
