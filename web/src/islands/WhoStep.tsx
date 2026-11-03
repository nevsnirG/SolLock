import { type Draft, type DraftInput, readAloudHint } from '../lib/draft.ts';
import { Choice } from './shared.tsx';

interface WhoStepProps {
  input: DraftInput;
  draft: Draft;
  giftWarnings: string[];
  onChange: (next: Partial<DraftInput>) => void;
}

export function WhoStep({ input, draft, giftWarnings, onChange }: WhoStepProps) {
  return (
    <>
      <h2 className="step-q" tabIndex={-1}>
        Who can take it out on that date?
      </h2>
      <div className="choices" role="radiogroup" aria-label="Who gets it">
        <Choice name="recipient" checked={!input.gift} onPick={() => onChange({ gift: false })} title="Me">
          You take it out with the wallet you lock it from.
        </Choice>
        <Choice name="recipient" checked={input.gift} onPick={() => onChange({ gift: true })} title="Someone else, as a gift">
          From the date on, it is theirs alone to take out.
        </Choice>
      </div>
      {input.gift && <GiftAddressField text={input.giftText} draft={draft} warnings={giftWarnings} onText={(giftText) => onChange({ giftText })} />}
    </>
  );
}

function GiftAddressField({ text, draft, warnings, onText }: { text: string; draft: Draft; warnings: string[]; onText: (text: string) => void }) {
  const typed = text.trim() !== '';
  return (
    <div className="spaced">
      <label htmlFor="giftAddr" className="field-label">
        Their Solana wallet address
      </label>
      <input
        className="text-input"
        id="giftAddr"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-invalid={draft.giftProblem && typed ? true : undefined}
        onChange={(event) => onText(event.target.value)}
      />
      {draft.recipient && !draft.giftProblem && <p className="help">{readAloudHint(draft.recipient)}</p>}
      {draft.giftProblem && typed && (
        <p className="err" role="alert">
          {draft.giftProblem}
        </p>
      )}
      {warnings.map((warning) => (
        <div key={warning} className="note warn">
          {warning}
        </div>
      ))}
      <div className="note warn">
        Use the address of a wallet they hold themselves, like Phantom or Solflare. A lock sent to an exchange deposit address may result in loss of funds.
      </div>
    </div>
  );
}
