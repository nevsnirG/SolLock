import { describe, expect, it } from 'vitest';
import {
  DAY,
  newYearsDayUnlockAt,
  formatUtc,
  HOUR,
  isLongLock,
  MAX_UNLOCK_AT,
  testLockUnlockAt,
  unlockTimeProblem,
  utcMidnight,
  yearsFromNow,
} from '../src/index.ts';

const now = utcMidnight(2026, 11, 1); // 1 Nov 2026, 00:00 UTC

describe('time', () => {
  it('puts the drawers at 1 January, 00:00 UTC', () => {
    expect(newYearsDayUnlockAt(2032)).toBe(1_956_528_000n);
    expect(formatUtc(newYearsDayUnlockAt(2052))).toBe('1 Jan 2052, 00:00 UTC');
  });

  it('opens a test lock 24 hours later, rounded up to the hour', () => {
    expect(testLockUnlockAt(now)).toBe(now + DAY);
    expect(testLockUnlockAt(now + 1n)).toBe(now + DAY + HOUR);
    expect(testLockUnlockAt(now + HOUR - 1n)).toBe(now + DAY + HOUR);
  });

  it('counts whole years, opening the day after', () => {
    expect(yearsFromNow(now, 1)).toBe(utcMidnight(2027, 11, 2));
    expect(yearsFromNow(now + 13n * HOUR, 5)).toBe(utcMidnight(2031, 11, 2));
    // 29 Feb 2028 plus one year: 28 Feb 2029 is the anniversary, so it opens 1 Mar 2029.
    expect(yearsFromNow(utcMidnight(2028, 2, 29) + 12n * HOUR, 1)).toBe(utcMidnight(2029, 3, 1));
  });

  it('allows only dates from an hour ahead to the end of 2076', () => {
    expect(unlockTimeProblem(now - 1n, now)).toMatch(/future/);
    expect(unlockTimeProblem(now, now)).toMatch(/future/);
    expect(unlockTimeProblem(now + HOUR - 1n, now)).toMatch(/hour/);
    expect(unlockTimeProblem(now + HOUR, now)).toBeNull();
    expect(unlockTimeProblem(MAX_UNLOCK_AT, now)).toBeNull();
    expect(unlockTimeProblem(MAX_UNLOCK_AT + 1n, now)).toMatch(/2076/);
  });

  it('flags locks of more than 10 years', () => {
    expect(isLongLock(newYearsDayUnlockAt(2037), now)).toBe(true);
    expect(isLongLock(newYearsDayUnlockAt(2032), now)).toBe(false);
    expect(isLongLock(yearsFromNow(now, 10), now)).toBe(false);
  });

  it('formats in UTC', () => {
    expect(formatUtc(now + 13n * HOUR + 5n * 60n)).toBe('1 Nov 2026, 13:05 UTC');
  });
});
