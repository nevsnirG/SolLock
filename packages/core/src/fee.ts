import { LAMPORTS_PER_SOL } from './constants.ts';
import { DAY, HOUR, type UnixSeconds } from './time.ts';

export const FEE_BASIS_POINTS = 25n;
export const MIN_FEE = LAMPORTS_PER_SOL / 100n;

export const TEST_LOCK_AMOUNT = LAMPORTS_PER_SOL / 100n;
const TEST_LOCK_MAX_DURATION = DAY + HOUR;

/** Dutch VAT, included in the fee. */
export const VAT_PERCENT = 21n;

/** 25 hours, not 24, because the test lock's unlock time is rounded up to the whole hour. */
export function isTestLock(amount: bigint, unlockAt: UnixSeconds, now: UnixSeconds): boolean {
  return amount === TEST_LOCK_AMOUNT && unlockAt > now && unlockAt - now <= TEST_LOCK_MAX_DURATION;
}

export type FeeRule = 'free' | 'percentage' | 'minimum';

/** In lamports; the percentage rounds down before the minimum applies. */
export function lockFee(amount: bigint, testLock: boolean): bigint {
  const rule = feeRule(amount, testLock);
  if (rule === 'free') return 0n;
  if (rule === 'minimum') return MIN_FEE;
  return percentageFee(amount);
}

export function feeRule(amount: bigint, testLock: boolean): FeeRule {
  if (amount <= 0n) throw new RangeError('Amount must be above 0');
  if (testLock) return 'free';
  return percentageFee(amount) < MIN_FEE ? 'minimum' : 'percentage';
}

const percentageFee = (amount: bigint) => (amount * FEE_BASIS_POINTS) / 10_000n;

/** The VAT inside a VAT-inclusive fee: 21/121 of it, rounded to the nearest lamport. */
export function vatShare(fee: bigint): bigint {
  const base = 100n + VAT_PERCENT;
  return (fee * VAT_PERCENT * 2n + base) / (base * 2n);
}
