import type { Address, TransactionSendingSigner } from '@solana/kit';
import { formatSol } from '@sollock/core';
import { createKitSignersFromWallet, getDefaultConfig, getDefaultMobileConfig } from '@solana/connector/headless';
import { ConnectorProvider, useConnector, useConnectorClient } from '@solana/connector/react';
import { type ReactNode, type RefObject, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CLUSTER, SITE_URL } from '../config.ts';
import { shortAddress } from '../lib/draft.ts';
import { siteRpcUrl } from '../lib/siteRpc.ts';

const CHAIN = `solana:${CLUSTER}` as const;

/**
 * ConnectorKit, set up for SolLock: Wallet Standard discovery, Mobile Wallet Adapter on Android, and
 * our own /api/rpc as the only RPC. Nothing else is configured, so nothing else is called.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const config = useMemo(
    () =>
      getDefaultConfig({
        appName: 'SolLock',
        appUrl: SITE_URL,
        autoConnect: true,
        enableMobile: true,
        network: CLUSTER,
        clusters: [{ id: CHAIN, label: CLUSTER === 'devnet' ? 'Devnet' : 'Mainnet', url: siteRpcUrl() }],
        persistClusterSelection: false,
      }),
    [],
  );
  const mobile = useMemo(() => getDefaultMobileConfig({ appName: 'SolLock', appUrl: SITE_URL }), []);
  return (
    <ConnectorProvider config={config} mobile={mobile}>
      {children}
    </ConnectorProvider>
  );
}

export interface SiteWallet {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  address: Address | null;
  /** The wallet's own name, or "your wallet" before one is connected. */
  displayName: string;
  icon: string | null;
  /** Signs and sends in the wallet itself, on our cluster. Null when the wallet can't do that. */
  signer: TransactionSendingSigner | null;
  /** Why there is no signer although a wallet is connected, in plain words. */
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
    displayName: connector?.name ?? 'your wallet',
    icon: connector?.icon ?? null,
    signer,
    signerProblem,
    connectors: snapshot.connectors.map(({ id, name, icon, ready }) => ({ id, name, icon, ready })),
    connect: (id) => snapshot.connectWallet(id as Parameters<Snapshot['connectWallet']>[0]),
    disconnect: () => snapshot.disconnectWallet(),
  };
}

/** The header's wallet button and the wallet picker, the same on every page with an island. */
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

/** Opens this page inside a wallet app's own browser: the way in on iOS, where browsers have no wallets. */
function browseLinks(): { name: string; href: string }[] {
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return [
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

/** Focus moves into the dialog and back to its opener; Escape closes it. */
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

function WalletPicker({ wallet, onClose }: { wallet: SiteWallet; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  useDialog(dialog, onClose);

  const pick = async (id: string) => {
    setConnectingId(id);
    setError(null);
    try {
      await wallet.connect(id);
      onClose();
    } catch (e) {
      setError((e as Error).message || 'The wallet did not connect.');
    } finally {
      setConnectingId(null);
    }
  };

  const ready = wallet.connectors.filter((c) => c.ready);
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
          {ready.length > 0 ? (
            <WalletList connectors={ready} connectingId={connectingId} onPick={(id) => void pick(id)} />
          ) : isMobile() ? (
            <OpenInWalletApp />
          ) : (
            <p className="no-margin">No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, then reload this page.</p>
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

function OpenInWalletApp() {
  return (
    <>
      <p className="no-margin">No wallet in this browser. Open SolLock in your wallet app instead:</p>
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

/** The wallet button in the page header, rendered there from inside the island. */
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
