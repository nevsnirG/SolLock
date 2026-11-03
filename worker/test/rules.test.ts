import {
  address,
  appendTransactionMessageInstructions,
  type Blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, parseRequest, RpcRefusal } from '../src/rules.ts';
import { call, CUSTODIAN, STAKE, WALLET } from './helpers.ts';

function refusal(body: unknown): RpcRefusal {
  try {
    parseRequest(typeof body === 'string' ? body : JSON.stringify(body));
  } catch (e) {
    if (e instanceof RpcRefusal) return e;
    throw e;
  }
  throw new Error('Expected a refusal');
}

const accepts = (body: unknown) => expect(() => parseRequest(JSON.stringify(body))).not.toThrow();

const LOOKUP_FILTERS = [{ dataSize: 200 }, { memcmp: { offset: 44, bytes: WALLET } }, { memcmp: { offset: 92, bytes: CUSTODIAN } }];
const TX = 'A'.repeat(400);
const SIG = '5ejruWkyxgKNZaWDUjNvbYDVUkmGUB8ZSDcf2y2g1t3Bodg6brRj8e1J3xsoJw6Rv9syjW2gkdDq9RAv3WFTxeCP';

describe('allowed calls', () => {
  it('accepts every read the site makes', () => {
    accepts(call('getLatestBlockhash', [{ commitment: 'confirmed' }]));
    accepts(call('getLatestBlockhash'));
    accepts(call('getEpochInfo', []));
    accepts(call('getMinimumBalanceForRentExemption', [200]));
    accepts(call('getBalance', [WALLET, { commitment: 'confirmed' }]));
    accepts(call('getAccountInfo', [WALLET, { encoding: 'base64' }]));
    accepts(call('getMultipleAccounts', [Array(100).fill(WALLET), { encoding: 'base64' }]));
    accepts(call('getSignatureStatuses', [[SIG]]));
    accepts(call('simulateTransaction', [wireWith([STAKE]), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true }]));
    accepts(call('getProgramAccounts', [STAKE, { encoding: 'base64', filters: LOOKUP_FILTERS }]));
    accepts(call('getProgramAccounts', [STAKE, { encoding: 'base64', filters: [...LOOKUP_FILTERS].reverse() }]));
  });

  it('marks the stake lookup for the stricter limiter, and caches only shared data', () => {
    expect(parseRequest(JSON.stringify(call('getProgramAccounts', [STAKE, { filters: LOOKUP_FILTERS }]))).rule.lookup).toBe(true);
    expect(parseRequest(JSON.stringify(call('getLatestBlockhash'))).rule.cacheMs).toBe(2_000);
    expect(parseRequest(JSON.stringify(call('getAccountInfo', [WALLET]))).rule.cacheMs).toBeUndefined();
  });
});

