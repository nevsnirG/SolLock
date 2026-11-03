import { type Address, isAddress, isOffCurveAddress } from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from './constants.ts';
import { CUSTODIAN_ADDRESS } from './custodian.ts';

const NOT_WALLETS = new Set<string>([
  '11111111111111111111111111111111',
  'Stake11111111111111111111111111111111111111',
  'StakeConfig11111111111111111111111111111111',
  'Vote111111111111111111111111111111111111111',
  'Config1111111111111111111111111111111111111',
  'ComputeBudget111111111111111111111111111111',
  'AddressLookupTab1e1111111111111111111111111',
  'BPFLoader1111111111111111111111111111111111',
  'BPFLoader2111111111111111111111111111111111',
  'BPFLoaderUpgradeab1e11111111111111111111111',
  'LoaderV411111111111111111111111111111111111',
  'Ed25519SigVerify111111111111111111111111111',
  'KeccakSecp256k11111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH',
  'SysvarC1ock11111111111111111111111111111111',
  'SysvarRent111111111111111111111111111111111',
  'SysvarStakeHistory1111111111111111111111111',
  'SysvarRecentB1ockHashes11111111111111111111',
  'SysvarEpochSchedu1e111111111111111111111111',
  'SysvarFees111111111111111111111111111111111',
  'SysvarS1otHashes111111111111111111111111111',
  'SysvarS1otHistory11111111111111111111111111',
  'Sysvar1nstructions1111111111111111111111111',
  'SysvarEpochRewards1111111111111111111111111',
  'SysvarLastRestartS1ot1111111111111111111111',
]);

export interface GiftContext {
  funder: Address;
  feeAddress: Address;
}

export function giftAddressProblem(input: string, ctx: GiftContext): string | null {
  const text = input.trim();
  if (!isAddress(text)) return 'That is not a Solana address. It should be 32 to 44 letters and numbers.';
  if (text === ctx.funder) return 'That is your own wallet. Choose Me instead.';
  if (text === CUSTODIAN_ADDRESS) return 'That is the address nobody has a key for. The Solana could never be withdrawn.';
  if (text === ctx.feeAddress) return "That is SolLock's fee address, not the recipient's wallet.";
  if (NOT_WALLETS.has(text)) return 'That is a Solana program, not a wallet.';
  if (isOffCurveAddress(text)) {
    return 'No private key exists for this address, so no ordinary wallet could withdraw. Use the address of their own wallet.';
  }
  return null;
}

export interface GiftAccountInfo {
  exists: boolean;
  programAddress?: Address;
  executable?: boolean;
}

export function giftAccountProblem(account: GiftAccountInfo): string | null {
  if (!account.exists) return null;
  if (account.executable) return 'That address is a program, so no wallet could withdraw the gift.';
  if (account.programAddress && account.programAddress !== SYSTEM_PROGRAM_ADDRESS) {
    return 'That address belongs to a program (a token account, for example), so no wallet could withdraw the gift.';
  }
  return null;
}

export function giftAccountWarnings(account: GiftAccountInfo): string[] {
  return account.exists ? [] : ['This address has never been used. Check it with the recipient before you lock.'];
}
