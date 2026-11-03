/** LiteSVM has no Windows build, so these tests run apart from the unit tests, in Docker. */
import { readFileSync } from 'node:fs';
import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  createAddressWithSeed,
  createTransactionMessage,
  generateKeyPairSigner,
  type Instruction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from '@solana/kit';
import {
  getAuthorizeInstruction,
  getInitializeInstruction,
  getMergeInstruction,
  getMoveLamportsInstruction,
  getSetLockupInstruction,
  getSplitInstruction,
  getWithdrawInstruction,
  StakeAuthorize,
} from '@solana-program/stake';
import { getCreateAccountWithSeedInstruction } from '@solana-program/system';
import { FailedTransactionMetadata, LiteSVM, type TransactionMetadata } from 'litesvm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTODIAN_ADDRESS,
  newYearsDayUnlockAt,
  LAMPORTS_PER_SOL,
  type LockPlan,
  type LockRequest,
  lockTransactionMessage,
  MEMO_PROGRAM_ADDRESS,
  parseSol,
  planLock,
  type RawAccount,
  readLockAccount,
  STAKE_ACCOUNT_SPACE,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  testLockUnlockAt,
  utcMidnight,
  withdrawAllInstruction,
} from '../src/index.ts';

const programs = new URL('./programs/', import.meta.url);
const STAKE_SO = readFileSync(new URL('stake.so', programs));
const MEMO_SO = readFileSync(new URL('memo.so', programs));
const BPF_LOADER_2 = address('BPFLoader2111111111111111111111111111111111');

const NOW = utcMidnight(2026, 11, 1);
const UNLOCK = newYearsDayUnlockAt(2032);
const SOL = LAMPORTS_PER_SOL;

let svm: LiteSVM;
let user: TransactionSigner;
let friend: TransactionSigner;
let feeAddress: Address;
let rent: bigint;

function setTime(unixTimestamp: bigint) {
  const clock = svm.getClock();
  clock.unixTimestamp = unixTimestamp;
  svm.setClock(clock);
}

async function send(payer: TransactionSigner, instructions: readonly Instruction[]) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const result = svm.sendTransaction(await signTransactionMessageWithSigners(message));
  svm.expireBlockhash();
  return result;
}

function expectOk(result: TransactionMetadata | FailedTransactionMetadata): TransactionMetadata {
  if (result instanceof FailedTransactionMetadata) {
    throw new Error(`Transaction failed: ${result.toString()}\n${result.meta().logs().join('\n')}`);
  }
  return result;
}

function expectFailure(result: TransactionMetadata | FailedTransactionMetadata): string {
  expect(result).toBeInstanceOf(FailedTransactionMetadata);
  const failed = result as FailedTransactionMetadata;
  return `${failed.toString()}\n${failed.meta().logs().join('\n')}`;
}

const LOCKUP_IN_FORCE = /custom program error: 0x1\b/;
const CUSTODIAN_MISSING = /custom program error: 0x7\b/;
const MERGE_MISMATCH = /custom program error: 0x6\b/;
const MISSING_SIGNATURE = /missing required signature/i;

function raw(addr: Address): RawAccount | null {
  const a = svm.getAccount(addr);
  if (!a.exists) return null;
  return { lamports: a.lamports, programAddress: a.programAddress, data: new Uint8Array(a.data) };
}

function balance(addr: Address): bigint {
  return svm.getBalance(addr) ?? 0n;
}

async function lock(overrides: Partial<LockRequest> = {}): Promise<{ plan: LockPlan; computeUnits: bigint }> {
  const req: LockRequest = { funder: user, amount: parseSol('2'), unlockAt: UNLOCK, seedIndex: 0, rent, feeAddress, now: NOW, ...overrides };
  const lifetime = { blockhash: svm.latestBlockhash(), lastValidBlockHeight: 1_000_000n };

  const draft = await planLock(req);
  const simulated = svm.simulateTransaction(await signTransactionMessageWithSigners(lockTransactionMessage(draft, lifetime)));
  if (simulated instanceof FailedTransactionMetadata) throw new Error(`Simulation failed: ${simulated.toString()}`);
  const used = simulated.meta().computeUnitsConsumed();

  const plan = await planLock({ ...req, computeUnitLimit: Math.ceil(Number(used) * 1.2) + 1_000 });
  const result = expectOk(svm.sendTransaction(await signTransactionMessageWithSigners(lockTransactionMessage(plan, lifetime))));
  svm.expireBlockhash();
  return { plan, computeUnits: result.computeUnitsConsumed() };
}

async function stakeAccount(seed: string, lockup?: { unixTimestamp: bigint; custodian: Address }, extra = 0n): Promise<Address> {
  const addr = await createAddressWithSeed({ baseAddress: user.address, programAddress: STAKE_PROGRAM_ADDRESS, seed });
  const ixs: Instruction[] = [
    getCreateAccountWithSeedInstruction({
      payer: user,
      newAccount: addr,
      base: user.address,
      seed,
      amount: rent + extra,
      space: STAKE_ACCOUNT_SPACE,
      programAddress: STAKE_PROGRAM_ADDRESS,
    }),
  ];
  if (lockup) {
    ixs.push(
      getInitializeInstruction({
        stake: addr,
        arg0: { staker: user.address, withdrawer: user.address },
        arg1: { unixTimestamp: lockup.unixTimestamp, epoch: 0n, custodian: lockup.custodian },
      }),
    );
  }
  expectOk(await send(user, ixs));
  return addr;
}

