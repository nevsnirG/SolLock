import {
  type Address,
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Instruction,
  isSignerRole,
} from '@solana/kit';

export function decodeWireTransaction(bytes: Uint8Array) {
  const { messageBytes, signatures } = getTransactionDecoder().decode(bytes);
  const message = decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(messageBytes));
  return { message: { ...message, instructions: message.instructions as readonly Instruction[] }, signatures };
}

export function messageSigners(message: { feePayer: { address: Address }; instructions: readonly Instruction[] }): Address[] {
  const signers = new Set<Address>([message.feePayer.address]);
  for (const ix of message.instructions) {
    for (const meta of ix.accounts ?? []) if (isSignerRole(meta.role)) signers.add(meta.address);
  }
  return [...signers];
}
