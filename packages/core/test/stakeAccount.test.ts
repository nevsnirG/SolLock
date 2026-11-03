import { type Address, generateKeyPairSigner } from '@solana/kit';
import { getStakeStateAccountEncoder, type StakeStateV2Args } from '@solana-program/stake';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CUSTODIAN_ADDRESS,
  describeLock,
  newYearsDayUnlockAt,
  parseSol,
  type RawAccount,
  readLockAccount,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  utcMidnight,
  verifyLockAccount,
} from '../src/index.ts';

const RENT = 1_666_240n;
const unlockAt = newYearsDayUnlockAt(2032);
const before = { now: utcMidnight(2026, 11, 1), epoch: 1_073n, rent: RENT };
const after = { now: unlockAt + 1n, epoch: 3_000n, rent: RENT };
const NEVER = 0xffff_ffff_ffff_ffffn;

let owner: Address;
let lock: Address;
let voter: Address;

beforeAll(async () => {
  owner = (await generateKeyPairSigner()).address;
  lock = (await generateKeyPairSigner()).address;
  voter = (await generateKeyPairSigner()).address;
});

function meta(custodian: Address = CUSTODIAN_ADDRESS, epoch = 0n) {
  // The account's own rent field is frozen at 2,282,880 on chain. The reader must ignore it.
  return {
    rentExemptReserve: 2_282_880n,
    authorized: { staker: owner, withdrawer: owner },
    lockup: { unixTimestamp: unlockAt, epoch, custodian },
  };
}

function account(state: StakeStateV2Args, lamports = parseSol('2') + RENT): RawAccount {
  const data = new Uint8Array(200);
  data.set(getStakeStateAccountEncoder().encode({ state }));
  return { lamports, programAddress: STAKE_PROGRAM_ADDRESS, data };
}

const initialized = (custodian?: Address, epoch?: bigint) => account({ __kind: 'Initialized', fields: [meta(custodian, epoch)] });

function staked(deactivationEpoch: bigint) {
  return account({
    __kind: 'Stake',
    fields: [
      meta(),
      { delegation: { voterPubkey: voter, stake: parseSol('2'), activationEpoch: 1_073n, deactivationEpoch, reserved: new Array(8).fill(0) }, creditsObserved: 0n },
      { bits: 0 },
    ],
  });
}

describe('reading a lock', () => {
  it('reads a v1 lock before the date', () => {
    const view = readLockAccount(lock, initialized(), before);
    expect(view).toMatchObject({
      state: 'initialized',
      lamports: parseSol('2') + RENT,
      lockedAmount: parseSol('2'),
      staker: owner,
      withdrawer: owner,
      unlockAt,
      lockupEpoch: 0n,
      custodian: CUSTODIAN_ADDRESS,
      custodianIsNobody: true,
      lockedNow: true,
      canWithdraw: false,
      mustDeactivate: false,
    });
  });

  it('allows withdrawing after the date', () => {
    expect(readLockAccount(lock, initialized(), after)).toMatchObject({ lockedNow: false, canWithdraw: true });
  });

  it('still counts as locked while the lockup epoch is ahead', () => {
    expect(readLockAccount(lock, initialized(CUSTODIAN_ADDRESS, 5_000n), after)).toMatchObject({ lockedNow: true, canWithdraw: false });
  });

  it('notices a custodian that could unlock it', () => {
    const view = readLockAccount(lock, initialized(owner), before);
    expect(view.custodianIsNobody).toBe(false);
    expect(describeLock(view).join(' ')).toMatch(/can lift the lock early/);
  });

  it('asks to deactivate a staked lock first', () => {
    expect(readLockAccount(lock, staked(NEVER), after)).toMatchObject({ state: 'staked', mustDeactivate: true, canWithdraw: false });
    expect(readLockAccount(lock, staked(2_999n), after)).toMatchObject({ mustDeactivate: false, canWithdraw: true });
    expect(readLockAccount(lock, staked(3_000n), after)).toMatchObject({ mustDeactivate: false, canWithdraw: false });
    expect(readLockAccount(lock, staked(2_000n), before)).toMatchObject({ canWithdraw: false });
  });

  it('handles accounts that are not locks', () => {
    expect(readLockAccount(lock, null, before).state).toBe('missing');
    expect(readLockAccount(lock, { ...initialized(), programAddress: SYSTEM_PROGRAM_ADDRESS }, before).state).toBe('not-stake');
    expect(readLockAccount(lock, { ...initialized(), data: new Uint8Array(3) }, before).state).toBe('not-stake');
    expect(readLockAccount(lock, account({ __kind: 'Uninitialized' }), before).state).toBe('uninitialized');
  });

  it('describes it in plain words', () => {
    expect(describeLock(readLockAccount(lock, initialized(), before))).toEqual([
      'Locked until 1 Jan 2032, 00:00 UTC.',
      'Custodian: nobody (the published SolLock address, which has no key).',
      'Holds 2.00166624 SOL, of which 2 SOL locked and the rest the rent deposit.',
      `Can be withdrawn by ${owner}.`,
    ]);
  });
});

describe('checking a lock after locking', () => {
  const expected = () => ({ withdrawer: owner, amount: parseSol('2'), unlockAt });

  it('accepts exactly the lock that was built', () => {
    expect(verifyLockAccount(readLockAccount(lock, initialized(), before), expected())).toEqual([]);
  });

  it('accepts SOL that someone sent to the lock afterwards', () => {
    const view = readLockAccount(lock, initialized(), before);
    expect(verifyLockAccount({ ...view, lamports: view.lamports + 5n, lockedAmount: view.lockedAmount + 5n }, expected())).toEqual([]);
  });

  it('notices every field that differs', () => {
    const view = readLockAccount(lock, initialized(voter, 9n), before);
    const problems = verifyLockAccount(
      { ...view, unlockAt: unlockAt + 1n, lockedAmount: 1n, withdrawer: voter },
      { ...expected(), withdrawer: owner },
    );
    expect(problems).toHaveLength(5);
    expect(problems.join(' ')).toMatch(/opens .*\(unix 1956528001\), not .*\(unix 1956528000\)/);
    expect(problems.join(' ')).toMatch(/epoch 9/);
    expect(problems.join(' ')).toMatch(/custodian is/);
    expect(problems.join(' ')).toMatch(/withdrawer is/);
    expect(problems.join(' ')).toMatch(/holds 0.000000001 SOL, not 2 SOL/);
  });

  it('refuses a missing or staked account', () => {
    expect(verifyLockAccount(readLockAccount(lock, null, before), expected())).toEqual(['The network does not show the lock account yet.']);
    expect(verifyLockAccount(readLockAccount(lock, staked(NEVER), before), expected())[0]).toMatch(/not a fresh, unstaked lock/);
  });
});
