import {
  type Address,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase58Decoder,
  getTransactionDecoder,
  type KeyPairSigner,
} from '@solana/kit';
import type { Page } from '@playwright/test';
import type { FakeChain } from './chain.ts';

export const WALLET_NAME = 'Test Wallet';

type SendReply = { signature: number[] } | { rejected: true };

/** In the page a Wallet Standard wallet; here in Node it signs with a real key and hands each transaction to the fake chain. */
export class TestWallet {
  readonly sent: Uint8Array[] = [];
  rejectNext = false;

  private constructor(
    private readonly signer: KeyPairSigner,
    private readonly chain: FakeChain,
  ) {}

  static async install(page: Page, chain: FakeChain): Promise<TestWallet> {
    const wallet = new TestWallet(await generateKeyPairSigner(), chain);
    await page.exposeFunction('__testWalletSend', (bytes: number[]) => wallet.send(Uint8Array.from(bytes)));
    await page.addInitScript(registerWalletStandardWallet, {
      name: WALLET_NAME,
      address: wallet.address,
      publicKey: [...getAddressEncoder().encode(wallet.address)],
      chain: 'solana:devnet',
    });
    return wallet;
  }

  get address(): Address {
    return this.signer.address;
  }

  /** From now on the wallet leaves a request to connect unanswered, like a wallet whose window was closed, or answers again. */
  async answerConnecting(page: Page, answers: boolean) {
    await page.evaluate((silent) => {
      (window as unknown as { __testWalletSilent?: boolean }).__testWalletSilent = silent;
    }, !answers);
  }

  private async send(wire: Uint8Array): Promise<SendReply> {
    if (this.rejectNext) {
      this.rejectNext = false;
      return { rejected: true };
    }
    this.sent.push(wire);
    const { messageBytes } = getTransactionDecoder().decode(wire);
    const [signatures] = await this.signer.signMessages([{ content: new Uint8Array(messageBytes), signatures: {} }]);
    const signature = signatures![this.address]!;
    this.chain.execute(wire, getBase58Decoder().decode(signature));
    return { signature: [...signature] };
  }
}

interface WalletSpec {
  name: string;
  address: string;
  publicKey: number[];
  chain: string;
}

/** Runs in the page before its scripts, so it can use only its argument and browser globals. */
function registerWalletStandardWallet(spec: WalletSpec) {
  type Listener = (properties: { accounts: unknown[] }) => void;
  const send = (bytes: number[]) => (window as unknown as { __testWalletSend: (b: number[]) => Promise<SendReply> }).__testWalletSend(bytes);
  const account = {
    address: spec.address,
    publicKey: new Uint8Array(spec.publicKey),
    chains: [spec.chain],
    features: ['solana:signAndSendTransaction'],
  };
  const listeners = new Set<Listener>();
  let accounts: (typeof account)[] = [];
  const setAccounts = (next: (typeof account)[]) => {
    accounts = next;
    for (const listener of listeners) listener({ accounts });
  };

  const wallet = {
    version: '1.0.0',
    name: spec.name,
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxIDEnLz4=',
    chains: [spec.chain],
    get accounts() {
      return accounts;
    },
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => {
          if ((window as unknown as { __testWalletSilent?: boolean }).__testWalletSilent) await new Promise(() => {});
          setAccounts([account]);
          return { accounts };
        },
      },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => setAccounts([]) },
      'standard:events': {
        version: '1.0.0',
        on: (_event: string, listener: Listener) => (listeners.add(listener), () => listeners.delete(listener)),
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signAndSendTransaction: async (...inputs: { transaction?: Uint8Array }[]) => {
          const outputs = [];
          for (const input of inputs) {
            if (!(input.transaction instanceof Uint8Array)) throw new Error('Expected a transaction');
            const reply = await send([...input.transaction]);
            if ('rejected' in reply) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            outputs.push({ signature: new Uint8Array(reply.signature) });
          }
          return outputs;
        },
      },
    },
  };

  const register = (api: { register: (w: typeof wallet) => void }) => api.register(wallet);
  window.addEventListener('wallet-standard:app-ready', (event) => register((event as CustomEvent).detail));
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
}
