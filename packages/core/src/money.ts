import { LAMPORTS_PER_SOL } from './units.ts';

const SOL_DECIMALS = 9;

export class AmountError extends Error {
  override name = 'AmountError';
}

/** Returns lamports; parsed as text so there is no floating-point rounding. */
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

export function formatSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const fraction = (abs % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function lamportsToFiat(lamports: bigint, pricePerSol: number): number {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)) * pricePerSol;
}

export function formatFiat(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/** All quoted by CoinGecko, the price source. */
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
