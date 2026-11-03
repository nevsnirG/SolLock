import { address } from '@solana/kit';
import { CUSTODIAN_ADDRESS, lockAddress, STAKE_PROGRAM_ADDRESS, utcMidnight } from '@sollock/core';
import { describe, expect, it } from 'vitest';
import { type DraftInput, draftLock, PREVIEW_WALLET } from '../src/lib/draft.ts';
import { KNOWN_LOCK_RENT } from '../src/lib/costs.ts';
import { previewLock } from '../src/lib/preview.ts';

const NOW = BigInt(Date.UTC(2026, 10, 1, 14, 30) / 1000);
const FEE = address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv');
const WALLET = address('J25CTTarrkbvpzX2W8yhmq85ybb9XFY2Ki33D1bdHD1c');
const FRIEND = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const base: DraftInput = { amountText: '2', wantsTestLock: false, choice: { kind: 'newYear', year: 2032 }, gift: false, giftText: '' };

async function preview(input: DraftInput, wallet?: typeof WALLET, seedIndex?: number) {
  const draft = draftLock(input, { now: NOW, feeAddress: FEE, wallet });
  return previewLock(draft, { now: NOW, feeAddress: FEE, rent: KNOWN_LOCK_RENT, wallet, seedIndex });
}

const fieldOf = (ix: { fields: { label: string; value: string; note?: string }[] } | undefined, label: string) =>
  ix?.fields.find((f) => f.label === label);

describe('previewLock', () => {
  it('shows the real instructions before a wallet is connected', async () => {
    const p = await preview(base);
    expect(p?.placeholder).toBe(true);
    expect(p?.instructions.map((i) => i.name)).toEqual(['CreateAccountWithSeed', 'Initialize', 'Transfer', 'Memo']);

    const [create, init, transfer] = p!.instructions;
    expect(fieldOf(create, 'from (pays)')).toEqual({ label: 'from (pays)', value: 'your wallet', note: 'filled in when you connect' });
    expect(fieldOf(create, 'new account')?.value).toBe('made from your wallet address and the seed');
    expect(fieldOf(create, 'seed')).toMatchObject({ value: '"sl1-0"', note: 'or the next free number for your wallet' });
    expect(fieldOf(create, 'owner')?.value).toBe(STAKE_PROGRAM_ADDRESS);
    expect(fieldOf(init, 'withdrawer')?.value).toBe('your wallet');
    expect(fieldOf(init, 'lockup.unix_timestamp')?.value).toBe(utcMidnight(2032, 1, 1).toString());
    expect(fieldOf(init, 'lockup.epoch')?.value).toBe('0');
    expect(fieldOf(init, 'lockup.custodian')).toMatchObject({ value: CUSTODIAN_ADDRESS, note: 'off-curve, nobody has a key' });
    expect(fieldOf(transfer, 'to (fee)')?.value).toBe(FEE);

    expect(JSON.stringify(p!.instructions)).not.toContain(PREVIEW_WALLET);
  });

  it('fills in the wallet and seed once connected', async () => {
    const p = await preview(base, WALLET, 3);
    expect(p?.placeholder).toBe(false);
    const create = p!.instructions[0];
    expect(fieldOf(create, 'from (pays)')).toMatchObject({ value: WALLET, note: 'your wallet' });
    expect(fieldOf(create, 'seed')).toEqual({ label: 'seed', value: '"sl1-3"' });
    expect(fieldOf(create, 'new account')?.value).toBe(await lockAddress(WALLET, 3));
  });

  it('makes the gift recipient the withdrawer', async () => {
    const p = await preview({ ...base, gift: true, giftText: FRIEND });
    const init = p!.instructions[1];
    expect(fieldOf(init, 'staker')?.value).toBe(FRIEND);
    expect(fieldOf(init, 'withdrawer')?.value).toBe(FRIEND);
    expect(p?.plan.gift).toBe(true);
  });

  it('leaves out the fee for a test lock', async () => {
    const p = await preview({ ...base, wantsTestLock: true });
    expect(p?.instructions.map((i) => i.name)).toEqual(['CreateAccountWithSeed', 'Initialize', 'Memo']);
    expect(p?.plan.fee).toBe(0n);
  });

  it('shows nothing while the draft has problems', async () => {
    expect(await preview({ ...base, amountText: '' })).toBeNull();
    expect(await preview({ ...base, gift: true, giftText: CUSTODIAN_ADDRESS })).toBeNull();
  });
});
