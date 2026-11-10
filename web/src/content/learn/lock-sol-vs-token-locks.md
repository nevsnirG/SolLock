---
title: "Locking your own SOL vs token locks: which one do you need?"
searchTitle: "Lock SOL or lock tokens? Solana token lockers compared"
description: "Token lockers such as Streamflow and Jupiter Lock hold a project's tokens in a program. A native lockup holds your own Solana on the network. Which fits when."
published: 2026-11-10
order: 20
section: details
related: [time-lock-crypto-wallet, solana-stake-account-lockup, can-you-unlock-solana-early]
---

Search for a way to lock Solana and most of what you find is about something else: locking tokens, for projects. Both are called locking and both have a date, but they solve different problems. This page puts them side by side, so you end up at the right tool, which may well not be this one.

## Token locks: made for projects

A token locker is an app with a program behind it, what other blockchains call a smart contract. You send tokens to the program, and it holds them until a date or releases them on a schedule.

Projects use lockers for the supply of a token they launched: the team's share, the investors' share, and the liquidity pool tokens that keep trading possible. The lock is a public signal. Holders can see that the team cannot sell its share, or pull the liquidity, before the date.

Two that are widely used on Solana, as their own documentation described them in November 2026:

- **[Streamflow](https://docs.streamflow.finance/en/articles/9339705-token-lock)** locks tokens until a date and says a lock cannot be moved or opened before it. Solana itself is not a token, so it is wrapped into wSOL when it is locked there.
- **[Jupiter Lock](https://docs.jup.ag/user-docs/launch/lock)** charges no fee of its own. A lock can release everything on one date or bit by bit, and whoever makes it chooses who may cancel it or change the recipient: nobody, the maker, the recipient, or either of them.

There are more, and they come and go. Sablier's version for Solana stopped taking new locks in 2026.

## A native lockup: made for your own SOL

A native lockup is not an app's program. It is a field in a Solana stake account, checked by the Stake Program, which is part of Solana itself and runs on every validator. The account holds Solana as it is, not wrapped and not swapped for a token.

It knows one thing: a date before which nobody may withdraw, unless a custodian signs. SolLock makes such an account with a custodian that is [an address nobody has a key for](/custodian), so no one can sign. The Solana command-line tool makes the same account without SolLock. [How Solana stake account lockups work](/learn/solana-stake-account-lockup) describes the fields.

## The two side by side

- **What goes in.** Token lock: tokens, including liquidity pool tokens and wrapped Solana. Native lockup: Solana itself and nothing else.
- **What enforces the date.** Token lock: the locker's program. Native lockup: Solana's Stake Program.
- **Who can undo it.** Token lock: whoever the settings allow, and whoever can change the program. Native lockup: the custodian, or nobody when the custodian has no key.
- **How it opens.** Token lock: on one date or on a schedule. Native lockup: on one date.
- **Who it is for.** Token lock: a project showing others that its tokens are locked. Native lockup: a person holding their own coins, or giving them to someone.
- **What it costs.** Token lock: from network fees only to a fee per lock, depending on the tool. SolLock: 0.25% of the amount, at least 0.01 SOL. The command line: the network fee.

## Which one you need

- **You launched a token** and want to show that the liquidity or the team's share is locked. Use a token locker. SolLock cannot hold tokens.
- **You want tokens released bit by bit,** to a team or to investors. Use a token locker with a schedule.
- **You want to lock a token** other than Solana, such as a stablecoin. Use a token locker.
- **You hold Solana and want to keep your own hands off it** until a date, or give it to someone to open on a date. A native lockup does exactly that.

## Five questions for any lock

1. **Who can cancel it or move the date?** In a token locker it is a setting chosen when the lock is made. In a native lockup it is the custodian. [Can you unlock Solana early?](/learn/can-you-unlock-solana-early) shows how to read that field.
2. **Who can change the program?** A program that its makers can replace is only as firm as the key that replaces it. The Stake Program changes only through the upgrades of the Solana network itself.
3. **What if the website disappears?** A lock should open with another tool. A native lockup opens with any wallet or tool that handles stake accounts.
4. **What does your wallet show before you sign?** The amount, the date and the account it goes to should be the ones you chose.
5. **What does it cost, and when?**

For a lock on this site the answers are on the page before you sign, and a [free test lock](/lock?test) of 0.01 SOL for about a day lets you check them for yourself. A lock is final until its date and does nothing about the price, so lock only Solana you can leave alone for the whole time.

The protocol's own description of the lockup is in Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
