import { formatSol } from '@sollock/core';
import { useEffect, useRef } from 'react';
import { BUSINESS, CLUSTER, explorerAddressUrl, explorerTxUrl, SITE_URL } from '../config.ts';
import { localTime, unlockLabel } from '../lib/dates.ts';
import { shortAddress } from '../lib/draft.ts';
import { durationText } from '../lib/duration.ts';
import type { LockResult } from '../lib/lockFlow.ts';
import { fiatValue, type Price, priceNote } from '../lib/money.ts';
import { type LockedFacts, noteFactsFromLock, receiptFilename, receiptText, recoveryNote, recoveryNoteFilename } from '../lib/recovery.ts';
import { useNow } from './hooks.ts';
import { ExternalLink } from './shared.tsx';
import { TextPanel } from './TextPanel.tsx';

export function Success({ result, price, onAnother }: { result: LockResult; price: Price | null; onAnother: () => void }) {
  const { now } = useNow(60_000);
  const heading = useRef<HTMLHeadingElement>(null);
  const { plan } = result;
  const facts: LockedFacts = { ...result, cluster: CLUSTER };
  const feeValue = price && plan.fee > 0n ? `${fiatValue(plan.fee, price)} ${priceNote(price)}` : undefined;
  const receipt = receiptText(facts, BUSINESS, feeValue);

  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, []);

  return (
    <section className="done-screen" aria-labelledby="successTitle">
      <div className="done-head">
        <span className="done-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 id="successTitle" tabIndex={-1} ref={heading}>
          Locked until {unlockLabel(plan.unlockAt)}
        </h1>
        <p>
          {formatSol(plan.amount)} SOL is locked{plan.gift ? ` as a gift for ${shortAddress(plan.withdrawer)}` : ''}, and the network confirms it. It
          opens in {durationText(now, plan.unlockAt)}, on {localTime(plan.unlockAt)} your time.
        </p>
      </div>

      <RecoveryNoteCard facts={facts} />
      {plan.testLock && <p className="opens">Come back after {unlockLabel(plan.unlockAt)} and withdraw it on My locks, so you know how that works.</p>}

      <div className="done-actions">
        <a className="btn big cta" href="/my-locks">
          See it on My locks
        </a>
        <button type="button" className="btn big ghost" onClick={onAnother}>
          Make another lock
        </button>
      </div>

      <LockDetails result={result} />
      {receipt && (
        <details className="more">
          <summary>Receipt for the fee</summary>
          <TextPanel text={receipt} filename={receiptFilename(plan.lockAddress)} part="receipt" />
        </details>
      )}
    </section>
  );
}

function RecoveryNoteCard({ facts }: { facts: LockedFacts }) {
  return (
    <div className="flow-card">
      <h2 className="card-title">Save your recovery note</h2>
      <p className="step-hint">It says where this lock is and how to take it out, even without SolLock. Keep it in a password manager or with your important papers.</p>
      <TextPanel text={recoveryNote(noteFactsFromLock(facts), SITE_URL)} filename={recoveryNoteFilename(facts.plan.lockAddress)} part="note" folded />
      {facts.plan.gift && <p className="opens">Send the recipient a copy too, so they can find their gift.</p>}
      <p className="help">Keep your wallet's recovery phrase somewhere else, offline.</p>
    </div>
  );
}

function LockDetails({ result: { plan, signature } }: { result: LockResult }) {
  return (
    <details className="more">
      <summary>Lock details</summary>
      <dl className="facts">
        <dt>Lock address</dt>
        <dd>
          <ExternalLink className="addr" href={explorerAddressUrl(plan.lockAddress)}>
            {plan.lockAddress}
          </ExternalLink>
        </dd>
        {plan.gift && (
          <>
            <dt>Goes to</dt>
            <dd>
              <span className="addr">{plan.withdrawer}</span>
            </dd>
          </>
        )}
        <dt>Transaction</dt>
        <dd>
          <ExternalLink className="addr" href={explorerTxUrl(signature)}>
            {signature}
          </ExternalLink>
        </dd>
      </dl>
    </details>
  );
}
