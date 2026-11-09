import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * When each page last changed, for the sitemap's lastmod: a guide from its frontmatter, the learn page from the newest
 * guide, and every other page from the last commit to its file. A shallow clone has no such history, so those stay unmarked.
 */
function lastModified() {
  const dates = new Map();
  let newestGuide = '';
  for (const file of readdirSync(new URL('./src/content/learn/', import.meta.url))) {
    if (!file.endsWith('.md')) continue;
    const text = readFileSync(new URL(`./src/content/learn/${file}`, import.meta.url), 'utf8');
    const date = text.match(/^updated: (\S+)/m)?.[1] ?? text.match(/^published: (\S+)/m)?.[1];
    if (!date) continue;
    dates.set(`/learn/${file.slice(0, -3)}`, date);
    if (date > newestGuide) newestGuide = date;
  }
  if (newestGuide) dates.set('/learn', newestGuide);
  if (git('rev-parse', '--is-shallow-repository') === 'false') {
    for (const file of readdirSync(new URL('./src/pages/', import.meta.url))) {
      if (!file.endsWith('.astro')) continue;
      const path = file === 'index.astro' ? '/' : `/${file.slice(0, -6)}`;
      const date = git('log', '-1', '--format=%cI', '--', `src/pages/${file}`);
      if (date && !dates.has(path)) dates.set(path, date);
    }
  }
  return dates;
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const LASTMOD = lastModified();

export default defineConfig({
  site: process.env.PUBLIC_SITE || 'https://sollock.io',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    react(),
    sitemap({
      serialize(item) {
        const lastmod = LASTMOD.get(new URL(item.url).pathname.replace(/\/$/, '') || '/');
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  devToolbar: { enabled: false },
  // Shiki's inline styles would clash with the CSP.
  markdown: { syntaxHighlight: false },
  server: { host: '127.0.0.1', port: 4331 },
  // frame-ancestors is ignored in a <meta> CSP, so it is sent as a response header instead.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // On Android the wallet app answers over ws://localhost. Chrome asks the visitor's permission for that
        // the first time, and the question is raised by one fetch to http://localhost before the app is opened.
        "connect-src 'self' ws://localhost:* http://localhost",
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
