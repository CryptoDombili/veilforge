/// <reference types="vite/client" />

import type { EIP1193Provider } from 'viem';

declare global {
  interface ImportMetaEnv {
    readonly VITE_REGISTRY_ADDRESS?: `0x${string}`;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export {};
