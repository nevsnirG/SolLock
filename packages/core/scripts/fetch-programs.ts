import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { address, createSolanaRpc, getBase64Encoder } from '@solana/kit';

const rpc = createSolanaRpc(process.env.MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com');
const out = new URL('../test-svm/programs/', import.meta.url);

/** Upgradeable-loader programs keep their code in a ProgramData account, after a 45-byte header. */
const PROGRAM_DATA_HEADER = 45;

async function fetchBytes(account: string): Promise<{ bytes: Uint8Array; slot: bigint }> {
  const { context, value } = await rpc.getAccountInfo(address(account), { encoding: 'base64' }).send();
  if (!value) throw new Error(`No account at ${account}`);
  return { bytes: getBase64Encoder().encode(value.data[0]) as Uint8Array, slot: context.slot };
}

async function main() {
  await mkdir(out, { recursive: true });
  const programs = [
    // ProgramData account of Stake11111111111111111111111111111111111111.
    { name: 'stake.so', account: '6WU8Nxarf9fudRK5atWwjLY4vFaw5UrrWhL88qz7iCMJ', skip: PROGRAM_DATA_HEADER },
    // BPF loader 2 program: the account data is the program itself.
    { name: 'memo.so', account: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', skip: 0 },
  ];
  const manifest: Record<string, { account: string; slot: string; sha256: string; bytes: number }> = {};
  for (const p of programs) {
    const { bytes, slot } = await fetchBytes(p.account);
    const elf = bytes.subarray(p.skip);
    // ProgramData accounts are padded with zeros after the ELF; LiteSVM accepts the padding.
    await writeFile(new URL(p.name, out), elf);
    manifest[p.name] = {
      account: p.account,
      slot: slot.toString(),
      sha256: createHash('sha256').update(elf).digest('hex'),
      bytes: elf.length,
    };
    console.log(`${p.name}: ${elf.length} bytes from ${p.account} at slot ${slot}`);
  }
  await writeFile(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
