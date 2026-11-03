# Android release build (owner guide)

Issue #267. Release = R8-minified, points at `https://familyplanz.com/`.

## 1. Generate the upload key (once)

Keep the keystore **outside the repo** and the passwords in your vault (lose both = orphaned app):

```sh
keytool -genkeypair -v -keystore ~/keys/familyplanz-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Enroll in **Play App Signing** in the Console; this key is only the upload key.

## 2. `apps/android/keystore.properties`

Gitignored (`apps/android/.gitignore` also ignores `*.jks` / `*.keystore`). Create it:

```properties
storeFile=/home/you/keys/familyplanz-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` may be absolute or relative to `apps/android/`. File absent → release builds still
succeed, just **unsigned** (fine for local checks, not uploadable).

## 3. Build

From `apps/android/`:

```sh
./gradlew :app:bundleRelease     # AAB for Play → app/build/outputs/bundle/release/app-release.aab
./gradlew :app:assembleRelease   # APK for sideload checks → app/build/outputs/apk/release/
```

Check signing: `keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab`.

Versions come from the release tag, not from editing `app/build.gradle.kts` (#287).
Pass `-PfpVersionName=0.2.0 -PfpVersionCode=2000`, where
versionCode = X*1_000_000 + Y*1_000 + Z for tag `android-vX.Y.Z`. That way
every release gets a strictly higher versionCode, as both Play and F-Droid require.
Without them you get the defaults (1 / 0.1.0), which are only for local checks:
```sh
./gradlew :app:bundleRelease -PfpVersionName=0.2.0 -PfpVersionCode=2000
```

`keystore.properties` can also live outside the tree: set `FP_KEYSTORE_PROPERTIES=/path/to/it`.

## F-Droid + GitHub release (#287)

The self-hosted F-Droid repo, the publish script (file mode or env-var mode for cloud
sessions), and the release-only GitHub workflow are covered in [fdroid-repo.md](fdroid-repo.md).

GitHub → Settings → Secrets and variables → Actions holds the secrets. Use the same names
as the script's env mode: `FP_UPLOAD_KEYSTORE_B64`, `FP_UPLOAD_KEYSTORE_PASSWORD`,
`FP_UPLOAD_KEY_ALIAS`, `FP_UPLOAD_KEY_PASSWORD`, `FDROID_REPO_KEYSTORE_B64`,
`FDROID_REPO_KEYSTORE_PASSWORD`, `FDROID_REPO_KEY_PASSWORD`. This workflow is the one
exception to the no-hosted-CI ruling (#184). To release:

```sh
git tag android-v0.2.0 && git push origin android-v0.2.0
```

## R8

Keep rules live in `app/proguard-rules.pro`. kotlinx-serialization, Retrofit 3 and OkHttp ship
their own consumer rules; the app file only pins what those cannot know (see comments there).
If a release build crashes on JSON parsing or a Retrofit call, retrace with
`app/build/outputs/mapping/release/mapping.txt`.
