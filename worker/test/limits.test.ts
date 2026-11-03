import { describe, expect, it } from 'vitest';
import { rateLimitKey, readCapped } from '../src/limits.ts';

describe('rate-limit keys', () => {
  it('keep IPv4 addresses whole', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey(undefined)).toBe('unknown');
  });

  it('count a whole IPv6 /64 network as one visitor', () => {
    expect(rateLimitKey('2001:db8:abcd:12:1:2:3:4')).toBe('2001:db8:abcd:12::/64');
    expect(rateLimitKey('2001:db8:abcd:12:ffff::9')).toBe('2001:db8:abcd:12::/64');
    expect(rateLimitKey('2001:DB8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitKey('2001:0db8:0000:0012::1')).toBe('2001:db8:0:12::/64');
  });
});

describe('capped reads', () => {
  const stream = (n: number) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(n).fill(97));
        c.close();
      },
    });

  it('read a body within the cap, and stop at one over it', async () => {
    expect(await readCapped(stream(10), 10)).toBe('a'.repeat(10));
    expect(await readCapped(stream(11), 10)).toBeNull();
    expect(await readCapped(null, 10)).toBe('');
  });
});
