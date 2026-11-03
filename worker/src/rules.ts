import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder, isAddress } from '@solana/kit';
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  CUSTODIAN_OFFSET,
  MEMO_PROGRAM_ADDRESS,
  STAKE_ACCOUNT_SPACE,
  STAKE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  WITHDRAWER_OFFSET,
} from '@sollock/core/constants';
import { CUSTODIAN_ADDRESS } from '@sollock/core/custodian';
import { SEED_BATCH_SIZE } from '@sollock/core/seeds';

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params: unknown[];
}

export interface MethodRule {
  check(params: unknown[]): string | null;
  /** Only for answers that are the same for every visitor: the cache is shared. */
  cacheMs?: number;
  lookup?: boolean;
}

/** Standard JSON-RPC 2.0 error codes. */
export const PARSE_ERROR = -32700;
export const INTERNAL_ERROR = -32603;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

export class RpcRefusal extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly id: JsonRpcId = null,
  ) {
    super(message);
  }
}

const COMMITMENTS = new Set(['processed', 'confirmed', 'finalized']);
/** Raw data only: jsonParsed would let callers make the provider do more work. */
const ACCOUNT_ENCODING = 'base64';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** A transaction is at most 1,232 bytes, which is 1,644 characters of base64. */
const MAX_WIRE_TX_BASE64 = 1_644;
/** Solana's largest account, 10 MiB. */
const MAX_ACCOUNT_SIZE = 10 * 1024 * 1024;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isUint(v: unknown, max = Number.MAX_SAFE_INTEGER): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
}

function arityProblem(params: unknown[], min: number, max: number): string | null {
  return params.length < min || params.length > max ? `Expected ${min === max ? min : `${min} to ${max}`} parameters.` : null;
}

function addressProblem(value: unknown, what = 'address'): string | null {
  return typeof value === 'string' && isAddress(value) ? null : `Not a valid ${what}.`;
}

function addressListProblem(value: unknown, max: number): string | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return `Expected 1 to ${max} addresses.`;
  return value.every((item) => typeof item === 'string' && isAddress(item)) ? null : 'Not a valid address.';
}

function signatureListProblem(value: unknown, max: number): string | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return `Expected 1 to ${max} signatures.`;
  const valid = value.every((item) => typeof item === 'string' && item.length >= 64 && item.length <= 88 && BASE58.test(item));
  return valid ? null : 'Not a valid signature.';
}

function configProblem(value: unknown, allowed: readonly string[], required: readonly string[] = []): string | null {
  if (value === undefined) return required.length ? `Missing ${required.join(', ')}.` : null;
  if (!isPlainObject(value)) return 'The config must be an object.';
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return `The config option "${key}" is not allowed.`;
  for (const key of required) if (!(key in value)) return `Missing ${key}.`;
  if ('commitment' in value && !COMMITMENTS.has(value.commitment as string)) return 'Unknown commitment.';
  if ('encoding' in value && value.encoding !== ACCOUNT_ENCODING) return 'Use base64 encoding.';
  if ('dataSlice' in value) {
    const slice = value.dataSlice;
    if (!isPlainObject(slice) || !isUint(slice.offset) || !isUint(slice.length) || Object.keys(slice).length !== 2) return 'Bad dataSlice.';
  }
  for (const flag of ['sigVerify', 'replaceRecentBlockhash']) {
    if (flag in value && typeof value[flag] !== 'boolean') return `${flag} must be true or false.`;
  }
  return null;
}

const READ = ['commitment'] as const;
const ACCOUNT_READ = ['commitment', 'encoding', 'dataSlice'] as const;

function simulateConfigProblem(value: unknown): string | null {
  return configProblem(value, ['encoding', 'sigVerify', 'replaceRecentBlockhash', 'commitment'], ['encoding']);
}

function wireTransactionProblem(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_WIRE_TX_BASE64 && BASE64.test(value) ? null : 'Not a base64 transaction.';
}

const SIMULATION_PROGRAMS = new Set<string>([SYSTEM_PROGRAM_ADDRESS, STAKE_PROGRAM_ADDRESS, COMPUTE_BUDGET_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS]);

function simulationProgramsProblem(value: unknown): string | null {
  try {
    const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(value as string));
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (message.version !== 0) return 'Only SolLock transactions can be test-run.';
    if ((message.addressTableLookups?.length ?? 0) > 0) return 'Address lookup tables are not supported.';
    for (const instruction of message.instructions) {
      const program = message.staticAccounts[instruction.programAddressIndex];
      if (!program || !SIMULATION_PROGRAMS.has(program)) return 'Only SolLock transactions can be test-run.';
    }
    return null;
  } catch {
    return 'Not a transaction.';
  }
}

type LookupFilter = 'size' | 'withdrawer' | 'custodian';

