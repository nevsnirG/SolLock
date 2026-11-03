import {
  type Address,
  getBase58Encoder,
  getBase64Decoder,
  getBase64Encoder,
  type Instruction,
} from '@solana/kit';
import { getStakeStateAccountEncoder, parseInitializeInstruction, parseWithdrawInstruction, STAKE_PROGRAM_ADDRESS, StakeInstruction } from '@solana-program/stake';
import { parseCreateAccountWithSeedInstruction, parseTransferSolInstruction, SystemInstruction } from '@solana-program/system';
import { parseRequest } from '../../../worker/src/rules.ts';
import { isStake, isSystem, readTransaction } from './decode.ts';

export const CUSTODIAN = 'EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav' as Address;
export const LOCK_RENT = 1_666_240n;
const STAKE_ACCOUNT_SPACE = 200;
const LOCKUP_IN_FORCE = { InstructionError: [1, { Custom: 1 }] };

interface Account {
  lamports: bigint;
  owner: Address;
  data: Uint8Array;
}

export interface LockOnChain {
  address: Address;
  withdrawer: Address;
  staker?: Address;
  unlockAt: bigint;
  locked: bigint;
}

/**
 * A small stand-in for Solana devnet. It answers the site's RPC calls, but only those the Worker's own
 * rules would let through, and it carries out the transactions the test wallet sends.
 */
export class FakeChain {
  private readonly accounts = new Map<string, Account>();
  private readonly balances = new Map<string, bigint>();
  private readonly confirmed = new Set<string>();
  /** Every RPC method the site called, in order. */
  readonly calls: string[] = [];
  /** Seconds since 1970 by the network's clock, for the lockup check on withdrawals. */
  clock = BigInt(Date.UTC(2026, 10, 1, 14, 30) / 1000);

  fund(owner: Address, lamports: bigint) {
    this.balances.set(owner, lamports);
  }

  balanceOf(owner: Address): bigint {
    return this.balances.get(owner) ?? 0n;
  }

  account(address: Address): Account | undefined {
    return this.accounts.get(address);
  }

  ownedBy(address: Address, program: Address) {
    this.accounts.set(address, { lamports: 2_039_280n, owner: program, data: new Uint8Array(165) });
  }

  addLock(lock: LockOnChain) {
    this.accounts.set(lock.address, {
      lamports: lock.locked + LOCK_RENT,
      owner: STAKE_PROGRAM_ADDRESS,
      data: stakeAccountData(lock.staker ?? lock.withdrawer, lock.withdrawer, lock.unlockAt),
    });
  }

  /** Answers one JSON-RPC request body, as the Worker plus a provider would. */
  answer(body: string): unknown {
    const { request } = parseRequest(body);
    this.calls.push(request.method);
    return { jsonrpc: '2.0', id: request.id, result: this.result(request.method, request.params) };
  }

  /** Carries out a signed transaction from the test wallet, like a validator would. */
  execute(wire: Uint8Array, signature: string) {
    const { instructions } = readTransaction(wire);
    const lockupError = this.lockupProblem(instructions);
    if (lockupError) throw new Error('The network refused it: the lockup is still in force.');
    for (const ix of instructions) this.apply(ix);
    this.confirmed.add(signature);
  }

  private result(method: string, params: unknown[]): unknown {
    const context = { slot: 1 };
    switch (method) {
      case 'getMinimumBalanceForRentExemption':
        return Number(LOCK_RENT);
      case 'getBalance':
        return { context, value: Number(this.balanceOf(params[0] as Address)) };
      case 'getLatestBlockhash':
        return { context, value: { blockhash: '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn', lastValidBlockHeight: 1_000 } };
      case 'getEpochInfo':
        return { absoluteSlot: 1, blockHeight: 900, epoch: 1_198, slotIndex: 0, slotsInEpoch: 432_000, transactionCount: null };
      case 'getAccountInfo':
        return { context, value: this.encoded(params[0] as string) };
      case 'getMultipleAccounts':
        return { context, value: (params[0] as string[]).map((a) => this.encoded(a)) };
      case 'getProgramAccounts':
        return this.programAccounts(params[0] as string, (params[1] as { filters: Filter[] }).filters);
      case 'simulateTransaction':
        return { context, value: this.simulate(params[0] as string) };
      case 'getSignatureStatuses':
        return { context, value: (params[0] as string[]).map((s) => (this.confirmed.has(s) ? { slot: 1, confirmations: null, err: null, confirmationStatus: 'confirmed' } : null)) };
      case 'getRecentPrioritizationFees':
        return [];
      default:
        throw new Error(`The fake chain does not answer ${method}`);
    }
  }

