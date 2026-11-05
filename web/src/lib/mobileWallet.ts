/**
 * A Wallet Standard wallet for Android, over Solana Mobile's protocol: the page opens an installed wallet app
 * (Phantom, Solflare, Backpack and others) and the app answers over a socket on the phone. Solana Mobile's own
 * Wallet Standard wrapper is not used: it draws dialogs with inline styles our security policy blocks and loads a
 * Google font. This one draws nothing; the page asks and explains in its own words.
 */
import type { WalletStandardAccount, WalletStandardWallet } from '@solana/connector/headless';
import { type Address, getAddressDecoder, getAddressEncoder, getBase64Decoder, getBase64Encoder, isAddress } from '@solana/kit';
import {
  type AuthorizationResult,
  type MobileWallet,
  SolanaMobileWalletAdapterErrorCode,
  SolanaMobileWalletAdapterProtocolErrorCode,
  transact as protocolTransact,
} from '@solana-mobile/mobile-wallet-adapter-protocol';
import { MOBILE_WALLET_NAME, NoWalletAppError, walletAppName } from './mobile.ts';

export type MobileChain = `solana:${'devnet' | 'mainnet'}`;

export interface MobileWalletOptions {
  chain: MobileChain;
  /** What the wallet app shows when it asks for approval: a name, the site's origin, and an icon path on that origin. */
  identity: { name: string; uri: string; icon: string };
  /** Keeps the wallet app's token between visits; null keeps it for this page view only. */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** A session with the wallet app; tests hand in a fake. */
  transact?: typeof protocolTransact;
}

interface StoredAccount {
  address: Address;
  /** The wallet app's name when it is a known one, for "Sign in Phantom". */
  label?: string;
}

interface StoredAuthorization {
  version: 1;
  chain: MobileChain;
  authToken: string;
  /** Where the app asks to be reached next time, so the same app opens again. */
  walletUriBase?: string;
  accounts: StoredAccount[];
}

interface SignAndSendInput {
  account: WalletStandardAccount;
  transaction: Uint8Array;
  chain: string;
  options?: { minContextSlot?: number; preflightCommitment?: string; skipPreflight?: boolean; maxRetries?: number };
}

type ChangeListener = (properties: { accounts: readonly WalletStandardAccount[] }) => void;

export const STORAGE_KEY = 'sollock:mobile-wallet';

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none" stroke="#7a8089" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="12" height="22" rx="2.5"/><path d="M12.5 21.5h3"/></svg>';
const ICON = `data:image/svg+xml;base64,${btoa(ICON_SVG)}` as const;

const base64ToBytes = (text: string) => new Uint8Array(getBase64Encoder().encode(text));
const bytesToBase64 = (bytes: Uint8Array) => getBase64Decoder().decode(bytes);

