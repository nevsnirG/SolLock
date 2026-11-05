import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** A device's screen, touch and user agent, without its browser choice: these tests run in the one configured browser. */
function phone(name: 'Pixel 7' | 'iPhone 14') {
  const { defaultBrowserType: _browser, ...device } = devices[name]!;
  return device;
}

async function openPicker(page: Page) {
  await page.goto('/lock');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  return page.getByRole('dialog', { name: 'Connect a wallet' });
}

/** The test browser has no wallet apps and may not know Chrome's permission; this script makes it answer as a phone would. */
function answerPermission(page: Page, state: PermissionState) {
  return page.addInitScript((initial: PermissionState) => {
    let current = initial;
    const status = {
      get state() {
        return current;
      },
    } as unknown as PermissionStatus;
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) => (String(descriptor.name) === 'loopback-network' ? Promise.resolve(status) : query(descriptor));
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input) === 'http://localhost/') {
        // The request that raises Chrome's question; here the visitor allows it.
        current = 'granted';
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return realFetch(input, init);
    };
  }, state);
}

test.describe('on an Android phone', () => {
  test.use(phone('Pixel 7'));

  test("offers the wallet app, and when none answers, the way in through the wallet's own browser", async ({ page, offSiteRequests }) => {
    await answerPermission(page, 'granted');
    const dialog = await openPicker(page);
    await expect(dialog.getByText('Opens a wallet app installed on this phone')).toBeVisible();

    await dialog.getByRole('button', { name: 'Wallet app on this phone' }).click();

    await expect(dialog.getByText('No wallet app on this phone answered')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('link', { name: 'Open in Phantom' })).toHaveAttribute('href', /^https:\/\/phantom\.app\/ul\/browse\/http/);
    expect(offSiteRequests).toEqual([]);
  });

  test("asks for Chrome's permission with a tap of its own, then opens the app on the next tap", async ({ page }) => {
    await answerPermission(page, 'prompt');
    const dialog = await openPicker(page);

    await dialog.getByRole('button', { name: 'Wallet app on this phone' }).click();
    await expect(dialog.getByText('Chrome will ask whether SolLock may connect')).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: 'Open wallet app' }).click();

    await expect(dialog.getByText('No wallet app on this phone answered')).toBeVisible({ timeout: 10_000 });
  });

  test('explains when Chrome has been told to block the connection', async ({ page }) => {
    await answerPermission(page, 'denied');
    const dialog = await openPicker(page);
    await dialog.getByRole('button', { name: 'Wallet app on this phone' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Allow "Local network access"');
  });
});

test.describe('on an iPhone', () => {
  test.use(phone('iPhone 14'));

  test("offers to open the page inside the wallet's own browser, the only way in on iOS", async ({ page }) => {
    const dialog = await openPicker(page);
    await expect(dialog.getByText('No wallet in this browser')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Open in Solflare' })).toHaveAttribute('href', /^https:\/\/solflare\.com\/ul\/v1\/browse\/http/);
  });
});
