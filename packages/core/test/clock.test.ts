import { createSolanaRpcFromTransport, getBase64Decoder, type RpcTransport } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { CLOCK_SYSVAR_ADDRESS, clockSkewProblem, DAY, decodeClockUnixTimestamp, fetchChainTime, HOUR, MAX_CLOCK_SKEW } from '../src/index.ts';

const now = 1_800_000_000n;

function timestampBytes(at: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, at, true);
  return bytes;
}

function fakeRpc(clock: bigint | null) {
  const requests: unknown[][] = [];
  const transport = (async ({ payload }: { payload: unknown }) => {
    const { params, id } = payload as { params: unknown[]; id: unknown };
    requests.push(params);
    const value = clock === null ? null : { data: [getBase64Decoder().decode(timestampBytes(clock)), 'base64'], executable: false, lamports: 1_169_280, owner: 'Sysvar1111111111111111111111111111111111111', rentEpoch: 0, space: 40 };
    return { jsonrpc: '2.0', id, result: { context: { slot: 1 }, value } };
  }) as RpcTransport;
  return { rpc: createSolanaRpcFromTransport(transport), requests };
}

describe('the network clock', () => {
  it('decodes the little-endian timestamp, and only that', () => {
    expect(decodeClockUnixTimestamp(timestampBytes(now))).toBe(now);
    // 1,800,000,000 is 0x6B49D200.
    expect(decodeClockUnixTimestamp(new Uint8Array([0x00, 0xd2, 0x49, 0x6b, 0, 0, 0, 0]))).toBe(now);
    expect(() => decodeClockUnixTimestamp(new Uint8Array(40))).toThrow(/8 bytes/);
  });

  it('asks for the timestamp slice of the Clock sysvar', async () => {
    const { rpc, requests } = fakeRpc(now);
    expect(await fetchChainTime(rpc)).toBe(now);
    expect(requests[0]?.[0]).toBe(CLOCK_SYSVAR_ADDRESS);
    expect(requests[0]?.[1]).toMatchObject({ encoding: 'base64', dataSlice: { offset: 32, length: 8 } });
  });

  it('fails when the network returns no clock', async () => {
    await expect(fetchChainTime(fakeRpc(null).rpc)).rejects.toThrow(/no clock/);
  });

  it('allows ten minutes of drift either way, and no more', () => {
    expect(clockSkewProblem(now, now)).toBeNull();
    expect(clockSkewProblem(now, now + MAX_CLOCK_SKEW)).toBeNull();
    expect(clockSkewProblem(now, now - MAX_CLOCK_SKEW)).toBeNull();
    expect(clockSkewProblem(now, now + MAX_CLOCK_SKEW + 1n)).toMatch(/^Your device's clock is 10 minutes ahead of the Solana network's\./);
    expect(clockSkewProblem(now, now - MAX_CLOCK_SKEW - 1n)).toMatch(/10 minutes behind the Solana network's/);
  });

  it('says how far off, in plain units', () => {
    expect(clockSkewProblem(now, now - 3n * HOUR)).toMatch(/3 hours behind/);
    expect(clockSkewProblem(now, now + 36n * HOUR)).toMatch(/36 hours ahead/);
    expect(clockSkewProblem(now, now + 3n * DAY)).toMatch(/3 days ahead/);
    expect(clockSkewProblem(now, now + 10n * 365n * DAY + 5n * DAY)).toMatch(/10 years ahead/);
    expect(clockSkewProblem(now, now + 10n * 365n * DAY)).toMatch(/nothing was sent\. Set the clock right and try again\.$/);
  });

  it('takes a wider tolerance when asked', () => {
    expect(clockSkewProblem(now, now - 2n * HOUR, 3n * HOUR)).toBeNull();
    expect(clockSkewProblem(now, now - 4n * HOUR, 3n * HOUR)).toMatch(/4 hours behind/);
  });
});
