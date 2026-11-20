# Port sheet: marketing

**domain** · rank 16 · port #16 · home: `src/lib/domains/marketing/` · README after the port: `src/lib/domains/marketing/README.md` (written in S1)

Public site: home, features, pricing display, roadmap/changelog, contact, SEO tags, Android/F-Droid page.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse, sponsored, meals, feedback, access.
- **Owns tables:** `waitlist` (legacy only — it stays in the schema with no DDL, and no v2 code reads or writes it).
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `66a11131`
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
| `/contact` | POST (default) | none (per-client-IP rate limit) | `name`, `email`, `message`, `website` (honeypot); absent → `''` | `{ success: true }` | 429 `Too many attempts. Try again shortly.`; 400 `Invalid submission`; 400 `All fields are required`; 400 `Please enter a valid email address`; 500 `Something went wrong. Please try again.` | `src/routes/(marketing)/contact/+page.server.ts:43-107` |
| `/` | POST (default) | none | no fields read | `redirect(303, '/')` | none (logs `[#276] stray POST /` with referer/user-agent/content-type) | `src/routes/(marketing)/+page.server.ts:12-25` |

The module owns no `+server.ts`; `/api/contact` is a form-action file (see "Probably accidental").

### Rules the module must keep
- Prerender/SSR follow `ADAPTER === 'static'` for the whole `(marketing)` group — `src/routes/(marketing)/+layout.server.ts:5-6`
- `/changelog` and `/roadmap` override the group to `prerender = true` and `ssr = true` (exported from `+page.ts`, not the component) — `src/routes/(marketing)/roadmap/+page.ts:4-6`, `src/routes/(marketing)/changelog/+page.ts:4-6`
- The loader returns the request's own `origin` and `pathname`, never a hardcoded domain, plus `isLoggedIn` and `user` — `src/routes/(marketing)/+layout.server.ts:8-20` · test: `src/lib/marketing/seo.test.ts` › "self-references the origin it was given, on every environment"
- SEO is one table keyed by pathname: the layout emits `<meta name="description">`, `<link rel="canonical">`, og/twitter tags; every page emits only its own `<title>` and never a description — `src/routes/(marketing)/+layout.svelte:24-47`, `src/lib/marketing/seo.ts:50-164` · test: `src/lib/marketing/seo.test.ts` › "/%s has a row, and the row says what the page says" and "/%s does not emit its own description"
- Every `<title>`-setting marketing route has a row whose title matches the page exactly; an indexed row's description is > 40 chars — `src/lib/marketing/seo.ts:50-121` · test: `src/lib/marketing/seo.test.ts` › "/%s has a row, and the row says what the page says"
- `noindex` rows emit `robots: noindex, follow`; `/checkout`, `/signup`, `/login`, `/forgot-password`, `/reset` are noindex, `/`, `/features` are not — `src/lib/marketing/seo.ts:95-120,163`
- `og:image` and `og:url` are absolute, built by trimming trailing slashes off the origin; `seoFor` tolerates a trailing slash and falls back to the site defaults instead of throwing — `src/lib/marketing/seo.ts:124-139` · test: `src/lib/marketing/seo.test.ts` › "points og:image at an absolute URL", "falls back to the site default rather than throwing on a new route"
- `static/brand/og.png` must exist at the declared 1200×630 — `src/lib/marketing/seo.ts:23-32` · test: `src/lib/marketing/seo.test.ts` › "exists, and is the size the tags claim"
- Contact: 5 sends / 10 min per IP scope (`contact`), honeypot `website` filled → 400 `Invalid submission`, all three fields required, email regex, user HTML escaped, recipient `hello@familyplanz.com` — `src/routes/(marketing)/contact/+page.server.ts:10-46,49-107` · test: `src/routes/(marketing)/contact/page.server.test.ts` › "rejects honeypot filled with 400", "escapes user-supplied HTML in the email body"
- Contact sends the subject `New Contact Form Submission from <name>` and checks the provider result before claiming success — `src/routes/(marketing)/contact/+page.server.ts:79-107` · test: `src/routes/(marketing)/contact/page.server.test.ts` › "sends the contact email for full valid form", "returns failure when the email provider rejects the send"
- Every contact failure payload carries a non-empty `error` for the inline box — `src/routes/(marketing)/contact/+page.server.ts:54-75` · test: `src/routes/(marketing)/contact/page.server.test.ts` › "does not count rate-limit budget on validation failures"
- `/android` loads the release from committed `src/lib/fdroid/published.json` (via `androidRelease()`); before the first publish it renders `data-testid="no-release"` and no download/F-Droid/QR links; a repo with no APK shows the deep link but no APK button — `src/routes/(marketing)/android/+page.server.ts:1-5`, `src/lib/fdroid/release.ts:66-115` · test: `src/routes/(marketing)/android/page.ssr.test.ts` › "renders \"coming soon\" and no download/F-Droid links before the first publish", "hides the APK button when a repo exists but no APK is listed"
- Once published the page shows `fdroidrepos://<host>/fdroid/repo?fingerprint=<FP>`, `/fdroid/qr.svg`, the grouped fingerprint and `Family Planz <version> (<n> MB)` — `src/lib/fdroid/release.ts:42-105`, `src/routes/(marketing)/android/+page.svelte:37-64` · test: `src/routes/(marketing)/android/page.ssr.test.ts` › "renders the APK button, deep link, QR and fingerprint once published"
- A stray `POST /` always answers PRG 303 back to `/` and logs the sender hints, never a 405 error page — `src/routes/(marketing)/+page.server.ts:9-25` · test: `src/routes/(marketing)/page.server.test.ts` › "logs the sender hints (referer, user-agent, content-type) for diagnosis"
- Marketing nav is the fixed four `/features`, `/pricing`, `/about`, `/contact` from `navItems`, and the layout passes the signed-in `user` to `Navbar` — `src/lib/utils/navItems.ts:22-27`, `src/routes/(marketing)/+layout.svelte:51` · test: `src/routes/(marketing)/layout.svelte.test.ts` › "passes the signed-in user to the navbar"

