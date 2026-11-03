import type { Address } from '@solana/kit';
import { isLockAccount, type LockView, type SeededLock, type UnixSeconds, type UnlockAction } from '@sollock/core';
import { unlockLabel } from './dates.ts';
import { shortAddress } from './draft.ts';
import { durationText } from './duration.ts';

export interface LockRow {
  view: LockView;
  /** The seed, when the connected wallet made this lock. */
  seed?: string;
  /** Its own lock, or a gift to it. */
  withdrawableByYou: boolean;
  /** The connected wallet made it for someone else. */
  givenByYou: boolean;
}

/**
 * One list from the two lookups: the wallet's seeded accounts (its own locks and gifts it gave) and
 * the locks it can withdraw (including gifts it received). Accounts that are not locks are left out.
 * Sorted by unlock time, soonest first.
 */
export function mergeLocks(wallet: Address, seeded: readonly SeededLock[], withdrawable: readonly LockView[]): LockRow[] {
  const rows = new Map<string, LockRow>();
  for (const { view, seed } of seeded) {
    if (!isLockAccount(view)) continue;
    const withdrawableByYou = view.withdrawer === wallet;
    rows.set(view.address, { view, seed, withdrawableByYou, givenByYou: !withdrawableByYou });
  }
  for (const view of withdrawable) {
    if (!isLockAccount(view) || rows.has(view.address)) continue;
    rows.set(view.address, { view, withdrawableByYou: view.withdrawer === wallet, givenByYou: false });
  }
  return [...rows.values()].sort((a, b) => Number((a.view.unlockAt ?? 0n) - (b.view.unlockAt ?? 0n)));
}

/** The one button a lock gets, if any. Only the withdrawer withdraws; only the staker deactivates. */
export function lockAction(view: LockView, wallet: Address | null): UnlockAction | null {
  if (!wallet) return null;
  if (view.mustDeactivate && view.staker === wallet) return 'deactivate';
  if (view.canWithdraw && view.withdrawer === wallet) return 'withdraw';
  return null;
}

/** "Your lock", "A gift to you", "A gift to 9WzD…AWWM". */
export function lockCardTitle(row: LockRow, wallet: Address | null): string {
  const withdrawer = shortAddress(row.view.withdrawer ?? '');
  if (row.givenByYou) return `A gift to ${withdrawer}`;
  if (row.seed) return 'Your lock';
  return row.view.withdrawer === wallet ? 'A gift to you' : `Goes to ${withdrawer}`;
}

/** "Opens on 1 Jan 2031, in 4 years, 60 days", or "Opened on …" once it is open. */
export function lockCardWhen(view: LockView, now: UnixSeconds): string {
  if (view.unlockAt === undefined) return 'No unlock date';
  const date = unlockLabel(view.unlockAt);
  return view.lockedNow ? `Opens on ${date}, in ${durationText(now, view.unlockAt)}` : `Opened on ${date}`;
}
