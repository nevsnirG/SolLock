/**
 * Create a real lock on devnet with the lock core, and read it back. Devnet only.
 *
 *   pnpm --filter @sollock/core devnet:lock                       free test lock: 0.01 SOL, 24 hours
 *   pnpm --filter @sollock/core devnet:lock -- --amount 0.5 --until 2026-11-02T12:00:00Z
 *   pnpm --filter @sollock/core devnet:lock -- --gift <address> --amount 0.05 --until 2028-01-01
 *   pnpm --filter @sollock/core devnet:lock -- read <lock address>
 *   pnpm --filter @sollock/core devnet:lock -- withdraw <lock address>
 *
 * The script keeps a throwaway devnet wallet and fee address in packages/core/.devnet/ (never
 * committed). The site itself never holds keys: in the browser, the user's wallet signs.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  type Instruction,
  type KeyPairSigner,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';
import {
  decodeInstruction,
  describeLock,
  fetchLock,
  fetchLockRent,
  findFreeSeed,
  formatSol,
  formatUtc,
  isTestLock,
  lockFee,
  lockTransactionMessage,
  nowSeconds,
  parseSol,
  planLock,
  roundTripMessage,
  TEST_LOCK_AMOUNT,
  testLockUnlockAt,
  verifyLockMessage,
  withdrawAllInstruction,
} from '../src/index.ts';

const RPC_URL = process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com';
const WS_URL = process.env.DEVNET_WS ?? RPC_URL.replace(/^http/, 'ws');
if (/mainnet/i.test(RPC_URL)) throw new Error('This script is for devnet only.');

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
const dir = new URL('../.devnet/', import.meta.url);
const explorer = (kind: 'address' | 'tx', id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

/** A keypair in the Solana CLI's JSON format, so it can be imported elsewhere if needed. */
async function devnetKeypair(name: string): Promise<KeyPairSigner> {
  const file = new URL(`${name}.json`, dir);
  if (!existsSync(file)) {
    await mkdir(dir, { recursive: true });
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const bytes = new Uint8Array([...secret, ...ed25519.getPublicKey(secret)]);
    await writeFile(file, JSON.stringify([...bytes]), { mode: 0o600 });
  }
  return createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(await readFile(file, 'utf8'))));
}

async function ensureFunds(wallet: Address, needed: bigint) {
  const { value } = await rpc.getBalance(wallet).send();
  if (value >= needed) return;
  console.log(`Wallet has ${formatSol(value)} SOL; asking the devnet faucet for 1 SOL...`);
  try {
    const signature = await rpc.requestAirdrop(wallet, lamports(1_000_000_000n)).send();
    for (let i = 0; i < 30; i++) {
      const { value: [status] } = await rpc.getSignatureStatuses([signature]).send();
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
      await new Promise((r) => setTimeout(r, 1_000));
    }
  } catch (e) {
    console.log(`The faucet said no: ${(e as Error).message}`);
  }
  const { value: after } = await rpc.getBalance(wallet).send();
  if (after < needed) {
    console.log(`\nFund this devnet wallet with at least ${formatSol(needed)} SOL, then run again:`);
    console.log(`  ${wallet}`);
    console.log('  https://faucet.solana.com (choose devnet)');
    process.exit(1);
  }
}

async function send(payer: KeyPairSigner, instructions: readonly Instruction[]) {
  const { value: lifetime } = await rpc.getLatestBlockhash().send();
  const signed = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  assertIsTransactionWithBlockhashLifetime(signed);
  await sendAndConfirm(signed, { commitment: 'confirmed' });
  return getSignatureFromTransaction(signed);
}

async function read(lock: Address) {
  const view = await fetchLock(rpc, lock);
  console.log(`\nRead back from devnet (${lock}):`);
  for (const line of describeLock(view)) console.log(`  ${line}`);
  console.log(`  ${explorer('address', lock)}`);
  return view;
}

