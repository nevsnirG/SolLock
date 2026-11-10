import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_DESCRIPTION, SITE_TITLE } from '../src/config.ts';
import { DESCRIPTION_LIMIT, pageTitle, TITLE_LIMIT } from '../src/lib/pageTitle.ts';

describe('pageTitle', () => {
  it('adds the site name when both fit in a search result', () => {
    expect(pageTitle('Lock Solana')).toBe('Lock Solana · SolLock');
    expect(pageTitle('x'.repeat(50))).toBe(`${'x'.repeat(50)} · SolLock`);
  });

  it('leaves the site name off a title that would be cut short with it', () => {
    expect(pageTitle('x'.repeat(51))).toBe('x'.repeat(51));
  });

  it('keeps the site name on the home page', () => {
    expect(pageTitle(SITE_TITLE)).toBe(`${SITE_TITLE} · SolLock`);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
  });
});

/** Every title and description written into a page or a guide, read from the source. */
const written = (dir: URL, pattern: RegExp) =>
  readdirSync(dir)
    .filter((file) => /\.(astro|md)$/.test(file))
    .flatMap((file) => [...readFileSync(new URL(file, dir), 'utf8').matchAll(pattern)].map((match) => ({ file, text: match[1]! })));

const PAGES = new URL('../src/pages/', import.meta.url);
const GUIDES = new URL('../src/content/learn/', import.meta.url);

describe('what a search result shows', () => {
  const titles = [...written(PAGES, /<Base[^>]*?\stitle="([^"]+)"/g), ...written(GUIDES, /^searchTitle: "(.+)"$/gm)];
  const descriptions = [...written(PAGES, /<Base[^>]*?\sdescription="([^"]+)"/g), ...written(GUIDES, /^description: "(.+)"$/gm)];

  it('finds the titles and descriptions it checks', () => {
    expect(titles.length).toBeGreaterThanOrEqual(24);
    expect(descriptions.length).toBeGreaterThanOrEqual(24);
  });

  it.each(titles)('the title of $file fits', ({ text }) => {
    expect(text.length).toBeLessThanOrEqual(TITLE_LIMIT);
  });

  it.each(descriptions)('the description of $file fits', ({ text }) => {
    expect(text.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
  });
});
