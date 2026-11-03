import { existsSync, readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, SOL_PRICE_USD, test } from './fixtures.ts';

const GUIDES = ['how-to-lock-solana', 'solana-stake-account-lockup', 'can-you-unlock-solana-early', 'solana-locking-vs-staking', 'verify-solana-lock-on-chain'];
const PAGES = ['/', '/lock', '/my-locks', '/faq', '/custodian', '/terms', '/privacy', '/affiliates', '/learn', ...GUIDES.map((slug) => `/learn/${slug}`)];
/** Legal texts need their own wording, so the house style rules skip them. */
const LEGAL_PAGES = new Set(['/terms', '/privacy']);

const visibleText = (page: Page) => page.locator('body').innerText();

const NEVER_NAMED_FILE = new URL('../../notes/never-named.json', import.meta.url);
const NEVER_NAMED: string[] = existsSync(NEVER_NAMED_FILE) ? JSON.parse(readFileSync(NEVER_NAMED_FILE, 'utf8')) : [];

test.describe('every page', () => {
  for (const path of PAGES) {
    test(`${path} loads from this site alone, without errors`, async ({ page, offSiteRequests }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

      const response = await page.goto(path);
      await page.waitForLoadState('networkidle');

      expect(response?.status()).toBe(200);
      expect(offSiteRequests).toEqual([]);
      expect(errors).toEqual([]);
    });

    test(`${path} cannot be framed or sniffed, and leaks no referrer`, async ({ page }) => {
      const headers = (await page.goto(path))!.headers();
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['permissions-policy']).toContain('camera=()');
    });
  }

  test('fit a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('a missing page answers 404 with a helpful page', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
  });

  test('offer icons that load, including the /favicon.ico that mobile wallets ask for', async ({ page, request }) => {
    await page.goto('/');
    const linked = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')!));
    expect(linked).toContain('/favicon.ico');

    for (const href of linked) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      expect(response.headers()['content-type'], href).toMatch(/^image\//);
    }
  });
});

test.describe('the content security policy', () => {
  test('stops scripts injected into a page, and requests to other sites', async ({ page }) => {
    await page.goto('/lock');
    const outcome = await page.evaluate(async () => {
      const flags = window as unknown as Record<string, boolean>;
      const script = document.createElement('script');
      script.textContent = 'window.inlineRan = true';
      document.head.append(script);
      const image = document.createElement('img');
      image.setAttribute('onerror', 'window.handlerRan = true');
      image.src = '/no-such-image.png';
      document.body.append(image);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const fetched = await fetch('https://example.com/').then(
        () => 'sent',
        () => 'blocked',
      );
      return { inline: flags.inlineRan === true, handler: flags.handlerRan === true, fetched };
    });
    expect(outcome).toEqual({ inline: false, handler: false, fetched: 'blocked' });
  });

  test("keeps the site out of other sites' frames", async ({ page, baseURL }) => {
    await page.goto('about:blank');
    await page.setContent(`<iframe src="${baseURL}/lock" title="framed"></iframe>`);
    const frame = page.frameLocator('iframe[title="framed"]');
    await page.waitForTimeout(1_000);
    await expect(frame.getByRole('heading', { name: 'Lock your Solana' })).toHaveCount(0);
  });
});

test.describe('the words on the site', () => {
  async function pagesText(page: Page, paths: string[]) {
    const texts: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      texts.push(await visibleText(page));
    }
    return texts.join('\n');
  }

  test('never call a lock savings or a vault, ask for a seed phrase, or predict prices', async ({ page }) => {
    const text = await pagesText(page, PAGES);
    expect(text).not.toMatch(/\bsavings?\b|\bsparen\b|\bvault\b/i);
    expect(text).not.toMatch(/(enter|paste|type) (your )?(seed|recovery) phrase/i);
    expect(text).not.toMatch(/\bwill be worth\b|\b(price target|projected|expected return|apy|apr)\b/i);
  });

  test('say what SolLock is, without AI phrasing or lists of what it is not', async ({ page }) => {
    const text = await pagesText(page, PAGES.filter((p) => !LEGAL_PAGES.has(p)));
    expect(text).not.toMatch(/\bhonest\b|small print|\bwe never\b|\bwe don't\b|\bwe do not\b|\bwe keep no\b|not you, not us/i);
  });

  test('call the coin Solana, keeping SOL for amounts and units', async ({ page }) => {
    const pages = await pagesText(page, PAGES);
    await page.goto('/lock?amount=2&years=1');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText("What's in the total").click();
    await page.getByText('The full transaction').click();
    const text = `${pages}\n${await visibleText(page)}`;

    const unitless = text
      .replace(/\d\s?SOL\b/g, '')
      .replace(/\bin SOL\b/g, '')
      .split('\n')
      .filter((line) => line.trim() !== 'SOL');
    expect(unitless.filter((line) => /\bSOL\b/.test(line))).toEqual([]);
  });

  test('never name or link to the sites on the private list', async ({ page }) => {
    test.skip(NEVER_NAMED.length === 0, 'The list is in notes/, which is not published.');
    const forms = NEVER_NAMED.flatMap((name) => [name.toLowerCase(), name.toLowerCase().replaceAll(' ', '')]);
    const text = (await pagesText(page, PAGES)).toLowerCase();
    expect(forms.filter((form) => text.includes(form))).toEqual([]);
    for (const path of PAGES) {
      await page.goto(path);
      const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((a) => (a.getAttribute('href') ?? '').toLowerCase()));
      expect(links.filter((href) => forms.some((form) => href.includes(form))), path).toEqual([]);
    }
  });

  test('say plainly that the FAQ is not tax advice, and that Box 3 still applies', async ({ page }) => {
    await page.goto('/faq');
    await page.getByText(/tax/i).first().click();
    const text = await visibleText(page);
    expect(text).toContain('This is not tax advice.');
    expect(text).toContain('Box 3');
  });

});

