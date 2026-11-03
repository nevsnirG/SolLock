export type Cluster = 'devnet' | 'mainnet';

/** Sent on every outbound call. CoinGecko refuses requests without a descriptive one. */
export const USER_AGENT = 'SolLock/0.1 (+https://sollock.io)';

/** Bindings and settings from wrangler.jsonc, plus the secrets. */
export interface Env {
  CLUSTER: string;
  /** Comma-separated origins allowed to call /api/rpc. */
  ALLOWED_ORIGINS: string;
  HELIUS_API_KEY?: string;
  ALCHEMY_API_KEY?: string;
  /** CoinGecko demo key. Without one we use the shared public tier, which rate-limits hard. */
  COINGECKO_API_KEY?: string;
  RPC_LIMITER: RateLimit;
  LOOKUP_LIMITER: RateLimit;
}

/** Things the app gets from outside, so tests can replace them. */
export interface Deps {
  /** Outbound fetch to RPC providers and the price API. */
  fetch: typeof fetch;
  /** Milliseconds since the epoch. */
  now: () => number;
}

export function clusterOf(env: Env): Cluster {
  if (env.CLUSTER === 'devnet' || env.CLUSTER === 'mainnet') return env.CLUSTER;
  throw new Error('CLUSTER must be "devnet" or "mainnet"');
}