beforeEach(async () => {
  svm = new LiteSVM();
  svm.addProgram(STAKE_PROGRAM_ADDRESS, STAKE_SO);
  svm.addProgramWithLoader(MEMO_PROGRAM_ADDRESS, MEMO_SO, BPF_LOADER_2);
  setTime(NOW);
  user = await generateKeyPairSigner();
  friend = await generateKeyPairSigner();
  feeAddress = (await generateKeyPairSigner()).address;
  svm.airdrop(user.address, lamports(10n * SOL));
  svm.airdrop(friend.address, lamports(1n * SOL));
  rent = svm.minimumBalanceForRentExemption(STAKE_ACCOUNT_SPACE);
});

describe('creating a lock on the real stake program', () => {
  it('lands, and reads back as built', async () => {
    const before = balance(user.address);
    const { plan, computeUnits } = await lock();
    const view = readLockAccount(plan.lockAddress, raw(plan.lockAddress), { now: NOW, epoch: 0n, rent });
    expect(view).toMatchObject({
      state: 'initialized',
      lockedAmount: parseSol('2'),
      staker: user.address,
      withdrawer: user.address,
      unlockAt: UNLOCK,
      lockupEpoch: 0n,
      custodian: CUSTODIAN_ADDRESS,
      custodianIsNobody: true,
      lockedNow: true,
      canWithdraw: false,
    });
    expect(balance(feeAddress)).toBe(parseSol('0.01'));
    // Plus the 5,000-lamport signature fee.
    expect(before - balance(user.address)).toBe(plan.total + 5_000n);
    expect(computeUnits).toBeLessThan(BigInt(plan.computeUnitLimit ?? 0));
    console.log(`Lock used ${computeUnits} compute units; limit set to ${plan.computeUnitLimit}.`);
  });

  it('refuses to create the same lock twice', async () => {
    const { plan } = await lock();
    const again = await planLock({ funder: user, amount: parseSol('1'), unlockAt: UNLOCK, seedIndex: 0, rent, feeAddress, now: NOW });
    const result = svm.sendTransaction(
      await signTransactionMessageWithSigners(lockTransactionMessage(again, { blockhash: svm.latestBlockhash(), lastValidBlockHeight: 1n })),
    );
    expect(expectFailure(result)).toMatch(/already in use/i);
    expect(raw(plan.lockAddress)?.lamports).toBe(parseSol('2') + rent);
  });
});

