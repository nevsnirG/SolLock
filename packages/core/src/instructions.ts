import {
  type AccountMeta,
  type Address,
  appendTransactionMessageInstructions,
  type Blockhash,
  createTransactionMessage,
  type Instruction,
  isSignerRole,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type TransactionSigner,
} from '@solana/kit';
import {
  ComputeBudgetInstruction,
  identifyComputeBudgetInstruction,
  parseSetComputeUnitLimitInstruction,
} from '@solana-program/compute-budget';
import { COMPUTE_BUDGET_PROGRAM_ADDRESS, MAX_LOCK_COMPUTE_UNITS } from './constants.ts';

export type FullInstruction = Instruction & { accounts: readonly AccountMeta[]; data: Uint8Array };

export function withAccountsAndData(ix: Instruction): FullInstruction {
  return { ...ix, accounts: ix.accounts ?? [], data: (ix.data ?? new Uint8Array()) as Uint8Array };
}

export interface BlockhashLifetime {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}

/** A v0 transaction message, paid for by `feePayer`. */
export function transactionMessage(feePayer: TransactionSigner, lifetime: BlockhashLifetime, instructions: readonly Instruction[]) {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
}

export function foreignSignerProblems(instructions: readonly Instruction[], wallet: Address): string[] {
  const foreign = new Set<Address>();
  for (const ix of instructions) {
    for (const meta of ix.accounts ?? []) if (isSignerRole(meta.role) && meta.address !== wallet) foreign.add(meta.address);
  }
  return [...foreign].map((signer) => `${signer} would have to sign. Only your wallet should.`);
}

/**
 * Splits off an optional leading compute-unit limit and checks it. The rest are the instructions
 * that do the work.
 */
export function splitComputeBudget(instructions: readonly Instruction[]): { problems: string[]; rest: FullInstruction[] } {
  const list = instructions.map(withAccountsAndData);
  const first = list[0];
  if (first?.programAddress !== COMPUTE_BUDGET_PROGRAM_ADDRESS) return { problems: [], rest: list };
  return { problems: computeUnitLimitProblems(first), rest: list.slice(1) };
}

function computeUnitLimitProblems(ix: FullInstruction): string[] {
  try {
    if (identifyComputeBudgetInstruction(ix) !== ComputeBudgetInstruction.SetComputeUnitLimit) {
      return ['The compute-budget instruction is not a compute-unit limit.'];
    }
    const { units } = parseSetComputeUnitLimitInstruction(ix).data;
    return units < 1 || units > MAX_LOCK_COMPUTE_UNITS ? [`Compute-unit limit ${units} is out of range.`] : [];
  } catch {
    return ['The compute-budget instruction could not be read.'];
  }
}
