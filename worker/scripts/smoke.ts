/**
 * Call a running SolLock Worker the way the site will, and check the answers.
 *
 *   pnpm --filter @sollock/worker dev            (in one terminal)
 *   pnpm --filter @sollock/worker smoke          (in another; defaults to http://127.0.0.1:8791)
 *   pnpm --filter @sollock/worker smoke -- http://127.0.0.1:8791 <wallet address>
 */
import { address, getBase64Encoder } from '@solana/kit';
import { CUSTODIAN_ADDRESS, describeLock, lockAddressBatch, readLockAccount, STAKE_PROGRAM_ADDRESS } from '@sollock/core';

const base = process.argv[2] ?? 'http://127.0.0.1:8791';
// The devnet wallet of packages/core's devnet script; it owns a few test locks.
const wallet = address(process.argv[3] ?? 'J25CTTarrkbvpzX2W8yhmq85ybb9XFY2Ki33D1bdHD1c');
const origin = 'http://localhost:4321';
let failures = 0;

async function rpc(method: string, params: unknown[] = [], headers: Record<string, string> = { origin }) {
  const res = await fetch(`${base}/api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
  });
  return { status: res.status, cluster: res.headers.get('x-sollock-cluster'), body: (await res.json()) as { result?: any; error?: any } };
}

function check(what: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures++;
}

const epoch = await rpc('getEpochInfo');
check('getEpochInfo is forwarded', epoch.status === 200 && typeof epoch.body.result?.epoch === 'number', `epoch ${epoch.body.result?.epoch}, cluster ${epoch.cluster}`);
check('the Worker says it is on devnet', epoch.cluster === 'devnet');

const [b1, b2] = [await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]), await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])];
check('getLatestBlockhash is cached for 2 seconds', b1.body.result?.value?.blockhash === b2.body.result?.value?.blockhash, b1.body.result?.value?.blockhash);

const rent = await rpc('getMinimumBalanceForRentExemption', [200]);
check('rent for a lock account', typeof rent.body.result === 'number', `${rent.body.result} lamports`);

const seeds = await lockAddressBatch(wallet, 0, 5);
const accounts = await rpc('getMultipleAccounts', [seeds.map((s) => s.address), { encoding: 'base64' }]);
const found = (accounts.body.result?.value ?? []).filter(Boolean).length;
check('getMultipleAccounts finds this wallet\'s locks by seed', accounts.status === 200, `${found} of the first 5 seeds in use`);

const lookup = await rpc('getProgramAccounts', [
  STAKE_PROGRAM_ADDRESS,
  { encoding: 'base64', filters: [{ dataSize: 200 }, { memcmp: { offset: 44, bytes: wallet } }, { memcmp: { offset: 92, bytes: CUSTODIAN_ADDRESS } }] },
]);
const locks = (lookup.body.result ?? []) as { pubkey: string; account: { lamports: number; owner: string; data: [string, string] } }[];
check('the gift lookup (getProgramAccounts) works', lookup.status === 200 && Array.isArray(lookup.body.result), `${locks.length} SolLock lock(s) withdrawable by this wallet`);
for (const l of locks) {
  const view = readLockAccount(address(l.pubkey), {
    lamports: BigInt(l.account.lamports),
    programAddress: address(l.account.owner),
    data: getBase64Encoder().encode(l.account.data[0]) as Uint8Array,
  }, { now: BigInt(Math.floor(Date.now() / 1000)), epoch: BigInt(epoch.body.result?.epoch ?? 0), rent: BigInt(rent.body.result ?? 0) });
  console.log(`        ${l.pubkey}: ${describeLock(view).slice(0, 2).join(' ')}`);
}

const send = await rpc('sendTransaction', ['AAAA']);
check('sendTransaction is refused', send.body.error?.code === -32601, send.body.error?.message);

const otherLookup = await rpc('getProgramAccounts', [STAKE_PROGRAM_ADDRESS, { filters: [{ dataSize: 200 }] }]);
check('a broad getProgramAccounts is refused', otherLookup.body.error?.code === -32602, otherLookup.body.error?.message);

const noOrigin = await rpc('getEpochInfo', [], {});
check('a request without an Origin is refused', noOrigin.status === 403);

const foreign = await rpc('getEpochInfo', [], { origin: 'https://evil.example' });
check('a request from another site is refused', foreign.status === 403);

const price = await fetch(`${base}/api/price?currency=EUR`);
const priceBody = (await price.json()) as Record<string, unknown>;
check("today's price (CoinGecko)", price.status === 200 || price.status === 503, JSON.stringify(priceBody));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
