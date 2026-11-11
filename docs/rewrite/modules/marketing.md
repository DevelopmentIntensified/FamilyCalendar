# Port sheet: marketing

**domain** · rank 16 · port #16 · home: `src/lib/domains/marketing/` · README after the port: `src/lib/domains/marketing/README.md` (written in S1)

Public site: home, features, pricing display, roadmap/changelog, contact, waitlist, SEO tags, Android/F-Droid page.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals, feedback, access.
- **Owns tables:** `waitlist`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `________`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Prerender/SSR flags driven by `ADAPTER`; SEO tags table.
- Waitlist: rate limit + unique email (hand-run index exists in production).
- Contact: honeypot + rate limit + email rule.
- The Android page reads `src/lib/fdroid/published.json` (path used by release scripts — do not move it).
- A stray `POST /` answers with PRG + logged hints (#276).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/contact` | POST (default form action on a `+page.server.ts`; there is no `+page.svelte` here) | none (per-client-IP rate limit) | `name`, `email`, `message`, `website` (honeypot); absent field → `''`; no trimming | `json({ success: true })` 200 | 429 `Too many attempts. Try again shortly.`; 400 `Invalid submission`; 400 `All fields are required`; 400 `Please enter a valid email address`; 500 `Failed to send message. Please try again later.` | `src/routes/api/contact/+page.server.ts:24-86` |
| `/waitlist` | POST `?/join` | none (per-client-IP rate limit) | `name`, `email` (trimmed, both required); `consent` optional, only `on`/`true`/`yes` (case-insensitive) counts | `{ success: true, email, name }` | 429 `Too many attempts. Try again shortly.`; 400 `Email is required`; 400 `Name is required`; 400 `Please enter a valid email address`; 400 `You are already on the waitlist!`; 500 `We saved your spot, but the confirmation email failed to send. Please try again or contact support.`; 500 `Something went wrong. Please try again.` | `src/routes/(marketing)/waitlist/+page.server.ts:38-104` |
| `/contact` | POST (default) | none (per-client-IP rate limit) | `name`, `email`, `message`, `website` (honeypot); absent → `''` | `{ success: true }` | 429 `Too many attempts. Try again shortly.`; 400 `Invalid submission`; 400 `All fields are required`; 400 `Please enter a valid email address`; 500 `Something went wrong. Please try again.` | `src/routes/(marketing)/contact/+page.server.ts:43-107` |
| `/` | POST (default) | none | no fields read | `redirect(303, '/')` | none (logs `[#276] stray POST /` with referer/user-agent/content-type) | `src/routes/(marketing)/+page.server.ts:12-25` |

The module owns no `+server.ts`; `/api/contact` is a form-action file (see "Probably accidental").

### Rules the module must keep
- Prerender/SSR follow `ADAPTER === 'static'` for the whole `(marketing)` group — `src/routes/(marketing)/+layout.server.ts:5-6`
- `/changelog` and `/roadmap` override the group to `prerender = true` and `ssr = true` (exported from `+page.ts`, not the component) — `src/routes/(marketing)/roadmap/+page.ts:4-6`, `src/routes/(marketing)/changelog/+page.ts:4-6`
- The loader returns the request's own `origin` and `pathname`, never a hardcoded domain, plus `isLoggedIn` and `user` — `src/routes/(marketing)/+layout.server.ts:8-20` · test: `src/lib/marketing/seo.test.ts` › "self-references the origin it was given, on every environment"
- SEO is one table keyed by pathname: the layout emits `<meta name="description">`, `<link rel="canonical">`, og/twitter tags; every page emits only its own `<title>` and never a description — `src/routes/(marketing)/+layout.svelte:24-47`, `src/lib/marketing/seo.ts:50-169` · test: `src/lib/marketing/seo.test.ts` › "/%s has a row, and the row says what the page says" and "/%s does not emit its own description"
- Every `<title>`-setting marketing route has a row whose title matches the page exactly; an indexed row's description is > 40 chars — `src/lib/marketing/seo.ts:50-127` · test: `src/lib/marketing/seo.test.ts` › "/%s has a row, and the row says what the page says"
- `noindex` rows emit `robots: noindex, follow`; `/checkout`, `/signup`, `/login`, `/forgot-password`, `/reset`, `/waitlist` are noindex, `/`, `/features` are not — `src/lib/marketing/seo.ts:95-125,168`
- `og:image` and `og:url` are absolute, built by trimming trailing slashes off the origin; `seoFor` tolerates a trailing slash and falls back to the site defaults instead of throwing — `src/lib/marketing/seo.ts:129-144` · test: `src/lib/marketing/seo.test.ts` › "points og:image at an absolute URL", "falls back to the site default rather than throwing on a new route"
- `static/brand/og.png` must exist at the declared 1200×630 — `src/lib/marketing/seo.ts:23-32` · test: `src/lib/marketing/seo.test.ts` › "exists, and is the size the tags claim"
- Waitlist: 5 joins / 10 min per IP scope (`waitlist-join`), checked before reading the form — `src/routes/(marketing)/waitlist/+page.server.ts:9-19,42-47` · test: `src/routes/(marketing)/waitlist/page.server.real.test.ts` › "refuses a rate-limited caller before touching the database or the mailer"
- Waitlist stores one row per lowercased address (`uniqueIndex waitlist_email_key`), uses `onConflictDoNothing`, and answers the duplicate with 400 — `src/routes/(marketing)/waitlist/+page.server.ts:63-84`, `src/lib/server/db/schema.ts:1011-1013` · test: `src/routes/(marketing)/waitlist/page.server.real.test.ts` › "stores one row per address; a resubmit gets the already-subscribed message", "sees Case Differences as the same address"
- Waitlist consent stamps `consentedAt`+`optedInAt` only when `consent` is on/true/yes, otherwise both stay null; preferences are always `{marketing:false,updates:false}`, status `pending` — `src/routes/(marketing)/waitlist/+page.server.ts:60-77` · test: `src/routes/(marketing)/waitlist/page.server.real.test.ts` › "does not stamp consent when the form collected none", "stamps consent only when the form collected it"
- A failed confirmation email keeps the row and returns 500 (a retry then hits the duplicate message) — `src/routes/(marketing)/waitlist/+page.server.ts:86-95` · test: `src/routes/(marketing)/waitlist/page.server.real.test.ts` › "surfaces a failed confirmation email instead of claiming success"
- Contact: 5 sends / 10 min per IP scope (`contact`), honeypot `website` filled → 400 `Invalid submission`, all three fields required, email regex, user HTML escaped, recipient `hello@familyplanz.com` — `src/routes/(marketing)/contact/+page.server.ts:10-46,49-107` · test: `src/routes/(marketing)/contact/page.server.test.ts` › "rejects honeypot filled with 400", "escapes user-supplied HTML in the email body"
- Contact sends the subject `New Contact Form Submission from <name>` and checks the provider result before claiming success — `src/routes/(marketing)/contact/+page.server.ts:79-107` · test: `src/routes/(marketing)/contact/page.server.test.ts` › "sends the contact email for full valid form", "returns failure when the email provider rejects the send"
- Every contact/waitlist failure payload carries a non-empty `error` for the inline box — `src/routes/(marketing)/contact/+page.server.ts:54-75` · test: `src/routes/(marketing)/contact/page.server.test.ts` › "does not count rate-limit budget on validation failures"
- `/android` loads the release from committed `src/lib/fdroid/published.json` (via `androidRelease()`); before the first publish it renders `data-testid="no-release"` and no download/F-Droid/QR links; a repo with no APK shows the deep link but no APK button — `src/routes/(marketing)/android/+page.server.ts:1-5`, `src/lib/fdroid/release.ts:66-115` · test: `src/routes/(marketing)/android/page.ssr.test.ts` › "renders \"coming soon\" and no download/F-Droid links before the first publish", "hides the APK button when a repo exists but no APK is listed"
- Once published the page shows `fdroidrepos://<host>/fdroid/repo?fingerprint=<FP>`, `/fdroid/qr.svg`, the grouped fingerprint and `Family Planz <version> (<n> MB)` — `src/lib/fdroid/release.ts:42-105`, `src/routes/(marketing)/android/+page.svelte:37-64` · test: `src/routes/(marketing)/android/page.ssr.test.ts` › "renders the APK button, deep link, QR and fingerprint once published"
- A stray `POST /` always answers PRG 303 back to `/` and logs the sender hints, never a 405 error page — `src/routes/(marketing)/+page.server.ts:9-25` · test: `src/routes/(marketing)/page.server.test.ts` › "logs the sender hints (referer, user-agent, content-type) for diagnosis"
- Marketing nav is the fixed four `/features`, `/pricing`, `/about`, `/contact` from `navItems`, and the layout passes the signed-in `user` to `Navbar` — `src/lib/utils/navItems.ts:22-27`, `src/routes/(marketing)/+layout.svelte:51` · test: `src/routes/(marketing)/layout.svelte.test.ts` › "passes the signed-in user to the navbar"

### Page and UI behaviour worth keeping
- Shared chrome: skip link `#main`, fixed navbar, 150 ms local fade on page content, footer with Changelog / Roadmap / Android app and a `© <year> FamilyPlanz` line, `Toaster` mounted — `src/routes/(marketing)/+layout.svelte:50-81`
- Home (`/`): hero with "Start Free Today" → `/signup` and "See Features" → `/features`, trust strip, three feature cards, 1-2-3 paste demo, closing CTA; nothing is data-driven — `src/routes/(marketing)/+page.svelte:2-457`
- `/features` is data arrays feeding the six cards: FeatureCard ×6, MomentCard ×3, before/after StrugglePanels, GalleryCards, Testimonials — `src/routes/(marketing)/features/+page.svelte:10-139,164-273` · test: `src/lib/components/marketing/marketingCards.svelte.test.ts` › "FeatureCard renders icon + title + blurb"
- Feature icons are static in-file SVG literals rendered with `{@html}`; the icon set is `calendar|bolt|users|printer|phone|clipboard|clock|smile|heart` — `src/lib/components/marketing/featureIcons.ts:1-73`
- Waitlist success swaps the form for a "Check your email" card with a "Try again" link back to `/waitlist`; the form shows an `Early Access` badge, name/email inputs, an inline `form.error` box, a disabled "Joining..." button and a privacy-policy line — `src/routes/(marketing)/waitlist/+page.svelte:18-128`
- Contact success swaps the form for "Message Sent!" with a "Send another message" button that clears name/email/message; failures show `result.data.error` in a red box; submitting shows a spinner + "Sending..." — `src/routes/(marketing)/contact/+page.svelte:43-160`
- Contact form carries the hidden honeypot `website` (tabindex -1, aria-hidden) — `src/routes/(marketing)/contact/+page.svelte:84-95`
- `/changelog`: newest-first list, tag pill when present, `<time datetime>` and en-US UTC long date, closing "Get started free" → `/signup` — `src/routes/(marketing)/changelog/+page.svelte:1-65`
- `/roadmap`: exactly three sections (Shipped / In progress / Coming next) from `roadmap`, "planned, not promised" note, "Get in touch" → `/contact` — `src/lib/data/roadmap.ts:19-69`, `src/routes/(marketing)/roadmap/+page.svelte:19-52`
- `/about` and `/privacy` are static prose; privacy carries "Last updated: October 2026", a children's-data paragraph and a services table (Cerebras, Resend, …) with what each sees — `src/routes/(marketing)/about/+page.svelte:1-114`, `src/routes/(marketing)/privacy/+page.svelte:1-129`
- The marketing theme (`--mp-*` tokens, hero wash, orbs, glass) is imported only by the marketing layout — `src/lib/marketing/theme.css:33-95`, `src/routes/(marketing)/+layout.svelte:9`

### Probably accidental (candidates to drop, owner to confirm)
- Home page `<title>` is `Family Planz - The Family Calendar That Brings Everyone Together`, but `ROUTES['/']` says `Family Planz — the shared family calendar`; the SEO test only scans child directories, so the root drift is never caught — `src/routes/(marketing)/+page.svelte:5`, `src/lib/marketing/seo.ts:51-55`, `src/lib/marketing/seo.test.ts:26-35` — og:title advertises different copy than the page
- Waitlist `use:enhance` sets `submitted = true` regardless of `result.type`, so a 400/429/500 replaces the form with the success card and the `form.error` box can never be seen — `src/routes/(marketing)/waitlist/+page.svelte:68-77` — every failure looks like success
- The waitlist success card promises a verification link and "double opt-in", but the confirmation email contains no link or code, and the page never sends one — `src/routes/(marketing)/waitlist/+page.svelte:35-42`, `src/lib/server/emails/waitlist-confirmation.ts:31-53` — claimed flow does not exist
- The waitlist server supports a `consent` field, but the page has no consent checkbox, so consent is never collected on this surface — `src/routes/(marketing)/waitlist/+page.svelte:64-116`, `src/routes/(marketing)/waitlist/+page.server.ts:60-61`
- The waitlist email and its subject use the old names "FamilyPlanner"/"Family Master" — `src/lib/server/emails/waitlist-confirmation.ts:14,27,63`, `src/lib/server/services/emailService.ts:23`, `src/routes/(marketing)/waitlist/+page.svelte:62`
- UNSURE: `/api/contact` is an actions file with no page component and no importer; it duplicates `/contact` with a different limit (3/15 min vs 5/10 min) and a different 500 message — `src/routes/api/contact/+page.server.ts:1-86`, `src/routes/(marketing)/contact/+page.server.ts:16` — likely a dead second implementation
- `ROUTES['/reset']` matches no route: the page lives at `/forgot-password/reset`, so it falls through to the site default title/description (and stays indexable) — `src/lib/marketing/seo.ts:111-115`, `src/routes/(marketing)/forgot-password/reset/+page.svelte:66`
- Gallery/hero images are hotlinked from `images.pexels.com` at build/render time instead of being served locally — `src/routes/(marketing)/+page.svelte:82`, `src/routes/(marketing)/features/+page.svelte:70-90`
- `(marketing)/+layout.server.ts` opens with the stale comment `// +page.server.ts` — `src/routes/(marketing)/+layout.server.ts:1` — copy-paste artifact
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#095](../../archive/issues/095-icon-synthesis-reads-as-calendar.md) og/twitter/canonical tag audit; owner rules on theme_color. | DESIGN | keep behaviour |
| [#194](../../archive/issues/194-marketing-glass-tiles.md) Dead theme tokens; owner fork on glass/orbs. | DESIGN | keep markup |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# marketing: 0% ported

legacy source files left (13/13, 1046 LOC):
  - src/lib/components/marketing/FeatureCard.svelte (31 LOC, ui) importers: 1
  - src/lib/components/marketing/GalleryCard.svelte (29 LOC, ui) importers: 1
  - src/lib/components/marketing/MomentCard.svelte (43 LOC, ui) importers: 1
  - src/lib/components/marketing/PricingCard.svelte (92 LOC, ui) importers: 1
  - src/lib/components/marketing/StrugglePanel.svelte (55 LOC, ui) importers: 1
  - src/lib/components/marketing/TestimonialCard.svelte (39 LOC, ui) importers: 1
  - src/lib/components/marketing/featureIcons.ts (74 LOC, model) importers: 3
  - src/lib/data/changelog.ts (79 LOC, model) importers: 1
  - src/lib/data/roadmap.ts (70 LOC, model) importers: 1
  - src/lib/marketing/seo.ts (171 LOC, model) importers: 1
  - src/lib/marketing/theme.css (244 LOC, ui) importers: 1
  - src/lib/server/emails/waitlist-confirmation.ts (78 LOC, server) importers: 1
  - src/lib/server/services/emailService.ts (41 LOC, server) importers: 1

route files not yet wiring-only (18/18):
  - src/routes/(marketing)/+layout.server.ts  /
  - src/routes/(marketing)/+layout.svelte  /
  - src/routes/(marketing)/+page.server.ts  /
  - src/routes/(marketing)/+page.svelte  /
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(marketing)/about/+page.svelte  /about
  - src/routes/(marketing)/android/+page.server.ts  /android
  - src/routes/(marketing)/android/+page.svelte  /android
  - src/routes/(marketing)/changelog/+page.svelte  /changelog
  - src/routes/(marketing)/changelog/+page.ts  /changelog
  - src/routes/(marketing)/contact/+page.server.ts  /contact
  - src/routes/(marketing)/contact/+page.svelte  /contact
  - src/routes/(marketing)/features/+page.svelte  /features
  - src/routes/(marketing)/privacy/+page.svelte  /privacy
  - src/routes/(marketing)/roadmap/+page.svelte  /roadmap
  - src/routes/(marketing)/roadmap/+page.ts  /roadmap
  - src/routes/(marketing)/waitlist/+page.server.ts  /waitlist
  - src/routes/(marketing)/waitlist/+page.svelte  /waitlist
  - src/routes/api/contact/+page.server.ts  /api/contact

legacy test files left (9/9) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/marketing/PricingCard.svelte.test.ts [component, 3 tests]
  - src/lib/components/marketing/marketingCards.svelte.test.ts [component, 5 tests]
  - src/lib/marketing/seo.test.ts [pure, 13 tests]
  - src/routes/(marketing)/android/page.ssr.test.ts [route, 3 tests]
  - src/routes/(marketing)/contact/page.server.test.ts [route, 3 tests]
  - src/routes/(marketing)/layout.svelte.test.ts [component, 1 tests]
  - src/routes/(marketing)/page.server.test.ts [route, 2 tests]
  - src/routes/(marketing)/page.svelte.test.ts [component, 1 tests]
  - src/routes/(marketing)/waitlist/page.server.real.test.ts [route, 7 tests]
```
<!-- census:end -->
