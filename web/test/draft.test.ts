import { address } from '@solana/kit';
import { CUSTODIAN_ADDRESS, LAMPORTS_PER_SOL, testLockUnlockAt, utcMidnight } from '@sollock/core';
import { describe, expect, it } from 'vitest';
import { type DraftInput, draftLock, EMPTY_INPUT, inputFromQuery, readAloudHint } from '../src/lib/draft.ts';

const NOW = BigInt(Date.UTC(2026, 10, 1, 14, 30) / 1000);
const FEE = address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv');
const FRIEND = address('J25CTTarrkbvpzX2W8yhmq85ybb9XFY2Ki33D1bdHD1c');
const ctx = { now: NOW, feeAddress: FEE };
const base: DraftInput = { amountText: '2', wantsTestLock: false, choice: { kind: 'years', years: 1 }, gift: false, giftText: '' };

describe('draftLock', () => {
  it('works out an ordinary lock', () => {
    const d = draftLock(base, ctx);
    expect(d.problems).toEqual([]);
    expect(d.amount).toBe(2n * LAMPORTS_PER_SOL);
    expect(d.unlockAt).toBe(utcMidnight(2027, 11, 2));
    expect(d.fee).toBe(10_000_000n); // 0.25% of 2 SOL is 0.005, below the 0.01 minimum
    expect(d.testLock).toBe(false);
    expect(d.longLock).toBe(false);
  });

  it('takes 0.25% of a large lock, with no maximum, and shows the VAT inside it', () => {
    const d = draftLock({ ...base, amountText: '500' }, ctx);
    expect(d.fee).toBe(1_250_000_000n);
    expect(d.vat).toBe(216_942_149n); // 21/121 of 1.25 SOL, rounded
  });

  it('makes the test lock free, 0.01 SOL, about a day', () => {
    const d = draftLock({ ...base, wantsTestLock: true, amountText: 'ignored' }, ctx);
    expect(d.amount).toBe(LAMPORTS_PER_SOL / 100n);
    expect(d.unlockAt).toBe(testLockUnlockAt(NOW));
    expect(d.testLock).toBe(true);
    expect(d.fee).toBe(0n);
  });

  it('never makes 0.01 SOL for a year free', () => {
    const d = draftLock({ ...base, amountText: '0.01' }, ctx);
    expect(d.testLock).toBe(false);
    expect(d.fee).toBe(10_000_000n);
  });

  it('explains amount problems in plain words', () => {
    expect(draftLock({ ...base, amountText: '' }, ctx).amountProblem).toBe('Enter an amount.');
    expect(draftLock({ ...base, amountText: 'two' }, ctx).amountProblem).toBe('Enter a number, like 2 or 0.5.');
    expect(draftLock({ ...base, amountText: '0.0001' }, ctx).amountProblem).toBe('The smallest lock is 0.001 SOL.');
    expect(draftLock({ ...base, amountText: '1,5' }, ctx).amount).toBe(1_500_000_000n);
  });

  it('refuses dates in the past and past 2076', () => {
    expect(draftLock({ ...base, choice: { kind: 'custom', date: '2026-10-01' } }, ctx).unlockProblem).toBe('Pick a date in the future.');
    expect(draftLock({ ...base, choice: { kind: 'custom', date: '2077-01-01' } }, ctx).unlockProblem).toBe(
      'Pick a date on or before 31 December 2076.',
    );
    expect(draftLock({ ...base, choice: { kind: 'custom', date: '' } }, ctx).unlockProblem).toBe('Pick a date.');
  });

  it('warns about locks past 10 years', () => {
    expect(draftLock({ ...base, choice: { kind: 'newYear', year: 2052 } }, ctx).longLock).toBe(true);
    expect(draftLock({ ...base, choice: { kind: 'years', years: 10 } }, ctx).longLock).toBe(false);
  });

  it('checks gift addresses', () => {
    const gift = { ...base, gift: true };
    expect(draftLock({ ...gift, giftText: '' }, ctx).giftProblem).toBe("Enter the recipient's Solana address.");
    expect(draftLock({ ...gift, giftText: CUSTODIAN_ADDRESS }, ctx).giftProblem).toMatch(/nobody has a key/);
    expect(draftLock({ ...gift, giftText: FEE }, ctx).giftProblem).toMatch(/fee address/);
    expect(draftLock({ ...gift, giftText: FRIEND }, { ...ctx, wallet: FRIEND }).giftProblem).toMatch(/your own wallet/);
    const ok = draftLock({ ...gift, giftText: ` ${FRIEND} ` }, ctx);
    expect(ok.giftProblem).toBeNull();
    expect(ok.recipient).toBe(FRIEND);
  });

  it('lists every problem in form order', () => {
    const d = draftLock({ amountText: '', wantsTestLock: false, choice: { kind: 'custom', date: '' }, gift: true, giftText: 'x' }, ctx);
    expect(d.problems).toHaveLength(3);
    expect(d.problems[0]).toBe('Enter an amount.');
  });

  it('reads back the first and last four characters', () => {
    expect(readAloudHint(FRIEND)).toBe('Read it back with them: starts J25C, ends HD1c.');
  });
});

describe('inputFromQuery', () => {
  it("starts from the home page's start box", () => {
    expect(inputFromQuery('?amount=12.5&years=5')).toEqual({ ...EMPTY_INPUT, amountText: '12.5', choice: { kind: 'years', years: 5 } });
  });

  it('starts the free test lock', () => {
    expect(inputFromQuery('?test')).toEqual({ ...EMPTY_INPUT, wantsTestLock: true });
  });

  it('falls back to the defaults for anything unexpected', () => {
    for (const search of ['', '?amount=-3&years=7', '?amount=1e9&years=0', '?amount=<b>&years=abc', '?amount=1234567890']) {
      expect(inputFromQuery(search), search).toEqual(EMPTY_INPUT);
    }
  });
});
