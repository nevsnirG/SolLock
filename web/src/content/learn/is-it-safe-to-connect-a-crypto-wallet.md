---
title: "Is it safe to connect your wallet to a website?"
searchTitle: "Is it safe to connect your crypto wallet to a website?"
description: "Connecting a wallet only shows a website your address. The risk is in what you sign afterwards. What each step allows, and what to check before you approve."
published: 2026-11-10
order: 3
section: start
related: [buy-your-first-solana-and-keep-it, what-is-solana, solana-time-lock-risks]
---

"Connect wallet" is the first button on almost every crypto website, and the one newcomers worry about most. The short answer: connecting is safe in itself. It shows the site your address and lets it ask you for a signature. It moves nothing.

The risk sits one step later, in what you approve in your wallet. This guide goes through the three things a site can ask of a Solana wallet, what each one allows, and what to check before you say yes.

## Connecting: the site sees your address

When you connect, your wallet tells the site your public address. With that address the site can read what is public anyway: the balance, the tokens and the past transactions of every address are on the blockchain for anyone to look up.

From then on the site can also ask your wallet to show you something to sign. It cannot sign for you, and it cannot move a coin. If you disconnect, the site no longer sees which address is yours the next time you visit.

One thing to know: your address ties your visits together. A site you connect to learns what that address holds. If you would rather keep that private, use a separate address for it.

## Signing a message: proof that the address is yours

Some sites ask you to sign a message, often to log in. A message is text, not a transaction, and signing it moves nothing. It proves that whoever is at the keyboard holds the key for that address.

Read the text before you sign. If it is not readable, or your wallet warns about it, say no.

## Signing a transaction: this is the decision

A transaction is the only thing that moves your coins. What it says happens, and it cannot be taken back.

A site built to steal, often called a drainer, needs one approval from you for a transaction that does something other than the page claims: it sends your coins away, or it hands control of an account to someone else. Everything else on such a site, the countdown, the free tokens, the helpful stranger in a chat, exists to get that one approval quickly.

Wallets help here. Phantom, Solflare and Backpack rehearse a transaction before they show it to you and list what would change, for example "-2 SOL". Many wallets also warn about sites that are known to steal, and say so when they cannot work out what a transaction will do.

Before you approve, check four things:

- **The address bar.** Is this the site you meant to open? A look-alike name is the most common trick. Open sites that matter from a bookmark, not from an advert or a link in a message.
- **What leaves your wallet,** according to the wallet's own summary. The wallet's summary counts, not what the page says.
- **Warnings.** If your wallet cannot show what a transaction does, or flags the site, stop. A real site can wait a day.
- **Hurry.** Pressure to approve right now is a reason not to.

## What no website may ever have

Your recovery phrase, also called a seed phrase. Connecting does not need it, and neither does signing. A page, a form or a "support agent" that asks for those words is stealing them, every time, whatever reason it gives. Your wallet app is the only place they belong.

## Habits that limit the damage

- **Two wallets.** Keep one for trying new sites, with only a little in it. Keep what you hold in another that never connects to anything you do not know well.
- **A hardware wallet** for larger amounts. Its keys stay off your computer, and you confirm each transaction on the device itself.
- **Small first.** On a site that is new to you, start with an amount you could lose.
- **If it goes wrong.** If you gave away the recovery phrase, the wallet is no longer yours alone: move everything to a new wallet with a new phrase at once. If you approved a bad transaction, what it took is gone, but the key is still yours. Check the wallet's settings for permissions it granted and remove them.

## What SolLock asks of your wallet

- **Connecting** shares your address, which SolLock uses to show your balance and to find your locks.
- **One transaction** for each lock, and one for each withdrawal. Before your wallet opens, [the lock page](/lock) shows that transaction in plain words: the amount, the unlock date, who can withdraw, the custodian and the fee. Under "The full transaction" you can read every instruction in it. Your wallet then shows it once more.
- **The recovery phrase** is asked for nowhere on this site.

You can try all of it with a [free test lock](/lock?test): 0.01 SOL for about a day, so you see each screen before anything that matters is at stake. The one risk that stays is a look-alike of this site, which is why [What can go wrong with a Solana time lock](/learn/solana-time-lock-risks) says to check that the address bar reads sollock.io.

What a transaction is made of, and why a signature is needed for every change, is in Solana's [documentation on transactions](https://solana.com/docs/core/transactions).
