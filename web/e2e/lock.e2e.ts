import { readFile } from 'node:fs/promises';
import { type Address, generateKeyPairSigner } from '@solana/kit';
import type { Page } from '@playwright/test';
import { CUSTODIAN, LOCK_RENT } from './support/chain.ts';
import { readLock } from './support/decode.ts';
import { confirmEverything, connectWallet, expect, test } from './fixtures.ts';

const SOL = 1_000_000_000n;
const DEVNET_FEE_ADDRESS = 'DkHSfpQPDNcNkgP6f6eUfYL7JqzyJ84pb74tGEY1JyVv';
const FRIEND = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;
const unix = (iso: string) => BigInt(Date.parse(iso) / 1000);

const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { name });
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue' });
const amountField = (page: Page) => page.getByLabel('Amount in SOL');
const safeguards = (page: Page) => page.getByRole('group', { name: 'Before you lock' });
/** One row of the summary on the confirm screen, by its label. */
const summary = (page: Page, label: string) => page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
const changeButton = (page: Page, label: string) => page.locator('dt', { hasText: label }).locator('..').getByRole('button', { name: 'Change' });

async function signWithTestWallet(page: Page) {
  await connectWallet(page, 'Connect your wallet to sign');
  await page.getByRole('button', { name: 'Sign in Test Wallet' }).click();
}

async function lockTestSol(page: Page) {
  await page.goto('/lock?test');
  await continueButton(page).click();
  await confirmEverything(page);
  await signWithTestWallet(page);
  await expect(heading(page, /^Locked until/)).toBeVisible();
}

