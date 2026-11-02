# 267 — Android: release build works (R8 + signing config from local secrets)

Status: open

Source: #210 finish pass 2026-11-02.

## Evidence

Release has `isMinifyEnabled = true` but nothing verifies R8 keeps kotlinx-serialization/Retrofit models; no signing config, so Play upload is blocked on more than the key.

## Done

(none yet)

## Needs doing

- Add keep rules as needed; `signingConfigs.release` read from an uncommitted `keystore.properties` (absent = unsigned build, never fails CI-less local gate); `assembleRelease` green; document key generation for the owner.
- `./gradlew :app:mobileGate` green at the end.
