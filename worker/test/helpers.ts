import { env as workerEnv } from 'cloudflare:test';
import { createApp } from '../src/app.ts';
import type { Env } from '../src/env.ts';

export const SITE = 'https://sollock.io';
export const WALLET = 'J25CTTarrkbvpzX2W8yhmq85ybb9XFY2Ki33D1bdHD1c';
export const CUSTODIAN = 'EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav';
export const STAKE = 'Stake11111111111111111111111111111111111111';

export interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

/** A stand-in for the internet: records every outbound call and answers with `respond`. */
export function fakeNetwork(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const call = { url: req.url, method: req.method, headers: req.headers, body: await req.text() };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function rpcResult(result: unknown, id: number | string = 1) {
  return Response.json({ jsonrpc: '2.0', id, result });
}

const allow: RateLimit = { limit: async () => ({ success: true }) };

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(workerEnv as unknown as Env),
    HELIUS_API_KEY: 'helius-test-key',
    ALCHEMY_API_KEY: 'alchemy-test-key',
    RPC_LIMITER: allow,
    LOOKUP_LIMITER: allow,
    ...overrides,
  };
}

export function makeApp(fetch: typeof globalThis.fetch, clock = { t: 1_793_491_200_000 }) {
  const app = createApp({ fetch, now: () => clock.t });
  return { app, clock };
}

export function rpcRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

export function call(method: string, params: unknown[] = [], id: number | string = 7) {
  return { jsonrpc: '2.0', id, method, params };
}
