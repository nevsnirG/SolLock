import { LAMPORTS_PER_SOL } from './constants.ts';
import { DAY, HOUR, type UnixSeconds } from './time.ts';

/** 0.25% of the amount, at least 0.01 SOL, VAT included (31 Oct 2026), with no maximum (3 Nov 2026). */
export const FEE_BASIS_POINTS = 25n;
export const MIN_FEE = LAMPORTS_PER_SOL / 100n;

export const TEST_LOCK_AMOUNT = LAMPORTS_PER_SOL / 100n;
const TEST_LOCK_MAX_DURATION = DAY + HOUR;

/** Dutch VAT, included in the fee. */
export const VAT_PERCENT = 21n;

/** A lock counts as a free test lock only at exactly 0.01 SOL, opening within 25 hours. */
export function isTestLock(amount: bigint, unlockAt: UnixSeconds, now: UnixSeconds): boolean {
  return amount === TEST_LOCK_AMOUNT && unlockAt > now && unlockAt - now <= TEST_LOCK_MAX_DURATION;
}

export type FeeRule = 'free' | 'percentage' | 'minimum';

/** Our fee in lamports, rounded down to the lamport before the minimum applies. */
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
