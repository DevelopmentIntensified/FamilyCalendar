# family

**domain** — Families, Family Members (role vs Member Type), invite codes and email/link invites, roster, member search, child consent records.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: a **Family** and its **Family Members** (membership **role** is the permission, **Member Type** is the personal profile), invite codes plus email/link invites, the **roster**, member search and **child consent records**.
- Owns: the create-a-family use-case (plan gate, palette, verified picks, one transaction) and every way a person joins a family: direct add, emailed invite, invite link, child account, code.
- Does not own: **Family Tasks** and the Family Task Board (`tasks`, `familyHub`); Dashboard Module switches and visibility (`dashboardModules`); plan limits, family/member caps (`billing`); the Alert feed and its `added_to_family` type (`alerts`); the family calendar mirror (`calendar`).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types, role/palette/invite/search rules, display helpers. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: the `FamilyCalendarPort`/`MemberTasksPort` contracts, family services and `/api` handlers. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components (family card, roster rail, palette picker, invite/member tabs, join card). | — |
| [family.fixtures.server.ts](family.fixtures.server.ts) | fixtures | Family-row builders for db tests: `seedFamily`, `seedMembership`, `seedInvite`, `seedFamilyRoster`, `seedFullFamily`, `FamilyTestUser`. Task rows stay in the test because `tasks` owns task fixtures. | — |
| [family.http.db.test.ts](family.http.db.test.ts) | test | Golden contract for all 18 `/api` methods this module owns, run against the legacy handlers on the real test database. The emailed-invite method is a spec golden (its handler imports `$env/static/private` and sends mail). | itself |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

### `index.ts`

- `FamilyRole`, `MemberType`, `RosterMember`, `FamilySummary`, `FamilyDetail`, `InviteCode`, `InvitePreview`, `InviteUsable`, `MemberSearchHit`, `FamilyCreateInput`, `FamilyMemberInput` — contract types; `role` and `memberType` are separate fields everywhere and never interchangeable.
- `FAMILY_PALETTE`, `DEFAULT_FAMILY_COLOR`, `isFamilyColor` — the six-colour family palette, its default and the exact membership guard (create only; see Invariants for PATCH). `RETIRED_FAMILY_COLOR` stays module-internal: it exists only for the palette rules test, so it is not re-exported here.
- `canEditRole`, `canRemove`, `memberDisplayName`, `rolePillClass` — shared, pure UI permission and display helpers (the deletion test fails: every caller would otherwise re-implement "creator on anyone but self").
- `DEFAULT_INVITE_MAX_USES`, `clampInviteDays`, `clampInviteUses`, `isInviteUsable` — the invite defaults and clamps, and the one "can this code still be used" predicate.
- `MEMBER_SEARCH_MIN_QUERY`, `MEMBER_SEARCH_MAX_QUERY`, `MEMBER_SEARCH_ROW_CAP`, `maskEmail` — the picker search bounds and the one email-masking rule.
- An optional `index.ts` re-export of the module's own client api is not part of the public surface: `family.api.ts` is used by this module's state classes only.

### `index.server.ts`

Services (each hides a whole use-case; no pass-throughs):

- `listFamilies(ctx, actor)` — the `/family` list payload (cards, roster, live codes, plan usage) in a fixed number of queries.
- `FamilyCalendarPort`, `MemberTasksPort`, `FamilyPorts`, `FamilyCtx` — the two cross-module **ports** this module declares and `src/lib/app` wires. `FamilyCalendarPort.createFamilyCalendar(ctx, familyId)` is implemented by `calendar` (it owns `calendars`); `MemberTasksPort.unassignMemberTasks(ctx, familyId, userId)` by `tasks` (it owns `tasks`). `FamilyCtx` is `Ctx & { ports: FamilyPorts }`; only the two services below need it. Each port method takes the `withTx` transaction ctx, so the cross-module write stays inside the one transaction the Invariants require. Family repos never touch `calendars` or write `tasks`.
- `getFamily(ctx, actor, familyId)` — the family detail payload; non-member and unknown id are one `notFound`.
- `createFamily(ctx: FamilyCtx, actor, input)` — plan gate, name/colour/pick validation; family + memberships written by the family repo and the family calendar through `ports.calendar.createFamilyCalendar(txCtx, familyId)`, all in one transaction.
- `updateFamily(ctx, actor, input)` — rename/recolour (admin+).
- `listInvites(ctx, actor, familyId)` — `canManageInvites` plus that family's codes (member gets an empty list, not a refusal).
- `mintInvite(ctx, actor, input)` — one code, clamped validity and uses.
- `revokeInvite(ctx, actor, code)` — delete a code (admin+).
- `previewInvite(ctx, actorOrNull, code)` — the join page/API answer for a pasted link; unusable is a value, never a redirect.
- `joinFamily(ctx, actor, code)` — the locked accept transaction; one boolean refusal plus an optional `family-full` reason.
- `listRoster(ctx, actor, familyId?)` — the roster the calendar person filter/attendee picker reads.
- `addFamilyMember(ctx, actor, input)` — one use-case with a `mode` (`direct | email | invite-link | child`), hiding the four doors' shared gates, validation and invite minting.
- `changeMember(ctx, actor, input)` — role and/or Member Type, with the creator-untouchable rules.
- `removeFamilyMember(ctx: FamilyCtx, actor, input)` — roster delete plus `ports.tasks.unassignMemberTasks(txCtx, familyId, userId)` in one transaction.
- `searchMembers(ctx, actor, input)` — the picker's prefix search (verified only, bounded, masked, unordered).
- `findInvitableMembers(ctx, actor, input)` — the invite flow's exact-match directory search (a separate service on purpose: it must never become the picker).

