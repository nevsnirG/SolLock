import { generateKeyPairSigner, getProgramDerivedAddress } from '@solana/kit';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CUSTODIAN_ADDRESS,
  giftAccountProblem,
  giftAccountWarnings,
  giftAddressProblem,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
} from '../src/index.ts';
import type { Address } from '@solana/kit';

let funder: Address;
let feeAddress: Address;
let friend: Address;

beforeAll(async () => {
  funder = (await generateKeyPairSigner()).address;
  feeAddress = (await generateKeyPairSigner()).address;
  friend = (await generateKeyPairSigner()).address;
});

describe('gift address', () => {
  it('accepts an ordinary wallet address', () => {
    expect(giftAddressProblem(friend, { funder, feeAddress })).toBeNull();
    expect(giftAddressProblem(`  ${friend} `, { funder, feeAddress })).toBeNull();
  });

  it('refuses what is not an address', () => {
    // 0, O, I and l are not base58; the others have the wrong length.
    for (const bad of ['', 'hello', `${friend.slice(0, -1)}0`, '1'.repeat(45), friend.slice(0, 20), '0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl']) {
      expect(giftAddressProblem(bad, { funder, feeAddress }), bad).toMatch(/not a Solana address/);
    }
  });

  it('refuses your own wallet, the custodian and the fee address', () => {
    expect(giftAddressProblem(funder, { funder, feeAddress })).toMatch(/your own wallet/);
    expect(giftAddressProblem(CUSTODIAN_ADDRESS, { funder, feeAddress })).toMatch(/nobody has a key/);
    expect(giftAddressProblem(feeAddress, { funder, feeAddress })).toMatch(/fee address/);
  });

  it('refuses programs', () => {
    expect(giftAddressProblem(SYSTEM_PROGRAM_ADDRESS, { funder, feeAddress })).toMatch(/program/);
    expect(giftAddressProblem(STAKE_PROGRAM_ADDRESS, { funder, feeAddress })).toMatch(/program/);
    expect(giftAddressProblem('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', { funder, feeAddress })).toMatch(/program/);
  });

  it('refuses addresses without a private key', async () => {
    const [pda] = await getProgramDerivedAddress({ programAddress: STAKE_PROGRAM_ADDRESS, seeds: ['vault'] });
    expect(giftAddressProblem(pda, { funder, feeAddress })).toMatch(/No private key/);
  });

  it('warns about unused addresses and program-owned accounts', () => {
    expect(giftAccountWarnings({ exists: false })[0]).toMatch(/never been used/);
    expect(giftAccountWarnings({ exists: true, programAddress: SYSTEM_PROGRAM_ADDRESS })).toEqual([]);
  });

  it('refuses an address owned by a program, which no wallet could withdraw from', () => {
    expect(giftAccountProblem({ exists: true, programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address })).toMatch(/token account/);
    expect(giftAccountProblem({ exists: true, programAddress: STAKE_PROGRAM_ADDRESS })).toMatch(/belongs to a program/);
    expect(giftAccountProblem({ exists: true, executable: true })).toMatch(/is a program/);
    expect(giftAccountProblem({ exists: true, programAddress: SYSTEM_PROGRAM_ADDRESS })).toBeNull();
    expect(giftAccountProblem({ exists: false })).toBeNull();
  });
});
