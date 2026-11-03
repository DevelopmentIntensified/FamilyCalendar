# Self-hosted F-Droid repo (owner guide)

Issue #287. Users add `https://familyplanz.com/fdroid/repo` to the F-Droid app and get
Family Planz plus every update. The site page is https://familyplanz.com/android.

Moving parts:

| Path | What it is |
| --- | --- |
| `fdroid/config.yml` | fdroidserver config. No secrets: keys and passwords come from env vars. |
| `fdroid/metadata/` | App metadata + fastlane-style texts (`en-US/`), changelogs per versionCode. |
| `scripts/fdroid-publish.sh` | Build signed APK, `fdroid update`, verify, write the outputs below. |
| `scripts/fdroid-verify.py` | Client-style check of the signed index (run by the script). |
| `static/fdroid/repo/`, `archive/`, `qr.svg` | Generated. Served by Vercel. Committed. |
| `src/lib/fdroid/published.json` | Generated. Public repo fingerprint + latest APK. Committed. |
| `.github/workflows/android-release.yml` | Release-only CI (tag push / manual dispatch). |

## Two keys, both outside git

1. **Upload key**: signs the APK. Same key as the Play upload key (#267,
   [android-release.md](android-release.md)).
2. **Repo key**: signs the F-Droid index. Clients pin its fingerprint when they add the repo.

The script refuses to run if either keystore (or its temp dir) is inside the git tree.
`.gitignore` also ignores `*.jks`, `*.keystore` and `*.p12`.

> **Lose the repo key = every installed user stops getting updates.** Their F-Droid
> client rejects an index signed by a new key, and they have to remove the repo and add
> it again by hand. Losing the upload key is just as bad: Android refuses an APK
> update signed by a different key, so users have to uninstall. Back up both keystores
> and their passwords (password manager plus an offline copy) **before** the first publish.

## 1. Install fdroidserver (once)

Linux/macOS/WSL (on Windows, use WSL or the GitHub workflow):

```sh
python3 -m venv ~/.venvs/fdroid
~/.venvs/fdroid/bin/pip install fdroidserver==2.4.5
export PATH="$HOME/.venvs/fdroid/bin:$PATH"   # gives `fdroid`
```

You also need a JDK (`keytool`, `jarsigner`) and the Android SDK build-tools (`apksigner`).
The script finds the SDK through `ANDROID_HOME` or `sdk.dir` in `apps/android/local.properties`.

## 2. Create the repo key (ONCE, ever)

```sh
mkdir -p ~/keys && keytool -genkeypair -v -keystore ~/keys/familyplanz-fdroid-repo.p12 \
  -storetype PKCS12 -alias repokey -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Family Planz F-Droid repo"
```

Back it up now (see the warning above). With PKCS12 the key password is the store password.

## 3. Publish a release (local, file mode)

1. Upload key: `apps/android/keystore.properties` as in [android-release.md](android-release.md).
   Its `storeFile` must point outside the repo. You can also set
   `FP_KEYSTORE_PROPERTIES=/path/outside/keystore.properties`.
2. Optional: `apps/android/firebase.properties` (#273,
   [android-push.md](android-push.md)). The self-hosted build may include Firebase.
3. Add a changelog: `fdroid/metadata/com.familyplanz.app/en-US/changelogs/<versionCode>.txt`
   (versionCode rule below).
4. Run:

```sh
export FDROID_REPO_KEYSTORE=~/keys/familyplanz-fdroid-repo.p12
scripts/fdroid-publish.sh --version 0.2.0      # prompts for the repo key password
git add static/fdroid src/lib/fdroid/published.json fdroid/metadata
git commit -m "chore(release): F-Droid repo for android-v0.2.0"
git push origin test     # then main, as usual; Vercel deploys
```

Passwords can come from `FDROID_REPO_KEYSTORE_PASSWORD` / `FDROID_REPO_KEY_PASSWORD`
instead of the prompt. `FDROID_REPO_KEY_ALIAS` defaults to `repokey`.

The first publish writes the repo fingerprint into `src/lib/fdroid/published.json`. Every
later publish **refuses** if the key's fingerprint differs from that file, or if the
versionCode is not above the published one, or if the repo would end up with APKs from
two different signers.

`--dry-run` relaxes those checks for pipeline tests (throwaway keys OK). **Never commit
dry-run output.** Undo it with
`git checkout -- static/fdroid src/lib/fdroid/published.json && git clean -fdx static/fdroid`.

### versionCode

The script sets the version from `--version X.Y.Z` (or from the tag `android-vX.Y.Z` in CI):
`versionName = X.Y.Z`, `versionCode = X*1_000_000 + Y*1_000 + Z` (0.2.0 → 2000, 1.4.12 →
1004012). Gradle reads them as `-PfpVersionCode` / `-PfpVersionName`. Without them, the
`build.gradle.kts` defaults apply (1 / 0.1.0, for local and debug builds only). So every
higher semver gets a higher versionCode, and you never edit `build.gradle.kts` for a
release. Minor and patch must stay ≤ 999. Use the same tag for Play uploads, because
Play also requires a strictly increasing versionCode.

