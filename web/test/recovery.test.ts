import { address, createNoopSigner, type Signature } from '@solana/kit';
import { CUSTODIAN_ADDRESS, newYearsDayUnlockAt, LAMPORTS_PER_SOL, planLock, TEST_LOCK_AMOUNT, testLockUnlockAt } from '@sollock/core';
import { describe, expect, it } from 'vitest';
import { BUSINESS } from '../src/config.ts';
import { type LockedFacts, noteFactsFromLock, noteFactsFromView, receiptText, recoveryNote as noteFromFacts } from '../src/lib/recovery.ts';

const recoveryNote = (f: LockedFacts, site: string) => noteFromFacts(noteFactsFromLock(f), site);

const NOW = BigInt(Date.UTC(2026, 10, 1, 20, 0) / 1000);
const WALLET = address('J25CTTarrkbvpzX2W8yhmq85ybb9XFY2Ki33D1bdHD1c');
const FRIEND = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const FEE = address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv');
const SIG = '5'.repeat(88) as Signature;

async function facts(opts: { gift?: boolean; test?: boolean } = {}): Promise<LockedFacts> {
  const plan = await planLock({
    funder: createNoopSigner(WALLET),
    recipient: opts.gift ? FRIEND : undefined,
    amount: opts.test ? TEST_LOCK_AMOUNT : 2n * LAMPORTS_PER_SOL,
    unlockAt: opts.test ? testLockUnlockAt(NOW) : newYearsDayUnlockAt(2032),
    seedIndex: 4,
    rent: 1_666_240n,
    feeAddress: FEE,
    now: NOW,
  });
  return { plan, signature: SIG, lockedAt: NOW, cluster: 'devnet' };
}

describe('the recovery note', () => {
  it('holds everything needed to find and withdraw the lock without us', async () => {
    const f = await facts();
    const note = recoveryNote(f, 'https://sollock.io');
    expect(note).toContain(f.plan.lockAddress);
    expect(note).toContain('1 January 2032, 00:00 UTC (unix 1956528000)');
    expect(note).toContain('2 SOL, plus a 0.00166624 SOL deposit');
    expect(note).toContain(`wallet ${WALLET}, seed "sl1-4"`);
    expect(note).toContain(CUSTODIAN_ADDRESS);
    expect(note).toContain('sollock.io/custodian');
    expect(note).toContain(`solana withdraw-stake ${f.plan.lockAddress} <your address> ALL --withdraw-authority <your keypair> --url devnet`);
    expect(note).toContain('Solana devnet');
    expect(note).toContain(SIG);
    expect(note).toContain('Made 1 Nov 2026.');
  });

  it('warns never to write the seed phrase on it, and never asks for one', async () => {
    const note = recoveryNote(await facts(), 'https://sollock.io');
    expect(note).toContain('Never write your seed phrase on this note.');
    expect(note).not.toMatch(/seed phrase:|recovery phrase:/i);
  });

  it("names the recipient's wallet for a gift", async () => {
    const note = recoveryNote(await facts({ gift: true }), 'https://sollock.io');
    expect(note).toContain(`  ${FRIEND}\n  the gift recipient's wallet`);
  });

  it('keeps lines short enough to print, apart from the addresses and command', async () => {
    const note = recoveryNote({ ...(await facts()), cluster: 'mainnet' }, 'https://sollock.io');
    expect(note).not.toContain('--url');
    for (const line of note.split('\n')) {
      if (!/[1-9A-HJ-NP-Za-km-z]{32,}/.test(line)) expect(line.length, line).toBeLessThanOrEqual(64);
    }
  });
});

describe('a recovery note written later, from the chain', () => {
  it('rebuilds the note for a lock found on My locks, with the seed when this wallet made it', async () => {
    const f = await facts();
    const view = {
      address: f.plan.lockAddress,
      state: 'initialized' as const,
      lamports: f.plan.amount + f.plan.rent,
      lockedAmount: f.plan.amount,
      staker: WALLET,
      withdrawer: WALLET,
      unlockAt: f.plan.unlockAt,
      custodianIsNobody: true,
    };
    const later = NOW + 86_400n * 30n;
    const facts2 = noteFactsFromView(view, { wallet: WALLET, seed: 'sl1-4', now: later, cluster: 'devnet' })!;
    const note = noteFromFacts(facts2, 'https://sollock.io');
    expect(note).toContain('Written 1 Dec 2026.');
    expect(note).toContain(`wallet ${WALLET}, seed "sl1-4"`);
    expect(note).toContain('2 SOL, plus a 0.00166624 SOL deposit');
    expect(note).not.toContain('Transaction');
    const original = recoveryNote(f, 'https://sollock.io');
    for (const line of original.split('\n').filter((l) => /withdraw-stake|Custodian|EcS8|Opens|unix/.test(l))) expect(note).toContain(line);
  });

  it('writes no note for a lock with another custodian, or one that also waits for an epoch', () => {
    const view = { address: FRIEND, state: 'initialized' as const, lamports: 3n, lockedAmount: 1n, staker: WALLET, withdrawer: WALLET, unlockAt: 1n, custodianIsNobody: true, lockupEpoch: 0n };
    expect(noteFactsFromView(view, { wallet: WALLET, now: NOW, cluster: 'devnet' })).not.toBeNull();
    expect(noteFactsFromView({ ...view, custodianIsNobody: false }, { wallet: WALLET, now: NOW, cluster: 'devnet' })).toBeNull();
    expect(noteFactsFromView({ ...view, lockupEpoch: 2n ** 64n - 1n }, { wallet: WALLET, now: NOW, cluster: 'devnet' })).toBeNull();
  });

  it('names a gift received without a seed', () => {
    const view = { address: FRIEND, state: 'initialized' as const, lamports: 3n, lockedAmount: 1n, staker: WALLET, withdrawer: WALLET, unlockAt: 1n, custodianIsNobody: true };
    expect(noteFactsFromView(view, { wallet: WALLET, now: NOW, cluster: 'devnet' })?.withdrawerLabel).toBe('your wallet');
    expect(noteFactsFromView(view, { wallet: null, now: NOW, cluster: 'devnet' })?.withdrawerLabel).toBe('the wallet that can withdraw it');
  });
});

describe('the receipt', () => {
  it('shows the fee, the VAT in it and the seller', async () => {
    const seller = { ...BUSINESS, kvk: '12345678', vat: 'NL001234567B01' };
    const receipt = receiptText(await facts(), seller, '≈ €0.84');
    expect(receipt).toContain('Fee            0.01 SOL');
    expect(receipt).toContain('of which VAT 0.001735537 SOL (21%)');
    expect(receipt).toContain('KvK 12345678, VAT NL001234567B01');
    expect(receipt).toContain('Value          ≈ €0.84');
    expect(receipt).toContain(`transaction ${SIG}`);
  });

  it('leaves out the registration line while there are no numbers', async () => {
    const receipt = receiptText(await facts(), { ...BUSINESS, kvk: null, vat: null });
    expect(receipt).not.toContain('KvK');
    expect(receipt).toContain('Fee            0.01 SOL');
  });

  it('is left out for a free test lock', async () => {
    expect(receiptText(await facts({ test: true }), BUSINESS)).toBeNull();
  });
});
