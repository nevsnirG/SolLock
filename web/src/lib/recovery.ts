import type { Address, Signature } from '@solana/kit';
import { CUSTODIAN_ADDRESS, DAY, formatSol, isPlainLock, type LockView, type UnixSeconds } from '@sollock/core';
import type { Cluster } from '../config.ts';
import { unlockLabel, unlockLabelLong } from './dates.ts';
import type { LockResult } from './lockFlow.ts';

/** A lock just made, and the network it was made on. */
export type LockedFacts = LockResult & { cluster: Cluster };

/** Everything a recovery note can say. Made from a fresh lock, or from one read back later. */
export interface NoteFacts {
  lock: Address;
  unlockAt: UnixSeconds;
  lockedAmount: bigint;
  rent: bigint;
  withdrawer: Address;
  /** Who the withdrawer is, from the reader's side: "your wallet", "the gift recipient's wallet". */
  withdrawerLabel: string;
  /** The wallet and seed it was made from, when known. */
  madeFrom?: { wallet: Address; seed: string };
  signature?: Signature;
  /** When it was made, if known; otherwise the note says when it was written. */
  madeAt?: UnixSeconds;
  writtenAt: UnixSeconds;
  cluster: Cluster;
}

export function noteFactsFromLock(facts: LockedFacts): NoteFacts {
  const { plan } = facts;
  return {
    lock: plan.lockAddress,
    unlockAt: plan.unlockAt,
    lockedAmount: plan.amount,
    rent: plan.rent,
    withdrawer: plan.withdrawer,
    withdrawerLabel: plan.gift ? "the gift recipient's wallet" : 'your wallet',
    madeFrom: { wallet: plan.funder, seed: plan.seed },
    signature: facts.signature,
    madeAt: facts.lockedAt,
    writtenAt: facts.lockedAt,
    cluster: facts.cluster,
  };
}

/** For a lock found later on My locks: what the chain says, plus the seed if this wallet made it. */
export function noteFactsFromView(
  view: LockView,
  ctx: { wallet: Address | null; seed?: string; now: UnixSeconds; cluster: Cluster },
): NoteFacts | null {
  // The note vouches for the SolLock custodian and a date-only lockup; anything else gets no note.
  if (!view.withdrawer || view.unlockAt === undefined || !isPlainLock(view)) return null;
  const mine = ctx.wallet !== null && view.withdrawer === ctx.wallet;
  return {
    lock: view.address,
    unlockAt: view.unlockAt,
    lockedAmount: view.lockedAmount,
    rent: view.lamports - view.lockedAmount,
    withdrawer: view.withdrawer,
    withdrawerLabel: mine ? 'your wallet' : ctx.seed ? "the gift recipient's wallet" : 'the wallet that can withdraw it',
    madeFrom: ctx.seed && ctx.wallet ? { wallet: ctx.wallet, seed: ctx.seed } : undefined,
    writtenAt: ctx.now,
    cluster: ctx.cluster,
  };
}

const dayUtc = (at: UnixSeconds) => unlockLabel(at - (at % DAY));

/**
 * The recovery note: everything needed to find and withdraw the lock without SolLock, and never the
 * seed phrase. Plain text, so it can be copied, printed or saved anywhere.
 */
export function recoveryNote(note: NoteFacts, siteUrl: string): string {
  const host = siteUrl.replace(/^https?:\/\//, '');
  const cliUrl = note.cluster === 'devnet' ? ' --url devnet' : '';
  return [
    'SOLLOCK RECOVERY NOTE',
    note.madeAt !== undefined
      ? `Made ${dayUtc(note.madeAt)}. Keep it with your important papers.`
      : `Written ${dayUtc(note.writtenAt)}. Keep it with your important papers.`,
    '',
    'What this is',
    '  A Solana account with a built-in time lock (Solana calls',
    '  this kind a stake account). It stays shut for everyone',
    '  until the date below.',
    '',
    'Lock address (stake account)',
    `  ${note.lock}`,
    'Opens',
    `  ${unlockLabelLong(note.unlockAt)} (unix ${note.unlockAt})`,
    'Locked',
    `  ${formatSol(note.lockedAmount)} SOL, plus a ${formatSol(note.rent)} SOL deposit that comes back with it`,
    'Can withdraw it (withdraw authority)',
    `  ${note.withdrawer}`,
    `  ${note.withdrawerLabel}`,
    ...(note.madeFrom ? ['Made from', `  wallet ${note.madeFrom.wallet}, seed "${note.madeFrom.seed}"`] : []),
    'Custodian (the only key that could lift the lock early)',
    `  ${CUSTODIAN_ADDRESS}`,
    `  nobody has a key for it: ${host}/custodian`,
    'Network',
    `  Solana ${note.cluster}`,
    ...(note.signature ? ['Transaction', `  ${note.signature}`] : []),
    '',
    'How to get it out after the date',
    `  - On ${host}/my-locks: connect the wallet above`,
    '    and click Withdraw.',
    '  - Without SolLock: any tool that can withdraw from a stake',
    '    account, signed by the wallet above. With the Solana',
    '    command-line tool:',
    `      solana withdraw-stake ${note.lock} <your address> ALL --withdraw-authority <your keypair>${cliUrl}`,
    '  This works even if the SolLock website is gone.',
    '',
    'Never write your seed phrase on this note.',
    'Keep it separately and offline. Without it, the Solana is lost.',
  ].join('\n');
}

export interface Seller {
  tradeName: string;
  place: string;
  kvk: string | null;
  vat: string | null;
}

/** A receipt for our fee, made in the browser. Null for a free test lock: there is nothing to receipt. */
export function receiptText(facts: LockedFacts, seller: Seller, feeFiatValue?: string): string | null {
  const { plan } = facts;
  if (plan.fee === 0n) return null;
  return [
    'RECEIPT',
    `SolLock, ${seller.tradeName}, ${seller.place}`,
    ...registrationLine(seller),
    '',
    `Date           ${dayUtc(facts.lockedAt)}`,
    `Service        A time lock on Solana ${facts.cluster}, opening ${unlockLabel(plan.unlockAt)}`,
    `Lock           ${plan.lockAddress}`,
    `Fee            ${formatSol(plan.fee)} SOL`,
    `  of which VAT ${formatSol(plan.vat)} SOL (21%)`,
    ...(feeFiatValue ? [`Value          ${feeFiatValue}`] : []),
    `Paid in        transaction ${facts.signature}`,
  ].join('\n');
}

export const recoveryNoteFilename = (lock: Address) => `sollock-recovery-${lock.slice(0, 8)}.txt`;
export const receiptFilename = (lock: Address) => `sollock-receipt-${lock.slice(0, 8)}.txt`;

function registrationLine(seller: Seller): string[] {
  const parts = [seller.kvk && `KvK ${seller.kvk}`, seller.vat && `VAT ${seller.vat}`].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? [parts.join(', ')] : [];
}
