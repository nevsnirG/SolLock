/** Unix time in seconds, as the stake program's lockup stores it. */
export type UnixSeconds = bigint;

export const HOUR = 3_600n;
export const DAY = 86_400n;

/** Latest unlock time the builder accepts: 31 Dec 2076, 23:59:59 UTC. */
export const MAX_UNLOCK_AT: UnixSeconds = BigInt(Date.UTC(2076, 11, 31, 23, 59, 59) / 1000);

/** Earliest unlock time, relative to now. Anything sooner would lift before the user reads it. */
export const MIN_LOCK_DURATION = HOUR;

/** Past this, the builder warns that wallets will change. */
export const LONG_LOCK_YEARS = 10;

/** The New Year's Day presets: 1 January of these years, 00:00 UTC. */
export const NEW_YEAR_PRESET_YEARS = [2028, 2032, 2037, 2052] as const;

export function utcMidnight(year: number, month: number, day: number): UnixSeconds {
  return BigInt(Date.UTC(year, month - 1, day) / 1000);
}

export function nowSeconds(): UnixSeconds {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function newYearsDayUnlockAt(year: number): UnixSeconds {
  return utcMidnight(year, 1, 1);
}

/**
 * The same calendar date `years` from now, at 00:00 UTC of the day after, so the lock never lifts
 * earlier than a full number of years. 29 February falls back to 28 February.
 */
export function yearsFromNow(now: UnixSeconds, years: number): UnixSeconds {
  const d = new Date(Number(now) * 1000);
  const year = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return BigInt(Date.UTC(year, month, day + 1) / 1000);
}

/** A free test lock opens 24 hours from now, rounded up to the whole hour. */
export function testLockUnlockAt(now: UnixSeconds): UnixSeconds {
  const target = now + DAY;
  const rem = target % HOUR;
  return rem === 0n ? target : target + (HOUR - rem);
}

/** Why an unlock time is not allowed, or null when it is fine. */
export function unlockTimeProblem(unlockAt: UnixSeconds, now: UnixSeconds): string | null {
  if (unlockAt <= now) return 'Pick a date in the future.';
  if (unlockAt < now + MIN_LOCK_DURATION) return 'Pick a time at least an hour from now.';
  if (unlockAt > MAX_UNLOCK_AT) return 'Pick a date on or before 31 December 2076.';
  return null;
}

export function isLongLock(unlockAt: UnixSeconds, now: UnixSeconds): boolean {
  return unlockAt > yearsFromNow(now, LONG_LOCK_YEARS);
}

const utcFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** "1 Jan 2032, 00:00 UTC". */
export function formatUtc(at: UnixSeconds): string {
  return `${utcFormat.format(new Date(Number(at) * 1000))} UTC`;
}
