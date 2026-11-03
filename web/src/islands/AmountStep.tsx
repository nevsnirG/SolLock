import { type Currency, CURRENCIES, formatSol, TEST_LOCK_AMOUNT } from '@sollock/core';
import { useEffect, useRef } from 'react';
import { AFFILIATE_NOTE, EXCHANGES, liveOffer, OFFERS_NOTE } from '../config.ts';
import { walletOutflow } from '../lib/costs.ts';
import type { Draft, DraftInput } from '../lib/draft.ts';
import { fiatValue, type Price, priceNote } from '../lib/money.ts';
import { ExternalLink } from './shared.tsx';

const QUICK_AMOUNTS = ['0.5', '1', '2', '5', '10'];
const TEST_LOCK_SOL = `${formatSol(TEST_LOCK_AMOUNT)} SOL`;

interface AmountStepProps {
  input: DraftInput;
  draft: Draft;
  price: Price | null;
  currency: Currency;
  /** The connected wallet's balance, when known. */
  balance: bigint | null;
  rent: bigint;
  onChange: (next: Partial<DraftInput>) => void;
  onCurrency: (currency: Currency) => void;
  onToggleTestLock: () => void;
  /** Opened from the home page's buy button: start with "Need Solana first?" open and in view. */
  showBuy: boolean;
}

export function AmountStep({ input, draft, price, currency, balance, rent, onChange, onCurrency, onToggleTestLock, showBuy }: AmountStepProps) {
  if (input.wantsTestLock) return <TestLockIntro onRealAmount={onToggleTestLock} />;
  const tooMuch = balance !== null && draft.amount !== null && walletOutflow({ amount: draft.amount, rent, fee: draft.fee }) > balance;
  return (
    <>
      <h2 className="step-q" tabIndex={-1}>
        How much Solana do you want to lock?
      </h2>
      <TestLockOffer onTry={onToggleTestLock} />
      <AmountField input={input} draft={draft} onChange={onChange} />
      <FiatValueLine draft={draft} price={price} currency={currency} onCurrency={onCurrency} />
      {balance !== null && <WalletBalanceLine balance={balance} tooMuch={tooMuch} />}
      <BuySolana open={showBuy} />
    </>
  );
}

function TestLockIntro({ onRealAmount }: { onRealAmount: () => void }) {
  return (
    <>
      <h2 className="step-q" tabIndex={-1}>
        A free test lock
      </h2>
      <p className="step-hint">{TEST_LOCK_SOL} that opens again tomorrow, with no fee. You see how locking and taking it out work before you lock more.</p>
      <button type="button" className="link-btn" onClick={onRealAmount}>
        Lock a real amount instead
      </button>
    </>
  );
}

function TestLockOffer({ onTry }: { onTry: () => void }) {
  return (
    <div className="test-card">
      <p>
        <b>New here?</b> Try a free test lock first: {TEST_LOCK_SOL} that opens again tomorrow.
      </p>
      <button type="button" className="btn ghost small" onClick={onTry}>
        Try a free test lock
      </button>
    </div>
  );
}

function AmountField({ input, draft, onChange }: Pick<AmountStepProps, 'input' | 'draft' | 'onChange'>) {
  return (
    <>
      <label className="vh" htmlFor="amount">
        Amount in SOL
      </label>
      <div className="big-amount">
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={input.amountText}
          aria-invalid={draft.amountProblem ? true : undefined}
          aria-describedby="amountHelp"
          onChange={(event) => onChange({ amountText: event.target.value })}
        />
        <span>SOL</span>
      </div>
      <div className="pills" aria-label="Quick amounts">
        {QUICK_AMOUNTS.map((amount) => (
          <button key={amount} type="button" className={input.amountText === amount ? 'pill is-on' : 'pill'} onClick={() => onChange({ amountText: amount })}>
            {amount} SOL
          </button>
        ))}
      </div>
      {draft.amountProblem && input.amountText.trim() !== '' && (
        <p className="err" role="alert">
          {draft.amountProblem}
        </p>
      )}
    </>
  );
}

function FiatValueLine({ draft, price, currency, onCurrency }: Pick<AmountStepProps, 'draft' | 'price' | 'currency' | 'onCurrency'>) {
  return (
    <p className="help" id="amountHelp">
      {price && draft.amount !== null && (
        <>
          <strong>{fiatValue(draft.amount, price)}</strong> {priceNote(price)}{' '}
        </>
      )}
      <label className="vh" htmlFor="currency">
        Currency
      </label>
      <select id="currency" className="select" value={currency} onChange={(event) => onCurrency(event.target.value as Currency)}>
        {CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </p>
  );
}

function WalletBalanceLine({ balance, tooMuch }: { balance: bigint; tooMuch: boolean }) {
  return (
    <p className={tooMuch ? 'err' : 'help'}>
      Your wallet holds {formatSol(balance)} SOL.
      {tooMuch && ' This lock needs more, with the deposit and fees.'}
    </p>
  );
}

function BuySolana({ open }: { open: boolean }) {
  const card = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (open) card.current?.scrollIntoView({ block: 'center' });
  }, [open]);
  const today = new Date();
  const anyOffer = EXCHANGES.some((exchange) => liveOffer(exchange, today) !== null);
  return (
    <details className="buy-card" open={open} ref={card}>
      <summary>
        <span className="buy-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17v3" />
            <path d="M3 7.5V17a2.5 2.5 0 0 0 2.5 2.5H20V8H5.5A2.5 2.5 0 0 1 3 7.5z" />
            <circle cx="16" cy="13.75" r="1.25" />
          </svg>
        </span>
        <span>
          <b>Need Solana first?</b>
          <small>Buy it on an exchange, then send it to your wallet.</small>
        </span>
      </summary>
      <div className="buy-links">
        {EXCHANGES.map((exchange) => {
          const offer = liveOffer(exchange, today);
          return (
            <ExternalLink key={exchange.name} href={exchange.url} className="exchange" sponsored>
              <b>{exchange.name}</b>
              {offer && <small>{offer}</small>}
            </ExternalLink>
          );
        })}
      </div>
      <p className="fine">
        {AFFILIATE_NOTE} {anyOffer && `${OFFERS_NOTE} `}Crypto prices can fall, and you can lose money.
      </p>
    </details>
  );
}
