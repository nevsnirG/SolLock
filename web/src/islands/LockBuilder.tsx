import { accountExists, nowSeconds } from '@sollock/core';
import { type RefObject, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { FEE_ADDRESS } from '../config.ts';
import { type Confirmations, NO_CONFIRMATIONS, signBlockers, termsKey } from '../lib/confirm.ts';
import { type Draft, type DraftInput, draftLock, EMPTY_INPUT, withNetworkGiftProblem } from '../lib/draft.ts';
import { finishLock, type LockResult, type PreparedLock, prepareLock } from '../lib/lockFlow.ts';
import type { LockPreview } from '../lib/preview.ts';
import { isBusy, runSigning, type SigningPhase, signAndSend } from '../lib/signing.ts';
import { assertServerCluster, siteRpc } from '../lib/siteRpc.ts';
import { problemShownInline, type Step, startFromQuery, stepAfter, stepBefore, stepProblem, stepsFor } from '../lib/steps.ts';
import { AmountStep } from './AmountStep.tsx';
import { ConfirmStep } from './ConfirmStep.tsx';
import { DateStep } from './DateStep.tsx';
import { useBalance, useCurrency, useFreeSeed, useGiftCheck, useLockPreview, useNow, usePrice, useRent } from './hooks.ts';
import { StepNav, StepProgress } from './StepNavigation.tsx';
import { Success } from './Success.tsx';
import { type SiteWallet, useSiteWallet, WalletChrome, WalletProvider } from './wallet.tsx';
import { WhoStep } from './WhoStep.tsx';

export default function LockBuilderIsland() {
  return (
    <WalletProvider>
      <LockBuilder />
    </WalletProvider>
  );
}

/**
 * One question per screen: amount, date, who, then the lock in plain words with the safeguards and
 * the sign button. The browser's back button goes back a step. After signing, the success screen.
 */
function LockBuilder() {
  const builder = useLockBuilder();
  const { wallet, balance, signing, input, draft, step, goToStep, flowRef } = builder;
  const busy = isBusy(signing.phase);
  const back = stepBefore(step, input.wantsTestLock);
  const problem = stepProblem(step, draft);
  return (
    <>
      <WalletChrome wallet={wallet} balance={balance} pickerOpen={builder.pickerOpen} onPickerOpen={builder.setPickerOpen} />
      {signing.result ? (
        <Success result={signing.result} price={builder.price} onAnother={builder.startAnotherLock} />
      ) : (
        <div className="flow" ref={flowRef}>
          <StepProgress steps={stepsFor(input.wantsTestLock)} current={step} onGo={goToStep} disabled={busy} />
          <div className="flow-card">
            <CurrentStep builder={builder} />
          </div>
          <StepNav
            onBack={back ? () => goToStep(back) : null}
            onContinue={step === 'confirm' ? null : () => goToStep(stepAfter(step, input.wantsTestLock))}
            canContinue={problem === null}
            problem={problemShownInline(step, input) ? null : problem}
            busy={busy}
          />
        </div>
      )}
    </>
  );
}

function CurrentStep({ builder }: { builder: ReturnType<typeof useLockBuilder> }) {
  const { step, input, draft, patchInput, now, wallet, balance, rent } = builder;
  switch (step) {
    case 'amount':
      return (
        <AmountStep
          input={input}
          draft={draft}
          price={builder.price}
          currency={builder.currency}
          balance={wallet.status === 'connected' ? balance : null}
          rent={rent.lamports}
          onChange={patchInput}
          onCurrency={builder.setCurrency}
          onToggleTestLock={() => patchInput({ wantsTestLock: !input.wantsTestLock })}
          showBuy={builder.showBuy}
        />
      );
    case 'date':
      return <DateStep input={input} draft={draft} now={now} onChange={patchInput} />;
    case 'who':
      return <WhoStep input={input} draft={draft} giftWarnings={builder.giftWarnings} onChange={patchInput} />;
    case 'confirm':
      return (
        <ConfirmStep
          draft={draft}
          preview={builder.preview}
          rent={rent}
          price={builder.price}
          confirmations={builder.confirmations}
          onConfirmations={builder.updateConfirmations}
          onEdit={builder.goToStep}
          wallet={wallet}
          phase={builder.signing.phase}
          onConnect={() => builder.setPickerOpen(true)}
          onSign={() => void builder.signing.sign()}
        />
      );
  }
}

function useLockBuilder() {
  const { now, refresh: refreshNow } = useNow();
  const rent = useRent();
  const wallet = useSiteWallet();
  const [locksMade, setLocksMade] = useState(0);
  const { balance, refresh: refreshBalance } = useBalance(wallet.address);
  const seedIndex = useFreeSeed(wallet.address, locksMade);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currency, setCurrency] = useCurrency();
  const price = usePrice(currency);

  const [start] = useState(() => startFromQuery(window.location.search));
  const [input, setInput] = useState<DraftInput>(start.input);
  const walletAddress = wallet.address ?? undefined;
  const ownDraft = useMemo(() => draftLock(input, { now, feeAddress: FEE_ADDRESS, wallet: walletAddress }), [input, now, walletAddress]);
  const giftCheck = useGiftCheck(ownDraft.gift ? ownDraft.recipient : null);
  const draft = useMemo(() => withNetworkGiftProblem(ownDraft, giftCheck.problem), [ownDraft, giftCheck.problem]);
  const preview = useLockPreview(draft, { now, feeAddress: FEE_ADDRESS, rent: rent.lamports, wallet: walletAddress, seedIndex });
  const { confirmations, updateConfirmations, resetConfirmations } = useConfirmations(termsKey(draft));
  const onLocked = () => {
    setLocksMade((count) => count + 1);
    refreshBalance();
  };
  const signing = useLockSigning({ wallet, input, draft, preview, confirmations, resetConfirmations, onTimeMoved: refreshNow, onLocked });

  const steps = stepsFor(input.wantsTestLock);
  const canEnter = (target: Step) => steps.slice(0, Math.max(0, steps.indexOf(target))).every((step) => stepProblem(step, draft) === null);
  const { step, goToStep, flowRef } = useStepHistory(start.step, canEnter, isBusy(signing.phase));
  useSuccessView(signing.result !== null);

  const patchInput = (next: Partial<DraftInput>) => {
    setInput((previous) => ({ ...previous, ...next }));
    signing.clearError();
  };
  const startAnotherLock = () => {
    signing.reset();
    setInput(EMPTY_INPUT);
    goToStep('amount');
  };
  return {
    now,
    rent,
    wallet,
    balance,
    pickerOpen,
    setPickerOpen,
    currency,
    setCurrency,
    price,
    input,
    draft,
    patchInput,
    giftWarnings: giftCheck.warnings,
    preview,
    confirmations,
    updateConfirmations,
    signing,
    step,
    goToStep,
    flowRef,
    startAnotherLock,
    showBuy: start.showBuy,
  };
}

