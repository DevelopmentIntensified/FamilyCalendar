# 273 — Android: receive FCM pushes (register token, show notifications)

Status: open

Source: owner call 2026-11-02 (Firebase for push; reminders without server push).

## Evidence

Depends on #272's API (`POST/DELETE /api/devices`). Firebase project + config are an owner step; the build must succeed without them.

## Done

(none yet)

## Needs doing

- Add firebase-messaging WITHOUT the google-services Gradle plugin: init Firebase manually from BuildConfig fields read from `apps/android/firebase.properties` (gitignored; projectId, applicationId, apiKey, gcmSenderId). Absent -> push disabled, app works, build green.
- FirebaseMessagingService: onNewToken -> POST /api/devices (when a bearer token exists; retry via WorkManager on failure); onMessageReceived -> notification on an 'Family activity' channel, tap opens the app (deep link from data.link best-effort). Register after token entry; DELETE on sign-out/token clear.
- Reuse #271's POST_NOTIFICATIONS permission flow and notification helper (don't duplicate).
- Wire-contract test (MockWebServer) for register/unregister; unit test for message -> notification mapping; owner doc: create Firebase project, add Android app com.familyplanz.app, copy values into firebase.properties, create service account -> Vercel env FCM_SERVICE_ACCOUNT_JSON.
- Gate: Android `:app:mobileGate` / web `npm run build` + targeted vitest green.
