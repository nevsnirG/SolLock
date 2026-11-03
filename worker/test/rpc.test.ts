import { env as workerEnv } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';
import { call, CUSTODIAN, fakeNetwork, makeApp, rpcRequest, rpcResult, SITE, STAKE, testEnv, WALLET } from './helpers.ts';

const HELIUS = 'https://devnet.helius-rpc.com/?api-key=helius-test-key';
const ALCHEMY = 'https://solana-devnet.g.alchemy.com/v2/alchemy-test-key';

async function post(app: ReturnType<typeof makeApp>['app'], body: unknown, env: Env = testEnv(), headers: Record<string, string> = {}) {
  const res = await app.request('/api/rpc', rpcRequest(body, headers), env);
  return { res, json: (await res.json()) as { id: unknown; result?: unknown; error?: { code: number; message: string } } };
}

afterEach(() => vi.restoreAllMocks());

describe('forwarding', () => {
  it('forwards an allowed call to Helius and answers with the caller id', async () => {
    const net = fakeNetwork(() => rpcResult({ epoch: 1197 }));
    const { app } = makeApp(net.fetch);
    const { res, json } = await post(app, call('getEpochInfo', [], 'my-id'));
    expect(res.status).toBe(200);
    expect(json).toEqual({ jsonrpc: '2.0', id: 'my-id', result: { epoch: 1197 } });
    expect(net.calls.map((c) => c.url)).toEqual([HELIUS]);
    expect(res.headers.get('x-sollock-cluster')).toBe('devnet');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('sends only the checked fields upstream, and none of the visitor headers', async () => {
    const net = fakeNetwork(() => rpcResult(null));
    const { app } = makeApp(net.fetch);
    await post(app, { ...call('getBalance', [WALLET]), extra: 'smuggled' }, testEnv(), { cookie: 'a=b', 'user-agent': 'Test/1' });
    const sent = net.calls[0];
    expect(JSON.parse(sent?.body ?? '')).toEqual({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [WALLET] });
    for (const h of ['cf-connecting-ip', 'cookie', 'origin', 'x-forwarded-for']) {
      expect(sent?.headers.get(h), h).toBeNull();
    }
    expect(sent?.headers.get('user-agent')).not.toBe('Test/1');
  });

  it('passes JSON-RPC errors from the network through, without trying another provider', async () => {
    const net = fakeNetwork(() => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid param' } }));
    const { app } = makeApp(net.fetch);
    const { json } = await post(app, call('getAccountInfo', [WALLET]));
    expect(json.error).toEqual({ code: -32602, message: 'Invalid param' });
    expect(net.calls).toHaveLength(1);
  });
});

describe('fallback', () => {
  const failures: [string, () => Response | never][] = [
    ['a 500', () => new Response('oops', { status: 500 })],
    ['a 429', () => new Response('slow down', { status: 429 })],
    ['a network error', () => { throw new TypeError('network down'); }],
    ['an answer that is not JSON', () => new Response('<html>')],
    ['a rate-limit JSON error', () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32429, message: 'rate limited' } })],
    // What api.devnet.solana.com answers a Worker.
    ['a "blocked" refusal', () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: 403, message: 'Your IP or provider is blocked' } }, { status: 403 })],
    ['a bad key', () => new Response('Unauthorized', { status: 401 })],
  ];
  for (const [what, fail] of failures) {
    it(`moves from Helius to Alchemy on ${what}`, async () => {
      const net = fakeNetwork((c) => (c.url === HELIUS ? fail() : rpcResult(42)));
      const { app } = makeApp(net.fetch);
      const { json } = await post(app, call('getBalance', [WALLET]));
      expect(json.result).toBe(42);
      expect(net.calls.map((c) => c.url)).toEqual([HELIUS, ALCHEMY]);
    });
  }

  it('never uses the public endpoints, which block Workers: no keys means 503, also on devnet', async () => {
    const net = fakeNetwork(() => rpcResult(1));
    const { app } = makeApp(net.fetch);
    const { res } = await post(app, call('getBalance', [WALLET]), testEnv({ HELIUS_API_KEY: undefined, ALCHEMY_API_KEY: undefined }));
    expect(res.status).toBe(503);
    expect(net.calls).toHaveLength(0);
  });

  it('identifies itself to providers with a User-Agent', async () => {
    const net = fakeNetwork(() => rpcResult(1));
    const { app } = makeApp(net.fetch);
    await post(app, call('getBalance', [WALLET]));
    expect(net.calls[0]?.headers.get('user-agent')).toMatch(/^SolLock\//);
  });

  it('answers 502 when nothing can be reached, without leaking provider URLs or keys', async () => {
    const net = fakeNetwork(() => new Response('', { status: 503 }));
    const { app } = makeApp(net.fetch);
    const { res, json } = await post(app, call('getBalance', [WALLET], 3));
    expect(res.status).toBe(502);
    expect(json.id).toBe(3);
    expect(JSON.stringify(json)).not.toMatch(/helius|alchemy|key/i);
  });

  it('uses mainnet providers on mainnet, and never the public mainnet endpoint', async () => {
    const net = fakeNetwork(() => new Response('', { status: 503 }));
    const { app } = makeApp(net.fetch);
    await post(app, call('getBalance', [WALLET]), testEnv({ CLUSTER: 'mainnet' }));
    expect(net.calls.map((c) => c.url)).toEqual([
      'https://mainnet.helius-rpc.com/?api-key=helius-test-key',
      'https://solana-mainnet.g.alchemy.com/v2/alchemy-test-key',
    ]);
    const bare = await post(app, call('getBalance', [WALLET]), testEnv({ CLUSTER: 'mainnet', HELIUS_API_KEY: undefined, ALCHEMY_API_KEY: undefined }));
    expect(bare.res.status).toBe(503);
  });
});