### Page and UI behaviour worth keeping
- Shared chrome: skip link `#main`, fixed navbar, 150 ms local fade on page content, footer with Changelog / Roadmap / Android app and a `© <year> FamilyPlanz` line, `Toaster` mounted — `src/routes/(marketing)/+layout.svelte:50-81`
- Home (`/`): hero with "Start Free Today" → `/signup` and "See Features" → `/features`, trust strip, three feature cards, 1-2-3 paste demo, closing CTA; nothing is data-driven — `src/routes/(marketing)/+page.svelte:2-457`
- `/features` is data arrays feeding the six cards: FeatureCard ×6, MomentCard ×3, before/after StrugglePanels, GalleryCards, Testimonials — `src/routes/(marketing)/features/+page.svelte:10-139,164-273` · test: `src/lib/components/marketing/marketingCards.svelte.test.ts` › "FeatureCard renders icon + title + blurb"
- Feature icons are static in-file SVG literals rendered with `{@html}`; the icon set is `calendar|bolt|users|printer|phone|clipboard|clock|smile|heart` — `src/lib/components/marketing/featureIcons.ts:1-73`
- Contact success swaps the form for "Message Sent!" with a "Send another message" button that clears name/email/message; failures show `result.data.error` in a red box; submitting shows a spinner + "Sending..." — `src/routes/(marketing)/contact/+page.svelte:43-160`
- Contact form carries the hidden honeypot `website` (tabindex -1, aria-hidden) — `src/routes/(marketing)/contact/+page.svelte:84-95`
- `/changelog`: newest-first list, tag pill when present, `<time datetime>` and en-US UTC long date, closing "Get started free" → `/signup` — `src/routes/(marketing)/changelog/+page.svelte:1-65`
- `/roadmap`: exactly three sections (Shipped / In progress / Coming next) from `roadmap`, "planned, not promised" note, "Get in touch" → `/contact` — `src/lib/data/roadmap.ts:19-69`, `src/routes/(marketing)/roadmap/+page.svelte:19-52`
- `/about` and `/privacy` are static prose; privacy carries "Last updated: October 2026", a children's-data paragraph and a services table (Cerebras, Resend, …) with what each sees — `src/routes/(marketing)/about/+page.svelte:1-114`, `src/routes/(marketing)/privacy/+page.svelte:1-129`
- The marketing theme (`--mp-*` tokens, hero wash, orbs, glass) is imported only by the marketing layout — `src/lib/marketing/theme.css:33-95`, `src/routes/(marketing)/+layout.svelte:9`

### Probably accidental (candidates to drop, owner to confirm)
- Home page `<title>` is `Family Planz - The Family Calendar That Brings Everyone Together`, but `ROUTES['/']` says `Family Planz — the shared family calendar`; the SEO test only scans child directories, so the root drift is never caught — `src/routes/(marketing)/+page.svelte:5`, `src/lib/marketing/seo.ts:51-55`, `src/lib/marketing/seo.test.ts:26-35` — og:title advertises different copy than the page
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

