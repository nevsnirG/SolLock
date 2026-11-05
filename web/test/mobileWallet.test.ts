import { address, getAddressEncoder, getBase64Decoder } from '@solana/kit';
import type { MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { describe, expect, it, vi } from 'vitest';
import { isNoWalletApp, shouldOfferMobileWallet, walletAppName } from '../src/lib/mobile.ts';
import { createMobileWallet, type MobileWalletOptions, STORAGE_KEY } from '../src/lib/mobileWallet.ts';
import { isWalletRejection } from '../src/lib/signing.ts';

const ADDRESS = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const ADDRESS_BASE64 = getBase64Decoder().decode(getAddressEncoder().encode(ADDRESS));
const SIGNATURE = new Uint8Array(64).fill(7);
const CHAIN = 'solana:devnet';
const IDENTITY = { name: 'SolLock', uri: 'https://devnet.sollock.io', icon: '/icon-192.png' };

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

/** Stands in for the wallet app behind Solana Mobile's `transact`: every session hands the callback this app. */
function fakeApp(overrides: Partial<Record<keyof MobileWallet, unknown>> = {}) {
  const app = {
    authorize: vi.fn(async () => ({ accounts: [{ address: ADDRESS_BASE64 }], auth_token: 'token-1', wallet_uri_base: 'https://phantom.app/ul/v1' })),
    signAndSendTransactions: vi.fn(async () => ({ signatures: [getBase64Decoder().decode(SIGNATURE)] })),
    ...overrides,
  };
  const sessions: ({ baseUri?: string } | undefined)[] = [];
  const transact = vi.fn(async (run: (wallet: MobileWallet) => Promise<unknown>, config?: { baseUri?: string }) => {
    sessions.push(config);
    return run(app as unknown as MobileWallet);
  }) as unknown as NonNullable<MobileWalletOptions['transact']>;
  return { app, transact, sessions };
}

interface Features {
  'standard:connect': { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly { address: string }[] }> };
  'standard:disconnect': { disconnect: () => Promise<void> };
  'standard:events': { on: (event: 'change', listener: (properties: { accounts: readonly unknown[] }) => void) => () => void };
  'solana:signAndSendTransaction': {
    signAndSendTransaction: (...inputs: { account: unknown; transaction: Uint8Array; chain: string }[]) => Promise<{ signature: Uint8Array }[]>;
  };
}

function walletWith(transact: NonNullable<MobileWalletOptions['transact']>, storage = new MemoryStorage(), chain: MobileWalletOptions['chain'] = CHAIN) {
  const wallet = createMobileWallet({ chain, identity: IDENTITY, storage, transact });
  return { wallet, storage, features: wallet.features as unknown as Features };
}

const protocolError = (code: unknown, name = 'SolanaMobileWalletAdapterProtocolError') => Object.assign(new Error(`code ${String(code)}`), { name, code });

