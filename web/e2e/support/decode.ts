import {
  type Address,
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Instruction,
} from '@solana/kit';
import {
  identifyStakeInstruction,
  parseInitializeInstruction,
  parseWithdrawInstruction,
  STAKE_PROGRAM_ADDRESS,
  StakeInstruction,
} from '@solana-program/stake';
import {
  identifySystemInstruction,
  parseCreateAccountWithSeedInstruction,
  parseTransferSolInstruction,
  SYSTEM_PROGRAM_ADDRESS,
  SystemInstruction,
} from '@solana-program/system';

const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/** Reads wire bytes with Solana's own decoders and program parsers, none of the site's code. */
export function readTransaction(wire: Uint8Array) {
  const { messageBytes, signatures } = getTransactionDecoder().decode(wire);
  const message = decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(messageBytes));
  return { feePayer: message.feePayer.address, signers: Object.keys(signatures), instructions: message.instructions as readonly Instruction[] };
}

export const isSystem = (ix: Instruction, kind: SystemInstruction) =>
  ix.programAddress === SYSTEM_PROGRAM_ADDRESS && ix.data !== undefined && identifySystemInstruction(ix.data) === kind;
export const isStake = (ix: Instruction, kind: StakeInstruction) =>
  ix.programAddress === STAKE_PROGRAM_ADDRESS && ix.data !== undefined && identifyStakeInstruction(ix.data) === kind;

/** What a lock transaction does, in the terms the user chose. */
export function readLock(wire: Uint8Array) {
  const tx = readTransaction(wire);
  const create = tx.instructions.find((ix) => isSystem(ix, SystemInstruction.CreateAccountWithSeed));
  const init = tx.instructions.find((ix) => isStake(ix, StakeInstruction.Initialize));
  if (!create || !init) throw new Error('Not a lock transaction');
  const created = parseCreateAccountWithSeedInstruction(create as never);
  const initialized = parseInitializeInstruction(init as never);
  const transfers = tx.instructions.filter((ix) => isSystem(ix, SystemInstruction.TransferSol)).map((ix) => parseTransferSolInstruction(ix as never));
  const memo = tx.instructions.find((ix) => ix.programAddress === MEMO_PROGRAM);
  return {
    feePayer: tx.feePayer,
    signers: tx.signers,
    programs: tx.instructions.map((ix) => ix.programAddress),
    lockAddress: created.accounts.newAccount.address,
    payer: created.accounts.payer.address,
    seed: created.data.seed,
    lamports: created.data.amount,
    owner: created.data.programAddress,
    staker: initialized.data.arg0.staker,
    withdrawer: initialized.data.arg0.withdrawer,
    unlockAt: initialized.data.arg1.unixTimestamp,
    epoch: initialized.data.arg1.epoch,
    custodian: initialized.data.arg1.custodian,
    payments: transfers.map((t) => ({ from: t.accounts.source.address, to: t.accounts.destination.address, lamports: t.data.amount })),
    memo: memo ? new TextDecoder().decode(memo.data) : null,
  };
}

/** What a withdrawal transaction does. */
export function readWithdrawal(wire: Uint8Array): { from: Address; to: Address; lamports: bigint; signers: string[] } {
  const tx = readTransaction(wire);
  const withdraw = tx.instructions.find((ix) => isStake(ix, StakeInstruction.Withdraw));
  if (!withdraw) throw new Error('Not a withdrawal');
  const { accounts, data } = parseWithdrawInstruction(withdraw as never);
  return { from: accounts.stake.address, to: accounts.recipient.address, lamports: data.args, signers: tx.signers };
}