Files in `src/lib/domains/marketing/`, in build order. Roles per [conventions.md](../../architecture/conventions.md); every new export is listed in the README's Public interface.

| new file | role | contents |
|---|---|---|
| `marketing.contract.ts` | contract | zod for the contact surfaces: `ContactApiBody` (`POST /api/contact`) and `ContactFormBody` (the `/contact` action) over `name`/`email`/`message`/`website` (first value; absent or non-string → `''`; nothing trimmed; checks in legacy order: honeypot, all fields, address shape — they differ only in whether a whitespace-only message counts as empty), `ContactSentResponse` and `ContactErrorResponse`, and the six legacy copy constants, so the golden and the 400/429/500 copy cannot drift. |
| `marketing.seo.rules.ts` | rules | `SITE`, `MARKETING_PAGES` (the table), `pageSeo(origin, pathname)` and the `SeoRow` / `SeoMetaTag` / `PageSeo` types; `seoFor` and `canonicalUrl` stay private (tests go through `pageSeo`). Replaces `src/lib/marketing/seo.ts`; `absolute` and `seoTags` fold into `pageSeo`. |
| `marketing.pageOptions.rules.ts` | rules | `marketingPageOptions(adapter)` and `CONTENT_PAGE_OPTIONS`; replaces the `ADAPTER === 'static'` expressions in the layout and the two `+page.ts` files. The route reads the adapter from `app`, because a v2 domain may not touch `$env` (R6). |
| `marketing.content.rules.ts` | rules | `MARKETING_NAV` (the fixed four links), `CHANGELOG_ENTRIES`, `ROADMAP_SECTIONS`, `changelogNewestFirst(entries)` (stable, non-mutating) and the entry/section types. Replaces `src/lib/data/changelog.ts`, `src/lib/data/roadmap.ts`, the marketing half of `src/lib/utils/navItems.ts` and the changelog page's `Intl` script; shell consumes `MARKETING_NAV`. No date formatter: the changelog's `Intl` output is `MMMM d, yyyy`, which K-06's `kernel/time` `formatLongDate` already produces — call it with the date-only ISO and zone `'UTC'`, as the page did, so the printed day cannot shift. |
| `marketing.android.rules.ts` | rules | `androidRelease(published)`, `addRepoLink`, `groupFingerprint` and their types. Replaces the logic in `src/lib/fdroid/release.ts`; `src/lib/fdroid/published.json` must not move. |
| `marketing.icons.rules.ts` | rules | `FEATURE_ICON_NAMES` (the closed set), `FeatureIconName`, `featureIcon(name)` and the private SVG map — from `src/lib/components/marketing/featureIcons.ts`. |
| `marketing.mail.rules.ts` | rules | `CONTACT_RECIPIENT`, `contactSubject(name)`, `isContactEmail(address)` (the legacy contact regex, never trimmed) and `contactMessageHtml({name,email,message})` with the private escape rule. Replaces the inline contact HTML and subject, duplicated in both legacy actions. |
| `marketing.service.server.ts` | service | `sendContactMessage(ctx, actor \| null, input)` — the reference shape for a public anonymous surface, so identity/access reuse it rather than invent a second anonymous writer. Refusals are `AppError`s; a **mail-provider failure is thrown as a plain fault**, so `contactEndpoint`'s `failMessage` produces the legacy 500 body and the kernel files the fault like the legacy `apiError`. Uses `ctx.limiter` and the mail port. |
| `marketing.http.server.ts` | http | `contactEndpoint`, `contactFormAction`, `marketingLayoutLoad`, `androidPageLoad`, `strayRootPostAction`. |
| `marketing.seo.rules.test.ts`, `marketing.pageOptions.rules.test.ts`, `marketing.content.rules.test.ts`, `marketing.android.rules.test.ts`, `marketing.icons.rules.test.ts` | tests | table tests from the Invariants; the SEO one carries the legacy route-scanning test. |
| `marketing.service.db.test.ts` | tests | `rollbackTest`; the mail-failure 500. |
| `marketing.pageActions.test.ts` | tests (S6) | the two page actions, `POST /` PRG and the Android load — page routes, so no goldens. |
| `marketing.http.db.test.ts` | tests (S2) | exists: the `/api/contact` golden. |
| `marketing.theme.css`, `ui/*.svelte` | ui (S7) | the theme plus one section component per page and the six cards; the legacy `src/lib/components/marketing/*` are their visual baseline. |

Where each legacy export goes:

