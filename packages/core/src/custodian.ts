import { sha256 } from '@noble/hashes/sha2.js';
import { type Address, address, getAddressDecoder, isOffCurveAddress } from '@solana/kit';

/**
 * Every lock names this address as its lockup custodian. The custodian is the only party that could
 * lift a lockup early, so it must be an address nobody can ever sign for.
 *
 * We derive it from a public seed: SHA-256 of the seed text plus a one-byte counter, starting at 0,
 * keeping the first result that is off the Ed25519 curve. An off-curve address is not a public key,
 * so no private key exists for it. A program could only sign for it as a program-derived address,
 * which would need a SHA-256 preimage.
 */
export const CUSTODIAN_SEED = 'sollock:no-custodian:v1';

/** The result of {@link deriveCustodian}, hard-coded. Tests check that the two agree. */
export const CUSTODIAN_ADDRESS: Address = address('EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav');

export interface CustodianStep {
  counter: number;
  /** Bytes hashed: the seed text in UTF-8, then the counter byte. */
  input: Uint8Array;
  hash: Uint8Array;
  address: Address;
  offCurve: boolean;
}

export interface CustodianDerivation {
  address: Address;
  counter: number;
  /** Every attempt up to and including the one we keep, for the public check page. */
  steps: CustodianStep[];
}

export function deriveCustodian(seed: string = CUSTODIAN_SEED): CustodianDerivation {
  const seedBytes = new TextEncoder().encode(seed);
  const decoder = getAddressDecoder();
  const steps: CustodianStep[] = [];
  for (let counter = 0; counter <= 255; counter++) {
    const input = new Uint8Array(seedBytes.length + 1);
    input.set(seedBytes);
    input[seedBytes.length] = counter;
    const hash = sha256(input);
    const candidate = decoder.decode(hash);
    const offCurve = isOffCurveAddress(candidate);
    steps.push({ counter, input, hash, address: candidate, offCurve });
    if (offCurve) return { address: candidate, counter, steps };
  }
  // Each attempt is off-curve with probability about 1/2, so this never happens in practice.
  throw new Error('No off-curve address found in 256 attempts');
}
