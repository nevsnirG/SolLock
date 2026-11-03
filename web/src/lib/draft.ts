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

/**
 * Stands in for the wallet until one is connected, so the preview can show the real instructions.
 * The page shows it as "your wallet"; nothing is ever signed with it.
 */
export const PREVIEW_WALLET: Address = getAddressDecoder().decode(new Uint8Array(32).fill(0x5a));

/** What the user has filled in so far. */
export interface DraftInput {
  amountText: string;
  /** The free test lock: 0.01 SOL, opening about 24 hours from now. */
  wantsTestLock: boolean;
  choice: UnlockChoice;
  gift: boolean;
  giftText: string;
}

export const EMPTY_INPUT: DraftInput = { amountText: '1', wantsTestLock: false, choice: DEFAULT_CHOICE, gift: false, giftText: '' };

/**
 * Where the lock page starts: ?test for the free test lock, or the home page's start box
 * (?amount=…&years=…). Anything unexpected falls back to the defaults.
 */
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
  /** The connected wallet, once there is one. */
  wallet?: Address | undefined;
}

/** The input checked and worked out: what the lock would be, and what is still wrong with it. */
export interface Draft {
  amount: bigint | null;
  amountProblem: string | null;
  unlockAt: UnixSeconds | null;
  unlockProblem: string | null;
  /** More than 10 years away: warn that wallets will change. */
  longLock: boolean;
  gift: boolean;
  /** The gift recipient, once the address passes every check. */
  recipient: Address | null;
  giftProblem: string | null;
  /** Exactly 0.01 SOL, opening within about a day. Worked out, never taken from the button. */
  testLock: boolean;
  fee: bigint;
  vat: bigint;
  /** Every problem, in the order of the steps. */
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

/** What the network says about the gift address (owned by a program, say) joins the draft's own checks. */
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

/** "Read it back with them: starts 7xKX, ends 9fGh." For a gift address that passed its checks. */
export function readAloudHint(address: string): string {
  return `Read it back with them: starts ${address.slice(0, 4)}, ends ${address.slice(-4)}.`;
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** The whole address in groups of four, so every character gets compared, not just the ends. */
export const groupedAddress = (address: string) => address.match(/.{1,4}/g)?.join(' ') ?? address;
