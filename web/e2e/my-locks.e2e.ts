import { type Address, createAddressWithSeed, generateKeyPairSigner } from '@solana/kit';
import type { Page } from '@playwright/test';
import { type FakeChain, LOCK_RENT } from './support/chain.ts';
import { readWithdrawal } from './support/decode.ts';
import { connectWallet, expect, test } from './fixtures.ts';

const SOL = 1_000_000_000n;
const STAKE_PROGRAM = 'Stake11111111111111111111111111111111111111' as Address;
const FRIEND = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' as Address;
const unix = (iso: string) => BigInt(Date.parse(iso) / 1000);

const seeded = (wallet: Address, index: number) => createAddressWithSeed({ baseAddress: wallet, programAddress: STAKE_PROGRAM, seed: `sl1-${index}` });
const card = (page: Page, text: string) => page.getByRole('article').filter({ hasText: text });

/** Three locks this wallet made (one open, one locked, one a gift) and one gift it received. */
async function walletWithLocks(chain: FakeChain, wallet: Address) {
  const open = await seeded(wallet, 0);
  chain.addLock({ address: open, withdrawer: wallet, unlockAt: unix('2026-11-01T12:00:00Z'), locked: SOL / 100n });
  chain.addLock({ address: await seeded(wallet, 1), withdrawer: wallet, unlockAt: unix('2031-01-01T00:00:00Z'), locked: (3n * SOL) / 2n });
  chain.addLock({ address: await seeded(wallet, 2), withdrawer: FRIEND, unlockAt: unix('2036-01-01T00:00:00Z'), locked: SOL / 4n });
  const received = (await generateKeyPairSigner()).address;
  chain.addLock({ address: received, withdrawer: wallet, staker: FRIEND, unlockAt: unix('2030-01-01T00:00:00Z'), locked: 2n * SOL });
  return { open, received };
}

test.describe('My locks', () => {
  test('asks for a wallet first', async ({ page }) => {
    await page.goto('/my-locks');
    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('lists the locks a wallet made and the gifts it received, read from the chain', async ({ page, wallet, chain }) => {
    await walletWithLocks(chain, wallet.address);
    await page.goto('/my-locks');
    await connectWallet(page, 'Connect wallet');

    await expect(page.getByText('4 locks', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(4);
    await expect(card(page, '1.5 SOL')).toContainText('Opens on 1 Jan 2031, in 4 years, 60 days');
    await expect(card(page, 'A gift to you')).toContainText('2 SOL');
    await expect(card(page, 'A gift to 9WzD')).toContainText('0.25 SOL');
    await expect(page.getByRole('heading', { name: 'Gifts you gave' })).toBeVisible();
    await expect(card(page, '0.01 SOL')).toContainText('Open');
  });

  test('offers Withdraw only on an open lock of this wallet, and takes everything out', async ({ page, wallet, chain }) => {
    const { open } = await walletWithLocks(chain, wallet.address);
    await page.goto('/my-locks');
    await connectWallet(page, 'Connect wallet');

    await expect(page.getByRole('button', { name: 'Withdraw' })).toHaveCount(1);
    await card(page, '0.01 SOL').getByRole('button', { name: 'Withdraw' }).click();

    await expect(page.getByRole('status')).toContainText('Withdrawn: 0.01166624 SOL is back in your wallet');
    expect(readWithdrawal(wallet.sent[0]!)).toEqual({ from: open, to: wallet.address, lamports: SOL / 100n + LOCK_RENT, signers: [wallet.address] });
    expect(chain.account(open)).toBeUndefined();
    await expect(page.getByRole('article')).toHaveCount(3);
  });

  test('shows the recovery note of a lock on request', async ({ page, wallet, chain }) => {
    await walletWithLocks(chain, wallet.address);
    await page.goto('/my-locks');
    await connectWallet(page, 'Connect wallet');

    const lock = card(page, '1.5 SOL');
    await lock.getByRole('button', { name: 'Recovery note' }).click();
    await expect(lock.getByText('SOLLOCK RECOVERY NOTE')).toBeVisible();
    await expect(lock).toContainText(await seeded(wallet.address, 1));
    await expect(lock).toContainText('seed "sl1-1"');
  });

  test('looks up any lock by its address, without a wallet', async ({ page, chain }) => {
    const lock = (await generateKeyPairSigner()).address;
    chain.addLock({ address: lock, withdrawer: FRIEND, unlockAt: unix('2031-01-01T00:00:00Z'), locked: (3n * SOL) / 2n });
    await page.goto('/my-locks');
    await page.getByText('Look up a lock by its address').click();

    const field = page.getByLabel('Lock address');
    await field.fill('not an address');
    await page.getByRole('button', { name: 'Look up' }).click();
    await expect(page.getByText('That is not a Solana address. Copy the lock address from the recovery note.')).toBeVisible();

    await field.fill(lock);
    await page.getByRole('button', { name: 'Look up' }).click();
    await expect(card(page, '1.5 SOL')).toContainText('Opens on 1 Jan 2031');
    await expect(page.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  });
});
