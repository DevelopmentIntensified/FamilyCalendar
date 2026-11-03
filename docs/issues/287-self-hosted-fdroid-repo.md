# 287 — Self-hosted F-Droid repo on familyplanz.com

Status: open

Source: owner 2026-11-03 — "Create own droid repo on familyplanz" (chosen over the official F-Droid store, so the Firebase build is fine).

## Goal

Users add `https://familyplanz.com/fdroid/repo` in the F-Droid client (or tap an "Add to F-Droid" link / QR on the site) and get Family Planz plus updates.

## Needs doing

- `fdroid/` tooling in the repo: fdroidserver `config.yml` template (repo_url, name, description, icon, `archive_older`), app metadata `metadata/com.familyplanz.app.yml` (+ fastlane-style description/summary/changelog), a `scripts/fdroid-publish.sh` that: builds the signed release APK (`keystore.properties`), runs `fdroid update` with the repo keystore from env/paths OUTSIDE git, and copies the generated `repo/` into `static/fdroid/repo/` for Vercel.
- Never commit the repo keystore, its passwords, or the APK signing key (.gitignore + script refuses if they're inside the tree).
- Static serving works on Vercel: correct content types for `.apk` / `.jar` / `index-v2.json`, no service-worker caching or SvelteKit route shadowing of `/fdroid/**`.
- A site page (`/android`) with: Play link placeholder, direct APK download, F-Droid "add repo" deep link `fdroidrepos://familyplanz.com/fdroid/repo?fingerprint=…` + QR code, fingerprint shown for manual verification. Fingerprint comes from a committed public file the script writes.
- Owner guide `docs/guides/fdroid-repo.md`: create the repo key once, publish a release, rotate/backup warnings, why Play vs F-Droid installs can't update each other (different signers).
- Verified end-to-end in the session with THROWAWAY keys (scratchpad only): `fdroid update` produces a signed index and `fdroid` client-equivalent verification (e.g. `fdroid signindex`/index fingerprint check) passes; nothing from the throwaway run is committed.
