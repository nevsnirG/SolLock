import { newYearsDayUnlockAt, utcMidnight } from '@sollock/core';
import { describe, expect, it } from 'vitest';
import { availableNewYears, dateInputValue, minDateInput, parseDateInput, unlockAtFor } from '../src/lib/unlockDate.ts';

const NOW = BigInt(Date.UTC(2026, 10, 1, 14, 30) / 1000); // 1 Nov 2026, 14:30 UTC

describe('unlock choices', () => {
  it('turns presets into unlock times', () => {
    expect(unlockAtFor({ kind: 'years', years: 1 }, NOW)).toBe(utcMidnight(2027, 11, 2));
    expect(unlockAtFor({ kind: 'years', years: 10 }, NOW)).toBe(utcMidnight(2036, 11, 2));
    expect(unlockAtFor({ kind: 'newYear', year: 2032 }, NOW)).toBe(newYearsDayUnlockAt(2032));
    expect(unlockAtFor({ kind: 'custom', date: '2030-06-30' }, NOW)).toBe(utcMidnight(2030, 6, 30));
  });

  it('reads custom dates strictly', () => {
    expect(parseDateInput('2030-02-29')).toBeNull();
    expect(parseDateInput('2032-02-29')).toEqual({ year: 2032, month: 2, day: 29 });
    expect(parseDateInput('30-06-2030')).toBeNull();
    expect(parseDateInput('')).toBeNull();
    expect(unlockAtFor({ kind: 'custom', date: 'soon' }, NOW)).toBeNull();
  });

  it('offers only New Year presets that are still ahead', () => {
    expect(availableNewYears(NOW)).toEqual([2028, 2032, 2037, 2052]);
    expect(availableNewYears(newYearsDayUnlockAt(2028))).toEqual([2032, 2037, 2052]);
  });

  it('starts the date picker tomorrow, and shows a lock date as the picker would', () => {
    expect(minDateInput(NOW)).toBe('2026-11-02');
    expect(dateInputValue(newYearsDayUnlockAt(2032))).toBe('2032-01-01');
  });
});
