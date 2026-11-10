---
title: "What is Solana, in plain words"
searchTitle: "What is Solana (SOL)? A beginner's guide in plain words"
description: "Solana explained from zero: the network, the coin, wallets and addresses, what a transaction costs, what staking is, what on-chain means, and the risks."
published: 2026-11-09
order: 1
section: start
related: [buy-your-first-solana-and-keep-it, hold-solana-long-term, solana-locking-vs-staking]
---

Solana is two things with one name: a network of computers that keeps a shared ledger, and the coin that ledger counts. People say "I bought Solana" and mean the coin; developers say "built on Solana" and mean the network. This guide covers both, assumes nothing, and says nothing about whether to buy any. It is background for the other guides here.

## The network

Solana is a blockchain: a ledger copied across many hundreds of computers around the world that agree, several times a second, on what happened. Nobody owns it. The computers that run it are called validators; anyone with the hardware and some Solana of their own can run one, and the network pays them for the work. It has run since March 2020.

What set it apart from the start was speed and cost. A payment on Solana usually confirms within a second or two and costs a fraction of a cent, where Bitcoin takes minutes and Ethereum costs cents to dollars. The design behind that is in Solana's [documentation](https://solana.com/docs/core/transactions); you can use the network without knowing it.

## The coin

The coin is also called Solana. Exchanges show it under a three-letter ticker next to amounts, so a balance reads like 2.5 SOL. It is divisible to nine decimal places, so you can own a sliver of one.

The coin has two jobs inside the network. It pays the [fees](https://solana.com/docs/core/fees) for every transaction, and validators put it up as a stake, a deposit that can be taken from them if they cheat. Outside the network it is traded like any other crypto, and its price is set by buyers and sellers, with large moves both ways.

## Wallets, addresses and keys

A wallet is an app that holds your keys, not your coins; the coins are always on the ledger. The keys come from a recovery phrase, also called a seed phrase: twelve or twenty-four words, shown once when you create the wallet. Whoever has the phrase has the coins, which is why it goes on paper in a safe place and never into a website.

An address is the public side of the key: a string of about forty-four letters and digits that others use to send to you. Sharing it is fine. Phantom, Solflare and Backpack are common wallets; Solana's [wallet directory](https://solana.com/wallets) lists more.

## Transactions and "on chain"

A transaction is a signed instruction: send this much to that address, or stake this, or lock that until a date. Your wallet shows what it does, you approve it, and the network either records it in full or rejects it. Once recorded it is permanent and public. "On chain" means exactly that: written into the ledger that every validator holds, where anyone can look it up on an explorer and nobody can quietly edit it.

That permanence is the point of a Solana time lock. The lock is a rule written into an account on the ledger, so the network itself enforces the date rather than a company promising to. [How a Solana stake account lockup works](/learn/solana-stake-account-lockup) explains the mechanism; [the lock page](/lock) is where you would make one.

## Staking

Staking means putting your coins behind a validator to help secure the network, in return for rewards paid in Solana. The coins stay yours but take a few days to come back when you stop. Rewards vary and are not guaranteed. A SolLock lock is not staking and earns nothing; it uses the same account type for a different purpose, as [Locking vs staking Solana](/learn/solana-locking-vs-staking) explains.

## Tokens and apps

Besides the coin, the network carries tokens made by others, from stablecoins pegged to the dollar to meme coins with nothing behind them, and programs that trade, lend or play games with them. SolLock touches none of that. It locks only Solana itself.

## The risks, briefly

- **Price.** Solana has lost more than half its value more than once and gained it back more than once. Nobody knows which comes next.
- **Keys.** Lose the recovery phrase and the coins are gone; type it into the wrong site and they are stolen. There is no helpdesk.
- **The network.** It has halted several times in its life, most recently for about five hours in February 2024. Coins were not lost, but nothing moved.
- **Scams.** Fake wallets, fake support, fake airdrops. The one rule that catches most of them: no real service ever needs your recovery phrase.

If you have never held any, [Buying your first Solana and keeping it](/learn/buy-your-first-solana-and-keep-it) is the next page. If you already do and want to hold for years, [How to hold Solana for the long term](/learn/hold-solana-long-term) is.
