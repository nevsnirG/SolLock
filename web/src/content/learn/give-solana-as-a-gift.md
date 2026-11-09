---
title: "How to give Solana as a gift that opens on a date"
searchTitle: "How to give Solana (SOL) as a gift that opens on a birthday or another date"
description: "Locking Solana for a child, a friend or a couple, to open on an 18th birthday, a graduation or a wedding. What the recipient needs, what to check in the address, and why a gift is final."
published: 2026-11-09
order: 7
related: [how-to-lock-solana, withdraw-solana-stake-account-after-lockup, can-you-unlock-solana-early]
---

A gift lock is a lock that belongs to someone else from the start. You pay for it, you pick the date, and the account names their wallet as the one that may withdraw. Until the date the network keeps it shut for everyone, you included. From the date on it is theirs to take out, with nobody in between.

That makes it a different kind of present from sending Solana to someone's wallet today. Nobody can spend it early, not the recipient, not you, and the date can say something: an 18th birthday, a graduation, a wedding day, the first of January in ten years.

## What the recipient needs

A Solana wallet they hold themselves, like Phantom, Solflare or Backpack, and its address. That is all. They need no account with SolLock, and they need not even know about the lock until you tell them.

Two things to get right:

- **A wallet, not an exchange.** A deposit address at an exchange cannot sign a withdrawal from a stake account, so a lock sent there is lost. The address must belong to a wallet whose recovery phrase the recipient, or someone acting for them, actually holds.
- **Someone keeps the recovery phrase for the whole time.** For a child, that is usually a parent, who hands it over on the day. Write down who has it and where, and think about what happens if that person is not around when the date comes.

## Checking the address

A Solana address is 32 to 44 letters and digits, and one wrong character sends the gift to nobody. Before your wallet opens, [the lock page](/lock) runs a few checks on the address you paste:

- It refuses your own wallet, SolLock's fee address, the custodian that has no key, known program addresses, and any address no private key can exist for.
- It looks the address up on the network and warns when it has never been used, or refuses it when it belongs to a program, such as a token account.
- It reads the first and last four characters back to you, and the confirmation screen shows the whole address in groups of four, so you can compare it with what the recipient sent you.
- You tick a box that it is a wallet they hold themselves, not an exchange deposit address.

The checks catch typos and the common mistakes. They cannot tell whose wallet it is. Ask the recipient for the address directly, and check it with them once more over a different channel than the one it arrived through.

## A gift is final

Once the lock exists there is no way back. You cannot cancel it, change the date, or move it to another wallet, and neither can SolLock. [Can you unlock Solana early?](/learn/can-you-unlock-solana-early) explains why. If the recipient loses their recovery phrase, the Solana is gone on the date, for everyone.

The gift also keeps following the price of Solana, which can go down as well as up. What it is worth on the day is not something anyone can know today, and a lock does nothing about that. Give an amount you are comfortable with whatever the price does.

## Picking the date

The date is a withdrawal ban, not a reminder, so pick one you can name a reason for. The lock page offers one, five and ten years, New Year's Day of a few coming years, and any date you type up to the end of 2076.

Past ten years the page asks a fair question: wallet apps will change, so who will still have the recovery phrase in that year? A long gift lock needs a plan for that, such as a written note with the recovery phrase in a safe place the recipient will have access to.

## What to hand over

- **The recovery note.** The success screen gives you one. It holds the lock's address, the date, the amount and the recipient's address, and explains how to withdraw with any Solana tool, in case this website is ever gone. Give it to the recipient, or to whoever keeps the recovery phrase, and keep a copy.
- **A pointer to [My locks](/my-locks).** When the recipient connects their wallet there, the lock shows up by itself, with the date and a Withdraw button once it has passed. [How to withdraw after the lockup ends](/learn/withdraw-solana-stake-account-after-lockup) has the details.

A gift may count for gift tax where you live, and the recipient owns the locked Solana from the start. [The FAQ](/faq) says what that means in the Netherlands. This is not tax advice.

Try the flow first with a [free test lock](/lock?test) to your own wallet. It costs you only the network fee, and you see every screen the real gift will go through. For the protocol's definition of the account and its withdraw authority, see Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