test.describe('locking SOL', () => {
  test("goes from the home page's start box to a signed lock that matches every choice", async ({ page, wallet, chain }) => {
    await page.goto('/');
    await page.getByLabel('How much Solana?').fill('2');
    await page.getByRole('radio', { name: '5 years' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(heading(page, 'Who can take it out on that date?')).toBeVisible();
    await continueButton(page).click();

    await expect(heading(page, 'Check and lock')).toBeVisible();
    await expect(summary(page, 'You lock')).toContainText('2 SOL');
    await expect(summary(page, 'Until')).toContainText('2 Nov 2031');
    await expect(summary(page, 'Our fee')).toContainText('0.01 SOL');
    await confirmEverything(page);
    await signWithTestWallet(page);

    await expect(heading(page, 'Locked until 2 Nov 2031')).toBeVisible();
    expect(wallet.sent).toHaveLength(1);
    const lock = readLock(wallet.sent[0]!);
    expect(lock).toMatchObject({
      feePayer: wallet.address,
      signers: [wallet.address],
      payer: wallet.address,
      seed: 'sl1-0',
      lamports: 2n * SOL + LOCK_RENT,
      staker: wallet.address,
      withdrawer: wallet.address,
      unlockAt: unix('2031-11-02T00:00:00Z'),
      epoch: 0n,
      custodian: CUSTODIAN,
      payments: [{ from: wallet.address, to: DEVNET_FEE_ADDRESS, lamports: SOL / 100n }],
      memo: 'sollock v1',
    });
    expect(chain.account(lock.lockAddress)?.lamports).toBe(2n * SOL + LOCK_RENT);
  });

  test('asks one question per screen, and Continue waits for a valid answer', async ({ page }) => {
    await page.goto('/lock');
    await expect(heading(page, 'How much Solana do you want to lock?')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Step 1 of 4' })).toBeVisible();

    await amountField(page).fill('');
    await expect(continueButton(page)).toBeDisabled();
    await amountField(page).fill('abc');
    await expect(page.getByText('Enter a number, like 2 or 0.5.')).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();

    await page.getByRole('button', { name: '5 SOL', exact: true }).click();
    await expect(amountField(page)).toHaveValue('5');
    await continueButton(page).click();
    await expect(heading(page, 'Until when?')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Step 2 of 4' })).toBeVisible();
  });

  test('goes back with the Back button, the progress bar and the browser, keeping every answer', async ({ page }) => {
    await page.goto('/lock');
    await amountField(page).fill('1.5');
    await continueButton(page).click();
    await page.getByRole('radio', { name: /New Year's Day/ }).check();
    await page.getByRole('radio', { name: '1 Jan 2032' }).click();
    await expect(page.getByText('It opens on 1 Jan 2032, 01:00 CET, your time.')).toBeVisible();
    await continueButton(page).click();
    await expect(heading(page, 'Who can take it out on that date?')).toBeVisible();

    await page.goBack();
    await expect(heading(page, 'Until when?')).toBeVisible();
    await expect(page.getByRole('radio', { name: '1 Jan 2032' })).toBeChecked();
    await page.goBack();
    await expect(amountField(page)).toHaveValue('1.5');
    await page.goForward();
    await expect(heading(page, 'Until when?')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(heading(page, 'How much Solana do you want to lock?')).toBeVisible();
    await continueButton(page).click();
    await continueButton(page).click();
    await page.getByRole('list', { name: 'Step 3 of 4' }).getByRole('button', { name: 'Amount' }).click();
    await expect(amountField(page)).toHaveValue('1.5');
  });

  test('a free test lock skips the date, pays no fee and opens a day later', async ({ page, wallet }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Try a free test lock' }).first().click();

    await expect(heading(page, 'Who can take it out on that date?')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Step 2 of 3' })).toBeVisible();
    await continueButton(page).click();
    await expect(summary(page, 'Free test lock')).toContainText('0.01 SOL');
    await expect(summary(page, 'Our fee')).toContainText('Free');
    await confirmEverything(page);
    await signWithTestWallet(page);

    await expect(heading(page, 'Locked until 2 Nov 2026, 15:00 UTC')).toBeVisible();
    await expect(page.getByText('Come back after 2 Nov 2026, 15:00 UTC and withdraw it on My locks')).toBeVisible();
    const lock = readLock(wallet.sent[0]!);
    expect(lock.lamports).toBe(SOL / 100n + LOCK_RENT);
    expect(lock.unlockAt).toBe(unix('2026-11-02T15:00:00Z'));
    expect(lock.payments).toEqual([]);
  });

  test('a gift checks the address, then belongs to the recipient alone', async ({ page, wallet, chain }) => {
    const tokenAccount = (await generateKeyPairSigner()).address;
    chain.ownedBy(tokenAccount, TOKEN_PROGRAM);
    await page.goto('/lock?amount=3&years=1');
    await page.getByRole('radio', { name: /^Someone else, as a gift/ }).check();
    const address = page.getByLabel('Their Solana wallet address');
    await expect(continueButton(page)).toBeDisabled();

    await address.fill('my friend');
    await expect(page.getByText('That is not a Solana address.', { exact: false })).toBeVisible();
    await address.fill(CUSTODIAN);
    await expect(page.getByText(/nobody has a key for/)).toBeVisible();
    await address.fill(tokenAccount);
    await expect(page.getByText(/token account/)).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();

    await address.fill(FRIEND);
    await expect(page.getByText('Read it back with them: starts 9WzD, ends AWWM.')).toBeVisible();
    await continueButton(page).click();
    await expect(summary(page, 'Then it goes to')).toContainText('as a gift');
    await expect(summary(page, 'Then it goes to')).toContainText('9WzD XwBb mkg8 ZTbN MqUx vQRA yrZz DsGY dLVL 9zYt AWWM');
    await expect(safeguards(page).getByRole('checkbox')).toHaveCount(4);
    await confirmEverything(page);
    await signWithTestWallet(page);

    await expect(page.getByText(/as a gift for 9WzD/)).toBeVisible();
    const lock = readLock(wallet.sent[0]!);
    expect(lock).toMatchObject({ staker: FRIEND, withdrawer: FRIEND, payer: wallet.address, signers: [wallet.address], lamports: 3n * SOL + LOCK_RENT });
  });

  test("refuses the user's own wallet as a gift recipient", async ({ page, wallet }) => {
    await page.goto('/lock?amount=3&years=1');
    await connectWallet(page, 'Connect wallet');
    await page.getByRole('radio', { name: /^Someone else, as a gift/ }).check();
    await page.getByLabel('Their Solana wallet address').fill(wallet.address);
    await expect(page.getByText('That is your own wallet. Choose Me instead.')).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();
  });

  test('keeps the sign button off until every box is ticked and LOCK is typed', async ({ page }) => {
    await page.goto('/lock?amount=2&years=1');
    await continueButton(page).click();
    const sign = page.getByRole('button', { name: 'Connect your wallet to sign' });
    await expect(sign).toBeDisabled();
    await expect(page.getByText('Still to do: Tick every box above. Type LOCK in the box.')).toBeVisible();

    const boxes = await safeguards(page).getByRole('checkbox').all();
    expect(boxes).toHaveLength(3);
    for (const box of boxes.slice(0, -1)) await box.check();
    await expect(sign).toBeDisabled();
    await boxes.at(-1)!.check();
    await page.getByLabel('Type LOCK to confirm').fill('LOK');
    await expect(sign).toBeDisabled();
    await expect(page.getByText('Still to do: Type LOCK in the box.')).toBeVisible();

    await page.getByLabel('Type LOCK to confirm').fill('lock');
    await expect(sign).toBeEnabled();
    await expect(page.getByText('Next: connect your wallet, then approve the lock in it.')).toBeVisible();
  });

  test('asks for the confirmations again after the lock changes', async ({ page }) => {
    await page.goto('/lock?amount=2&years=1');
    await continueButton(page).click();
    await confirmEverything(page);

    await changeButton(page, 'You lock').click();
    await amountField(page).fill('3');
    for (let step = 0; step < 3; step++) await continueButton(page).click();

    await expect(summary(page, 'You lock')).toContainText('3 SOL');
    for (const box of await safeguards(page).getByRole('checkbox').all()) await expect(box).not.toBeChecked();
    await expect(page.getByLabel('Type LOCK to confirm')).toHaveValue('');
  });

  test('sends nothing when the user says no in the wallet, and asks to confirm again', async ({ page, wallet, chain }) => {
    wallet.rejectNext = true;
    await page.goto('/lock?amount=2&years=1');
    await continueButton(page).click();
    await confirmEverything(page);
    await signWithTestWallet(page);

    await expect(page.getByText('Checking that nothing reached the network…')).toBeVisible();
    await expect(page.getByText('You said no in your wallet. Nothing was sent.')).toBeVisible({ timeout: 15_000 });
    expect(wallet.sent).toHaveLength(0);
    expect(chain.calls).not.toContain('getSignatureStatuses');
    for (const box of await safeguards(page).getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  });

  test('warns about locks of more than ten years, and refuses dates after 2076', async ({ page }) => {
    await page.goto('/lock');
    await continueButton(page).click();

    await page.getByRole('radio', { name: /New Year's Day/ }).check();
    await page.getByRole('radio', { name: '1 Jan 2052' }).click();
    await expect(page.getByText(/More than 10 years away/)).toBeVisible();

    await page.getByRole('radio', { name: 'A date you pick' }).check();
    await page.getByLabel('Unlock date').fill('2077-01-01');
    await expect(page.getByText('Pick a date on or before 31 December 2076.')).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();

    await page.getByLabel('Unlock date').fill('2030-06-30');
    await expect(page.getByText('It opens on 30 Jun 2030, 02:00 CEST, your time.')).toBeVisible();
    await expect(continueButton(page)).toBeEnabled();
  });

  test('ignores a crafted link instead of filling it in', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs++;
      void dialog.dismiss();
    });
    await page.goto('/lock?amount=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&years=5');
    await expect(heading(page, 'How much Solana do you want to lock?')).toBeVisible();
    await expect(amountField(page)).toHaveValue('1');
    expect(dialogs).toBe(0);
  });
});

test.describe('the fee', () => {
  for (const [amount, fee, rule] of [
    ['1', '0.01 SOL', 'The minimum fee, VAT included'],
    ['10', '0.025 SOL', '0.25% of the amount, VAT included'],
    ['500', '1.25 SOL', '0.25% of the amount, VAT included'],
  ] as const) {
    test(`for ${amount} SOL is ${fee}, and says which rule set it`, async ({ page }) => {
      await page.goto(`/lock?amount=${amount}&years=1`);
      await continueButton(page).click();
      await expect(summary(page, 'Our fee')).toContainText(fee);
      await page.getByText("What's in the total").click();
      await expect(page.getByRole('cell', { name: new RegExp(rule) })).toBeVisible();
    });
  }
});

test.describe('the network check', () => {
  test('refuses to sign when this page and the server are on different networks', async ({ page, wallet }) => {
    await page.route((url) => url.pathname === '/api/health', (route) => route.fulfill({ json: { ok: true, cluster: 'mainnet' } }));
    await page.goto('/lock?amount=2&years=1');
    await continueButton(page).click();
    await confirmEverything(page);
    await signWithTestWallet(page);

    await expect(page.getByText("This page is for Solana devnet, but SolLock's server is on mainnet. Nothing was sent.")).toBeVisible();
    expect(wallet.sent).toHaveLength(0);
  });
});

test.describe('after locking', () => {
  test('saves the recovery note as a file, and shows it on request', async ({ page, wallet }) => {
    await lockTestSol(page);
    const lock = readLock(wallet.sent[0]!);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save as a text file' }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`sollock-recovery-${lock.lockAddress.slice(0, 8)}.txt`);
    const note = await readFile((await file.path())!, 'utf8');
    expect(note).toContain(lock.lockAddress);
    expect(note).toContain(wallet.address);
    expect(note).toContain(CUSTODIAN);
    expect(note).toContain('Never write your seed phrase on this note.');

    await expect(page.getByText('SOLLOCK RECOVERY NOTE')).toBeHidden();
    await page.getByRole('button', { name: 'Show the text' }).click();
    await expect(page.getByText('SOLLOCK RECOVERY NOTE')).toBeVisible();

    await page.getByRole('button', { name: 'Make another lock' }).click();
    await expect(heading(page, 'How much Solana do you want to lock?')).toBeVisible();
  });

  test('leads on to My locks, where the new lock is listed', async ({ page, wallet }) => {
    await lockTestSol(page);
    await page.getByRole('link', { name: 'See it on My locks' }).click();
    await expect(page).toHaveURL(/\/my-locks$/);
    await expect(page.getByText('1 lock', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toContainText('0.01 SOL');
    expect(wallet.sent).toHaveLength(1);
  });
});
