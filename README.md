# SolLock

A non-custodial time lock for your own SOL, at [sollock.io](https://sollock.io).

You pick an amount and a date and sign one transaction in your own wallet. It creates a native Solana stake account with a lockup, so the Solana network itself refuses any withdrawal before the date: not you, not us, not anyone. SolLock never holds your SOL or your keys, keeps no accounts and stores nothing.

## How a lock works

One transaction, built in your browser, signed and sent by your wallet:

1. `SetComputeUnitLimit`, measured by a test run first.
2. `CreateAccountWithSeed`: the lock account, owned by the Stake program, at an address made from your wallet and the seed `sl1-<n>`.
3. Stake `Initialize`: you (or a gift's recipient) as staker and withdrawer, and a lockup with the unlock time, epoch 0 and the custodian below.
4. A transfer of the fee (0.25%, at least 0.01 SOL; free for a 0.01 SOL test lock).
5. A memo, `sollock v1`.

**The custodian** is the only key that could lift a lockup early. On every SolLock lock it is `EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav`: the first SHA-256 of `sollock:no-custodian:v1` plus a counter byte that is not a point on the Ed25519 curve, so no private key can exist for it. [sollock.io/custodian](https://sollock.io/custodian) works it out in your browser and shows a script to check it with code that is not ours.

**Finding locks needs no database**: the site reads your wallet's `sl1-` seed addresses, and finds gifts to you with one `getProgramAccounts` filtered on the withdrawer and the custodian.

**Unlocking**: after the date, a Withdraw of the whole balance (rent deposit included) to the withdrawer, from the site or any tool that supports stake accounts.

## Check it yourself

- Before your wallet opens, the page compiles the transaction, reads the bytes back and checks every field (`packages/core/src/verify.ts`), and shows them decoded in plain words.
- After it lands, the page reads the lock account back from the network and checks it again.
- `packages/core/test-svm` runs locks against the real mainnet Stake program in [LiteSVM](https://github.com/LiteSVM/litesvm) and tries to break them: early withdraw, authorize, set lockup, split, merge.

## Repository

| | |
|---|---|
| `packages/core` | The lock: custodian, seeds, transaction builder, verifier, decoder, fees, read-back. No network code beyond small RPC helpers. |
| `worker` | A Cloudflare Worker: serves the site, a read-only RPC proxy with an allow-list (it never sends transactions), and today's SOL price. Logs nothing. |
| `web` | The Astro site, with React islands for the lock builder and My locks. |

## Run it

Node 24 and pnpm (the version in `package.json`).

```bash
pnpm install
cp worker/.dev.vars.example worker/.dev.vars   # then add a Helius or Alchemy key
pnpm build
pnpm --filter @sollock/worker dev              # http://localhost:8791, on devnet
```

## Test

```bash
pnpm test        # core, site and Worker (in workerd)
pnpm typecheck
pnpm test:svm    # the real Stake program in LiteSVM, via Docker (Linux only)
```

## Security

See [SECURITY.md](SECURITY.md). SolLock never asks for a seed phrase, anywhere.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE). You may read, run, change and share this code for any non-commercial purpose: personal use, study, hobby projects, and use by charities, schools, public research bodies and governments. Running it as a paid service, or any other commercial use, needs a licence from us: write to hello@sollock.io.

The SolLock name, logo and domain are not licensed. The first two commits of this repository were published under MIT and remain available under it.

## Contributing

By opening a pull request you agree that SolLock may use your contribution under any terms, including commercially on sollock.io. Say so in the pull request if you do not agree, and it will not be merged.
