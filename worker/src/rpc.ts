import type { Context, Hono } from 'hono';
import { clusterOf, type Deps, type Env } from './env.ts';
import { INTERNAL_ERROR, INVALID_REQUEST, type JsonRpcId, parseRequest, RpcRefusal } from './rules.ts';
import { readCapped, RETRY_AFTER_SECONDS, visitorKey } from './limits.ts';
import { TtlCache } from './ttlCache.ts';
import { forward, upstreamsFor } from './upstream.ts';

/** Fits a full getMultipleAccounts or a transaction with room to spare. */
const MAX_BODY_BYTES = 16 * 1024;

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** Browsers always send Origin on a POST, so a missing one means a script, not the site. */
function originAllowed(origin: string | undefined, env: Env): boolean {
  if (!origin) return false;
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  return clusterOf(env) === 'devnet' && LOCALHOST.test(origin);
}

/** From the JSON-RPC range for implementation-defined server errors, -32000 to -32099. */
const ORIGIN_REFUSED = -32000;
const RATE_LIMITED = -32029;

function reply(c: Context<{ Bindings: Env }>, id: JsonRpcId, body: { result?: unknown; error?: unknown }, status = 200) {
  return c.json({ jsonrpc: '2.0', id, ...body }, status as 200, {
    'cache-control': 'no-store',
    'x-sollock-cluster': clusterOf(c.env),
  });
}

function refusal(c: Context<{ Bindings: Env }>, code: number, message: string, status = 200, id: JsonRpcId = null) {
  return reply(c, id, { error: { code, message } }, status);
}

function tooMany(c: Context<{ Bindings: Env }>, id: JsonRpcId = null) {
  const response = refusal(c, RATE_LIMITED, 'Too many requests. Wait a minute and try again.', 429, id);
  response.headers.set('retry-after', RETRY_AFTER_SECONDS);
  return response;
}

export function mountRpc(app: Hono<{ Bindings: Env }>, deps: Deps): void {
  const cache = new TtlCache<unknown>(deps.now);

  app.post('/api/rpc', async (c) => {
    if (!originAllowed(c.req.header('origin'), c.env)) {
      return refusal(c, ORIGIN_REFUSED, 'Requests are only accepted from the SolLock site.', 403);
    }

    // Counted before the body is read, so an oversized body still costs the sender.
    const key = visitorKey(c);
    if (!(await c.env.RPC_LIMITER.limit({ key })).success) return tooMany(c);

    const declared = Number(c.req.header('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return refusal(c, INVALID_REQUEST, 'The request is too large.', 413);
    const text = await readCapped(c.req.raw.body, MAX_BODY_BYTES);
    if (text === null) return refusal(c, INVALID_REQUEST, 'The request is too large.', 413);

    let parsed: ReturnType<typeof parseRequest>;
    try {
      parsed = parseRequest(text);
    } catch (e) {
      if (e instanceof RpcRefusal) return refusal(c, e.code, e.message, 200, e.id);
      throw e;
    }
    const { request, rule } = parsed;

    if (rule.lookup && !(await c.env.LOOKUP_LIMITER.limit({ key })).success) return tooMany(c, request.id);

    const cacheKey = rule.cacheMs ? `${request.method}:${JSON.stringify(request.params)}` : undefined;
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit !== undefined) return reply(c, request.id, { result: hit });
    }

    // Rebuilt from the checked fields, so nothing unchecked from the visitor goes upstream.
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: request.method, params: request.params });
    const upstreams = upstreamsFor(c.env);
    if (upstreams.length === 0) return refusal(c, INTERNAL_ERROR, 'No RPC provider is configured.', 503, request.id);
    const result = await forward(upstreams, body, deps);
    if (!result.ok) {
      if (result.tooLarge) return refusal(c, INTERNAL_ERROR, "The network's answer is too large for this proxy.", 502, request.id);
      return refusal(c, INTERNAL_ERROR, 'The Solana network could not be reached. Try again shortly.', 502, request.id);
    }

    if (cacheKey && rule.cacheMs && result.envelope.error === undefined && 'result' in result.envelope) {
      cache.set(cacheKey, result.envelope.result, rule.cacheMs);
    }
    return reply(c, request.id, result.envelope);
  });
}
