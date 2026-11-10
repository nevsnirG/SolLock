---
title: "Is staked SOL locked? How long unstaking takes"
searchTitle: "Is staked SOL locked? How long unstaking Solana takes"
description: "Staked Solana is not locked for a term. You can unstake at any time, and it is free at the end of the epoch, about a day in November 2026. What can take longer."
published: 2026-11-10
order: 11
section: lock
related: [solana-locking-vs-staking, solana-stake-account-lockup, withdraw-solana-stake-account-after-lockup]
---

No. Staking Solana does not lock it for a term. You can start unstaking whenever you like, and the Solana is free again at the end of the current epoch, which in November 2026 is about a day away at most.

That short wait is what people call the lock-up of staking. A real lock, with a date nobody can move, is a separate feature of the same kind of account. This guide keeps the two apart and puts times on both.

## What happens when you unstake SOL

Staked Solana sits in a stake account that is delegated to a validator. Unstaking means deactivating that delegation, which any wallet with a staking screen does with one button.

Deactivation does not finish on the spot. It takes effect at the next epoch boundary, and the time until then is called the cooldown. During the cooldown the stake still counts for the validator and cannot be withdrawn yet. Once it is over, the account is inactive and you withdraw to your wallet in one transaction, for a network fee of a fraction of a cent.

## How long an epoch is

An epoch is the network's unit of time for staking: 432,000 slots, a slot being the turn in which one block can be made. In the first days of November 2026 the network took about 26 hours per epoch.

So unstaking takes between a few minutes and about a day, depending on where in the epoch you press the button. Solana Explorer shows how far the current epoch has come on its front page.

Older articles say two or three days. That was right when the network made its blocks more slowly, and it may change again, so look at the current epoch and not at a number in a guide, this one included.

## When unstaking takes longer

- **A rush for the exit.** The network limits how much stake may be deactivated in a single epoch, so that its security does not change too fast. If a very large share of all stake leaves at once, the cooldown spreads over more than one epoch. Solana's documentation calls the exact duration hard to predict for that reason.
- **Staking through an exchange.** An exchange that stakes for you sets its own terms, and some offer fixed periods of 30, 60 or 90 days with their own waiting time on top. Those are the company's rules, not the network's. Read them before you start.
- **Liquid staking tokens.** Tokens such as mSOL or jitoSOL stand in for staked Solana. You can sell one on a market at once, at the market's price, or hand it back to its protocol and wait for the epoch like everyone else.

Starting works the same way in reverse. A new delegation becomes active at an epoch boundary, and rewards, which vary and are not guaranteed, start after that.

## When staked SOL really is locked

Only when the stake account also has a lockup. A lockup is a separate field in the account: a date, and a custodian who could make an exception. A wallet's normal staking button does not set one.

Lockups are used for the allocations of investors and employees, and by tools made for it. An account with a lockup can still be staked and unstaked like any other. What the network refuses until the date is the withdrawal. [How Solana stake account lockups work](/learn/solana-stake-account-lockup) goes through the fields one by one.

## If you want your SOL locked

Then staking is the wrong tool, and a lockup is the right one. Staking leaves you free to sell the morning after a bad headline. A lockup does not, and when its custodian is [an address nobody has a key for](/custodian), nobody can make an exception, you included.

A SolLock lock is a lockup without staking: it earns nothing, it sits still until the date, and it comes out in one step on the day, with no cooldown. [Locking vs staking Solana](/learn/solana-locking-vs-staking) sets the two side by side.

A lock is final until its date and does nothing about the price, so lock only Solana you can leave alone for the whole time. A [free test lock](/lock?test) of 0.01 SOL for about a day shows the whole thing first.

Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts) describes the cooldown and the lockup in the protocol's own words.