- `src/lib/marketing/seo.ts` → `seoFor`/`seoTags`/`absolute` collapse into `pageSeo`; `ROUTES` becomes `MARKETING_PAGES`; `SITE` stays.
- `src/lib/data/changelog.ts`, `src/lib/data/roadmap.ts` → `marketing.content.rules.ts` (same data, new names).
- `src/lib/components/marketing/featureIcons.ts` → `marketing.icons.rules.ts`; the map goes private.
- `src/lib/fdroid/release.ts` → `marketing.android.rules.ts` (outside the census prefixes; S8 deletes it once `git grep` shows the Android route was its only importer).
- `src/lib/marketing/theme.css` → `marketing.theme.css` at S7; the `--mp-*` tokens survive, the dead ones are #194.
- Route files become wiring only. `src/routes/api/contact/+page.server.ts` keeps its path and shape — `export const actions = { default: contactEndpoint.handler }` — because the S2 golden imports that exact file and must not change at S6.
- `// +page.server.ts` at `(marketing)/+layout.server.ts:1` is a copy-paste artifact; it dies with the file.

## Notes

- **2026-11-12 (owner, Q-070): the waitlist leaves the website.** The `/waitlist` page, its `?/join` action and the pricing page's waitlist links go; the `waitlist` table stays (no DDL). Android's "Join Waitlist" link opens `/pricing` and is relabelled app-side later. Q-071 (the success card's copy) was moot once the page went.
- **`/api/contact` is the module's one `/api` route, and it is a form-action file** (`+page.server.ts`), not `+server.ts`. The golden stays on it: same POST path, form-encoded body, JSON answers. S6 wires it as `export const actions = { default: contactEndpoint.handler }` so the test's import never changes.
- **S2 goldens are wire-only.** The legacy action sends through Resend and has no injection seam, so the test sets a dummy `RESEND_API_KEY` before a dynamic import and stubs `fetch` at the provider boundary. It asserts status/body/messages; the sent mail's recipient, subject and escaping are pinned by the S5 service test. The provider-failure 500 is therefore **not** a golden — it needs a failing mailer, which exists only once the mail port does; `marketing.service.db.test.ts` pins it as the fault-not-refusal rule, and `contactEndpoint` turns that fault into the legacy 500 body through `failMessage` while the kernel files it (what `apiError` did). The 3-per-15-min budget and the absent/empty/whitespace differences are goldens.
- **Golden and the limiter.** Each budget test builds one `testCtx` and passes it to every request (`send(ip, fields, ctx)`). Legacy ignores `ctx` and shares one module-scope map, so today's result is unchanged; after the port the limit runs on `ctx.limiter`, which `testCtx` creates per ctx — a fresh ctx per request would start every bucket empty and the 429 golden would fail.
- **Probably accidental — `/reset`** (`src/lib/marketing/seo.ts:111-115`) matches no route: the page lives at `(marketing)/forgot-password/reset`, so it gets the site default title and stays indexable. Fold into #095's og/twitter/canonical audit at S7 — add the real path as a noindex row and delete `/reset`.
- **Probably accidental — hotlinked imagery**: home and features load Pexels images at render time (`(marketing)/+page.svelte:82`, `features/+page.svelte:72-84`). S7 serves them locally (perf budget, privacy) and follows the owner's content rule — family imagery is man + woman + children; the current hero alt is "Father and son". The dead theme tokens are #194.
- **`/pricing` is not in this census.** `(marketing)/pricing/+page.server.ts` imports billing's `checkoutService` and `analyticsService` and computes discounts, so the page belongs to billing; marketing keeps the nav link and the `/pricing` SEO row only. S7 coordinates with billing instead of duplicating the load.
- **Rate limits are in-memory and per instance** (`src/lib/server/utils/rateLimit.ts:1-3`), so the budgets are per process, not per cluster. The port keeps that shape through `ctx.limiter`; a distributed limiter is a separate ticket.
- **`ROUTES['/']` vs the home `<title>`**: the SEO test scans child directories only, so the root never has to match its row. Owner question below.
- **Census gaps**: `src/lib/fdroid/release.ts` and `src/lib/utils/sendEmail.ts` are outside the module's census list, so S8 must find their remaining importers with `git grep` before deleting them.
- **S2 sha**: the orchestrator commits this step; fill the sha in the Steps list from that commit (`rewrite(marketing): S2 api goldens (legacy green)`).
- **S4 is empty by design.** Marketing owns only `waitlist`, which no v2 code reads or writes (Q-070), and nothing else in the module queries a table. So the port has no `marketing.repo.server.ts`, no `marketing.fixtures.server.ts` and no repo db test; the service test at S5 runs on `testCtx({ db })` only for the bug-report fault it files.
- **S3 deviations from the plan above (all in the rows):** `seoFor`/`canonicalUrl` are private and the tests go through `pageSeo`; `marketing.mail.rules.ts` also exports `CONTACT_RECIPIENT`, `contactSubject` and `isContactEmail` (both legacy actions duplicated them); the contract carries a second body, `ContactFormBody`, for the `/contact` action, because its checks differ (message trimmed for the required check). The layout-markup tests of the legacy `seo.test.ts` ("emits og and canonical", "emits no `<title>`") are not carried: they read the legacy layout and are the S7 visual check per the Invariants. The contact mail body keeps the legacy elements and styles; only the source indentation whitespace inside the HTML string is gone.

### Questions for the owner

1. **Is `/api/contact` live?** (Q-068) It duplicates `/contact` with a different budget (3/15 min vs 5/10 min) and a different 500 (`Failed to send message. Please try again later.` vs `Something went wrong. Please try again.`), and it has no page component and no in-repo importer. Options: (a) keep the `/api` wire and retire the `/contact` action, (b) keep `/contact` and delete the `/api` route at S8, (c) keep both as two fixed wires over one service. Recommendation: (a) — installed clients may call it, it is the module's only `/api` route, and the golden already pins it.
2. **Which home title wins?** (Q-069) `ROUTES['/']` says `Family Planz — the shared family calendar` (written for search) while `(marketing)/+page.svelte:5` says `Family Planz - The Family Calendar That Brings Everyone Together`, so the share card advertises copy the page does not show. Options: (a) make the page `<title>` match the row and extend the SEO test to `/`, (b) change the row to the page's copy, (c) leave both. Recommendation: (a) — the row is the copy written for the SERP, and a test over the root stops the drift.
3. **Which email check does the contact form use?** (new, found at S3) Both legacy actions test `^[^\s@]+@[^\s@]+\.[^\s@]+$` on the untrimmed value, and the golden pins that ` alex@example.com` (leading space) is refused. Kernel `emailAddress` trims and is stricter (a top level of at least two letters, no comma), so using it would accept the padded address and refuse `a@b.c`. The port keeps the legacy regex as `isContactEmail`. Options: (a) keep it (no behaviour change), (b) switch to kernel `isEmailAddress` (untrimmed; stricter — rejects `a@b.c` and `a,b@x.com`, and the golden does not pin either), (c) switch to `emailAddress` and change the golden (accepts padded addresses). Recommendation: (a) now; (b) is a small separate change if the owner wants one email rule across the site.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# marketing: 0% ported

legacy source files left (11/11, 922 LOC):
  - src/lib/components/marketing/FeatureCard.svelte (31 LOC, ui) importers: 1
  - src/lib/components/marketing/GalleryCard.svelte (29 LOC, ui) importers: 1
  - src/lib/components/marketing/MomentCard.svelte (43 LOC, ui) importers: 1
  - src/lib/components/marketing/PricingCard.svelte (92 LOC, ui) importers: 1
  - src/lib/components/marketing/StrugglePanel.svelte (55 LOC, ui) importers: 1
  - src/lib/components/marketing/TestimonialCard.svelte (39 LOC, ui) importers: 1
  - src/lib/components/marketing/featureIcons.ts (74 LOC, model) importers: 3
  - src/lib/data/changelog.ts (79 LOC, model) importers: 1
  - src/lib/data/roadmap.ts (70 LOC, model) importers: 1
  - src/lib/marketing/seo.ts (166 LOC, model) importers: 1
  - src/lib/marketing/theme.css (244 LOC, ui) importers: 1

route files not yet wiring-only (16/16):
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
  - src/routes/api/contact/+page.server.ts  /api/contact

legacy test files left (8/8) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/marketing/PricingCard.svelte.test.ts [component, 3 tests]
  - src/lib/components/marketing/marketingCards.svelte.test.ts [component, 5 tests]
  - src/lib/marketing/seo.test.ts [pure, 13 tests]
  - src/routes/(marketing)/android/page.ssr.test.ts [route, 3 tests]
  - src/routes/(marketing)/contact/page.server.test.ts [route, 3 tests]
  - src/routes/(marketing)/layout.svelte.test.ts [component, 1 tests]
  - src/routes/(marketing)/page.server.test.ts [route, 2 tests]
  - src/routes/(marketing)/page.svelte.test.ts [component, 1 tests]
```
<!-- census:end -->
