import { type Address, getUtf8Decoder, type Instruction, isWritableRole } from '@solana/kit';
import { identifyStakeInstruction, parseInitializeInstruction, StakeInstruction } from '@solana-program/stake';
import {
  identifySystemInstruction,
  parseCreateAccountWithSeedInstruction,
  parseTransferSolInstruction,
  SystemInstruction,
} from '@solana-program/system';
import {
  LOCK_MEMO,
  MAX_LOCK_RENT,
  MEMO_PROGRAM_ADDRESS,
  STAKE_ACCOUNT_SPACE,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
} from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';
import { isTestLock, lockFee } from './fee.ts';
import { type FullInstruction, foreignSignerProblems, splitComputeBudget } from './instructions.ts';
import { lockAddress, lockSeed } from './seeds.ts';
import type { UnixSeconds } from './time.ts';

/** What the user asked for. The verifier derives everything else (address, seed, fee) itself. */
export interface LockExpectation {
  funder: Address;
  withdrawer: Address;
  amount: bigint;
  unlockAt: UnixSeconds;
  seedIndex: number;
  rent: bigint;
  feeAddress: Address;
  now: UnixSeconds;
}

/** The parts of a transaction message the verifier reads. */
export interface VerifiableMessage {
  feePayer: { address: Address };
  instructions: readonly Instruction[];
}

/**
 * Check a whole message: the fee payer, the signers and every instruction. Returns plain-words
 * problems; an empty list means the message is exactly the lock the user asked for.
 */
export async function verifyLockMessage(message: VerifiableMessage, expected: LockExpectation): Promise<string[]> {
  const problems = message.feePayer.address === expected.funder ? [] : [`The fee payer is ${message.feePayer.address}, not your wallet.`];
  return [...problems, ...(await verifyLockInstructions(message.instructions, expected))];
}

/**
 * Check the instructions of a lock, field by field: compute budget (optional), CreateAccountWithSeed,
 * Initialize with the published custodian and epoch 0, the fee transfer (unless it is a free test
 * lock), and the memo. Nothing else may be present, and only the funder may sign.
 */
export async function verifyLockInstructions(instructions: readonly Instruction[], expected: LockExpectation): Promise<string[]> {
  const problems = foreignSignerProblems(instructions, expected.funder);
  if (expected.rent <= 0n || expected.rent > MAX_LOCK_RENT) problems.push(`A rent deposit of ${expected.rent} lamports is out of range.`);
  const seed = lockSeed(expected.seedIndex);
  const address = await lockAddress(expected.funder, expected.seedIndex);
  const fee = lockFee(expected.amount, isTestLock(expected.amount, expected.unlockAt, expected.now));

  const budget = splitComputeBudget(instructions);
  problems.push(...budget.problems);
  const count = fee > 0n ? 4 : 3;
  if (budget.rest.length !== count) return [...problems, `Expected ${count} lock instructions, found ${budget.rest.length}.`];

  const [create, init, ...tail] = budget.rest as [FullInstruction, FullInstruction, ...FullInstruction[]];
  const memo = tail.at(-1) as FullInstruction;
  checkCreate(create, expected, address, seed, problems);
  checkInitialize(init, expected, address, problems);
  if (fee > 0n) checkFee(tail[0] as FullInstruction, expected, fee, problems);
  checkMemo(memo, problems);
  return problems;
}

