# marketing

**domain** — Public site: home, features, pricing display, roadmap/changelog, contact, waitlist, SEO tags, Android/F-Droid page.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns the signed-out public site: the content pages, their share metadata (one SEO table), contact intake, and the waitlist.
- Owns the `waitlist` table — one row per lowercased address, status `pending`, consent stamps — and the confirmation email that answers a join.
- Owns the `(marketing)` group's prerender/SSR flags and the `/android` view of the committed publish record `src/lib/fdroid/published.json`.
- Does not own: `/login`, `/signup`, `/forgot-password`, `/reset` behaviour (identity) — marketing only carries their SEO rows and links; `/pricing`'s amounts and discounts (billing's `checkoutService`/`analyticsService`) — marketing displays them; F-Droid artifacts (the release scripts build them, marketing never writes them).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Isomorphic interface. Placeholder today; will export `pageSeo`, `marketingPageOptions`, the curated content and `androidRelease` (see Public interface). | — |
| [index.server.ts](index.server.ts) | entry | Server interface. Placeholder today; will export the six handlers (S6). | — |
| [ui/index.ts](ui/index.ts) | entry | Public components. Placeholder today; the marketing cards and page sections land here (S7). | — |
| [marketing.http.db.test.ts](marketing.http.db.test.ts) | http | Golden wire contract for `POST /api/contact` — the module's only `/api` route. Written against the legacy actions file, so it proves the port changed nothing: statuses, bodies, exact messages, the 3-per-15-min budget, and the absent/empty/whitespace differences. | itself (vitest project `db`) |

## Public interface

The names below are the design the port builds on (S3–S7); the entry files are empty until then. Each export earns its place by the deletion test.

- `index.ts`:
  - `pageSeo(origin, pathname)` — the layout's single call: `{ title, description, canonical, meta }`, with `robots: noindex, follow` for the transactional paths. Delete it and the table lookup, the absolute-URL rule and the noindex rule move back into the layout — the drift the SEO test exists to stop.
  - `marketingPageOptions(adapter)` — `{ prerender, ssr }` for a `(marketing)` route, with the two content pages always on. Delete it and the adapter rule plus its two overrides live in three route files that no test can import.
  - `MARKETING_NAV`, `CHANGELOG_ENTRIES`, `ROADMAP_SECTIONS` — the curated content: the fixed four nav links, the changelog newest-first, exactly three roadmap sections. Delete them and the data lives in a page nobody can check; `formatChangelogDate` stays next to them until kernel/time owns long-date formatting.
  - `androidRelease(published)` — the `/android` view model (repo link, QR path, grouped fingerprint, APK size). Delete it and the fingerprint/URL rules end up in the template.
  - `featureIcon(name)` — a closed icon vocabulary; the SVG literals stay private.
- `index.server.ts`:
  - `contactEndpoint` — `POST /api/contact` as one use-case: rate limit, form parse, validation order, mail, 500 mapping. Delete it and the route reproduces the wire by hand.
  - `contactFormAction` — `/contact`'s action. A separate export, not a flag: its budget (5/10 min) and its 500 copy are fixed and differ from the `/api` one.
  - `waitlistJoinAction` — `?/join` on `/waitlist`: gate → validate → insert (conflict-tolerant) → confirm → duplicate/500 answers. It is the only writer of `waitlist`, so the sequence must not be split across the route.
  - `marketingLayoutLoad` — `origin`, `pathname`, `isLoggedIn`, `user`. The self-referencing origin is the rule; a hardcoded domain is the bug it prevents.
  - `androidPageLoad` — `{ release }` from the committed publish record.
  - `strayRootPostAction` — #276: a `POST /` answers 303 back to `/` and logs the sender hints instead of a 405 error page.
- `ui/index.ts`:
  - `FeatureCard`, `MomentCard`, `StrugglePanel`, `GalleryCard`, `TestimonialCard`, `PricingCard` — the cards the pages compose; each has a visual baseline, so they stay components rather than inline markup.
  - One section component per page (`HomeScreen` … `AndroidScreen`) so the route's `+page.svelte` stays a single render (R8).

## How to test

- Whole module: `npm run test:mod -- marketing` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: [marketing.http.db.test.ts](marketing.http.db.test.ts) pins status + body of `POST /api/contact` (golden tests).
- The golden drives the legacy actions file directly, with `fetch` stubbed at the Resend boundary and a dummy `RESEND_API_KEY`, so it needs no network and no mail credentials. It asserts the HTTP contract only; the mail's copy and escaping are pinned by the service test, so a mailer port does not invalidate it.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `marketing.fixtures.server.ts` (`waitlistRow`).

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

