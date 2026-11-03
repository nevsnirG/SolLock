import { type Draft, type DraftInput, inputFromQuery } from './draft.ts';

export type Step = 'amount' | 'date' | 'who' | 'confirm';

export const STEP_LABELS: Record<Step, string> = { amount: 'Amount', date: 'Date', who: 'Who', confirm: 'Confirm' };

export function stepsFor(testLock: boolean): readonly Step[] {
  return testLock ? ['amount', 'who', 'confirm'] : ['amount', 'date', 'who', 'confirm'];
}

export function startFromQuery(search: string): { input: DraftInput; step: Step; showBuy: boolean } {
  const query = new URLSearchParams(search);
  const input = inputFromQuery(search);
  const answered =
    input.wantsTestLock ||
    (query.get('amount')?.trim() === input.amountText && input.choice.kind === 'years' && query.get('years') === String(input.choice.years));
  return { input, step: answered ? 'who' : 'amount', showBuy: query.has('buy') };
}

export function stepProblem(step: Step, draft: Draft): string | null {
  if (step === 'amount') return draft.amountProblem;
  if (step === 'date') return draft.unlockProblem;
  if (step === 'who') return draft.giftProblem;
  return null;
}

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
