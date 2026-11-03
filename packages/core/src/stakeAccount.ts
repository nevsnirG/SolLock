import type { Address } from '@solana/kit';
import { getStakeStateAccountDecoder, type StakeStateV2 } from '@solana-program/stake';
import { STAKE_PROGRAM_ADDRESS } from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';
import { formatSol } from './money.ts';
import { formatUtc, type UnixSeconds } from './time.ts';

const NEVER = 0xffff_ffff_ffff_ffffn;

export interface RawAccount {
  lamports: bigint;
  programAddress: Address;
  data: Uint8Array;
}

export type LockState =
  | 'missing'
  | 'not-stake'
  | 'uninitialized'
  | 'initialized'
  | 'staked';

export interface LockView {
  address: Address;
  state: LockState;
  lamports: bigint;
  lockedAmount: bigint;
  staker?: Address;
  withdrawer?: Address;
  unlockAt?: UnixSeconds;
  lockupEpoch?: bigint;
  custodian?: Address;
  custodianIsNobody?: boolean;
  lockedNow?: boolean;
  delegation?: { deactivationEpoch: bigint | null };
  canWithdraw?: boolean;
  mustDeactivate?: boolean;
}

export interface ReadContext {
  now: UnixSeconds;
  epoch: bigint;
  /** From the network, never the account's own rent field, which can differ. */
  rent: bigint;
}

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
  // Cooldown can take more than one epoch; the Withdraw itself is the final check, this only picks the button.
  view.canWithdraw = !lockedNow && deactivation !== null && deactivation < ctx.epoch;
  return view;
}

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

export interface LockAccountExpectation {
  /** Also the staker. */
  withdrawer: Address;
  amount: bigint;
  unlockAt: UnixSeconds;
}

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

export const isPlainLock = (view: LockView) => view.custodianIsNobody === true && (view.lockupEpoch ?? 0n) === 0n;

export function lockViewAt(view: LockView, now: UnixSeconds): LockView {
  if (view.state !== 'initialized' || view.unlockAt === undefined || (view.lockupEpoch ?? 0n) !== 0n) return view;
  const lockedNow = view.unlockAt > now;
  return lockedNow === view.lockedNow ? view : { ...view, lockedNow, canWithdraw: !lockedNow };
}
