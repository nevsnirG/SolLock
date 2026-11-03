import { describe, expect, it } from 'vitest';
import { DAY, HOUR, isTestLock, LAMPORTS_PER_SOL, lockFee, parseSol, TEST_LOCK_AMOUNT, vatShare } from '../src/index.ts';

const SOL = LAMPORTS_PER_SOL;
const now = 1_793_491_200n;

describe('fee', () => {
  it('is 0.01 SOL on 2 SOL and 0.25 SOL on 100 SOL', () => {
    expect(lockFee(2n * SOL, false)).toBe(parseSol('0.01'));
    expect(lockFee(100n * SOL, false)).toBe(parseSol('0.25'));
  });

  it('is 0.25% from the minimum up', () => {
    expect(lockFee(10n * SOL, false)).toBe(parseSol('0.025'));
    expect(lockFee(parseSol('7.5'), false)).toBe(parseSol('0.01875'));
    expect(lockFee(4n * SOL, false)).toBe(parseSol('0.01'));
  });

  it('never goes below 0.01 SOL', () => {
    expect(lockFee(1n, false)).toBe(parseSol('0.01'));
    expect(lockFee(parseSol('0.5'), false)).toBe(parseSol('0.01'));
  });

  it('has no maximum', () => {
    expect(lockFee(1_000n * SOL, false)).toBe(parseSol('2.5'));
    expect(lockFee(1_000_000n * SOL, false)).toBe(2_500n * SOL);
  });

  it('rounds down to the lamport', () => {
    // 0.25% of 4.000000001 SOL is 10,000,000.0025 lamports.
    expect(lockFee(4_000_000_001n, false)).toBe(10_000_000n);
  });

  it('is free for test locks', () => {
    expect(lockFee(TEST_LOCK_AMOUNT, true)).toBe(0n);
  });

  it('refuses zero', () => {
    expect(() => lockFee(0n, false)).toThrow();
  });

  it('treats only 0.01 SOL for at most 25 hours as a test lock', () => {
    expect(isTestLock(TEST_LOCK_AMOUNT, now + DAY, now)).toBe(true);
    expect(isTestLock(TEST_LOCK_AMOUNT, now + DAY + HOUR, now)).toBe(true);
    expect(isTestLock(TEST_LOCK_AMOUNT, now + DAY + HOUR + 1n, now)).toBe(false);
    expect(isTestLock(TEST_LOCK_AMOUNT + 1n, now + DAY, now)).toBe(false);
    expect(isTestLock(2n * SOL, now + DAY, now)).toBe(false);
    expect(isTestLock(TEST_LOCK_AMOUNT, now, now)).toBe(false);
  });

  it('works out the VAT inside the fee: 21/121, rounded', () => {
    expect(vatShare(parseSol('0.01'))).toBe(1_735_537n); // 1,735,537.19
    expect(vatShare(parseSol('0.25'))).toBe(43_388_430n); // 43,388,429.75
    expect(vatShare(0n)).toBe(0n);
    expect(vatShare(121n)).toBe(21n);
  });
});
