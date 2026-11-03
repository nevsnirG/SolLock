import {
  DAY,
  MAX_UNLOCK_AT,
  MIN_LOCK_DURATION,
  NEW_YEAR_PRESET_YEARS,
  newYearsDayUnlockAt,
  type UnixSeconds,
  utcMidnight,
  yearsFromNow,
} from '@sollock/core';

export const YEAR_PRESETS = [1, 5, 10] as const;

export type UnlockChoice = { kind: 'years'; years: number } | { kind: 'newYear'; year: number } | { kind: 'custom'; date: string };

export const DEFAULT_CHOICE: UnlockChoice = { kind: 'years', years: 1 };

export function availableNewYears(now: UnixSeconds): number[] {
  return NEW_YEAR_PRESET_YEARS.filter((year) => newYearsDayUnlockAt(year) >= now + MIN_LOCK_DURATION);
}

export function unlockAtFor(choice: UnlockChoice, now: UnixSeconds): UnixSeconds | null {
  switch (choice.kind) {
    case 'years':
      return yearsFromNow(now, choice.years);
    case 'newYear':
      return newYearsDayUnlockAt(choice.year);
    case 'custom': {
      const day = parseDateInput(choice.date);
      return day ? utcMidnight(day.year, day.month, day.day) : null;
    }
  }
}

export function sameChoice(a: UnlockChoice, b: UnlockChoice): boolean {
  if (a.kind === 'years' && b.kind === 'years') return a.years === b.years;
  if (a.kind === 'newYear' && b.kind === 'newYear') return a.year === b.year;
  return a.kind === 'custom' && b.kind === 'custom';
}

export function parseDateInput(text: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function dateInputValue(at: UnixSeconds): string {
  return new Date(Number(at) * 1000).toISOString().slice(0, 10);
}

export const minDateInput = (now: UnixSeconds) => dateInputValue(now + DAY);

export const MAX_DATE_INPUT = dateInputValue(MAX_UNLOCK_AT);

export const defaultCustomDate = (now: UnixSeconds) => dateInputValue(yearsFromNow(now, 1));
