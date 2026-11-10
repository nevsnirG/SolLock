---
title: "Time lock wallets: Bitcoin, Ethereum and Solana compared"
searchTitle: "Time lock crypto wallets: Bitcoin, Ethereum and Solana"
description: "How Bitcoin script locks, Ethereum contracts and Solana's native lockup each time-lock crypto, who can break each one, and what to check before you trust one."
published: 2026-11-09
updated: 2026-11-10
order: 19
section: details
related: [solana-stake-account-lockup, lock-sol-vs-token-locks, crypto-time-capsule]
---

A time lock wallet, also written timelock wallet, holds coins that cannot be spent before a date. The idea is simple and the search results for it are confusing, because three different things share the name: files that open later, time lock puzzles in cryptography, and coins locked on a blockchain. This guide is about the third, and about how three big chains do it differently.

## What a time lock on a blockchain is

Every coin on a chain belongs to some address, and the chain's rules say who may move it. A time lock adds one more rule: not before this moment. The important question for any time lock is who enforces that rule and who can make an exception. The answers range from "a company, on request" to "nobody, ever", and the difference is the whole product.

## Bitcoin: locks written into the script

Bitcoin has had time locks since 2015. A coin can be sent to a script that says it may only be spent after a block height or a timestamp. The network enforces it: before the time, no signature is valid. It is as firm as a lock gets.

The catch is tooling. Everyday Bitcoin wallets have no "lock until" button; time locks live in advanced wallets and inheritance tools, and a mistake in the script, like a date far in the future or a wrong key, is final with no undo. For most people the practical answer has been a hardware wallet in a drawer, which is a lock on convenience, not on the coins.

## Ethereum: locks written as contracts

On Ethereum a time lock is a smart contract: a program that holds the coins and releases them after a date. That is flexible. The contract can release in instalments, to several people, with conditions. It also means you trust the contract's code. If it has a bug, or an owner who can change the date, the lock is only as good as that. Well-audited contracts hold up in practice, but you are trusting a program somebody wrote rather than the chain's own rules, and you pay the network to run it.

## Solana: a lock built into an account type

Solana has a native account type with a lockup field: the stake account, the same one used for staking. The lockup holds a date and a custodian address, and the Stake Program, which every validator runs, refuses any withdrawal before the date. No contract to audit, no company to ask. Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts) describes it. Token lockers on Solana are a different thing, closer to the Ethereum kind: [Locking your own SOL vs token locks: which one do you need?](/learn/lock-sol-vs-token-locks)

One detail decides how firm it is. The custodian in the lockup may move the coins before the date. If that is a key somebody holds, the lock has a back door. If it is an address that provably has no key, there is no back door, for anyone. SolLock sets the custodian to [a published address with no key](/custodian), so a lock made there can only be opened by time. [Why nobody can unlock Solana early](/learn/can-you-unlock-solana-early) goes through what that means.

A SolLock lock is not staked and earns nothing; the account type is used only for its lockup. [Locking vs staking Solana](/learn/solana-locking-vs-staking) has the difference.

## The three side by side

- **Who enforces the date.** Bitcoin: the network. Ethereum: the contract's code. Solana: the network.
- **Who can open early.** Bitcoin: nobody. Ethereum: whoever the contract allows. Solana: the custodian, or nobody when the custodian has no key.
- **Tooling for ordinary people.** Bitcoin: thin. Ethereum: depends on the contract's app. Solana: a wallet and one transaction.
- **What goes wrong.** Bitcoin: a wrong script is final. Ethereum: a bug or a privileged owner. Solana: a lost recovery phrase.

## What to check before you trust any time lock

- **Who holds the exception?** Ask who could move the coins before the date. "Our team, in emergencies" means it is a promise, not a lock.
- **Does it work without the company?** A lock that needs the provider's website to open is a service. A lock the chain enforces opens in any wallet.
- **Can you verify it?** On Solana the lock's date and custodian are readable on any explorer: [How to check a Solana lock on chain](/learn/verify-solana-lock-on-chain).
- **What happens to the key?** Every lock on every chain still depends on the recovery phrase of the wallet that will withdraw. The lock protects against selling, not against losing the phrase.

If Solana is the coin you want to lock, a [free test lock](/lock?test) shows what the network's own version feels like, with 0.01 SOL for about a day.
