import { DAY, formatUtc, type UnixSeconds } from '@sollock/core';

export const DATE_LOCALE = 'en-GB';

const dayUtc = new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const longDayUtc = new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const isMidnightUtc = (at: UnixSeconds) => at % DAY === 0n;

export function unlockLabel(at: UnixSeconds): string {
  return isMidnightUtc(at) ? dayUtc.format(Number(at) * 1000) : formatUtc(at);
}

export function unlockLabelLong(at: UnixSeconds): string {
  return isMidnightUtc(at) ? `${longDayUtc.format(Number(at) * 1000)}, 00:00 UTC` : formatUtc(at);
}

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
