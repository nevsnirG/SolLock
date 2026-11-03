import {
  type Address,
  type Base58EncodedBytes,
  type GetAccountInfoApi,
  type GetEpochInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetMultipleAccountsApi,
  type GetProgramAccountsApi,
  getBase64Encoder,
  type Rpc,
} from '@solana/kit';
import { CUSTODIAN_OFFSET, STAKE_ACCOUNT_SPACE, STAKE_PROGRAM_ADDRESS, WITHDRAWER_OFFSET } from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';
import type { GiftAccountInfo } from './gift.ts';
import { firstFreeSeed, lockAddressBatch, SEED_BATCH_SIZE, type SeededAddress } from './seeds.ts';
import { type LockView, type RawAccount, type ReadContext, readLockAccount } from './stakeAccount.ts';
import { nowSeconds } from './time.ts';

/** How far we look for a free seed before giving up: 10 batches, 1,000 locks per wallet. */
const MAX_SEED_BATCHES = 10;

export async function fetchLockRent(rpc: Rpc<GetMinimumBalanceForRentExemptionApi>): Promise<bigint> {
  return rpc.getMinimumBalanceForRentExemption(STAKE_ACCOUNT_SPACE).send();
}

interface Base64Account {
  lamports: bigint;
  owner: Address;
  data: readonly [string, 'base64'];
}

function toRawAccount(account: Base64Account): RawAccount {
  return { lamports: account.lamports, programAddress: account.owner, data: getBase64Encoder().encode(account.data[0]) as Uint8Array };
}

async function fetchRaw(rpc: Rpc<GetMultipleAccountsApi>, addresses: Address[]): Promise<(RawAccount | null)[]> {
  const { value } = await rpc.getMultipleAccounts(addresses, { encoding: 'base64' }).send();
  return value.map((account) => (account ? toRawAccount(account) : null));
}

/** The first `sl1-<n>` seed with no account yet for this wallet. */
export async function findFreeSeed(rpc: Rpc<GetMultipleAccountsApi>, base: Address): Promise<SeededAddress> {
  for (let batch = 0; batch < MAX_SEED_BATCHES; batch++) {
    const seeds = await lockAddressBatch(base, batch * SEED_BATCH_SIZE);
    const accounts = await fetchRaw(rpc, seeds.map((s) => s.address));
    const free = firstFreeSeed(seeds, accounts.map((a) => a !== null));
    if (free) return free;
  }
  throw new Error('This wallet already has 1,000 locks. Use another wallet.');
}

export async function fetchLock(
  rpc: Rpc<GetAccountInfoApi & GetEpochInfoApi & GetMinimumBalanceForRentExemptionApi>,
  address: Address,
): Promise<LockView> {
  const [{ value: account }, ctx] = await Promise.all([rpc.getAccountInfo(address, { encoding: 'base64' }).send(), fetchReadContext(rpc)]);
  return readLockAccount(address, account ? toRawAccount(account) : null, ctx);
}

/** What reading a lock needs from the network: the time, the epoch and the rent for 200 bytes. */
export async function fetchReadContext(rpc: Rpc<GetEpochInfoApi & GetMinimumBalanceForRentExemptionApi>): Promise<ReadContext> {
  const [epochInfo, rent] = await Promise.all([rpc.getEpochInfo().send(), fetchLockRent(rpc)]);
  return { now: nowSeconds(), epoch: epochInfo.epoch, rent };
}

export interface SeededLock extends SeededAddress {
  view: LockView;
}

/**
 * Every account this wallet made with an `sl1-<n>` seed, its own locks and the gifts it gave. Reads
 * batches of 100 seeds and stops at the first batch with nothing in it. No database needed.
 */
export async function findSeededLocks(
  rpc: Rpc<GetMultipleAccountsApi>,
  base: Address,
  ctx: ReadContext,
  maxBatches = MAX_SEED_BATCHES,
): Promise<SeededLock[]> {
  const found: SeededLock[] = [];
  for (let batch = 0; batch < maxBatches; batch++) {
    const seeds = await lockAddressBatch(base, batch * SEED_BATCH_SIZE);
    const accounts = await fetchRaw(rpc, seeds.map((s) => s.address));
    let any = false;
    accounts.forEach((account, i) => {
      if (!account) return;
      any = true;
      const seed = seeds[i] as SeededAddress;
      found.push({ ...seed, view: readLockAccount(seed.address, account, ctx) });
    });
    if (!any) break;
  }
  return found;
}

/**
 * SolLock locks this wallet can withdraw, whoever made them: how a gift recipient finds a gift.
 * One getProgramAccounts call with exactly the three filters our proxy allows: 200-byte stake
 * accounts, this withdrawer, and our custodian.
 */
export async function findLocksWithdrawableBy(rpc: Rpc<GetProgramAccountsApi>, wallet: Address, ctx: ReadContext): Promise<LockView[]> {
  const accounts = await rpc
    .getProgramAccounts(STAKE_PROGRAM_ADDRESS, {
      encoding: 'base64',
      filters: [
        { dataSize: STAKE_ACCOUNT_SPACE },
        { memcmp: { offset: WITHDRAWER_OFFSET, bytes: wallet as unknown as Base58EncodedBytes, encoding: 'base58' } },
        { memcmp: { offset: CUSTODIAN_OFFSET, bytes: CUSTODIAN_ADDRESS as unknown as Base58EncodedBytes, encoding: 'base58' } },
      ],
    })
    .send();
  return accounts.map(({ pubkey, account }) => readLockAccount(pubkey, toRawAccount(account), ctx));
}


/** Who owns an address on the network, which decides whether a gift could ever be withdrawn from it. */
export async function fetchGiftAccount(rpc: Rpc<GetAccountInfoApi>, address: Address): Promise<GiftAccountInfo> {
  const { value } = await rpc.getAccountInfo(address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }).send();
  return value ? { exists: true, programAddress: value.owner, executable: value.executable } : { exists: false };
}

export async function accountExists(rpc: Rpc<GetAccountInfoApi>, address: Address): Promise<boolean> {
  const { value } = await rpc.getAccountInfo(address, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }).send();
  return value !== null;
}
