import type { Context } from 'hono';
import type { Env } from './env.ts';

/** Null once the body passes `max` bytes, counted as read because Content-Length can lie or be missing. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** IPv6 visitors usually hold a whole /64, so it is keyed by prefix to stop address rotation. */
export function rateLimitKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const network = expandIpv6(ip).slice(0, 4).map(withoutLeadingZeros);
  return `${network.join(':')}::/64`;
}

function expandIpv6(ip: string): string[] {
  const lower = ip.toLowerCase();
  if (!lower.includes('::')) return lower.split(':');
  const [head = '', tail = ''] = lower.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = Math.max(0, 8 - left.length - right.length);
  return [...left, ...Array<string>(missing).fill('0'), ...right];
}

const withoutLeadingZeros = (group: string) => group.replace(/^0+(?=.)/, '');

export function visitorKey(c: Context<{ Bindings: Env }>): string {
  return rateLimitKey(c.req.header('cf-connecting-ip'));
}

export const RETRY_AFTER_SECONDS = '60';
