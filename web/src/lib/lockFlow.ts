import type { Address, Signature, TransactionSendingSigner } from '@solana/kit';
import {
  type DecodedInstruction,
  decodeInstruction,
  fetchGiftAccount,
  fetchLock,
  fetchLockRent,
  findFreeSeed,
  formatSol,
  giftAccountProblem,
  type LockPlan,
  LockRequestError,
  lockTransactionMessage,
  type LockView,
  nowSeconds,
  planLock,
  roundTripMessage,
  type UnixSeconds,
  verifyLockAccount,
  verifyLockMessage,
} from '@sollock/core';
import { walletOutflow } from './costs.ts';
import { type CompleteDraft, type Draft, isCompleteDraft, lockRequestFromDraft } from './draft.ts';
import { computeUnitLimit, FlowError, type PollOptions, sleep, testRun, waitForConfirmation } from './signing.ts';
import type { SiteRpc } from './siteRpc.ts';

export interface PreparedLock {
  plan: LockPlan;
  message: ReturnType<typeof lockTransactionMessage>;
  instructions: DecodedInstruction[];
  lastValidBlockHeight: bigint;
}

export interface LockResult {
  plan: LockPlan;
  signature: Signature;
  lockedAt: UnixSeconds;
}

interface PrepareContext {
  rpc: SiteRpc;
  signer: TransactionSendingSigner;
  feeAddress: Address;
  now: UnixSeconds;
  shown?: { rent: bigint; total: bigint } | undefined;
}

export async function prepareLock(draft: Draft, ctx: PrepareContext): Promise<PreparedLock> {
  if (!isCompleteDraft(draft)) throw new FlowError(draft.problems[0] ?? 'The form is not complete.');
  const { rpc, signer } = ctx;
  const [rent, seed, balance] = await Promise.all([
    fetchLockRent(rpc),
    findFreeSeed(rpc, signer.address),
    rpc.getBalance(signer.address, { commitment: 'confirmed' }).send(),
    checkRecipient(rpc, draft),
  ]);

  const request = lockRequestFromDraft(draft, { funder: signer, seedIndex: seed.index, rent, feeAddress: ctx.feeAddress, now: ctx.now });
  const trialPlan = await asFlowError(planLock(request));
  assertCostUnchanged(trialPlan, ctx.shown);
  assertCanAfford(trialPlan, balance.value);

  const { value: lifetime } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const simulation = await testRun(rpc, lockTransactionMessage(trialPlan, lifetime), 'this lock');
  const plan = await asFlowError(planLock({ ...request, computeUnitLimit: computeUnitLimit(simulation.unitsConsumed) }));
  const message = lockTransactionMessage(plan, lifetime);
  const instructions = await verifiedInstructions(message, plan, ctx.feeAddress);
  return { plan, message, instructions, lastValidBlockHeight: lifetime.lastValidBlockHeight };
}

async function checkRecipient(rpc: SiteRpc, draft: CompleteDraft): Promise<void> {
  if (!draft.gift || !draft.recipient) return;
  const account = await fetchGiftAccount(rpc, draft.recipient).catch(() => {
    throw new FlowError("We couldn't check the recipient's address on the network, so nothing was sent. Try again.");
  });
  const problem = giftAccountProblem(account);
  if (problem) throw new FlowError(problem);
}

function assertCostUnchanged(plan: LockPlan, shown: PrepareContext['shown']) {
  if (!shown || (plan.rent === shown.rent && plan.total === shown.total)) return;
  throw new FlowError(
    `The cost changed since the preview: ${formatSol(plan.total)} SOL would leave your wallet instead of ${formatSol(shown.total)} SOL. Check it and confirm again.`,
  );
}

function assertCanAfford(plan: LockPlan, balance: bigint) {
  const needed = walletOutflow(plan);
  if (balance >= needed) return;
  throw new FlowError(`Your wallet has ${formatSol(balance)} SOL. This lock needs ${formatSol(needed)} SOL, including the rent deposit and fees.`);
}

/** Verifies and decodes the compiled bytes, not the plan, so the page shows exactly what the wallet signs. */
async function verifiedInstructions(message: PreparedLock['message'], plan: LockPlan, feeAddress: Address): Promise<DecodedInstruction[]> {
  const compiled = roundTripMessage(message);
  const problems = await verifyLockMessage(compiled, plan.expectation);
  if (problems.length > 0) throw new FlowError(`The transaction failed our own check, so nothing was sent. ${problems.join(' ')}`);
  const instructions = compiled.instructions.map((ix) => decodeInstruction(ix, { feeAddress, wallet: plan.funder }));
  if (instructions.some((ix) => ix.unknown)) throw new FlowError('The transaction contains something we do not recognise, so nothing was sent.');
  return instructions;
}

async function asFlowError<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof LockRequestError) throw new FlowError(error.message);
    throw error;
  }
}

const READ_BACK_TRIES = 4;

export async function readBackLock(
  rpc: SiteRpc,
  plan: LockPlan,
  { tries = READ_BACK_TRIES, intervalMs = 1_500, wait = sleep }: PollOptions = {},
): Promise<LockView | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await wait(intervalMs);
    const view = await fetchLock(rpc, plan.lockAddress);
    if (view.state === 'missing') continue;
    const problems = verifyLockAccount(view, { withdrawer: plan.withdrawer, amount: plan.amount, unlockAt: plan.unlockAt });
    if (problems.length > 0) throw new FlowError(`The lock on the network is not what we built. ${problems.join(' ')}`);
    return view;
  }
  return null;
}

/** The lock account has the last word: a transaction that looked expired but landed still counts. */
export async function finishLock(rpc: SiteRpc, prepared: PreparedLock, signature: Signature, options: PollOptions = {}): Promise<LockResult> {
  const outcome = await waitForConfirmation(rpc, signature, prepared.lastValidBlockHeight, options);
  const view = await readBackLock(rpc, prepared.plan, { ...options, tries: outcome === 'confirmed' ? READ_BACK_TRIES : 1 });
  if (view) return { plan: prepared.plan, signature, lockedAt: nowSeconds() };
  if (outcome === 'expired') {
    throw new FlowError('The transaction expired before the network accepted it. Nothing was locked and nothing left your wallet. Try again.');
  }
  throw new FlowError('The network confirmed the transaction, but the lock does not show yet. Look for it on My locks in a minute.');
}
