# @sollock/core

The lock core of SolLock: the custodian derivation, the `sl1-<n>` seed scheme, the lock transaction builder, a verifier and decoder that turn a transaction and a stake account back into plain words, and the fee and money maths. Pure TypeScript, no DOM. The site and the scripts use it.

## The custodian

Every lock's custodian is `EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav`: SHA-256 of `sollock:no-custodian:v1` plus the counter byte `0x00`, which is off the Ed25519 curve, so no private key exists for it. `src/custodian.ts` derives it and the tests check the result with two libraries.

## Tests

```bash
pnpm --filter @sollock/core test       # unit tests, any OS
pnpm --filter @sollock/core typecheck
pnpm test:svm                               # from the repo root: runs locks on the mainnet Stake program in LiteSVM, needs Docker
```

`test-svm/programs/` holds the Stake and Memo binaries as deployed on mainnet (`manifest.json` has the slot and hash). Refresh them with `pnpm --filter @sollock/core fetch-programs` when the Stake program is upgraded.

## Devnet

```bash
pnpm --filter @sollock/core devnet:lock                                         # free test lock: 0.01 SOL, 24 hours
pnpm --filter @sollock/core devnet:lock -- --amount 0.5 --until 2026-11-02T12:00:00Z
pnpm --filter @sollock/core devnet:lock -- --gift <address> --amount 0.05 --until 2028-01-01
pnpm --filter @sollock/core devnet:lock -- read <lock address>
pnpm --filter @sollock/core devnet:lock -- withdraw <lock address>
```

The script keeps a throwaway devnet wallet in `.devnet/` (never committed) and prints its address the first time. Fund it from https://faucet.solana.com (devnet) or your own devnet wallet.
