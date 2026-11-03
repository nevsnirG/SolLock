import { FEE_BASIS_POINTS, feeRule, formatSol } from '@sollock/core';
import { Fragment, type ReactNode } from 'react';
import { type Confirmations, isLockTyped, signBlockers } from '../lib/confirm.ts';
import { BASE_NETWORK_FEE, walletOutflow } from '../lib/costs.ts';
import { localTime, unlockLabel } from '../lib/dates.ts';
import { type Draft, groupedAddress } from '../lib/draft.ts';
import { fiatValue, type Price, priceNote } from '../lib/money.ts';
import type { LockPreview } from '../lib/preview.ts';
import { isBusy, type SigningPhase } from '../lib/signing.ts';
import type { Step } from '../lib/steps.ts';
import type { Rent } from './hooks.ts';
import { SigningStatus } from './shared.tsx';
import type { SiteWallet } from './wallet.tsx';

interface ConfirmStepProps {
  draft: Draft;
  preview: LockPreview | null;
  rent: Rent;
  price: Price | null;
  confirmations: Confirmations;
  onConfirmations: (next: Partial<Confirmations>) => void;
  onEdit: (step: Step) => void;
  wallet: SiteWallet;
  phase: SigningPhase;
  onConnect: () => void;
  onSign: () => void;
}

export function ConfirmStep(props: ConfirmStepProps) {
  const { draft, preview, rent, price, confirmations, onConfirmations, onEdit, wallet, phase, onConnect, onSign } = props;
  const busy = isBusy(phase);
  const blockers = signBlockers(draft, confirmations);
  const submit = () => {
    if (blockers.length > 0 || busy) return;
    if (wallet.status !== 'connected') onConnect();
    else if (!wallet.signerProblem) onSign();
  };
  return (
    <>
      <h2 className="step-q" tabIndex={-1}>
        Check and lock
      </h2>
      <LockSummary draft={draft} rent={rent.lamports} price={price} onEdit={busy ? null : onEdit} />
      <CostBreakdown draft={draft} rent={rent} price={price} />
      {preview && <TransactionDetails preview={preview} />}
      <form
        className="safeguards"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <SafeguardChecks draft={draft} confirmations={confirmations} onChange={onConfirmations} disabled={busy} />
        <SignButton wallet={wallet} busy={busy} blocked={blockers.length > 0} />
        <div className="why-disabled" id="whyDisabled" aria-live="polite">
          <SignHint wallet={wallet} phase={phase} blockers={blockers} />
        </div>
      </form>
    </>
  );
}

function SummaryRow({ term, value, note, onChange }: { term: string; value: ReactNode; note?: ReactNode; onChange?: (() => void) | null }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        <b>{value}</b>
        {note}
      </dd>
      {onChange !== undefined && (
        <button type="button" className="link-btn" disabled={onChange === null} onClick={onChange ?? undefined}>
          Change
        </button>
      )}
    </div>
  );
}

function LockSummary({ draft, rent, price, onEdit }: { draft: Draft; rent: bigint; price: Price | null; onEdit: ((step: Step) => void) | null }) {
  const amount = draft.amount ?? 0n;
  const fiat = (lamports: bigint) => (price ? <small>{fiatValue(lamports, price)}</small> : null);
  const edit = (step: Step) => (onEdit ? () => onEdit(step) : null);
  const total = walletOutflow({ amount, rent, fee: draft.fee });
  return (
    <dl className="recap">
      <SummaryRow term={draft.testLock ? 'Free test lock' : 'You lock'} value={`${formatSol(amount)} SOL`} note={fiat(amount)} onChange={edit('amount')} />
      <SummaryRow
        term="Until"
        value={draft.unlockAt === null ? '…' : unlockLabel(draft.unlockAt)}
        note={draft.unlockAt !== null && <small>{localTime(draft.unlockAt)} your time</small>}
        onChange={edit(draft.testLock ? 'amount' : 'date')}
      />
      <SummaryRow
        term="Then it goes to"
        value={draft.gift ? 'Their wallet, as a gift' : 'You'}
        note={draft.gift && draft.recipient && <small className="address-groups">{groupedAddress(draft.recipient)}</small>}
        onChange={edit('who')}
      />
      <SummaryRow term="Our fee" value={draft.testLock ? 'Free' : `${formatSol(draft.fee)} SOL`} note={draft.testLock ? null : fiat(draft.fee)} />
      <div className="total">
        <dt>Leaves your wallet</dt>
        <dd>
          <b>≈ {formatSol(total)} SOL</b>
          {fiat(total)}
        </dd>
      </div>
    </dl>
  );
}

function feeDescription(draft: Draft): string {
  if (draft.amount === null || draft.testLock) return 'Free for a test lock';
  const rule = feeRule(draft.amount, draft.testLock);
  const basis = rule === 'minimum' ? 'The minimum fee' : `${Number(FEE_BASIS_POINTS) / 100}% of the amount`;
  return `${basis}, VAT included (${formatSol(draft.vat)} SOL)`;
}

