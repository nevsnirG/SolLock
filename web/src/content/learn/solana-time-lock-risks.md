---
title: "What can go wrong with a Solana time lock"
searchTitle: "Solana (SOL) time lock risks: what can go wrong, and what cannot"
description: "The risks of locking Solana, plainly: a lost recovery phrase, a date too far away, the price, a wrong gift address, a custodian with a key, and what this site going away would change."
published: 2026-11-09
order: 16
related: [can-you-unlock-solana-early, verify-solana-lock-on-chain, stop-selling-crypto-in-a-dip]
---

A time lock is a simple thing: Solana in an account that the network keeps shut until a date. Simple things still have ways to go wrong, and with a lock most of them cannot be fixed afterwards. Here they are, roughly from most to least likely, followed by the things that cannot happen.

## A lost recovery phrase

This is the big one. A lock opens only for the wallet named in it. If that wallet's recovery phrase is lost, the Solana is gone on the date, for everyone, and no one can help: not SolLock, not the wallet maker, not the network. Back up the phrase offline before you lock anything, in a place that will still exist on the date, and never type it into any website, this one included. SolLock only ever asks your wallet for a signature.

The longer the lock, the more this matters. Phones get replaced, apps get discontinued, and the person who knows where the paper is may not be around. Past ten years the lock page asks who will still have the phrase in that year. Answer it before you lock.

## Needing the money before the date

There is no emergency exit. A market crash, a stolen phone, a lost job or a changed mind opens nothing, and that is the whole point of the lock. [Can you unlock Solana early?](/learn/can-you-unlock-solana-early) has the details. Lock only Solana you could do without for the entire time, and keep an accessible balance for life in the meantime.

## The price

Locked Solana is still Solana. It follows the price, which can go down as well as up, and a lock changes none of that. On the date it is worth what the market says that day, which may be less than today. A lock protects a decision to hold from your own impulses; it protects nothing against the market. Nobody can tell you what it will do.

## A wrong address on a gift

A gift lock names the recipient's wallet, and that cannot be changed afterwards. The lock page refuses the addresses that can never withdraw, warns about an address that has never been used, and reads the address back to you, but it cannot know whose wallet it is. An exchange deposit address in particular looks like any other address and cannot sign a withdrawal from a stake account. [How to give Solana as a gift](/learn/give-solana-as-a-gift) lists the checks to do yourself.

## A lock made elsewhere, with a key

Every Solana lockup names a custodian, and the custodian's signature lets a withdrawal through early and can move the date. On a SolLock lock the custodian is [an address nobody has a key for](/custodian). A lock made by another tool may name a wallet instead, which makes it only as firm as whoever holds that wallet. For any lock, yours or someone else's, look up the custodian on a block explorer before you trust the date: [How to check a Solana lock on the blockchain](/learn/verify-solana-lock-on-chain).

## A look-alike website

A lock is created by a transaction your wallet signs, so the risk is signing the wrong one on a page that looks like this one. Check the address bar reads sollock.io. Read what your wallet shows before you approve: it should create one account owned by the Stake program and set a lockup, with the fee going to SolLock's published address. The lock page decodes the whole transaction for you first, and the success screen only appears after the lock has been read back from the network and checked field by field.

## Your wallet calls it a stake account

Solana uses the same account type for staking, so your wallet may list the lock under staking, next to a Delegate or Stake button. Delegating a lock is allowed by the network, but it adds a step on the unlock date: the account must be deactivated and cool down before it can be withdrawn. Leave the lock alone, and it opens in one step.

## This website going away

Your lock would carry on exactly as it is. It lives on the Solana blockchain, the date and the custodian are in the account, and your wallet's key is the only thing needed to withdraw. The recovery note from the success screen holds the lock's address and the command to withdraw with Solana's own tools: [How to withdraw after the lockup ends](/learn/withdraw-solana-stake-account-after-lockup). Keep that note.

## The network itself

The lock is a rule of the Solana network, enforced by its Stake program. Solana has had outages in the past, during which no transaction goes through, so a withdrawal planned for a particular hour may have to wait. The network's clock can also run a few minutes behind. And like any protocol, Solana can change through its public upgrade process; a change to how stake accounts work cannot be ruled out, though the lockup has been part of the protocol since the start. These are the risks of holding Solana at all, and a lock neither adds to them nor takes them away.

## What cannot happen

- **SolLock cannot take your Solana.** The transaction is built in your browser and signed in your wallet. There is no SolLock key in it, and the server never signs anything.
- **Nobody can open the lock early.** The custodian has no key, so the network's rule has no exception, for you or anyone else.
- **The lock cannot be moved to another wallet before the date.** Changing who may withdraw needs the custodian's signature too.
- **A test lock cannot cost you much.** It is 0.01 SOL for about a day, free of SolLock's fee, and the way to see every step before you lock anything that matters: [try one](/lock?test).

The protocol rules behind each of these are in Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts). Read it, check [the custodian](/custodian) yourself, and lock only what you can leave alone.