describe('caching', () => {
  it('serves getLatestBlockhash from memory for 2 seconds, with each caller id', async () => {
    const net = fakeNetwork(() => rpcResult({ value: { blockhash: 'abc', lastValidBlockHeight: 10 } }));
    const { app, clock } = makeApp(net.fetch);
    const params = [{ commitment: 'confirmed' }];
    const first = await post(app, call('getLatestBlockhash', params, 1));
    clock.t += 1_999;
    const second = await post(app, call('getLatestBlockhash', params, 2));
    expect(net.calls).toHaveLength(1);
    expect(first.json.id).toBe(1);
    expect(second.json).toEqual({ jsonrpc: '2.0', id: 2, result: first.json.result });
    clock.t += 1;
    await post(app, call('getLatestBlockhash', params, 3));
    expect(net.calls).toHaveLength(2);
  });

  it('keeps different parameters apart, and never caches per-wallet data or errors', async () => {
    const net = fakeNetwork((c) => (JSON.parse(c.body).method === 'getEpochInfo' ? Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'x' } }) : rpcResult(5)));
    const { app } = makeApp(net.fetch);
    await post(app, call('getLatestBlockhash', [{ commitment: 'confirmed' }]));
    await post(app, call('getLatestBlockhash', [{ commitment: 'finalized' }]));
    await post(app, call('getBalance', [WALLET]));
    await post(app, call('getBalance', [WALLET]));
    await post(app, call('getEpochInfo'));
    await post(app, call('getEpochInfo'));
    expect(net.calls).toHaveLength(6);
  });
});

describe('who may call', () => {
  const net = () => fakeNetwork(() => rpcResult(1));

  it('refuses requests without an Origin, or from other sites', async () => {
    const { app } = makeApp(net().fetch);
    for (const origin of ['', 'https://evil.example', 'https://sollock.io.evil.example', 'http://sollock.io']) {
      const res = await app.request('/api/rpc', { ...rpcRequest(call('getEpochInfo')), headers: { 'content-type': 'application/json', origin } }, testEnv());
      expect(res.status, origin || '(none)').toBe(403);
    }
  });

  it('allows the SolLock site, and localhost only on devnet', async () => {
    const { app } = makeApp(net().fetch);
    expect((await post(app, call('getEpochInfo'), testEnv(), { origin: 'https://www.sollock.io' })).res.status).toBe(200);
    expect((await post(app, call('getEpochInfo'), testEnv(), { origin: 'http://localhost:4321' })).res.status).toBe(200);
    expect((await post(app, call('getEpochInfo'), testEnv({ CLUSTER: 'mainnet' }), { origin: 'http://localhost:4321' })).res.status).toBe(403);
  });

  it('refuses bodies over 16 KB', async () => {
    const { app } = makeApp(net().fetch);
    const big = JSON.stringify({ ...call('getEpochInfo'), pad: 'x'.repeat(17_000) });
    expect((await app.request('/api/rpc', rpcRequest(big), testEnv())).status).toBe(413);
  });

  it('answers refusals as JSON-RPC errors, before any upstream call', async () => {
    const network = net();
    const { app } = makeApp(network.fetch);
    const { res, json } = await post(app, call('sendTransaction', ['AAAA'], 9));
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ id: 9, error: { code: -32601 } });
    expect(network.calls).toHaveLength(0);
  });
});

