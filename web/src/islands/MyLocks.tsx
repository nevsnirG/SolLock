import type { Address, Signature } from '@solana/kit';
import { fetchReadContext, findLocksWithdrawableBy, findSeededLocks, formatSol, type UnlockAction } from '@sollock/core';
import { useEffect, useState } from 'react';
import { explorerTxUrl } from '../config.ts';
import { plural } from '../lib/duration.ts';
import { type LockRow, mergeLocks } from '../lib/myLocks.ts';
import { runSigning, type SigningPhase, signAndSend } from '../lib/signing.ts';
import { assertServerCluster, siteRpc } from '../lib/siteRpc.ts';
import { finishUnlock, type PreparedUnlock, prepareUnlock, type UnlockResult, unlockLanded } from '../lib/unlockFlow.ts';
import { useBalance, useNow } from './hooks.ts';
import { type CardContext, LockCard } from './LockCard.tsx';
import { LockLookup } from './LockLookup.tsx';
import { ExternalLink } from './shared.tsx';
import { type SiteWallet, useSiteWallet, WalletChrome, WalletProvider } from './wallet.tsx';

export default function MyLocksIsland() {
  return (
    <WalletProvider>
      <MyLocks />
    </WalletProvider>
  );
}

const CLOCK_TICK_MS = 15_000;

function MyLocks() {
  const wallet = useSiteWallet();
  const { balance, refresh: refreshBalance } = useBalance(wallet.address);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const reload = () => setReloadCount((count) => count + 1);
  const { now } = useNow(CLOCK_TICK_MS);
  const list = useMyLocks(wallet.status === 'connected' ? wallet.address : null, reloadCount);
  const unlock = useUnlockActions(wallet, () => {
    refreshBalance();
    reload();
  });
  const [openNoteFor, setOpenNoteFor] = useState<Address | null>(null);
  const context: CardContext = {
    wallet,
    now,
    phaseOf: unlock.phaseOf,
    onAction: (action, lock) => void unlock.run(action, lock),
    openNoteFor,
    onToggleNote: (lock) => setOpenNoteFor((current) => (current === lock ? null : lock)),
  };

  return (
    <div className="locks-page">
      <WalletChrome wallet={wallet} balance={balance} pickerOpen={pickerOpen} onPickerOpen={setPickerOpen} />
      {unlock.finished.map((done) => (
        <div key={done.signature} className="note ok" role="status">
          {done.message} <ExternalLink href={explorerTxUrl(done.signature)}>See the transaction</ExternalLink>
        </div>
      ))}
      <LockListBody wallet={wallet} list={list} context={context} onConnect={() => setPickerOpen(true)} onReload={reload} />
      {wallet.signerProblem && <p className="err">{wallet.signerProblem}</p>}
      <LockLookup context={context} />
    </div>
  );
}

type ListState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; rows: LockRow[]; giftsChecked: boolean } | { kind: 'error' };

function useMyLocks(wallet: Address | null, reloadCount: number): ListState {
  const [state, setState] = useState<ListState>({ kind: 'idle' });
  useEffect(() => {
    if (!wallet) {
      setState({ kind: 'idle' });
      return;
    }
    let live = true;
    setState((current) => (current.kind === 'ok' ? current : { kind: 'loading' }));
    readLocks(wallet).then(
      (next) => live && setState(next),
      (error: unknown) => {
        console.error('My locks could not be read.', error);
        if (live) setState({ kind: 'error' });
      },
    );
    return () => {
      live = false;
    };
  }, [wallet, reloadCount]);
  return state;
}

async function readLocks(wallet: Address): Promise<ListState> {
  const rpc = siteRpc();
  const ctx = await fetchReadContext(rpc);
  const [seeded, received] = await Promise.all([
    findSeededLocks(rpc, wallet, ctx),
    // This lookup is rate-limited harder; its failure must not hide the wallet's own locks.
    findLocksWithdrawableBy(rpc, wallet, ctx).catch(() => null),
  ]);
  return { kind: 'ok', rows: mergeLocks(wallet, seeded, received ?? []), giftsChecked: received !== null };
}

interface FinishedAction {
  signature: Signature;
  message: string;
}

const IDLE: SigningPhase = { kind: 'idle' };

