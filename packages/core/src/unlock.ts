import type { Address, Instruction, TransactionSigner } from '@solana/kit';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import {
  getDeactivateInstruction,
  getWithdrawInstruction,
  identifyStakeInstruction,
  parseDeactivateInstruction,
  parseWithdrawInstruction,
  StakeInstruction,
} from '@solana-program/stake';
import { STAKE_PROGRAM_ADDRESS } from './constants.ts';
import { type BlockhashLifetime, type FullInstruction, foreignSignerProblems, splitComputeBudget, transactionMessage } from './instructions.ts';
import type { LockView } from './stakeAccount.ts';
import type { VerifiableMessage } from './verify.ts';

export type UnlockAction = 'withdraw' | 'deactivate';

/**
 * Withdraw everything from an unlocked lock to `destination`. Taking the full balance closes the
 * account and returns the rent deposit too.
 */
export function withdrawAllInstruction(view: LockView, withdrawer: TransactionSigner, destination: Address): Instruction {
  if (!view.canWithdraw) throw new Error('This lock cannot be withdrawn yet.');
  if (view.withdrawer !== withdrawer.address) throw new Error('Only the withdraw authority can withdraw this lock.');
  return getWithdrawInstruction({ stake: view.address, recipient: destination, withdrawAuthority: withdrawer, args: view.lamports });
}

/** For a lock someone staked: stop staking, so it can be withdrawn after the cooldown. */
export function deactivateInstruction(view: LockView, staker: TransactionSigner): Instruction {
  if (!view.mustDeactivate) throw new Error('This lock is not staked.');
  if (view.staker !== staker.address) throw new Error('Only the stake authority can deactivate this lock.');
  return getDeactivateInstruction({ stake: view.address, stakeAuthority: staker });
}

/** The unlock as a v0 message from the wallet, with a compute-unit limit once the test run measured one. */
export function unlockTransactionMessage(instruction: Instruction, wallet: TransactionSigner, lifetime: BlockhashLifetime, units?: number) {
  const instructions = units === undefined ? [instruction] : [getSetComputeUnitLimitInstruction({ units }), instruction];
  return transactionMessage(wallet, lifetime, instructions);
}

export interface UnlockExpectation {
  action: UnlockAction;
  lock: Address;
  /** The connected wallet: the authority, the only signer, and for a withdraw the recipient. */
  wallet: Address;
  /** For a withdraw: the lock's whole balance, which closes the account. */
  lamports?: bigint;
}

export function verifyUnlockMessage(message: VerifiableMessage, expected: UnlockExpectation): string[] {
  const problems = message.feePayer.address === expected.wallet ? [] : ['Your wallet does not pay the network fee in it.'];
  return [...problems, ...verifyUnlockInstructions(message.instructions, expected)];
}

/**
 * Check a withdraw or deactivate before the wallet sees it: an optional compute-unit limit, then
 * exactly one Withdraw (everything, to the wallet) or Deactivate, signed only by the wallet and never
 * with a custodian. Returns plain-word problems; empty when it is exactly that.
 */
export function verifyUnlockInstructions(instructions: readonly Instruction[], expected: UnlockExpectation): string[] {
  const budget = splitComputeBudget(instructions);
  const problems = [...budget.problems, ...foreignSignerProblems(instructions, expected.wallet)];
  if (budget.rest.length !== 1) return [...problems, `Expected one ${expected.action} instruction, found ${budget.rest.length} instructions.`];

  const ix = budget.rest[0] as FullInstruction;
  if (ix.programAddress !== STAKE_PROGRAM_ADDRESS) return [...problems, 'The instruction is not for the Stake program.'];
  try {
    const check = expected.action === 'withdraw' ? checkWithdraw : checkDeactivate;
    return [...problems, ...check(ix, expected)];
  } catch {
    return [...problems, 'The instruction could not be read.'];
  }
}

function checkWithdraw(ix: FullInstruction, expected: UnlockExpectation): string[] {
  if (identifyStakeInstruction(ix) !== StakeInstruction.Withdraw) return ['The instruction is not a Withdraw.'];
  const { accounts, data } = parseWithdrawInstruction(ix);
  const problems: string[] = [];
  if (accounts.stake.address !== expected.lock) problems.push('It withdraws from a different account.');
  if (accounts.recipient.address !== expected.wallet) problems.push(`It sends the Solana to ${accounts.recipient.address}, not to your wallet.`);
  if (accounts.withdrawAuthority.address !== expected.wallet) problems.push('Your wallet is not the withdraw authority in it.');
  if (accounts.lockupAuthority) problems.push('It uses a custodian to get past the lockup.');
  if (expected.lamports !== undefined && data.args !== expected.lamports) {
    problems.push(`It withdraws ${data.args} lamports, not the whole ${expected.lamports}.`);
  }
  return problems;
}

function checkDeactivate(ix: FullInstruction, expected: UnlockExpectation): string[] {
  if (identifyStakeInstruction(ix) !== StakeInstruction.Deactivate) return ['The instruction is not a Deactivate.'];
  const { accounts } = parseDeactivateInstruction(ix);
  const problems: string[] = [];
  if (accounts.stake.address !== expected.lock) problems.push('It deactivates a different account.');
  if (accounts.stakeAuthority.address !== expected.wallet) problems.push('Your wallet is not the stake authority in it.');
  if (ix.accounts.length !== 2) problems.push('It lists unexpected accounts.');
  return problems;
}
