import type { Address, TransactionSendingSigner } from '@solana/kit';
import { formatSol } from '@sollock/core';
import { createKitSignersFromWallet, getDefaultConfig } from '@solana/connector/headless';
import { ConnectorProvider, useConnector, useConnectorClient } from '@solana/connector/react';
import { type ReactNode, type RefObject, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CLUSTER, SITE_URL } from '../config.ts';
import { shortAddress } from '../lib/draft.ts';
import { askLoopbackPermission, isNoWalletApp, loopbackPermission, MOBILE_WALLET_NAME, shouldOfferMobileWallet } from '../lib/mobile.ts';
import { browserStorage } from '../lib/money.ts';
import { siteRpcUrl } from '../lib/siteRpc.ts';

const CHAIN = `solana:${CLUSTER}` as const;

export function WalletProvider({ children }: { children: ReactNode }) {
  const config = useMemo(
    () =>
      getDefaultConfig({
        appName: 'SolLock',
        appUrl: SITE_URL,
        autoConnect: true,
        // ConnectorKit's own Android wallet stays off; the one below takes its place.
        enableMobile: false,
        network: CLUSTER,
        clusters: [{ id: CHAIN, label: CLUSTER === 'devnet' ? 'Devnet' : 'Mainnet', url: siteRpcUrl() }],
        persistClusterSelection: false,
      }),
    [],
  );
  useMobileWallet();
  return <ConnectorProvider config={config}>{children}</ConnectorProvider>;
}

/** Android reaches wallet apps through Solana Mobile's protocol; that code loads only there. */
function useMobileWallet() {
  useEffect(() => {
    if (!shouldOfferMobileWallet(navigator.userAgent, window.isSecureContext)) return;
    void import('../lib/mobileWallet.ts').then(({ registerMobileWallet }) =>
      registerMobileWallet({ chain: CHAIN, identity: { name: 'SolLock', uri: window.location.origin, icon: '/icon-192.png' }, storage: browserStorage() }),
    );
  }, []);
}

