# 287 — Self-hosted F-Droid repo on familyplanz.com

Status: done

Source: owner 2026-11-03 — "Create own droid repo on familyplanz" (chosen over the official F-Droid store, so the Firebase build is fine). Follow-ups from the owner, same day: env-var key mode for cloud agent sessions, and a release-only GitHub Actions workflow (the one exception to #184).

## Goal

Users add `https://familyplanz.com/fdroid/repo` in the F-Droid client (or tap an "Add to F-Droid" link / QR on the site) and get Family Planz plus updates.

## Done

Owner guide: [docs/guides/fdroid-repo.md](../guides/fdroid-repo.md).

- **Tooling.** `fdroid/config.yml` sets repo_url, name, description, icon and `archive_older: 3`. It holds no secrets: keystore path and passwords are `{env: …}`. App metadata is `fdroid/metadata/com.familyplanz.app.yml`, with fastlane-style `en-US/` title, summary and description, plus `changelogs/1000.txt`. The description reuses the approved copy from `docs/play-store-listing.md` and obeys its content rule (👪 only).
- **`scripts/fdroid-publish.sh`** builds `:app:assembleRelease` signed with the upload key. It runs `fdroid update` in a `mktemp` workdir seeded from the committed `static/fdroid/`, verifies the result, and writes `static/fdroid/{repo,archive,qr.svg}` plus the public fingerprint file `src/lib/fdroid/published.json`. The verification is `scripts/fdroid-verify.py`:
  - `index.get_index_from_jar` on `entry.jar` and `index-v1.jar`, pinned to the keystore's SHA-256;
  - the `index-v2.json` sha256 matches `entry.json`;
  - the new APK is listed with a matching sha256;
  - every APK in the repo has a single signer.
- **Key modes.** In file mode the upload key comes from `apps/android/keystore.properties` (or `FP_KEYSTORE_PROPERTIES`) and the repo key from `FDROID_REPO_KEYSTORE`. In env mode the script reads `FP_UPLOAD_KEYSTORE_B64`, `FP_UPLOAD_KEYSTORE_PASSWORD`, `FP_UPLOAD_KEY_ALIAS`, `FP_UPLOAD_KEY_PASSWORD`, `FDROID_REPO_KEYSTORE_B64`, `FDROID_REPO_KEYSTORE_PASSWORD` and `FDROID_REPO_KEY_PASSWORD`. It decodes the keystores into a `chmod 700` `mktemp -d` dir outside git, removed by `trap`. Passwords never reach argv: it uses `keytool -storepass:env`, fdroid's `{env:}` config, and a properties file written by builtin `printf`.
- **Refusals.** The script stops if:
  - a keystore or the temp dir is inside the git tree;
  - `--version` is missing;
  - the versionCode is not above the published one;
  - the APK name is already published;
  - the repo key fingerprint differs from `published.json`;
  - the repo would have mixed signers.

  `--dry-run` turns the version and fingerprint checks into warnings.
- **Versioning.** `--version X.Y.Z` (or tag `android-vX.Y.Z`) → `-PfpVersionName` and `-PfpVersionCode = X*1e6 + Y*1e3 + Z` in `app/build.gradle.kts`. The defaults stay 1 / 0.1.0. Gradle also accepts `FP_KEYSTORE_PROPERTIES` (properties file outside the tree).
- **Never committed:** keys, passwords, generated outputs from the throwaway runs. `.gitignore` gains `*.jks`, `*.keystore`, `*.p12` and the `fdroid/` scratch dirs. The committed `static/fdroid/` holds only `README.md`, and `published.json` is the null placeholder.
- **Serving.**
  - `vercel.json` headers: `*.apk` → `application/vnd.android.package-archive` + `max-age=31536000, immutable` (versioned names). Everything else under `/fdroid/` → `max-age=300, must-revalidate`, CORS `*`, nosniff. `*.jar` → `application/java-archive`.
  - No route under `/fdroid`.
  - The service worker returns early for `/fdroid/` (cache keys v3 → v4).
  - `src/lib/fdroid/serving.test.ts` pins all three.
- **`/android` page** (marketing layout, SEO row, footer link "Android app"):
  - F-Droid deep link `fdroidrepos://familyplanz.com/fdroid/repo?fingerprint=<FP>`, QR (`/fdroid/qr.svg`, made at publish time by the `qrcode` package that fdroidserver already needs, so there is no new npm dep), grouped fingerprint, and steps;
  - an APK download button, hidden when there is no APK;
  - a Play "coming soon" placeholder with the signer note;
  - "Coming soon" when nothing is published yet.

  Tests: `src/lib/fdroid/release.test.ts` (link format, placeholder) and `src/routes/(marketing)/android/page.ssr.test.ts` (SSR with no release, with a release, and with a repo but no APK).
- **`.github/workflows/android-release.yml`** (release-only):
  - Triggers: `android-v*` tag push and `workflow_dispatch` with `dry_run` (default true). `concurrency: android-release`, `contents: write`. Actions pinned to SHAs (checkout v4.2.2, setup-java v4.7.1, setup-android v3.2.2, setup-python v5.6.0); fdroidserver 2.4.5.
  - Steps: Temurin 21, SDK platform 37 + build-tools 36, `:app:mobileGate`, then the publish script in env mode from same-named secrets.
  - A dry run, or a dispatch with missing secrets, generates throwaway keys in the runner and commits nothing. A tag push with missing secrets fails. A non-dry dispatch must run on a tag.
  - On a real run it commits `chore(release): F-Droid repo for <tag>` to `test` and `main` and runs `gh release create` with the APK.
  - Checks: actionlint 0 errors (shellcheck rule on), `yaml.safe_load` OK. The "Decide mode" logic ran locally for 7 trigger/secret cases.

### Evidence — throwaway end-to-end run (2026-11-03, scratch keys only)

Keys were generated under `/tmp/claude-0/fdroid-agent/keys/` (APK RSA-2048 JKS, repo RSA-4096 PKCS12), outside the worktree. Gradle used the local Maven mirror.

1. **File mode, `--version 0.1.0`.** `:app:assembleRelease` passed `apksigner verify`, with the APK signer SHA-256 `DE69E25A…989D8F` (the throwaway upload key). `fdroid update` passed. `fdroid-verify` reported: entry.jar and index-v1.jar signed, fingerprint `07E80321E4FDCC712E1E89B7F8532A180C951F698909A945E268930169164705`; index-v2 sha256 matches entry.json; `com.familyplanz.app_1000.apk` listed (0.1.0 / 1000).
2. **Env mode, `--version 0.1.1`.** The keys were base64 env vars in the test shell only. Result: 2 versions in the repo (1000, 1001), one signer. No `/tmp/tmp.*` left behind, and 0 password strings in the log.
3. **Fingerprints agree.** `published.json`, `keytool -exportcert | sha256sum` of the repo keystore, and `keytool -printcert -jarfile entry.jar` all give `07E80321…69164705`.
4. **Client check.** `fdroidserver.index.download_repo_index_v2` read `static/` over local HTTP, verified it against the committed fingerprint, and returned versions [1000, 1001] with name and summary. A wrong fingerprint was rejected ("The repository's fingerprint does not match.").
5. **Refusals.** Exit 1 for each: repo keystore in the tree, upload keystore in the tree, `TMPDIR` in the tree (the temp dir was cleaned), no `--version`, the same version again, an older version, a different repo key than published, and version `1.2`.
6. **Workflow dry-run step, run locally.** It generated runner-style throwaway keys, ran env mode and wrote the step summary. With mixed signers and fingerprint drift it only warned, as a dry run should.
7. **Cleanup.** `npm run build` passed with a release present: `/fdroid/repo/*` was in `.vercel/output/static`. Then all outputs were deleted and `published.json` was reset to null, so nothing from the throwaway runs is committed.

### Unverified / owner

- Vercel applies the `vercel.json` `headers` at deploy time; a local `vite build` does not show them. Check with `curl -sI` after the first deploy.
- Branch protection on `main`/`test` may block the bot push. If so, allow `github-actions[bot]`.
- The first real repo key and the GitHub secrets are the owner's to create (guide §2, §5).

## Needs doing

Nothing.
