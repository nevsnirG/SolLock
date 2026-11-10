---
title: "Can you unlock Solana early?"
searchTitle: "Can you unlock Solana (SOL) early?"
description: "Whether locked Solana can be withdrawn before the date. What the custodian is, when a lockup can be overridden, and why a SolLock lock cannot be, by anyone."
published: 2026-11-03
updated: 2026-11-10
order: 9
section: lock
related: [how-to-lock-solana, solana-stake-account-lockup, solana-time-lock-risks]
---

For a SolLock lock, no. Nobody can, you and SolLock included, and an emergency makes no difference. The Solana network checks the date on every withdrawal, and the one key that could make an exception does not exist.

For a lock made elsewhere, the answer depends on a single field. Here is how to tell.

## The custodian decides

Every Solana lockup records a custodian address. While the lock is in force, the network lets a withdrawal through only if the custodian signs, and the same key may change the unlock date.

If that custodian is a wallet somebody holds, the lock has a back door, by design. That can be right for a company treasury, where a board wants an emergency brake. For a lock meant to protect you from yourself, it defeats the purpose.

A SolLock lock names a custodian that is [an address with no key](/custodian): not a wallet, not a program, but a string of bytes that is not a point on the curve wallets use, so no private key can exist for it. No key, no signature. No signature, no exception. The date is fixed the moment the lock exists.

## The ways around that do not work

- **Changing who may withdraw.** While the lock is in force, replacing the withdraw authority needs the custodian's signature too.
- **Moving the date.** Only the custodian may change a lockup that is in force.
- **Splitting the account.** Each part keeps the same lockup.
- **Delegating or unstaking.** Allowed, but neither takes Solana out of the account.
- **Asking SolLock.** There is no key to any lock on our side, and no server that could sign. There is nothing to ask for.

## What if you need the money?

Then the lock does what you asked of it, at the worst possible moment. A market crash, a stolen phone, a lost job: none of them opens it. That is the whole point, and it is why the lock page makes you tick two boxes and type LOCK before your wallet opens.

So lock only Solana you can leave alone until the date. Keep an accessible balance for daily life, and when in doubt, lock less or pick a nearer date. A [free test lock](/lock?test) of about a day lets you try the whole thing, including the withdrawal, before you commit anything that matters.

## Checking a lock made elsewhere

If a service promises an "irreversible" lock, look up the lock's custodian on a block explorer and ask who can sign for it. A published address alone proves nothing. What matters is whether a key for it can exist. [How to check a Solana lock on the blockchain](/learn/verify-solana-lock-on-chain) shows where the field is, and Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts) has the protocol rules. The same question, who can break it, decides how firm a time lock is on Bitcoin and Ethereum too: [Time lock wallets: Bitcoin, Ethereum and Solana compared](/learn/time-lock-crypto-wallet).