function lookupFilterKind(filter: unknown): LookupFilter | string {
  if (!isPlainObject(filter) || Object.keys(filter).length !== 1) return 'Bad filter.';
  if ('dataSize' in filter) return filter.dataSize === Number(STAKE_ACCOUNT_SPACE) ? 'size' : 'The lookup is only for 200-byte stake accounts.';
  const memcmp = filter.memcmp;
  if (!isPlainObject(memcmp) || Object.keys(memcmp).some((key) => !['offset', 'bytes', 'encoding'].includes(key))) return 'Bad filter.';
  if ('encoding' in memcmp && memcmp.encoding !== 'base58') return 'Filters must be base58.';
  if (memcmp.offset === Number(WITHDRAWER_OFFSET) && addressProblem(memcmp.bytes, 'wallet address') === null) return 'withdrawer';
  if (memcmp.offset === Number(CUSTODIAN_OFFSET) && memcmp.bytes === CUSTODIAN_ADDRESS) return 'custodian';
  return 'The lookup may only filter on the withdrawer and the SolLock custodian.';
}

function lockLookupProblem(params: unknown[]): string | null {
  const problem =
    arityProblem(params, 2, 2) ??
    (params[0] === STAKE_PROGRAM_ADDRESS ? null : 'Only stake accounts can be looked up.') ??
    configProblem(params[1], ['commitment', 'encoding', 'filters'], ['filters']);
  if (problem) return problem;
  const filters = (params[1] as Record<string, unknown>).filters;
  if (!Array.isArray(filters) || filters.length !== 3) return 'The lookup needs exactly three filters.';
  const kinds = new Set<string>();
  for (const filter of filters) {
    const kind = lookupFilterKind(filter);
    if (kind !== 'size' && kind !== 'withdrawer' && kind !== 'custodian') return kind;
    kinds.add(kind);
  }
  return kinds.size === 3 ? null : 'The lookup needs the size, withdrawer and custodian filters.';
}

/** No sendTransaction: the user's wallet broadcasts, never this proxy. */
const RULES: Readonly<Record<string, MethodRule>> = {
  getLatestBlockhash: { check: (params) => arityProblem(params, 0, 1) ?? configProblem(params[0], READ), cacheMs: 2_000 },
  getEpochInfo: { check: (params) => arityProblem(params, 0, 1) ?? configProblem(params[0], READ), cacheMs: 2_000 },
  getMinimumBalanceForRentExemption: {
    check: (params) =>
      arityProblem(params, 1, 2) ?? (isUint(params[0], MAX_ACCOUNT_SIZE) ? null : 'Expected a data length.') ?? configProblem(params[1], READ),
    cacheMs: 60_000,
  },
  getBalance: { check: (params) => arityProblem(params, 1, 2) ?? addressProblem(params[0]) ?? configProblem(params[1], READ) },
  getAccountInfo: { check: (params) => arityProblem(params, 1, 2) ?? addressProblem(params[0]) ?? configProblem(params[1], ACCOUNT_READ) },
  getMultipleAccounts: {
    check: (params) => arityProblem(params, 1, 2) ?? addressListProblem(params[0], SEED_BATCH_SIZE) ?? configProblem(params[1], ACCOUNT_READ),
  },
  getSignatureStatuses: { check: (params) => arityProblem(params, 1, 2) ?? signatureListProblem(params[0], 100) ?? configProblem(params[1], []) },
  simulateTransaction: {
    check: (params) => arityProblem(params, 2, 2) ?? wireTransactionProblem(params[0]) ?? simulateConfigProblem(params[1]) ?? simulationProgramsProblem(params[0]),
  },
  getProgramAccounts: { check: lockLookupProblem, lookup: true },
};

export function parseRequest(text: string): { request: JsonRpcRequest; rule: MethodRule } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RpcRefusal(PARSE_ERROR, 'The request is not valid JSON.');
  }
  if (Array.isArray(body)) throw new RpcRefusal(INVALID_REQUEST, 'Batch requests are not supported.');
  if (!isPlainObject(body)) throw new RpcRefusal(INVALID_REQUEST, 'Not a JSON-RPC request.');

  const id = body.id;
  const validId: JsonRpcId = typeof id === 'string' || typeof id === 'number' ? id : null;
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') throw new RpcRefusal(INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.', validId);
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') {
    throw new RpcRefusal(INVALID_REQUEST, 'The id must be a string or a number.');
  }

  const rule = Object.hasOwn(RULES, body.method) ? RULES[body.method] : undefined;
  if (!rule) throw new RpcRefusal(METHOD_NOT_FOUND, `SolLock does not forward ${body.method}.`, validId);

  const params = body.params === undefined ? [] : body.params;
  if (!Array.isArray(params)) throw new RpcRefusal(INVALID_PARAMS, 'Params must be a list.', validId);
  const problem = rule.check(params);
  if (problem) throw new RpcRefusal(INVALID_PARAMS, problem, validId);

  return { request: { id: validId, method: body.method, params }, rule };
}
