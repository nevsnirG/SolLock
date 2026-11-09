import { BUSINESS, REPOSITORY_URL, SITE_DESCRIPTION, SITE_URL } from '../config.ts';

/** Builders for the schema.org JSON-LD blocks that give search engines the site name, logo, breadcrumbs and FAQ. */

const CONTEXT = 'https://schema.org';

export const absolute = (path: string): string => new URL(path, SITE_URL).href;

/** SolLock as an organisation. The @id lets other blocks on the same page point at it. */
export const ORGANIZATION = {
  '@type': 'Organization',
  '@id': absolute('/#organization'),
  name: 'SolLock',
  url: absolute('/'),
  logo: { '@type': 'ImageObject', url: absolute('/icon-192.png') },
  email: BUSINESS.email,
  sameAs: [REPOSITORY_URL],
} as const;

export const organization = () => ({ '@context': CONTEXT, ...ORGANIZATION });

export const webSite = () => ({
  '@context': CONTEXT,
  '@type': 'WebSite',
  name: 'SolLock',
  url: absolute('/'),
  description: SITE_DESCRIPTION,
  inLanguage: 'en',
  publisher: { '@id': ORGANIZATION['@id'] },
});

export interface Crumb {
  name: string;
  /** Left out on the last crumb, the page itself. */
  path?: string;
}

/** The trail from the home page to this one. The home page is added. */
export const breadcrumbs = (crumbs: readonly Crumb[]) => ({
  '@context': CONTEXT,
  '@type': 'BreadcrumbList',
  itemListElement: [{ name: 'SolLock', path: '/' }, ...crumbs].map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    ...(crumb.path === undefined ? {} : { item: absolute(crumb.path) }),
  })),
});

export interface FaqItem {
  question: string;
  /** Paragraphs of HTML; schema.org allows links and simple markup in an answer. */
  answer: readonly string[];
}

export const faqPage = (items: readonly FaqItem[]) => ({
  '@context': CONTEXT,
  '@type': 'FAQPage',
  mainEntity: items.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer.map((p) => `<p>${p}</p>`).join('') },
  })),
});
