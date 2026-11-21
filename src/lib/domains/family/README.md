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
| [index.ts](index.ts) | entry | Public isomorphic interface. Still `export {}`; the client `family.api.ts` and the rule/type re-exports land at S7, like identity's. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: the five ports family declares (`FamilyCalendarPort`, `MemberTasksPort`, `FamilyModuleSwitchesPort`, `FamilyChildAccountPort`, `FamilyInviteLinkPort`) with `FamilyPorts`/`FamilyCtx`/`FamilyDetailCtx`, the fourteen services and the 18 `/api` handlers. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components (family card, roster rail, palette picker, invite/member tabs, join card). | — |
| [family.contract.ts](family.contract.ts) | contract | The wire, in zod: body/query/param schemas for all 18 `/api` methods with the legacy 400 copy and coercions (absent vs null, non-string = empty, only `true` consents), ISO-string response schemas (the `/family` list's roster rows carry no email), the `/family/create` form shape, and the server-side row views with real `Date`s that never sit on the wire. | [family.contract.test.ts](family.contract.test.ts) |
| [family.roles.rules.ts](family.roles.rules.ts) | rules | The two closed vocabularies (`FAMILY_ROLES`, `MEMBER_TYPES`) and who may do what. Every function takes a role and nothing else, so a Member Type cannot leak into a permission (ADR-0001). | [family.roles.rules.test.ts](family.roles.rules.test.ts) |
| [family.palette.rules.ts](family.palette.rules.ts) | rules | The six-colour palette, its default, the retired blue, the exact `isFamilyColor` guard (create) and the wider `isHexColor` (PATCH, Q-025). | [family.palette.rules.test.ts](family.palette.rules.test.ts) |
| [family.invites.rules.ts](family.invites.rules.ts) | rules | The invite defaults (10 uses, 7 days) declared once, the two clamps, the email/link mint presets, `isInviteUsable(invite, now)`, the one refusal answer for a code that cannot be accepted, and the invite email's HTML (pure, so the send use-case renders it without a mailer). `now` is always a parameter. | [family.invites.rules.test.ts](family.invites.rules.test.ts) |
| [family.search.rules.ts](family.search.rules.ts) | rules | The two search doors' bounds, `maskEmail`, the ILIKE escaping and patterns, and the two matching predicates (`isPickerMatch` prefix, `isInviteFlowMatch` exact) that must stay different. | [family.search.rules.test.ts](family.search.rules.test.ts) |
| [family.members.rules.ts](family.members.rules.ts) | rules | Every refusal a membership change can meet, in legacy order, with each door's own copy: manager/member gates, role change, Member Type, removal, direct add, child details, consent, emailed-invite target, the `added_to_family` Alert copy. | [family.members.rules.test.ts](family.members.rules.test.ts) |
| [family.families.rules.ts](family.families.rules.ts) | rules | Creating and renaming a family: `familyDraft`, `cleanMemberIds`, `dayOneRosterRefusal` (limits are parameters; billing owns the numbers), `familyPatch`, and how a `/family` card is composed. | [family.families.rules.test.ts](family.families.rules.test.ts) |
| [family.display.rules.ts](family.display.rules.ts) | rules | The pure UI helpers every roster surface shares: `canEditRole`, `canRemove`, `memberDisplayName`, `rolePillClass`. | [family.display.rules.test.ts](family.display.rules.test.ts) |
| [family.families.repo.server.ts](family.families.repo.server.ts) | repo | The membership read (oldest first, roster size and names in one query), family find/insert-with-roster/update, the grouped open-task count (read-only `tasks` join) and the oldest-family lookup. No calendar write, no clock. | [family.families.repo.db.test.ts](family.families.repo.db.test.ts) |
| [family.members.repo.server.ts](family.members.repo.server.ts) | repo | Role and membership lookups, both roster reads, membership insert/role/type/delete and the append-only consent record. No `tasks` write. | [family.members.repo.db.test.ts](family.members.repo.db.test.ts) |
| [family.invites.repo.server.ts](family.invites.repo.server.ts) | repo | The invite code reads (one family, many, one code, the `FOR UPDATE` read), mint, revoke, the DB-side use bump and the family member count. | [family.invites.repo.db.test.ts](family.invites.repo.db.test.ts) |
| [family.search.repo.server.ts](family.search.repo.server.ts) | repo | The picker's prefix search (no ORDER BY, capped), the invite flow's exact lookup and the verified-account check. | [family.search.repo.db.test.ts](family.search.repo.db.test.ts) |
| [family.families.service.server.ts](family.families.service.server.ts) | service | The `/family` list (one read per concern however many families), the detail payload (roster, activity, module switches through the port, hidden list through identity, plan usage through billing), create (plan gate first, then the draft, the verified picks and the day-one cap, one transaction) and the admin+ rename/recolour. | [family.families.service.db.test.ts](family.families.service.db.test.ts) |
| [family.members.service.server.ts](family.members.service.server.ts) | service | The four member-add doors (direct, child, emailed invite, shareable link), the role/Member Type patch and the removal that un-assigns tasks through the port. Each door's own gate comes from `family.members.rules.ts`; the family-size cap is the creator's plan. | [family.members.service.db.test.ts](family.members.service.db.test.ts) |
| [family.invites.service.server.ts](family.invites.service.server.ts) | service | Listing a family's codes, `mintFamilyInviteCode` (the one mint behind three doors), mint/revoke/preview and the locked accept transaction that bumps `use_count` DB-side. | [family.invites.service.db.test.ts](family.invites.service.db.test.ts) |
| [family.search.service.server.ts](family.search.service.server.ts) | service | The roster answer (named family or the oldest one), the picker's bounded prefix search with masked addresses, and the invite flow's exact-match lookup — the two searches stay separate use-cases. | [family.search.service.db.test.ts](family.search.service.db.test.ts) |
| [family.http.server.ts](family.http.server.ts) | http | The 18 `endpoint()` handlers: legacy auth modes, rate-limit scopes, statuses, bodies and error copy; the wire DTOs are built here (`toInstantString`) so no `Date` reaches a response type. | itself (the golden) |
| [family.fixtures.server.ts](family.fixtures.server.ts) | fixtures | Family-row builders for db tests: `seedFamily`, `seedMembership`, `seedInvite`, `seedFamilyRoster`, `seedFullFamily`, `FamilyTestUser`; each takes an optional trailing `db` (default: the committed test database, a `rollbackTest` passes its transaction). Task rows stay in the test because `tasks` owns task fixtures. | — |
| [family.http.db.test.ts](family.http.db.test.ts) | test | Golden contract for all 18 `/api` methods this module owns, run against the family endpoints on the real test database. The emailed-invite suite runs now that the handler sends through `ctx.mail`; the Q-115 rows (a non-string name) land with S6. | itself |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

### `index.ts`

Still `export {}` at S5+S6: the contract types and pure rules it will re-export (and the browser client `family.api.ts`) land with S7, as identity's did. Nothing imports family through `index.ts` yet; the rules are reached inside the module.

### `index.server.ts`

Ports (declared here, wired in `src/lib/app/ports.server.ts`; each names the module whose S5 replaces its transition bridge):

- `FamilyCalendarPort.createFamilyCalendar(ctx, familyId)` — `calendar` writes the family's `calendars` row. The bridge runs after family's own commit; calendar's S5 adapter moves the insert inside `withTx`.
- `MemberTasksPort.unassignMemberTasks(ctx, familyId, userId)` — `tasks` clears the removed member's assignments. The bridge is the legacy helper that also deletes the roster row, so the service calls it first; tasks' S5 exports the assignment clear alone.
- `FamilyModuleSwitchesPort.listFamilyModuleSwitches(ctx, familyId)` — `dashboardModules` answers the four family-scoped master switches (owner answer Q-030, 2026-11-20). Its entry exports no such function yet, so the bridge reads the legacy map.
- `FamilyChildAccountPort.createChildAccount(ctx, input)` — the child door's real, passwordless account (user row + `email` account + settings + personal calendar): `identity`'s rows and `calendar`'s. Identity's S5 has no such use-case, so the bridge is legacy `createNewUser`.
- `FamilyInviteLinkPort.mintInviteLink(input)` — the signed, code-bound join URL (#152). Only `app` may read `EMAILSECRET` and the site URL (R6), so the bridge signs the legacy HS256 token there.
- `FamilyPorts`, `FamilyCtx` (`Ctx & FamilyPorts`) and `FamilyDetailCtx` (`FamilyCtx & IdentityPorts`, because the detail payload reads the viewer's hidden modules through identity's settings service).

Services (each hides a whole use-case; no pass-throughs):

- `listFamilies(ctx, actor)` — the `/family` list payload (cards, roster, live codes, plan usage) in a fixed number of queries.
- `familyMemberLimitRefusal(ctx, actor, familyId)` — the creator's plan applied to that family's roster size (the 403 copy, or null).
- `getFamily(ctx, actor, familyId)` — the family detail payload; non-member and unknown id are one `notFound`.
- `createFamily(ctx: FamilyCtx, actor, body)` — plan gate, name/colour/pick validation; family + roster in one transaction, then the calendar through the port.
- `updateFamily(ctx, actor, familyId, body)` — rename/recolour (admin+), absent fields unchanged.
- `listInvites(ctx, actor, familyId)` — `canManageInvites` plus that family's codes (member gets an empty list, not a refusal).
- `mintInvite(ctx, actor, body)` — one code, clamped validity and uses, plus its join path.
- `mintFamilyInviteCode(ctx, familyId, plan, createdBy)` — the one mint behind the three minting doors.
- `revokeInvite(ctx, actor, code)` — delete a code (admin+).
- `previewInvite(ctx, actorOrNull, code)` — the join page/API answer for a pasted link; unusable is a value, never a redirect.
- `joinFamily(ctx, actor, code)` — the locked accept transaction; one boolean refusal plus an optional `family-full` reason.
- `listFamilyRoster(ctx, actor, familyId?)` — the roster the calendar person filter/attendee picker reads; no id answers the oldest family. (Renamed from the sheet's `listRoster` so it cannot collide with the members repo's read of the same name — R11.)
- `addMemberDirectly(ctx, actor, input)` — the direct door: gates, unknown/existing member, the family-size cap, the membership write and the `added_to_family` Alert.
- `addChildMember(ctx, actor, input)` — the child door: cap before the form, fields, unique address, consent; the account through the port, membership + consent in one transaction.
- `sendFamilyInvite(ctx, actor, input)` and `mintFamilyInviteLink(ctx, actor, input)` — the two invite-target doors (one mints a single-use 1-day code and emails it, the other the shared 10-use link). Four functions instead of the sheet's one `addFamilyMember(mode)`: the responses differ (`{success}` / `{user}` / `{success, link}`) and each door has its own gate copy.
- `changeMember(ctx, actor, input)` — role and/or Member Type, role first, with the creator-untouchable rules.
- `removeFamilyMember(ctx: FamilyCtx, actor, input)` — the tasks port plus the roster delete in one transaction.
- `searchMembers(ctx, actor, input)` — the picker's prefix search (verified only, bounded, masked, unordered).
- `findInvitableMembers(ctx, actor, input)` — the invite flow's exact-match directory search (a separate service on purpose: it must never become the picker).

Endpoints (thin `endpoint()` definitions exported for the route files): `listFamiliesEndpoint`, `createFamilyEndpoint`, `getFamilyEndpoint`, `updateFamilyEndpoint`, `listInviteCodesEndpoint`, `changeMemberEndpoint`, `removeMemberEndpoint`, `addDirectEndpoint`, `addChildEndpoint`, `sendInviteEmailEndpoint`, `mintInviteLinkEndpoint`, `mintInviteEndpoint`, `previewInviteEndpoint`, `revokeInviteEndpoint`, `joinFamilyEndpoint`, `memberSearchEndpoint`, `rosterEndpoint`, `searchFamilyEndpoint`.

### Module-internal (S3–S4; reached through the S5 services, not from an entry file)

Rules, one line each (all pure; `now`, zone and plan limits are parameters):

- `family.roles.rules.ts`: `isFamilyRole`/`isMemberType` — the vocabulary guards; `roleRank`/`meetsRole(role, min)` — creator 2, admin 1, member 0, anything else −1; `canManageInvites`/`canManageMembers`/`canSetMemberType`/`canPromoteToCreator`/`canChangeRole(actorRole, newRole)` — the permission table, a function of the role alone; `requireRole(role, min)` — the generic 403 refusal or null.
- `family.palette.rules.ts`: `isFamilyColor(value)` — exact palette membership; `isHexColor(value)` — the wider `#rrggbb` rule PATCH keeps (Q-025).
- `family.invites.rules.ts`: `clampInviteDays`/`clampInviteUses`/`shareInvitePlan(days, uses)` — the mint door's clamps; `EMAIL_INVITE_PLAN`/`LINK_INVITE_PLAN` — what an emailed invite (1 use, 1 day) and a link (10 uses, 1 day) mint; `inviteExpiresAt(now, days)`; `isInviteUsable(invite, now)`; `isInviteRefusal(answer)`/`inviteRefusalCopy(refusal)` — the one 400 and the 403 family-full answer.
- `family.search.rules.ts`: `escapeIlike`/`likePrefix(term)`/`likeExact(query)` — the two ILIKE patterns; `isPickerMatch`/`isInviteFlowMatch` — the two doors' matching rules as executable spec.
- `family.members.rules.ts`: `managerRefusal(door, role)`/`memberRefusal(door, role)` — the creator/admin and any-member gates with each door's copy; `roleChangeRefusal`/`memberTypeRefusal`/`removalRefusal`/`directAddRefusal` — first refusal in legacy order; `childDetailsRefusal` (the child door keeps its own address pattern), `consentRefusal`, `inviteTargetRefusal`; `addedToFamilyAlert(actor, familyId)` — the direct-add Alert copy.
- `family.families.rules.ts`: `familyDraft(name, color)` — create validation; `cleanMemberIds(values, creatorId)`; `hasUnaddablePick(picked, verifiedIds)`; `dayOneRosterRefusal(memberLimit, pickedCount)`; `familyPatch(name, color)`; `cardMembers`/`familyCreatedLabel(createdAt, zone)`/`buildFamilyCard(...)` — one `/family` card; `firstNameOf(roster, userId)`.

Repo functions, one line each (`db` first, no clock, `null` for "not found"):

- `family.families.repo.server.ts`: `listMemberships(db, userId)` — every family of the user, oldest first, with role/Member Type, roster size and first names; `findFamilyById`; `insertFamilyWithRoster(db, {id, name, color, creatorId, memberIds, now})` — family plus day-one roster, no calendar; `updateFamilyRow(db, id, patch)`; `countOpenFamilyTasks(db, familyIds)` — one grouped read-only count; `findMembershipFamilyId(db, userId)` — the oldest family (Q-024 B).
- `family.members.repo.server.ts`: `findMemberRole(db, userId, familyId)`; `findMembership`; `listRoster(db, familyId)`; `listRosterForFamilies(db, familyIds)` — one read for the list's side rail; `insertMembership`; `updateMemberRole`; `updateMemberType`; `deleteMembership` — returns the removed row or null (no task write); `findUserForAdd`; `insertChildConsent(db, {childUserId, parentUserId, familyId, now})` — append-only.
- `family.invites.repo.server.ts`: `listInviteCodes(db, familyId)`; `listInviteCodesForFamilies`; `findInviteCode` (no expiry filter: `isInviteUsable` decides); `findInviteCodeForUpdate` — `SELECT … FOR UPDATE`; `insertInviteCode`; `deleteInviteCode`; `incrementInviteUse` — DB-side `coalesce(useCount, 0) + 1`; `countFamilyMembers`.
- `family.search.repo.server.ts`: `findVerifiedUsersByPrefix(db, {term, excludeUserIds})` (+ `prefixSearchQuery`, the unexecuted builder the test reads the SQL from); `findInvitableUsers(db, {familyId, email, firstName, lastName})` — exact legs, current members left out; `listVerifiedUserIds(db, userIds)`.

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
- Fixtures: `family.fixtures.server.ts` — `seedFamily`, `seedMembership`, `seedInvite`, `seedFamilyRoster`, `seedFullFamily`, `FamilyTestUser`; each takes an optional trailing `db` (the committed test database by default; a `rollbackTest` passes its transaction). Task rows stay local to the test that needs them (`tasks` owns task fixtures).

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

- Membership **role** (`creator|admin|member`) is the permission; **Member Type** (`parent|child|member`) is profile only and gates nothing — `src/lib/server/db/actions/families.ts:30-44`, `src/lib/server/db/schema.ts:286-293`. Pinned by `family.http.db.test.ts › updates role and Member Type as separate columns` and, in S3, `family.roles.rules.test.ts › Member Type never grants a permission`.
- Every membership and role check names the family from the URL/body; none compares against "the user's first membership row" — `src/routes/api/family/invite/+server.ts:31-43`, `src/routes/api/family/search/+server.ts:17-22`. Pinned by `family.http.db.test.ts › answers 403 for a family you are not in, even when you belong to another`.
- Minting, revoking, adding a member and sending an invite are `creator|admin` only, and a plain member is refused with that door's own message — `src/lib/server/services/familyData.ts:51`, `src/routes/api/family/invite/+server.ts:38-43`. Pinned by each route's 403 golden in `family.http.db.test.ts`.
- Invite default `maxUses` is 10, declared once (`DEFAULT_INVITE_MAX_USES`); the mint route clamps uses 1–50 and validity days 1–30 with a 7-day default — `src/lib/server/db/actions/families.ts:142,159`, `src/routes/api/family/invite/+server.ts:46-49`. Pinned by `family.http.db.test.ts › mints a 10-use, 7-day code by default and returns its join url` and `› clamps validity to 1–30 days and uses to 1–50`.
- An email invite mints a single-use, 1-day code; a shareable link mints the shared 10-use, 1-day code — `src/routes/(family)/family/[familyId]/members/add/email/+server.ts:113-117`, `…/email/link/+server.ts:94-98`. Pinned by `family.http.db.test.ts › mints a 10-use, 1-day code and returns the token link` and, at S6, the spec golden `…/members/email`.
- Email and link invites embed the durable invite row's code in their signed link (`{email, firstName, lastName, familyId, inviteCode}`), so joining goes through the accept path against that exact row and single-use/revocation stay enforced (#152) — `src/routes/(family)/family/[familyId]/members/add/email/+server.ts:110-137`, `…/email/link/+server.ts:91-117`. Pinned by the spec golden `family.http.db.test.ts › mints one single-use, 1-day code and answers {success:true}` and `family.members.service.db.test.ts › mints a single-use one-day code and emails the code-bound link`.
- Email and link minting are IP rate-limited to 10 per 15 minutes, checked before membership — `…/add/email/+server.ts:20-21,68-76`, `…/add/email/link/+server.ts:21-22,55-63`. Pinned by `family.http.db.test.ts › answers 429 after ten mints from one IP, before the membership check`.
- The accept path runs one transaction that locks the invite row (`FOR UPDATE`), then checks expiry, `useCount < maxUses`, duplicate membership and the family-size cap, and increments `useCount` DB-side — `src/lib/server/db/actions/families.ts:197-249`. Pinned by `family.http.db.test.ts › the next roster read and the use count both reflect the new member` and `family.invites.service.db.test.ts › adds the member and bumps use_count DB-side in one locked transaction`.
- An unusable invite is one refusal: unknown, expired, used up and already-a-member answer `400 Invalid, expired, or already used invite code`; only the size cap is `403 This family is full…` — `src/lib/server/db/actions/families.ts:200-249`, `src/routes/api/family/join/+server.ts:21-31`. Pinned by the four join refusals in `family.http.db.test.ts`.
- Picker member search: verified accounts only, prefix match on first/last/email, 2–60 characters, 10-row cap, **no `ORDER BY`**, caller and `exclude` ids removed, ILIKE wildcards escaped, emails masked — `src/lib/server/db/actions/memberSearch.ts:24-31,42-52,81-124`. Pinned by `family.http.db.test.ts › matches verified prefixes, masks the email and keeps the caller out`, `› refuses a missing, one-character or blank term before any query`, `› answers 429 after twenty searches from the same IP`, `› caps the result at ten rows` and `› escapes ILIKE wildcards so they cannot become a scan`.
- Invite-flow directory search stays exact-match on email, verified only, current members excluded, 10-row cap, full emails returned — `src/lib/server/db/actions/families.ts:334-363`. Pinned by `family.http.db.test.ts › matches an exact email only, excluding members, unverified accounts and substrings` (the name leg compares both columns to the whole query; owner question Q-F6).
- Removing a Family Member un-assigns that person's Family Tasks (`assignedTo = null`, `assignmentStatus = 'none'`) in the same transaction as the roster delete; the un-assignment is `MemberTasksPort.unassignMemberTasks` (implemented by `tasks`, wired in `src/lib/app`), so family never writes `tasks` — `src/lib/server/db/actions/families.ts:300-317`. Pinned by `family.http.db.test.ts › removes the roster row and un-assigns that person's family tasks` and `family.members.service.db.test.ts › clears the removed member's tasks through the port and drops the roster row`. In the bridge era the legacy helper also deletes the roster row, which is why the port runs first.
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
