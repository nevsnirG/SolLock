---
title: "Locking vs staking Solana: what is the difference?"
searchTitle: "Locking vs staking Solana (SOL): what is the difference?"
description: "Locking and staking Solana are not the same. Staking delegates to a validator for rewards that vary; locking stops withdrawals until a date."
published: 2026-11-03
updated: 2026-11-10
order: 10
section: lock
related: [solana-unstaking-period, solana-stake-account-lockup, how-to-lock-solana]
---

People say "lock" and "stake" as if they were one thing. On Solana they are two separate properties of the same kind of account, and you can have either one without the other.

**Staking** means delegating Solana to a validator, which helps run the network and can earn rewards.

**Locking** means a date before which the Solana cannot be withdrawn.

What validators and wallets are is in [What is Solana, in plain words](/learn/what-is-solana).

## Staking SOL is not a commitment

When you stake, your Solana is delegated to a validator you choose. After an activation period it starts earning rewards, which vary with the validator's performance and the state of the network, minus the validator's commission. Rewards are paid in Solana, so their value moves with the price, and none of it is guaranteed.

You can stop whenever you like. Deactivating takes effect at the end of the current epoch, about a day away at most in November 2026, and then you withdraw. [Is staked SOL locked? How long unstaking takes](/learn/solana-unstaking-period) has the details. That is a short queue, not a lock. Nothing stops you from unstaking the morning after a bad headline.

## Locking SOL is a commitment

A lockup is a field in the account that the Stake Program checks on every withdrawal. Until the date, the network refuses, and if the lock's custodian is [an address without a key](/custodian), nobody can make an exception. [Can you unlock Solana early?](/learn/can-you-unlock-solana-early) covers that part.

A locked account need not be delegated to anyone. A SolLock lock is not: it sits still until the date, earns nothing, and comes out in one step when the date arrives, with no cooldown. The Solana is still Solana, not a token standing in for it, and it keeps following the price.

## Can you do both?

At the protocol level, yes. A locked account can also be delegated, and it stays locked either way. SolLock does not stake locks and shows no rewards. If you ever delegate a lock through another tool, withdrawing on the unlock date needs the deactivation step first.

## Which one do you want?

- You want to take part in running the network and keep your options open: stake, through your wallet.
- You want a part of your Solana to stay put until a date, whatever the market does: lock it.
- Neither changes the price risk, and neither suits money you may need soon.

Solana's [staking overview](https://solana.com/docs/references/staking) covers delegation, activation and rewards in detail.
