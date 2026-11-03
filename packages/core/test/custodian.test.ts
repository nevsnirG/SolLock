import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getAddressEncoder, isOffCurveAddress } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { CUSTODIAN_ADDRESS, CUSTODIAN_SEED, deriveCustodian } from '../src/index.ts';

function onCurveByNoble(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

describe('custodian', () => {
  it('derives the hard-coded address from the public seed', () => {
    const d = deriveCustodian();
    expect(d.address).toBe(CUSTODIAN_ADDRESS);
    expect(CUSTODIAN_ADDRESS).toBe('EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav');
    expect(d.counter).toBe(0);
  });

  it('is deterministic', () => {
    expect(deriveCustodian().address).toBe(deriveCustodian().address);
  });

  it('hashes exactly the seed text plus one counter byte', () => {
    const d = deriveCustodian();
    const seed = new TextEncoder().encode(CUSTODIAN_SEED);
    for (const step of d.steps) {
      expect(step.input).toEqual(new Uint8Array([...seed, step.counter]));
      expect(step.hash).toEqual(sha256(step.input));
    }
  });

  it('is off the Ed25519 curve, by Kit and by noble independently', () => {
    const bytes = new Uint8Array(getAddressEncoder().encode(CUSTODIAN_ADDRESS));
    expect(isOffCurveAddress(CUSTODIAN_ADDRESS)).toBe(true);
    expect(onCurveByNoble(bytes)).toBe(false);
  });

  it('kept the first off-curve result: every earlier attempt was on-curve', () => {
    const d = deriveCustodian();
    for (const step of d.steps.slice(0, -1)) {
      expect(step.offCurve).toBe(false);
      expect(onCurveByNoble(step.hash)).toBe(true);
    }
  });

  it('is none of the addresses that could sign', () => {
    expect(CUSTODIAN_ADDRESS).not.toBe('11111111111111111111111111111111');
    // A program-derived address hashes seeds || program id || "ProgramDerivedAddress". Our input does
    // not end that way, so matching it would need a SHA-256 second preimage.
    expect(CUSTODIAN_SEED.endsWith('ProgramDerivedAddress')).toBe(false);
  });

  it('gives a different address for a different seed', () => {
    expect(deriveCustodian('sollock:no-custodian:v2').address).not.toBe(CUSTODIAN_ADDRESS);
  });
});
