import { STEP_LABELS, type Step } from '../lib/steps.ts';

/** Where the user is in the steps, as a row of bars; steps already answered can be revisited. */
export function StepProgress({ steps, current, onGo, disabled }: { steps: readonly Step[]; current: Step; onGo: (step: Step) => void; disabled: boolean }) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className="progress" aria-label={`Step ${currentIndex + 1} of ${steps.length}`}>
      {steps.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'now' : 'todo';
        const label = (
          <>
            <span className="bar" aria-hidden="true"></span>
            {STEP_LABELS[step]}
          </>
        );
        return (
          <li key={step} className={state} aria-current={state === 'now' ? 'step' : undefined}>
            {state === 'done' && !disabled ? (
              <button type="button" onClick={() => onGo(step)}>
                {label}
              </button>
            ) : (
              <span>{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface StepNavProps {
  onBack: (() => void) | null;
  /** Null on the last step, which signs instead. */
  onContinue: (() => void) | null;
  /** Why Continue is off, when the step doesn't show it next to its field already. */
  problem: string | null;
  canContinue: boolean;
  busy: boolean;
}

export function StepNav({ onBack, onContinue, problem, canContinue, busy }: StepNavProps) {
  return (
    <>
      <div className="step-nav">
        {onBack ? (
          <button type="button" className="btn ghost big" disabled={busy} onClick={onBack}>
            Back
          </button>
        ) : (
          <span></span>
        )}
        {onContinue && (
          <button type="button" className="btn big" disabled={!canContinue} onClick={onContinue}>
            Continue
          </button>
        )}
      </div>
      {onContinue && problem && <p className="step-why">{problem}</p>}
    </>
  );
}
