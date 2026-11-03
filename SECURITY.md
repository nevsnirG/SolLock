# Security

SolLock builds transactions that lock people's SOL for years, so we take reports seriously.

## Reporting a problem

Report it privately through GitHub: the **Security** tab of this repository → **Report a vulnerability**. Please don't open a public issue for it.

Most useful are problems that could let anyone:

- lift or shorten a lock early, or take SOL from one;
- make the page build or show a transaction other than the one the user sees (the builder, verifier and decoder in `packages/core`);
- get past the custodian check, or make a lock with another custodian look like a SolLock lock;
- use the Worker's RPC proxy to send transactions, read data it should not, or get around its rate limits;
- inject script into the site despite its Content Security Policy.

We aim to reply within a week. There is no bug bounty at the moment.

## What we will never do

SolLock never asks for a seed phrase or private key, never holds funds, and never signs for anyone. Anyone who asks you for those in SolLock's name is not us.
