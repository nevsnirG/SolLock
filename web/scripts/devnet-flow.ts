import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  type TransactionSendingSigner,
} from '@solana/kit';
import { address } from '@solana/kit';
import {
  type DecodedInstruction,
  decodeInstruction,
  describeLock,
  fetchLock,
  formatSol,
  HOUR,
  nowSeconds,
  roundTripMessage,
  TEST_LOCK_AMOUNT,
  utcMidnight,
  vatShare,
} from '@sollock/core';
import { type Draft, draftLock } from '../src/lib/draft.ts';
import { finishLock, prepareLock } from '../src/lib/lockFlow.ts';
import { signAndSend } from '../src/lib/signing.ts';
import type { SiteRpc } from '../src/lib/siteRpc.ts';
import { noteFactsFromLock, recoveryNote } from '../src/lib/recovery.ts';
import { dateInputValue } from '../src/lib/unlockDate.ts';
import { finishUnlock, prepareUnlock } from '../src/lib/unlockFlow.ts';

const { values: opts } = parseArgs({
  // pnpm passes a leading "--" through to the script.
  args: process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--')),
  options: {
    amount: { type: 'string' },
    days: { type: 'string' },
    gift: { type: 'string' },
    minutes: { type: 'string' },
    withdraw: { type: 'string' },
    proxy: { type: 'string', default: 'http://127.0.0.1:8791' },
  },
});

const keypair = (name: string) =>
  createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(new URL(`../../packages/core/.devnet/${name}.json`, import.meta.url), 'utf8'))));

const key = await keypair('wallet');
const fee = (await keypair('fee')).address;
// The proxy refuses requests without an allowed Origin.
const rpc = createSolanaRpc(`${opts.proxy}/api/rpc`, { headers: { origin: 'http://localhost:4331' } }) as unknown as SiteRpc;
const publicDevnet = createSolanaRpc(process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com');

// The proxy has no sendTransaction, so this stand-in broadcasts through its own RPC, as a real wallet does.
const wallet: TransactionSendingSigner = {
  address: key.address,
  async signAndSendTransactions(transactions) {
    return Promise.all(
      transactions.map(async (tx) => {
        const [signatures] = await key.signTransactions([tx]);
        const signed = { ...tx, signatures: { ...tx.signatures, ...signatures } };
        await publicDevnet.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
        return signatures![key.address]!;
      }),
    );
  },
};

if (opts.withdraw) {
  const lock = address(opts.withdraw);
  console.log(`Wallet:   ${key.address} (devnet throwaway)`);
  console.log('\n1. Preparing the withdraw: read the lock, test run, our own check');
  const prepared = await prepareUnlock('withdraw', lock, { rpc, signer: wallet });
  printInstructions(roundTripMessage(prepared.message).instructions.map((ix) => decodeInstruction(ix, { wallet: key.address })));
  console.log('\n2. Signing and sending (the stand-in wallet)');
  const signature = await signAndSend(prepared.message);
  console.log(`   ${signature}`);
  console.log('\n3. Waiting for the network, then reading the account again');
  const result = await finishUnlock(rpc, prepared, signature);
  console.log(`   Withdrawn ${formatSol(result.withdrawn)} SOL. The account is now: ${result.after.state}.`);
  process.exit(0);
}

const now = nowSeconds();
const test = !opts.amount;
const days = Number(opts.days ?? '2');
const until = new Date((Number(now) + days * 86_400) * 1000);
const draft = draftLock(
  {
    amountText: opts.amount ?? '0.01',
    wantsTestLock: test,
    choice: { kind: 'custom', date: dateInputValue(utcMidnight(until.getUTCFullYear(), until.getUTCMonth() + 1, until.getUTCDate())) },
    gift: Boolean(opts.gift),
    giftText: opts.gift ?? '',
  },
  { now, feeAddress: fee, wallet: key.address },
);
if (draft.problems.length) throw new Error(draft.problems.join(' '));

// Built as if now were two hours earlier, so a lock minutes away passes the builder's one-hour minimum.
let lockDraft: Draft = draft;
let builderNow = nowSeconds();
if (opts.minutes) {
  const unlockAt = now + BigInt(Math.round(Number(opts.minutes) * 60));
  builderNow = now - 7_200n;
  lockDraft = { ...draft, amount: TEST_LOCK_AMOUNT, unlockAt, testLock: true, fee: 0n, vat: vatShare(0n), gift: false, recipient: null, problems: [] };
}

console.log(`Wallet:   ${key.address} (devnet throwaway)`);
console.log(`Lock:     ${formatSol(lockDraft.amount!)} SOL ${lockDraft.testLock ? '(free test lock)' : `with a ${formatSol(lockDraft.fee)} SOL fee`}${opts.gift ? `, a gift to ${opts.gift}` : ''}${opts.minutes ? `, opening in ${opts.minutes} minutes` : ''}`);

console.log('\n1. Preparing: balance, free seed, test run, our own check');
// The shifted "now" is two hours behind the network's clock on purpose, so the clock check gets room for it.
const prepared = await prepareLock(lockDraft, {
  rpc,
  signer: wallet,
  feeAddress: fee,
  now: opts.minutes ? builderNow : nowSeconds(),
  clockTolerance: opts.minutes ? 3n * HOUR : undefined,
});
console.log(`   compute-unit limit set to ${prepared.plan.computeUnitLimit}`);
printInstructions(prepared.instructions);

console.log('\n2. Signing and sending (the stand-in wallet)');
const signature = await signAndSend(prepared.message);
console.log(`   ${signature}`);

console.log('\n3. Waiting for the network, then reading the lock back');
await finishLock(rpc, prepared, signature);
for (const line of describeLock(await fetchLock(rpc, prepared.plan.lockAddress))) console.log(`   ${line}`);

console.log('\n4. The recovery note\n');
console.log(recoveryNote(noteFactsFromLock({ plan: prepared.plan, signature, lockedAt: nowSeconds(), cluster: 'devnet' }), 'https://sollock.io'));

function printInstructions(instructions: DecodedInstruction[]) {
  for (const ix of instructions) {
    console.log(`   ${ix.program} / ${ix.name}`);
    for (const field of ix.fields) console.log(`      ${field.label.padEnd(22)} ${field.value}${field.note ? `  (${field.note})` : ''}`);
  }
}
