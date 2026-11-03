import { type Currency, currencyForLocale, formatFiat, isCurrency, lamportsToFiat } from '@sollock/core';
import { DATE_LOCALE } from './dates.ts';

/** en-US gives unambiguous symbols: "€84.57", "$84.57", "CA$84.57". */
const MONEY_LOCALE = 'en-US';

export interface Price {
  currency: Currency;
  perSol: number;
  source: string;
  /** Unix seconds. */
  asOf: number;
}

export function isPrice(value: unknown): value is Price {
  if (typeof value !== 'object' || value === null) return false;
  const { currency, perSol, source, asOf } = value as Record<string, unknown>;
  return (
    typeof currency === 'string' &&
    isCurrency(currency) &&
    typeof perSol === 'number' &&
    Number.isFinite(perSol) &&
    perSol > 0 &&
    typeof source === 'string' &&
    typeof asOf === 'number'
  );
}

export function fiatValue(lamports: bigint, price: Price): string {
  return `≈ ${formatFiat(lamportsToFiat(lamports, price.perSol), price.currency, MONEY_LOCALE)}`;
}

export function priceNote(price: Price, timeZone?: string): string {
  const time = new Intl.DateTimeFormat(DATE_LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    price.asOf * 1000,
  );
  return `at today's price (${price.source}, ${time}). Prices can go down.`;
}

const STORAGE_KEY = 'sollock:currency';

export function initialCurrency(locale: string, storage: Pick<Storage, 'getItem'> | null): Currency {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved && isCurrency(saved)) return saved;
  } catch {
    // Storage access throws when the browser blocks it; the locale decides then.
  }
  return currencyForLocale(locale);
}

export function saveCurrency(currency: Currency, storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(STORAGE_KEY, currency);
  } catch {
    // Blocked storage throws; the choice then holds for this page only.
  }
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
