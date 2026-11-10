---
title: "How to lock Solana until a date you pick"
searchTitle: "How to lock Solana (SOL) until a date you pick"
description: "How to lock Solana until a future date with a lockup the network itself enforces, what to check before you sign, what it costs, and what happens on the day."
published: 2026-11-03
updated: 2026-11-09
order: 5
section: lock
related: [can-you-unlock-solana-early, withdraw-solana-stake-account-after-lockup, solana-time-lock-risks]
---

If you plan to hold Solana for years, a normal wallet leaves you free to sell at any moment, including the worst one. Solana has a native way to take that option off the table: an account with a built-in lock, which the network keeps shut until a date you choose.

Solana calls that account type a "stake account", because it is also the kind used for staking. The lock works without staking, and a SolLock lock is not staked: it earns nothing and simply waits. If wallets, addresses and "on chain" are new to you, [What is Solana, in plain words](/learn/what-is-solana) covers them first.

## What locking does

Your Solana moves from your wallet into a new account on the Solana network. That account records who may withdraw (you, or the person you give it to), the unlock date, and a custodian. The custodian is the one key that could lift the lock early. Before the date, the network refuses every withdrawal unless the custodian signs.

So a date on its own proves little. What makes a lock hold is a custodian nobody can sign for. Every SolLock lock names [an address that has no key](/custodian), and that page shows how the address is made, so you can check it yourself.

The Solana stays Solana. It is not swapped, wrapped or lent out, and it keeps following the price, which can go down as well as up.

## Four decisions

1. **The amount.** Keep enough outside the lock for fees and for anything you might need before the date. Locked means locked, in an emergency too.
2. **The date.** Treat it as a withdrawal ban, not a reminder. Pick a long one only if you are sure you can do without that Solana for the whole time.
3. **What you sign.** Before your wallet opens, [the lock page](/lock) shows the transaction decoded in plain words: the amount, the unlock date, who can withdraw, the custodian and the fee. Your wallet shows it once more. Read the date and the custodian before you approve.
4. **Your records.** Save the recovery note from the success screen. It holds the lock's address and explains how to withdraw with any Solana tool, in case this site is ever gone.

Start with a [free test lock](/lock?test): 0.01 SOL for about a day. You go through the whole flow, including the withdrawal, before you lock anything that matters.

## What it costs

SolLock's fee is 0.25% of the amount, at least 0.01 SOL, VAT included, paid in the same transaction. On top come the network fee, a fraction of a cent, and [a rent deposit of about 0.0017 SOL](/learn/solana-rent-deposit), which stays in the lock and comes back when you withdraw. Test locks are free.

## What happens on the unlock date

The lock opens at 00:00 UTC on the date you picked. Nothing moves by itself: the Solana waits in the account until you withdraw it. On [My locks](/my-locks) that is one step, with the wallet that owns the lock. Any other tool that handles stake accounts works too, including the Solana command-line tool: [How to withdraw after the lockup ends](/learn/withdraw-solana-stake-account-after-lockup) has the steps.

That wallet matters as much after the date as before. Only its key can withdraw, so back up its recovery phrase before you lock anything. Lose the key, and the lock opens on the date for nobody.

## Should you lock at all?

A lock suits Solana you have already decided to hold, and want to protect from your own impulses when the market gets loud. It does not suit money you may need, and it does nothing about price risk. If you are unsure, lock a part and keep the rest where you can reach it.

Solana's own description of the account type is in its [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