  private simulate(base64: string) {
    const { instructions } = readTransaction(new Uint8Array(getBase64Encoder().encode(base64)));
    const err = this.lockupProblem(instructions) ? LOCKUP_IN_FORCE : null;
    return { err, logs: ['Program log: test run'], unitsConsumed: 14_000, accounts: null, returnData: null };
  }

  private lockupProblem(instructions: readonly Instruction[]): boolean {
    return instructions.some((ix) => {
      if (!isStake(ix, StakeInstruction.Withdraw)) return false;
      const lock = this.accounts.get(parseWithdrawInstruction(ix as never).accounts.stake.address);
      return lock !== undefined && unlockTimeOf(lock.data) > this.clock;
    });
  }

  private apply(ix: Instruction) {
    if (isSystem(ix, SystemInstruction.CreateAccountWithSeed)) {
      const { accounts, data } = parseCreateAccountWithSeedInstruction(ix as never);
      this.move(accounts.payer.address, data.amount);
      this.accounts.set(accounts.newAccount.address, { lamports: data.amount, owner: data.programAddress, data: new Uint8Array(Number(data.space)) });
    }
    if (isSystem(ix, SystemInstruction.TransferSol)) {
      const { accounts, data } = parseTransferSolInstruction(ix as never);
      this.move(accounts.source.address, data.amount, accounts.destination.address);
    }
    if (isStake(ix, StakeInstruction.Initialize)) {
      const { accounts, data } = parseInitializeInstruction(ix as never);
      const account = this.accounts.get(accounts.stake.address)!;
      account.data = stakeAccountData(data.arg0.staker, data.arg0.withdrawer, data.arg1.unixTimestamp, data.arg1.custodian);
    }
    if (isStake(ix, StakeInstruction.Withdraw)) {
      const { accounts, data } = parseWithdrawInstruction(ix as never);
      const lock = this.accounts.get(accounts.stake.address)!;
      lock.lamports -= data.args;
      this.balances.set(accounts.recipient.address, this.balanceOf(accounts.recipient.address) + data.args);
      if (lock.lamports === 0n) this.accounts.delete(accounts.stake.address);
    }
  }

  private move(from: Address, lamports: bigint, to?: Address) {
    this.balances.set(from, this.balanceOf(from) - lamports);
    if (to) this.balances.set(to, this.balanceOf(to) + lamports);
  }

  private encoded(address: string) {
    const account = this.accounts.get(address);
    if (!account) return null;
    return {
      data: [getBase64Decoder().decode(account.data), 'base64'],
      executable: false,
      lamports: Number(account.lamports),
      owner: account.owner,
      rentEpoch: 0,
      space: account.data.length,
    };
  }

  private programAccounts(program: string, filters: Filter[]) {
    return [...this.accounts.entries()]
      .filter(([, account]) => account.owner === program && filters.every((f) => matches(account.data, f)))
      .map(([pubkey]) => ({ pubkey, account: this.encoded(pubkey) }));
  }
}

type Filter = { dataSize: number } | { memcmp: { offset: number; bytes: string } };

function matches(data: Uint8Array, filter: Filter): boolean {
  if ('dataSize' in filter) return data.length === filter.dataSize;
  const wanted = getBase58Encoder().encode(filter.memcmp.bytes);
  return wanted.every((byte, i) => data[filter.memcmp.offset + i] === byte);
}

function stakeAccountData(staker: Address, withdrawer: Address, unlockAt: bigint, custodian: Address = CUSTODIAN): Uint8Array {
  const data = new Uint8Array(STAKE_ACCOUNT_SPACE);
  data.set(
    getStakeStateAccountEncoder().encode({
      state: {
        __kind: 'Initialized',
        fields: [{ rentExemptReserve: LOCK_RENT, authorized: { staker, withdrawer }, lockup: { unixTimestamp: unlockAt, epoch: 0n, custodian } }],
      },
    }),
  );
  return data;
}

/** The lockup date sits after the 4-byte state tag, the 8-byte reserve and the two 32-byte authorities. */
function unlockTimeOf(data: Uint8Array): bigint {
  return new DataView(data.buffer, data.byteOffset).getBigInt64(76, true);
}

