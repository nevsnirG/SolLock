import { address } from '@solana/kit';

export { COMPUTE_BUDGET_PROGRAM_ADDRESS } from '@solana-program/compute-budget';
export { STAKE_PROGRAM_ADDRESS } from '@solana-program/stake';
export { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';

/** Classic immutable Memo v2; `@solana-program/memo` 0.14+ defaults to a newer, upgradeable program. */
export const MEMO_PROGRAM_ADDRESS = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export const LOCK_MEMO = 'sollock v1';

export const STAKE_ACCOUNT_SPACE = 200n;

/** Stake account layout: tag (4), rent reserve (8), staker (32), withdrawer (32), lockup time (8), epoch (8), custodian. */
export const WITHDRAWER_OFFSET = 44n;
export const CUSTODIAN_OFFSET = 92n;

export { LAMPORTS_PER_SOL } from './units.ts';

/** Highest rent a 200-byte account has ever needed (old two-year rule); rent only goes down, so more is refused. */
export const MAX_LOCK_RENT = 2_282_880n;

export const MAX_LOCK_COMPUTE_UNITS = 200_000;