async function createLock(opts: { amount?: string; until?: string; gift?: string }) {
  const wallet = await devnetKeypair('wallet');
  const fee = await devnetKeypair('fee');
  const now = nowSeconds();
  const amount = opts.amount ? parseSol(opts.amount) : TEST_LOCK_AMOUNT;
  const unlockAt = opts.until ? BigInt(Math.floor(Date.parse(opts.until) / 1000)) : testLockUnlockAt(now);
  if (opts.until && Number.isNaN(Date.parse(opts.until))) throw new Error(`Can't read the date "${opts.until}".`);

  console.log(`Devnet wallet:  ${wallet.address}`);
  console.log(`Fee address:    ${fee.address} (devnet throwaway)`);

  const rent = await fetchLockRent(rpc);
  // Amount, rent deposit, our fee and a little for network fees.
  await ensureFunds(wallet.address, amount + rent + lockFee(amount, isTestLock(amount, unlockAt, now)) + parseSol('0.001'));
  const seed = await findFreeSeed(rpc, wallet.address);
  const request = {
    funder: wallet,
    recipient: opts.gift ? address(opts.gift) : undefined,
    amount,
    unlockAt,
    seedIndex: seed.index,
    rent,
    feeAddress: fee.address,
    now,
  };

  // Simulate a draft to size the compute-unit limit, as the site will.
  const draft = await planLock(request);
  const { value: lifetime } = await rpc.getLatestBlockhash().send();
  const draftTx = await signTransactionMessageWithSigners(lockTransactionMessage(draft, lifetime));
  const sim = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(draftTx), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true })
    .send();
  if (sim.value.err) throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}\n${sim.value.logs?.join('\n')}`);
  const used = Number(sim.value.unitsConsumed ?? 0n);
  const plan = await planLock({ ...request, computeUnitLimit: Math.ceil(used * 1.2) + 1_000 });

  // Verify and show exactly what will be signed: the compiled bytes, read back.
  const message = lockTransactionMessage(plan, lifetime);
  const readBack = roundTripMessage(message);
  const problems = await verifyLockMessage(readBack, plan.expectation);
  if (problems.length) throw new Error(`Refusing to sign:\n  ${problems.join('\n  ')}`);

  console.log(`\n${plan.testLock ? 'Free test lock' : plan.gift ? 'Gift lock' : 'Lock'}: ${formatSol(amount)} SOL until ${formatUtc(unlockAt)}`);
  console.log(`Lock address:   ${plan.lockAddress} (seed "${plan.seed}")`);
  console.log(`Leaves wallet:  ${formatSol(plan.total)} SOL (amount, ${formatSol(rent)} rent deposit, ${formatSol(plan.fee)} fee) plus the network fee`);
  console.log(`Simulated:      ${used} compute units, limit ${plan.computeUnitLimit}`);
  console.log('\nInstructions:');
  readBack.instructions.forEach((ix, i) => {
    const d = decodeInstruction(ix, { feeAddress: fee.address, wallet: wallet.address });
    console.log(`  #${i + 1} ${d.program}: ${d.name}. ${d.why}`);
    for (const f of d.fields) console.log(`       ${f.label}: ${f.value}${f.note ? `  (${f.note})` : ''}`);
  });

  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  await sendAndConfirm(signed, { commitment: 'confirmed' });
  const signature = getSignatureFromTransaction(signed);
  console.log(`\nConfirmed: ${explorer('tx', signature)}`);

  const view = await read(plan.lockAddress);
  const ok =
    view.state === 'initialized' &&
    view.unlockAt === unlockAt &&
    view.lockupEpoch === 0n &&
    view.custodianIsNobody === true &&
    view.withdrawer === plan.withdrawer &&
    view.staker === plan.withdrawer &&
    view.lockedAmount === amount &&
    view.lockedNow === true;
  console.log(ok ? '\nRead-back matches the request field by field.' : '\nREAD-BACK DOES NOT MATCH THE REQUEST.');
  if (!ok) process.exit(1);
  if (plan.testLock) {
    console.log(`\nWithdraw it after ${formatUtc(unlockAt)} with:\n  pnpm --filter @sollock/core devnet:lock -- withdraw ${plan.lockAddress}`);
  }
}

async function withdraw(lock: Address) {
  const wallet = await devnetKeypair('wallet');
  const view = await read(lock);
  if (!view.canWithdraw) {
    console.log(view.lockedNow ? '\nStill locked. Try again after the date.' : '\nNot withdrawable yet.');
    process.exit(1);
  }
  const signature = await send(wallet, [withdrawAllInstruction(view, wallet, wallet.address)]);
  console.log(`\nWithdrew ${formatSol(view.lamports)} SOL to ${wallet.address}: ${explorer('tx', signature)}`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { amount: { type: 'string' }, until: { type: 'string' }, gift: { type: 'string' } },
});
const [command, target] = positionals;
try {
  if (command === 'read' && target) await read(address(target));
  else if (command === 'withdraw' && target) await withdraw(address(target));
  else if (command === undefined) await createLock(values);
  else throw new Error('Usage: devnet-lock [--amount <SOL>] [--until <date>] [--gift <address>] | read <address> | withdraw <address>');
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
}
process.exit(0);
