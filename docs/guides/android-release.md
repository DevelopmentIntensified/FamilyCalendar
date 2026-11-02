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

Bump `versionCode` (and `versionName`) in `app/build.gradle.kts` before every upload.

## R8

Keep rules live in `app/proguard-rules.pro`. kotlinx-serialization, Retrofit 3 and OkHttp ship
their own consumer rules; the app file only pins what those cannot know (see comments there).
If a release build crashes on JSON parsing or a Retrofit call, retrace with
`app/build/outputs/mapping/release/mapping.txt`.
