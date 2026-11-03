import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

// Fully static. The Hono Worker serves dist/ and owns everything under /api.
// In `astro dev` (port 4331; another local site has 4321), /api goes to `wrangler dev` on 8791.
export default defineConfig({
  // devnet.sollock.io for staging, sollock.io in production (set by the deploy workflow).
  site: process.env.PUBLIC_SITE || 'https://sollock.io',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [react()],
  devToolbar: { enabled: false },
  // No Markdown code blocks here, and Shiki's inline styles would clash with the CSP below.
  markdown: { syntaxHighlight: false },
  server: { host: '127.0.0.1', port: 4331 },
  // A strict Content Security Policy in a <meta> tag, with hashes for Astro's own scripts and styles.
  // frame-ancestors only works as a header: see public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // ws://localhost is Mobile Wallet Adapter: on Android it talks to the wallet app on the phone.
        "connect-src 'self' ws://localhost:*",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ],
    },
  },
  vite: {
    server: { proxy: { '/api': 'http://127.0.0.1:8791' } },
  },
});
