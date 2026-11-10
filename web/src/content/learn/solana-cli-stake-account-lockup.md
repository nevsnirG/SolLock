---
title: "How to make a locked stake account with the Solana command line"
searchTitle: "Solana CLI: create a stake account with a lockup date"
description: "Lock Solana without any website: one create-stake-account command with a lockup date and a custodian. What each option does, and how to check the result."
published: 2026-11-10
order: 14
section: lock
related: [solana-stake-account-lockup, verify-solana-lock-on-chain, withdraw-solana-stake-account-after-lockup]
---

Everything SolLock does can be done without SolLock. The lockup is a feature of Solana's own Stake Program, and Solana's command-line tool creates a locked stake account in one command. This guide shows that command and what each part of it means.

It is written for people who already use the command line. If you have never opened a terminal, [the lock page](/lock) does the same thing with a wallet and a few clicks.

## What you need

- **The Solana command-line tool,** set to the network you mean. `solana config get` shows which one. Anza's documentation explains [how to install it](https://docs.anza.xyz/cli/install).
- **A funded keypair the tool can sign with:** a keypair file or a hardware wallet. A wallet app such as Phantom cannot sign for the command line, but the lock does not have to belong to the key that pays for it, as you will see below.
- **A first try on devnet.** Add `--url devnet` to every command and use test Solana until the result looks the way you expect.

## The command

```
solana-keygen new --no-passphrase -o lock-account.json

solana create-stake-account lock-account.json 5 \
    --lockup-date 2031-01-01T00:00:00Z \
    --custodian EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav \
    --stake-authority <YOUR ADDRESS> \
    --withdraw-authority <YOUR ADDRESS>
```

What each part does:

- **`lock-account.json`** is a new keypair whose only job is to give the account an address. Once the account exists the keypair has no say over it, and you can delete the file. Write down the address it printed: that is the address of your lock.
- **`5`** is the amount that goes into the account, in SOL. It includes the deposit of about 0.0017 SOL that every stake account holds, and all of it comes back when you withdraw. [The rent deposit on a Solana lock, explained](/learn/solana-rent-deposit) has the details.
- **`--lockup-date`** is the moment the lock opens, written as a date and time with a time zone. The `Z` means UTC.
- **`--custodian`** names the one address whose signature could lift the lock early or move the date. The address above is the one every SolLock lock uses: 32 bytes that are not a point on the curve wallets use, so no key for it can exist. [The custodian page](/custodian) shows how it is made and lets you redo the calculation. Anyone may use it, and using it involves SolLock in no way. If you name an address of your own here, the lock is only as firm as your resolve not to use that key. If you leave the option out, the tool fills in a default address for you. Naming an address you have checked keeps the choice in plain sight.
- **`--stake-authority` and `--withdraw-authority`** say who may delegate the account, and who may take the Solana out on the date. This can be the address of the wallet app you use every day, a hardware wallet, or someone else's wallet if the lock is a gift. Check it three times. While the lockup is in force the withdraw authority cannot be changed without the custodian, so a wrong address here is final.

There is no `--lockup-epoch` in the command. It stays at 0, so only the date counts.

The Solana is paid from the tool's default keypair. `--from <KEYPAIR>` names another one, and `--fee-payer <KEYPAIR>` says who pays the network fee.

## Check what you made

```
solana stake-account <LOCK ADDRESS>
```

The lines that matter:

```
Balance: 5 SOL
Stake account is undelegated
Withdraw Authority: <YOUR ADDRESS>
Lockup Timestamp: 2031-01-01T00:00:00Z
Lockup Custodian: EcS8zEEa4dZinCCRWDotMqVqQB1PrHjdnuSeEUBGoZav
```

Compare the date, the withdraw authority and the custodian with what you intended, character by character. A block explorer shows the same fields: [How to check a Solana lock on the blockchain](/learn/verify-solana-lock-on-chain) says where to look.

With that custodian and your own wallet as the withdraw authority, the lock also shows up on [My locks](/my-locks) when you connect the wallet, like any lock made on this site.

## On the date

```
solana withdraw-stake <LOCK ADDRESS> <YOUR ADDRESS> ALL --withdraw-authority <KEYPAIR>
```

`ALL` takes the whole balance and closes the account. If the withdraw authority is a wallet app, withdraw there or on My locks instead. [How to withdraw from a Solana stake account after the lockup ends](/learn/withdraw-solana-stake-account-after-lockup) covers both ways.

## What the command line leaves to you

- **The checks.** The lock page tests the recipient's address, shows the transaction in plain words before you sign, and reads the lock back from the network before it says it is done. Here those checks are yours to do, with the command above.
- **The record.** Nothing hands you a recovery note. Write one yourself: the lock's address, the date, the withdraw authority and the custodian, kept with your important papers.
- **The cost** is the network fee and nothing else. SolLock's fee pays for the checks and the convenience. The lock itself is the same either way.
- **The same finality.** Before the date nobody can open this lock, you included, whatever happens. Start with a small amount, and lock only Solana you can leave alone for the whole time.

Anza's [command-line examples](https://docs.anza.xyz/cli/examples/delegate-stake) show the tool's other stake commands, and Solana's [stake account reference](https://solana.com/docs/references/staking/stake-accounts) describes the lockup itself.
