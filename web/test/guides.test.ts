import { readdirSync, readFileSync } from 'node:fs';
import { CUSTODIAN_ADDRESS } from '@sollock/core';
import { describe, expect, it } from 'vitest';

const dir = new URL('../src/content/learn/', import.meta.url);
const guides = readdirSync(dir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => {
    const text = readFileSync(new URL(file, dir), 'utf8');
    const [, frontmatter = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
    return { file, frontmatter, body };
  });

/** The running text of a guide: without its headings, and without the links that quote another guide's heading. */
const runningText = (body: string) =>
  body
    .split('\n')
    .filter((line) => !/^#{1,6} /.test(line))
    .join('\n')
    .replace(/\[[^\]]*\]\(\/learn\/[^)]*\)/g, '');

describe('the guides', () => {
  it('are the twenty-two pages the site links to', () => {
    expect(guides.map((g) => g.file).sort()).toEqual([
      'buy-your-first-solana-and-keep-it.md',
      'can-you-unlock-solana-early.md',
      'crypto-christmas-gift.md',
      'crypto-time-capsule.md',
      'give-solana-as-a-gift.md',
      'hold-solana-long-term.md',
      'how-to-lock-solana.md',
      'is-it-safe-to-connect-a-crypto-wallet.md',
      'lock-sol-vs-token-locks.md',
      'solana-cli-stake-account-lockup.md',
      'solana-gift-for-your-child.md',
      'solana-locking-vs-staking.md',
      'solana-rent-deposit.md',
      'solana-stake-account-lockup.md',
      'solana-time-lock-risks.md',
      'solana-unstaking-period.md',
      'stop-selling-crypto-in-a-dip.md',
      'time-lock-crypto-wallet.md',
      'verify-solana-lock-on-chain.md',
      'what-does-hodl-mean.md',
      'what-is-solana.md',
      'withdraw-solana-stake-account-after-lockup.md',
    ]);
  });

  it.each(guides)('$file has a heading, a title for search results and a section', ({ frontmatter }) => {
    expect(frontmatter).toMatch(/^title: ".+"$/m);
    expect(frontmatter).toMatch(/^searchTitle: ".+"$/m);
    expect(frontmatter).toMatch(/^section: (start|lock|gifts|details)$/m);
  });

  it.each(guides)('$file calls the coin Solana in its running text, keeping SOL for amounts and headings', ({ body }) => {
    const unitless = runningText(body).replace(/\d\s?SOL\b/g, '').replace(/\bin SOL\b/g, '');
    expect(unitless.split('\n').filter((line) => /\bSOL\b/.test(line))).toEqual([]);
  });

  it('allows SOL in a heading and in a link that quotes one, and nowhere else', () => {
    const body = ['## Is staked SOL locked?', 'See [Is staked SOL locked?](/learn/solana-unstaking-period) for 2 SOL.', 'Lock your SOL today.'].join('\n');
    const unitless = runningText(body).replace(/\d\s?SOL\b/g, '');
    expect(unitless.split('\n').filter((line) => /\bSOL\b/.test(line))).toEqual(['Lock your SOL today.']);
  });

  it.each(guides)('$file never calls a lock savings or a vault, predicts prices, or slips into AI phrasing', ({ body }) => {
    expect(body).not.toMatch(/\bsavings?\b|\bsparen\b|\bvault\b/i);
    expect(body).not.toMatch(/\bwill be worth\b|\b(price target|projected|expected return|apy|apr)\b/i);
    expect(body).not.toMatch(/\bhonest\b|small print|\bwe never\b|\bwe don't\b|\bwe do not\b|\bwe keep no\b|not you, not us/i);
    expect(body).not.toMatch(/—/);
  });

  it.each(guides)("$file links to the product or the custodian page, and to Solana's own docs", ({ body }) => {
    expect(body).toMatch(/\]\(\/(lock|custodian|my-locks|faq)/);
    expect(body).toMatch(/\]\(https:\/\/solana\.com\/docs\//);
  });

  it.each(guides)('$file links only to guides that exist', ({ body, frontmatter }) => {
    const slugs = new Set(guides.map((g) => g.file.slice(0, -3)));
    const linked = [...body.matchAll(/\]\(\/learn\/([a-z0-9-]+)\)/g)].map((match) => match[1]!);
    const related = (frontmatter.match(/^related: \[(.*)\]$/m)?.[1] ?? '').split(',').map((slug) => slug.trim());
    expect([...linked, ...related].filter((slug) => !slugs.has(slug))).toEqual([]);
  });

  it('name the real custodian in the checking guide and in the command-line guide, and the Stake Program in the first', () => {
    const body = (file: string) => guides.find((g) => g.file === file)!.body;
    expect(body('verify-solana-lock-on-chain.md')).toContain(CUSTODIAN_ADDRESS);
    expect(body('verify-solana-lock-on-chain.md')).toContain('Stake11111111111111111111111111111111111111');
    expect(body('solana-cli-stake-account-lockup.md')).toContain(`--custodian ${CUSTODIAN_ADDRESS}`);
    expect(body('solana-cli-stake-account-lockup.md')).toContain(`Lockup Custodian: ${CUSTODIAN_ADDRESS}`);
  });
});
