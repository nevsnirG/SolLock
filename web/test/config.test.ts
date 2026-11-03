import { CUSTODIAN_ADDRESS } from '@sollock/core';
import { isOffCurveAddress } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { clusterFrom, explorerAddressUrl, feeAddressFor, liveOffer } from '../src/config.ts';

describe('site config', () => {
  it('builds for devnet unless told otherwise, and refuses unknown clusters', () => {
    expect(clusterFrom(undefined)).toBe('devnet');
    expect(clusterFrom('mainnet')).toBe('mainnet');
    expect(() => clusterFrom('mainnet-beta')).toThrow(/devnet" or "mainnet/);
  });

  it("pays mainnet fees to our wallet, which can sign, and never to the custodian", () => {
    expect(feeAddressFor('mainnet')).toBe('77xiaSmtDYTQXhWoEFbKa232CXrws7SHrDhXuAWZa4HS');
    for (const cluster of ['devnet', 'mainnet'] as const) {
      expect(isOffCurveAddress(feeAddressFor(cluster)), cluster).toBe(false);
      expect(feeAddressFor(cluster)).not.toBe(CUSTODIAN_ADDRESS);
    }
  });

  it('shows an exchange offer until the day it stops', () => {
    const exchange = { name: 'X', url: 'https://x.example', offer: { text: 'A bonus', endsOn: '2027-01-01' } };
    expect(liveOffer(exchange, new Date('2026-12-31T23:59:59Z'))).toBe('A bonus');
    expect(liveOffer(exchange, new Date('2027-01-01T00:00:00Z'))).toBeNull();
    expect(liveOffer({ ...exchange, offer: { text: 'For now' } }, new Date('2040-01-01'))).toBe('For now');
    expect(liveOffer({ name: 'Y', url: 'https://y.example' }, new Date())).toBeNull();
  });

  it('links devnet addresses to the devnet explorer', () => {
    expect(explorerAddressUrl('abc', 'devnet')).toBe('https://explorer.solana.com/address/abc?cluster=devnet');
    expect(explorerAddressUrl('abc', 'mainnet')).toBe('https://explorer.solana.com/address/abc');
  });
});
