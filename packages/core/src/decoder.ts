import {
  type Address,
  compileTransaction,
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getUtf8Decoder,
  type Instruction,
  type ReadonlyUint8Array,
} from '@solana/kit';
import {
  ComputeBudgetInstruction,
  identifyComputeBudgetInstruction,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import {
  identifyStakeInstruction,
  parseDeactivateInstruction,
  parseInitializeInstruction,
  parseWithdrawInstruction,
  StakeInstruction,
} from '@solana-program/stake';
import {
  identifySystemInstruction,
  parseCreateAccountWithSeedInstruction,
  parseTransferSolInstruction,
  SystemInstruction,
} from '@solana-program/system';
import { type FullInstruction, withAccountsAndData } from './instructions.ts';
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
} from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';
import { formatSol } from './money.ts';
import { formatUtc } from './time.ts';

export interface DecodedField {
  label: string;
  value: string;
  note?: string;
  warning?: boolean;
}

export interface DecodedInstruction {
  program: string;
  name: string;
  why: string;
  fields: DecodedField[];
  /** The UI must refuse to sign when this is set. */
  unknown?: boolean;
}

export interface DecodeContext {
  feeAddress?: Address;
  wallet?: Address;
}

function addressNote(addr: Address, ctx: DecodeContext): DecodedField['note'] {
  if (ctx.wallet && addr === ctx.wallet) return 'your wallet';
  if (ctx.feeAddress && addr === ctx.feeAddress) return 'SolLock fee address';
  return undefined;
}

function field(label: string, value: string, note?: string, warning?: boolean): DecodedField {
  const f: DecodedField = { label, value };
  if (note !== undefined) f.note = note;
  if (warning) f.warning = true;
  return f;
}

function lamportsField(label: string, lamports: bigint): DecodedField {
  return field(label, `${lamports.toLocaleString('en-US')} lamports`, `${formatSol(lamports)} SOL`);
}

function unknownInstruction(ix: FullInstruction, program: string): DecodedInstruction {
  return {
    program,
    name: 'Unknown instruction',
    why: 'We do not recognise this. Do not sign a lock that contains it.',
    fields: [field('program', ix.programAddress), field('data', `${ix.data.length} bytes`)],
    unknown: true,
  };
}

export function decodeInstruction(instruction: Instruction, ctx: DecodeContext = {}): DecodedInstruction {
  const ix = withAccountsAndData(instruction);
  try {
    switch (ix.programAddress) {
      case COMPUTE_BUDGET_PROGRAM_ADDRESS:
        return decodeComputeBudget(ix);
      case SYSTEM_PROGRAM_ADDRESS:
        return decodeSystem(ix, ctx);
      case STAKE_PROGRAM_ADDRESS:
        return decodeStake(ix, ctx);
      case MEMO_PROGRAM_ADDRESS:
        return {
          program: 'Memo Program',
          name: 'Memo',
          why: 'A label so the lock is easy to recognise.',
          fields: [field('text', `"${getUtf8Decoder().decode(ix.data)}"`)],
        };
      default:
        return unknownInstruction(ix, 'Unknown program');
    }
  } catch {
    return unknownInstruction(ix, 'Unreadable instruction');
  }
}

function decodeComputeBudget(ix: FullInstruction): DecodedInstruction {
  const program = 'Compute Budget Program';
  switch (identifyComputeBudgetInstruction(ix)) {
    case ComputeBudgetInstruction.SetComputeUnitLimit:
      return {
        program,
        name: 'SetComputeUnitLimit',
        why: 'Caps how much computing this transaction may use. Standard on Solana.',
        fields: [field('units', parseSetComputeUnitLimitInstruction(ix).data.units.toLocaleString('en-US'))],
      };
    case ComputeBudgetInstruction.SetComputeUnitPrice:
      return {
        program,
        name: 'SetComputeUnitPrice',
        why: 'A priority fee for the network, usually added by your wallet.',
        fields: [field('micro-lamports per unit', parseSetComputeUnitPriceInstruction(ix).data.microLamports.toString())],
      };
    default:
      return unknownInstruction(ix, program);
  }
}

