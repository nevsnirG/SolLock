import type { UnixSeconds } from '@sollock/core';
import { localTime, unlockLabel, utcYear } from '../lib/dates.ts';
import type { Draft, DraftInput } from '../lib/draft.ts';
import {
  availableNewYears,
  defaultCustomDate,
  MAX_DATE_INPUT,
  minDateInput,
  sameChoice,
  type UnlockChoice,
  unlockAtFor,
  YEAR_PRESETS,
} from '../lib/unlockDate.ts';
import { Choice } from './shared.tsx';

interface DateStepProps {
  input: DraftInput;
  draft: Draft;
  now: UnixSeconds;
  onChange: (next: Partial<DraftInput>) => void;
}

export function DateStep({ input, draft, now, onChange }: DateStepProps) {
  const choice = input.choice;
  const pick = (next: UnlockChoice) => onChange({ choice: next });
  return (
    <>
      <h2 className="step-q" tabIndex={-1}>
        Until when?
      </h2>
      <p className="step-hint">Before this date, nobody can take it out.</p>
      <UnlockChoices choice={choice} now={now} onPick={pick} />
      {choice.kind === 'newYear' && <NewYearPicker year={choice.year} years={availableNewYears(now)} onPick={(year) => pick({ kind: 'newYear', year })} />}
      {choice.kind === 'custom' && <CustomDateField date={choice.date} now={now} onPick={(date) => pick({ kind: 'custom', date })} />}
      <UnlockSummary draft={draft} />
    </>
  );
}

function UnlockChoices({ choice, now, onPick }: { choice: UnlockChoice; now: UnixSeconds; onPick: (choice: UnlockChoice) => void }) {
  const newYears = availableNewYears(now);
  return (
    <div className="choices" role="radiogroup" aria-label="Lock until">
      {YEAR_PRESETS.map((years) => {
        const at = unlockAtFor({ kind: 'years', years }, now);
        return (
          <Choice
            key={years}
            name="when"
            checked={sameChoice(choice, { kind: 'years', years })}
            onPick={() => onPick({ kind: 'years', years })}
            title={years === 1 ? '1 year' : `${years} years`}
            aside={at === null ? undefined : unlockLabel(at)}
          />
        );
      })}
      {newYears.length > 0 && (
        <Choice
          name="when"
          checked={choice.kind === 'newYear'}
          onPick={() => onPick({ kind: 'newYear', year: choice.kind === 'newYear' ? choice.year : (newYears[0] as number) })}
          title="New Year's Day"
          aside="1 January"
        />
      )}
      <Choice
        name="when"
        checked={choice.kind === 'custom'}
        onPick={() => onPick({ kind: 'custom', date: choice.kind === 'custom' ? choice.date : defaultCustomDate(now) })}
        title="A date you pick"
      />
    </div>
  );
}

function NewYearPicker({ year, years, onPick }: { year: number; years: number[]; onPick: (year: number) => void }) {
  return (
    <div className="pills" role="radiogroup" aria-label="Which New Year's Day">
      {years.map((option) => (
        <button key={option} type="button" role="radio" aria-checked={option === year} className={option === year ? 'pill is-on' : 'pill'} onClick={() => onPick(option)}>
          1 Jan {option}
        </button>
      ))}
    </div>
  );
}

function CustomDateField({ date, now, onPick }: { date: string; now: UnixSeconds; onPick: (date: string) => void }) {
  return (
    <div className="spaced">
      <label htmlFor="customDate" className="vh">
        Unlock date
      </label>
      <input className="date-input" type="date" id="customDate" min={minDateInput(now)} max={MAX_DATE_INPUT} value={date} onChange={(event) => onPick(event.target.value)} />
    </div>
  );
}

function UnlockSummary({ draft }: { draft: Draft }) {
  return (
    <>
      {draft.unlockProblem && (
        <p className="err" role="alert">
          {draft.unlockProblem}
        </p>
      )}
      {draft.unlockAt !== null && (
        <p className="opens" aria-live="polite">
          It opens on <b>{localTime(draft.unlockAt)}</b>, your time.
        </p>
      )}
      {draft.longLock && draft.unlockAt !== null && (
        <div className="note warn">More than 10 years away. Wallet apps will change: who will still have your recovery phrase in {utcYear(draft.unlockAt)}?</div>
      )}
    </>
  );
}
