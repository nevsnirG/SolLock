import {
  type Address,
  address,
  createSolanaRpcFromTransport,
  generateKeyPairSigner,
  getBase64Decoder,
  type RpcTransport,
  type TransactionSendingSigner,
} from '@solana/kit';
import { getStakeStateAccountEncoder } from '@solana-program/stake';
import { accountExists, CLOCK_SYSVAR_ADDRESS, CUSTODIAN_ADDRESS, DAY, LockRequestError, MAX_LOCK_COMPUTE_UNITS, STAKE_PROGRAM_ADDRESS, type LockPlan } from '@sollock/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseRequest } from '../../worker/src/rules.ts';
import { type DraftInput, draftLock } from '../src/lib/draft.ts';
import { finishLock, prepareLock, readBackLock } from '../src/lib/lockFlow.ts';
import { computeUnitLimit, FlowError, isWalletRejection, signAndSend } from '../src/lib/signing.ts';
import type { SiteRpc } from '../src/lib/siteRpc.ts';

const NOW = BigInt(Math.floor(Date.now() / 1000));
const FEE = address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv');
const RENT = 1_666_240;
const base: DraftInput = { amountText: '2', wantsTestLock: false, choice: { kind: 'newYear', year: 2032 }, gift: false, giftText: '' };
const noWait = async () => {};

interface Chain {
  balance: number;
  simulation: { err: unknown; unitsConsumed: number; logs: string[] };
  statuses: (null | { confirmationStatus: string; err: unknown })[];
  blockHeight: number;
  lock: { owner: Address; unlockAt: bigint; lamports: number; custodian?: Address } | null;
  rent: number;
  owners: Map<string, string>;
  /** The network's clock; null when the network has none to give. */
  clock: bigint | null;
}

let chain: Chain;
let methods: string[];
let sent: number;

function stakeAccountBase64(lock: NonNullable<Chain['lock']>): string {
  const data = new Uint8Array(200);
  data.set(
    getStakeStateAccountEncoder().encode({
      state: {
        __kind: 'Initialized',
        fields: [
          {
            rentExemptReserve: 2_282_880n,
            authorized: { staker: lock.owner, withdrawer: lock.owner },
            lockup: { unixTimestamp: lock.unlockAt, epoch: 0n, custodian: lock.custodian ?? CUSTODIAN_ADDRESS },
          },
        ],
      },
    }),
  );
  return getBase64Decoder().decode(data);
}

const context = { slot: 1 };

/** The eight timestamp bytes the site asks for with its dataSlice. */
function clockSliceBase64(at: bigint): string {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, at, true);
  return getBase64Decoder().decode(bytes);
}

function answer(method: string, params: unknown[]): unknown {
  switch (method) {
    case 'getMinimumBalanceForRentExemption':
      return chain.rent;
    case 'getMultipleAccounts':
      return { context, value: (params[0] as string[]).map(() => null) };
    case 'getBalance':
      return { context, value: chain.balance };
    case 'getLatestBlockhash':
      return { context, value: { blockhash: '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn', lastValidBlockHeight: 1_000 } };
    case 'simulateTransaction':
      return { context, value: { ...chain.simulation, accounts: null, returnData: null } };
    case 'getSignatureStatuses':
      return { context, value: [chain.statuses.shift() ?? null] };
    case 'getEpochInfo':
      return { absoluteSlot: 1, blockHeight: chain.blockHeight, epoch: 1_198, slotIndex: 0, slotsInEpoch: 432_000, transactionCount: null };
    case 'getAccountInfo':
      if (params[0] === CLOCK_SYSVAR_ADDRESS) {
        const value = chain.clock === null ? null : { data: [clockSliceBase64(chain.clock), 'base64'], executable: false, lamports: 1_169_280, owner: 'Sysvar1111111111111111111111111111111111111', rentEpoch: 0, space: 40 };
        return { context, value };
      }
      if (chain.owners.has(params[0] as string)) {
        return { context, value: { data: ['', 'base64'], executable: false, lamports: 2_039_280, owner: chain.owners.get(params[0] as string), rentEpoch: 0, space: 165 } };
      }
      return {
        context,
        value: chain.lock
          ? { data: [stakeAccountBase64(chain.lock), 'base64'], executable: false, lamports: chain.lock.lamports, owner: STAKE_PROGRAM_ADDRESS, rentEpoch: 0, space: 200 }
          : null,
      };
    default:
      throw new Error(`The test chain does not answer ${method}`);
  }
}

const transport = (async ({ payload }: { payload: unknown }) => {
  const text = JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
  const { request } = parseRequest(text); // throws, failing the test, if the proxy would refuse it
  methods.push(request.method);
  return { jsonrpc: '2.0', id: request.id, result: answer(request.method, request.params) };
}) as RpcTransport;

const rpc = createSolanaRpcFromTransport(transport) as unknown as SiteRpc;

