import { Hono } from 'hono';
import { clusterOf, type Deps, type Env } from './env.ts';
import { mountPrice } from './price.ts';
import { mountRpc } from './rpc.ts';

/**
 * The Worker's routes. Static pages never reach this code (Cloudflare serves them from the assets
 * directory); only /api/* does. Nothing here logs, stores or forwards visitor data.
 */
export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();

  // The pages get their security headers from web/public/_headers; API answers get them here.
  app.use('/api/*', async (c, next) => {
    await next();
    c.res.headers.set('x-content-type-options', 'nosniff');
    c.res.headers.set('referrer-policy', 'no-referrer');
    c.res.headers.set('x-frame-options', 'DENY');
    c.res.headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  });

  app.get('/api/health', (c) => c.json({ ok: true, cluster: clusterOf(c.env) }, 200, { 'cache-control': 'no-store' }));
  mountRpc(app, deps);
  mountPrice(app, deps);

  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  // Deliberately no logging: errors are answered, not recorded.
  app.onError((_err, c) => c.json({ error: 'Something went wrong.' }, 500, { 'cache-control': 'no-store' }));
  return app;
}
