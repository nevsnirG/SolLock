import { type Cluster, clusterOf, type Deps, type Env, USER_AGENT } from './env.ts';
import { readCapped } from './limits.ts';

export interface Upstream {
  name: 'helius' | 'alchemy';
  url: string;
}

const UPSTREAM_TIMEOUT_MS = 8_000;

/** The largest answer we pass on. A wallet's 100 seed accounts or its gifts received are far smaller. */
export const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;

/** HTTP statuses that mean "try the next provider": refused, rate limited, or broken. */
function providerTrouble(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

/**
 * JSON-RPC errors that mean "this provider is struggling or refuses us", not "your request is
 * wrong": unauthorised, blocked, rate limited, node behind, or the provider's own internal error.
 */
const PROVIDER_TROUBLE = new Set([401, 403, 429, -32005, -32429, -32603]);

/**
 * Providers in order of preference: Helius, then Alchemy. The public Solana endpoints are no
 * fallback: they block traffic from Cloudflare Workers ("Your IP or provider is blocked").
 */
export function upstreamsFor(env: Env): Upstream[] {
  const cluster: Cluster = clusterOf(env);
  const list: Upstream[] = [];
  if (env.HELIUS_API_KEY) {
    list.push({ name: 'helius', url: `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(env.HELIUS_API_KEY)}` });
  }
  if (env.ALCHEMY_API_KEY) {
    list.push({ name: 'alchemy', url: `https://solana-${cluster}.g.alchemy.com/v2/${encodeURIComponent(env.ALCHEMY_API_KEY)}` });
  }
  return list;
}

export type ForwardResult =
  | { ok: true; envelope: { result?: unknown; error?: unknown } }
  | { ok: false; /** The answer was over MAX_UPSTREAM_BYTES; another provider would send the same. */ tooLarge?: boolean };

function isEnvelope(v: unknown): v is { result?: unknown; error?: { code?: unknown } } {
  return typeof v === 'object' && v !== null && ('result' in v || 'error' in v);
}

/**
 * Send one JSON-RPC body to the first provider that answers properly. Only the body goes out: no
 * headers from the visitor, so providers never see their IP address or cookies.
 */
export async function forward(upstreams: readonly Upstream[], body: string, deps: Deps): Promise<ForwardResult> {
  for (const upstream of upstreams) {
    let response: Response;
    try {
      response = await deps.fetch(upstream.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT },
        body,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    if (providerTrouble(response.status)) continue;
    // A huge answer (100 large accounts, say) would exhaust the Worker's memory: refuse it instead.
    const text = await readCapped(response.body, MAX_UPSTREAM_BYTES).catch(() => undefined);
    if (text === null) return { ok: false, tooLarge: true };
    if (text === undefined) continue;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }
    if (!isEnvelope(json)) continue;
    const code = json.error?.code;
    if (typeof code === 'number' && PROVIDER_TROUBLE.has(code)) continue;
    return { ok: true, envelope: { ...('result' in json ? { result: json.result } : {}), ...('error' in json ? { error: json.error } : {}) } };
  }
  return { ok: false };
}