/** Each step is a browser history entry, so the back button goes back a question. */
function useStepHistory(initial: Step, canEnter: (step: Step) => boolean, locked: boolean) {
  const [step, setStep] = useState(initial);
  const flowRef = useRef<HTMLDivElement>(null);
  const goToStep = useCallback((target: Step) => {
    setStep(target);
    window.history.pushState({ lockStep: target }, '');
  }, []);
  const onPopState = useEffectEvent((event: PopStateEvent) => {
    const target = (event.state as { lockStep?: Step } | null)?.lockStep;
    if (target && !locked && canEnter(target)) setStep(target);
  });
  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), lockStep: initial }, '');
    const listener = (event: PopStateEvent) => onPopState(event);
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  useFocusQuestionOnChange(flowRef, step);
  return { step, goToStep, flowRef };
}

/** A new step starts at its question, for eyes and screen readers alike. */
function useFocusQuestionOnChange(flowRef: RefObject<HTMLDivElement | null>, step: Step) {
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    flowRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    flowRef.current?.querySelector<HTMLElement>('.step-q')?.focus({ preventScroll: true });
  }, [step]);
}

/** Ticks and the typed LOCK, cleared whenever the amount, date or recipient changes. */
function useConfirmations(terms: string) {
  const [confirmations, setConfirmations] = useState<Confirmations>(NO_CONFIRMATIONS);
  const [confirmedTerms, setConfirmedTerms] = useState(terms);
  if (confirmedTerms !== terms) {
    setConfirmedTerms(terms);
    setConfirmations(NO_CONFIRMATIONS);
  }
  const updateConfirmations = useCallback((next: Partial<Confirmations>) => setConfirmations((previous) => ({ ...previous, ...next })), []);
  const resetConfirmations = useCallback(() => setConfirmations(NO_CONFIRMATIONS), []);
  return { confirmations, updateConfirmations, resetConfirmations };
}

/** The intro above the steps makes way for the success screen (see body[data-view] in global.css). */
function useSuccessView(shown: boolean) {
  useEffect(() => {
    if (shown) document.body.dataset.view = 'success';
    else delete document.body.dataset.view;
  }, [shown]);
}

interface LockSigningInput {
  wallet: SiteWallet;
  input: DraftInput;
  draft: Draft;
  preview: LockPreview | null;
  confirmations: Confirmations;
  resetConfirmations: () => void;
  onTimeMoved: () => void;
  onLocked: () => void;
}

const IDLE: SigningPhase = { kind: 'idle' };
const TIME_MOVED = 'The time moved on while you were confirming, so the unlock time changed. Check it and confirm again.';

function useLockSigning({ wallet, input, draft, preview, confirmations, resetConfirmations, onTimeMoved, onLocked }: LockSigningInput) {
  const [phase, setPhase] = useState<SigningPhase>(IDLE);
  const [result, setResult] = useState<LockResult | null>(null);

  const sign = async () => {
    const signer = wallet.signer;
    if (!signer || isBusy(phase) || signBlockers(draft, confirmations).length > 0) return;
    // Worked out again with the time right now, so a test lock that crossed the hour is confirmed again.
    const fresh = draftLock(input, { now: nowSeconds(), feeAddress: FEE_ADDRESS, wallet: signer.address });
    if (termsKey(fresh) !== termsKey(draft)) {
      onTimeMoved();
      setPhase({ kind: 'error', message: TIME_MOVED });
      return;
    }
    const rpc = siteRpc();
    const shown = preview && !preview.placeholder ? { rent: preview.plan.rent, total: preview.plan.total } : undefined;
    const outcome = await runSigning<PreparedLock, LockResult>(
      {
        prepare: async () => {
          await assertServerCluster();
          return prepareLock(fresh, { rpc, signer, feeAddress: FEE_ADDRESS, now: nowSeconds(), shown });
        },
        send: (prepared) => signAndSend(prepared.message),
        finish: (prepared, signature) => finishLock(rpc, prepared, signature),
        landed: (prepared) => accountExists(rpc, prepared.plan.lockAddress),
        landedMessage: 'Your wallet reported a problem, but the lock is on the network. See it on My locks.',
      },
      setPhase,
    );
    // A second lock is never one click away: after any attempt the user ticks and types again.
    resetConfirmations();
    if (outcome.kind === 'done') setResult(outcome.result);
    if (outcome.kind !== 'failed') onLocked();
  };

  return {
    phase,
    result,
    sign,
    clearError: () => setPhase((current) => (current.kind === 'error' ? IDLE : current)),
    reset: () => {
      setResult(null);
      setPhase(IDLE);
    },
  };
}