## 4. Publish from a cloud agent session or CI (env mode)

Set these and the script decodes the keystores into a `mktemp -d` dir (`chmod 700`,
outside git), writes the properties/config there, and deletes it on exit (`trap`). The
values go through files and env vars only, never argv, and are never echoed.

| Env var | Value |
| --- | --- |
| `FP_UPLOAD_KEYSTORE_B64` | `base64 -w0 familyplanz-upload.jks` |
| `FP_UPLOAD_KEYSTORE_PASSWORD` | upload keystore password |
| `FP_UPLOAD_KEY_ALIAS` | upload key alias (`upload`) |
| `FP_UPLOAD_KEY_PASSWORD` | upload key password |
| `FDROID_REPO_KEYSTORE_B64` | `base64 -w0 familyplanz-fdroid-repo.p12` |
| `FDROID_REPO_KEYSTORE_PASSWORD` | repo keystore password |
| `FDROID_REPO_KEY_PASSWORD` | repo key password (same as the store password for PKCS12) |

Then run `scripts/fdroid-publish.sh --version 0.2.0` as above.

**Store them under the cloud environment's settings (environment secrets), not in chat or
git.** Never paste a key or password into a conversation.

> **Anyone with access to that environment (or to the GitHub repo's Actions secrets) can
> sign releases** that every installed phone will accept as a genuine update. Only add
> them where you'd hand over the keys themselves, and rotate the environment, not the
> keys, when people leave. Rotating a key breaks updates (see above).

## 5. GitHub Actions release (release-only CI)

`.github/workflows/android-release.yml` is the **one exception** to the no-hosted-CI
ruling (#184). The owner approved it for releases only. It never runs on branch pushes
or PRs.

**Secrets:** GitHub → repo → Settings → Secrets and variables → Actions → New repository
secret. Add the seven names from the table above, spelled the same. Optional:
`FP_FIREBASE_PROPERTIES` = the full text of `apps/android/firebase.properties`. Without
it, CI builds have push disabled.

**Release:**

```sh
# add fdroid/metadata/com.familyplanz.app/en-US/changelogs/2000.txt first (0.2.0 → 2000)
git tag android-v0.2.0 && git push origin android-v0.2.0
```

The workflow runs these steps:

1. Run `:app:mobileGate`.
2. Copy the published repo state from `origin/main`.
3. Run the publish script in env mode.
4. Commit `static/fdroid/` and `published.json` to both `test` and `main` as
   `chore(release): F-Droid repo for <tag>`. The Vercel deploy follows.
5. Create a GitHub Release for the tag with the signed APK attached.

A tag push with any secret missing fails loudly.

**Dry run:** Actions → Android release → Run workflow (`dry_run` is ticked by default).
It generates throwaway keys inside the runner, runs the whole pipeline, and commits and
releases nothing. If you untick `dry_run`, the run must be started on an `android-v*`
tag, and the secrets must be present.

## 6. How users add the repo

On https://familyplanz.com/android:

- On the phone, tap **Add to F-Droid**. It opens
  `fdroidrepos://familyplanz.com/fdroid/repo?fingerprint=<FP>`. On a computer, scan the
  QR code with the phone.
- Or in F-Droid: Settings → Repositories → + → enter `https://familyplanz.com/fdroid/repo`,
  then check the fingerprint shown on the page.
- Then search for "Family Planz" and install. Updates show up in F-Droid.
- The page also offers a direct APK download. A direct install does not auto-update, but
  F-Droid can update it later (same signer).

## Play vs F-Droid signer

With Play App Signing, **Google** re-signs Play installs with its app signing key. The
APKs here are signed with **our upload key**. Android only installs an update signed by
the same key, so a Play install and an F-Droid/APK install cannot update each other. To
switch, the user uninstalls first (family data lives on the server; they sign in again).

## Serving notes

- Plain static files on Vercel (`static/fdroid/` → `/fdroid/`). No SvelteKit route
  under `/fdroid`, and the service worker skips `/fdroid/` (cache keys bumped to v4).
- `vercel.json` headers:
  - `*.apk`: `application/vnd.android.package-archive`, `immutable` for a year. Names are
    versioned (`com.familyplanz.app_<versionCode>.apk`) and never reused.
  - Everything else (indexes, `entry.jar`, QR): `max-age=300, must-revalidate`.
  - `*.jar`: `application/java-archive`.
- After the first real deploy, check the headers:
  `curl -sI https://familyplanz.com/fdroid/repo/entry.jar` and the same for the APK.
