import { address } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { type Confirmations, isLockTyped, NO_CONFIRMATIONS, signBlockers, termsKey } from '../src/lib/confirm.ts';
import { type DraftInput, draftLock } from '../src/lib/draft.ts';

const NOW = BigInt(Date.UTC(2026, 10, 1, 14, 30) / 1000);
const ctx = { now: NOW, feeAddress: address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv') };
const FRIEND = 'J25CTTarrkbvpzX2W8yhmq85ybb9XFY2Ki33D1bdHD1c';
const base: DraftInput = { amountText: '2', wantsTestLock: false, choice: { kind: 'years', years: 1 }, gift: false, giftText: '' };
const all: Confirmations = { noEarlyUnlock: true, recoveryPhraseBackedUp: true, recipientHoldsWallet: false, withdrawalRightWaived: true, typedWord: 'lock ' };

describe('the sign safeguards', () => {
  it('stay off until every box is ticked and LOCK is typed', () => {
    const draft = draftLock(base, ctx);
    expect(signBlockers(draft, NO_CONFIRMATIONS)).toEqual(['Tick every box above.', 'Type LOCK in the box.']);
    expect(signBlockers(draft, { ...all, withdrawalRightWaived: false })).toEqual(['Tick every box above.']);
    expect(signBlockers(draft, { ...all, typedWord: 'LOK' })).toEqual(['Type LOCK in the box.']);
    expect(signBlockers(draft, all)).toEqual([]);
  });

  it('ask a gift giver to confirm the address is a self-custody wallet', () => {
    const draft = draftLock({ ...base, gift: true, giftText: FRIEND }, ctx);
    expect(signBlockers(draft, all)).toEqual(['Tick every box above.']);
    expect(signBlockers(draft, { ...all, recipientHoldsWallet: true })).toEqual([]);
  });

  it('name the first problem in the form', () => {
    const draft = draftLock({ ...base, amountText: '' }, ctx);
    expect(signBlockers(draft, all)).toEqual(['Enter an amount.']);
  });

  it('accept LOCK in any case, but nothing else', () => {
    expect(isLockTyped(' Lock')).toBe(true);
    expect(isLockTyped('LOCKED')).toBe(false);
  });

  it('reset when the amount, date or recipient changes', () => {
    const a = termsKey(draftLock(base, ctx));
    expect(termsKey(draftLock({ ...base, amountText: '2.0' }, ctx))).toBe(a);
    expect(termsKey(draftLock({ ...base, amountText: '3' }, ctx))).not.toBe(a);
    expect(termsKey(draftLock({ ...base, choice: { kind: 'years', years: 5 } }, ctx))).not.toBe(a);
    expect(termsKey(draftLock({ ...base, gift: true, giftText: FRIEND }, ctx))).not.toBe(a);
  });
});