async function walletSigner(): Promise<TransactionSendingSigner> {
  const { address: addr } = await generateKeyPairSigner();
  return {
    address: addr,
    async signAndSendTransactions(transactions) {
      sent += transactions.length;
      return transactions.map(() => new Uint8Array(64).fill(7) as never);
    },
  };
}

beforeEach(() => {
  chain = { balance: 5_000_000_000, simulation: { err: null, unitsConsumed: 14_000, logs: ['Program log: ok'] }, statuses: [], blockHeight: 900, lock: null, rent: RENT, owners: new Map(), clock: NOW };
  methods = [];
  sent = 0;
});

function lockFor(plan: LockPlan): NonNullable<Chain['lock']> {
  return { owner: plan.withdrawer, unlockAt: plan.unlockAt, lamports: Number(plan.amount + plan.rent) };
}

describe('preparing a lock', () => {
  it('measures, verifies and decodes the final transaction, through the proxy rules only', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });

    expect(prepared.plan.computeUnitLimit).toBeGreaterThan(chain.simulation.unitsConsumed);
    expect(prepared.plan.seed).toBe('sl1-0');
    expect(prepared.instructions.map((i) => i.name)).toEqual(['SetComputeUnitLimit', 'CreateAccountWithSeed', 'Initialize', 'Transfer', 'Memo']);
    expect(prepared.instructions[2]?.fields.find((f) => f.label === 'lockup.custodian')?.value).toBe(CUSTODIAN_ADDRESS);
    expect(prepared.lastValidBlockHeight).toBe(1_000n);
    expect(methods).toContain('simulateTransaction');
    expect(methods).not.toContain('sendTransaction');
    expect(sent).toBe(0);
  });

  it('stops when the wallet cannot pay, in plain words', async () => {
    chain.balance = 1_000_000_000;
    const signer = await walletSigner();
    await expect(prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(
      'Your wallet has 1 SOL. This lock needs 2.01167124 SOL, including the rent deposit and fees.',
    );
    expect(methods).not.toContain('simulateTransaction');
  });

  it('stops when the test run fails, and keeps the logs', async () => {
    chain.simulation = { err: { InstructionError: [1, { Custom: 0 }] }, unitsConsumed: 3_000, logs: ['Program log: account already in use'] };
    const signer = await walletSigner();
    const error = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW }).catch((e) => e);
    expect(error).toBeInstanceOf(FlowError);
    expect(error.message).toMatch(/^The network refused this lock in a test run, so nothing was sent\./);
    expect(error.logs).toEqual(['Program log: account already in use']);
  });

  it('refuses a draft that still has problems', async () => {
    const signer = await walletSigner();
    await expect(
      prepareLock(draftLock({ ...base, amountText: '' }, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW }),
    ).rejects.toThrow('Enter an amount.');
  });

  it('refuses a gift to the wallet itself', async () => {
    const signer = await walletSigner();
    const draft = draftLock({ ...base, gift: true, giftText: signer.address }, { now: NOW, feeAddress: FEE, wallet: signer.address });
    await expect(prepareLock(draft, { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(/your own wallet/);
  });
});

describe('a network that lies, or changes its answer', () => {
  it('refuses an impossible rent deposit, which would lock the extra SOL', async () => {
    chain.rent = 40_000_000_000;
    chain.balance = 100_000_000_000;
    const signer = await walletSigner();
    await expect(prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(
      /rent deposit of 40 SOL, which can't be right/,
    );
    expect(methods).not.toContain('simulateTransaction');
  });

  it('asks to confirm again when the cost differs from the preview', async () => {
    const signer = await walletSigner();
    const draft = draftLock(base, { now: NOW, feeAddress: FEE });
    const shown = { rent: BigInt(RENT), total: 2_011_666_240n };
    await expect(prepareLock(draft, { rpc, signer, feeAddress: FEE, now: NOW, shown })).resolves.toMatchObject({ plan: { total: 2_011_666_240n } });
    chain.rent = RENT + 1;
    await expect(prepareLock(draft, { rpc, signer, feeAddress: FEE, now: NOW, shown })).rejects.toThrow(/cost changed since the preview/);
  });

  it('refuses a gift to an address a program owns, which no wallet could withdraw from', async () => {
    const recipient = (await generateKeyPairSigner()).address;
    chain.owners.set(recipient, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const signer = await walletSigner();
    const draft = draftLock({ ...base, gift: true, giftText: recipient }, { now: NOW, feeAddress: FEE });
    await expect(prepareLock(draft, { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(/token account/);
  });

  it('refuses to build when the device clock is far from the network clock, before any test run', async () => {
    chain.clock = NOW - 10n * 365n * DAY - 3n * DAY;
    const signer = await walletSigner();
    const testLock = draftLock({ ...base, wantsTestLock: true }, { now: NOW, feeAddress: FEE });
    await expect(prepareLock(testLock, { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(/clock is 10 years ahead of the Solana network's/);
    expect(methods).not.toContain('simulateTransaction');
    chain.clock = NOW + 3n * 3_600n;
    await expect(prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(/3 hours behind/);
  });

  it('allows the few minutes the network clock can lag, and a wider tolerance when asked', async () => {
    const signer = await walletSigner();
    chain.clock = NOW - 5n * 60n;
    await expect(prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW })).resolves.toBeDefined();
    chain.clock = NOW + 2n * 3_600n;
    await expect(prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW, clockTolerance: 3n * 3_600n })).resolves.toBeDefined();
  });

  it("stops when the network's clock cannot be read", async () => {
    chain.clock = null;
    const signer = await walletSigner();
    await expect(prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW })).rejects.toThrow(
      "We couldn't read the network's clock, so nothing was sent. Try again.",
    );
  });

  it('tells whether a lock exists, to settle a wallet error after sending', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    expect(await accountExists(rpc, prepared.plan.lockAddress)).toBe(false);
    chain.lock = lockFor(prepared.plan);
    expect(await accountExists(rpc, prepared.plan.lockAddress)).toBe(true);
  });
});

describe('signing, confirming and reading back', () => {
  it('lets the wallet send, then confirms and checks the lock on chain', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    const signature = await signAndSend(prepared.message);
    expect(sent).toBe(1);
    expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);

    chain.statuses = [null, { confirmationStatus: 'processed', err: null }, { confirmationStatus: 'confirmed', err: null }];
    chain.lock = lockFor(prepared.plan);
    const result = await finishLock(rpc, prepared, signature, { wait: noWait });
    expect(result).toMatchObject({ plan: prepared.plan, signature });
    const view = await readBackLock(rpc, prepared.plan, { wait: noWait });
    expect(view).toMatchObject({ state: 'initialized', unlockAt: prepared.plan.unlockAt, withdrawer: signer.address, custodianIsNobody: true });
    expect(view?.lockedAmount).toBe(prepared.plan.amount);
    expect(methods).not.toContain('sendTransaction');
  });

  it('says nothing was locked when the transaction expired and the account never appeared', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    chain.blockHeight = 1_001;
    await expect(finishLock(rpc, prepared, await signAndSend(prepared.message), { wait: noWait })).rejects.toThrow(/expired .* Nothing was locked/);
  });

  it('still succeeds when an expired-looking transaction landed after all', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    chain.blockHeight = 1_001;
    chain.lock = lockFor(prepared.plan);
    await expect(finishLock(rpc, prepared, await signAndSend(prepared.message), { wait: noWait })).resolves.toMatchObject({ plan: prepared.plan });
  });

  it('reports a transaction the network rejected', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    chain.statuses = [{ confirmationStatus: 'processed', err: { InsufficientFundsForRent: { account_index: 1 } } }];
    await expect(finishLock(rpc, prepared, await signAndSend(prepared.message), { wait: noWait })).rejects.toThrow(/rejected the transaction/);
  });

  it('refuses a lock on chain that differs from the one built', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    chain.lock = { ...lockFor(prepared.plan), custodian: signer.address };
    await expect(readBackLock(rpc, prepared.plan, { wait: noWait })).rejects.toThrow(/not what we built.*custodian/);
  });

  it('waits a moment for a node that lags behind', async () => {
    const signer = await walletSigner();
    const prepared = await prepareLock(draftLock(base, { now: NOW, feeAddress: FEE }), { rpc, signer, feeAddress: FEE, now: NOW });
    let reads = 0;
    const lagging = createSolanaRpcFromTransport((async (args: { payload: unknown }) => {
      const reply = (await transport(args)) as { result: { value: unknown } };
      if ((args.payload as { method: string }).method === 'getAccountInfo' && ++reads < 3) reply.result.value = null;
      return reply;
    }) as RpcTransport) as unknown as SiteRpc;
    chain.lock = lockFor(prepared.plan);
    await expect(readBackLock(lagging, prepared.plan, { wait: noWait })).resolves.toMatchObject({ state: 'initialized' });
    expect(reads).toBe(3);
  });
});

describe('small helpers', () => {
  it('leaves room above the measured compute, within the cap', () => {
    for (const measured of [3_000n, 14_000n, 60_000n]) expect(computeUnitLimit(measured)).toBeGreaterThan(Number(measured));
    expect(computeUnitLimit(1_000_000n)).toBe(MAX_LOCK_COMPUTE_UNITS);
  });

  it('recognises a "no" in the wallet', () => {
    expect(isWalletRejection({ code: 4001, message: 'x' })).toBe(true);
    expect(isWalletRejection(new Error('Wrapped', { cause: new Error('User rejected the request.') }))).toBe(true);
    expect(isWalletRejection(new Error('Network down'))).toBe(false);
    expect(isWalletRejection(new LockRequestError('x'))).toBe(false);
  });
});
