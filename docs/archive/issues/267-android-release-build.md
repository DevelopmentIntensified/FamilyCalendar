# 267 — Android: release build works (R8 + signing config from local secrets)

Status: done

Source: #210 finish pass 2026-11-02.

## Evidence

Release has `isMinifyEnabled = true` but nothing verifies R8 keeps kotlinx-serialization/Retrofit models; no signing config, so Play upload is blocked on more than the key.

## Done

- `:app:assembleRelease` (R8 on) green. Library consumer rules cover reachable DTOs + the Retrofit
  interface, but R8 **removed `FocusCommandDto`** (repo discards it) so the dex Signature of
  `enqueueFocusCommand` became `Continuation<Object>` -> kotlinx converter would throw at runtime
  (uncaught by `apiCall`; focus start/stop crash in release). `app/proguard-rules.pro` now keeps all
  `@Serializable` classes in `com.familyplanz.app.data` (allowobfuscation). Evidence: dexdump of the
  release APK shows `Continuation<? super FocusCommandDto>` on `api/taskfocus/commands`; mapping.txt
  keeps every `$$serializer` + `Companion.serializer()`.
- `signingConfigs.release` created only when `apps/android/keystore.properties` exists
  (storeFile/storePassword/keyAlias/keyPassword); absent -> `app-release-unsigned.apk`, build green.
- `apps/android/.gitignore`: `keystore.properties`, `*.jks`, `*.keystore`.
- Owner guide: `docs/guides/android-release.md` (keytool, properties file, `:app:bundleRelease`);
  `docs/play-store-listing.md` signing section points at it.
- Gate: `:app:mobileGate` + `:app:assembleRelease` green (see #268 run, same tree).

## Needs doing

(none)
