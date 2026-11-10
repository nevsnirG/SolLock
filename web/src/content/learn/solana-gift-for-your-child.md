---
title: "Solana for your child: a gift that opens on their 18th birthday"
searchTitle: "Solana (SOL) for your child: a gift that opens at 18"
description: "How to give a child Solana they can only touch on a date you pick, such as their 18th birthday: the wallet, the lock, and what to hand over on the day."
published: 2026-11-09
order: 12
section: gifts
related: [give-solana-as-a-gift, how-to-lock-solana, solana-time-lock-risks]
---

Grandparents used to open an account for a newborn and pay in on every birthday, with a rule that nobody touched it until the child grew up. The crypto version of that gift is harder than it looks, because crypto has no bank to enforce the rule. Whoever holds the keys can sell on any bad day, and that includes you.

A time lock gives the gift a date the network enforces. You put Solana in an account that only opens on the day you choose, such as the child's 18th birthday. Before that day nobody can move it: not you, not the child, not SolLock. On the day, it is theirs to withdraw.

This guide is about how to do that. It does not say whether Solana is a good gift. Its price moves both ways, and the amount you lock may be worth less on the day than it is today.

## The gift has two parts

A locked gift is two things the child will need together:

1. **A wallet.** The lock pays out to a Solana address, so the child needs one. Under eighteen, that usually means you make the wallet for them and keep its recovery phrase until they are old enough.
2. **The recovery phrase of that wallet.** It is the only way into the wallet, now and on the date. Without it the gift is as good as gone, and nobody can make a new one.

Everything else is paperwork around those two.

## Step by step

1. **Make a wallet for the child.** Install a wallet app such as Phantom, Solflare or Backpack and create a new wallet, separate from your own. Write its recovery phrase, twelve or twenty-four words, on paper. Store it where it will survive eighteen years: a sealed envelope in a safe, a copy with the other parent, or a metal backup. Never a photo or a note on your phone.
2. **Make the lock from your own wallet.** On the [lock page](/lock), choose the amount, pick the child's 18th birthday as the date, and enter the child's address as the recipient. SolLock checks the address: it refuses its own fee address and the custodian, and warns when the address has never been used, which a new wallet has not. That warning is expected here. Check the address against the child's wallet once more and tick the box that says you know it is a self-custody wallet.
3. **Sign once.** Your wallet shows the transaction, you approve it, and the Solana moves into the locked account. From this moment it belongs to the child's address and you can no longer take it back.
4. **Save the recovery note.** SolLock shows one after the lock: the lock's address, the date and the fee. Print it and put it with the recovery phrase. Together they tell the child, or anyone helping them, exactly what to open and how.

Start with a [free test lock](/lock?test) to see the whole flow: 0.01 SOL, open after about a day.

## When the day comes

The lock opens at the start of the date, 00:00 UTC. The child, with the recovery phrase in a wallet, opens [My locks](/my-locks) or any other Solana tool, and withdraws. Nothing else is needed, and SolLock does not need to exist anymore for that: the account is a standard Solana [stake account](https://solana.com/docs/references/staking/stake-accounts) that every wallet and explorer understands.

If you want to be sure the gift is where you think it is, [check the lock on chain](/learn/verify-solana-lock-on-chain) at any time with the address on the recovery note.

## Things to decide before you lock

- **Whose wallet?** If you would rather lock in your own wallet and hand over the wallet itself later, that works too. The lock is then in your name until the day, and the handover is the recovery phrase. A separate wallet for the child makes the gift final from day one, which is often the point.
- **What date?** Eighteen is common, but any date up to the end of 2076 works. Past ten years, SolLock asks who will still have the recovery phrase then. Take that question seriously: a lock for a newborn runs longer than most people keep a password. What to put next to a lock that waits that long is in [A time capsule for your crypto](/learn/crypto-time-capsule).
- **How much?** Only Solana you would not need back, whatever the price does. The fee is 0.25% with a minimum of 0.01 SOL, paid once in the same transaction, and about 0.0017 SOL stays in the account as a [deposit](/learn/solana-rent-deposit) that comes back on withdrawal.
- **Tax.** A gift may count for gift tax where you live, and the child owns the Solana from the start. The rules differ by country. This is not tax advice.

A wallet has no age check, so nothing stops you from making one for a child. That also means the responsibility is yours until they take it over. Hand over the phrase and the recovery note as carefully as you stored them, and the gift arrives whole on the day you chose.