describe('the Android wallet', () => {
  it('asks the wallet app for the site\'s chain and identity, then lists the account on that chain', async () => {
    const { app, transact } = fakeApp();
    const { wallet, storage, features } = walletWith(transact);
    const changes: unknown[] = [];
    features['standard:events'].on('change', ({ accounts }) => changes.push(accounts.length));

    const { accounts } = await features['standard:connect'].connect();

    expect(app.authorize).toHaveBeenCalledWith({ chain: CHAIN, identity: IDENTITY });
    expect(accounts.map((account) => account.address)).toEqual([ADDRESS]);
    expect(wallet.accounts[0]).toMatchObject({ chains: [CHAIN], features: ['solana:signAndSendTransaction'], label: 'Phantom' });
    expect(wallet.accounts[0]?.publicKey).toEqual(new Uint8Array(getAddressEncoder().encode(ADDRESS)));
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ chain: CHAIN, authToken: 'token-1', walletUriBase: 'https://phantom.app/ul/v1' });
    expect(changes).toEqual([1]);
  });

  it('picks a kept authorization up again on a silent connect, without opening the app', async () => {
    const first = fakeApp();
    const { storage } = walletWith(first.transact);
    await (walletWith(first.transact, storage).features['standard:connect'].connect());

    const second = fakeApp();
    const { wallet, features } = walletWith(second.transact, storage);
    const { accounts } = await features['standard:connect'].connect({ silent: true });

    expect(accounts.map((account) => account.address)).toEqual([ADDRESS]);
    expect(wallet.accounts[0]?.label).toBe('Phantom');
    expect(second.transact).not.toHaveBeenCalled();
  });

  it('ignores what was kept for another chain, or is not an authorization at all', async () => {
    const { transact } = fakeApp();
    const mainnet = walletWith(transact, new MemoryStorage(), 'solana:mainnet');
    await mainnet.features['standard:connect'].connect();
    const onDevnet = walletWith(fakeApp().transact, mainnet.storage);
    expect((await onDevnet.features['standard:connect'].connect({ silent: true })).accounts).toEqual([]);

    const garbage = new MemoryStorage();
    garbage.setItem(STORAGE_KEY, '{"version":1,"authToken":"t","chain":"solana:devnet","accounts":[{"address":"not an address"}]}');
    expect((await walletWith(fakeApp().transact, garbage).features['standard:connect'].connect({ silent: true })).accounts).toEqual([]);
    garbage.setItem(STORAGE_KEY, 'nonsense');
    expect((await walletWith(fakeApp().transact, garbage).features['standard:connect'].connect({ silent: true })).accounts).toEqual([]);
  });

  it('signs and sends through the same app, showing it the kept token first', async () => {
    const { app, transact, sessions } = fakeApp();
    const { wallet, features } = walletWith(transact);
    await features['standard:connect'].connect();
    const transaction = new Uint8Array([1, 2, 3]);

    const [output] = await features['solana:signAndSendTransaction'].signAndSendTransaction({ account: wallet.accounts[0], transaction, chain: CHAIN });

    expect(sessions).toEqual([undefined, { baseUri: 'https://phantom.app/ul/v1' }]);
    expect(app.authorize).toHaveBeenLastCalledWith({ chain: CHAIN, identity: IDENTITY, auth_token: 'token-1' });
    expect(app.signAndSendTransactions).toHaveBeenCalledWith({ payloads: [getBase64Decoder().decode(transaction)] });
    expect(output?.signature).toEqual(SIGNATURE);
  });

  it('refuses a transaction for another chain, and signs nothing while disconnected', async () => {
    const { app, transact } = fakeApp();
    const { features } = walletWith(transact);
    const sign = features['solana:signAndSendTransaction'].signAndSendTransaction;
    await expect(sign({ account: null, transaction: new Uint8Array(), chain: CHAIN })).rejects.toThrow(/no longer connected/);
    await features['standard:connect'].connect();
    await expect(sign({ account: null, transaction: new Uint8Array(), chain: 'solana:mainnet' })).rejects.toThrow(/solana:mainnet/);
    expect(app.signAndSendTransactions).not.toHaveBeenCalled();
  });

  it('forgets the token when the app no longer honours it, and reads that as a refusal', async () => {
    const { transact } = fakeApp();
    const { storage, features } = walletWith(transact);
    await features['standard:connect'].connect();

    const refusing = fakeApp({ authorize: vi.fn(async () => Promise.reject(protocolError(-1))) });
    const again = walletWith(refusing.transact, storage);
    const failure = await again.features['solana:signAndSendTransaction']
      .signAndSendTransaction({ account: null, transaction: new Uint8Array(), chain: CHAIN })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ message: 'The wallet app declined the connection.' });
    expect(isWalletRejection(failure)).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(again.wallet.accounts).toEqual([]);
  });

  it('tells no wallet app apart from other failures, and a declined signature from a broken one', async () => {
    const notFound = protocolError('ERROR_WALLET_NOT_FOUND', 'SolanaMobileWalletAdapterError');
    const { features } = walletWith(vi.fn(async () => Promise.reject(notFound)) as unknown as NonNullable<MobileWalletOptions['transact']>);
    const failure = await features['standard:connect'].connect().catch((error: unknown) => error);
    expect(isNoWalletApp(failure)).toBe(true);
    expect(isNoWalletApp(new Error('anything else'))).toBe(false);

    const declining = fakeApp({ signAndSendTransactions: vi.fn(async () => Promise.reject(protocolError(-3))) });
    const declined = walletWith(declining.transact);
    await declined.features['standard:connect'].connect();
    const refusal = await declined.features['solana:signAndSendTransaction']
      .signAndSendTransaction({ account: null, transaction: new Uint8Array(), chain: CHAIN })
      .catch((error: unknown) => error);
    expect(isWalletRejection(refusal)).toBe(true);
    expect(isNoWalletApp(refusal)).toBe(false);
  });

  it('disconnects by forgetting, without opening the app', async () => {
    const { transact } = fakeApp();
    const { wallet, storage, features } = walletWith(transact);
    await features['standard:connect'].connect();
    const changes: number[] = [];
    features['standard:events'].on('change', ({ accounts }) => changes.push(accounts.length));

    await features['standard:disconnect'].disconnect();

    expect(wallet.accounts).toEqual([]);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(changes).toEqual([0]);
    expect(transact).toHaveBeenCalledTimes(1);
  });
});

describe('where the Android wallet is offered', () => {
  const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
  const webView = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

  it("is an Android browser's page over https, not a wallet's built-in browser, an iPhone or a desktop", () => {
    expect(shouldOfferMobileWallet(chrome, true)).toBe(true);
    expect(shouldOfferMobileWallet(chrome, false)).toBe(false);
    expect(shouldOfferMobileWallet(webView, true)).toBe(false);
    expect(shouldOfferMobileWallet(iphone, true)).toBe(false);
    expect(shouldOfferMobileWallet(desktop, true)).toBe(false);
  });

  it('names the wallet app from where it asks to be reached', () => {
    expect(walletAppName('https://phantom.app/ul/v1')).toBe('Phantom');
    expect(walletAppName('https://solflare.com/ul/v1')).toBe('Solflare');
    expect(walletAppName('https://backpack.app/ul/v1')).toBe('Backpack');
    expect(walletAppName('https://notphantom.app/')).toBeNull();
    expect(walletAppName('https://example.com/wallet')).toBeNull();
    expect(walletAppName('nonsense')).toBeNull();
    expect(walletAppName(undefined)).toBeNull();
  });
});
