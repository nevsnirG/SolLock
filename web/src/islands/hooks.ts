import type { Address } from '@solana/kit';
import { type Currency, fetchGiftAccount, fetchLockRent, findFreeSeed, giftAccountProblem, giftAccountWarnings, nowSeconds, type UnixSeconds } from '@sollock/core';
import { type DependencyList, useCallback, useEffect, useState } from 'react';
import { KNOWN_LOCK_RENT } from '../lib/costs.ts';
import type { Draft } from '../lib/draft.ts';
import { browserStorage, initialCurrency, isPrice, type Price, saveCurrency } from '../lib/money.ts';
import { type LockPreview, type PreviewContext, previewLock } from '../lib/preview.ts';
import { sleep } from '../lib/signing.ts';
import { siteRpc } from '../lib/siteRpc.ts';

export function useAsync<T>(load: (() => Promise<T>) | null, deps: DependencyList, fallback: T, { keepWhileLoading = false } = {}): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    if (!keepWhileLoading) setValue(fallback);
    if (!load) return;
    let live = true;
    load().then(
      (result) => live && setValue(result),
      () => live && setValue(fallback),
    );
    return () => {
      live = false;
    };
  }, deps);
  return value;
}

export function useNow(everyMs = 30_000): { now: UnixSeconds; refresh: () => void } {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return { now, refresh: useCallback(() => setNow(nowSeconds()), []) };
}

const PRICE_REFRESH_MS = 60_000;

async function fetchPrice(currency: Currency): Promise<Price | null> {
  const response = await fetch(`/api/price?currency=${encodeURIComponent(currency)}`);
  const body: unknown = response.ok ? await response.json() : null;
  return isPrice(body) && body.currency === currency ? body : null;
}

export function usePrice(currency: Currency): Price | null {
  const [price, setPrice] = useState<Price | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetchPrice(currency).then((next) => live && setPrice(next), () => live && setPrice(null));
    setPrice(null);
    void load();
    const id = setInterval(load, PRICE_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [currency]);
  return price;
}

export function useCurrency(): [Currency, (currency: Currency) => void] {
  const [currency, setCurrency] = useState<Currency>(() => initialCurrency(navigator.language, browserStorage()));
  const choose = useCallback((next: Currency) => {
    setCurrency(next);
    saveCurrency(next, browserStorage());
  }, []);
  return [currency, choose];
}

export interface Rent {
  lamports: bigint;
  fromNetwork: boolean;
}

const KNOWN_RENT: Rent = { lamports: KNOWN_LOCK_RENT, fromNetwork: false };
const RENT_TRIES = 3;
const RENT_RETRY_MS = 5_000;

async function fetchRent(): Promise<Rent> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { lamports: await fetchLockRent(siteRpc()), fromNetwork: true };
    } catch (error) {
      if (attempt >= RENT_TRIES) throw error;
      await sleep(RENT_RETRY_MS);
    }
  }
}

export const useRent = () => useAsync(fetchRent, [], KNOWN_RENT);

export function useFreeSeed(wallet: Address | null, refreshKey: unknown): number | undefined {
  return useAsync(wallet ? () => findFreeSeed(siteRpc(), wallet).then((seed) => seed.index) : null, [wallet, refreshKey], undefined);
}

export interface GiftCheck {
  problem: string | null;
  warnings: string[];
}

const NO_GIFT_CHECK: GiftCheck = { problem: null, warnings: [] };

export function useGiftCheck(recipient: Address | null): GiftCheck {
  const check = async (address: Address) => {
    const account = await fetchGiftAccount(siteRpc(), address);
    return { problem: giftAccountProblem(account), warnings: giftAccountWarnings(account) };
  };
  return useAsync(recipient ? () => check(recipient) : null, [recipient], NO_GIFT_CHECK);
}

export function useBalance(address: Address | null): { balance: bigint | null; refresh: () => void } {
  const [refreshCount, setRefreshCount] = useState(0);
  const load = address ? () => siteRpc().getBalance(address, { commitment: 'confirmed' }).send().then(({ value }) => value) : null;
  const balance = useAsync(load, [address, refreshCount], null);
  return { balance, refresh: useCallback(() => setRefreshCount((count) => count + 1), []) };
}

export function useLockPreview(draft: Draft, ctx: PreviewContext): LockPreview | null {
  const load = () =>
    previewLock(draft, ctx).catch((error: unknown) => {
      console.error('The lock preview could not be built.', error);
      return null;
    });
  return useAsync(load, [draft, ctx.now, ctx.rent, ctx.wallet, ctx.seedIndex], null, { keepWhileLoading: true });
}
