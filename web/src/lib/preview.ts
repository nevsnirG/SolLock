import { type Address, createNoopSigner } from '@solana/kit';
import { type DecodedField, type DecodedInstruction, decodeInstruction, type LockPlan, LockRequestError, planLock, type UnixSeconds } from '@sollock/core';
import { type Draft, isCompleteDraft, lockRequestFromDraft, PREVIEW_WALLET } from './draft.ts';

export interface PreviewContext {
  now: UnixSeconds;
  feeAddress: Address;
  rent: bigint;
  wallet?: Address | undefined;
  seedIndex?: number | undefined;
}

export interface LockPreview {
  plan: LockPlan;
  instructions: DecodedInstruction[];
  placeholder: boolean;
}

export async function previewLock(draft: Draft, ctx: PreviewContext): Promise<LockPreview | null> {
  if (!isCompleteDraft(draft)) return null;
  const placeholder = ctx.wallet === undefined;
  const wallet = ctx.wallet ?? PREVIEW_WALLET;
  const request = lockRequestFromDraft(draft, { funder: createNoopSigner(wallet), seedIndex: ctx.seedIndex ?? 0, rent: ctx.rent, feeAddress: ctx.feeAddress, now: ctx.now });

  let plan: LockPlan;
  try {
    plan = await planLock(request);
  } catch (error) {
    if (error instanceof LockRequestError) return null;
    throw error;
  }

  const decoded = plan.instructions.map((ix) => decodeInstruction(ix, { feeAddress: ctx.feeAddress, wallet }));
  const instructions = placeholder
    ? decoded.map((ix) => ({ ...ix, fields: ix.fields.map((field) => withPlaceholders(field, plan, ctx.seedIndex === undefined)) }))
    : decoded;
  return { plan, instructions, placeholder };
}

function withPlaceholders(field: DecodedField, plan: LockPlan, seedUnknown: boolean): DecodedField {
  if (field.value === PREVIEW_WALLET) return { label: field.label, value: 'your wallet', note: 'filled in when you connect' };
  if (field.value === plan.lockAddress) return { label: field.label, value: 'made from your wallet address and the seed' };
  if (field.label === 'seed' && seedUnknown) return { ...field, note: 'or the next free number for your wallet' };
  return field;
}
