import { isAddress } from '@solana/kit';
import { describeLock, fetchLock, isLockAccount, type LockView } from '@sollock/core';
import { useState } from 'react';
import { siteRpc } from '../lib/siteRpc.ts';
import { type CardContext, LockCard } from './LockCard.tsx';

type LookupState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'found'; view: LockView } | { kind: 'error'; message: string };

async function lookUp(text: string): Promise<LookupState> {
  const address = text.trim();
  if (!isAddress(address)) return { kind: 'error', message: 'That is not a Solana address. Copy the lock address from the recovery note.' };
  try {
    const view = await fetchLock(siteRpc(), address);
    return isLockAccount(view) ? { kind: 'found', view } : { kind: 'error', message: describeLock(view)[0] ?? 'This is not a lock.' };
  } catch {
    return { kind: 'error', message: 'The network could not be asked just now. Try again in a minute.' };
  }
}

export function LockLookup({ context }: { context: CardContext }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<LookupState>({ kind: 'idle' });
  const submit = async () => {
    setState({ kind: 'loading' });
    setState(await lookUp(text));
  };
  return (
    <details className="more lookup">
      <summary>Look up a lock by its address</summary>
      <p className="help">Paste the lock address from a recovery note.</p>
      <form
        className="field-row spaced"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="lookupAddr" className="vh">
          Lock address
        </label>
        <input id="lookupAddr" className="text-input lookup-input" type="text" autoComplete="off" spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="btn small" disabled={state.kind === 'loading'}>
          {state.kind === 'loading' ? 'Looking…' : 'Look up'}
        </button>
      </form>
      {state.kind === 'error' && <p className="err">{state.message}</p>}
      {state.kind === 'found' && (
        <div className="locks spaced">
          <LockCard row={{ view: state.view, withdrawableByYou: state.view.withdrawer === context.wallet.address, givenByYou: false }} context={context} />
        </div>
      )}
    </details>
  );
}
