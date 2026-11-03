import type { UnixSeconds } from '@sollock/core';

const MINUTE = 60;
const HOUR = 3_600;
const DAY = 86_400;

export interface DurationParts {
  years: number;
  days: number;
  hours: number;
}

export function durationParts(now: UnixSeconds, until: UnixSeconds): DurationParts {
  const start = new Date(Number(now) * 1000);
  const end = Number(until) * 1000;
  if (end <= start.getTime()) return { years: 0, days: 0, hours: 0 };

  const yearsLater = (years: number) =>
    Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds());
  let years = new Date(end).getUTCFullYear() - start.getUTCFullYear();
  while (years > 0 && yearsLater(years) > end) years--;

  const rest = Math.floor((end - yearsLater(years)) / 1000);
  return { years, days: Math.floor(rest / DAY), hours: Math.floor((rest % DAY) / HOUR) };
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function durationText(now: UnixSeconds, until: UnixSeconds): string {
  const seconds = until > now ? Number(until - now) : 0;
  if (seconds < HOUR) return plural(Math.ceil(seconds / MINUTE), 'minute');
  if (seconds < 2 * DAY) return plural(Math.ceil(seconds / HOUR), 'hour');
  const { years, days, hours } = durationParts(now, until);
  const parts: string[] = [];
  if (years) parts.push(plural(years, 'year'));
  if (days || !years) parts.push(plural(days, 'day'));
  if (!years && days < 3) parts.push(plural(hours, 'hour'));
  return parts.join(', ');
}