function checkCreate(ix: FullInstruction, expected: LockExpectation, address: Address, seed: string, problems: string[]) {
  if (ix.programAddress !== SYSTEM_PROGRAM_ADDRESS) {
    problems.push('Instruction 1 should create the lock account with the System program.');
    return;
  }
  try {
    if (identifySystemInstruction(ix) !== SystemInstruction.CreateAccountWithSeed) {
      problems.push('Instruction 1 is not CreateAccountWithSeed.');
      return;
    }
    const { accounts, data } = parseCreateAccountWithSeedInstruction(ix);
    if (accounts.payer.address !== expected.funder || !isWritableRole(accounts.payer.role)) {
      problems.push('The lock account is not paid for by your wallet.');
    }
    if (accounts.newAccount.address !== address) problems.push(`The lock account should be ${address}.`);
    if (accounts.baseAccount && accounts.baseAccount.address !== expected.funder) {
      problems.push('The lock address is not derived from your wallet.');
    }
    if (data.base !== expected.funder) problems.push('The lock address is not derived from your wallet.');
    if (data.seed !== seed) problems.push(`The seed should be "${seed}".`);
    if (data.amount !== expected.amount + expected.rent) problems.push('The amount in the lock is not what you entered plus the rent deposit.');
    if (data.space !== STAKE_ACCOUNT_SPACE) problems.push('The lock account has the wrong size.');
    if (data.programAddress !== STAKE_PROGRAM_ADDRESS) problems.push('The lock account is not owned by the Stake program.');
  } catch {
    problems.push('Instruction 1 could not be read.');
  }
}

function checkInitialize(ix: FullInstruction, expected: LockExpectation, address: Address, problems: string[]) {
  if (ix.programAddress !== STAKE_PROGRAM_ADDRESS) {
    problems.push('Instruction 2 should set the lockup with the Stake program.');
    return;
  }
  try {
    if (identifyStakeInstruction(ix) !== StakeInstruction.Initialize) {
      problems.push('Instruction 2 is not Stake Initialize, so it would set no lockup.');
      return;
    }
    if (ix.accounts.length !== 1) problems.push('Stake Initialize lists unexpected accounts.');
    const { accounts, data } = parseInitializeInstruction(ix);
    if (accounts.stake.address !== address) problems.push('Stake Initialize targets a different account.');
    if (data.arg0.staker !== expected.withdrawer) problems.push(`The stake authority should be ${expected.withdrawer}.`);
    if (data.arg0.withdrawer !== expected.withdrawer) problems.push(`The withdraw authority should be ${expected.withdrawer}.`);
    if (data.arg1.unixTimestamp !== expected.unlockAt) problems.push('The lockup date is not the date you picked.');
    if (data.arg1.epoch !== 0n) problems.push('The lockup epoch must be 0.');
    if (data.arg1.custodian !== CUSTODIAN_ADDRESS) {
      problems.push(`The custodian is ${data.arg1.custodian}, not the published address nobody has a key for. Someone could unlock it early.`);
    }
  } catch {
    problems.push('Instruction 2 could not be read.');
  }
}

function checkFee(ix: FullInstruction, expected: LockExpectation, fee: bigint, problems: string[]) {
  if (ix.programAddress !== SYSTEM_PROGRAM_ADDRESS) {
    problems.push('Instruction 3 should be the fee transfer.');
    return;
  }
  try {
    if (identifySystemInstruction(ix) !== SystemInstruction.TransferSol) {
      problems.push('Instruction 3 is not a transfer.');
      return;
    }
    const { accounts, data } = parseTransferSolInstruction(ix);
    if (accounts.source.address !== expected.funder) problems.push('The fee is not paid from your wallet.');
    if (accounts.destination.address !== expected.feeAddress) problems.push(`The fee goes to ${accounts.destination.address}, not our fee address.`);
    if (data.amount !== fee) problems.push(`The fee should be ${fee} lamports, not ${data.amount}.`);
  } catch {
    problems.push('Instruction 3 could not be read.');
  }
}

function checkMemo(ix: FullInstruction, problems: string[]) {
  if (ix.programAddress !== MEMO_PROGRAM_ADDRESS) {
    problems.push('The last instruction should be the memo, on the classic Memo program.');
    return;
  }
  if (ix.accounts.length !== 0) problems.push('The memo lists unexpected accounts.');
  if (utf8OrNull(ix.data) !== LOCK_MEMO) problems.push(`The memo should read "${LOCK_MEMO}".`);
}

function utf8OrNull(bytes: Uint8Array): string | null {
  try {
    return getUtf8Decoder().decode(bytes);
  } catch {
    return null;
  }
}
