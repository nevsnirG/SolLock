import { sha256 } from '@noble/hashes/sha2.js';
import { getAddressDecoder, getAddressEncoder, generateKeyPairSigner } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import {
  firstFreeSeed,
  lockAddress,
  lockAddressBatch,
  lockSeed,
  MAX_SEED_LENGTH,
  STAKE_PROGRAM_ADDRESS,
} from '../src/index.ts';

describe('seeds', () => {
  it('formats sl1-<n>', () => {
    expect(lockSeed(0)).toBe('sl1-0');
    expect(lockSeed(42)).toBe('sl1-42');
  });

  it('refuses bad indexes', () => {
    expect(() => lockSeed(-1)).toThrow();
    expect(() => lockSeed(1.5)).toThrow();
    expect(() => lockSeed(Number.NaN)).toThrow();
  });

  it('stays within 32 bytes for every safe index', () => {
    expect(lockSeed(Number.MAX_SAFE_INTEGER).length).toBeLessThanOrEqual(MAX_SEED_LENGTH);
  });

  it('derives the same address as the system program would', async () => {
    const base = (await generateKeyPairSigner()).address;
    const enc = getAddressEncoder();
    const bytes = new Uint8Array([
      ...enc.encode(base),
      ...new TextEncoder().encode('sl1-3'),
      ...enc.encode(STAKE_PROGRAM_ADDRESS),
    ]);
    const expected = getAddressDecoder().decode(sha256(bytes));
    expect(await lockAddress(base, 3)).toBe(expected);
  });

  it('gives each wallet its own addresses', async () => {
    const a = (await generateKeyPairSigner()).address;
    const b = (await generateKeyPairSigner()).address;
    expect(await lockAddress(a, 0)).not.toBe(await lockAddress(b, 0));
  });

  it('derives batches of 100 in order', async () => {
    const base = (await generateKeyPairSigner()).address;
    const batch = await lockAddressBatch(base, 100);
    expect(batch).toHaveLength(100);
    expect(batch[0]?.seed).toBe('sl1-100');
    expect(batch[99]?.seed).toBe('sl1-199');
    expect(batch[5]?.address).toBe(await lockAddress(base, 105));
    expect(new Set(batch.map((s) => s.address)).size).toBe(100);
  });

  it('picks the first index with no account at all', async () => {
    const base = (await generateKeyPairSigner()).address;
    const batch = await lockAddressBatch(base, 0, 4);
    expect(firstFreeSeed(batch, [true, true, false, false])?.index).toBe(2);
    expect(firstFreeSeed(batch, [false, true, true, true])?.index).toBe(0);
    expect(firstFreeSeed(batch, [true, true, true, true])).toBeNull();
    expect(() => firstFreeSeed(batch, [true])).toThrow();
  });
});