Endpoints (thin `endpoint()` definitions exported for the route files): `listFamiliesEndpoint`, `createFamilyEndpoint`, `getFamilyEndpoint`, `updateFamilyEndpoint`, `listInviteCodesEndpoint`, `changeMemberEndpoint`, `removeMemberEndpoint`, `addDirectEndpoint`, `addChildEndpoint`, `sendInviteEmailEndpoint`, `mintInviteLinkEndpoint`, `mintInviteEndpoint`, `previewInviteEndpoint`, `revokeInviteEndpoint`, `joinFamilyEndpoint`, `memberSearchEndpoint`, `rosterEndpoint`, `searchFamilyEndpoint`.

### `ui/index.ts`

- `FamilyCard` — one `/family` card: initial on its colour, stat strip, roster avatars, ways in.
- `FamilyRosterRail` — per-family roster rows (name, Member Type, role pill) and the live code band.
- `FamilyPalettePicker` — the six swatches with plain-word names.
- `InviteLinkBand` — the minted join link with copy/share and honest failure copy.
- `MemberSearchTab`, `MemberInviteTab`, `MemberChildTab` — the three add-member tabs; each reads `{error}` first, never treats non-2xx as success.
- `JoinInviteCard` — a usable link offers Join; an unusable one answers in place.

## How to test

- Whole module: `npm run test:mod -- family` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `family.http.db.test.ts` pins status + body of every endpoint (golden tests, committed mode). Its emailed-invite `describe` is a spec golden, skipped until S6: the legacy handler imports `$env/static/private` and sends mail through Resend, so it cannot run in the db project.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `family.fixtures.server.ts` — `seedFamily`, `seedMembership`, `seedInvite`, `seedFamilyRoster`, `seedFullFamily`, `FamilyTestUser`. Task rows stay local to the test that needs them (`tasks` owns task fixtures).

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

