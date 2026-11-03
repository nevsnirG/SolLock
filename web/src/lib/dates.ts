import { DAY, formatUtc, type UnixSeconds } from '@sollock/core';

/** The site is in English: dates read "1 Jan 2032" everywhere, in UTC unless marked as local. */
export const DATE_LOCALE = 'en-GB';

const dayUtc = new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const longDayUtc = new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const isMidnightUtc = (at: UnixSeconds) => at % DAY === 0n;

/** "1 Jan 2032" for a lock that opens at midnight UTC, else "2 Nov 2026, 15:00 UTC". */
export function unlockLabel(at: UnixSeconds): string {
  return isMidnightUtc(at) ? dayUtc.format(Number(at) * 1000) : formatUtc(at);
}

/** "1 January 2032, 00:00 UTC". */
export function unlockLabelLong(at: UnixSeconds): string {
  return isMidnightUtc(at) ? `${longDayUtc.format(Number(at) * 1000)}, 00:00 UTC` : formatUtc(at);
}

/** The same moment on the viewer's own clock: "1 Jan 2032, 01:00 CET". */
export function localTime(at: UnixSeconds, timeZone?: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    timeZone,
  }).format(Number(at) * 1000);
}

export function utcYear(at: UnixSeconds): number {
  return new Date(Number(at) * 1000).getUTCFullYear();
}
