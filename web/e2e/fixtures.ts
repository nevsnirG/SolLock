import { test as base, expect, type Page } from '@playwright/test';
import { FakeChain } from './support/chain.ts';
import { TestWallet, WALLET_NAME } from './support/wallet.ts';

export const NOW = new Date('2026-11-01T14:30:00Z');
export const SOL_PRICE_USD = 150;

interface Fixtures {
  chain: FakeChain;
  wallet: TestWallet;
  offSiteRequests: string[];
}

export const test = base.extend<Fixtures>({
  chain: async ({}, use) => {
    await use(new FakeChain());
  },

  offSiteRequests: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const offSite: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') offSite.push(request.url());
    });
    await use(offSite);
  },

  page: async ({ page, chain }, use) => {
    await page.clock.setFixedTime(NOW);
    await page.route((url) => url.pathname === '/api/rpc', async (route) => {
      await route.fulfill({ json: chain.answer(route.request().postData() ?? '') });
    });
    await page.route((url) => url.pathname === '/api/price', async (route) => {
      const currency = new URL(route.request().url()).searchParams.get('currency') ?? 'USD';
      await route.fulfill({ json: { currency, perSol: SOL_PRICE_USD, source: 'CoinGecko', asOf: NOW.getTime() / 1000 - 300 } });
    });
    await use(page);
  },

  wallet: async ({ page, chain }, use) => {
    const wallet = await TestWallet.install(page, chain);
    chain.fund(wallet.address, 50_000_000_000n);
    await use(wallet);
  },
});

export { expect };

export async function connectWallet(page: Page, button: string) {
  await page.getByRole('button', { name: button }).first().click();
  await page.getByRole('dialog', { name: 'Connect a wallet' }).getByRole('button', { name: WALLET_NAME }).click();
}

export async function confirmEverything(page: Page) {
  const boxes = page.getByRole('group', { name: 'Before you lock' }).getByRole('checkbox');
  for (const box of await boxes.all()) await box.check();
  await page.getByLabel('Type LOCK to confirm').fill('LOCK');
}
