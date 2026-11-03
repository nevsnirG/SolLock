export type Cluster = 'devnet' | 'mainnet';

/** CoinGecko refuses requests without a descriptive User-Agent. */
export const USER_AGENT = 'SolLock/0.1 (+https://sollock.io)';

export interface Env {
  CLUSTER: string;
  /** Comma-separated. */
  ALLOWED_ORIGINS: string;
  HELIUS_API_KEY?: string;
  ALCHEMY_API_KEY?: string;
  /** A CoinGecko Demo key. */
  COINGECKO_API_KEY?: string;
  RPC_LIMITER: RateLimit;
  LOOKUP_LIMITER: RateLimit;
}

export interface Deps {
  fetch: typeof fetch;
  /** Milliseconds since the epoch. */
  now: () => number;
}

export function clusterOf(env: Env): Cluster {
  if (env.CLUSTER === 'devnet' || env.CLUSTER === 'mainnet') return env.CLUSTER;
  throw new Error('CLUSTER must be "devnet" or "mainnet"');
}
