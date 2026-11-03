import { type Address, createSolanaRpcFromTransport, generateKeyPairSigner, getBase64Decoder, type RpcTransport } from '@solana/kit';
import { getStakeStateAccountEncoder } from '@solana-program/stake';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CUSTODIAN_ADDRESS,
  newYearsDayUnlockAt,
  fetchReadContext,
  findLocksWithdrawableBy,
  findSeededLocks,
  lockAddress,
  STAKE_PROGRAM_ADDRESS,
} from '../src/index.ts';

const RENT = 1_666_240;
const ctx = { now: 1_800_000_000n, epoch: 1_198n, rent: BigInt(RENT) };
let wallet: Address;
let friend: Address;

beforeAll(async () => {
  wallet = (await generateKeyPairSigner()).address;
  friend = (await generateKeyPairSigner()).address;
});

function lockData(withdrawer: Address): string {
  const data = new Uint8Array(200);
  data.set(
    getStakeStateAccountEncoder().encode({
      state: {
        __kind: 'Initialized',
        fields: [
          {
            rentExemptReserve: 2_282_880n,
            authorized: { staker: withdrawer, withdrawer },
            lockup: { unixTimestamp: newYearsDayUnlockAt(2032), epoch: 0n, custodian: CUSTODIAN_ADDRESS },
          },
        ],
      },
    }),
  );
  return getBase64Decoder().decode(data);
}

const account = (withdrawer: Address) => ({
  data: [lockData(withdrawer), 'base64'],
  executable: false,
  lamports: 2_000_000_000 + RENT,
  owner: STAKE_PROGRAM_ADDRESS,
  rentEpoch: 0,
  space: 200,
});

function fakeRpc(locks: Map<string, Address>) {
  const requests: { method: string; params: unknown[] }[] = [];
  const transport = (async ({ payload }: { payload: unknown }) => {
    const { method, params, id } = JSON.parse(JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
    requests.push({ method, params });
    const context = { slot: 1 };
    const result =
      method === 'getMultipleAccounts'
        ? { context, value: (params[0] as string[]).map((a) => (locks.has(a) ? account(locks.get(a)!) : null)) }
        : method === 'getProgramAccounts'
          ? [...locks.entries()].map(([pubkey, w]) => ({ pubkey, account: account(w) }))
          : method === 'getEpochInfo'
            ? { absoluteSlot: 1, blockHeight: 1, epoch: 1_198, slotIndex: 0, slotsInEpoch: 432_000, transactionCount: null }
            : method === 'getMinimumBalanceForRentExemption'
              ? RENT
              : null;
    return { jsonrpc: '2.0', id, result };
  }) as RpcTransport;
  return { rpc: createSolanaRpcFromTransport(transport), requests };
}

describe('finding locks without a database', () => {
  it('finds every seeded lock, own and given, and stops at the first empty batch', async () => {
    const locks = new Map<string, Address>([
      [await lockAddress(wallet, 0), wallet],
      [await lockAddress(wallet, 2), friend],
      [await lockAddress(wallet, 150), wallet], // in the second batch
    ]);
    const { rpc, requests } = fakeRpc(locks);
    const found = await findSeededLocks(rpc, wallet, ctx);
    expect(found.map((f) => f.seed)).toEqual(['sl1-0', 'sl1-2', 'sl1-150']);
    expect(found[1]?.view.withdrawer).toBe(friend);
    expect(found[0]?.view).toMatchObject({ state: 'initialized', lockedAmount: 2_000_000_000n, custodianIsNobody: true });
    expect(requests.filter((r) => r.method === 'getMultipleAccounts')).toHaveLength(3);
  });

  it('asks for gifts with exactly the filters the proxy allows', async () => {
    const gift = (await generateKeyPairSigner()).address;
    const { rpc, requests } = fakeRpc(new Map([[gift, wallet]]));
    const views = await findLocksWithdrawableBy(rpc, wallet, ctx);
    expect(views.map((v) => v.address)).toEqual([gift]);
    expect(requests[0]?.params).toEqual([
      STAKE_PROGRAM_ADDRESS,
      {
        commitment: 'confirmed', // Kit's default, which the proxy allows
        encoding: 'base64',
        filters: [
          { dataSize: 200 },
          { memcmp: { offset: 44, bytes: wallet, encoding: 'base58' } },
          { memcmp: { offset: 92, bytes: CUSTODIAN_ADDRESS, encoding: 'base58' } },
        ],
      },
    ]);
  });

  it('reads the epoch and rent once', async () => {
    const { rpc } = fakeRpc(new Map());
    const read = await fetchReadContext(rpc);
    expect(read.epoch).toBe(1_198n);
    expect(read.rent).toBe(BigInt(RENT));
  });
});
