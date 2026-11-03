import { Hono } from 'hono';
import { clusterOf, type Deps, type Env } from './env.ts';
import { mountPrice } from './price.ts';
import { mountRpc } from './rpc.ts';

export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();

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
  // Never logged: an error can carry request data.
  app.onError((_err, c) => c.json({ error: 'Something went wrong.' }, 500, { 'cache-control': 'no-store' }));
  return app;
}