export interface SiteWallet {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  address: Address | null;
  displayName: string;
  icon: string | null;
  signer: TransactionSendingSigner | null;
  signerProblem: string | null;
  connectors: { id: string; name: string; icon: string; ready: boolean }[];
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

type Snapshot = ReturnType<typeof useConnector>;
type Session = Extract<Snapshot['walletStatus'], { status: 'connected' }>['session'];

function signerFor(session: Session | null, client: ReturnType<typeof useConnectorClient>): Pick<SiteWallet, 'signer' | 'signerProblem'> {
  if (!session || !client) return { signer: null, signerProblem: null };
  const account = session.selectedAccount.account;
  if (!account.chains.includes(CHAIN)) {
    return { signer: null, signerProblem: `This wallet account is not set up for Solana ${CLUSTER}. Switch your wallet to ${CLUSTER}.` };
  }
  const { transactionSigner } = createKitSignersFromWallet(client.getConnector(session.connectorId) ?? null, account, null, CLUSTER);
  if (!transactionSigner) return { signer: null, signerProblem: "This wallet can't send the transaction itself. Use Phantom, Solflare or Backpack." };
  return { signer: transactionSigner, signerProblem: null };
}

/** The Android wallet names the app it reached when it is a known one; otherwise the page speaks of "your wallet app". */
function displayNameFor(connector: Snapshot['connectors'][number] | undefined, session: Session | null): string {
  if (!connector) return 'your wallet';
  if (connector.name !== MOBILE_WALLET_NAME) return connector.name;
  return session?.selectedAccount.account.label ?? 'your wallet app';
}

export function useSiteWallet(): SiteWallet {
  const snapshot = useConnector();
  const client = useConnectorClient();
  const status = snapshot.walletStatus;
  const session = status.status === 'connected' ? status.session : null;
  const connector = session ? snapshot.connectors.find((c) => c.id === session.connectorId) : undefined;
  const { signer, signerProblem } = useMemo(() => signerFor(session, client), [session, client]);
  return {
    status: status.status,
    address: session?.selectedAccount.address ?? null,
    displayName: displayNameFor(connector, session),
    icon: connector?.icon ?? null,
    signer,
    signerProblem,
    connectors: snapshot.connectors.map(({ id, name, icon, ready }) => ({ id, name, icon, ready })),
    connect: (id) => snapshot.connectWallet(id as Parameters<Snapshot['connectWallet']>[0]),
    disconnect: () => snapshot.disconnectWallet(),
  };
}

export function WalletChrome({
  wallet,
  balance,
  pickerOpen,
  onPickerOpen,
}: {
  wallet: SiteWallet;
  balance: bigint | null;
  pickerOpen: boolean;
  onPickerOpen: (open: boolean) => void;
}) {
  return (
    <>
      <HeaderWallet wallet={wallet} balance={balance} onOpen={() => onPickerOpen(true)} />
      {pickerOpen && <WalletPicker wallet={wallet} onClose={() => onPickerOpen(false)} />}
    </>
  );
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** A wallet's own browser can reach the wallet; on iOS that is the only way in, on Android the way out when no app answers. */
function browseLinks(): { name: string; href: string }[] {
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return [
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

function useDialog(dialog: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [dialog]);
}

/** Chrome's question about the wallet app's socket on the phone, asked with a tap of its own so the next tap can open the app. */
type PermissionStep = 'ask' | 'asking' | 'open' | 'blocked';

/** After its window closes, a wallet that was given an answer passes it on well within this time. */
const ANSWER_GRACE_MS = 1500;

function WalletPicker({ wallet, onClose }: { wallet: SiteWallet; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [noWalletApp, setNoWalletApp] = useState(false);
  const [permission, setPermission] = useState<PermissionStep | null>(null);
  /** Counts the attempts to connect, so one that was given up on, or replaced, changes nothing when its answer comes after all. */
  const attempt = useRef(0);
  const waiting = useRef(false);
  useDialog(dialog, onClose);

  const ready = wallet.connectors.filter((c) => c.ready);
  const mobile = ready.find((c) => c.name === MOBILE_WALLET_NAME);

  const connectTo = async (id: string) => {
    const mine = ++attempt.current;
    waiting.current = true;
    setConnectingId(id);
    setError(null);
    setNoWalletApp(false);
    setPermission(null);
    try {
      await wallet.connect(id);
      if (mine === attempt.current) onClose();
    } catch (e) {
      if (mine !== attempt.current) return;
      if (isNoWalletApp(e)) setNoWalletApp(true);
      else setError((e as Error).message || 'The wallet did not connect.');
    } finally {
      if (mine === attempt.current) {
        waiting.current = false;
        setConnectingId(null);
      }
    }
  };

  /**
   * A wallet whose window is closed without an answer never answers at all, and the site would say "Connecting…" for good.
   * Giving up tells the site it is not connected, so its buttons can be used again.
   */
  const giveUp = useEffectEvent((message: string | null) => {
    if (!waiting.current) return;
    attempt.current++;
    waiting.current = false;
    setConnectingId(null);
    setError(message);
    void wallet.disconnect().catch(() => {});
  });

  // Closing the picker gives up on a wallet that has not answered yet.
  useEffect(() => () => giveUp(null), []);

  // A wallet's window that closes hands the focus back to this page. No answer shortly after that means it was closed without one.
  // The wallet app on a phone is left out: coming back from it also brings the focus back, with the answer still on its way.
  const connecting = ready.find((c) => c.id === connectingId);
  const connectingName = connecting && connecting.id !== mobile?.id ? connecting.name : null;
  useEffect(() => {
    if (connectingName === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      clearTimeout(timer);
      timer = setTimeout(() => giveUp(`${connectingName} did not answer. If you closed its window, pick it again.`), ANSWER_GRACE_MS);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearTimeout(timer);
    };
  }, [connectingName]);

  const pick = async (id: string) => {
    if (id !== mobile?.id) return connectTo(id);
    const state = await loopbackPermission();
    if (state === 'prompt') setPermission('ask');
    else if (state === 'denied') setPermission('blocked');
    else await connectTo(id);
  };

  const askPermission = async () => {
    setPermission('asking');
    setError(null);
    const state = await askLoopbackPermission();
    if (state === 'denied') setPermission('blocked');
    else if (state === 'prompt') {
      setPermission('ask');
      setError('Chrome did not get an answer. Tap Continue and choose Allow.');
    } else setPermission('open');
  };

  return (
    <div className="overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="pickTitle" ref={dialog}>
        <div className="wm-head">
          <b id="pickTitle">Connect a wallet</b>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="wm-body">
          {permission ? (
            <PermissionPrompt step={permission} onContinue={() => void askPermission()} onOpen={() => mobile && void connectTo(mobile.id)} />
          ) : ready.length > 0 ? (
            <>
              <WalletList connectors={ready} connectingId={connectingId} onPick={(id) => void pick(id)} />
              {mobile && <p className="help">Opens a wallet app installed on this phone, such as Phantom, Solflare or Backpack.</p>}
            </>
          ) : isMobile() ? (
            <OpenInWalletApp lead="No wallet in this browser. Open SolLock in your wallet app instead:" />
          ) : (
            <p className="no-margin">No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, then reload this page.</p>
          )}
          {noWalletApp && (
            <div className="note warn" role="alert">
              <OpenInWalletApp lead="No wallet app on this phone answered. Install Phantom, Solflare or Backpack, or open SolLock inside the wallet app:" />
            </div>
          )}
          {CLUSTER === 'devnet' && <p className="help">This is the devnet preview: set your wallet to devnet first.</p>}
          <p className="help">Connecting shares only your wallet's public address. You approve every transaction in the wallet.</p>
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionPrompt({ step, onContinue, onOpen }: { step: PermissionStep; onContinue: () => void; onOpen: () => void }) {
  switch (step) {
    case 'ask':
      return (
        <>
          <p className="no-margin">
            Chrome will ask whether SolLock may connect to the wallet app on this phone. Tap <b>Allow</b> when it does.
          </p>
          <p className="help">The connection stays on your phone: this page talks to the wallet app and to nothing else.</p>
          <button type="button" className="btn cta" onClick={onContinue}>
            Continue
          </button>
        </>
      );
    case 'asking':
      return <p className="status-line">Waiting for your answer in Chrome…</p>;
    case 'open':
      return (
        <>
          <p className="no-margin">Allowed. Now open the wallet app to connect.</p>
          <button type="button" className="btn cta" onClick={onOpen}>
            Open wallet app
          </button>
        </>
      );
    case 'blocked':
      return (
        <p className="err" role="alert">
          Chrome blocks this site from connecting to apps on this phone, so the wallet app cannot answer. Allow "Local network access" in Chrome's settings for
          this site (tap the icon left of the address), then try again.
        </p>
      );
  }
}

function WalletList({ connectors, connectingId, onPick }: { connectors: SiteWallet['connectors']; connectingId: string | null; onPick: (id: string) => void }) {
  return (
    <ul className="wallet-list">
      {connectors.map((connector) => (
        <li key={connector.id}>
          <button type="button" className="wallet-choice" disabled={connectingId !== null} onClick={() => onPick(connector.id)}>
            {connector.icon && <img src={connector.icon} alt="" width={28} height={28} />}
            <span>{connector.name}</span>
            {connectingId === connector.id && <small>Check your wallet…</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function OpenInWalletApp({ lead }: { lead: string }) {
  return (
    <>
      <p className="no-margin">{lead}</p>
      <ul className="wallet-list">
        {browseLinks().map((link) => (
          <li key={link.name}>
            <a className="wallet-choice" href={link.href}>
              <span>Open in {link.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function HeaderWallet({ wallet, balance, onOpen }: { wallet: SiteWallet; balance: bigint | null; onOpen: () => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('wallet-slot')), []);
  if (!slot) return null;
  const content =
    wallet.status === 'connected' && wallet.address ? (
      <>
        <span className="wallet-pill">
          <span className="dot" aria-hidden="true"></span>
          {wallet.icon && <img src={wallet.icon} alt="" width={16} height={16} />}
          <span className="addr" title={wallet.address}>
            {shortAddress(wallet.address)}
          </span>
          {balance !== null && <span className="num">{formatSol(balance)} SOL</span>}
        </span>
        <button type="button" className="btn ghost small" onClick={() => void wallet.disconnect()}>
          Disconnect
        </button>
      </>
    ) : (
      <button type="button" className="btn cta" onClick={onOpen} disabled={wallet.status === 'connecting'}>
        <svg className="go" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="3.5" width="13" height="10" rx="2" />
          <path d="M10.5 8.5h1.5M1.5 6.5h10a2 2 0 0 0 0-3" />
        </svg>
        {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  return createPortal(content, slot);
}
