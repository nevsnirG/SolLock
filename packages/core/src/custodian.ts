import { sha256 } from '@noble/hashes/sha2.js';
import { type Address, address, getAddressDecoder, isOffCurveAddress } from '@solana/kit';

/** The custodian could lift a lockup early, so it is derived off-curve: no private key exists for it. */
export const CUSTODIAN_SEED = 'sollock:no-custodian:v1';

export const CUSTODIAN_ADDRESS: Address = address('EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav');

export interface CustodianStep {
  counter: number;
  input: Uint8Array;
  hash: Uint8Array;
  address: Address;
  offCurve: boolean;
}

export interface CustodianDerivation {
  address: Address;
  counter: number;
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
  throw new Error('No off-curve address found in 256 attempts');
}