describe('nothing gets the SOL out before the date', () => {
  it('Withdraw, all or part, by the owner', async () => {
    const { plan } = await lock();
    for (const amount of [parseSol('2') + rent, 1n]) {
      const logs = expectFailure(
        await send(user, [getWithdrawInstruction({ stake: plan.lockAddress, recipient: user.address, withdrawAuthority: user, args: amount })]),
      );
      expect(logs).toMatch(LOCKUP_IN_FORCE);
    }
  });

  it('Withdraw one second before the date', async () => {
    const { plan } = await lock();
    setTime(UNLOCK - 1n);
    const logs = expectFailure(
      await send(user, [getWithdrawInstruction({ stake: plan.lockAddress, recipient: user.address, withdrawAuthority: user, args: 1n })]),
    );
    expect(logs).toMatch(LOCKUP_IN_FORCE);
  });

  it('handing the withdraw authority to someone else', async () => {
    const { plan } = await lock();
    const logs = expectFailure(
      await send(user, [getAuthorizeInstruction({ stake: plan.lockAddress, authority: user, arg0: friend.address, arg1: StakeAuthorize.Withdrawer })]),
    );
    expect(logs).toMatch(CUSTODIAN_MISSING);
  });

  it('moving the date with SetLockup', async () => {
    const { plan } = await lock();
    const logs = expectFailure(
      await send(user, [getSetLockupInstruction({ stake: plan.lockAddress, authority: user, unixTimestamp: NOW, epoch: null, custodian: null })]),
    );
    expect(logs).toMatch(MISSING_SIGNATURE);
  });

  it('splitting: the new account carries the same lockup', async () => {
    const { plan } = await lock();
    const piece = await stakeAccount('split-1');
    expectOk(await send(user, [getSplitInstruction({ stake: plan.lockAddress, splitStake: piece, stakeAuthority: user, args: parseSol('1') })]));
    const view = readLockAccount(piece, raw(piece), { now: NOW, epoch: 0n, rent });
    expect(view).toMatchObject({ state: 'initialized', unlockAt: UNLOCK, custodian: CUSTODIAN_ADDRESS, withdrawer: user.address, lockedNow: true });
    const logs = expectFailure(
      await send(user, [getWithdrawInstruction({ stake: piece, recipient: user.address, withdrawAuthority: user, args: 1n })]),
    );
    expect(logs).toMatch(LOCKUP_IN_FORCE);
  });

  it('merging into an account without a lockup', async () => {
    const { plan } = await lock();
    const open = await stakeAccount('open-1', { unixTimestamp: 0n, custodian: SYSTEM_PROGRAM_ADDRESS });
    const logs = expectFailure(
      await send(user, [getMergeInstruction({ destinationStake: open, sourceStake: plan.lockAddress, stakeAuthority: user })]),
    );
    expect(logs).toMatch(MERGE_MISMATCH);
  });

  it('merging into an account with an earlier lockup', async () => {
    const { plan } = await lock();
    const early = await stakeAccount('early-1', { unixTimestamp: NOW + 7_200n, custodian: CUSTODIAN_ADDRESS });
    const logs = expectFailure(
      await send(user, [getMergeInstruction({ destinationStake: early, sourceStake: plan.lockAddress, stakeAuthority: user })]),
    );
    expect(logs).toMatch(MERGE_MISMATCH);
  });

  it('moving lamports to an account without a lockup', async () => {
    const { plan } = await lock();
    const open = await stakeAccount('open-2', { unixTimestamp: 0n, custodian: SYSTEM_PROGRAM_ADDRESS });
    const result = await send(user, [
      getMoveLamportsInstruction({ sourceStake: plan.lockAddress, destinationStake: open, stakeAuthority: user, args: parseSol('1') }),
    ]);
    expect(expectFailure(result)).toMatch(MERGE_MISMATCH);
    expect(raw(plan.lockAddress)?.lamports).toBe(parseSol('2') + rent);
  });

  it('control: merge and move do work between locks with the same lockup, and stay locked', async () => {
    const { plan } = await lock();
    const twin = await stakeAccount('twin-1', { unixTimestamp: UNLOCK, custodian: CUSTODIAN_ADDRESS }, parseSol('1'));
    expectOk(
      await send(user, [getMoveLamportsInstruction({ sourceStake: twin, destinationStake: plan.lockAddress, stakeAuthority: user, args: parseSol('0.5') })]),
    );
    expectOk(await send(user, [getMergeInstruction({ destinationStake: plan.lockAddress, sourceStake: twin, stakeAuthority: user })]));
    const view = readLockAccount(plan.lockAddress, raw(plan.lockAddress), { now: NOW, epoch: 0n, rent });
    expect(view).toMatchObject({ lockedAmount: parseSol('3') + rent, unlockAt: UNLOCK, custodianIsNobody: true, lockedNow: true });
    expect(raw(twin)).toBeNull();
  });

  it('a gift giver, before or after the date', async () => {
    const { plan } = await lock({ recipient: friend.address });
    for (const time of [NOW, UNLOCK + 1n]) {
      setTime(time);
      const logs = expectFailure(
        await send(user, [getWithdrawInstruction({ stake: plan.lockAddress, recipient: user.address, withdrawAuthority: user, args: 1n })]),
      );
      expect(logs).toMatch(MISSING_SIGNATURE);
    }
  });
});

describe('on the date', () => {
  it('opens at exactly the unlock time, and Withdraw empties and closes the lock', async () => {
    const { plan } = await lock();
    setTime(UNLOCK);
    const view = readLockAccount(plan.lockAddress, raw(plan.lockAddress), { now: UNLOCK, epoch: 0n, rent });
    expect(view.canWithdraw).toBe(true);
    const before = balance(user.address);
    expectOk(await send(user, [withdrawAllInstruction(view, user, user.address)]));
    expect(raw(plan.lockAddress)).toBeNull();
    expect(balance(user.address) - before).toBe(parseSol('2') + rent - 5_000n);
  });

  it('lets the gift recipient withdraw', async () => {
    const { plan } = await lock({ recipient: friend.address });
    setTime(UNLOCK + 60n);
    const view = readLockAccount(plan.lockAddress, raw(plan.lockAddress), { now: UNLOCK + 60n, epoch: 0n, rent });
    expect(view.withdrawer).toBe(friend.address);
    const before = balance(friend.address);
    expectOk(await send(friend, [withdrawAllInstruction(view, friend, friend.address)]));
    expect(balance(friend.address) - before).toBe(parseSol('2') + rent - 5_000n);
  });
});

describe('the free test lock', () => {
  it('pays no fee and opens 24 hours later', async () => {
    const unlockAt = testLockUnlockAt(NOW);
    const { plan } = await lock({ amount: parseSol('0.01'), unlockAt });
    expect(plan.fee).toBe(0n);
    expect(balance(feeAddress)).toBe(0n);

    setTime(unlockAt - 1n);
    expectFailure(await send(user, [getWithdrawInstruction({ stake: plan.lockAddress, recipient: user.address, withdrawAuthority: user, args: 1n })]));

    setTime(unlockAt);
    const view = readLockAccount(plan.lockAddress, raw(plan.lockAddress), { now: unlockAt, epoch: 0n, rent });
    expectOk(await send(user, [withdrawAllInstruction(view, user, user.address)]));
    expect(raw(plan.lockAddress)).toBeNull();
  });
});