function CostBreakdown({ draft, rent, price }: { draft: Draft; rent: Rent; price: Price | null }) {
  const row = (label: string, note: string, value: string) => (
    <tr>
      <td>
        {label}
        <small>{note}</small>
      </td>
      <td>{value}</td>
    </tr>
  );
  return (
    <details className="more">
      <summary>What's in the total</summary>
      <table className="ledger">
        <tbody>
          <tr>
            <td>Locked</td>
            <td>{formatSol(draft.amount ?? 0n)} SOL</td>
          </tr>
          {row('Rent deposit', 'Comes back when you take your Solana out', `${rent.fromNetwork ? '' : '≈ '}${formatSol(rent.lamports)} SOL`)}
          {row('Our fee', feeDescription(draft), `${formatSol(draft.fee)} SOL`)}
          {row('Network fee', "To Solana's validators", `≈ ${formatSol(BASE_NETWORK_FEE)} SOL`)}
        </tbody>
      </table>
      {price && (
        <p className="help">
          Values in {price.currency} {priceNote(price)}
        </p>
      )}
    </details>
  );
}

function TransactionDetails({ preview }: { preview: LockPreview }) {
  return (
    <details className="more">
      <summary>The full transaction</summary>
      <ol className="ix spaced">
        {preview.instructions.map((ix, index) => (
          <li key={index} className={ix.unknown ? 'unknown' : undefined}>
            <div className="prog">{ix.program}</div>
            <p className="name">{ix.name}</p>
            <p className="why">{ix.why}</p>
            <dl className="kv">
              {ix.fields.map((field) => (
                <Fragment key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>
                    {field.value}
                    {field.note && <em className={field.warning ? 'warning' : undefined}>{field.note}</em>}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      <p className="signers">
        Signed by your wallet alone.
        {preview.placeholder ? ' Your wallet address fills in when you connect.' : ''}
      </p>
    </details>
  );
}

function SafeguardChecks({
  draft,
  confirmations,
  onChange,
  disabled,
}: {
  draft: Draft;
  confirmations: Confirmations;
  onChange: (next: Partial<Confirmations>) => void;
  disabled: boolean;
}) {
  const box = (key: Exclude<keyof Confirmations, 'typedWord'>, label: string) => (
    <label className="check">
      <input type="checkbox" checked={confirmations[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />
      <span>{label}</span>
    </label>
  );
  const dateText = draft.unlockAt === null ? 'the date' : unlockLabel(draft.unlockAt);
  return (
    <fieldset className="plain" disabled={disabled}>
      <legend className="field-label">Before you lock</legend>
      <div className="checks">
        {box('noEarlyUnlock', `I understand nobody can unlock this before ${dateText}, including me and SolLock.`)}
        {box(
          'recoveryPhraseBackedUp',
          draft.gift
            ? "I have told the recipient to back up their wallet's recovery phrase. If they lose it, this Solana is gone for good."
            : "My wallet's recovery phrase is backed up. If I lose it, this Solana is gone for good.",
        )}
        {draft.gift && box('recipientHoldsWallet', 'The address belongs to a wallet the recipient holds themselves.')}
        {box('withdrawalRightWaived', 'I ask you to create the lock now. I understand I lose my right of withdrawal once it exists.')}
      </div>
      <div className="type-lock">
        <label htmlFor="typeLock">
          Type <strong>LOCK</strong> to confirm
        </label>
        <input
          id="typeLock"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          placeholder="LOCK"
          value={confirmations.typedWord}
          aria-describedby="whyDisabled"
          onChange={(event) => onChange({ typedWord: event.target.value })}
        />
        {isLockTyped(confirmations.typedWord) && (
          <span className="okmark" aria-label="Typed correctly">
            ✓
          </span>
        )}
      </div>
    </fieldset>
  );
}

function SignButton({ wallet, busy, blocked }: { wallet: SiteWallet; busy: boolean; blocked: boolean }) {
  if (wallet.status !== 'connected') {
    return (
      <button type="submit" className="btn wide big cta" disabled={wallet.status === 'connecting' || blocked}>
        {wallet.status === 'connecting' ? 'Connecting…' : 'Connect your wallet to sign'}
      </button>
    );
  }
  return (
    <button type="submit" className="btn wide big cta" disabled={busy || blocked || wallet.signerProblem !== null}>
      {busy ? 'Locking…' : `Sign in ${wallet.displayName}`}
    </button>
  );
}

function SignHint({ wallet, phase, blockers }: { wallet: SiteWallet; phase: SigningPhase; blockers: string[] }) {
  if (wallet.signerProblem) return <p className="err">{wallet.signerProblem}</p>;
  if (phase.kind !== 'idle') return <SigningStatus phase={phase} walletName={wallet.displayName} />;
  if (blockers.length > 0) return <>Still to do: {blockers.join(' ')}</>;
  if (wallet.status === 'connected') return <>Your wallet shows the transaction once more before you approve it.</>;
  return <>Next: connect your wallet, then approve the lock in it.</>;
}
