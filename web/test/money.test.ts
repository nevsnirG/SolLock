import { describe, expect, it } from 'vitest';
import { durationParts, durationText } from '../src/lib/duration.ts';
import { localTime, unlockLabel, unlockLabelLong } from '../src/lib/dates.ts';
import { fiatValue, initialCurrency, isPrice, type Price, priceNote, saveCurrency } from '../src/lib/money.ts';

const price: Price = { currency: 'EUR', perSol: 84.57, source: 'CoinGecko', asOf: Date.UTC(2026, 10, 1, 13, 5) / 1000 };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('money values', () => {
  it("shows today's value with its source, time and a warning", () => {
    expect(fiatValue(2_000_000_000n, price)).toBe('≈ €169.14');
    expect(fiatValue(10_000_000n, { ...price, currency: 'USD' })).toBe('≈ $0.85');
    expect(priceNote(price, 'Europe/Amsterdam')).toBe("at today's price (CoinGecko, 14:05). Prices can go down.");
  });

  it('accepts only well-formed prices from the API', () => {
    expect(isPrice(price)).toBe(true);
    expect(isPrice({ ...price, currency: 'XYZ' })).toBe(false);
    expect(isPrice({ ...price, perSol: -1 })).toBe(false);
    expect(isPrice({ error: 'No price available right now.' })).toBe(false);
    expect(isPrice(null)).toBe(false);
  });

  it("starts from the browser's locale and remembers the user's choice", () => {
    expect(initialCurrency('nl-NL', memoryStorage())).toBe('EUR');
    expect(initialCurrency('en-GB', memoryStorage())).toBe('GBP');
    const storage = memoryStorage();
    saveCurrency('CHF', storage);
    expect(initialCurrency('nl-NL', storage)).toBe('CHF');
    expect(initialCurrency('nl-NL', memoryStorage({ 'sollock:currency': 'BTC' }))).toBe('EUR');
  });

  it('copes with blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(initialCurrency('de-DE', blocked)).toBe('EUR');
    expect(() => saveCurrency('EUR', blocked)).not.toThrow();
    expect(initialCurrency('en-US', null)).toBe('USD');
  });
});

describe('dates and durations', () => {
  const now = BigInt(Date.UTC(2026, 10, 1, 14, 30) / 1000);

  it('labels unlock times in UTC', () => {
    expect(unlockLabel(BigInt(Date.UTC(2032, 0, 1) / 1000))).toBe('1 Jan 2032');
    expect(unlockLabelLong(BigInt(Date.UTC(2032, 0, 1) / 1000))).toBe('1 January 2032, 00:00 UTC');
    expect(unlockLabel(BigInt(Date.UTC(2026, 10, 2, 15) / 1000))).toBe('2 Nov 2026, 15:00 UTC');
    expect(localTime(BigInt(Date.UTC(2032, 0, 1) / 1000), 'Europe/Amsterdam')).toBe('1 Jan 2032, 01:00 CET');
  });

  it('splits a duration into calendar years, days and hours', () => {
    expect(durationParts(now, BigInt(Date.UTC(2032, 0, 1) / 1000))).toEqual({ years: 5, days: 60, hours: 9 });
    expect(durationParts(now, now - 10n)).toEqual({ years: 0, days: 0, hours: 0 });
  });

  it('describes durations in words', () => {
    expect(durationText(now, BigInt(Date.UTC(2032, 0, 1) / 1000))).toBe('5 years, 60 days');
    expect(durationText(now, BigInt(Date.UTC(2026, 10, 2, 15) / 1000))).toBe('25 hours');
    expect(durationText(now, BigInt(Date.UTC(2026, 10, 4, 0) / 1000))).toBe('2 days, 9 hours');
    expect(durationText(now, BigInt(Date.UTC(2027, 10, 2) / 1000))).toBe('1 year');
    expect(durationText(now, now + 3_599n)).toBe('60 minutes');
    expect(durationText(now, now + 61n)).toBe('2 minutes');
    expect(durationText(now, now + 30n)).toBe('1 minute');
  });
});