export function createMobileWallet({ chain, identity, storage, transact = protocolTransact }: MobileWalletOptions): WalletStandardWallet {
  const listeners = new Set<ChangeListener>();
  let authorization: StoredAuthorization | null = null;
  let accounts: readonly WalletStandardAccount[] = [];

  const remember = (next: StoredAuthorization | null) => {
    const before = accounts.map((account) => account.address).join();
    authorization = next;
    accounts = next ? next.accounts.map((account) => toStandardAccount(account, chain)) : [];
    writeStored(storage, next);
    if (accounts.map((account) => account.address).join() !== before) for (const listener of listeners) listener({ accounts });
  };

  const kept = () => authorization ?? readStored(storage, chain);

  const session = async <T,>(baseUri: string | undefined, run: (wallet: MobileWallet) => Promise<T>): Promise<T> => {
    try {
      return await transact(run, baseUri === undefined ? undefined : { baseUri });
    } catch (error) {
      // The app no longer honours the token (revoked, or the user said no), so forget it.
      if (errorCode(error) === SolanaMobileWalletAdapterProtocolErrorCode.ERROR_AUTHORIZATION_FAILED) remember(null);
      throw explain(error);
    }
  };

  const authorize = (wallet: MobileWallet, authToken: string | undefined) =>
    wallet.authorize(authToken === undefined ? { chain, identity } : { chain, identity, auth_token: authToken });

  const connect = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) {
      // A page load: pick up where the last visit left off, without opening the app.
      if (accounts.length === 0) {
        const previous = readStored(storage, chain);
        if (previous) remember(previous);
      }
      return { accounts };
    }
    const previous = kept();
    const result = await session(previous?.walletUriBase, (wallet) => authorize(wallet, previous?.authToken));
    remember(fromResult(result, chain));
    return { accounts };
  };

  const disconnect = async () => remember(null);

  const signAndSendTransaction = async (...inputs: SignAndSendInput[]): Promise<{ signature: Uint8Array }[]> => {
    const outputs: { signature: Uint8Array }[] = [];
    for (const input of inputs) {
      if (input.chain !== chain) throw new Error(`This page is on ${chain}; the transaction is for ${input.chain}.`);
      const previous = kept();
      if (!previous) throw new Error('The wallet app is no longer connected. Connect it again.');
      const signature = await session(previous.walletUriBase, async (wallet) => {
        remember(fromResult(await authorize(wallet, previous.authToken), chain));
        const { signatures } = await wallet.signAndSendTransactions({ payloads: [bytesToBase64(input.transaction)], ...sendOptions(input.options) });
        const first = signatures[0];
        if (first === undefined) throw new Error('The wallet app returned no signature.');
        return base64ToBytes(first);
      });
      outputs.push({ signature });
    }
    return outputs;
  };

  return {
    version: '1.0.0',
    name: MOBILE_WALLET_NAME,
    icon: ICON,
    chains: [chain],
    get accounts() {
      return accounts;
    },
    features: {
      'standard:connect': { version: '1.0.0', connect },
      'standard:disconnect': { version: '1.0.0', disconnect },
      'standard:events': {
        version: '1.0.0',
        on: (event: string, listener: ChangeListener) => {
          if (event === 'change') listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      'solana:signAndSendTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signAndSendTransaction },
    },
  };
}

let registered = false;

/** Announces the wallet to the page the Wallet Standard way, so ConnectorKit lists it like any other. */
export function registerMobileWallet(options: MobileWalletOptions): void {
  if (registered) return;
  registered = true;
  const wallet = createMobileWallet(options);
  const register = (api: { register: (...wallets: WalletStandardWallet[]) => unknown }) => api.register(wallet);
  window.addEventListener('wallet-standard:app-ready', (event) => register((event as CustomEvent<Parameters<typeof register>[0]>).detail));
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
}

function toStandardAccount({ address, label }: StoredAccount, chain: MobileChain): WalletStandardAccount {
  return {
    address,
    publicKey: new Uint8Array(getAddressEncoder().encode(address)),
    chains: [chain],
    features: ['solana:signAndSendTransaction'],
    ...(label === undefined ? {} : { label }),
  };
}

function fromResult(result: AuthorizationResult, chain: MobileChain): StoredAuthorization {
  const label = walletAppName(result.wallet_uri_base);
  return {
    version: 1,
    chain,
    authToken: result.auth_token,
    ...(result.wallet_uri_base ? { walletUriBase: result.wallet_uri_base } : {}),
    accounts: result.accounts.map((account) => ({
      address: getAddressDecoder().decode(base64ToBytes(account.address)),
      ...(label === null ? {} : { label }),
    })),
  };
}

function sendOptions(options: SignAndSendInput['options']) {
  if (!options) return {};
  const mapped = {
    ...(options.minContextSlot === undefined ? {} : { min_context_slot: options.minContextSlot }),
    ...(options.preflightCommitment === undefined ? {} : { commitment: options.preflightCommitment }),
    ...(options.skipPreflight === undefined ? {} : { skip_preflight: options.skipPreflight }),
    ...(options.maxRetries === undefined ? {} : { max_retries: options.maxRetries }),
  };
  return Object.keys(mapped).length === 0 ? {} : { options: mapped };
}

function readStored(storage: MobileWalletOptions['storage'], chain: MobileChain): StoredAuthorization | null {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    return isStored(parsed) && parsed.chain === chain ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(storage: MobileWalletOptions['storage'], value: StoredAuthorization | null) {
  try {
    if (value) storage?.setItem(STORAGE_KEY, JSON.stringify(value));
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be full or off; the token then lasts for this page view.
  }
}

function isStored(value: unknown): value is StoredAuthorization {
  const candidate = value as Partial<StoredAuthorization> | null;
  return (
    candidate?.version === 1 &&
    typeof candidate.authToken === 'string' &&
    (candidate.walletUriBase === undefined || typeof candidate.walletUriBase === 'string') &&
    Array.isArray(candidate.accounts) &&
    candidate.accounts.length > 0 &&
    candidate.accounts.every((account: Partial<StoredAccount> | null) => isAddress(String(account?.address)))
  );
}

const errorCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

/** The protocol's errors in the page's words; the rest pass through. */
function explain(error: unknown): Error {
  switch (errorCode(error)) {
    case SolanaMobileWalletAdapterErrorCode.ERROR_WALLET_NOT_FOUND:
      return new NoWalletAppError({ cause: error });
    case SolanaMobileWalletAdapterErrorCode.ERROR_SESSION_TIMEOUT:
    case SolanaMobileWalletAdapterErrorCode.ERROR_SESSION_CLOSED:
      return new Error('The wallet app did not answer. Try again.', { cause: error });
    case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_AUTHORIZATION_FAILED:
      return new Error('The wallet app declined the connection.', { cause: error });
    case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SIGNED:
      return new Error('Declined in the wallet app.', { cause: error });
    case SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SUBMITTED:
      return new Error('The wallet app signed it but could not send it to the network.', { cause: error });
    default:
      return error instanceof Error ? error : new Error(String(error));
  }
}
