---
title: "How to withdraw from a Solana stake account after the lockup ends"
searchTitle: "How to withdraw from a Solana stake account after a lockup"
description: "What to do on the unlock date: withdraw on My locks in one step, or with any Solana tool that handles stake accounts. The deposit comes back with it."
published: 2026-11-09
updated: 2026-11-10
order: 13
section: lock
related: [how-to-lock-solana, solana-rent-deposit, verify-solana-lock-on-chain]
---

On the unlock date nothing moves by itself. The Solana waits in the lock account until the wallet that owns it asks for it, today or in ten years. This guide covers that step, with SolLock and without it, and the few things that can get in the way.

## When the lock opens

A SolLock lock opens at 00:00 UTC on the date you picked. Mind your own time zone: in Amsterdam that is 01:00 or 02:00 in the morning. The network's own clock can run a minute or two behind, so a withdrawal right at that moment may need a short wait.

Until then the network refuses every withdrawal, whoever asks. [Can you unlock Solana early?](/learn/can-you-unlock-solana-early) explains why there is no exception.

## What you need

- **The wallet that owns the lock.** The account names one address that may withdraw, the withdraw authority: your wallet, or the recipient's for a gift. No other key works, including the key that paid for the lock if that was someone else.
- **The lock's address.** It is on the recovery note and in the transaction that made the lock. [My locks](/my-locks) finds your locks from your wallet alone, so you can do without it there.

## On My locks

Connect the wallet, and the page lists every lock that wallet can withdraw, read straight from the blockchain. Once the date has passed, each one shows a Withdraw button.

Withdraw sends one transaction, which your wallet shows you before you approve it. It takes out the whole balance: the amount you locked plus the rent deposit, about 0.0017 SOL, which closes the account. The Solana lands in the same wallet, and the lock is gone from the list.

## With any other tool

The lock does not depend on this website. It is a regular stake account, so anything that can withdraw from a stake account works, signed by the wallet above.

With the Solana command-line tool, the recovery note's command is:

```
solana withdraw-stake <lock address> <your address> ALL --withdraw-authority <your keypair>
```

`ALL` takes the full balance and closes the account. Anza's [command-line examples](https://docs.anza.xyz/cli/examples/delegate-stake) show the tool's other stake commands. The command that makes a lock is in [How to make a locked stake account with the Solana command line](/learn/solana-cli-stake-account-lockup).

Wallet apps with a staking view list stake accounts too, and several can withdraw from one that is not delegated. If yours shows the lock but no way to take the Solana out, the command-line tool does the job.

## If the lock is staked

A SolLock lock is not staked, so this only applies to a lock made elsewhere, or one you delegated yourself through another tool. A staked account must be deactivated first. Deactivation takes effect at the end of the current epoch, about a day away at most in November 2026, and then the withdrawal goes through. [Is staked SOL locked? How long unstaking takes](/learn/solana-unstaking-period) explains the wait. On My locks the button says Deactivate while that is the case, and Withdraw once the network has finished cooling it down.

## If a withdrawal is refused

Four things cause nearly every refusal:

1. **The wrong wallet.** Only the withdraw authority can sign. Compare the address on a block explorer with the wallet you connected.
2. **The date has not passed yet**, in UTC.
3. **An epoch in the lockup.** A SolLock lock has epoch 0, so only the date counts. A lock made elsewhere can also wait for a network epoch, and then stays shut until the network reaches it.
4. **The account is still staked**, or cooling down.

[How to check a Solana lock on the blockchain](/learn/verify-solana-lock-on-chain) shows where each of these fields is.

## If the key is lost

Then there is nothing to do. The lock opens on the date, for nobody. Neither SolLock nor anyone else can withdraw it, which is exactly what makes it a lock. Back up the wallet's recovery phrase before you lock anything, and try the whole thing first with a [free test lock](/lock?test), which opens after about a day.

For the protocol's rules on withdrawing from a stake account, see Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts).
