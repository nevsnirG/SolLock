import {
  type Address,
  type Blockhash,
  generateKeyPairSigner,
  getProgramDerivedAddress,
  getTransactionEncoder,
  type Instruction,
  isSignerRole,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from '@solana/kit';
import { getSetComputeUnitLimitInstruction, parseSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { getAddMemoInstruction } from '@solana-program/memo';
import {
  getInitializeCheckedInstruction,
  getInitializeInstruction,
  parseInitializeInstruction,
} from '@solana-program/stake';
import {
  getTransferSolInstruction,
  parseCreateAccountWithSeedInstruction,
  parseTransferSolInstruction,
} from '@solana-program/system';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CUSTODIAN_ADDRESS,
  decodeInstruction,
  newYearsDayUnlockAt,
  type LockRequest,
  LockRequestError,
  lockAddress,
  lockTransactionMessage,
  MEMO_PROGRAM_ADDRESS,
  parseSol,
  planLock,
  roundTripMessage,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  testLockUnlockAt,
  utcMidnight,
  verifyLockInstructions,
  verifyLockMessage,
} from '../src/index.ts';
import { decodeWireTransaction, messageSigners } from './helpers.ts';

const now = utcMidnight(2026, 11, 1);
const unlockAt = newYearsDayUnlockAt(2032);
const RENT = 1_666_240n;

let funder: TransactionSigner;
let feeAddress: Address;
let friend: Address;
let stranger: TransactionSigner;
let blockhash: Blockhash;

beforeAll(async () => {
  funder = await generateKeyPairSigner();
  stranger = await generateKeyPairSigner();
  feeAddress = (await generateKeyPairSigner()).address;
  friend = (await generateKeyPairSigner()).address;
  blockhash = (await generateKeyPairSigner()).address as unknown as Blockhash;
});

function request(overrides: Partial<LockRequest> = {}): LockRequest {
  return {
    funder,
    amount: parseSol('2'),
    unlockAt,
    seedIndex: 0,
    rent: RENT,
    feeAddress,
    now,
    computeUnitLimit: 40_000,
    ...overrides,
  };
}

async function builtAndReadBack(overrides: Partial<LockRequest> = {}) {
  const plan = await planLock(request(overrides));
  const message = roundTripMessage(lockTransactionMessage(plan, { blockhash, lastValidBlockHeight: 100n }));
  return { plan, message };
}

describe('lock builder, read back field by field', () => {
  it('builds exactly: compute limit, create, initialize, fee, memo', async () => {
    const { plan, message } = await builtAndReadBack();
    expect(message.instructions.map((ix) => decodeInstruction(ix, { feeAddress }).name)).toEqual([
      'SetComputeUnitLimit',
      'CreateAccountWithSeed',
      'Initialize',
      'Transfer',
      'Memo',
    ]);
    expect(await verifyLockMessage(message, plan.expectation)).toEqual([]);
  });

  it('has one signer: the wallet, which also pays', async () => {
    const { message } = await builtAndReadBack();
    expect(message.feePayer.address).toBe(funder.address);
    expect(messageSigners(message)).toEqual([funder.address]);
  });

  it('creates the account at sl1-<n> from the wallet, sized and owned for staking', async () => {
    const { plan, message } = await builtAndReadBack({ seedIndex: 7 });
    const { accounts, data } = parseCreateAccountWithSeedInstruction(message.instructions[1] as never);
    expect(accounts.payer.address).toBe(funder.address);
    expect(accounts.newAccount.address).toBe(await lockAddress(funder.address, 7));
    expect(accounts.newAccount.address).toBe(plan.lockAddress);
    expect(data.base).toBe(funder.address);
    expect(data.seed).toBe('sl1-7');
    expect(data.amount).toBe(parseSol('2') + RENT);
    expect(data.space).toBe(200n);
    expect(data.programAddress).toBe(STAKE_PROGRAM_ADDRESS);
  });

  it('sets the lockup: the date, epoch 0 and the published custodian', async () => {
    const { plan, message } = await builtAndReadBack();
    const ix = message.instructions[2] as Instruction;
    expect(ix.programAddress).toBe(STAKE_PROGRAM_ADDRESS);
    expect(ix.accounts).toHaveLength(1);
    const { accounts, data } = parseInitializeInstruction(ix as never);
    expect(accounts.stake.address).toBe(plan.lockAddress);
    expect(data.arg1.unixTimestamp).toBe(1_956_528_000n);
    expect(data.arg1.epoch).toBe(0n);
    expect(data.arg1.custodian).toBe(CUSTODIAN_ADDRESS);
    expect(data.arg0).toEqual({ staker: funder.address, withdrawer: funder.address });
  });

  it('pays the fee to the fee address, from the wallet', async () => {
    const { message } = await builtAndReadBack();
    const { accounts, data } = parseTransferSolInstruction(message.instructions[3] as never);
    expect(accounts.source.address).toBe(funder.address);
    expect(accounts.destination.address).toBe(feeAddress);
    expect(data.amount).toBe(parseSol('0.01'));
  });

  it('ends with the memo on the classic Memo program', async () => {
    const { message } = await builtAndReadBack();
    const memo = message.instructions[4] as Instruction;
    expect(memo.programAddress).toBe(MEMO_PROGRAM_ADDRESS);
    expect(memo.programAddress).toBe('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    expect(new TextDecoder().decode(memo.data)).toBe('sollock v1');
    expect(memo.accounts ?? []).toHaveLength(0);
  });

  it('sets the compute-unit limit it was given, and none without one', async () => {
    const { message } = await builtAndReadBack({ computeUnitLimit: 12_345 });
    expect(parseSetComputeUnitLimitInstruction(message.instructions[0] as never).data.units).toBe(12_345);
    const bare = await builtAndReadBack({ computeUnitLimit: undefined });
    expect(bare.message.instructions[0]?.programAddress).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(await verifyLockMessage(bare.message, bare.plan.expectation)).toEqual([]);
  });

  it('adds up what leaves the wallet', async () => {
    const { plan } = await builtAndReadBack({ amount: parseSol('100') });
    expect(plan.fee).toBe(parseSol('0.25'));
    expect(plan.vat).toBe(43_388_430n);
    expect(plan.total).toBe(parseSol('100') + RENT + parseSol('0.25'));
  });

  it('survives signing and wire encoding unchanged', async () => {
    const plan = await planLock(request());
    const signed = await signTransactionMessageWithSigners(lockTransactionMessage(plan, { blockhash, lastValidBlockHeight: 100n }));
    const bytes = new Uint8Array(getTransactionEncoder().encode(signed));
    const { message, signatures } = decodeWireTransaction(bytes);
    expect(Object.keys(signatures)).toEqual([funder.address]);
    expect(await verifyLockMessage(message, plan.expectation)).toEqual([]);
  });
});

describe('gift locks', () => {
  it('gives the recipient both roles; the giver only pays', async () => {
    const { plan, message } = await builtAndReadBack({ recipient: friend });
    expect(plan.gift).toBe(true);
    expect(plan.withdrawer).toBe(friend);
    const { data } = parseInitializeInstruction(message.instructions[2] as never);
    expect(data.arg0).toEqual({ staker: friend, withdrawer: friend });
    expect(messageSigners(message)).toEqual([funder.address]);
    expect(await verifyLockMessage(message, plan.expectation)).toEqual([]);
  });

  it('refuses bad recipients', async () => {
    const [pda] = await getProgramDerivedAddress({ programAddress: STAKE_PROGRAM_ADDRESS, seeds: ['x'] });
    for (const recipient of [funder.address, CUSTODIAN_ADDRESS, feeAddress, SYSTEM_PROGRAM_ADDRESS, pda, 'nope' as Address]) {
      await expect(planLock(request({ recipient })), recipient).rejects.toBeInstanceOf(LockRequestError);
    }
  });
});

describe('test locks', () => {
  it('are free: no fee transfer at all', async () => {
    const { plan, message } = await builtAndReadBack({ amount: parseSol('0.01'), unlockAt: testLockUnlockAt(now) });
    expect(plan.testLock).toBe(true);
    expect(plan.fee).toBe(0n);
    expect(message.instructions.map((ix) => decodeInstruction(ix).name)).toEqual([
      'SetComputeUnitLimit',
      'CreateAccountWithSeed',
      'Initialize',
      'Memo',
    ]);
    expect(await verifyLockMessage(message, plan.expectation)).toEqual([]);
  });

  it('pay the fee when they last longer than a day', async () => {
    const plan = await planLock(request({ amount: parseSol('0.01'), unlockAt: now + 3n * 86_400n }));
    expect(plan.testLock).toBe(false);
    expect(plan.fee).toBe(parseSol('0.01'));
  });
});

describe('the builder refuses', () => {
  const cases: [string, Partial<LockRequest>, RegExp][] = [
    ['zero', { amount: 0n }, /smallest lock/],
    ['below 0.001 SOL', { amount: parseSol('0.000999999') }, /smallest lock/],
    ['a past date', { unlockAt: now - 1n }, /future/],
    ['less than an hour', { unlockAt: now + 3_599n }, /an hour/],
    ['after 2076', { unlockAt: utcMidnight(2077, 1, 1) }, /2076/],
    ['a negative seed', { seedIndex: -1 }, /Seed index/],
    ['rent of zero', { rent: 0n }, /rent deposit/],
    ['rent above the most it has ever been', { rent: 2_282_881n }, /rent deposit/],
    ['rent of 40 SOL from a lying network', { rent: 40n * 1_000_000_000n }, /rent deposit of 40 SOL/],
    ['a compute limit of 0', { computeUnitLimit: 0 }, /Compute-unit limit/],
    ['a compute limit above 200,000', { computeUnitLimit: 200_001 }, /Compute-unit limit/],
    ['the custodian as fee address', { feeAddress: CUSTODIAN_ADDRESS }, /fee address/],
  ];
  for (const [what, overrides, message] of cases) {
    it(what, async () => {
      const result = planLock(request(overrides));
      await expect(result).rejects.toBeInstanceOf(LockRequestError);
      await expect(result).rejects.toThrow(message);
    });
  }
});

describe('the verifier catches tampering', () => {
  async function tampered(change: (ixs: Instruction[], plan: Awaited<ReturnType<typeof planLock>>) => Instruction[]) {
    const plan = await planLock(request());
    return verifyLockInstructions(change([...plan.instructions], plan), plan.expectation);
  }

  function initWith(plan: Awaited<ReturnType<typeof planLock>>, overrides: { custodian?: Address; epoch?: bigint; unixTimestamp?: bigint; withdrawer?: Address }) {
    return getInitializeInstruction({
      stake: plan.lockAddress,
      arg0: { staker: plan.withdrawer, withdrawer: overrides.withdrawer ?? plan.withdrawer },
      arg1: {
        unixTimestamp: overrides.unixTimestamp ?? plan.unlockAt,
        epoch: overrides.epoch ?? 0n,
        custodian: overrides.custodian ?? CUSTODIAN_ADDRESS,
      },
    });
  }

  it('a different custodian', async () => {
    const problems = await tampered((ixs, plan) => ixs.with(2, initWith(plan, { custodian: funder.address })));
    expect(problems.join(' ')).toMatch(/custodian/);
  });

  it('a lockup epoch other than 0', async () => {
    expect((await tampered((ixs, plan) => ixs.with(2, initWith(plan, { epoch: 1n })))).join(' ')).toMatch(/epoch/);
  });

  it('a different date', async () => {
    const problems = await tampered((ixs, plan) => ixs.with(2, initWith(plan, { unixTimestamp: now + 7_200n })));
    expect(problems.join(' ')).toMatch(/date/);
  });

  it('a different withdrawer', async () => {
    const problems = await tampered((ixs, plan) => ixs.with(2, initWith(plan, { withdrawer: friend })));
    expect(problems.join(' ')).toMatch(/withdraw authority/);
  });

  it('InitializeChecked, which sets no lockup', async () => {
    const problems = await tampered((ixs, plan) =>
      ixs.with(2, getInitializeCheckedInstruction({ stake: plan.lockAddress, stakeAuthority: funder.address, withdrawAuthority: funder })),
    );
    expect(problems.join(' ')).toMatch(/not Stake Initialize/);
  });

  it('the fee going elsewhere, or a different fee', async () => {
    const elsewhere = await tampered((ixs) => ixs.with(3, getTransferSolInstruction({ source: funder, destination: friend, amount: parseSol('0.01') })));
    expect(elsewhere.join(' ')).toMatch(/fee goes to/);
    const more = await tampered((ixs) => ixs.with(3, getTransferSolInstruction({ source: funder, destination: feeAddress, amount: parseSol('0.02') })));
    expect(more.join(' ')).toMatch(/fee should be/);
  });

  it('a missing fee', async () => {
    expect((await tampered((ixs) => ixs.toSpliced(3, 1))).join(' ')).toMatch(/Expected 4/);
  });

  it('an extra instruction', async () => {
    const problems = await tampered((ixs) => [...ixs, getTransferSolInstruction({ source: funder, destination: friend, amount: 1n })]);
    expect(problems.join(' ')).toMatch(/Expected 4/);
  });

  it('another signer', async () => {
    const problems = await tampered((ixs) => ixs.with(3, getTransferSolInstruction({ source: stranger, destination: feeAddress, amount: parseSol('0.01') })));
    expect(problems.join(' ')).toMatch(/would have to sign/);
  });

  it('the memo on another program, or another text', async () => {
    const other = await tampered((ixs) => ixs.with(4, getAddMemoInstruction({ memo: 'sollock v1' })));
    expect(other.join(' ')).toMatch(/classic Memo program/);
    const text = await tampered((ixs) => ixs.with(4, getAddMemoInstruction({ memo: 'hi' }, { programAddress: MEMO_PROGRAM_ADDRESS })));
    expect(text.join(' ')).toMatch(/memo should read/);
  });

  it('a huge compute-unit limit', async () => {
    const problems = await tampered((ixs) => ixs.with(0, getSetComputeUnitLimitInstruction({ units: 1_400_000 })));
    expect(problems.join(' ')).toMatch(/out of range/);
  });

  it('a different fee payer', async () => {
    const plan = await planLock(request());
    const message = roundTripMessage(lockTransactionMessage(plan, { blockhash, lastValidBlockHeight: 1n }));
    const problems = await verifyLockMessage({ ...message, feePayer: { address: stranger.address } }, plan.expectation);
    expect(problems.join(' ')).toMatch(/fee payer/);
  });

  it('signer roles survive the round trip', async () => {
    const { message } = await builtAndReadBack();
    const signerMetas = message.instructions.flatMap((ix) => (ix.accounts ?? []).filter((m) => isSignerRole(m.role)));
    expect(new Set(signerMetas.map((m) => m.address))).toEqual(new Set([funder.address]));
  });
});

describe('the decoded preview', () => {
  it('says who is who, and that nobody holds the custodian key', async () => {
    const { message } = await builtAndReadBack();
    const [, create, init, fee, memo] = message.instructions.map((ix) => decodeInstruction(ix, { feeAddress, wallet: funder.address }));
    expect(create?.fields.find((f) => f.label === 'from (pays)')?.note).toBe('your wallet');
    expect(create?.fields.find((f) => f.label === 'lamports')?.note).toBe('2.00166624 SOL');
    const custodian = init?.fields.find((f) => f.label === 'lockup.custodian');
    expect(custodian?.value).toBe(CUSTODIAN_ADDRESS);
    expect(custodian?.note).toBe('off-curve, nobody has a key');
    expect(custodian?.warning).toBeUndefined();
    expect(init?.fields.find((f) => f.label === 'lockup.unix_timestamp')?.note).toBe('1 Jan 2032, 00:00 UTC');
    expect(fee?.why).toBe('Our fee. Nothing else goes to us.');
    expect(fee?.fields.find((f) => f.label === 'to (fee)')?.note).toBe('SolLock fee address');
    expect(memo?.fields[0]?.value).toBe('"sollock v1"');
  });

  it('warns about a foreign custodian', () => {
    const ix = getInitializeInstruction({
      stake: friend,
      arg0: { staker: friend, withdrawer: friend },
      arg1: { unixTimestamp: unlockAt, epoch: 0n, custodian: friend },
    });
    const custodian = decodeInstruction(ix).fields.find((f) => f.label === 'lockup.custodian');
    expect(custodian?.warning).toBe(true);
    expect(custodian?.note).toMatch(/unlock it early/);
  });

  it('marks anything unknown', () => {
    const decoded = decodeInstruction({ programAddress: friend, data: new Uint8Array([1, 2, 3]) });
    expect(decoded.unknown).toBe(true);
    expect(decoded.why).toMatch(/Do not sign/);
  });
});
