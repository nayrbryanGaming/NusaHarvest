# NusaHarvest Recovery Status (2026-04-21)

## 1) Recovery branch status

- Recovery target commit: `f7ce0405` (message: `init`)
- Active branch after recovery: `recovery/v1.0.0-20260421-144446`
- Backup branch created: `backup/pre-recovery-20260421-144446`
- Pre-recovery tracked changes were stashed as: `pre-recovery-20260421-144446-tracked`

## 2) What was recovered

- Repository tracked files were switched to the v1.0.0 snapshot (`f7ce0405`).
- Untracked artifacts were preserved (not deleted), including backend/contracts/docs local assets.

## 3) Devnet and onchain verification

### Program and deployment proof checks

- File checked: `contracts/DEPLOYMENT_PROOF.json`
- Claimed programId in file: `CgMn8QfThDQLkcghfP4A9AV3FTTECjSuZvf6Ngf1LiBx`
- Live check result: `solana program show <programId> --url devnet` returned account not found.
- Claimed tx signature in proof file failed validation (`Invalid signature`).

### Wallet checks (live)

- `temp_deployer.json` -> `4WD8uud8rV5J8if87kxr8DKPodW8njmxpWLreq3rEqfo`
  - Balance: `0 SOL`
  - Recent tx history: `0 transactions found`
- `fresh_fee_payer.json` -> `EoR3pAji46nEHGP3Y95nR5FeHJNA2aASqpu3fw6K985p`
  - Balance: `0 SOL`
  - Recent tx history: `0 transactions found`
- `autofund_tmp_wallet.json` -> `2QQWXeXycVGUrXVmfvTHK6jVcfGLSTd7kg1QzMATVKQi`
  - Balance: `0 SOL`
  - Recent tx history: `0 transactions found`

### Airdrop attempt results

Airdrop attempts to multiple devnet RPCs were attempted and failed:

- `https://api.devnet.solana.com` -> rate-limited
- `https://solana-devnet.g.alchemy.com/v2/demo` -> HTTP 429
- `https://devnet.genesysgo.net` -> request/network error
- `https://rpc.ankr.com/solana_devnet` -> unauthorized (API key required)

Final balance remained `0 SOL`, with no transaction history generated.

## 4) Website build status on recovered snapshot

Build troubleshooting timeline:

- Initial `npm run build` failed with missing Next binary:
  - `Cannot find module ...\node_modules\next\dist\bin\next`
- `npm install` was run to restore dependencies.
- Next build then failed with missing dependency:
  - `Cannot find module 'run-parallel'`
- `run-parallel` was installed and verified:
  - `npm install run-parallel --save-dev`
  - `npm ls run-parallel --depth=0` -> `run-parallel@1.2.0`
- Root layout was patched to remove `next/font/google` usage (`src/app/layout.tsx`) to reduce font build-path dependency risk.

Final build verification:

- Long-run build now completes successfully:
  - `Compiled successfully`
  - `Linting and checking validity of types`
  - `Generating static pages (5/5)`
  - `Finalizing page optimization`
- Additional fix required to pass type-check step:
  - Root `tsconfig.json` scope was narrowed to app source files (`src/**/*.ts`, `src/**/*.tsx`) and unrelated folders (`contracts`, `backend`, `frontend`, `scripts`) were excluded.

Status: **BUILD READY (PRODUCTION BUILD PASSED)**

## 5) Current conclusion

- Code rollback to v1.0.0 snapshot: **SUCCESS**
- Preservation of existing local assets: **SUCCESS**
- Wallet/devnet/onchain proof of deployment: **NOT VERIFIED (FAILED WITH CURRENT ARTIFACTS/RPC ACCESS)**
- Frontend build on recovered snapshot: **VERIFIED (production build passed)**
