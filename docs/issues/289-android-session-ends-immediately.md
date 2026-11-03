# 289 — Android: session ends right after sign-in

Status: done

Source: owner 2026-11-03 — "Sessions shouldn't expire immediately".

## Done

- Root cause: release `API_BASE_URL` was `https://familyplanz.com/`; the apex 308-redirects to `www.familyplanz.com` (Vercel domain setting). Sign-in calls carry no bearer, so following the redirect worked; every signed-in call was redirected and OkHttp drops `Authorization` across hosts → server saw no token → 401 → app ended the session.
- Fix: base URL `https://www.familyplanz.com/`; the API clients no longer follow redirects at all (a redirect now surfaces as `ApiError.Server`, never `Unauthorized`), so a host mix-up can't masquerade as a sign-out again.
- Tests: `RedirectSessionTest` (MockWebServer apex→www 308; red before: redirect followed, 401 → Unauthorized; green after: Server error, token never sent elsewhere). `SessionPersistenceUiTest` pins that a pre-sign-in calendar 401 doesn't end the next session (was already fine). `:app:mobileGate :app:assembleRelease` green, 226 tests.
- Shipped in F-Droid 0.2.1.

## Needs doing

(none)
