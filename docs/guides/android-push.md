# Android push (owner guide)

Issue #273 (app) on top of #272 (server). No `google-services.json` and no
google-services Gradle plugin: the app reads four values from a gitignored
properties file and initializes Firebase itself. File absent → push off, the
app (and the build/gate) work exactly as before.

## 1. Firebase project + Android app

1. https://console.firebase.google.com → create (or pick) the project.
2. Add app → Android → package name **`com.familyplanz.app`** (debug and
   release share it). Skip the "download google-services.json" and "add SDK"
   steps — or download it just to copy values from it, then delete it.

## 2. `apps/android/firebase.properties` (gitignored)

From Project settings → General → Your apps (or the downloaded json):

```properties
projectId=familyplanz-xxxx          # project_info.project_id
applicationId=1:1234567890:android:abc123   # client[0].client_info.mobilesdk_app_id
apiKey=AIza...                      # client[0].api_key[0].current_key
gcmSenderId=1234567890              # project_info.project_number
```

Any value missing/blank → push disabled. They become `BuildConfig.FIREBASE_*`
at build time, so rebuild after editing. These are client identifiers (they
ship inside every APK), not secrets, but the file stays out of git by choice.

## 3. Server (#272)

1. Firebase → Project settings → Service accounts → Generate new private key.
2. Vercel → Settings → Environment Variables: `FCM_SERVICE_ACCOUNT_JSON` =
   that JSON (base64 ok: `base64 -w0 key.json`), Preview + Production; redeploy.
3. Migration 023 (idempotent):
   `npx dotenv -e .env.preview -- node scripts/db-exec.mjs sql/migrations/023-device-tokens.sql`,
   then the same with `.env.prod`.

Details: `docs/guides/task-api-spec.md` → "Android push devices".

## 4. Check on a phone

Install a build made with the file present, enter an API token, allow
notifications. Then on the web: assign the phone's user a task → a
**Family activity** notification; move an event in the next 24 h → an
**Event updates** notification (and the reminder follows). Settings → Apps →
Family Planz → Notifications lists the channels: Event reminders, Family
activity, Event updates (each can be turned off on its own).

## What the app does

- Token: registered (`POST /api/devices`) on every FCM `onNewToken`, after API
  token entry, and at app start; network/5xx failures retry via WorkManager.
  Sign-out: `DELETE /api/devices` with the old token, FCM token deleted (so a
  failed DELETE still gets pruned server-side), reminders cancelled.
- `events_changed` (silent): expedited one-off refresh of the cached months
  covering the reminder horizon → reminders re-planned → "Event updates"
  summary for events in the next 24 h that were added, cancelled, moved, or
  had title/location/end changed (first-ever cache fill never notifies).
- `notification`: posted on **Family activity**; tap opens the app on the tab
  matching `data.link` (`/calendar/tasks` → Tasks, `/calendar…` → Calendar).
- Signed out: every push is ignored.
