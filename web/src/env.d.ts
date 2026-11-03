interface ImportMetaEnv {
  readonly PUBLIC_SOLANA_CLUSTER?: string;
  readonly PUBLIC_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
