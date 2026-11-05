/**
 * The parts of the Android wallet path that every page may need: whether to offer it, Chrome's permission
 * for it, and how its failures are recognised. The protocol code itself is in mobileWallet.ts and loads only on Android.
 */

export const MOBILE_WALLET_NAME = 'Wallet app on this phone';

/** Solana Mobile's own test: a browser's page can reach wallet apps, a wallet's built-in browser cannot (it injects its wallet instead). */
const WEB_VIEW = /(WebView|Version\/.+(Chrome)\/(\d+)\.(\d+)\.(\d+)\.(\d+)|; wv\).+(Chrome)\/(\d+)\.(\d+)\.(\d+)\.(\d+))/i;

export function shouldOfferMobileWallet(userAgent: string, secureContext: boolean): boolean {
  return secureContext && /android/i.test(userAgent) && !WEB_VIEW.test(userAgent);
}

const KNOWN_APPS: readonly (readonly [RegExp, string])[] = [
  [/(^|\.)phantom\.app$/, 'Phantom'],
  [/(^|\.)solflare\.com$/, 'Solflare'],
  [/(^|\.)backpack\.app$/, 'Backpack'],
];

/** The wallet app names itself only through the address it asks to be reached at next time. */
export function walletAppName(walletUriBase: string | undefined): string | null {
  if (!walletUriBase) return null;
  try {
    const host = new URL(walletUriBase).hostname;
    return KNOWN_APPS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The phone did not open a wallet app: none is installed, or the browser refused to open one. */
export class NoWalletAppError extends Error {
  override name = 'NoWalletAppError';
  constructor(options?: ErrorOptions) {
    super('No wallet app on this phone answered.', options);
  }
}

const MAX_CAUSE_DEPTH = 5;

/** The error and what it was caused by, nearest first. */
export function* causeChain(error: unknown): Generator<unknown> {
  for (let current = error, depth = 0; current && depth < MAX_CAUSE_DEPTH; depth++) {
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

export function isNoWalletApp(error: unknown): boolean {
  for (const current of causeChain(error)) {
    if (current instanceof NoWalletAppError) return true;
    if ((current as { code?: unknown }).code === 'ERROR_WALLET_NOT_FOUND') return true;
  }
  return false;
}

export type LoopbackPermission = PermissionState | 'unknown';

/** Chrome's name for the permission; not in the browser typings yet. */
const LOOPBACK_PERMISSION = { name: 'loopback-network' } as unknown as PermissionDescriptor;

/**
 * Chrome asks before a page may talk to the phone itself, and the wallet app answers over ws://localhost.
 * A browser without the question answers "unknown" and needs no asking.
 */
export async function loopbackPermission(): Promise<LoopbackPermission> {
  try {
    const status = await navigator.permissions.query(LOOPBACK_PERMISSION);
    return status.state;
  } catch {
    return 'unknown';
  }
}

/** Raises Chrome's question and settles once it is answered; nothing listens on port 80, so the request itself fails harmlessly. */
export async function askLoopbackPermission(): Promise<LoopbackPermission> {
  try {
    await fetch('http://localhost/', { mode: 'no-cors' });
  } catch {
    // Expected: the question was the point.
  }
  return loopbackPermission();
}
