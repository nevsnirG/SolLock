import { describe, expect, it, vi } from 'vitest';
import { NoWalletAppError } from '../src/lib/mobile.ts';
import { runSigning, type SigningPhase, type SigningSteps } from '../src/lib/signing.ts';

const noWait = { wait: async () => {} };

function steps(send: () => Promise<never>, landed = vi.fn(async () => false)): SigningSteps<string, string> & { landed: typeof landed } {
  return { prepare: async () => 'prepared', send, finish: async () => 'done', landed, landedMessage: 'It landed anyway.' };
}

describe('running a signing', () => {
  it('says to tap again when the phone never opened the wallet app, without looking for a transaction', async () => {
    const phases: SigningPhase[] = [];
    const run = steps(async () => {
      throw new NoWalletAppError();
    });

    const outcome = await runSigning(run, (phase) => phases.push(phase), noWait);

    expect(outcome).toEqual({ kind: 'failed' });
    expect(run.landed).not.toHaveBeenCalled();
    expect(phases.map((phase) => phase.kind)).toEqual(['preparing', 'wallet', 'error']);
    expect(phases.at(-1)).toMatchObject({ message: expect.stringMatching(/did not open the wallet app in time\. Nothing was sent/) });
  });

  it('reads a refusal in the wallet app as a no, once it is sure nothing landed', async () => {
    const phases: SigningPhase[] = [];
    const run = steps(async () => {
      throw new Error('Declined in the wallet app.');
    });

    const outcome = await runSigning(run, (phase) => phases.push(phase), noWait);

    expect(outcome).toEqual({ kind: 'failed' });
    expect(run.landed).toHaveBeenCalledTimes(3);
    expect(phases.map((phase) => phase.kind)).toEqual(['preparing', 'wallet', 'checking', 'error']);
    expect(phases.at(-1)).toMatchObject({ message: 'You said no in your wallet. Nothing was sent.' });
  });
});
