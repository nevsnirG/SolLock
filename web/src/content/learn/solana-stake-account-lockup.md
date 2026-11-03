---
title: "How Solana stake account lockups work"
searchTitle: "How Solana stake account lockups work"
description: "The lockup inside a Solana stake account, field by field: the timestamp, the epoch and the custodian, what the network refuses while it is in force, and why the custodian decides everything."
published: 2026-11-03
order: 2
related: [solana-locking-vs-staking, can-you-unlock-solana-early]
---

Stake accounts usually come up when people talk about staking. They also carry a feature most people never touch: a lockup that stops withdrawals until a time you set. The rule is enforced by the Stake Program, a part of Solana itself, not by any website. SolLock builds on it, and this page explains what is actually in there.

## A stake account is not a wallet

A wallet address holds Solana its owner can spend at any time. A stake account is a separate account, owned by the Stake Program, with a small record of its own: the balance, two authorities, a possible delegation to a validator, and an optional lockup.

The two authorities:

- The **stake authority** may delegate the balance to a validator, or deactivate it.
- The **withdraw authority** may take the Solana out, and may also replace the stake authority.

They can be two different addresses. On a SolLock lock both are the same wallet: yours, or the wallet of the person you give the lock to.

## The three fields of a lockup

1. A **Unix timestamp**. The lock is in force until the network's clock passes it.
2. An **epoch** number. The lock is also in force until the network reaches that epoch. SolLock sets it to 0, so only the date counts.
3. The **custodian**. One address whose signature lets a withdrawal through anyway, and may change the lockup itself.

As long as the timestamp or the epoch lies in the future, the lockup is in force.

## What the network refuses while it is in force

- **Withdrawing**, unless the custodian signs.
- **Changing the withdraw authority**, unless the custodian signs. You cannot hand the lock to a fresh key and walk off with it.
- **Changing the lockup.** Only the custodian may move the date while the lock is in force. Once the date has passed, the withdraw authority may set a new one.

Some things stay allowed: delegating to a validator, deactivating, and splitting the account in two. None of them moves Solana out. A split account carries the same lockup, and two accounts can only be merged if their lockups match.

## Why the custodian decides everything

Every rule above has the same exception: the custodian. A lock whose custodian is a normal wallet is only as firm as whoever holds that wallet. If a service keeps the custodian key, the service can unlock early. If you keep it, you can.

An irreversible lock needs a custodian that cannot sign at all. SolLock uses one fixed address, made with SHA-256 from a public text and chosen because it is not a point on the Ed25519 curve, so no private key for it can exist. [The custodian page](/custodian) shows every step and lets you redo the calculation in your own browser.

## Staked or not

A lockup needs no staking. A SolLock lock is not delegated to any validator, so it earns nothing, and on the unlock date there is no cooldown: you withdraw, and it is done.

## Reading one on the blockchain

All of this is public. With the lock's address, a block explorer shows the owner program, the authorities, the lockup fields and the balance. [How to check a Solana lock on the blockchain](/learn/verify-solana-lock-on-chain) walks through it field by field. For the protocol's own wording, see Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
