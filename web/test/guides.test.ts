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

describe('the guides', () => {
  it('are the sixteen pages the site links to', () => {
    expect(guides.map((g) => g.file).sort()).toEqual([
      'buy-your-first-solana-and-keep-it.md',
      'can-you-unlock-solana-early.md',
      'crypto-time-capsule.md',
      'give-solana-as-a-gift.md',
      'hold-solana-long-term.md',
      'how-to-lock-solana.md',
      'solana-gift-for-your-child.md',
      'solana-locking-vs-staking.md',
      'solana-rent-deposit.md',
      'solana-stake-account-lockup.md',
      'solana-time-lock-risks.md',
      'stop-selling-crypto-in-a-dip.md',
      'time-lock-crypto-wallet.md',
      'verify-solana-lock-on-chain.md',
      'what-is-solana.md',
      'withdraw-solana-stake-account-after-lockup.md',
    ]);
  });

  it.each(guides)('$file keeps "(SOL)" out of the visible title', ({ frontmatter }) => {
    expect(frontmatter).toMatch(/^searchTitle: /m);
    expect(frontmatter.match(/^title: .*$/m)?.[0]).not.toMatch(/\bSOL\b/);
  });

  it.each(guides)('$file calls the coin Solana, keeping SOL for amounts', ({ body }) => {
    const unitless = body.replace(/\d\s?SOL\b/g, '').replace(/\bin SOL\b/g, '');
    expect(unitless.split('\n').filter((line) => /\bSOL\b/.test(line))).toEqual([]);
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

  it('name the real custodian and the Stake Program in the checking guide', () => {
    const { body } = guides.find((g) => g.file === 'verify-solana-lock-on-chain.md')!;
    expect(body).toContain(CUSTODIAN_ADDRESS);
    expect(body).toContain('Stake11111111111111111111111111111111111111');
  });
});
