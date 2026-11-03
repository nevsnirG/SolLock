import { address } from '@solana/kit';

export { COMPUTE_BUDGET_PROGRAM_ADDRESS } from '@solana-program/compute-budget';
export { STAKE_PROGRAM_ADDRESS } from '@solana-program/stake';
export { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';

/**
 * The classic SPL Memo program (v2). It is immutable (BPF loader 2) and every wallet and explorer
 * labels it. `@solana-program/memo` 0.14+ defaults to a newer, upgradeable memo program, so we
 * always pass this address explicitly.
 */
export const MEMO_PROGRAM_ADDRESS = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Memo text on every lock, so a lock is easy to recognise in an explorer. */
export const LOCK_MEMO = 'sollock v1';

export const STAKE_ACCOUNT_SPACE = 200n;

/** Byte offsets in a stake account: after the state tag, the rent reserve and the staker. */
export const WITHDRAWER_OFFSET = 44n;
export const CUSTODIAN_OFFSET = 92n;

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * The most a 200-byte account has ever needed as its rent deposit (2,282,880 lamports, under the old
 * two-year rule; today it is 1,666,240). Rent only goes down, so a higher figure from the network is a
 * bad answer: it would lock that extra SOL along with the lock.
 */
export const MAX_LOCK_RENT = 2_282_880n;

/** Highest compute-unit limit the builder will set. A lock uses far less. */
export const MAX_LOCK_COMPUTE_UNITS = 200_000;
