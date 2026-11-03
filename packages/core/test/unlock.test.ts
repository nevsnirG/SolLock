import { type Address, generateKeyPairSigner, type Instruction, type TransactionSigner } from '@solana/kit';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { getWithdrawInstruction } from '@solana-program/stake';
import { getTransferSolInstruction } from '@solana-program/system';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  deactivateInstruction,
  type LockView,
  verifyUnlockInstructions,
  withdrawAllInstruction,
} from '../src/index.ts';

let wallet: TransactionSigner;
let other: TransactionSigner;
let lock: Address;

beforeAll(async () => {
  wallet = await generateKeyPairSigner();
  other = await generateKeyPairSigner();
  lock = (await generateKeyPairSigner()).address;
});

const due = (): LockView => ({
  address: lock,
  state: 'initialized',
  lamports: 11_666_240n,
  lockedAmount: 10_000_000n,
  staker: wallet.address,
  withdrawer: wallet.address,
  lockedNow: false,
  canWithdraw: true,
  mustDeactivate: false,
});

const withdrawExp = () => ({ action: 'withdraw' as const, lock, wallet: wallet.address, lamports: 11_666_240n });

describe('building an unlock', () => {
  it('withdraws everything, to the wallet, once the lock is due', () => {
    expect(verifyUnlockInstructions([withdrawAllInstruction(due(), wallet, wallet.address)], withdrawExp())).toEqual([]);
  });

  it('refuses before the date, or for anyone but the withdrawer', () => {
    expect(() => withdrawAllInstruction({ ...due(), lockedNow: true, canWithdraw: false }, wallet, wallet.address)).toThrow(/cannot be withdrawn yet/);
    expect(() => withdrawAllInstruction(due(), other, other.address)).toThrow(/Only the withdraw authority/);
  });

  it('deactivates only a staked lock, by its staker', () => {
    const staked = { ...due(), state: 'staked' as const, mustDeactivate: true, canWithdraw: false };
    const ix = deactivateInstruction(staked, wallet);
    expect(verifyUnlockInstructions([ix], { action: 'deactivate', lock, wallet: wallet.address })).toEqual([]);
    expect(() => deactivateInstruction(due(), wallet)).toThrow(/not staked/);
    expect(() => deactivateInstruction(staked, other)).toThrow(/Only the stake authority/);
  });
});

describe('checking an unlock before signing', () => {
  const withdraw = (input: Partial<Parameters<typeof getWithdrawInstruction>[0]> = {}) =>
    getWithdrawInstruction({ stake: lock, recipient: wallet.address, withdrawAuthority: wallet, args: 11_666_240n, ...input });

  it('accepts a compute-unit limit in front', () => {
    expect(verifyUnlockInstructions([getSetComputeUnitLimitInstruction({ units: 5_000 }), withdraw()], withdrawExp())).toEqual([]);
  });

  it('refuses SOL going anywhere but the wallet', () => {
    expect(verifyUnlockInstructions([withdraw({ recipient: other.address })], withdrawExp()).join(' ')).toMatch(/not to your wallet/);
  });

  it('refuses a custodian getting past the lockup', () => {
    expect(verifyUnlockInstructions([withdraw({ lockupAuthority: other })], withdrawExp()).join(' ')).toMatch(/custodian/);
  });

  it('refuses a partial withdraw, extra instructions and extra signers', () => {
    expect(verifyUnlockInstructions([withdraw({ args: 1n })], withdrawExp()).join(' ')).toMatch(/not the whole/);
    const extra: Instruction = getTransferSolInstruction({ source: wallet, destination: other.address, amount: 1n });
    expect(verifyUnlockInstructions([withdraw(), extra], withdrawExp())).toEqual(['Expected one withdraw instruction, found 2 instructions.']);
    expect(verifyUnlockInstructions([withdraw({ withdrawAuthority: other })], withdrawExp()).join(' ')).toMatch(/would have to sign/);
  });

  it('refuses the wrong kind of instruction and a compute limit that is too high', () => {
    const staked = { ...due(), state: 'staked' as const, mustDeactivate: true };
    expect(verifyUnlockInstructions([deactivateInstruction(staked, wallet)], withdrawExp())).toEqual(['The instruction is not a Withdraw.']);
    expect(verifyUnlockInstructions([getSetComputeUnitLimitInstruction({ units: 1_400_000 }), withdraw()], withdrawExp())).toEqual([
      'Compute-unit limit 1400000 is out of range.',
    ]);
  });
});