function finishedMessage(result: UnlockResult): string {
  return result.action === 'withdraw'
    ? `Withdrawn: ${formatSol(result.withdrawn)} SOL is back in your wallet, rent deposit included.`
    : 'Deactivated. You can withdraw once the network has finished cooling it down, usually within a few days.';
}

function useUnlockActions(wallet: SiteWallet, onChanged: () => void) {
  const [phases, setPhases] = useState<Record<string, SigningPhase>>({});
  const [finished, setFinished] = useState<FinishedAction[]>([]);

  const run = async (action: UnlockAction, lock: Address) => {
    const signer = wallet.signer;
    if (!signer) return;
    const rpc = siteRpc();
    const outcome = await runSigning<PreparedUnlock, UnlockResult>(
      {
        prepare: async () => {
          await assertServerCluster();
          return prepareUnlock(action, lock, { rpc, signer });
        },
        send: (prepared) => signAndSend(prepared.message),
        finish: (prepared, signature) => finishUnlock(rpc, prepared, signature),
        landed: (prepared) => unlockLanded(rpc, prepared),
        landedMessage: 'Your wallet reported a problem, but it went through. Refresh to see the lock as it is now.',
      },
      (phase) => setPhases((all) => ({ ...all, [lock]: phase })),
    );
    if (outcome.kind === 'done') setFinished((all) => [...all, { signature: outcome.result.signature, message: finishedMessage(outcome.result) }]);
    if (outcome.kind !== 'failed') onChanged();
  };

  return { phaseOf: (lock: Address) => phases[lock] ?? IDLE, finished, run };
}

interface LockListBodyProps {
  wallet: SiteWallet;
  list: ListState;
  context: CardContext;
  onConnect: () => void;
  onReload: () => void;
}

function LockListBody({ wallet, list, context, onConnect, onReload }: LockListBodyProps) {
  if (wallet.status !== 'connected') {
    return (
      <div className="flow-card locks-empty">
        <h2 className="card-title">Connect your wallet</h2>
        <p>Use the wallet you locked with, or the wallet a lock was given to.</p>
        <button type="button" className="btn big cta" onClick={onConnect} disabled={wallet.status === 'connecting'}>
          {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
        </button>
      </div>
    );
  }
  if (list.kind === 'error') {
    return (
      <div className="note warn">
        Your locks could not be read from the network just now. Try again in a minute.{' '}
        <button type="button" className="link-btn" onClick={onReload}>
          Try again
        </button>
      </div>
    );
  }
  if (list.kind !== 'ok') {
    return (
      <div className="flow-card locks-empty">
        <p>Reading your locks from the network…</p>
      </div>
    );
  }
  return <LockList rows={list.rows} giftsChecked={list.giftsChecked} context={context} onRefresh={onReload} />;
}

function LockList({ rows, giftsChecked, context, onRefresh }: { rows: LockRow[]; giftsChecked: boolean; context: CardContext; onRefresh: () => void }) {
  const yours = rows.filter((row) => row.withdrawableByYou);
  const given = rows.filter((row) => row.givenByYou);
  const cards = (list: LockRow[]) => (
    <div className="locks">
      {list.map((row) => (
        <LockCard key={row.view.address} row={row} context={context} />
      ))}
    </div>
  );
  return (
    <>
      <div className="locks-bar">
        <p>{plural(rows.length, 'lock')}</p>
        <button type="button" className="btn ghost small" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {!giftsChecked && <p className="help">Gifts to this wallet could not be checked just now. Refresh in a minute.</p>}
      {rows.length === 0 && (
        <div className="flow-card locks-empty">
          <h2 className="card-title">No locks yet</h2>
          <p>Locks you make with this wallet show up here, and so do locks someone gave to it.</p>
          <a className="btn big cta" href="/lock">
            Lock Solana
          </a>
        </div>
      )}
      {yours.length > 0 && (
        <>
          {given.length > 0 && <h2 className="list-title">Yours to withdraw</h2>}
          {cards(yours)}
        </>
      )}
      {given.length > 0 && (
        <>
          <h2 className="list-title">Gifts you gave</h2>
          <p className="help">Only the recipient's wallet can withdraw these.</p>
          {cards(given)}
        </>
      )}
    </>
  );
}
