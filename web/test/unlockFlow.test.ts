import {
  type Address,
  createSolanaRpcFromTransport,
  generateKeyPairSigner,
  getBase64Decoder,
  type RpcTransport,
  type TransactionSendingSigner,
} from '@solana/kit';
import { getStakeStateAccountEncoder } from '@solana-program/stake';
import { CUSTODIAN_ADDRESS, decodeInstruction, roundTripMessage, STAKE_PROGRAM_ADDRESS } from '@sollock/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseRequest } from '../../worker/src/rules.ts';
import { signAndSend } from '../src/lib/signing.ts';
import type { SiteRpc } from '../src/lib/siteRpc.ts';
import { finishUnlock, prepareUnlock } from '../src/lib/unlockFlow.ts';

const NOW = Math.floor(Date.now() / 1000);
const RENT = 1_666_240;
const noWait = async () => {};

interface Lock {
  withdrawer: Address;
  unlockAt: number;
  lamports: number;
}

let accounts: Map<string, Lock>;
let methods: string[];
let simulationErr: unknown;

function accountData(l: Lock): string {
  const data = new Uint8Array(200);
  data.set(
    getStakeStateAccountEncoder().encode({
      state: {
        __kind: 'Initialized',
        fields: [
          {
            rentExemptReserve: 2_282_880n,
            authorized: { staker: l.withdrawer, withdrawer: l.withdrawer },
            lockup: { unixTimestamp: BigInt(l.unlockAt), epoch: 0n, custodian: CUSTODIAN_ADDRESS },
          },
        ],
      },
    }),
  );
  return getBase64Decoder().decode(data);
}

const context = { slot: 1 };
function answer(method: string, params: unknown[]): unknown {
  switch (method) {
    case 'getAccountInfo': {
      const l = accounts.get(params[0] as string);
      return { context, value: l ? { data: [accountData(l), 'base64'], executable: false, lamports: l.lamports, owner: STAKE_PROGRAM_ADDRESS, rentEpoch: 0, space: 200 } : null };
    }
    case 'getEpochInfo':
      return { absoluteSlot: 1, blockHeight: 900, epoch: 1_198, slotIndex: 0, slotsInEpoch: 432_000, transactionCount: null };
    case 'getMinimumBalanceForRentExemption':
      return RENT;
    case 'getLatestBlockhash':
      return { context, value: { blockhash: '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn', lastValidBlockHeight: 1_000 } };
    case 'simulateTransaction':
      return { context, value: { err: simulationErr, logs: ['Program log: test'], unitsConsumed: 3_000, accounts: null, returnData: null } };
    case 'getSignatureStatuses':
      return { context, value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: 'confirmed' }] };
    default:
      throw new Error(`The test chain does not answer ${method}`);
  }
}

const transport = (async ({ payload }: { payload: unknown }) => {
  const { request } = parseRequest(JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
  methods.push(request.method);
  return { jsonrpc: '2.0', id: request.id, result: answer(request.method, request.params) };
}) as RpcTransport;
const rpc = createSolanaRpcFromTransport(transport) as unknown as SiteRpc;

/** A wallet whose "send" closes the lock, as a confirmed withdraw-all does on chain. */
async function wallet(lock?: Address): Promise<TransactionSendingSigner> {
  const { address } = await generateKeyPairSigner();
  return {
    address,
    async signAndSendTransactions(transactions) {
      if (lock) accounts.delete(lock);
      return transactions.map(() => new Uint8Array(64).fill(9) as never);
    },
  };
}

beforeEach(() => {
  accounts = new Map();
  methods = [];
  simulationErr = null;
});

describe('withdrawing a lock', () => {
  it('withdraws everything once the date has passed, and sees the account closed', async () => {
    const lock = (await generateKeyPairSigner()).address;
    const signer = await wallet(lock);
    accounts.set(lock, { withdrawer: signer.address, unlockAt: NOW - 60, lamports: 10_000_000 + RENT });

    const prepared = await prepareUnlock('withdraw', lock, { rpc, signer });
    const instructions = roundTripMessage(prepared.message).instructions.map((ix) => decodeInstruction(ix, { wallet: signer.address }));
    expect(instructions.map((i) => i.name)).toEqual(['SetComputeUnitLimit', 'Withdraw']);
    const withdraw = instructions[1]!;
    expect(withdraw.fields.find((f) => f.label === 'to')).toMatchObject({ value: signer.address, note: 'your wallet' });
    expect(withdraw.fields.find((f) => f.label === 'lamports')?.value).toBe('11,666,240 lamports');

    const result = await finishUnlock(rpc, prepared, await signAndSend(prepared.message), { wait: noWait });
    expect(result).toMatchObject({ action: 'withdraw', withdrawn: 11_666_240n });
    expect(result.after.state).toBe('missing');
    expect(methods).not.toContain('sendTransaction');
  });

  it('refuses before the date, without asking the wallet', async () => {
    const lock = (await generateKeyPairSigner()).address;
    const signer = await wallet(lock);
    accounts.set(lock, { withdrawer: signer.address, unlockAt: Date.UTC(2032, 0, 1) / 1000, lamports: 10_000_000 + RENT });
    await expect(prepareUnlock('withdraw', lock, { rpc, signer })).rejects.toThrow('It is still locked until 1 Jan 2032.');
    expect(methods).not.toContain('simulateTransaction');
  });

  it('refuses a wallet that is not the withdrawer', async () => {
    const lock = (await generateKeyPairSigner()).address;
    const owner = (await generateKeyPairSigner()).address;
    accounts.set(lock, { withdrawer: owner, unlockAt: NOW - 60, lamports: 10_000_000 + RENT });
    await expect(prepareUnlock('withdraw', lock, { rpc, signer: await wallet() })).rejects.toThrow(/Connect that wallet/);
  });

  it('says so when there is nothing left to withdraw', async () => {
    const lock = (await generateKeyPairSigner()).address;
    await expect(prepareUnlock('withdraw', lock, { rpc, signer: await wallet() })).rejects.toThrow(/withdrawn already/);
  });

  it('stops when the test run fails', async () => {
    const lock = (await generateKeyPairSigner()).address;
    const signer = await wallet(lock);
    accounts.set(lock, { withdrawer: signer.address, unlockAt: NOW - 60, lamports: 10_000_000 + RENT });
    simulationErr = { InstructionError: [1, { Custom: 0 }] };
    await expect(prepareUnlock('withdraw', lock, { rpc, signer })).rejects.toThrow(/refused this withdrawal in a test run/);
  });

  it("explains a network clock that is still a little behind", async () => {
    const lock = (await generateKeyPairSigner()).address;
    const signer = await wallet(lock);
    accounts.set(lock, { withdrawer: signer.address, unlockAt: NOW - 5, lamports: 10_000_000 + RENT });
    simulationErr = { InstructionError: [0, { Custom: 1 }] };
    await expect(prepareUnlock('withdraw', lock, { rpc, signer })).rejects.toThrow(/network's clock has not reached the unlock time yet/);
  });

  it('reports a confirmed withdraw that did not take', async () => {
    const lock = (await generateKeyPairSigner()).address;
    const signer = await wallet(); // its "send" changes nothing
    accounts.set(lock, { withdrawer: signer.address, unlockAt: NOW - 60, lamports: 10_000_000 + RENT });
    const prepared = await prepareUnlock('withdraw', lock, { rpc, signer });
    await expect(finishUnlock(rpc, prepared, await signAndSend(prepared.message), { wait: noWait })).rejects.toThrow(/still holds 0.01166624 SOL/);
  });
});
