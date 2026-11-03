export type UnixSeconds = bigint;

export const HOUR = 3_600n;
export const DAY = 86_400n;

export const MAX_UNLOCK_AT: UnixSeconds = BigInt(Date.UTC(2076, 11, 31, 23, 59, 59) / 1000);

export const MIN_LOCK_DURATION = HOUR;

export const LONG_LOCK_YEARS = 10;

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

/** Midnight UTC after the same date `years` on, so it never lifts early; 29 Feb falls back to 28 Feb. */
export function yearsFromNow(now: UnixSeconds, years: number): UnixSeconds {
  const d = new Date(Number(now) * 1000);
  const year = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return BigInt(Date.UTC(year, month, day + 1) / 1000);
}

export function testLockUnlockAt(now: UnixSeconds): UnixSeconds {
  const target = now + DAY;
  const rem = target % HOUR;
  return rem === 0n ? target : target + (HOUR - rem);
}

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

export function formatUtc(at: UnixSeconds): string {
  return `${utcFormat.format(new Date(Number(at) * 1000))} UTC`;
}
