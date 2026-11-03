import type { Address } from '@solana/kit';
import { getStakeStateAccountDecoder, type StakeStateV2 } from '@solana-program/stake';
import { STAKE_PROGRAM_ADDRESS } from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';
import { formatSol } from './money.ts';
import { formatUtc, type UnixSeconds } from './time.ts';

const NEVER = 0xffff_ffff_ffff_ffffn;

/** An account as `getAccountInfo` / `getMultipleAccounts` returns it, already base64-decoded. */
export interface RawAccount {
  lamports: bigint;
  programAddress: Address;
  data: Uint8Array;
}

export type LockState =
  | 'missing'
  /** Not owned by the Stake program, or not a stake account. */
  | 'not-stake'
  | 'uninitialized'
  /** Has a lockup and is not staked: the normal state of a v1 lock. */
  | 'initialized'
  /** Staked (delegated), possibly through another wallet. */
  | 'staked';

export interface LockView {
  address: Address;
  state: LockState;
  lamports: bigint;
  /** Lamports above the rent deposit: what was locked. */
  lockedAmount: bigint;
  staker?: Address;
  withdrawer?: Address;
  unlockAt?: UnixSeconds;
  lockupEpoch?: bigint;
  custodian?: Address;
  /** The custodian is the published address nobody has a key for. */
  custodianIsNobody?: boolean;
  /** The lockup still holds at the given time and epoch. */
  lockedNow?: boolean;
  delegation?: { deactivationEpoch: bigint | null };
  /** The date has passed and nothing else stands in the way of Withdraw. */
  canWithdraw?: boolean;
  /** Staked, so it must be deactivated (and cool down) before Withdraw. */
  mustDeactivate?: boolean;
}

export interface ReadContext {
  now: UnixSeconds;
  /** Current epoch. Needed to tell whether a deactivated stake has cooled down. */
  epoch: bigint;
  /** Rent-exempt minimum for a 200-byte account, read from the network. Never the account's own field. */
  rent: bigint;
}

/** Decode a stake account into what My locks and the read-back after locking need. */
export function readLockAccount(address: Address, account: RawAccount | null, ctx: ReadContext): LockView {
  if (!account) return { address, state: 'missing', lamports: 0n, lockedAmount: 0n };
  const base = { address, lamports: account.lamports, lockedAmount: account.lamports > ctx.rent ? account.lamports - ctx.rent : 0n };
  if (account.programAddress !== STAKE_PROGRAM_ADDRESS) return { ...base, state: 'not-stake' };

  let state: StakeStateV2;
  try {
    state = getStakeStateAccountDecoder().decode(account.data).state;
  } catch {
    return { ...base, state: 'not-stake' };
  }
  if (state.__kind === 'Uninitialized') return { ...base, state: 'uninitialized' };
  if (state.__kind === 'RewardsPool') return { ...base, state: 'not-stake' };

  const meta = state.fields[0];
  const { unixTimestamp, epoch, custodian } = meta.lockup;
  const lockedNow = unixTimestamp > ctx.now || epoch > ctx.epoch;
  const view: LockView = {
    ...base,
    state: state.__kind === 'Stake' ? 'staked' : 'initialized',
    staker: meta.authorized.staker,
    withdrawer: meta.authorized.withdrawer,
    unlockAt: unixTimestamp,
    lockupEpoch: epoch,
    custodian,
    custodianIsNobody: custodian === CUSTODIAN_ADDRESS,
    lockedNow,
  };

  if (state.__kind === 'Initialized') {
    view.canWithdraw = !lockedNow;
    view.mustDeactivate = false;
    return view;
  }

  const { deactivationEpoch } = state.fields[1].delegation;
  const deactivation = deactivationEpoch === NEVER ? null : deactivationEpoch;
  view.delegation = { deactivationEpoch: deactivation };
  view.mustDeactivate = deactivation === null;
  // Cooldown takes at least one epoch, sometimes more when much stake leaves at once.
  // The withdraw itself is the final check; this only decides which button to show.
  view.canWithdraw = !lockedNow && deactivation !== null && deactivation < ctx.epoch;
  return view;
}

