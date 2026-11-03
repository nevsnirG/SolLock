/** Lamports of rent for a 200-byte stake account; display only, the transaction uses the network's value. */
export const KNOWN_LOCK_RENT = 1_666_240n;

/** Lamports: Solana's base fee per signature; a wallet may add a priority fee on top. */
export const BASE_NETWORK_FEE = 5_000n;

export const walletOutflow = ({ amount, rent, fee }: { amount: bigint; rent: bigint; fee: bigint }) => amount + rent + fee + BASE_NETWORK_FEE;
