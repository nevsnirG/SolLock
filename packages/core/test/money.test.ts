import { describe, expect, it } from 'vitest';
import { AmountError, currencyForLocale, formatFiat, formatSol, lamportsToFiat, parseSol } from '../src/index.ts';

describe('parseSol', () => {
  it('reads amounts exactly', () => {
    expect(parseSol('2')).toBe(2_000_000_000n);
    expect(parseSol('0.5')).toBe(500_000_000n);
    expect(parseSol('.5')).toBe(500_000_000n);
    expect(parseSol('5.')).toBe(5_000_000_000n);
    expect(parseSol(' 1.25 ')).toBe(1_250_000_000n);
    expect(parseSol('0.000000001')).toBe(1n);
    expect(parseSol('123456789.123456789')).toBe(123_456_789_123_456_789n);
  });

  it('accepts a decimal comma', () => {
    expect(parseSol('1,25')).toBe(1_250_000_000n);
  });

  it('refuses what is not an amount', () => {
    for (const bad of ['', ' ', '.', 'abc', '-1', '1e3', '1.2.3', '1,000.5', '0x10']) {
      expect(() => parseSol(bad), bad).toThrow(AmountError);
    }
  });

  it('refuses more than 9 decimals', () => {
    expect(() => parseSol('0.0000000001')).toThrow(AmountError);
  });
});

describe('formatSol', () => {
  it('drops trailing zeros', () => {
    expect(formatSol(2_000_000_000n)).toBe('2');
    expect(formatSol(10_000_000n)).toBe('0.01');
    expect(formatSol(1_666_240n)).toBe('0.00166624');
    expect(formatSol(1n)).toBe('0.000000001');
    expect(formatSol(0n)).toBe('0');
    expect(formatSol(-1_500_000_000n)).toBe('-1.5');
  });

  it('round-trips with parseSol', () => {
    for (const s of ['0.01', '2', '100.123456789', '0.00166624']) expect(formatSol(parseSol(s))).toBe(s);
  });
});

describe('money values', () => {
  it('converts at a given price', () => {
    expect(lamportsToFiat(2_000_000_000n, 150)).toBeCloseTo(300);
    expect(lamportsToFiat(10_000_000n, 150)).toBeCloseTo(1.5);
  });

  it('formats in the user locale', () => {
    expect(formatFiat(4.21, 'EUR', 'nl-NL')).toMatch(/€\s?4,21/);
    expect(formatFiat(4.21, 'USD', 'en-US')).toBe('$4.21');
  });

  it('picks a currency from the locale', () => {
    expect(currencyForLocale('nl-NL')).toBe('EUR');
    expect(currencyForLocale('nl')).toBe('EUR');
    expect(currencyForLocale('fr-BE')).toBe('EUR');
    expect(currencyForLocale('de')).toBe('EUR');
    expect(currencyForLocale('en-GB')).toBe('GBP');
    expect(currencyForLocale('de-CH')).toBe('CHF');
    expect(currencyForLocale('en-US')).toBe('USD');
    expect(currencyForLocale('en')).toBe('USD');
    expect(currencyForLocale('ja-JP')).toBe('JPY');
    expect(currencyForLocale('not a locale')).toBe('USD');
  });
});
