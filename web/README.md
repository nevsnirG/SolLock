# @sollock/web

The SolLock site: static Astro pages plus one React island, the lock builder (`src/islands/LockBuilder.tsx`). The Worker in `../worker` serves the built `dist/` and owns `/api`.

- `src/pages`: the lock builder, My locks, the FAQ, the custodian check, the guides under `/learn`, and the terms, privacy and affiliate pages. The legal texts are drafts for the lawyer. `robots.txt` and the sitemap are generated at build time.
- `src/content/learn`: the guides, one Markdown file per page, with the slug as the file name. `searchTitle` is the `<title>` for search engines; `title` is the heading on the page and follows the site's words (Solana for the coin, SOL only with an amount), which the browser tests enforce. A search result shows about 60 characters of a title and 160 of a description, so `searchTitle` and `description` stay within that, and the site name follows a title only when both fit (`src/lib/pageTitle.ts`). `section` puts the guide under one of the headings of the learn page (`src/lib/guideSections.ts`), and `scripts/og.mjs` draws each guide its own share image from its heading.
- `src/islands`: the builder form, the preview of what you sign, the safeguards, the wallet (ConnectorKit) and the success screen with the recovery note and receipt.
- `src/lib`: the builder's logic as plain functions, tested in `test/`. `lockFlow.ts` is the signing flow: prepare and test-run, the wallet signs and sends, confirm, read back. Its tests send every request through the Worker's own allow-list. The preview runs the real `planLock` from `@sollock/core` and decodes it back, so it shows exactly what the signing flow will build. Before a wallet is connected, a stand-in address is used and shown as "your wallet".
- `src/config.ts`: the cluster (`PUBLIC_SOLANA_CLUSTER`, devnet by default), the fee address per cluster, and the "Need SOL first?" exchange links. A mainnet build refuses to start until the mainnet fee address is set.

Fonts are self-hosted, nothing loads from third parties, and every page carries a strict Content Security Policy (a `<meta>` tag with script hashes, from `astro.config.mjs`) plus the headers in `public/_headers`.

## Run it

Production-like, on one port (the site and the API through the Worker, at http://localhost:8791):

```bash
pnpm --filter @sollock/web build
pnpm --filter @sollock/worker dev
```

With hot reload while editing (http://localhost:4331; another local site uses 4321). Keep the Worker running for `/api`:

```bash
pnpm --filter @sollock/web dev
```

## Try the signing flow on devnet without a browser

With the Worker running, this runs `src/lib/lockFlow.ts` against devnet through `/api/rpc`, with packages/core's throwaway devnet wallet standing in for a real one:

```bash
pnpm --filter @sollock/web devnet:flow
```

Add `-- --amount 0.02 --days 2` for a paid lock, and `--gift <address>` for a gift.

## Test

```bash
pnpm --filter @sollock/web test
pnpm --filter @sollock/web typecheck
```
