---
title: "How to check a Solana lock on the blockchain"
searchTitle: "How to check a Solana (SOL) lock on the blockchain"
description: "How to verify a Solana lock on a block explorer: the owner program, the unlock date, the withdraw authority and the custodian, and what each should say."
published: 2026-11-03
order: 9
section: lock
related: [solana-stake-account-lockup, can-you-unlock-solana-early, withdraw-solana-stake-account-after-lockup]
---

A website telling you that your Solana is locked until a date is a claim. The lock itself is public, on the Solana blockchain, and anyone with its address can read every field without trusting the site, or even visiting it.

Here is what to look at, and what each field should say for a SolLock lock.

## Start from the lock's address

A lock is an account with an address of its own. You see it on the success screen, in the recovery note and on [My locks](/my-locks). Keep the address, not only the transaction signature: the signature finds the transaction that created the lock, the address finds the lock itself, today and in ten years.

Open the address on a block explorer such as [Solana Explorer](https://explorer.solana.com) or Solscan. Both decode stake accounts and show the fields below by name.

## Field by field

**Owner program.** The account must be owned by the Stake Program. That is what makes the lock a rule of the network rather than a promise by some other program.

**Lockup timestamp.** The unlock moment as a Unix time, which explorers usually show as a date as well. It should be the date you picked, at 00:00 UTC. Mind your own time zone when you compare.

**Lockup epoch.** 0 on a SolLock lock, so only the date counts.

**Custodian.** The one key that could lift the lock early. On a SolLock lock it is always the same [address without a key](/custodian). Any other custodian means SolLock did not make the lock, and somebody may be able to open it early.

**Withdraw authority.** The wallet that may take the Solana out once the date has passed: yours on your own lock, the recipient's on a gift. If you plan to withdraw with a certain wallet, this must be its address.

**Stake authority.** May delegate the balance and nothing more. It gives nobody the right to withdraw. On a SolLock lock it is the same wallet as the withdraw authority.

**Balance and delegation.** The balance is the amount you locked plus a rent deposit of about 0.0017 SOL, which comes back when you withdraw. The fee went to SolLock in the same transaction and is not in the account. The account should show no delegation: a SolLock lock is not staked.

## A SolLock lock at a glance

- Owner program: `Stake11111111111111111111111111111111111111`
- Lockup timestamp: your date, at 00:00 UTC
- Lockup epoch: 0
- Custodian: `EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav`
- Withdraw authority: your wallet, or the recipient's for a gift
- Stake authority: the same wallet
- Delegation: none
- Balance: your amount plus the rent deposit

## Check the transaction too

The success screen also links to the transaction that created the lock. On an explorer it shows the same parts the lock page decoded for you before you signed: creating the account, setting the lockup, the fee and a short label. [The FAQ](/faq) lists them.

## Keep your records

Save the address, the signature and the date, on paper as well. The recovery note from the success screen has all three and explains how to withdraw with any Solana tool. The lock does not depend on this website: if sollock.io were gone tomorrow, the account, its date and your key would be exactly where they are now.

For the protocol's definition of each field, see Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