describe('refused calls', () => {
  it('never forwards sending, signing or anything else not on the list', () => {
    for (const method of ['sendTransaction', 'requestAirdrop', 'getTokenAccountsByOwner', 'getVoteAccounts', 'getTransaction', 'toString', '__proto__', 'constructor']) {
      expect(refusal(call(method, [])).code, method).toBe(METHOD_NOT_FOUND);
    }
  });

  it('refuses malformed requests', () => {
    expect(refusal('{nope').code).toBe(-32700);
    expect(refusal([call('getEpochInfo')]).message).toMatch(/Batch/);
    expect(refusal({ id: 1, method: 'getEpochInfo' }).code).toBe(INVALID_REQUEST);
    expect(refusal({ jsonrpc: '2.0', id: { x: 1 }, method: 'getEpochInfo' }).code).toBe(INVALID_REQUEST);
    expect(refusal({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: { pubkey: WALLET } }).code).toBe(INVALID_PARAMS);
  });

  it('keeps the request id in the refusal', () => {
    expect(refusal(call('sendTransaction', [], 'abc')).id).toBe('abc');
  });

  const badParams: [string, unknown[]][] = [
    ['an address that is not one', ['nope']],
    ['too many parameters', [WALLET, {}, {}]],
    ['an unknown config option', [WALLET, { encoding: 'base64', foo: 1 }]],
    ['an unknown commitment', [WALLET, { commitment: 'yolo' }]],
    ['base58 account data', [WALLET, { encoding: 'base58' }]],
  ];
  for (const [what, params] of badParams) {
    it(`getAccountInfo with ${what}`, () => expect(refusal(call('getAccountInfo', params)).code).toBe(INVALID_PARAMS));
  }

  it('getMultipleAccounts with more than 100 addresses, or none', () => {
    expect(refusal(call('getMultipleAccounts', [Array(101).fill(WALLET)])).code).toBe(INVALID_PARAMS);
    expect(refusal(call('getMultipleAccounts', [[]])).code).toBe(INVALID_PARAMS);
  });

  it('simulateTransaction that is not base64, too big, or without the encoding', () => {
    expect(refusal(call('simulateTransaction', [TX])).code).toBe(INVALID_PARAMS);
    expect(refusal(call('simulateTransaction', [TX, { encoding: 'base58' }])).code).toBe(INVALID_PARAMS);
    expect(refusal(call('simulateTransaction', ['not base64!', { encoding: 'base64' }])).code).toBe(INVALID_PARAMS);
    expect(refusal(call('simulateTransaction', ['A'.repeat(1_648), { encoding: 'base64' }])).code).toBe(INVALID_PARAMS);
  });

  it('getSignatureStatuses with junk', () => {
    expect(refusal(call('getSignatureStatuses', [['abc']])).code).toBe(INVALID_PARAMS);
    expect(refusal(call('getSignatureStatuses', [Array(101).fill(SIG)])).code).toBe(INVALID_PARAMS);
  });

  describe('getProgramAccounts other than the SolLock gift lookup', () => {
    const cases: [string, unknown[]][] = [
      ['another program', ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', { filters: LOOKUP_FILTERS }]],
      ['no filters', [STAKE, {}]],
      ['no config', [STAKE]],
      ['only two filters', [STAKE, { filters: LOOKUP_FILTERS.slice(0, 2) }]],
      ['a fourth filter', [STAKE, { filters: [...LOOKUP_FILTERS, { dataSize: 200 }] }]],
      ['another custodian', [STAKE, { filters: [LOOKUP_FILTERS[0], LOOKUP_FILTERS[1], { memcmp: { offset: 92, bytes: WALLET } }] }]],
      ['the staker instead of the withdrawer', [STAKE, { filters: [LOOKUP_FILTERS[0], { memcmp: { offset: 12, bytes: WALLET } }, LOOKUP_FILTERS[2]] }]],
      ['another size', [STAKE, { filters: [{ dataSize: 165 }, LOOKUP_FILTERS[1], LOOKUP_FILTERS[2]] }]],
      ['base64 filter bytes', [STAKE, { filters: [LOOKUP_FILTERS[0], { memcmp: { offset: 44, bytes: WALLET, encoding: 'base64' } }, LOOKUP_FILTERS[2]] }]],
      ['a junk withdrawer', [STAKE, { filters: [LOOKUP_FILTERS[0], { memcmp: { offset: 44, bytes: 'x' } }, LOOKUP_FILTERS[2]] }]],
    ];
    for (const [what, params] of cases) {
      it(what, () => expect(refusal(call('getProgramAccounts', params)).code).toBe(INVALID_PARAMS));
    }
  });
});

function wireWith(programs: string[], version: 0 | 'legacy' = 0): string {
  const message = pipe(
    createTransactionMessage({ version }),
    (m) => setTransactionMessageFeePayer(address(WALLET), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 0n }, m),
    (m) => appendTransactionMessageInstructions(programs.map((p) => ({ programAddress: address(p), accounts: [], data: new Uint8Array([2]) })), m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

describe('test runs (simulateTransaction)', () => {
  const simulate = (wire: string) => call('simulateTransaction', [wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true }]);

  it("accepts transactions for SolLock's own programs", () => {
    accepts(simulate(wireWith(['ComputeBudget111111111111111111111111111111', '11111111111111111111111111111111', STAKE, 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'])));
  });

  it('refuses a transaction for any other program, so the proxy is no free simulator', () => {
    const r = refusal(simulate(wireWith([STAKE, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'])));
    expect(r.code).toBe(INVALID_PARAMS);
    expect(r.message).toMatch(/Only SolLock transactions/);
  });

  it('refuses legacy transactions: SolLock sends version 0 only', () => {
    expect(refusal(simulate(wireWith([STAKE], 'legacy'))).message).toMatch(/Only SolLock transactions/);
  });

  it('refuses base64 that is not a transaction', () => {
    expect(refusal(simulate('AQID')).message).toMatch(/Not a transaction/);
  });
});

describe('account reads', () => {
  it('accept base64 only', () => {
    expect(refusal(call('getAccountInfo', [WALLET, { encoding: 'jsonParsed' }])).code).toBe(INVALID_PARAMS);
    expect(refusal(call('getMultipleAccounts', [[WALLET], { encoding: 'base64+zstd' }])).code).toBe(INVALID_PARAMS);
  });
});
