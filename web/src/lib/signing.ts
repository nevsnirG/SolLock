import {
  compileTransaction,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  type Signature,
  signAndSendTransactionMessageWithSigners,
} from '@solana/kit';
import { MAX_LOCK_COMPUTE_UNITS } from '@sollock/core';
import type { SiteRpc } from './siteRpc.ts';

export type SigningPhase =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'wallet' }
  | { kind: 'confirming'; signature: Signature }
  | { kind: 'checking' }
  | { kind: 'error'; message: string; logs?: readonly string[] };

export const isBusy = (phase: SigningPhase) => phase.kind !== 'idle' && phase.kind !== 'error';

export class FlowError extends Error {
  override name = 'FlowError';
  constructor(
    message: string,
    readonly logs: readonly string[] = [],
  ) {
    super(message);
  }
}

export class TestRunError extends FlowError {
  override name = 'TestRunError';
  constructor(
    message: string,
    logs: readonly string[],
    readonly networkError: unknown,
  ) {
    super(message, logs);
  }
}

export interface PollOptions {
  intervalMs?: number;
  maxMs?: number;
  tries?: number;
  wait?: (ms: number) => Promise<unknown>;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const COMPUTE_HEADROOM = 1.2;
const COMPUTE_MARGIN_UNITS = 1_000;

export function computeUnitLimit(consumed: bigint): number {
  return Math.min(MAX_LOCK_COMPUTE_UNITS, Math.ceil(Number(consumed) * COMPUTE_HEADROOM) + COMPUTE_MARGIN_UNITS);
}

export async function testRun(rpc: SiteRpc, message: Parameters<typeof compileTransaction>[0], what: string): Promise<{ unitsConsumed: bigint }> {
  const wire = getBase64EncodedWireTransaction(compileTransaction(message));
  const { value } = await rpc.simulateTransaction(wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }).send();
  if (value.err) {
    throw new TestRunError(`The network refused ${what} in a test run, so nothing was sent. ${explainNetworkError(value.err)}`, value.logs ?? [], value.err);
  }
  return { unitsConsumed: value.unitsConsumed ?? BigInt(MAX_LOCK_COMPUTE_UNITS) };
}

function explainNetworkError(err: unknown): string {
  const text = JSON.stringify(err, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) ?? String(err);
  if (/InsufficientFunds|insufficient (funds|lamports)/i.test(text)) return 'There is not enough Solana in the wallet.';
  if (/AccountAlreadyInUse|already in use/i.test(text)) return 'The lock address is already in use. Reload the page and try again.';
  if (/BlockhashNotFound/i.test(text)) return 'The network moved on while we were preparing. Try again.';
  return `The network said: ${text}`;
}

/** The wallet signs and broadcasts; the site's server never handles a signed transaction. */
export async function signAndSend(message: Parameters<typeof signAndSendTransactionMessageWithSigners>[0]): Promise<Signature> {
  const bytes = await signAndSendTransactionMessageWithSigners(message);
  return getBase58Decoder().decode(bytes) as Signature;
}

/** EIP-1193's "user rejected the request" code, which Solana wallets use too. */
const USER_REJECTED_CODE = 4001;
const MAX_CAUSE_DEPTH = 5;

export function isWalletRejection(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < MAX_CAUSE_DEPTH; depth++) {
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === USER_REJECTED_CODE) return true;
    if (typeof message === 'string' && /reject|declin|cancel|denied|disapprov/i.test(message)) return true;
    current = cause;
  }
  return false;
}

export async function waitForConfirmation(
  rpc: SiteRpc,
  signature: Signature,
  lastValidBlockHeight: bigint,
  { intervalMs = 1_500, maxMs = 120_000, wait = sleep }: PollOptions = {},
): Promise<'confirmed' | 'expired'> {
  for (let waited = 0; waited <= maxMs; waited += intervalMs) {
    const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
    if (status?.err) throw new FlowError(`The network rejected the transaction. ${explainNetworkError(status.err)}`);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return 'confirmed';
    const { blockHeight } = await rpc.getEpochInfo().send();
    if (blockHeight > lastValidBlockHeight) return 'expired';
    await wait(intervalMs);
  }
  return 'expired';
}

export interface SigningSteps<Prepared, Result> {
  prepare(): Promise<Prepared>;
  send(prepared: Prepared): Promise<Signature>;
  finish(prepared: Prepared, signature: Signature): Promise<Result>;
  landed(prepared: Prepared): Promise<boolean>;
  landedMessage: string;
}

export type SigningOutcome<Result> = { kind: 'done'; result: Result } | { kind: 'landed' } | { kind: 'failed' };

export async function runSigning<Prepared, Result>(
  steps: SigningSteps<Prepared, Result>,
  onPhase: (phase: SigningPhase) => void,
  pollOptions?: PollOptions,
): Promise<SigningOutcome<Result>> {
  let prepared: Prepared | undefined;
  let sentByWallet = false;
  try {
    onPhase({ kind: 'preparing' });
    prepared = await steps.prepare();
    onPhase({ kind: 'wallet' });
    const signature = await steps.send(prepared);
    sentByWallet = true;
    onPhase({ kind: 'confirming', signature });
    const result = await steps.finish(prepared, signature);
    onPhase({ kind: 'idle' });
    return { kind: 'done', result };
  } catch (error) {
    const walletFailed = prepared !== undefined && !sentByWallet;
    if (walletFailed) onPhase({ kind: 'checking' });
    const landed = walletFailed ? await checkLanded(() => steps.landed(prepared as Prepared), pollOptions) : false;
    if (landed) {
      onPhase({ kind: 'error', message: steps.landedMessage });
      return { kind: 'landed' };
    }
    onPhase({ kind: 'error', ...describeFailure(error, sentByWallet, landed === false) });
    return { kind: 'failed' };
  }
}

/** Wallets can report an error and still send, so look a few times; null when the network can't be asked. */
async function checkLanded(landed: () => Promise<boolean>, { tries = 3, intervalMs = 2_000, wait = sleep }: PollOptions = {}): Promise<boolean | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await wait(intervalMs);
    try {
      if (await landed()) return true;
    } catch {
      return null;
    }
  }
  return false;
}

function describeFailure(error: unknown, sentByWallet: boolean, nothingLanded: boolean): { message: string; logs?: readonly string[] } {
  const checkFirst = 'Check My locks before you try again, in case it went through.';
  if (!sentByWallet && isWalletRejection(error)) {
    return { message: nothingLanded ? 'You said no in your wallet. Nothing was sent.' : `You said no in your wallet. ${checkFirst}` };
  }
  if (error instanceof FlowError) return { message: error.message, logs: error.logs };
  const detail = (error as Error)?.message ?? String(error);
  return {
    message: sentByWallet ? `Something went wrong after you approved it in your wallet: ${detail}. ${checkFirst}` : `Your wallet reported a problem: ${detail}. ${checkFirst}`,
  };
}
