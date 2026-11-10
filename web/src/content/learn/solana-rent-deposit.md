---
title: "The rent deposit on a Solana lock, explained"
searchTitle: "The 0.0017 SOL rent deposit on a Solana stake account"
description: "Why every Solana lock holds a little more than you locked: the network's minimum balance of about 0.0017 SOL, which comes back when you withdraw."
published: 2026-11-09
order: 15
section: details
related: [withdraw-solana-stake-account-after-lockup, verify-solana-lock-on-chain, how-to-lock-solana]
---

Lock 1 SOL and the lock account holds a little more than 1 SOL. The difference, about 0.0017 SOL, is the rent deposit. It is not a fee, it goes to nobody, and it comes back to you when you withdraw. Here is what it is and why it is there.

## What rent is on Solana

Every account on Solana takes up storage on thousands of validators. To be allowed to exist, an account must hold a minimum balance in proportion to its size. Solana calls that minimum "rent", from the days when accounts below it were charged a little each epoch. Today the network simply refuses to create an account below the minimum, and an account that holds it is called rent-exempt: it pays nothing, for as long as it exists.

The minimum is a rule of the network, not of SolLock, and it is the same for everyone who makes an account of that size.

## How much it is for a lock

A stake account, the kind of account a lock is, takes 200 bytes. The minimum balance for 200 bytes is about 0.0017 SOL at today's network settings, and the lock page asks the network for the exact figure when it builds your lock. It has only ever gone down: under an earlier rule the same account needed about 0.0023 SOL, and SolLock refuses to build a lock if the network ever reports more than that.

The deposit is the same whether you lock 0.01 SOL or 1,000 SOL.

## Where it is

The deposit sits inside the lock account, on top of the amount you locked. On a block explorer the balance reads amount plus deposit, and [How to check a Solana lock on the blockchain](/learn/verify-solana-lock-on-chain) shows the field. The recovery note lists them separately too.

SolLock's fee is a different thing: it goes to SolLock's address in the same transaction and is not in the lock account at all. The cost breakdown on [the lock page](/lock) shows the four parts side by side: the amount, the rent deposit, SolLock's fee and the network fee.

## Getting it back

When the date has passed, withdrawing the whole balance closes the account, and the deposit comes back with the amount, in the same transaction. On [My locks](/my-locks) the Withdraw button does exactly that. With another tool, withdraw the full balance for the same result: [How to withdraw after the lockup ends](/learn/withdraw-solana-stake-account-after-lockup) has the command.

A partial withdrawal has to leave the minimum balance in the account, because the account still exists. The deposit comes back only when the account is closed.

## On a test lock

A test lock is free, so the only things that leave your wallet are 0.01 SOL for the lock itself, the network fee of a fraction of a cent, and the rent deposit. When you withdraw the test lock about a day later, the 0.01 SOL and the deposit come back together. A [free test lock](/lock?test) is the easiest way to see the deposit go out and come back.

Solana's own explanation of accounts and rent is in its [account model](https://solana.com/docs/core/accounts) documentation, and the stake account's layout is in the [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
