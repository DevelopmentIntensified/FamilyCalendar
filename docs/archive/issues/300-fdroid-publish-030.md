# 300 — Publish 0.3.0 to the self-hosted F-Droid repo

Status: done

## Done

- 2026-11-06: 0.3.0 (versionCode 3000) published via GitHub Actions `Android release` (run 42255204884), tag `android-v0.3.0` @ a405694.
- All 7 release secrets set from the owner's ORIGINAL keystores (`C:\Users\MIRP\Downloads\upload.jks` / `fdroid-repo.jks`, found after being lostkey'd in Downloads). Fingerprints verified before use: upload `5d944cd7…8821` (= published APK signer), repo `e59447d7…71ef` (= committed index fingerprint). Throwaway keys generated mid-search were deleted, never used.
- NEW: full Kotlin+Compose Android app (6 tabs), quick-add phrase parsing, groceries store grouping, guest login. Fixes: EventFormSheet tall-form footer, quick-add "at 7" create, groceries toasts, day-tile actions menu.
- Workflow commits landed on `test` + `main`: `static/fdroid/repo/com.familyplanz.app_3000.apk` (3,371,533 B) + regenerated index + `src/lib/fdroid/published.json` (repoUrl `https://www.familyplanz.com/fdroid/repo`).
- Changelog `fdroid/metadata/com.familyplanz.app/en-US/changelogs/3000.txt` (7bab617).
- GitHub Release "Family Planz 0.3.0 (Android)" published with the signed APK as asset.
- Live check: https://www.familyplanz.com/fdroid/repo/index-v2.json lists 3000/3002/3001, all signed `5d944cd7…`; entry.json/index-v1.json re-signed `e59447d7…`.
- Merge `test` → `main` (e1559c3) done 2026-11-06 (closes #292); this ticket exists for the publish.

## Notes for next release

- Two run failures were fixed mid-flight and are now permanent: SDK package `platforms;android-37.0` (a405694) and `FP_UPLOAD_KEY_ALIAS` secret re-set to `upload` exactly (a 1st setting with a wrong value produced the confusing "No key with alias *** found" KeytoolException — GH secrets are masked in logs, so check the value not the log).
- Next versionCode = X*1_000_000 + Y*1_000 + Z (0.3.1 → 3001; 0.4.0 → 4000).