/** The lock in plain words, as shown after locking and in My locks. */
export function describeLock(view: LockView): string[] {
  switch (view.state) {
    case 'missing':
      return ['There is no account at this address. It may have been withdrawn already.'];
    case 'not-stake':
      return ['This is not a stake account, so it is not a lock.'];
    case 'uninitialized':
      return ['This stake account has no lockup.'];
  }
  const lines: string[] = [];
  const when = view.unlockAt !== undefined ? formatUtc(view.unlockAt) : 'an unknown date';
  lines.push(view.lockedNow ? `Locked until ${when}.` : `Unlocked since ${when}.`);
  if (view.lockupEpoch !== undefined && view.lockupEpoch > 0n) lines.push(`Also locked until epoch ${view.lockupEpoch}.`);
  lines.push(
    view.custodianIsNobody
      ? 'Custodian: nobody (the published SolLock address, which has no key).'
      : `Custodian: ${view.custodian}. That address can lift the lock early.`,
  );
  lines.push(`Holds ${formatSol(view.lamports)} SOL, of which ${formatSol(view.lockedAmount)} SOL locked and the rest the rent deposit.`);
  if (view.withdrawer) lines.push(`Can be withdrawn by ${view.withdrawer}.`);
  if (view.state === 'staked') {
    lines.push(view.mustDeactivate ? 'It is staked. Deactivate it before you withdraw.' : 'It is deactivating or inactive.');
  }
  return lines;
}

/** What a lock must hold on chain right after it was made. */
export interface LockAccountExpectation {
  /** Staker and withdrawer: the funder, or the gift recipient. */
  withdrawer: Address;
  amount: bigint;
  unlockAt: UnixSeconds;
}

/**
 * Check a lock as the network returns it after locking, field by field, against what was built.
 * Returns plain-word problems; empty when the chain holds exactly the lock the user signed.
 */
export function verifyLockAccount(view: LockView, expected: LockAccountExpectation): string[] {
  if (view.state === 'missing') return ['The network does not show the lock account yet.'];
  if (view.state !== 'initialized') return [`The account is not a fresh, unstaked lock (it is ${view.state}).`];
  const problems: string[] = [];
  if (view.unlockAt !== expected.unlockAt) {
    const at = (t: UnixSeconds) => `${formatUtc(t)} (unix ${t})`;
    problems.push(`The lock opens ${view.unlockAt === undefined ? 'at an unknown time' : at(view.unlockAt)}, not ${at(expected.unlockAt)}.`);
  }
  if (view.lockupEpoch !== 0n) problems.push(`The lockup also waits for epoch ${view.lockupEpoch}.`);
  if (!view.custodianIsNobody) problems.push(`The custodian is ${view.custodian}, not the published address nobody has a key for.`);
  if (view.withdrawer !== expected.withdrawer) problems.push(`The withdrawer is ${view.withdrawer}, not ${expected.withdrawer}.`);
  if (view.staker !== expected.withdrawer) problems.push(`The staker is ${view.staker}, not ${expected.withdrawer}.`);
  if (view.lockedAmount < expected.amount) problems.push(`The lock holds ${formatSol(view.lockedAmount)} SOL, not ${formatSol(expected.amount)} SOL.`);
  return problems;
}

export const isLockAccount = (view: LockView) => view.state === 'initialized' || view.state === 'staked';

/** A lock as SolLock makes them: the published custodian and no epoch lockup, so the date alone decides. */
export const isPlainLock = (view: LockView) => view.custodianIsNobody === true && (view.lockupEpoch ?? 0n) === 0n;

/**
 * The view as of `now`, so a lock turns withdrawable the moment its date passes, without a reload.
 * Only for unstaked locks that wait for a date alone; anything else keeps what the network said.
 */
export function lockViewAt(view: LockView, now: UnixSeconds): LockView {
  if (view.state !== 'initialized' || view.unlockAt === undefined || (view.lockupEpoch ?? 0n) !== 0n) return view;
  const lockedNow = view.unlockAt > now;
  return lockedNow === view.lockedNow ? view : { ...view, lockedNow, canWithdraw: !lockedNow };
}
