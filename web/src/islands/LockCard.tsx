import type { Address } from '@solana/kit';
import { formatSol, isPlainLock, type LockView, lockViewAt, type UnixSeconds, type UnlockAction } from '@sollock/core';
import { CLUSTER, explorerAddressUrl, SITE_URL } from '../config.ts';
import { lockAction, lockCardTitle, lockCardWhen, type LockRow } from '../lib/myLocks.ts';
import { noteFactsFromView, recoveryNote, recoveryNoteFilename } from '../lib/recovery.ts';
import { isBusy, type SigningPhase } from '../lib/signing.ts';
import { ExternalLink, SigningStatus } from './shared.tsx';
import { TextPanel } from './TextPanel.tsx';
import type { SiteWallet } from './wallet.tsx';

/** What every card on My locks shares: the wallet, the clock, and how to act on a lock. */
export interface CardContext {
  wallet: SiteWallet;
  now: UnixSeconds;
  phaseOf: (lock: Address) => SigningPhase;
  onAction: (action: UnlockAction, lock: Address) => void;
  openNoteFor: Address | null;
  onToggleNote: (lock: Address) => void;
}

export function LockCard({ row, context }: { row: LockRow; context: CardContext }) {
  const { wallet, now } = context;
  const view = lockViewAt(row.view, now);
  const phase = context.phaseOf(view.address);
  const open = !view.lockedNow;
  const noteFacts = noteFactsFromView(view, { wallet: wallet.address, seed: row.seed, now, cluster: CLUSTER });
  const noteOpen = noteFacts !== null && context.openNoteFor === view.address;
  return (
    <article className={open ? 'lock-card is-open' : 'lock-card'}>
      <div className="lc-top">
        <div>
          <p className="lc-who">{lockCardTitle(row, wallet.address)}</p>
          <p className="lc-amt">{formatSol(view.lockedAmount)} SOL</p>
          <p className="lc-when">{lockCardWhen(view, now)}</p>
        </div>
        <LockBadge open={open} />
      </div>
      <LockWarnings view={view} />
      <LockActions
        action={lockAction(view, wallet.address)}
        busy={isBusy(phase) || !wallet.signer}
        hasNote={noteFacts !== null}
        noteOpen={noteOpen}
        onAction={(action) => context.onAction(action, view.address)}
        onToggleNote={() => context.onToggleNote(view.address)}
        explorerUrl={explorerAddressUrl(view.address)}
      />
      <SigningStatus phase={phase} walletName={wallet.displayName} />
      {noteOpen && noteFacts && (
        <div className="note-panel">
          <TextPanel text={recoveryNote(noteFacts, SITE_URL)} filename={recoveryNoteFilename(view.address)} part="note" />
        </div>
      )}
    </article>
  );
}

function LockBadge({ open }: { open: boolean }) {
  return (
    <span className="badge">
      {!open && (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      )}
      {open ? 'Open' : 'Locked'}
    </span>
  );
}

/** Locks SolLock did not make: a custodian that can lift the lock, or an extra epoch lockup, or staking. */
function LockWarnings({ view }: { view: LockView }) {
  if (isPlainLock(view) && view.state !== 'staked') return null;
  return (
    <>
      {!view.custodianIsNobody && <p className="err">Its custodian is {view.custodian}. That address can lift the lock early. SolLock did not make it.</p>}
      {(view.lockupEpoch ?? 0n) > 0n && (
        <p className="err">It also waits for network epoch {String(view.lockupEpoch)}, so it may stay shut long after the date. SolLock did not make it.</p>
      )}
      {view.state === 'staked' && (
        <p className="help">{view.mustDeactivate ? 'It is staked, so it must be deactivated before you withdraw.' : 'It is cooling down after staking.'}</p>
      )}
    </>
  );
}

interface LockActionsProps {
  action: UnlockAction | null;
  busy: boolean;
  hasNote: boolean;
  noteOpen: boolean;
  onAction: (action: UnlockAction) => void;
  onToggleNote: () => void;
  explorerUrl: string;
}

function LockActions({ action, busy, hasNote, noteOpen, onAction, onToggleNote, explorerUrl }: LockActionsProps) {
  return (
    <div className="lc-actions">
      {action === 'withdraw' && (
        <button type="button" className="btn cta" disabled={busy} onClick={() => onAction('withdraw')}>
          Withdraw
        </button>
      )}
      {action === 'deactivate' && (
        <button type="button" className="btn" disabled={busy} onClick={() => onAction('deactivate')}>
          Deactivate
        </button>
      )}
      {hasNote && (
        <button type="button" className="btn ghost small" aria-expanded={noteOpen} onClick={onToggleNote}>
          Recovery note
        </button>
      )}
      <ExternalLink className="lc-link" href={explorerUrl}>
        See it on the explorer
      </ExternalLink>
    </div>
  );
}
