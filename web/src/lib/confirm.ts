import type { Draft } from './draft.ts';

/** The safeguards of SPEC.md section 9 that the user ticks or types before signing. */
export interface Confirmations {
  noEarlyUnlock: boolean;
  recoveryPhraseBackedUp: boolean;
  /** Gifts only: the recipient's address is a self-custody wallet, not an exchange deposit address. */
  recipientHoldsWallet: boolean;
  /** Consumer law: perform the service now, and the right of withdrawal ends once the lock exists. */
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

/** Why the sign button is still off, in plain words; empty when every safeguard is met. */
export function signBlockers(draft: Draft, confirmations: Confirmations): string[] {
  const { noEarlyUnlock, recoveryPhraseBackedUp, recipientHoldsWallet, withdrawalRightWaived, typedWord } = confirmations;
  const reasons: string[] = draft.problems.slice(0, 1);
  const ticked = noEarlyUnlock && recoveryPhraseBackedUp && withdrawalRightWaived && (!draft.gift || recipientHoldsWallet);
  if (!ticked) reasons.push('Tick every box above.');
  if (!isLockTyped(typedWord)) reasons.push('Type LOCK in the box.');
  return reasons;
}

/**
 * The terms the user agreed to. When any of them changes, the ticks and the typed LOCK are cleared,
 * so a tick never carries over to a different amount, date or recipient.
 */
export function termsKey(draft: Draft): string {
  return [draft.amount, draft.unlockAt, draft.gift ? draft.recipient : 'self'].join('|');
}
