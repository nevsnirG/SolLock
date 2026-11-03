import {
  createSolanaRpc,
  type GetAccountInfoApi,
  type GetBalanceApi,
  type GetEpochInfoApi,
  type GetLatestBlockhashApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetMultipleAccountsApi,
  type GetProgramAccountsApi,
  type GetSignatureStatusesApi,
  type Rpc,
  type SimulateTransactionApi,
} from '@solana/kit';
import { CLUSTER } from '../config.ts';
import { FlowError } from './signing.ts';

/** Must stay within the methods the site's RPC proxy allows. */
export type SiteRpc = Rpc<
  GetAccountInfoApi &
    GetBalanceApi &
    GetEpochInfoApi &
    GetLatestBlockhashApi &
    GetMinimumBalanceForRentExemptionApi &
    GetMultipleAccountsApi &
    GetProgramAccountsApi &
    GetSignatureStatusesApi &
    SimulateTransactionApi
>;

export const siteRpcUrl = () => new URL('/api/rpc', window.location.origin).href;

export const siteRpc = (): SiteRpc => createSolanaRpc(siteRpcUrl());

let clusterCheck: Promise<void> | null = null;

export function assertServerCluster(): Promise<void> {
  clusterCheck ??= fetch('/api/health')
    .then((response) => response.json() as Promise<{ cluster?: string }>)
    .then(({ cluster }) => {
      if (cluster !== CLUSTER) {
        throw new FlowError(`This page is for Solana ${CLUSTER}, but SolLock's server is on ${cluster ?? 'another network'}. Nothing was sent. Reload the page.`);
      }
    })
    .catch((error: unknown) => {
      clusterCheck = null;
      throw error instanceof FlowError ? error : new FlowError("SolLock's server could not be reached, so nothing was sent. Try again.");
    });
  return clusterCheck;
}
