# @sollock/worker

The SolLock Worker on Cloudflare Workers. Cloudflare serves the static site (the built `../web/dist`) straight from the assets directory, with the 404 page for unknown paths; only `/api/*` runs this code:

- `POST /api/rpc`: a read-only Solana RPC proxy. An allow-list of methods with every parameter checked (`src/rules.ts`), Helius with Alchemy as fallback, short caches for shared data, per-IP rate limits, and only the SolLock site as caller. It never forwards `sendTransaction`: the user's wallet broadcasts.
- `GET /api/price?currency=EUR`: today's SOL price from CoinGecko, cached for a minute. Never a forecast.
- `GET /api/health`: `{ ok, cluster }`.

Nothing is logged or stored: Workers logs are off in `wrangler.jsonc`, the code never writes to the console, and the tests check both.

## Run it locally

1. Copy `.dev.vars.example` to `.dev.vars` and fill in at least one of the Helius or Alchemy keys.
2. Build the site, which the Worker serves from `../web/dist`:

   ```bash
   pnpm build
   ```

3. Start it, then open http://localhost:8791:

   ```bash
   pnpm --filter @sollock/worker dev
   ```

4. In another terminal, check the API end to end against devnet:

   ```bash
   pnpm --filter @sollock/worker smoke
   ```

## Test

```bash
pnpm --filter @sollock/worker test        # runs inside workerd, the production runtime
pnpm --filter @sollock/worker typecheck
```
