---
title: "A time capsule for your crypto"
searchTitle: "Crypto time capsule: lock Solana (SOL) until a date"
description: "What a crypto time capsule is, how to make one on Solana in one signature, what to put next to it, and how whoever opens it gets in on the day."
published: 2026-11-09
order: 13
section: gifts
related: [solana-gift-for-your-child, how-to-lock-solana, can-you-unlock-solana-early]
---

A time capsule is a box you seal with a date on the lid. Part of the appeal is that you give up control: once it is buried, the contents wait for the date whether or not you change your mind. Crypto turns out to be good at that, because a blockchain can enforce a date without anyone guarding the box.

On Solana you can seal Solana itself into an account that the network refuses to open before a date you choose. This guide is about what that is, how to make one, and what fits inside.

## What a crypto time capsule is

It is an amount of Solana in a native account with a built-in lockup. The lockup has a date, and until that date the network refuses every withdrawal. Nobody holds a spare key: when the lock's custodian is [an address nobody has a key for](/custodian), there is no person who could open it early, and no company whose closing would matter. On the date the account simply opens, and the owner withdraws with any Solana wallet.

So it is a capsule for value, not for files. You cannot put a photo or a letter on the chain this way. You can put the letter next to it, in the same envelope as the recovery note, and the capsule makes sure the letter is read on a day with something to show for it.

## Making one

1. Decide **what goes in**: an amount of Solana you would not need back before the date, whatever its price does in between. The capsule holds Solana only, not tokens or NFTs.
2. Decide **who opens it**: you, or someone else. The capsule pays out to one Solana address, so it can be your own wallet or a gift to another, including [a child's wallet that opens on a birthday](/learn/solana-gift-for-your-child).
3. Decide **the date**: a round number of years, a birthday, an anniversary, a year with meaning. Any date up to the end of 2076. Past ten years, SolLock asks who will still have the recovery phrase then, because the recovery phrase of the receiving wallet is the real key to the capsule.
4. On the [lock page](/lock), enter those three things, read the plain-words list of what the transaction does, and sign once in your wallet.

Afterwards SolLock shows a recovery note: the capsule's address, the date, the fee. Print it. With the recovery phrase of the receiving wallet, it is everything the opener needs, and it works without SolLock.

A [free test lock](/lock?test) seals 0.01 SOL for about a day, so you can watch one open before you make a real one.

## What to put alongside it

The capsule itself is a number on a chain. The things that make it a time capsule are around it:

- **A letter** to whoever opens it, dated today, saying why you sealed it and what you hoped for. Resist guessing at the price on opening day: nobody knows, and the letter reads better without it.
- **The recovery note**, so the opener knows which account and which date.
- **Today's price and the reason for the amount**, if you like. The contrast on opening day is the story, in either direction.
- **Instructions for the recovery phrase**: where it is, and that it is the only way in.

## Opening day

The capsule opens at 00:00 UTC on the date. The owner connects the receiving wallet on [My locks](/my-locks) and withdraws, or uses any other Solana tool, because the account is a standard [stake account](https://solana.com/docs/references/staking/stake-accounts) that every wallet and explorer understands. Anyone can look at the capsule on an explorer at any time, see the amount and the date, and confirm nothing has moved: [How to check a Solana lock on chain](/learn/verify-solana-lock-on-chain).

## What it is not

It is not a way to protect the value inside. The price of Solana moves both ways, and the capsule opens on whatever price that day has. It is not reversible: there is no emergency exit and no appeal, [not even with a good reason](/learn/can-you-unlock-solana-early). And it is not a message service: the chain stores the lock, not your words. Keep those on paper, with the note.
