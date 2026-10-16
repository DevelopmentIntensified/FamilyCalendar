# 157 — Advisory: @capacitor/android + @capacitor/ios 7.0.1 — CRITICAL, in range

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 11/15 — highest-severity advisory found; native shell shipped from this repo (`scripts/build-capacitor.mjs`), exploit needs a device/network attacker rather than a web request.

## Done

- **Bumped @capacitor/{android,ios,cli} to 7.6.9** (Option A, same major). The cli's `tar@7.5.22` + `@xmldom/xmldom@0.9.12` chains are patched — the critical/high install-time chain cleared (`npm ls` verified).
- Web (Vercel) gates green. **Residual, human step:** the packaged Android/iOS shell needs a native rebuild (`npm run capacitor:build` / scripts/build-capacitor.mjs) + on-device smoke of remote-content loading before the app binary ships the fix — nothing in the web deploy proves it.

## Done

- Installed 7.0.1 both (package-lock; range `^7.0.1`). Advisory: remote content can be loaded at the app origin via the internal HTTP proxy path — affected `7.0.0 – 7.6.8` → fix **7.6.9** (7.x line current tail: 7.6.9; Capacitor 8.5.2 also exists).
- Also in range: `@capacitor/cli@7.0.1` high (range includes `…3.0.0-alpha.0 – 7.4.5…`, via `tar`), and `tar <=7.5.20` critical (12 file-write/path-traversal advisories) reachable through the cli chain — install/build-time, not app runtime.
- `@capacitor/core@7.0.1` itself not flagged. Web (Vercel) deploy unaffected by any of this — exposure is the packaged Android/iOS app only.

## Needs doing

- Option A — bump `@capacitor/android`, `@capacitor/ios`, `@capacitor/cli` to 7.6.9 (same major). Cost: native rebuild + on-device smoke test; re-run `npm ls tar` to confirm the critical chain cleared, else add an override.
- Option B — jump to Capacitor 8 (8.5.2 current) with the bump. Cost: major-version migration (config/plugin changes) across both platforms, longer bake time — but avoids doing 7.6.9 twice.
- Not choosing (issue 136).
