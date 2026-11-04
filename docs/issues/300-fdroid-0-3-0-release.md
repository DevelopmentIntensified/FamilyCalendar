# 300 — F-Droid 0.3.0: publish the website-clone app

Status: open

Parent: #292. Owner approval given 2026-11-04 ("Merge to fdroid when done").

Blocked by: #294, #295, #296, #297, #298, #299

## Needs doing

- All lanes merged to `test` → `main`; `:app:mobileGate :app:assembleRelease` green on the merged tree; `npm run build` green.
- Changelog `fdroid/metadata/com.familyplanz.app/en-US/changelogs/3000.txt`.
- `scripts/fdroid-publish.sh --version 0.3.0` (env mode, keys from outside git); push; verify `https://www.familyplanz.com/fdroid/repo/index-v1.jar` lists versionCode 3000 after the deploy.

## Done

