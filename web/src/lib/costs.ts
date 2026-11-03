/**
 * Rent for a 200-byte account, as the network charged on 1 Nov 2026. Shown only until the network
 * answers; the transaction itself always uses the value read from the network.
 */
export const KNOWN_LOCK_RENT = 1_666_240n;

/** Solana's base fee for one signature. Priority fees, if the wallet adds one, come on top. */
export const BASE_NETWORK_FEE = 5_000n;

/** Everything that leaves the wallet: the amount, the rent deposit, our fee and the network fee. */
export const walletOutflow = ({ amount, rent, fee }: { amount: bigint; rent: bigint; fee: bigint }) => amount + rent + fee + BASE_NETWORK_FEE;
