// Before a deploy: refuse while the configuration for the target is unfinished.
// Usage: node scripts/check-deploy-config.mjs staging|production
//
// Every target: env.<target> exists in worker/wrangler.jsonc, with no REPLACE placeholders, and its
// CLUSTER is the one the target must have (staging is devnet, production is mainnet).
// Production (mainnet) also needs everything only the owner can supply: the final legal texts (LEGAL_DRAFT = false, no [brackets] left) and the business details for the receipt.

import { readFileSync } from 'node:fs';

const target = process.argv[2];
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const problems = [];

/** JSONC to JSON: drops // and /* *\/ comments outside strings, and trailing commas. */
function stripJsonc(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j;
    } else if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && s[i + 1] === '*') {
      i = s.indexOf('*/', i + 2) + 1;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const expectedCluster = { staging: 'devnet', production: 'mainnet' }[target];
if (!expectedCluster) {
  console.error('Usage: node scripts/check-deploy-config.mjs staging|production');
  process.exit(1);
}

const wrangler = JSON.parse(stripJsonc(read('worker/wrangler.jsonc')));
const env = wrangler.env?.[target];
if (!env) problems.push(`worker/wrangler.jsonc has no env.${target}.`);
else {
  const text = JSON.stringify(env);
  if (text.includes('REPLACE')) problems.push(`env.${target} in worker/wrangler.jsonc still has a REPLACE placeholder.`);
  if (env.vars?.CLUSTER !== expectedCluster) problems.push(`env.${target} must run on ${expectedCluster}, not ${env.vars?.CLUSTER}.`);
  for (const key of ['observability', 'logpush', 'tail_consumers']) {
    if (key in env) problems.push(`env.${target} must not set ${key}: logging stays off everywhere.`);
  }
}

if (target === 'production') {
  const config = read('web/src/config.ts');
  if (/LEGAL_DRAFT = true/.test(config)) problems.push('web/src/config.ts: the legal texts are still marked as a draft (LEGAL_DRAFT).');
  const business = config.slice(config.indexOf('export const BUSINESS'));
  if (/'\[[^\]]+\]'/.test(business.slice(0, business.indexOf('as const')))) problems.push('web/src/config.ts: BUSINESS still has [placeholders].');
  for (const page of ['terms', 'privacy', 'affiliates']) {
    const found = read(`web/src/pages/${page}.astro`).match(/\[[A-Za-z][^\]]*\]/g);
    if (found) problems.push(`web/src/pages/${page}.astro still has ${found.length} [placeholder(s)], e.g. ${found[0]}.`);
  }
}

if (problems.length) {
  console.error(`Not deploying ${target}:\n  ${problems.join('\n  ')}\n(The top of .github/workflows/deploy.yml lists the values.)`);
  process.exit(1);
}
console.log(`${target}: the configuration is complete.`);
