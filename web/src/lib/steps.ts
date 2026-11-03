import { type Draft, type DraftInput, inputFromQuery } from './draft.ts';

/** The lock page asks one thing at a time, in this order. */
export type Step = 'amount' | 'date' | 'who' | 'confirm';

export const STEP_LABELS: Record<Step, string> = { amount: 'Amount', date: 'Date', who: 'Who', confirm: 'Confirm' };

/** A test lock has its amount and date fixed, so it skips the date. */
export function stepsFor(testLock: boolean): readonly Step[] {
  return testLock ? ['amount', 'who', 'confirm'] : ['amount', 'date', 'who', 'confirm'];
}

/**
 * The input a link starts with, and the first question it leaves open. The home page's start box
 * (amount and years) and its test lock link answer the first questions already; its buy button
 * (`?buy`) opens "Need Solana first?".
 */
export function startFromQuery(search: string): { input: DraftInput; step: Step; showBuy: boolean } {
  const query = new URLSearchParams(search);
  const input = inputFromQuery(search);
  const answered =
    input.wantsTestLock ||
    (query.get('amount')?.trim() === input.amountText && input.choice.kind === 'years' && query.get('years') === String(input.choice.years));
  return { input, step: answered ? 'who' : 'amount', showBuy: query.has('buy') };
}

/** Why "Continue" is still off on a step, or null. */
export function stepProblem(step: Step, draft: Draft): string | null {
  if (step === 'amount') return draft.amountProblem;
  if (step === 'date') return draft.unlockProblem;
  if (step === 'who') return draft.giftProblem;
  return null;
}

/** Steps show their problems next to the field once the user has typed there; Continue need not repeat them. */
export function problemShownInline(step: Step, input: DraftInput): boolean {
  if (step === 'amount') return input.amountText.trim() !== '';
  if (step === 'who') return input.giftText.trim() !== '';
  return step === 'date';
}

export function stepAfter(step: Step, testLock: boolean): Step {
  const steps = stepsFor(testLock);
  const index = steps.indexOf(step);
  return index < 0 ? 'confirm' : (steps[Math.min(index + 1, steps.length - 1)] as Step);
}

export function stepBefore(step: Step, testLock: boolean): Step | null {
  const steps = stepsFor(testLock);
  const index = steps.indexOf(step);
  return index > 0 ? (steps[index - 1] as Step) : null;
}
