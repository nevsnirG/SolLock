import type { Draft } from './draft.ts';

export interface Confirmations {
  noEarlyUnlock: boolean;
  recoveryPhraseBackedUp: boolean;
  recipientHoldsWallet: boolean;
  /** The consumer-law right of withdrawal (cooling-off), not a SOL withdrawal. */
  withdrawalRightWaived: boolean;
  typedWord: string;
}

export const NO_CONFIRMATIONS: Confirmations = {
  noEarlyUnlock: false,
  recoveryPhraseBackedUp: false,
  recipientHoldsWallet: false,
  withdrawalRightWaived: false,
  typedWord: '',
};

export const isLockTyped = (typedWord: string) => typedWord.trim().toUpperCase() === 'LOCK';

export function signBlockers(draft: Draft, confirmations: Confirmations): string[] {
  const { noEarlyUnlock, recoveryPhraseBackedUp, recipientHoldsWallet, withdrawalRightWaived, typedWord } = confirmations;
  const reasons: string[] = draft.problems.slice(0, 1);
  const ticked = noEarlyUnlock && recoveryPhraseBackedUp && withdrawalRightWaived && (!draft.gift || recipientHoldsWallet);
  if (!ticked) reasons.push('Tick every box above.');
  if (!isLockTyped(typedWord)) reasons.push('Type LOCK in the box.');
  return reasons;
}

export function termsKey(draft: Draft): string {
  return [draft.amount, draft.unlockAt, draft.gift ? draft.recipient : 'self'].join('|');
}
