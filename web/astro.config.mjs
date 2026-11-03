import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.PUBLIC_SITE || 'https://sollock.io',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [react()],
  devToolbar: { enabled: false },
  // Shiki's inline styles would clash with the CSP.
  markdown: { syntaxHighlight: false },
  server: { host: '127.0.0.1', port: 4331 },
  // frame-ancestors is ignored in a <meta> CSP, so it is sent as a response header instead.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // Mobile Wallet Adapter on Android talks to the wallet app over ws://localhost.
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
