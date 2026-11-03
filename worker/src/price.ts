import { CURRENCIES, type Currency, isCurrency } from '@sollock/core/money';
import type { Hono } from 'hono';
import { type Deps, type Env, USER_AGENT } from './env.ts';
import { RETRY_AFTER_SECONDS, visitorKey } from './limits.ts';
import { TtlCache } from './ttlCache.ts';

export const PRICE_SOURCE = 'CoinGecko';
const PRICE_TTL_MS = 60_000;
const QUOTES_KEY = 'solana';
const PRICE_TIMEOUT_MS = 5_000;
export const EDGE_CACHE_KEY = 'https://price.sollock.internal/solana';

interface Quotes {
  prices: Partial<Record<Currency, number>>;
  /** Unix seconds. */
  asOf: number;
}

function coinGeckoUrl(): string {
  const vs = CURRENCIES.map((currency) => currency.toLowerCase()).join(',');
  return `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=${vs}&include_last_updated_at=true`;
}

function parseQuotes(json: unknown): Quotes | null {
  if (typeof json !== 'object' || json === null) return null;
  const sol = (json as { solana?: Record<string, unknown> }).solana;
  if (!sol || typeof sol.last_updated_at !== 'number') return null;
  const prices: Partial<Record<Currency, number>> = {};
  for (const currency of CURRENCIES) {
    const perSol = sol[currency.toLowerCase()];
    if (typeof perSol === 'number' && Number.isFinite(perSol) && perSol > 0) prices[currency] = perSol;
  }
  return Object.keys(prices).length > 0 ? { prices, asOf: sol.last_updated_at } : null;
}

async function fetchQuotes(env: Env, deps: Deps): Promise<Quotes | null> {
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': USER_AGENT };
  if (env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
  try {
    const res = await deps.fetch(coinGeckoUrl(), { headers, signal: AbortSignal.timeout(PRICE_TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseQuotes(await res.json());
  } catch {
    return null;
  }
}

export function mountPrice(app: Hono<{ Bindings: Env }>, deps: Deps): void {
  const memory = new TtlCache<Quotes>(deps.now, 1);

  async function quotes(env: Env): Promise<Quotes | null> {
    const remembered = memory.get(QUOTES_KEY) ?? (await fromEdgeCache());
    if (remembered) return remembered;
    const fresh = await fetchQuotes(env, deps);
    if (!fresh) return null;
    memory.set(QUOTES_KEY, fresh, PRICE_TTL_MS);
    await toEdgeCache(fresh);
    return fresh;
  }

  // Shared by every isolate in a data centre. The Cache API does nothing on workers.dev.
  async function fromEdgeCache(): Promise<Quotes | null> {
    const cached = await caches.default.match(EDGE_CACHE_KEY);
    if (!cached) return null;
    const quotes = isQuotes(await cached.json().catch(() => null));
    if (quotes) memory.set(QUOTES_KEY, quotes, PRICE_TTL_MS);
    return quotes;
  }

  async function toEdgeCache(quotes: Quotes): Promise<void> {
    const headers = { 'content-type': 'application/json', 'cache-control': `max-age=${PRICE_TTL_MS / 1000}` };
    await caches.default.put(EDGE_CACHE_KEY, new Response(JSON.stringify(quotes), { headers })).catch(() => {});
  }

  app.get('/api/price', async (c) => {
    const currency = (c.req.query('currency') ?? '').toUpperCase();
    if (!isCurrency(currency)) return c.json({ error: 'Unknown currency.' }, 400);

    const { success } = await c.env.RPC_LIMITER.limit({ key: visitorKey(c) });
    if (!success) return c.json({ error: 'Too many requests. Wait a minute and try again.' }, 429, { 'retry-after': RETRY_AFTER_SECONDS });

    const today = await quotes(c.env);
    const perSol = today?.prices[currency];
    if (!today || perSol === undefined) {
      return c.json({ error: 'No price available right now. Amounts are shown in SOL only.' }, 503, { 'cache-control': 'no-store' });
    }
    return c.json({ currency, perSol, source: PRICE_SOURCE, asOf: today.asOf }, 200, { 'cache-control': 'public, max-age=30' });
  });
}

function isQuotes(value: unknown): Quotes | null {
  const { prices, asOf } = (value ?? {}) as Partial<Quotes>;
  return typeof asOf === 'number' && typeof prices === 'object' && prices !== null ? { prices, asOf } : null;
}
