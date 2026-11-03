// After `astro build`: every page must carry the CSP <meta>, every inline <script> and <style> must be
// allowed by its hash, and no element may carry a style attribute (the CSP allows none). Run in CI;
// exits 1 on a problem. Astro hashes what it bundles, but not everything one could add by hand.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const sha = (s) => `sha256-${createHash('sha256').update(s).digest('base64')}`;
const problems = [];
let pages = 0;

for (const file of readdirSync(dist, { recursive: true }).filter((f) => String(f).endsWith('.html'))) {
  pages++;
  const html = readFileSync(join(dist, String(file)), 'utf8');
  const csp = html.match(/http-equiv="content-security-policy" content="([^"]*)"/)?.[1];
  if (!csp) problems.push(`${file}: no CSP <meta>`);
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!csp?.includes(sha(m[1]))) problems.push(`${file}: an inline script without a hash`);
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    if (!csp?.includes(sha(m[1]))) problems.push(`${file}: an inline style without a hash`);
  }
  if (/\sstyle="/.test(html)) problems.push(`${file}: a style attribute`);
  if (/unsafe-inline|unsafe-eval/.test(csp ?? '')) problems.push(`${file}: the CSP allows unsafe-inline or unsafe-eval`);
}

if (pages === 0) problems.push('No pages in dist/. Build first.');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`CSP: ${pages} pages, every inline script and style is hashed.`);