- Prerender and SSR for the group follow `ADAPTER === 'static'`; `/changelog` and `/roadmap` are always `prerender = true, ssr = true` (exported from `+page.ts`, never the component) — `src/routes/(marketing)/+layout.server.ts:5-6`, `changelog/+page.ts:4-6`, `roadmap/+page.ts:4-6` · `marketing.pageOptions.rules.test.ts` › "follows ADAPTER for the group and forces the content pages on".
- The layout load returns the request's own `origin` and `pathname` (never a hardcoded domain) plus `isLoggedIn` and `user` — `src/routes/(marketing)/+layout.server.ts:8-19` · `marketing.seo.rules.test.ts` › "builds canonical and og:url from the origin it was given, on every environment".
- SEO is one table keyed by pathname; the layout emits `<meta name="description">`, `<link rel="canonical">` and the og/twitter tags, and each page emits only its own `<title>`, never a description — `src/routes/(marketing)/+layout.svelte:30-40`, `src/lib/marketing/seo.ts:51-171` · `marketing.seo.rules.test.ts` › "every marketing route with a <title> has a row that says the same thing" and "no marketing page emits its own description"; markup by the S7 visual check.
- Every `<title>`-setting marketing route has a row whose title matches the page exactly, and every indexed row's description is longer than 40 characters — `src/lib/marketing/seo.ts:51-127` · `marketing.seo.rules.test.ts` › the same title-matches test (table over the route files).
- `noindex` rows emit `robots: noindex, follow`; `/`, `/features`, `/pricing`, `/about`, `/changelog`, `/roadmap`, `/android`, `/contact`, `/privacy` stay indexable; `/login`, `/signup`, `/forgot-password`, `/waitlist`, `/checkout` stay noindex — `src/lib/marketing/seo.ts:96-124,168` · `marketing.seo.rules.test.ts` › "noindexes the transactional routes and indexes the public ones".
- `og:image` and `og:url` are absolute (trailing slashes trimmed off the origin); an unknown pathname falls back to the site defaults instead of throwing — `src/lib/marketing/seo.ts:129-143` · `marketing.seo.rules.test.ts` › "falls back to the site default rather than throwing on a new route" and "never leaves a double slash on the origin".
- `static/brand/og.png` exists at the declared 1200×630 — `src/lib/marketing/seo.ts:23-45` · `marketing.seo.rules.test.ts` › "the OG image exists and is the size the tags claim".
- Waitlist joins are limited to 5 per 10 minutes per client IP (scope `waitlist-join`), and the gate runs before the form is read — `src/routes/(marketing)/waitlist/+page.server.ts:9-19,31-39` · `marketing.service.db.test.ts` › "refuses a rate-limited caller before touching the database or the mailer".
- Waitlist validation order and messages: `Email is required`, `Name is required`, `Please enter a valid email address`; email and name are trimmed — `waitlist/+page.server.ts:41-55` · `marketing.waitlist.rules.test.ts` › the validation-order table.
- Waitlist stores one row per lowercased address (`uniqueIndex waitlist_email_key`) with `onConflictDoNothing`, and answers a duplicate with 400 `You are already on the waitlist!` — `waitlist/+page.server.ts:63-84`, `src/lib/server/db/schema.ts:1011-1013` · `marketing.repo.db.test.ts` › "inserts one row per address, case-insensitively" + `marketing.service.db.test.ts` › "a resubmit gets the already-subscribed message".
- Consent stamps `consentedAt` and `optedInAt` only when `consent` is `on`/`true`/`yes` (trimmed, any case); `preferences` are always `{ marketing: false, updates: false }` and `status` is `pending` — `waitlist/+page.server.ts:57-77` · `marketing.waitlist.rules.test.ts` › "consent is on, true or yes in any case" + `marketing.service.db.test.ts` › "stamps consent only when the form collected it".
- A failed confirmation email keeps the row and answers 500 with the "We saved your spot…" copy; a retry then hits the duplicate message — `waitlist/+page.server.ts:82-95` · `marketing.service.db.test.ts` › "keeps the row and surfaces the failed confirmation".
- `POST /api/contact` needs no sign-in, is limited to 3 submits per 15 minutes per client IP (scope `contact`, checked before the form is read), and answers `{success:true}` / `Invalid submission` / `All fields are required` / `Please enter a valid email address` / `Too many attempts. Try again shortly.` / `Failed to send message. Please try again later.` — `src/routes/api/contact/+page.server.ts:26-79` · `marketing.http.db.test.ts` › the golden titles.
- `/api/contact` does not trim: a whitespace-only message is sent and a whitespace-padded email is rejected, while `/contact` trims the message — `src/routes/api/contact/+page.server.ts:39-50`, `(marketing)/contact/+page.server.ts:59-69` · `marketing.http.db.test.ts` › "does not trim: a whitespace-only message is still sent".
- `/contact` is limited to 5 sends per 10 minutes (scope `contact`), rejects a filled `website` honeypot, requires name/email and a non-blank trimmed message, checks the address shape, sends to `hello@familyplanz.com` with subject `New Contact Form Submission from <name>` and escaped user HTML, and answers provider failure with 500 `Something went wrong. Please try again.` — `(marketing)/contact/+page.server.ts:43-94` · `marketing.service.db.test.ts` › "escapes the sender's HTML and pins recipient and subject" + "surfaces a provider rejection".
- Every contact/waitlist failure payload carries a non-empty `error`, because the page renders it in an inline box — `(marketing)/contact/+page.server.ts:48-89`, `waitlist/+page.server.ts:35-95` · the same service tests.
- `/android` reads the committed `src/lib/fdroid/published.json` (the path the release scripts write — do not move it): no fingerprint renders "coming soon" with no repo/APK links; a fingerprint without an APK renders the repo deep link and fingerprint but no APK button; both render `fdroidrepos://<host>/fdroid/repo?fingerprint=<FP>`, `/fdroid/qr.svg`, the grouped fingerprint and `Download Family Planz <version> (<n> MB)` — `src/lib/fdroid/release.ts:42-81`, `android/+page.svelte:21-91` · `marketing.android.rules.test.ts` › the three-state table + the S7 visual check.
- A stray `POST /` answers 303 back to `/` (PRG, never SvelteKit's 405 page) and logs referer, user-agent and content-type — `(marketing)/+page.server.ts:12-20` · `marketing.pageActions.test.ts` › "answers 303 back to / and logs the sender hints (#276)".
- Marketing nav is the closed four `/features`, `/pricing`, `/about`, `/contact`, and the layout passes the signed-in `user` and `isLoggedIn` to the navbar — `src/lib/utils/navItems.ts:22-27`, `+layout.svelte:44` · `marketing.content.rules.test.ts` › "the marketing nav is the fixed four links" + the S7 visual check.
- Chrome is fixed: skip link `#main`, navbar, 150 ms local fade on the page content, footer with Changelog / Roadmap / Android app and a `© <year> FamilyPlanz` line, `Toaster` mounted — `+layout.svelte:42-68` · S7 visual check.
- Home is not data-driven: hero CTAs `/signup` and `/features`, the avatar strip, three feature cards, the 1-2-3 paste demo and the closing CTA — `(marketing)/+page.svelte:2-457` · S7 visual check (its `<title>` question is in the sheet).
- `/features` renders six feature cards, three moment cards, the before/after struggle panels, gallery cards and testimonials from in-file arrays; icons are static SVG literals from the closed set `calendar|bolt|users|printer|phone|clipboard|clock|smile|heart` — `features/+page.svelte:10-139,164-273`, `src/lib/components/marketing/featureIcons.ts:1-73` · `marketing.icons.rules.test.ts` › "every icon name in the pages is in the set" + S7 visual check.
- `/changelog` is newest-first with a tag pill when present, a `<time datetime>` and an en-US UTC long date; `/roadmap` has exactly the three sections Shipped / In progress / Coming next, the "planned, not promised" note, and a `/contact` CTA — `changelog/+page.svelte`, `src/lib/data/roadmap.ts:19-69` · `marketing.content.rules.test.ts` › "changelog is newest first" + "roadmap has exactly the three sections in order".
- `/about` and `/privacy` are static prose; privacy carries the "Last updated: October 2026" line, the children's-data paragraph and the services table — `about/+page.svelte`, `privacy/+page.svelte` · S7 visual check.
- Waitlist page: the form shows the Early Access badge, name/email inputs, an inline `form.error` box, a disabled "Joining..." button and the privacy line; success swaps in the "Check your email" card with a "Try again" link back to `/waitlist` — `waitlist/+page.svelte:17-128` · S7 visual check (the failure-shows-success bug is an S7 fix, see the sheet).
- Contact page: success swaps in "Message Sent!" with a "Send another message" button that clears the fields; failures show `result.data.error`; submitting shows a spinner and "Sending..."; the form carries the hidden `website` honeypot — `contact/+page.svelte:28-95` · S7 visual check.
- The marketing theme's `--mp-*` tokens are imported only by the marketing layout — `src/lib/marketing/theme.css`, `+layout.svelte:9` · S7 visual check.

## Depends on

- May import: kernel + identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals, feedback, access (public entries only).
- Owns tables: `waitlist`.
- Reads (join only): none.
- Calls: `identity` for the auth pages it links to and carries SEO rows for; `billing` for the `/pricing` amounts and discounts it displays; kernel `validators.emailAddress`, `ctx.ids` (waitlist id), `ctx.limiter` (both budgets), `ctx.clock` (consent instants), and a mail port on `ctx` (added when this module needs it, S5) for the contact message and the waitlist confirmation.
- Called by: nothing imports marketing — its routes are the entry point. The marketing nav and the footer links are its only inbound edges.
