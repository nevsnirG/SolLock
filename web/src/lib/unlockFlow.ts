import type { Address, Instruction, Signature, TransactionSendingSigner } from '@solana/kit';
import {
  deactivateInstruction,
  fetchLock,
  formatSol,
  type LockView,
  roundTripMessage,
  type UnlockAction,
  unlockTransactionMessage,
  verifyUnlockMessage,
  withdrawAllInstruction,
} from '@sollock/core';
import { unlockLabel } from './dates.ts';
import { computeUnitLimit, FlowError, type PollOptions, sleep, TestRunError, testRun, waitForConfirmation } from './signing.ts';
import type { SiteRpc } from './siteRpc.ts';

export interface PreparedUnlock {
  action: UnlockAction;
  /** The lock as read just before preparing. */
  view: LockView;
  message: ReturnType<typeof unlockTransactionMessage>;
  lastValidBlockHeight: bigint;
}

/**
 * Builds a withdraw (everything, back to the wallet) or a deactivate for a lock, read fresh from the
 * network, and checks it the same way as a lock: a test run, then our own check on the compiled bytes.
 */
export async function prepareUnlock(action: UnlockAction, lock: Address, { rpc, signer }: { rpc: SiteRpc; signer: TransactionSendingSigner }): Promise<PreparedUnlock> {
  const view = await fetchLock(rpc, lock);
  const instruction = unlockInstruction(action, view, signer);
  const { value: lifetime } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const simulation = await simulateUnlock(rpc, action, unlockTransactionMessage(instruction, signer, lifetime));
  const message = unlockTransactionMessage(instruction, signer, lifetime, computeUnitLimit(simulation.unitsConsumed));

  const problems = verifyUnlockMessage(roundTripMessage(message), { action, lock, wallet: signer.address, lamports: view.lamports });
  if (problems.length > 0) throw new FlowError(`The transaction failed our own check, so nothing was sent. ${problems.join(' ')}`);
  return { action, view, message, lastValidBlockHeight: lifetime.lastValidBlockHeight };
}

function unlockInstruction(action: UnlockAction, view: LockView, signer: TransactionSendingSigner): Instruction {
  if (view.state === 'missing') throw new FlowError('There is nothing at this address any more. It may have been withdrawn already.');
  if (action === 'deactivate') {
    if (view.staker !== signer.address) throw new FlowError('Only the wallet that staked this lock can deactivate it.');
    if (!view.mustDeactivate) throw new FlowError('This lock is not staked.');
    return deactivateInstruction(view, signer);
  }
  if (view.withdrawer !== signer.address) throw new FlowError('Only the wallet that can withdraw this lock can do this. Connect that wallet.');
  if (!view.canWithdraw) {
    throw new FlowError(view.lockedNow && view.unlockAt !== undefined ? `It is still locked until ${unlockLabel(view.unlockAt)}.` : 'It cannot be withdrawn yet.');
  }
  return withdrawAllInstruction(view, signer, signer.address);
}

async function simulateUnlock(rpc: SiteRpc, action: UnlockAction, message: Parameters<typeof testRun>[1]) {
  try {
    return await testRun(rpc, message, action === 'withdraw' ? 'this withdrawal' : 'this deactivation');
  } catch (error) {
    if (action === 'withdraw' && error instanceof TestRunError && isLockupInForce(error.networkError)) {
      throw new FlowError("The network's clock has not reached the unlock time yet. It can run a little behind; try again in a few minutes.", error.logs);
    }
    throw error;
  }
}

/** Stake program error 1 is LockupInForce: the network's clock has not reached the date yet. */
const LOCKUP_IN_FORCE = 1;

function isLockupInForce(networkError: unknown): boolean {
  const failure = (networkError as { InstructionError?: [unknown, { Custom?: number | bigint }] } | null)?.InstructionError?.[1];
  return failure?.Custom !== undefined && Number(failure.Custom) === LOCKUP_IN_FORCE;
}

export interface UnlockResult {
  action: UnlockAction;
  signature: Signature;
  /** For a withdraw: what came back to the wallet, rent deposit included. */
  withdrawn: bigint;
  /** The account afterwards: 'missing' once a withdraw has closed it. */
  after: LockView;
}

/** Waits for the network, then reads the account again until the withdraw or deactivate shows. */
export async function finishUnlock(rpc: SiteRpc, prepared: PreparedUnlock, signature: Signature, options: PollOptions = {}): Promise<UnlockResult> {
  const outcome = await waitForConfirmation(rpc, signature, prepared.lastValidBlockHeight, options);
  const { tries = outcome === 'confirmed' ? 4 : 1, intervalMs = 1_500, wait = sleep } = options;
  let after = prepared.view;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await wait(intervalMs);
    after = await fetchLock(rpc, prepared.view.address);
    const effect = unlockEffect(prepared, after);
    if (effect) return { action: prepared.action, signature, withdrawn: effect.withdrawn, after };
  }
  throw new FlowError(
    outcome === 'expired'
      ? 'The transaction expired before the network accepted it. Nothing changed. Try again.'
      : `The network confirmed it, but the lock still holds ${formatSol(after.lamports)} SOL. Reload in a minute.`,
  );
}

/** What the withdraw or deactivate changed on the account, or null while nothing shows yet. */
function unlockEffect(prepared: PreparedUnlock, after: LockView): { withdrawn: bigint } | null {
  if (prepared.action === 'deactivate') return after.delegation?.deactivationEpoch != null ? { withdrawn: 0n } : null;
  const before = prepared.view.lamports;
  if (after.state === 'missing') return { withdrawn: before };
  return after.lamports < before ? { withdrawn: before - after.lamports } : null;
}

/** Whether a withdraw or deactivate reached the network, for a wallet that reported an error. */
export async function unlockLanded(rpc: SiteRpc, prepared: PreparedUnlock): Promise<boolean> {
  return unlockEffect(prepared, await fetchLock(rpc, prepared.view.address)) !== null;
}
