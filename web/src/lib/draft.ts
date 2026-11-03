import { type Address, getAddressDecoder, type TransactionSigner } from '@solana/kit';
import {
  AmountError,
  giftAddressProblem,
  isLongLock,
  isTestLock,
  type LockRequest,
  lockFee,
  MIN_LOCK_AMOUNT,
  MIN_LOCK_AMOUNT_PROBLEM,
  parseSol,
  TEST_LOCK_AMOUNT,
  testLockUnlockAt,
  type UnixSeconds,
  unlockTimeProblem,
  vatShare,
} from '@sollock/core';
import { DEFAULT_CHOICE, type UnlockChoice, unlockAtFor, YEAR_PRESETS } from './unlockDate.ts';

export const PREVIEW_WALLET: Address = getAddressDecoder().decode(new Uint8Array(32).fill(0x5a));

export interface DraftInput {
  amountText: string;
  wantsTestLock: boolean;
  choice: UnlockChoice;
  gift: boolean;
  giftText: string;
}

export const EMPTY_INPUT: DraftInput = { amountText: '1', wantsTestLock: false, choice: DEFAULT_CHOICE, gift: false, giftText: '' };

export function inputFromQuery(search: string): DraftInput {
  const query = new URLSearchParams(search);
  const amount = (query.get('amount') ?? '').trim();
  const years = Number(query.get('years'));
  return {
    ...EMPTY_INPUT,
    wantsTestLock: query.has('test'),
    amountText: /^\d{1,9}(\.\d{1,9})?$/.test(amount) ? amount : EMPTY_INPUT.amountText,
    choice: (YEAR_PRESETS as readonly number[]).includes(years) ? { kind: 'years', years } : DEFAULT_CHOICE,
  };
}

export interface DraftContext {
  now: UnixSeconds;
  feeAddress: Address;
  wallet?: Address | undefined;
}

export interface Draft {
  amount: bigint | null;
  amountProblem: string | null;
  unlockAt: UnixSeconds | null;
  unlockProblem: string | null;
  longLock: boolean;
  gift: boolean;
  recipient: Address | null;
  giftProblem: string | null;
  /** Worked out from amount and date, never from wantsTestLock, because it waives the fee. */
  testLock: boolean;
  fee: bigint;
  vat: bigint;
  problems: string[];
}

export function draftLock(input: DraftInput, ctx: DraftContext): Draft {
  const { amount, amountProblem } = parseAmountInput(input);
  const unlockAt = input.wantsTestLock ? testLockUnlockAt(ctx.now) : unlockAtFor(input.choice, ctx.now);
  const unlockProblem = unlockAt === null ? 'Pick a date.' : unlockTimeProblem(unlockAt, ctx.now);
  const { recipient, giftProblem } = checkGiftInput(input, ctx);
  const testLock = amount !== null && unlockAt !== null && isTestLock(amount, unlockAt, ctx.now);
  const fee = amount === null ? 0n : lockFee(amount, testLock);
  return {
    amount,
    amountProblem,
    unlockAt: unlockProblem ? null : unlockAt,
    unlockProblem,
    longLock: unlockAt !== null && !unlockProblem && isLongLock(unlockAt, ctx.now),
    gift: input.gift,
    recipient,
    giftProblem,
    testLock,
    fee,
    vat: vatShare(fee),
    problems: [amountProblem, unlockProblem, giftProblem].filter((problem): problem is string => problem !== null),
  };
}

function parseAmountInput(input: DraftInput): { amount: bigint | null; amountProblem: string | null } {
  if (input.wantsTestLock) return { amount: TEST_LOCK_AMOUNT, amountProblem: null };
  try {
    const amount = parseSol(input.amountText);
    return amount < MIN_LOCK_AMOUNT ? { amount: null, amountProblem: MIN_LOCK_AMOUNT_PROBLEM } : { amount, amountProblem: null };
  } catch (error) {
    if (!(error instanceof AmountError)) throw error;
    return { amount: null, amountProblem: error.message };
  }
}

function checkGiftInput(input: DraftInput, ctx: DraftContext): { recipient: Address | null; giftProblem: string | null } {
  if (!input.gift) return { recipient: null, giftProblem: null };
  const text = input.giftText.trim();
  if (text === '') return { recipient: null, giftProblem: "Enter the recipient's Solana address." };
  const giftProblem = giftAddressProblem(text, { funder: ctx.wallet ?? PREVIEW_WALLET, feeAddress: ctx.feeAddress });
  return giftProblem ? { recipient: null, giftProblem } : { recipient: text as Address, giftProblem: null };
}

export function withNetworkGiftProblem(draft: Draft, problem: string | null): Draft {
  if (!draft.gift || draft.giftProblem !== null || problem === null) return draft;
  return { ...draft, giftProblem: problem, problems: [...draft.problems, problem] };
}

export type CompleteDraft = Draft & { amount: bigint; unlockAt: UnixSeconds };

export function isCompleteDraft(draft: Draft): draft is CompleteDraft {
  return draft.problems.length === 0 && draft.amount !== null && draft.unlockAt !== null;
}

export function lockRequestFromDraft(
  draft: CompleteDraft,
  ctx: { funder: TransactionSigner; seedIndex: number; rent: bigint; feeAddress: Address; now: UnixSeconds },
): LockRequest {
  return {
    ...ctx,
    recipient: draft.gift ? (draft.recipient ?? undefined) : undefined,
    amount: draft.amount,
    unlockAt: draft.unlockAt,
  };
}

export function readAloudHint(address: string): string {
  return `Read it back with them: starts ${address.slice(0, 4)}, ends ${address.slice(-4)}.`;
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** Every character in view, not just the ends, so a look-alike address stands out. */
export const groupedAddress = (address: string) => address.match(/.{1,4}/g)?.join(' ') ?? address;
