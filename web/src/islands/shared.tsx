import type { ReactNode } from 'react';
import { explorerTxUrl } from '../config.ts';
import type { SigningPhase } from '../lib/signing.ts';

export function ExternalLink({ href, className, sponsored = false, children }: { href: string; className?: string; sponsored?: boolean; children: ReactNode }) {
  return (
    <a href={href} className={className} target="_blank" rel={sponsored ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}>
      {children}
    </a>
  );
}

export function Choice({
  name,
  checked,
  onPick,
  title,
  aside,
  children,
}: {
  name: string;
  checked: boolean;
  onPick: () => void;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label className={checked ? 'choice is-on' : 'choice'}>
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      <span className="choice-t">{title}</span>
      {aside && <span className="choice-aside">{aside}</span>}
      {children && <span className="choice-d">{children}</span>}
    </label>
  );
}

export function ErrorNote({ message, logs = [] }: { message: string; logs?: readonly string[] }) {
  return (
    <div className="note warn" role="alert">
      {message}
      {logs.length > 0 && (
        <details>
          <summary>Details from the network</summary>
          <pre className="logs">{logs.join('\n')}</pre>
        </details>
      )}
    </div>
  );
}

export function SigningStatus({ phase, walletName }: { phase: SigningPhase; walletName: string }) {
  switch (phase.kind) {
    case 'preparing':
      return <p className="status-line">Checking the transaction with the network…</p>;
    case 'wallet':
      return <p className="status-line">Check the transaction in {walletName} and approve it there.</p>;
    case 'confirming':
      return (
        <p className="status-line">
          Approved in {walletName}. Waiting for the network to confirm it… <ExternalLink href={explorerTxUrl(phase.signature)}>Follow it on the explorer</ExternalLink>
        </p>
      );
    case 'checking':
      return <p className="status-line">Checking that nothing reached the network…</p>;
    case 'error':
      return <ErrorNote message={phase.message} logs={phase.logs} />;
    default:
      return null;
  }
}
