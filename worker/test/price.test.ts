import { beforeEach, describe, expect, it } from 'vitest';
import { EDGE_CACHE_KEY, PRICE_SOURCE } from '../src/price.ts';
import { fakeNetwork, makeApp, testEnv } from './helpers.ts';

function coinGecko(eur = 152.31, usd = 165.02) {
  return Response.json({ solana: { eur, usd, gbp: 131.5, jpy: 25_000, last_updated_at: 1_793_491_100 } });
}

beforeEach(async () => {
  await caches.default.delete(EDGE_CACHE_KEY);
});

describe('/api/price', () => {
  it("gives today's price in the asked currency, with source and time", async () => {
    const net = fakeNetwork(() => coinGecko());
    const { app } = makeApp(net.fetch);
    const res = await app.request('/api/price?currency=eur', {}, testEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currency: 'EUR', perSol: 152.31, source: PRICE_SOURCE, asOf: 1_793_491_100 });
    expect(res.headers.get('cache-control')).toBe('public, max-age=30');
  });

  it('asks CoinGecko for every currency at once, with the demo key when there is one', async () => {
    const net = fakeNetwork(() => coinGecko());
    const { app } = makeApp(net.fetch);
    await app.request('/api/price?currency=USD', {}, testEnv({ COINGECKO_API_KEY: 'cg-key' }));
    const url = new URL(net.calls[0]?.url ?? '');
    expect(url.host).toBe('api.coingecko.com');
    expect(url.searchParams.get('ids')).toBe('solana');
    expect(url.searchParams.get('vs_currencies')?.split(',')).toContain('eur');
    expect(url.searchParams.get('vs_currencies')?.split(',')).toContain('usd');
    expect(net.calls[0]?.headers.get('x-cg-demo-api-key')).toBe('cg-key');
    // CoinGecko answers 403 without a descriptive User-Agent.
    expect(net.calls[0]?.headers.get('user-agent')).toMatch(/^SolLock\//);
  });

  it('calls CoinGecko at most once a minute, whatever the currency', async () => {
    const net = fakeNetwork(() => coinGecko());
    const { app, clock } = makeApp(net.fetch);
    for (const c of ['EUR', 'USD', 'GBP', 'EUR']) await app.request(`/api/price?currency=${c}`, {}, testEnv());
    expect(net.calls).toHaveLength(1);
    clock.t += 60_000;
    await caches.default.delete(EDGE_CACHE_KEY);
    await app.request('/api/price?currency=EUR', {}, testEnv());
    expect(net.calls).toHaveLength(2);
  });

  it('shares the price between isolates through the edge cache', async () => {
    const first = fakeNetwork(() => coinGecko(100));
    await makeApp(first.fetch).app.request('/api/price?currency=EUR', {}, testEnv());
    const second = fakeNetwork(() => coinGecko(999));
    const res = await makeApp(second.fetch).app.request('/api/price?currency=EUR', {}, testEnv());
    expect(((await res.json()) as { perSol: number }).perSol).toBe(100);
    expect(second.calls).toHaveLength(0);
  });

  it('refuses unknown currencies', async () => {
    const net = fakeNetwork(() => coinGecko());
    const { app } = makeApp(net.fetch);
    for (const q of ['?currency=XYZ', '?currency=', '']) {
      expect((await app.request(`/api/price${q}`, {}, testEnv())).status).toBe(400);
    }
    expect(net.calls).toHaveLength(0);
  });

  it('answers 503 when there is no price, so the site shows SOL only', async () => {
    for (const respond of [() => new Response('', { status: 429 }), () => Response.json({}), () => { throw new Error('down'); }]) {
      await caches.default.delete(EDGE_CACHE_KEY);
      const { app } = makeApp(fakeNetwork(respond).fetch);
      const res = await app.request('/api/price?currency=EUR', {}, testEnv());
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: string }).error).toMatch(/SOL only/);
    }
  });

  it('answers 503 for a currency CoinGecko left out', async () => {
    const { app } = makeApp(fakeNetwork(() => coinGecko()).fetch);
    expect((await app.request('/api/price?currency=CHF', {}, testEnv())).status).toBe(503);
  });

  it('is rate limited per visitor', async () => {
    const { app } = makeApp(fakeNetwork(() => coinGecko()).fetch);
    const res = await app.request('/api/price?currency=EUR', {}, testEnv({ RPC_LIMITER: { limit: async () => ({ success: false }) } }));
    expect(res.status).toBe(429);
  });
});
