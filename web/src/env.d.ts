interface ImportMetaEnv {
  /** "devnet" (the default) or "mainnet". Must match the Worker's CLUSTER. Mainnet only after the owner signs off. */
  readonly PUBLIC_SOLANA_CLUSTER?: string;
  /** This deployment's address, for canonical links, share images and the recovery note. */
  readonly PUBLIC_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
