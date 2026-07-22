# GitHub upload — simple path

This release is prepared so the repository owner does not need to edit code.

## Before upload

1. Keep `veilforge-main-v1.1-backup.zip` somewhere safe.
2. Extract `veilforge-v1.8-github-ready.zip` on the computer.
3. Open the extracted `veilforge-v1.8` folder. The files inside it are the repository contents.

## Upload in GitHub

1. Open `CryptoDombili/veilforge`.
2. Make sure the branch selector shows `main`.
3. Click **Add file → Upload files**.
4. Drag **all files and folders inside** the extracted `veilforge-v1.8` folder into the upload area.
5. Wait until GitHub finishes listing the files.
6. In the commit box write:

```text
release: VeilForge v1.8 Privacy Mission Control
```

7. Select **Commit directly to the main branch**.
8. Click **Commit changes**.

Do not upload the outer ZIP file itself into the repository. Upload the extracted contents.

## After upload

Vercel should detect the commit automatically. The root `vercel.json` installs dependencies, runs `npm run build:web`, and publishes `apps/web/dist`.

Follow `DEPLOY_v1.8.md` for the production checks and rollback procedure.
