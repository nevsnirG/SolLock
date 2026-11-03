import { type Address, address } from '@solana/kit';

export type Cluster = 'devnet' | 'mainnet';

/** Chosen at build time. The Worker has its own CLUSTER; the two must match. */
export const CLUSTER: Cluster = clusterFrom(import.meta.env.PUBLIC_SOLANA_CLUSTER);

export function clusterFrom(value: string | undefined): Cluster {
  if (value === undefined || value === '' || value === 'devnet') return 'devnet';
  if (value === 'mainnet') return 'mainnet';
  throw new Error(`PUBLIC_SOLANA_CLUSTER must be "devnet" or "mainnet", not "${value}".`);
}

/**
 * Where our fee goes. Devnet: a throwaway address from packages/core's devnet script. Mainnet: our
 * fee wallet (given 2 Nov 2026), used only for receiving fees.
 */
const FEE_ADDRESSES: Record<Cluster, Address> = {
  devnet: address('DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv'),
  mainnet: address('77xiaSmtDYTQXhWoEFbKa232CXrws7SHrDhXuAWZa4HS'),
};

export const feeAddressFor = (cluster: Cluster): Address => FEE_ADDRESSES[cluster];

export const FEE_ADDRESS: Address = feeAddressFor(CLUSTER);

export interface Exchange {
  name: string;
  /** Our referral link. */
  url: string;
  /** What the exchange offers someone who signs up through the link, and the day it stops, if known. */
  offer?: { text: string; endsOn?: string };
}

/**
 * The "Need Solana first?" links, alphabetical. Only exchanges that sell SOL. Our referral links
 * only, no plain links (2 Nov 2026), so they are all affiliate links and one note under them says
 * so (3 Nov 2026). The offers are as our referral pages showed them on 3 Nov 2026; Bitvavo's
 * terms take sign-ups until 31 Dec 2026. Update or remove an offer when the exchange changes it.
 */
export const EXCHANGES: readonly Exchange[] = [
  {
    name: 'Bitvavo',
    url: 'https://bitvavo.com/invite?a=3747AE2545',
    offer: { text: 'No fees on your first €10,000 of trades', endsOn: '2027-01-01' },
  },
  { name: 'Kraken', url: 'https://invite.kraken.com/JDNW/cvo93rvs', offer: { text: '€30 when you deposit €200 and trade €200' } },
];

/** An exchange's offer while it runs: gone from the day it stops. */
export function liveOffer(exchange: Exchange, today: Date): string | null {
  const { offer } = exchange;
  if (!offer) return null;
  return offer.endsOn !== undefined && today.getTime() >= Date.parse(offer.endsOn) ? null : offer.text;
}

export const AFFILIATE_NOTE = 'These are affiliate links: we may earn a commission if you sign up through one.';
export const OFFERS_NOTE = "The offers are the exchanges' own, with their conditions, and can differ by country.";

/** ESMA's register of crypto-asset service providers authorised under MiCA. */
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

/**
 * Who sells the service, for the receipt and the legal pages. No street address, KvK or VAT number at
 * launch (2 Nov 2026): the pages and the receipt leave out what is null.
 */
export const BUSINESS: { tradeName: string; place: string; kvk: string | null; vat: string | null; email: string } = {
  tradeName: 'SolLock',
  place: 'Rotterdam, the Netherlands',
  kvk: null,
  vat: null,
  email: 'hello@sollock.io',
} as const;

/** This deployment's address: https://devnet.sollock.io for staging, https://sollock.io in production. */
export const SITE_URL = import.meta.env.PUBLIC_SITE || 'https://sollock.io';

/**
 * While true, a production deploy is refused (scripts/check-deploy-config.mjs).
 */
export const LEGAL_DRAFT = false;

/**
 * SOL's price in its public sale, 24 March 2020 (CoinList, sold out at $0.22 a token; Solana
 * Foundation, "Solana Raises $1.76 Million in Sold Out Coinlist Auction"). The home page sets it
 * against today's price (2 Nov 2026).
 */
export const SALE_PRICE_2020_USD = 0.22;