describe('rate limits', () => {
  it('answers 429 with Retry-After when the visitor is over the limit', async () => {
    const network = fakeNetwork(() => rpcResult(1));
    const { app } = makeApp(network.fetch);
    const deny: RateLimit = { limit: async () => ({ success: false }) };
    const { res, json } = await post(app, call('getEpochInfo', [], 4), testEnv({ RPC_LIMITER: deny }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    // Counted before the body is read, so the id is not known yet.
    expect(json.id).toBeNull();
    expect(network.calls).toHaveLength(0);
  });

  it('counts the limit before reading the body, so a huge body costs the sender', async () => {
    const network = fakeNetwork(() => rpcResult(1));
    const { app } = makeApp(network.fetch);
    let counted = 0;
    const deny: RateLimit = { limit: async () => ({ success: ++counted > 1 ? false : true }) };
    const env = testEnv({ RPC_LIMITER: deny });
    await post(app, call('getEpochInfo'), env);
    const { res } = await post(app, 'x'.repeat(100_000), env);
    expect(res.status).toBe(429);
  });

  it('caps a body that comes without a size, by counting its bytes', async () => {
    const network = fakeNetwork(() => rpcResult(1));
    const { app } = makeApp(network.fetch);
    const big = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 40; i++) controller.enqueue(new Uint8Array(1024).fill(32));
        controller.close();
      },
    });
    const res = await app.request(
      '/api/rpc',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE }, body: big, duplex: 'half' } as RequestInit,
      testEnv(),
    );
    expect(res.status).toBe(413);
    expect(network.calls).toHaveLength(0);
  });

  it('refuses an answer from the network that is too large to pass on', async () => {
    const network = fakeNetwork(() => new Response(`{"jsonrpc":"2.0","id":1,"result":"${'a'.repeat(3 * 1024 * 1024)}"}`));
    const { app } = makeApp(network.fetch);
    const { res, json } = await post(app, call('getAccountInfo', [WALLET, { encoding: 'base64' }]), testEnv());
    expect(res.status).toBe(502);
    expect(json.error?.message).toMatch(/too large/);
    expect(network.calls).toHaveLength(1);
  });

  it('puts security headers on every API answer', async () => {
    const network = fakeNetwork(() => rpcResult(1));
    const { app } = makeApp(network.fetch);
    const res = await app.request('/api/health', {}, testEnv());
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('keys the limit on the visitor IP', async () => {
    const keys: string[] = [];
    const spy: RateLimit = { limit: async ({ key }) => (keys.push(key), { success: true }) };
    const { app } = makeApp(fakeNetwork(() => rpcResult(1)).fetch);
    await post(app, call('getEpochInfo'), testEnv({ RPC_LIMITER: spy }), { 'cf-connecting-ip': '198.51.100.9' });
    expect(keys).toEqual(['198.51.100.9']);
  });

  it('stops the gift lookup after 10 a minute with the real limiter from wrangler.jsonc', async () => {
    const network = fakeNetwork(() => rpcResult([]));
    const { app } = makeApp(network.fetch);
    const env = testEnv({ LOOKUP_LIMITER: (workerEnv as unknown as Env).LOOKUP_LIMITER });
    const lookup = call('getProgramAccounts', [
      STAKE,
      { encoding: 'base64', filters: [{ dataSize: 200 }, { memcmp: { offset: 44, bytes: WALLET } }, { memcmp: { offset: 92, bytes: CUSTODIAN } }] },
    ]);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post(app, lookup, env, { 'cf-connecting-ip': '192.0.2.44' })).res.status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(network.calls).toHaveLength(10);
  });
});

describe('store nothing', () => {
  it('never writes to the console, whatever happens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) => vi.spyOn(console, m));
    let n = 0;
    const net = fakeNetwork(() => {
      n++;
      if (n % 3 === 0) throw new Error('boom');
      return n % 2 ? rpcResult(1) : new Response('', { status: 500 });
    });
    const { app } = makeApp(net.fetch);
    await post(app, call('getBalance', [WALLET]));
    await post(app, call('sendTransaction', []));
    await post(app, '{broken');
    await post(app, call('getAccountInfo', [WALLET]), testEnv({ CLUSTER: 'nonsense' }));
    await app.request('/api/rpc', { method: 'POST', body: '{}' }, testEnv());
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('hides internal errors behind a plain message', async () => {
    const { app } = makeApp(fakeNetwork(() => rpcResult(1)).fetch);
    const res = await app.request('/api/rpc', rpcRequest(call('getEpochInfo')), testEnv({ CLUSTER: 'nonsense' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong.' });
  });
});

describe('other routes', () => {
  it('reports health and the cluster', async () => {
    const { app } = makeApp(fakeNetwork(() => rpcResult(1)).fetch);
    const res = await app.request('/api/health', {}, testEnv());
    expect(await res.json()).toEqual({ ok: true, cluster: 'devnet' });
  });

  it('answers 404 for unknown API paths and GET on the RPC', async () => {
    const { app } = makeApp(fakeNetwork(() => rpcResult(1)).fetch);
    expect((await app.request('/api/nope', {}, testEnv())).status).toBe(404);
    expect((await app.request('/api/rpc', {}, testEnv())).status).toBe(404);
  });
});
