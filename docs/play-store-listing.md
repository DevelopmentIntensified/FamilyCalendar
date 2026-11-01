# Play Store listing — Family Planz (native Android)

Draft pack for the first Google Play submission of `apps/android/` (issue #210, slice 7).
Package id `com.familyplanz.app`, label "Family Planz" (`apps/android/app/src/main/res/values/strings.xml`).
Everything console-side here is an owner action; nothing below is verified against the live Play Console UI.

**Content rule (owner directive, non-negotiable, applies to every word and image of this listing):**
no LGBT/trans or same-sex family imagery or wording, ever. Family = man + woman + children.
Only these emoji, only in family contexts: 👪 👨‍👩‍👧‍👦. Anything else in copy or graphics is a defect.

**Claims rule:** copy may only claim features below (what exists; sources: #210, CONTEXT.md).
Do not advertise features that are web-only or unbuilt; no invented features, budgets, or costs.

Approved claims: shared family calendar with events + RSVP + family sharing · tasks with
assignment handoff (accept/decline) · completion history · Day Dashboard (today's events,
Top-3 Priorities, Family Task Board) · grocery check-off with store memory ·
natural-language quick-add ("a parse is a hint, never a commit") · runs as mobile web PWA
and as this native Android app (iOS is future — omit from store copy).

---

## 1. App identity

### Store title — `Family Planz` (12/30 chars)
Unmodified display name comes from `strings.xml`; keep store title byte-identical for search continuity.

### Short description (≤80 chars — 72/80)

> Shared calendar, tasks, and groceries that keep your family on one page.

### Full description (≤4000 chars — 1393 as drafted; recount after any edit — emoji count as 2 UTF-16 units in Play counters)

> 👪 Family Planz keeps your family on the same page — everything happening today, everything
> that needs doing, and everything to pick up on the way home. Mom and Dad plan the week;
> the kids always know what's due.
>
> **SHARED FAMILY CALENDAR**
> • Family events the whole household sees, with repeating schedules, times, and locations
> • RSVP so everyone knows who is coming
> • One calendar for the family: planning stays together, not split across apps
>
> **TASKS THAT ACTUALLY MOVE**
> • Priorities and due dates, so the important work is sorted first
> • Hand a task to another family member — they accept or decline, and it lands on their list
> • Completion history, so "did that happen?" has an answer
>
> **DAY DASHBOARD**
> • Today's events, the Top-3 Priorities for the family, and the Family Task Board on one
> screen — a good start to the day at breakfast.
>
> **GROCERIES**
> • A check-off list sorted the way you shop — by store
> • The app remembers which store you buy each item at and orders the list accordingly
> • Checked-off items step aside until the next shopping run
>
> **QUICK ADD**
> • Type a sentence and the app fills the form for you — you always confirm before it saves
>
> **AND ON THE WEB**
> • Family Planz also runs in the browser — family data travels with the family account,
> on phones and computers alike.
>
> We would love to hear how Family Planz shapes your week — tell us publicly on Google Play.

Copy notes:
- Family wording obeys the content rule; 👪 is the only emoji used here.
- No claims of iOS availability, push notifications, bills/spend tracking, OCR, or Daily Verse.
- Quick-add phrasing keeps the confirm-before-save behavior from the domain contract
  (a parse is a hint, never a commit).
- Claims map to evidence below; every marketing line must trace to a claim in the header list.

### Claims → evidence map

| Copy claim | Where it exists |
| --- | --- |
| Calendar events, repeating schedules, time, location, RSVP, creator | #210 slice 3 (`GET /api/events` month pipeline, native `CalendarScreen` renders priority/time/location/rsvp/creator) |
| Task list with priority/due/assignee; complete toggle | #210 slice 2 (`TaskListScreen`, `PUT toggleComplete`, wire-tested) |
| Assignment handoff accept/decline | CONTEXT.md (Task, Requested/To Accept); native slice 5 pending |
| Completion history | CONTEXT.md (Task) |
| Day Dashboard: Top-3 Priorities, Family Task Board, today's events | CONTEXT.md (Day Dashboard, Top-3 Priorities, Family Task Board) |
| Grocery check-off + store memory, store-order sorting | CONTEXT.md (Grocery List, Store, Store Memory) |
| Quick-add parse → prefilled form, user confirms | CONTEXT.md (Bill quick-add, parse-is-a-hint); #210 slice 4 (`/api/parse-event`) |
| Mobile web PWA | shipped; #210 only names iOS future |

---

## 2. Listing assets checklist

Play-listing specs to verify against the Console UI at submission time (values below are the
current standard, treat as UNVERIFIED): phone screenshots PNG/JPEG ≥320 px, ≤3840 px, 9:16
portrait recommended, at least 2, at most 8; Play Store icon 512×512 PNG; feature graphic
1024×500 PNG/JPEG, no alpha.

| # | Asset | Spec | What goes in it | Status |
| --- | --- | --- | --- | --- |
| 1 | App icon (store) | 512×512 PNG, max 1 MB (alpha per live Console spec — UNVERIFIED) | The existing launcher art flattened to the store raster — `apps/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` + `drawable/ic_launcher_foreground.xml` is the source art. Export at production vector resolution; no text. | TODO (human) |
| 2 | Launcher adaptive icon fields | 108dp grid: background + foreground layers; content inside ~66dp safe-zone circle centered | Already adaptive in repo (`mipmap-anydpi-v26/`, `ic_launcher_round.xml`). No listing action — verify foreground art stays inside the safe zone. | Check |
| 3 | Feature graphic | 1024×500 PNG/JPEG, no alpha | Single landscape frame, app-as-scene, no fake UI promises, no screenshots-of-nothing text banners; any people shown must obey the content rule (man + woman + children; 👪/👨‍👩‍👧‍👦 emoji only). | TODO (human) |
| 4a | Phone screenshot 1 — Task list | 9:16 device shot | Native `TaskListScreen` carrying real family data: priority/due/assignee meta visible (proven renderer in #210 slice 3 live run). | TODO (human) |
| 4b | Phone screenshot 2 — Calendar month | 9:16 device shot | Native `CalendarScreen` month grid with seeded events (month window + grouping already verified). | TODO (human) |
| 4c | Phone screenshot 3 — Calendar day view | 9:16 device shot | Native day view (client-side bucket filter). | TODO (human) |
| 4d | Phone screenshots 4–8 (optional filler) | 9:16 device shots | When slices 4–6 land on Android: event quick-add (sentence → prefilled form), grocery check-off list, Day Dashboard. **Capture only Android screens the shipped app renders.** Never photograph the PWA for this listing — the pack describes the Play listing of the native app. | Pending slices 4–6 |
| 5 | Tablet screenshots | optional | Skip until tablet layout is real (minSdk 26 phones first). | Skip |

Settings/token screen (`SettingsScreen` token paste) is functional plumbing, not listing material — never shoot it.
All shots: real device (emulator still has unverified gesture paths per #210 slice 2; headless WHPX taps unreliable).

---

## 3. Owner-only Play Console steps

Every item in this section is the owner's; UNVERIFIED means no one has confirmed it against
code, server, or the live Console.

### Signing key (human step — per #210 slice 7)
- Generate the upload keystore **outside the repo** (never commit it, never into `apps/android/`):
  `keytool -genkeypair -v -keystore familyplanz-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
- Record keystore + key passwords in the owner's password vault. Losing both = orphaned app.
- Enroll in **Play App Signing** during app creation in the Console (Google keeps the release
  key; the upload key signs each `.aab`). Upload bundles are signed with that upload key.
- Repo currently has **no release signing config** — `buildTypes.release` only minifies
  (`apps/android/app/build.gradle.kts`). When wiring signingConfig, use a properties file
  outside the repo, and never let the password enter VCS.
- Release artifacts point at production: `API_BASE_URL https://familyplanz.com/`
  (debug points at `test.familyplanz.com`). Bundle command: `:app:bundleRelease`.

### Privacy Policy URL slot — UNVERIFIED
- Console field expects a public URL. Suggested slot: `https://familyplanz.com/privacy` —
  UNVERIFIED: nobody has confirmed such a page exists. Owner writes and publishes the policy
  **before** filling the field; the policy must state exactly what the Data safety form below
  declares (email attached to the account, family/user content, no ads, no data sale).
- Policy must also disclose the Anonymous Account retention behavior: unclaimed accounts are
  deleted after the 90-day Inactivity Window with prior warning (CONTEXT.md).

### Content rating — guidance, UNVERIFIED
- Questionnaire path: Console → App content → Content rating. Answer truthfully; expected
  result **Everyone** (PEGI 3): no violence, no gambling, no mature themes; user-generated
  content (family events/tasks/templates) is the only sensitive area — answer the UGC
  questions as "yes, users create content", since other family members generate it.
- No age-restricted features to declare. Final rating is whatever the questionnaire returns —
  UNVERIFIED until submitted.

### Audience declaration — guidance, UNVERIFIED
- Target-audience pick: **13 and older**, older adults included. Do **not** select
  "appeal to children under 13" — that pulls the Families program requirements (data
  collection limits, ads rules, extra review).
- Family features (Kids' Schedule, Member Type `child`) are viewer-side for **parents**;
  that is not child-targeting — the Families-program answer stays "no".
- App category: family/planning-helper fit (Lifestyle or Productivity family category);
  owner picks — UNVERIFIED.

### Ads declaration
- Console → App content → Ads: **No ads**. MVP ships with no ad SDK anywhere in
  `apps/android/` gradle deps (verified from the dependency list — no ads libraries present).

### Data safety draft — every row UNVERIFIED until the owner confirms in Console

| Console question | Draft answer | Basis |
| --- | --- | --- |
| Data collected | **Yes** | Tokens + account info traverse the network by design |
| Personal info: Email address | Collect: yes · Share with others: **no** · Purpose: **Account management** | Email is only attached to accounts via Claiming / Magic Link (CONTEXT.md); no third-party sharing in the codebase |
| Personal info: User IDs (account/api token id) | Collect: yes · Share: no · Purpose: **App functionality** | `fp_…` API token: server-issued credential; stored on-device in DataStore (`apps/android/app/src/main/kotlin/com/familyplanz/app/data/DataStoreTokenStore.kt`); sent as bearer auth to the familyplanz.com API |
| User content: calendar events, tasks, grocery items | Collect: yes · Share: no · Purpose: **App functionality** | This is the family's data store — the product, not telemetry |
| Data shared with third parties / sold | **No** | No ads SDK, no analytics/telemetry (MVP), no data sale — owner attestation |
| Data in transit encrypted | **Yes** — HTTPS/TLS to `https://familyplanz.com/` | API base URLs in `apps/android/app/build.gradle.kts` |
| Data deletable by users | Partial — trust terms: unclaimed Anonymous Accounts auto-delete after the 90-day Inactivity Window with prior in-app warning (CONTEXT.md). Registered-account deletion flow: **UNVERIFIED** — owner confirms what exists |
| Family-account deletion | UNVERIFIED — owner confirms server-side deletion machinery before answering |

### Other Console declarations (owner confirms each)
- App access (Console question "does the app require credentials to work"): **no anonymous
  self-serve use is fully open** — the native app boots to a token screen until a pasted
  `fp_…` API token (401 → token screen, #210 slice 2), so the owner answers "no" and supplies
  demo instructions (bootstrap a throwaway anonymous account per #210's live-run steps) —
  UNVERIFIED.
- Government-issued ID, financial features, health: all **No**. UNVERIFIED.

---

## 4. Versioning

Current values — `apps/android/app/build.gradle.kts`:

- `versionCode = 1` — the number the Play Store tracks. **Never reset or reuse.** Bump by +1
  for **every** upload, including rejected or internal-test-only bundles.
- `versionName = "0.1.0"` — what users see. Bump the patch digit (`0.1.1`, `0.1.2`, …) for
  store-visible fixes; move the minor (`0.2.0`, …) only when a new store-worthy feature slice
  lands (slices 4–6 = natural `0.2.x` territory). Major stays 0.x while pre-1.0.
- Rules for releases (owner discipline):
  - One versionCode per binary forever; versionName may repeat across tracks if needed but
    never regress.
  - Release notes (What's new) go in `docs/` or with the bundle — keep listing copy and
    versionName bumps aligned in the same submission.

---

## 5. Human steps checklist

Ordered owner path from today's tree to first store presence.

1. [ ] Create the Play Console developer account (owner identity; one-time Google
       registration fee — amount not stated here, check Google's pricing when you do it).
2. [ ] Publish the Privacy Policy page (slot UNVERIFIED above) — before any Console field
       gets filled.
3. [ ] Create the app in Console: type **App**, "Family Planz", en-US default, not a game,
       paid/free decision at creation (free is assumed UNVERIFIED — verify with owner).
4. [ ] Generate the upload keystore (command + password-vault discipline above); never
       commit it.
5. [ ] Wire release signing via a gitignored properties file; build the first signed
       bundle: `:app:bundleRelease` (release profile hits `https://familyplanz.com/`).
6. [ ] Capture listing art on a **real device**: 3 shots minimum from §2 rows 4a–4c, the
       512 icon export from the existing launcher art, feature graphic. Never PWA shots.
7. [ ] Fill identity: store title `Family Planz`, short description (72/80) and full
       description above — only after verifying char counts.
8. [ ] App content questionnaire: content rating (expect Everyone), ads = no, audience
       13+, Data safety table above, app-access notes. Confirm each UNVERIFIED row.
9. [ ] Enroll Play App Signing at first AAB upload; upload bundle to the internal
       testing track first for on-device verification (gesture paths still need human
       driving per #210 slices 2–3).
10. [ ] Write release notes for the first bundle; tag versionCode in git or the picker's
        history (never reuse a burned versionCode).
11. [ ] Production rollout only after internal track smoke passes on a physical device
        (cold-start and Core Paths: task list, calendar month/day; the real-device timing
        budget is still the human step from #210 slice 1).
12. [ ] Publish `assetlinks.json` on `https://familyplanz.com/` **when** magic-link app
        links become intent filters on the manifest (currently the manifest has only the
        launcher intent — no `https://familyplanz.com/claim/verify/...` filters yet, so
        this step is post-claim slice work).
13. [ ] Close-out: move #210 slice 7 to DONE with the assembly numbers and post the
        public listing URL back to the tracker.

---

## Verification notes (doc-only change)

- Touch surface: this file only (`docs/play-store-listing.md`). No src, no build, no tests.
- Copy obeys the content rule; only the two approved emoji appear (👪, 👨‍👩‍👧‍👦). Claims trace
  to the header list; no invented features, no budget/price numbers.
- Every Console-side value is flagged UNVERIFIED. Nothing here was run against Play
  Console — that is section 3's entire premise (owner-only work).
