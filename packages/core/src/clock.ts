import { type Address, address, getI64Decoder } from '@solana/kit';
import { DAY, HOUR, type UnixSeconds } from './time.ts';

/** The network's own clock, which the Stake program compares the lockup date against. */
export const CLOCK_SYSVAR_ADDRESS: Address = address('SysvarC1ock11111111111111111111111111111111');

/** Clock sysvar layout: slot (8), epoch start timestamp (8), epoch (8), leader-schedule epoch (8), unix timestamp (8). */
export const CLOCK_UNIX_TIMESTAMP_OFFSET = 32;
export const CLOCK_UNIX_TIMESTAMP_SIZE = 8;

/**
 * Half an hour. The network's clock itself has lagged the wall clock by minutes, once by about this much, and the
 * skew this guards against is hours or years, so a wide margin costs nothing.
 */
export const MAX_CLOCK_SKEW: UnixSeconds = 30n * 60n;

/** Takes the eight-byte slice the site asks for, or the whole account from a provider that ignores the slice. */
export function decodeClockUnixTimestamp(bytes: Uint8Array): UnixSeconds {
  const end = CLOCK_UNIX_TIMESTAMP_OFFSET + CLOCK_UNIX_TIMESTAMP_SIZE;
  if (bytes.length === CLOCK_UNIX_TIMESTAMP_SIZE) return getI64Decoder().decode(bytes);
  if (bytes.length >= end) return getI64Decoder().decode(bytes.subarray(CLOCK_UNIX_TIMESTAMP_OFFSET, end));
  throw new Error(`Expected ${CLOCK_UNIX_TIMESTAMP_SIZE} or at least ${end} bytes of clock, got ${bytes.length}`);
}

/**
 * Every date in a lock comes from the device clock: the unlock time, the one-hour minimum and the free test lock's
 * day. A clock that is far off would build a lock other than the one shown, so it stops the lock instead.
 */
export function clockSkewProblem(chainNow: UnixSeconds, localNow: UnixSeconds, tolerance: UnixSeconds = MAX_CLOCK_SKEW): string | null {
  const skew = localNow - chainNow;
  const size = skew < 0n ? -skew : skew;
  if (size <= tolerance) return null;
  const direction = skew > 0n ? 'ahead of' : 'behind';
  return `Your device's clock is ${describeSpan(size)} ${direction} the Solana network's. The dates on this page come from your clock, so nothing was sent. Set the clock right and try again.`;
}

const SPANS: readonly [UnixSeconds, string][] = [
  [365n * DAY, 'year'],
  [DAY, 'day'],
  [HOUR, 'hour'],
];

function describeSpan(seconds: UnixSeconds): string {
  for (const [unit, name] of SPANS) if (seconds >= 2n * unit) return `${seconds / unit} ${name}s`;
  const minutes = seconds / 60n;
  return minutes === 1n ? '1 minute' : `${minutes} minutes`;
}
