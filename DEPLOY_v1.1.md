# VeilForge v1.1 deployment checklist

## 1. Preserve the live release

Before replacing the repository contents, download or tag the currently working version. Do not delete the existing Vercel project or registry contract.

## 2. Validate locally

```bash
npm install
npm run check
npm run dev
```

Review the vulnerable and hardened demos, the Remediation tab, JSON export, Markdown export, file upload, and mobile layout.

## 3. Preserve the Arc configuration

The existing registry can remain in use. Confirm the Vercel environment variable still contains:

```env
VITE_REGISTRY_ADDRESS=0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc
```

Never commit a wallet private key, seed phrase, or `contracts/.env` file.

## 4. Publish safely

1. Upload the v1.1 files to the existing GitHub repository.
2. Confirm the commit contains no `.env`, private key, seed phrase, or `node_modules` directory.
3. Let Vercel build the existing `apps/web` application.
4. Open the production URL and repeat the reviewer walkthrough in `RELEASE_NOTES_v1.1.md`.
5. Publish one fresh proof from a disposable Arc Testnet wallet and verify the transaction on ArcScan.

## 5. Release metadata

Recommended tag: `v1.1.0`

Recommended title: `VeilForge v1.1 — Remediation Intelligence`
