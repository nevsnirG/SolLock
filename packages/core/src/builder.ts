import { type Address, type Instruction, isAddress, type TransactionSigner } from '@solana/kit';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { getAddMemoInstruction } from '@solana-program/memo';
import { getInitializeInstruction } from '@solana-program/stake';
import { getCreateAccountWithSeedInstruction, getTransferSolInstruction } from '@solana-program/system';
import {
  LAMPORTS_PER_SOL,
  LOCK_MEMO,
  MAX_LOCK_COMPUTE_UNITS,
  MAX_LOCK_RENT,
  MEMO_PROGRAM_ADDRESS,
  STAKE_ACCOUNT_SPACE,
  STAKE_PROGRAM_ADDRESS,
} from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';
import { isTestLock, lockFee, vatShare } from './fee.ts';
import { giftAddressProblem } from './gift.ts';
import { type BlockhashLifetime, transactionMessage } from './instructions.ts';
import { formatSol } from './money.ts';
import { lockAddress, lockSeed } from './seeds.ts';
import { type UnixSeconds, unlockTimeProblem } from './time.ts';
import { type LockExpectation, verifyLockInstructions } from './verify.ts';

export const MIN_LOCK_AMOUNT = LAMPORTS_PER_SOL / 1_000n;
export const MIN_LOCK_AMOUNT_PROBLEM = 'The smallest lock is 0.001 SOL.';

/** A request the builder refuses. The message is for the user. */
export class LockRequestError extends Error {
  override name = 'LockRequestError';
}

export interface LockRequest {
  /** The connected wallet. It pays, is the base of the seed address, and is the only signer. */
  funder: TransactionSigner;
  /** For a gift: the recipient's wallet. Leave out to lock for yourself. */
  recipient?: Address | undefined;
  /** Lamports to lock, not counting the rent deposit. */
  amount: bigint;
  unlockAt: UnixSeconds;
  /** The `n` in `sl1-<n>`; the first free one for this wallet. */
  seedIndex: number;
  /** Rent-exempt minimum for a 200-byte account, read from the network. */
  rent: bigint;
  feeAddress: Address;
  now: UnixSeconds;
  /** From the simulation. Left out, the transaction has no compute-budget instruction. */
  computeUnitLimit?: number | undefined;
}

export interface LockPlan {
  signer: TransactionSigner;
  funder: Address;
  /** Staker and withdrawer: the funder, or the recipient of a gift. */
  withdrawer: Address;
  gift: boolean;
  lockAddress: Address;
  seed: string;
  amount: bigint;
  rent: bigint;
  fee: bigint;
  /** The VAT inside the fee. */
  vat: bigint;
  testLock: boolean;
  unlockAt: UnixSeconds;
  computeUnitLimit: number | undefined;
  /** What leaves the wallet before the network fee: amount, rent deposit and our fee. */
  total: bigint;
  instructions: readonly Instruction[];
  /** What the transaction must contain, for {@link verifyLockMessage} after a round trip. */
  expectation: LockExpectation;
}

/**
 * Check a lock request and build its instructions. The custodian is always the published one; there
 * is no way to pass another. The result is checked by the same verifier the preview uses.
 */
export async function planLock(req: LockRequest): Promise<LockPlan> {
  const { withdrawer, seed, units } = validateLockRequest(req);
  const funder = req.funder.address;
  const testLock = isTestLock(req.amount, req.unlockAt, req.now);
  const fee = lockFee(req.amount, testLock);
  const address = await lockAddress(funder, req.seedIndex);
  const instructions = lockInstructions(req, { address, seed, withdrawer, fee, units });

  const expectation: LockExpectation = {
    funder,
    withdrawer,
    amount: req.amount,
    unlockAt: req.unlockAt,
    seedIndex: req.seedIndex,
    rent: req.rent,
    feeAddress: req.feeAddress,
    now: req.now,
  };
  const problems = await verifyLockInstructions(instructions, expectation);
  if (problems.length > 0) throw new Error(`The built lock failed its own check: ${problems.join(' ')}`);

  return {
    signer: req.funder,
    funder,
    withdrawer,
    gift: withdrawer !== funder,
    lockAddress: address,
    seed,
    amount: req.amount,
    rent: req.rent,
    fee,
    vat: vatShare(fee),
    testLock,
    unlockAt: req.unlockAt,
    computeUnitLimit: units,
    total: req.amount + req.rent + fee,
    instructions,
    expectation,
  };
}

function validateLockRequest(req: LockRequest): { withdrawer: Address; seed: string; units: number | undefined } {
  const funder = req.funder.address;
  if (req.amount < MIN_LOCK_AMOUNT) throw new LockRequestError(MIN_LOCK_AMOUNT_PROBLEM);

  const timeProblem = unlockTimeProblem(req.unlockAt, req.now);
  if (timeProblem) throw new LockRequestError(timeProblem);

  if (!isAddress(req.feeAddress) || req.feeAddress === CUSTODIAN_ADDRESS) {
    throw new LockRequestError('The fee address in the configuration is not valid.');
  }

  const giftProblem = req.recipient === undefined ? null : giftAddressProblem(req.recipient, { funder, feeAddress: req.feeAddress });
  if (giftProblem) throw new LockRequestError(giftProblem);

  let seed: string;
  try {
    seed = lockSeed(req.seedIndex);
  } catch (e) {
    throw new LockRequestError((e as Error).message);
  }

  if (req.rent <= 0n || req.rent > MAX_LOCK_RENT) {
    throw new LockRequestError(`The network reported a rent deposit of ${formatSol(req.rent)} SOL, which can't be right. Nothing was built.`);
  }

  const units = req.computeUnitLimit;
  if (units !== undefined && (!Number.isInteger(units) || units < 1 || units > MAX_LOCK_COMPUTE_UNITS)) {
    throw new LockRequestError(`Compute-unit limit must be 1 to ${MAX_LOCK_COMPUTE_UNITS}.`);
  }
  return { withdrawer: req.recipient ?? funder, seed, units };
}

interface LockParts {
  address: Address;
  seed: string;
  withdrawer: Address;
  fee: bigint;
  units: number | undefined;
}

function lockInstructions(req: LockRequest, { address, seed, withdrawer, fee, units }: LockParts): Instruction[] {
  const instructions: Instruction[] = [];
  if (units !== undefined) instructions.push(getSetComputeUnitLimitInstruction({ units }));
  instructions.push(
    getCreateAccountWithSeedInstruction({
      payer: req.funder,
      newAccount: address,
      base: req.funder.address,
      seed,
      amount: req.amount + req.rent,
      space: STAKE_ACCOUNT_SPACE,
      programAddress: STAKE_PROGRAM_ADDRESS,
    }),
    getInitializeInstruction({
      stake: address,
      arg0: { staker: withdrawer, withdrawer },
      arg1: { unixTimestamp: req.unlockAt, epoch: 0n, custodian: CUSTODIAN_ADDRESS },
    }),
  );
  if (fee > 0n) instructions.push(getTransferSolInstruction({ source: req.funder, destination: req.feeAddress, amount: fee }));
  instructions.push(getAddMemoInstruction({ memo: LOCK_MEMO }, { programAddress: MEMO_PROGRAM_ADDRESS }));
  return instructions;
}

/** The plan as a v0 transaction message, paid for and signed by the funder only. */
export function lockTransactionMessage(plan: LockPlan, lifetime: BlockhashLifetime) {
  return transactionMessage(plan.signer, lifetime, plan.instructions);
}