function decodeSystem(ix: FullInstruction, ctx: DecodeContext): DecodedInstruction {
  const program = 'System Program';
  switch (identifySystemInstruction(ix)) {
    case SystemInstruction.CreateAccountWithSeed: {
      const { accounts, data } = parseCreateAccountWithSeedInstruction(ix);
      return {
        program,
        name: 'CreateAccountWithSeed',
        why: "Creates your lock account, owned by Solana's stake program.",
        fields: [
          field('from (pays)', accounts.payer.address, addressNote(accounts.payer.address, ctx)),
          field('base', data.base, addressNote(data.base, ctx)),
          field('seed', `"${data.seed}"`),
          field('new account', accounts.newAccount.address),
          lamportsField('lamports', data.amount),
          field('space', `${data.space} bytes`),
          field('owner', data.programAddress, data.programAddress === STAKE_PROGRAM_ADDRESS ? 'Stake program' : 'not the Stake program', data.programAddress !== STAKE_PROGRAM_ADDRESS),
        ],
      };
    }
    case SystemInstruction.TransferSol: {
      const { accounts, data } = parseTransferSolInstruction(ix);
      const isFee = ctx.feeAddress !== undefined && accounts.destination.address === ctx.feeAddress;
      return {
        program,
        name: 'Transfer',
        why: isFee ? 'Our fee. Nothing else goes to us.' : 'Sends Solana.',
        fields: [
          field('from', accounts.source.address, addressNote(accounts.source.address, ctx)),
          field(isFee ? 'to (fee)' : 'to', accounts.destination.address, addressNote(accounts.destination.address, ctx)),
          lamportsField('lamports', data.amount),
        ],
      };
    }
    default:
      return unknownInstruction(ix, program);
  }
}

function decodeStake(ix: FullInstruction, ctx: DecodeContext): DecodedInstruction {
  const program = 'Stake Program';
  switch (identifyStakeInstruction(ix)) {
    case StakeInstruction.Initialize: {
      const { data } = parseInitializeInstruction(ix);
      const { staker, withdrawer } = data.arg0;
      const { unixTimestamp, epoch, custodian } = data.arg1;
      const ours = custodian === CUSTODIAN_ADDRESS;
      return {
        program,
        name: 'Initialize',
        why: 'Sets who may withdraw, and the lockup. This is the lock.',
        fields: [
          field('staker', staker, addressNote(staker, ctx)),
          field('withdrawer', withdrawer, addressNote(withdrawer, ctx)),
          field('lockup.unix_timestamp', unixTimestamp.toString(), formatUtc(unixTimestamp)),
          field('lockup.epoch', epoch.toString(), epoch === 0n ? 'date only' : 'also waits for this epoch', epoch !== 0n),
          field('lockup.custodian', custodian, ours ? 'off-curve, nobody has a key' : 'this address could unlock it early', !ours),
        ],
      };
    }
    case StakeInstruction.Withdraw: {
      const { accounts, data } = parseWithdrawInstruction(ix);
      return {
        program,
        name: 'Withdraw',
        why: 'Takes the Solana out of the lock. Works only after the date.',
        fields: [
          field('stake account', accounts.stake.address),
          field('to', accounts.recipient.address, addressNote(accounts.recipient.address, ctx)),
          field('withdraw authority', accounts.withdrawAuthority.address, addressNote(accounts.withdrawAuthority.address, ctx)),
          lamportsField('lamports', data.args),
        ],
      };
    }
    case StakeInstruction.Deactivate: {
      const { accounts } = parseDeactivateInstruction(ix);
      return {
        program,
        name: 'Deactivate',
        why: 'Stops staking, so the Solana can be withdrawn after about one epoch. The lock stays.',
        fields: [
          field('stake account', accounts.stake.address),
          field('stake authority', accounts.stakeAuthority.address, addressNote(accounts.stakeAuthority.address, ctx)),
        ],
      };
    }
    default:
      return unknownInstruction(ix, program);
  }
}

function decompileMessageBytes(messageBytes: ReadonlyUint8Array) {
  const message = decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(messageBytes));
  const instructions: readonly Instruction[] = message.instructions;
  return { ...message, instructions };
}

/** Verify the decompiled bytes, not the built message, so the check covers exactly what gets signed. */
export function roundTripMessage(message: Parameters<typeof compileTransaction>[0]) {
  return decompileMessageBytes(compileTransaction(message).messageBytes);
}
