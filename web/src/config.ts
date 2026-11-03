import { type Address, address } from '@solana/kit';

export type Cluster = 'devnet' | 'mainnet';

export const CLUSTER: Cluster = clusterFrom(import.meta.env.PUBLIC_SOLANA_CLUSTER);

export function clusterFrom(value: string | undefined): Cluster {
  if (value === undefined || value === '' || value === 'devnet') return 'devnet';
  if (value === 'mainnet') return 'mainnet';
  throw new Error(`PUBLIC_SOLANA_CLUSTER must be "devnet" or "mainnet", not "${value}".`);
}

const FEE_ADDRESSES: Record<Cluster, Address> = {
  devnet: address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv'),
  mainnet: address('77xiaSmtDYTQXhWoEFbKa232CXrws7SHrDhXuAWZa4HS'),
};

export const feeAddressFor = (cluster: Cluster): Address => FEE_ADDRESSES[cluster];

export const FEE_ADDRESS: Address = feeAddressFor(CLUSTER);

export interface Exchange {
  name: string;
  url: string;
  /** endsOn is the first day (UTC) the offer no longer shows. */
  offer?: { text: string; endsOn?: string };
}

/** Referral links only, to exchanges that sell SOL, so one affiliate note covers them all. */
export const EXCHANGES: readonly Exchange[] = [
  {
    name: 'Bitvavo',
    url: 'https://bitvavo.com/invite?a=3747AE2545',
    offer: { text: 'No fees on your first €10,000 of trades', endsOn: '2027-01-01' },
  },
  { name: 'Kraken', url: 'https://invite.kraken.com/JDNW/cvo93rvs', offer: { text: '€30 when you deposit €200 and trade €200' } },
];

export function liveOffer(exchange: Exchange, today: Date): string | null {
  const { offer } = exchange;
  if (!offer) return null;
  return offer.endsOn !== undefined && today.getTime() >= Date.parse(offer.endsOn) ? null : offer.text;
}

export const AFFILIATE_NOTE = 'These are affiliate links: we may earn a commission if you sign up through one.';
export const OFFERS_NOTE = "The offers are the exchanges' own, with their conditions, and can differ by country.";

export const ESMA_REGISTER_URL = 'https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica';

export const EXPLORER_URL = 'https://explorer.solana.com';

export function explorerAddressUrl(addr: string, cluster: Cluster = CLUSTER): string {
  const query = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `${EXPLORER_URL}/address/${addr}${query}`;
}

export function explorerTxUrl(signature: string, cluster: Cluster = CLUSTER): string {
  const query = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `${EXPLORER_URL}/tx/${signature}${query}`;
}

export const BUSINESS: { tradeName: string; place: string; kvk: string | null; vat: string | null; email: string } = {
  tradeName: 'SolLock',
  place: 'Rotterdam, the Netherlands',
  kvk: null,
  vat: null,
  email: 'hello@sollock.io',
} as const;

export const SITE_URL = import.meta.env.PUBLIC_SITE || 'https://sollock.io';

/** The public repository. The site is source-available: anyone can read the code it runs. */
export const REPOSITORY_URL = 'https://github.com/nevsnirG/SolLock';

/** Read as text by the deploy check, which refuses a production deploy while it is true. */
export const LEGAL_DRAFT = false;

/** SOL's CoinList public-sale price in 2020, as announced by the Solana Foundation. */
export const SALE_PRICE_2020_USD = 0.22;
