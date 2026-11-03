import { LAMPORTS_PER_SOL } from './constants.ts';

const SOL_DECIMALS = 9;

export class AmountError extends Error {
  override name = 'AmountError';
}

/** Parse what a user typed ("2", "0.5", "1,25") into lamports, exactly, without floating point. */
export function parseSol(input: string): bigint {
  const text = input.trim().replace(',', '.');
  if (text === '') throw new AmountError('Enter an amount.');
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) throw new AmountError('Enter a number, like 2 or 0.5.');
  const whole = match[1] || '0';
  const fraction = match[2] ?? '';
  if (fraction.length > SOL_DECIMALS) throw new AmountError('SOL has at most 9 decimals.');
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fraction.padEnd(SOL_DECIMALS, '0'));
}

/** Lamports as SOL with no trailing zeros: 2000000000n is "2", 1500000n is "0.0015". */
export function formatSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const fraction = (abs % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Today's value of an amount, given a price per SOL. For display only; never for a forecast. */
export function lamportsToFiat(lamports: bigint, pricePerSol: number): number {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)) * pricePerSol;
}

export function formatFiat(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/**
 * Currencies we offer, all of which CoinGecko quotes. The user's locale picks the default; they can
 * switch to any of these.
 */
export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY',
  'CAD', 'AUD', 'NZD', 'JPY', 'KRW', 'CNY', 'HKD', 'SGD', 'INR', 'BRL', 'MXN', 'ZAR',
] as const;
export type Currency = (typeof CURRENCIES)[number];

const EURO_REGIONS = new Set([
  'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PT', 'SI', 'SK', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
]);

const REGION_CURRENCY: Record<string, Currency> = {
  US: 'USD', GB: 'GBP', CH: 'CHF', LI: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK',
  HU: 'HUF', RO: 'RON', TR: 'TRY', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', CN: 'CNY',
  HK: 'HKD', SG: 'SGD', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR',
};

export function isCurrency(code: string): code is Currency {
  return (CURRENCIES as readonly string[]).includes(code);
}

/** The default currency for a browser locale such as "nl-NL" or "en". Falls back to USD. */
export function currencyForLocale(locale: string): Currency {
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).maximize().region;
  } catch {
    return 'USD';
  }
  if (!region) return 'USD';
  if (EURO_REGIONS.has(region)) return 'EUR';
  return REGION_CURRENCY[region] ?? 'USD';
}