test.describe('buying Solana first', () => {
  test('opens the exchanges on the lock page, marked as sponsored, with a note under them that they are affiliate links', async ({ page }) => {
    await page.goto('/lock');
    const links = page.locator('.buy-links a');
    await expect(links.first()).toBeHidden();

    await page.getByText('Need Solana first?').click();
    await expect(links).toContainText(['Bitvavo', 'Kraken']);
    for (const link of await links.all()) expect(await link.getAttribute('rel')).toContain('sponsored');
    await expect(page.getByText(/These are affiliate links: we may earn a commission if you sign up through one./)).toBeVisible();
    await expect(page.getByText('Crypto prices can fall, and you can lose money.')).toBeVisible();
  });

  test("shows each exchange's sign-up offer, with a note that the conditions are theirs, until the offer ends", async ({ page }) => {
    await page.goto('/lock?buy');
    await expect(page.getByRole('link', { name: /Bitvavo/ })).toContainText('No fees on your first €10,000 of trades');
    await expect(page.getByRole('link', { name: /Kraken/ })).toContainText('€30 when you deposit €200 and trade €200');
    await expect(page.getByText(/The offers are the exchanges' own, with their conditions, and can differ by country./)).toBeVisible();

    await page.clock.setFixedTime(new Date('2027-01-02T12:00:00Z'));
    await page.reload();
    await expect(page.getByRole('link', { name: /Bitvavo/ })).not.toContainText('€10,000');
  });

  test("starts from the home page's buy button, with the exchanges already open", async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Buy Solana' }).click();

    await expect(page).toHaveURL(/\/lock\?buy$/);
    await expect(page.getByRole('link', { name: 'Bitvavo' })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Kraken' })).toBeInViewport();
  });
});

test.describe('the home page example', () => {
  test("shows what $1,000 of SOL from 2020 is worth at today's price, with its source and a caution", async ({ page }) => {
    await page.goto('/');
    const worth = Math.round((1_000 / 0.22) * SOL_PRICE_USD).toLocaleString('en-US');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`$1,000 in Solana in 2020 is $${worth} today.`);
    await expect(page.getByText("That's 682× your money, for anyone who held on.")).toBeVisible();
    await expect(page.getByText('Holding is the hard part.', { exact: false })).toContainText('held on. Holding is the hard part.');
    await expect(page.getByText(/today's price is from CoinGecko at \d\d:\d\d\. Past results are no guarantee of future results: crypto prices move both ways\./)).toBeVisible();
  });

  test('falls back to the number of SOL when there is no price', async ({ page }) => {
    await page.route((url) => url.pathname === '/api/price', (route) => route.fulfill({ status: 503, json: { error: 'No price available right now.' } }));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('$1,000 in Solana in 2020 bought 4,545 SOL.');
  });
});

test.describe('the guides', () => {
  test('are listed on the learn page, in order', async ({ page }) => {
    await page.goto('/learn');
    const hrefs = await page.locator('.guides a').evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(GUIDES.map((slug) => `/learn/${slug}`));
  });

  for (const slug of GUIDES) {
    test(`/learn/${slug} is a complete article that links to the product and to Solana's own docs`, async ({ page }) => {
      await page.goto(`/learn/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(new URL(canonical!).pathname).toBe(`/learn/${slug}`);
      expect((await page.locator('meta[name="description"]').getAttribute('content'))?.length).toBeGreaterThan(60);
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
      await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute('content', /^2026-/);

      const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '[]') as { '@type': string }[];
      expect(structured.map((item) => item['@type'])).toEqual(['Article', 'BreadcrumbList']);

      const links = await page.locator('article a[href]').evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''));
      expect(links).toContain('/lock');
      expect(links).toContain('/lock?test');
      expect(links.some((href) => href === '/custodian' || href.startsWith('/learn/'))).toBe(true);
      expect(links.some((href) => href.startsWith('https://solana.com/docs/'))).toBe(true);
    });
  }

  test('are linked from the FAQ', async ({ page }) => {
    await page.goto('/faq');
    const hrefs = await page.locator('.faq a[href^="/learn/"]').evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href')));
    expect(new Set(hrefs).size).toBeGreaterThanOrEqual(3);
  });

  test('are in the sitemap that robots.txt points to, with every other page and nothing else', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    const sitemapUrl = robots.match(/^Sitemap: (\S+)$/m)?.[1];
    expect(sitemapUrl).toBeDefined();

    const locs = async (path: string) =>
      [...(await (await request.get(path)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    const listed: string[] = [];
    for (const part of await locs(new URL(sitemapUrl!).pathname)) listed.push(...(await locs(part)));
    expect(listed.map((path) => path.replace(/\/$/, '') || '/').sort()).toEqual([...PAGES].sort());
  });
});
