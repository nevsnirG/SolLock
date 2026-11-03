import { type Address, createAddressWithSeed } from '@solana/kit';
import { STAKE_PROGRAM_ADDRESS } from './constants.ts';

export const SEED_PREFIX = 'sl1-';

/** `getMultipleAccounts` takes at most 100 addresses. */
export const SEED_BATCH_SIZE = 100;

/** The system program allows seeds of at most 32 bytes. */
export const MAX_SEED_LENGTH = 32;

export function lockSeed(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError(`Seed index must be a whole number from 0, got ${index}`);
  }
  return `${SEED_PREFIX}${index}`;
}

export function lockAddress(base: Address, index: number): Promise<Address> {
  return createAddressWithSeed({ baseAddress: base, programAddress: STAKE_PROGRAM_ADDRESS, seed: lockSeed(index) });
}

export interface SeededAddress {
  index: number;
  seed: string;
  address: Address;
}

export async function lockAddressBatch(base: Address, start: number, count = SEED_BATCH_SIZE): Promise<SeededAddress[]> {
  const indexes = Array.from({ length: count }, (_, i) => start + i);
  return Promise.all(
    indexes.map(async (index) => ({ index, seed: lockSeed(index), address: await lockAddress(base, index) })),
  );
}

/** Any existing account counts as used, even dust someone sent, because CreateAccountWithSeed fails on it. */
export function firstFreeSeed(batch: SeededAddress[], exists: boolean[]): SeededAddress | null {
  if (batch.length !== exists.length) throw new Error('Batch and lookup results differ in length');
  const i = exists.indexOf(false);
  return i === -1 ? null : (batch[i] ?? null);
}
