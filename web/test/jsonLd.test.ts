import { describe, expect, it } from 'vitest';
import { jsonLd } from '../src/lib/jsonLd.ts';

const separators = String.fromCharCode(0x2028, 0x2029);
const backslash = String.fromCharCode(0x5c);

describe('JSON-LD in a script block', () => {
  it('never contains a "<", so no value can close the block', () => {
    const text = jsonLd({ headline: 'A </script><script>alert(1)</script> title', note: 'a & b > c', odd: separators });
    expect(text).not.toMatch(new RegExp(`[<>&${separators}]`));
    expect(text).toContain(`${backslash}u003c/script${backslash}u003e`);
  });

  it('reads back as the same value', () => {
    const value = { '@type': 'Article', headline: '</script>', items: [1, 'two', { three: '<3' }], odd: separators };
    expect(JSON.parse(jsonLd(value))).toEqual(value);
  });

  it('leaves ordinary JSON alone', () => {
    expect(jsonLd({ a: 1, b: 'plain text', c: ['x'] })).toBe('{"a":1,"b":"plain text","c":["x"]}');
  });
});