- Membership **role** (`creator|admin|member`) is the permission; **Member Type** (`parent|child|member`) is profile only and gates nothing — `src/lib/server/db/actions/families.ts:30-44`, `src/lib/server/db/schema.ts:286-293`. Pinned by `family.http.db.test.ts › updates role and Member Type as separate columns` and, in S3, `family.roles.rules.test.ts › Member Type never grants a permission`.
- Every membership and role check names the family from the URL/body; none compares against "the user's first membership row" — `src/routes/api/family/invite/+server.ts:31-43`, `src/routes/api/family/search/+server.ts:17-22`. Pinned by `family.http.db.test.ts › answers 403 for a family you are not in, even when you belong to another`.
- Minting, revoking, adding a member and sending an invite are `creator|admin` only, and a plain member is refused with that door's own message — `src/lib/server/services/familyData.ts:51`, `src/routes/api/family/invite/+server.ts:38-43`. Pinned by each route's 403 golden in `family.http.db.test.ts`.
- Invite default `maxUses` is 10, declared once (`DEFAULT_INVITE_MAX_USES`); the mint route clamps uses 1–50 and validity days 1–30 with a 7-day default — `src/lib/server/db/actions/families.ts:142,159`, `src/routes/api/family/invite/+server.ts:46-49`. Pinned by `family.http.db.test.ts › mints a 10-use, 7-day code by default and returns its join url` and `› clamps validity to 1–30 days and uses to 1–50`.
- An email invite mints a single-use, 1-day code; a shareable link mints the shared 10-use, 1-day code — `src/routes/(family)/family/[familyId]/members/add/email/+server.ts:113-117`, `…/email/link/+server.ts:94-98`. Pinned by `family.http.db.test.ts › mints a 10-use, 1-day code and returns the token link` and, at S6, the spec golden `…/members/email`.
- Email and link invites embed the durable invite row's code in their signed link (`{email, firstName, lastName, familyId, inviteCode}`), so joining goes through `acceptInvite` against that exact row and single-use/revocation stay enforced (#152) — `src/routes/(family)/family/[familyId]/members/add/email/+server.ts:110-137`, `…/email/link/+server.ts:91-117`. Pinned by the legacy route tests and, at S6, the spec golden for `/members/email`; in S5, `family.invites.service.db.test.ts › binds the minted code into the invite token`.
- Email and link minting are IP rate-limited to 10 per 15 minutes, checked before membership — `…/add/email/+server.ts:20-21,68-76`, `…/add/email/link/+server.ts:21-22,55-63`. Pinned by `family.http.db.test.ts › answers 429 after ten mints from one IP, before the membership check`.
- `acceptInvite` runs one transaction that locks the invite row (`FOR UPDATE`), then checks expiry, `useCount < maxUses`, duplicate membership and the family-size cap, and increments `useCount` DB-side — `src/lib/server/db/actions/families.ts:197-249`. Pinned by `family.http.db.test.ts › the next roster read and the use count both reflect the new member` and, in S5, `family.invites.service.db.test.ts › locks the invite row and increments use_count inside one transaction`.
- An unusable invite is one refusal: unknown, expired, used up and already-a-member answer `400 Invalid, expired, or already used invite code`; only the size cap is `403 This family is full…` — `src/lib/server/db/actions/families.ts:200-249`, `src/routes/api/family/join/+server.ts:21-31`. Pinned by the four join refusals in `family.http.db.test.ts`.
- Picker member search: verified accounts only, prefix match on first/last/email, 2–60 characters, 10-row cap, **no `ORDER BY`**, caller and `exclude` ids removed, ILIKE wildcards escaped, emails masked — `src/lib/server/db/actions/memberSearch.ts:24-31,42-52,81-124`. Pinned by `family.http.db.test.ts › matches verified prefixes, masks the email and keeps the caller out`, `› refuses a missing, one-character or blank term before any query`, `› answers 429 after twenty searches from the same IP`, `› caps the result at ten rows` and `› escapes ILIKE wildcards so they cannot become a scan`.
- Invite-flow directory search stays exact-match on email, verified only, current members excluded, 10-row cap, full emails returned — `src/lib/server/db/actions/families.ts:334-363`. Pinned by `family.http.db.test.ts › matches an exact email only, excluding members, unverified accounts and substrings` (the name leg compares both columns to the whole query; owner question Q-F6).
- Removing a Family Member un-assigns that person's Family Tasks (`assignedTo = null`, `assignmentStatus = 'none'`) in the same transaction as the roster delete; the un-assignment is `MemberTasksPort.unassignMemberTasks(txCtx, familyId, userId)` (implemented by `tasks`, wired in `src/lib/app`), so family never writes `tasks` — `src/lib/server/db/actions/families.ts:300-317`. Pinned by `family.http.db.test.ts › removes the roster row and un-assigns that person's family tasks` and, in S5, `family.members.service.db.test.ts › calls the tasks port with the transaction ctx`.
- The creator is untouchable: cannot be removed, its role cannot change; a user cannot change their own role; only the creator promotes to `creator` — `src/lib/server/services/familyData.ts:270-311`. Pinned by the five `PATCH/DELETE members` refusals in `family.http.db.test.ts`.
- Setting Member Type is admin+, accepts only `parent|child|member`, and never changes the role — `src/lib/server/services/familyData.ts:313-340`. Pinned by `family.http.db.test.ts › makes Member Type admin-only and leaves the role alone`.
- Creating a family: the plan gate runs before the body is read; name required and ≤50 chars; colour must be a palette member (absent → first); every pick a verified account; the creator counts against the member limit; family + memberships are written by the family repo and the family calendar row by `FamilyCalendarPort.createFamilyCalendar(txCtx, familyId)` (implemented by `calendar`, wired in `src/lib/app`), all in one transaction — `src/lib/server/services/familyData.ts:446-509`. Pinned by `family.http.db.test.ts › creates the family with the default palette colour, deduped picks and a calendar` and `› answers 403 with the plan reason and upgradeRequired at the family limit`; in S5, `family.families.service.db.test.ts › writes the calendar through the port inside the family transaction`.
- Child creation requires `consentAcknowledged === true`; it creates a real verified user, a `memberType:'child'` membership and an append-only `childConsentRecords` row in one transaction — `src/routes/(family)/family/[familyId]/members/add/child/+server.ts:78-117`, `src/lib/server/db/schema.ts:965-995`. Pinned by `family.http.db.test.ts › creates a verified child account, a child membership and an append-only consent record` and, in S5, `family.members.service.db.test.ts › appends consent, never updates it`.
- The family palette is six named earthy colours; the default is its first entry; `isFamilyColor` is exact and case-sensitive; `#3B82F6` is retired (`RETIRED_FAMILY_COLOR` stays module-internal — its only consumer is the rules test, so it is not exported from `index.ts`) — `src/lib/utils/familyPalette.ts:23-46`. Pinned by `family.http.db.test.ts › creates the family with the default palette colour, deduped picks and a calendar` and, in S3, `family.palette.rules.test.ts › rejects the retired blue`.
- UI permission helpers are pure and shared: creators may act on anyone but themselves, admins only on plain members; nobody removes themselves or a creator — `src/lib/utils/familyDisplay.ts:9-36`. Pinned by, in S3, `family.display.rules.test.ts › creator on anyone but self, admin on members only`.
- Multi-family reads fall back to the **oldest** family (memberships ordered by the family's `createdAt`) — `src/lib/server/db/actions/families.ts:96`, `src/lib/server/services/familyData.ts:376-379`. Pinned by `family.http.db.test.ts › orders families oldest first and builds each card from one read` and, in S5, `family.families.service.db.test.ts › picks the oldest family`.
- The `/family` list costs a fixed number of queries regardless of family count — `src/lib/server/services/familyData.ts:54-140`. Pinned by, in S5, `family.families.service.db.test.ts › costs the same query count for 1 and 3 families`.
- An unusable invite link answers in place, never redirects — `src/routes/(marketing)/family/join/[code]/+page.server.ts:5-34`. Pinned by the wire golden `family.http.db.test.ts › answers 404 for unknown, expired and used-up codes` and, in S7, `familyJoin.state.test.ts › an unusable link renders the explanation`.
- Add-member failures read `{error}` first, then a thrown server `{message}`, else "Something went wrong. Please try again."; a non-2xx is never success — `src/lib/components/family/responseError.ts:8-19`. Pinned by, in S7, `MemberAddTabs.svelte.test.ts › a server error is not a success`.
- Opening an invite does **not** spend a use; only joining does — `src/routes/api/family/invite/+server.ts:68-100` vs `src/lib/server/db/actions/families.ts:242-244`. Pinned by `family.http.db.test.ts › does not increment useCount when a link is only opened`.
- Family-list card avatars carry a `userId`: today recovered by matching the roster's **first name**, with `roster-${i}` when no match — `src/lib/server/services/familyData.ts:125-131`. Pinned by `family.http.db.test.ts › orders families oldest first and builds each card from one read`. (Owner question Q-F1.)
- `GET /api/family/roster` with no `familyId` answers the first membership row the database returns (today unordered) — `src/lib/server/db/actions/families.ts:251-258`. Pinned (single-family case) by `family.http.db.test.ts › defaults to your family`. (Owner question Q-F2.)
- `PATCH /api/families/{id}` accepts any `#rrggbb`, while creating a family requires an exact palette colour — `src/routes/api/families/[id]/+server.ts:31`, `src/lib/server/services/familyData.ts:459`. Pinned by `family.http.db.test.ts › accepts a hex colour outside the palette (create offers six)`. (Owner question Q-F3.)
- `/api/family/search` answers `200 {users:[]}` when `q` or `familyId` is missing, instead of the 400 its sibling search door returns — `src/routes/api/family/search/+server.ts:13-15`. Pinned by `family.http.db.test.ts › answers an empty list when q or familyId is missing`. (Owner question Q-F4.)
- `DELETE /api/families/{id}/members/{userId}` answers `{success:true}` even when the target is not a member — `src/lib/server/services/familyData.ts:270-282`. Pinned by `family.http.db.test.ts › answers a no-op success for a target who is not a member`. (Owner question Q-F5.)

## Depends on

- May import: kernel, identity, billing, alerts (public entries only).
- Owns tables: `families`, `familyMembers`, `familyInviteCodes`, `childConsentRecords`.
- Reads (join only): `users` (roster names/emails, picker search, verified-account check), `userSettings` (hidden Dashboard Modules on the detail payload), `dashboardModuleSwitches` (the detail payload), `tasks` (**open-task counts only** — a read-only join declared in `FOREIGN_READS` at S4).
- Writes through ports (never through family repos; adapters live in the owning module, wired in `src/lib/app`): `FamilyCalendarPort.createFamilyCalendar(txCtx, familyId)` — `calendar` inserts the family `calendars` row inside the family-create transaction; `MemberTasksPort.unassignMemberTasks(txCtx, familyId, userId)` — `tasks` clears `assignedTo`/`assignmentStatus` inside the removal transaction.
- Calls: `billing` — `canCreateFamily`, `canAddFamilyMember`, `getUserSubscriptionLimits`, subscription status and AI usage for the detail payload; `identity` — account creation for a child (`createNewUser`) and email-uniqueness check; `alerts` — `createNotification` for `added_to_family`.
- Called by: `calendar` (roster), `familyHub` (family detail and its tasks board), `dashboardModules` (family switch state), `dayDashboard` (roster/kids), and the `/family`, `/family/create`, `/family/invitations`, `/family/{id}/members/add` and `/family/join/{code}` routes.
