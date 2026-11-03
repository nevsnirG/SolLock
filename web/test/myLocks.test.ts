import { type Address, generateKeyPairSigner } from '@solana/kit';
import { type LockView, lockViewAt, type SeededLock } from '@sollock/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { lockAction, mergeLocks } from '../src/lib/myLocks.ts';

let me: Address;
let friend: Address;
const addrs: Address[] = [];

beforeAll(async () => {
  me = (await generateKeyPairSigner()).address;
  friend = (await generateKeyPairSigner()).address;
  for (let i = 0; i < 5; i++) addrs.push((await generateKeyPairSigner()).address);
});

function view(i: number, withdrawer: Address, unlockAt: bigint, extra: Partial<LockView> = {}): LockView {
  return { address: addrs[i]!, state: 'initialized', lamports: 3n, lockedAmount: 1n, staker: withdrawer, withdrawer, unlockAt, lockedNow: true, canWithdraw: false, mustDeactivate: false, ...extra };
}
const seeded = (i: number, v: LockView): SeededLock => ({ index: i, seed: `sl1-${i}`, address: v.address, view: v });

describe('the My locks list', () => {
  it('merges own locks, gifts given and gifts received, soonest first, without doubles', () => {
    const own = view(0, me, 300n);
    const given = view(1, friend, 100n);
    const received = view(2, me, 200n);
    const notALock: LockView = { address: addrs[3]!, state: 'not-stake', lamports: 5n, lockedAmount: 0n };
    const rows = mergeLocks(me, [seeded(0, own), seeded(1, given), seeded(3, notALock)], [own, received]);
    expect(rows.map((r) => r.view.address)).toEqual([given.address, received.address, own.address]);
    expect(rows[0]).toMatchObject({ withdrawableByYou: false, givenByYou: true, seed: 'sl1-1' });
    expect(rows[1]).toMatchObject({ withdrawableByYou: true, givenByYou: false });
    expect(rows[1]?.seed).toBeUndefined();
    expect(rows[2]).toMatchObject({ withdrawableByYou: true, givenByYou: false, seed: 'sl1-0' });
  });

  it('offers Withdraw only to the withdrawer, once due', () => {
    const due = view(0, me, 1n, { lockedNow: false, canWithdraw: true });
    expect(lockAction(due, me)).toBe('withdraw');
    expect(lockAction(due, friend)).toBeNull();
    expect(lockAction(due, null)).toBeNull();
    expect(lockAction(view(0, me, 1n), me)).toBeNull();
  });

  it('offers Deactivate for a lock someone staked', () => {
    const staked = view(0, me, 1n, { state: 'staked', mustDeactivate: true });
    expect(lockAction(staked, me)).toBe('deactivate');
  });
});

describe('a lock opening while the page is open', () => {
  it('turns withdrawable when its time comes, and only then', () => {
    const v = view(0, me, 1_000n);
    expect(lockViewAt(v, 999n)).toBe(v);
    expect(lockViewAt(v, 1_000n)).toMatchObject({ lockedNow: false, canWithdraw: true });
    expect(lockViewAt({ ...v, lockupEpoch: 5n }, 2_000n)).toMatchObject({ lockedNow: true });
    expect(lockViewAt({ ...v, state: 'staked', mustDeactivate: true }, 2_000n).canWithdraw).toBe(false);
  });
});
