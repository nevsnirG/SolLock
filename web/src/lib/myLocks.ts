import type { Address } from '@solana/kit';
import { isLockAccount, type LockView, type SeededLock, type UnixSeconds, type UnlockAction } from '@sollock/core';
import { unlockLabel } from './dates.ts';
import { shortAddress } from './draft.ts';
import { durationText } from './duration.ts';

export interface LockRow {
  view: LockView;
  seed?: string;
  withdrawableByYou: boolean;
  givenByYou: boolean;
}

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

export function lockAction(view: LockView, wallet: Address | null): UnlockAction | null {
  if (!wallet) return null;
  if (view.mustDeactivate && view.staker === wallet) return 'deactivate';
  if (view.canWithdraw && view.withdrawer === wallet) return 'withdraw';
  return null;
}

export function lockCardTitle(row: LockRow, wallet: Address | null): string {
  const withdrawer = shortAddress(row.view.withdrawer ?? '');
  if (row.givenByYou) return `A gift to ${withdrawer}`;
  if (row.seed) return 'Your lock';
  return row.view.withdrawer === wallet ? 'A gift to you' : `Goes to ${withdrawer}`;
}

export function lockCardWhen(view: LockView, now: UnixSeconds): string {
  if (view.unlockAt === undefined) return 'No unlock date';
  const date = unlockLabel(view.unlockAt);
  return view.lockedNow ? `Opens on ${date}, in ${durationText(now, view.unlockAt)}` : `Opened on ${date}`;
}
