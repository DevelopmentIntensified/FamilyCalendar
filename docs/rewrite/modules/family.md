# Port sheet: family

**domain** · rank 4 · port #6 · home: `src/lib/domains/family/` · README after the port: `src/lib/domains/family/README.md` (written in S1)

Families, Family Members (role vs Member Type), invite codes and email/link invites, roster, member search, child consent records.

- **May import:** kernel, identity, billing, alerts.
- **Owns tables:** `familyMembers`, `familyInviteCodes`, `families`, `childConsentRecords`.
- **Must be ported first:** billing, identity (from the legacy import graph; see the ledger).
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

- Membership role (creator/admin/member) is permission; Member Type (parent/child/member) is profile — never mixed (ADR-0001).
- Invite codes: default maxUses 10, accepted in one transaction with `SELECT … FOR UPDATE` (#155); invite JWT joins through the durable code row (#152); mint routes limited to 10.
- Removing a member unassigns their tasks first.
- Member search: verified accounts only, prefix match, masked emails, row cap, minimum query length.
- An unusable invite link answers in place, never redirects (#124).
- Child consent records are append-only; `consentAcknowledged` gate (#190).
- "First family" is deterministic (oldest membership, #098).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/families` | GET | session cookie or Bearer | none | 200 `{families[], roster[], activeInvites[], plan:{used,limit}}` — `loadFamiliesOverview` | 401 `Unauthorized` | `src/routes/api/families/+server.ts:13-17` |
| `/api/families` | POST | session or Bearer | `{name?, color?, memberIds?}`; absent name/color read as `''`; `memberIds` present must be an array (blanks, repeats, creator dropped); empty body reads `{}` | 201 `{family}` | 400 `Invalid JSON`; 400 `memberIds must be an array`; 403 `Family limit reached ({limit}). Upgrade to create more families.` + `upgradeRequired:true`; 400 `Family name is required`; 400 `Family name must be 50 characters or less`; 400 `Pick one of the offered family colours`; 400 `One of the people you picked cannot be added yet — send them an email invite instead.`; 403 `Your plan allows {limit} member(s) in a family. Create the family first, then add the rest from the family page.`; 500 `Failed to create family` | `src/routes/api/families/+server.ts:24-45`; `src/lib/server/services/familyData.ts:446-509`; `src/lib/server/services/subscriptionService.ts:196-202` |
| `/api/families/{id}` | GET | member | none | 200 `loadFamilyDetail` payload | 401 `Unauthorized`; 404 `Family not found` (non-member and missing id are the same answer) | `src/routes/api/families/[id]/+server.ts:13-19`; `src/lib/server/services/familyData.ts:172-181` |
| `/api/families/{id}` | PATCH | admin+ | `{name?, color?}`; either may be absent (absent = unchanged); name trimmed, color must match `^#[0-9a-fA-F]{6}$` | 200 `{success:true, family}` | 400 `Invalid JSON`; 400 `Invalid name`; 400 `Invalid color`; 403 `You do not have permission to perform this action` | `src/routes/api/families/[id]/+server.ts:22-42`; `src/lib/server/services/familyData.ts:258-267` |
| `/api/families/{id}/invite-codes` | GET | member | none (no `createdAt` in output — column does not exist) | 200 `{canManageInvites, codes[]}` | 401 `Unauthorized`; 404 `Family not found` (no fallback to another family) | `src/routes/api/families/[id]/invite-codes/+server.ts:12-30` |
| `/api/families/{id}/members/{userId}` | PATCH | admin+ (promoting to creator needs creator) | `{role?, memberType?}`; at least one required; role applied first, first refusal stops the request | 200 `{success:true}` | 400 `Invalid JSON`; 400 `role or memberType is required`; role: 400 `User ID and role are required`, 400 `Role must be creator, admin, or member`, 403 `You do not have permission`, 400 `Cannot change your own role`, 400 `Member not found`, 403 `Cannot change the family creator's role`, 403 `Only the creator can promote to creator`; memberType: 400 `User ID and member type are required`, 400 `Member type must be parent, child, or member`, 400 `Member not found`, 403 `You do not have permission to perform this action` | `src/routes/api/families/[id]/members/[userId]/+server.ts:12-40`; `src/lib/server/services/familyData.ts:284-340` |
| `/api/families/{id}/members/{userId}` | DELETE | admin+, never the creator | none | 200 `{success:true}` | 401 `Unauthorized`; 400 `User ID is required`; 403 `Cannot remove the family creator`; 403 `You do not have permission to perform this action` | `src/routes/api/families/[id]/members/[userId]/+server.ts:43-49`; `src/lib/server/services/familyData.ts:270-282` |
| `/api/families/{id}/members/child` | POST | creator/admin | `{firstName, lastName, email, consentAcknowledged}`; consent must be exactly `true`; email lowercased/trimmed | 200 `{success:true, user:{id,firstName,lastName,email}}` | 401 `Unauthorized`; 400 `Family ID is required`; 403 `You are not a member of this family`; 403 `Only the family creator or an admin can add members`; 403 `Family is full ({limit} member limit). Upgrade to add more members.`; 400 `First name is required`; 400 `Last name is required`; 400 `A valid email is required`; 400 `That email is already in use. Each child needs their own email address.`; 400 `Please confirm you are this child’s parent or guardian and consent to creating their account.`; 400 `This child is already a member of the family` | `src/routes/(family)/family/[familyId]/members/add/child/+server.ts:23-122`; delegated from `src/routes/api/families/[id]/members/child/+server.ts:9-11` |
| `/api/families/{id}/members/direct` | POST | creator/admin | `{userId}` (non-empty string) | 200 `{success:true}`; also writes an `added_to_family` Alert to the target | 401 `Unauthorized`; 400 `User ID is required`; 400 `Family ID is required`; 403 `You are not a member of this family`; 403 `Only the family creator or an admin can add members directly`; 404 `User not found`; 400 `User is already a member of this family`; 403 plan reason else `This family is full` | `src/routes/(family)/family/[familyId]/members/add/direct/+server.ts:18-86`; delegated from `src/routes/api/families/[id]/members/direct/+server.ts:10-12` |
| `/api/families/{id}/members/email` | POST | creator/admin | `{email, firstName, lastName}`; all three required (no partial) | 200 `{success:true}`; mints a 1-day, `maxUses:1` code and emails a token link | 401 `Unauthorized`; 429 `Too many requests. Try again later.`; 403 `Not a member of this family`; 403 `Only the family creator or an admin can send invitations`; 400 `{success:false, error:"Invalid email"}`; 400 `First and last name are required`; 500 `There was an error. Please try again.` | `src/routes/(family)/family/[familyId]/members/add/email/+server.ts:60-158`; delegated from `src/routes/api/families/[id]/members/email/+server.ts:9-11` |
| `/api/families/{id}/members/email/link` | POST | creator/admin | `{email, firstName, lastName}`; all three required | 200 `{success:true, link}`; mints a 1-day code at `DEFAULT_INVITE_MAX_USES` (10) | 401 `Unauthorized`; 429 `Too many requests. Try again later.`; 403 `Not a member of this family`; 403 `Only the family creator or an admin can generate invite links`; 400 `{success:false, error:"Invalid email"}`; 400 `First and last name are required` | `src/routes/(family)/family/[familyId]/members/add/email/link/+server.ts:47-123`; delegated from `src/routes/api/families/[id]/members/email/link/+server.ts:9-11` |
| `/api/family/invite` | POST | creator/admin | `{familyId, expiresInDays?, maxUses?}`; both counts clamped: days 1–30 default 7, uses 1–50 default 10 | 200 `{code, expiresAt, inviteUrl:"/family/join/{code}"}` | 401 `Unauthorized`; 403 `You are not a member of this family`; 403 `Only the family creator or an admin can create invitations`; 500 `Failed to generate invite code` | `src/routes/api/family/invite/+server.ts:23-66` |
| `/api/family/invite` | GET | none | `?code=` | 200 `{family:{id,name,color}, isAlreadyMember}` | 400 `Invite code is required`; 404 `Invalid or expired invite code` | `src/routes/api/family/invite/+server.ts:68-100` |
| `/api/family/invite` | DELETE | creator/admin | `{code}` | 200 `{success:true}` | 401 `Unauthorized`; 400 `Invite code is required`; 404 `Invite code not found`; 403 `You are not a member of this family`; 403 `Only the family creator or an admin can revoke invitations` | `src/routes/api/family/invite/+server.ts:102-134` |
| `/api/family/join` | POST | signed-in | `{code}` | 200 `{success:true}` (`acceptInvite`, one locked transaction) | 401 `Unauthorized`; 400 `Invite code is required`; 403 `This family is full. The subscription member limit does not allow more members.`; 400 `Invalid, expired, or already used invite code`; 500 `Failed to accept invite` | `src/routes/api/family/join/+server.ts:6-43` |
| `/api/family/member-search` | GET | signed-in (no family needed) | `?q=` trimmed, 2–60 chars; `?exclude=` repeatable user ids | 200 `{users:[{id,firstName,lastName,email(masked)}]}` (max 10, unordered) | 401 `Unauthorized`; 429 `Too many searches. Try again shortly.`; 400 `Type at least 2 characters to look someone up.`; 400 `That search is too long.` | `src/routes/api/family/member-search/+server.ts:42-80`; `src/lib/server/db/actions/memberSearch.ts:26-40` |
| `/api/family/roster` | GET | signed-in | `?familyId=` optional; absent → the user's family | 200 `{familyId, members[]}`; no family → `{familyId:null, members:[]}` | 401 `Unauthorized`; 403 `Not a member of this family` | `src/routes/api/family/roster/+server.ts:16-31` |
| `/api/family/search` | GET | member of `familyId` | `?q=` and `?familyId=`; either missing → 200 `{users:[]}` | 200 `{users}` (exact email or exact first+last, verified only, existing members excluded, limit 10) | 401 `Unauthorized`; 403 `You do not have permission to search in this family` | `src/routes/api/family/search/+server.ts:5-26`; `src/lib/server/db/actions/families.ts:330-362` |

### Rules the module must keep
- Membership **role** (`creator`/`admin`/`member`) is the permission; **Member Type** (`parent`/`child`/`member`) is profile only and never gates anything — `src/lib/server/db/actions/families.ts:30-44` · `src/lib/server/services/familyData.ts:46-51` · test: `src/routes/(family)/family/page.server.test.ts` › "carries the roster with each person's role and Member Type, for the side rail"
- Minting, revoking, adding members and sending invites are all `creator|admin` only, checked against membership in the family named by the URL/body — never against the user's first row — `src/lib/server/services/familyData.ts:51` · `src/routes/api/family/invite/+server.ts:34-43` · test: `src/routes/api/family/invite/server.test.ts` › "refuses a plain member, so "who may mint" is one rule in two places"
- Invite default `maxUses` is 10, declared once (`DEFAULT_INVITE_MAX_USES`); the mint route clamps uses 1–50 and expiry days 1–30 (default 7) — `src/lib/server/db/actions/families.ts:142,144-166` · `src/routes/api/family/invite/+server.ts:46-49` · test: `src/lib/server/db/actions/families.test.ts` › "defaults to ten uses, which is what the invite route defaults to"
- `acceptInvite` runs one transaction that takes `SELECT … FOR UPDATE` on the invite row, then checks expiry, `useCount < maxUses`, duplicate membership and the family-size cap, and increments `useCount` DB-side (`use_count + 1`) — `src/lib/server/db/actions/families.ts:200-247` · test: `src/lib/server/db/actions/families.test.ts` › "locks the invite row FOR UPDATE and verifies expiry inside the transaction"
- An invite that cannot be accepted is one boolean answer: unknown, expired, used up, already a member all return `accepted:false`; only the size cap adds `reason:'family-full'` — `src/lib/server/db/actions/families.ts:200-249` · `src/routes/api/family/join/+server.ts:21-31` · test: `src/lib/server/db/actions/families.test.ts` › "still refuses an invalid or exhausted invite code"
- Email invites mint a single-use, 1-day code; link invites mint at the shared default (10) — both 1-day — and both are IP rate-limited to 10 per 15 minutes — `src/routes/(family)/family/[familyId]/members/add/email/+server.ts:20-21,113-117` · `src/routes/(family)/family/[familyId]/members/add/email/link/+server.ts:21-22,94-98` · test: `src/routes/(family)/family/[familyId]/members/add/email/server.test.ts` › "mints a single-use invite row and emails a link binding it"
- Create-page member search: verified accounts only, prefix match on first/last/email, min 2 / max 60 chars, 10-row cap, **no `ORDER BY`**, caller and already-picked excluded, ILIKE wildcards escaped, emails masked — `src/lib/server/db/actions/memberSearch.ts:26-49,78-124` · test: `src/lib/server/db/actions/memberSearch.test.ts` › "asks for no ordering — an order would leak more than a match does"
- Invite-flow directory search stays exact-match (email, or first+last pair), verified only, excludes current family members, limit 10; a substring scan there would be an enumeration oracle — `src/lib/server/db/actions/families.ts:334-365` · test: `src/lib/server/db/actions/families.test.ts` › "matches by exact email, not a substring scan"
- Removing a Family Member un-assigns that person's Family Tasks (`assignedTo = null`, `assignmentStatus = 'none'`) in the same transaction as the roster delete, so `assignedTo` cannot keep granting write access — `src/lib/server/db/actions/families.ts:307-317` · test: `src/lib/server/db/actions/families.test.ts` › "un-assigns the removed member's family tasks and drops the roster row in one transaction"
- The creator is untouchable: cannot be removed, its role cannot change, a user cannot change their own role, and only the creator promotes to `creator` — `src/lib/server/services/familyData.ts:270-311` · test: `src/routes/api/families/[id]/server.test.ts` › "role: the creator's role is untouchable"
- Setting Member Type is admin-only and accepts only `parent|child|member`; the role value is `creator|admin|member` — `src/lib/server/services/familyData.ts:317-340`
- Creating a family: plan gate runs before the form is read; name required and ≤50 chars; colour must be a palette member (absent → first palette colour); everyone picked must be a verified account; the creator counts against the member limit; family + memberships + calendar are written in one transaction — `src/lib/server/services/familyData.ts:446-509` · test: `src/routes/(family)/family/create/members.test.ts` › "writes the whole family inside one transaction, so a failure leaves nothing behind"
- Child creation requires an explicit `consentAcknowledged === true`; it creates a real user (unique email), a `memberType:'child'` membership and an append-only `childConsentRecords` row in one transaction; the consent record is evidence, not a verified email flow — `src/routes/(family)/family/[familyId]/members/add/child/+server.ts:78-117` · `src/lib/server/db/schema.ts:965-995` · test: `src/routes/(family)/family/[familyId]/members/add/child/server.test.ts` › "refuses without an explicit consent acknowledgment and creates nothing"
- The family palette is six named earthy colours; the default is its first entry; `isFamilyColor` is an exact, case-sensitive membership test; `#3B82F6` is retired — `src/lib/utils/familyPalette.ts:23-46` · test: `src/lib/utils/familyPalette.test.ts` › "no longer carries the old blue default — the palette replaced it, it did not join it"
- UI permission helpers are pure and shared: creators may act on anyone but themselves, admins only on plain members, nobody removes themselves or a creator — `src/lib/utils/familyDisplay.ts:9-36` · test: `src/lib/utils/familyDisplay.test.ts` › "allows creators on anyone but self, admins on members only"
- Single-family reads never guess: memberships are ordered by the family's `createdAt`, `?familyId=` selects a family, and the fallback is the **oldest** family — `src/lib/server/db/actions/families.ts:96` · `src/lib/server/services/familyData.ts:376-379,406-410` · test: `src/routes/(family)/family/tasks/page.server.test.ts` › "defaults to the OLDEST family, not whichever membership row comes first"
- The `/family` list costs a fixed number of queries regardless of family count (one memberships read with roster count+names, one grouped open-task count, one roster, one code read, one limits read) — never one query per family — `src/lib/server/services/familyData.ts:54-140` · test: `src/routes/(family)/family/page.server.test.ts` › "does not issue one query per family: 1 family and 3 families cost the same"

### Page and UI behaviour worth keeping
- `/family` shows one card per family: initial on its colour, stat strip (Members, Created, Colour, Open tasks), roster strip capped at 5 avatars with "+N more", then ways in — Open family, Members, Add a member (only when `canInvite`), Family tasks — `src/routes/(family)/family/+page.svelte:23-52,288-324,350-397`
- Empty `/family` state: "No families yet" + "Create Your First Family" `src/routes/(family)/family/+page.svelte:401-425`
- Per-family "Invite by link" forms in the Invitations card: minting acknowledged in the click tick, then the join link is shown for the family it was minted for, copy/share ladder, honest copy-failure text — `src/routes/(family)/family/+page.svelte:44-95,453-515` · test: `src/routes/(family)/family/inviteLink.svelte.test.ts` › "does not show one link above another family it was not minted for"
- Side rail per family: roster rows (name, Member Type, role pill) and the live code with uses/expiry, copy button and "Manage invitations" — `src/routes/(family)/family/+page.svelte:600-700`
- `/family/create`: live preview (family name, chosen colour, one avatar per pick plus a dashed slot), plan-limit banner + Upgrade, usage line "N of M families", palette swatches named in plain words, toast `"{name} created — opening it now"`, "What happens next" note — `src/routes/(family)/family/create/+page.svelte:11-32,63-105,120-260` · test: `src/routes/(family)/family/create/page.svelte.test.ts` › "confirms the create with a toast naming the family"
- Create-page picker "Who is in it": `{picked+1} of {limit} members`, 2-char floor, 300 ms debounce, picked people excluded from later searches, "No account by that name. Send them an email invite from the family page instead.", limit-reached notice, one hidden `memberIds` input per pick — `src/lib/components/family/CreateFamilyMemberPicker.svelte:53-110,114-223`
- `/family/invitations`: family switcher when the user has more than one family; plain member sees "Only the family creator or an admin can manage invitations."; live code drawn as one segment per allowed use with "N of M used · expires …", `∞` for no cap; other codes each with copy + Revoke; New code band (Validity + Max uses) and Revoke band — `src/routes/(family)/family/invitations/+page.svelte:180-210,211-320,335-420`
- `/family/{id}/members/add`: one tablist — "Find someone", "Invite by email" (hidden unless `canInviteByEmail`), "Create a child"; success screen says "Invite sent to {email} — they join when they open it (expires in 24h)." for an emailed invite, "Member Added!" otherwise — `src/routes/(family)/family/[familyId]/members/add/+page.svelte:45-68,84-115` · test: `src/routes/(family)/family/[familyId]/members/add/page.svelte.test.ts` › "says the invite was sent to that address, not that a member was added"
- Child tab states the real constraint *before* the email field ("A child is a real account… No password is set… unique across all of Family Planz") and will not submit without the consent checkbox (also `required` in markup) — `src/lib/components/family/MemberChildTab.svelte:84-122`
- Invite tab: Send Invite + Get Invite Link (link button disabled until email and both names are present), result box with Copy/Shared ✓, "Expires in 24 hours", "What they get" note naming `/family/join/[code]` — `src/lib/components/family/MemberInviteTab.svelte:92-180`
- `/family/join/{code}` answers in place for an unusable link ("This invite link isn't valid any more", all three reasons named, "Ask whoever invited you to send you a new link", Log in + Your families) and never renders a Join button; a valid link offers Join Family (signed in) or Log in/Create Account with `?redirect=`; success shows "Welcome to the family!" then redirects to `/family` after 1.5 s — `src/routes/(marketing)/family/join/[code]/+page.svelte:11-141` · test: `src/routes/(marketing)/family/join/[code]/page.server.test.ts` › "says the link is unusable instead of redirecting to a page that ignores the query"
- Add-member failures read `{error}` first, then a thrown server `{message}`, else "Something went wrong. Please try again." — a non-2xx is never treated as success — `src/lib/components/family/responseError.ts:8-19` · test: `src/lib/components/family/MemberInviteChildTabs.svelte.test.ts` › "add-member tabs — a server error is not a success (issue 250)"

### Probably accidental (candidates to drop, owner to confirm)
- `getUserFamilyId` still documents and returns "the user's family id" from an unordered row while every other read is multi-family; the roster default and `loadUserScope` depend on that guess — `src/lib/server/db/actions/families.ts:251-258` — arbitrary first membership
- `getFamilies`, `getFamiliesCount`, `deleteFamilies` have no caller left in `src/` — `src/lib/server/db/actions/families.ts:17,21,129` — dead exports
- Invitations page claims "A use is spent when the link is opened, not when somebody joins.", but nothing increments `useCount` on open; only `acceptInvite` does — `src/routes/(family)/family/invitations/+page.svelte:394` vs `src/lib/server/db/actions/families.ts:242-244` — copy contradicts the code
- `familyInviteCodes.maxUses` has a DB default of 1 while every minting path uses the action default of 10 — `src/lib/server/db/schema.ts:309` vs `src/lib/server/db/actions/families.ts:142` — a second, contradicting default
- The child route creates the user account, then checks for an existing membership; that guard is unreachable because the unique-email check rejects first, and it would leave a created account behind if it ever fired — `src/routes/(family)/family/[familyId]/members/add/child/+server.ts:93-102` — dead branch / partial write
- `PATCH /api/families/{id}` accepts any `#rrggbb`, while creating a family requires an exact palette colour — `src/routes/api/families/[id]/+server.ts:31` vs `src/lib/server/services/familyData.ts:459` — two colour rules
- `/api/family/search` answers `200 {users:[]}` when `q` or `familyId` is missing instead of the 400 the sibling search door returns — `src/routes/api/family/search/+server.ts:13-15` — silent refusal
- `loadFamiliesOverview` recovers each card avatar's `userId` by matching a **first name** against the roster, and fabricates `roster-${i}` when no match exists — `src/lib/server/services/familyData.ts:125-131` — duplicate first names get the wrong person's colour
- `removeMember` never checks that the target is a member, so deleting a non-member returns `{ok:true}` — `src/lib/server/services/familyData.ts:270-282` — no-op reported as success
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#138](../../archive/issues/138-parity-family-folder.md) Family routes parity. | DESIGN | keep markup |
| [#190](../../archive/issues/190-children-data-consent.md) Children: age gate + verified parental consent. | OWNER | owner |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# family: 0% ported

legacy source files left (11/11, 1366 LOC):
  - src/lib/components/family/CreateFamilyMemberPicker.svelte (225 LOC, ui) importers: 1
  - src/lib/components/family/MemberChildTab.svelte (132 LOC, ui) importers: 1
  - src/lib/components/family/MemberInviteTab.svelte (186 LOC, ui) importers: 1
  - src/lib/components/family/MemberSearchTab.svelte (170 LOC, ui) importers: 1
  - src/lib/components/family/responseError.ts (20 LOC, model) importers: 3
  - src/lib/server/db/actions/families.ts (364 LOC, server) importers: 38
  - src/lib/server/db/actions/memberSearch.ts (125 LOC, server) importers: 1
  - src/lib/server/emails/family-invite.ts (20 LOC, server) importers: 1
  - src/lib/server/services/userScope.ts (24 LOC, server) importers: 2
  - src/lib/utils/familyDisplay.ts (54 LOC, model) importers: 2
  - src/lib/utils/familyPalette.ts (46 LOC, model) importers: 3

route files not yet wiring-only (27/27):
  - src/routes/(family)/family/+page.server.ts  /family
  - src/routes/(family)/family/+page.svelte  /family
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(family)/family/[familyId]/members/add/+page.server.ts  /family/[familyId]/members/add
  - src/routes/(family)/family/[familyId]/members/add/+page.svelte  /family/[familyId]/members/add
  - src/routes/(family)/family/[familyId]/members/add/child/+server.ts  /family/[familyId]/members/add/child
  - src/routes/(family)/family/[familyId]/members/add/direct/+server.ts  /family/[familyId]/members/add/direct
  - src/routes/(family)/family/[familyId]/members/add/email/+server.ts  /family/[familyId]/members/add/email
  - src/routes/(family)/family/[familyId]/members/add/email/link/+server.ts  /family/[familyId]/members/add/email/link
  - src/routes/(family)/family/create/+page.server.ts  /family/create
  - src/routes/(family)/family/create/+page.svelte  /family/create
  - src/routes/(family)/family/invitations/+page.server.ts  /family/invitations
  - src/routes/(family)/family/invitations/+page.svelte  /family/invitations
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/(marketing)/family/join/[code]/+page.server.ts  /family/join/[code]
  - src/routes/(marketing)/family/join/[code]/+page.svelte  /family/join/[code]
  - src/routes/api/families/+server.ts  /api/families
  - src/routes/api/families/[id]/+server.ts  /api/families/[id]
  - src/routes/api/families/[id]/invite-codes/+server.ts  /api/families/[id]/invite-codes
  - src/routes/api/families/[id]/members/[userId]/+server.ts  /api/families/[id]/members/[userId]
  - src/routes/api/families/[id]/members/child/+server.ts  /api/families/[id]/members/child
  - src/routes/api/families/[id]/members/direct/+server.ts  /api/families/[id]/members/direct
  - src/routes/api/families/[id]/members/email/+server.ts  /api/families/[id]/members/email
  - src/routes/api/families/[id]/members/email/link/+server.ts  /api/families/[id]/members/email/link
  - src/routes/api/family/invite/+server.ts  /api/family/invite
      NOTE: Inline selects on familyMembers/familyInviteCodes -> family repo.
  - src/routes/api/family/join/+server.ts  /api/family/join
  - src/routes/api/family/member-search/+server.ts  /api/family/member-search
  - src/routes/api/family/roster/+server.ts  /api/family/roster
  - src/routes/api/family/search/+server.ts  /api/family/search

legacy test files left (29/29) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/family/CreateFamilyMemberPicker.svelte.test.ts [component, 10 tests]
  - src/lib/components/family/MemberInviteChildTabs.svelte.test.ts [component, 10 tests]
  - src/lib/components/family/MemberSearchTab.svelte.test.ts [component, 3 tests]
  - src/lib/server/db/actions/families.test.ts [stub-db, 16 tests]
  - src/lib/server/db/actions/memberSearch.test.ts [stub-db, 13 tests]
  - src/lib/server/emails/family-invite.test.ts [pure, 4 tests]
  - src/lib/utils/familyDisplay.test.ts [pure, 4 tests]
  - src/lib/utils/familyPalette.test.ts [pure, 5 tests]
  - src/routes/(family)/family/[familyId]/members/add/child/server.test.ts [route, 5 tests]
  - src/routes/(family)/family/[familyId]/members/add/email/link/server.test.ts [route, 6 tests]
  - src/routes/(family)/family/[familyId]/members/add/email/server.test.ts [route, 7 tests]
  - src/routes/(family)/family/[familyId]/members/add/page.svelte.test.ts [component, 6 tests]
  - src/routes/(family)/family/create/members.test.ts [route, 10 tests]
  - src/routes/(family)/family/create/page.server.test.ts [route, 5 tests]
  - src/routes/(family)/family/create/page.svelte.test.ts [component, 15 tests]
  - src/routes/(family)/family/invitations/page.svelte.test.ts [component, 16 tests]
  - src/routes/(family)/family/inviteLink.svelte.test.ts [component, 9 tests]
  - src/routes/(family)/family/inviteLink.test.ts [route, 4 tests]
  - src/routes/(family)/family/page.server.test.ts [route, 17 tests]
  - src/routes/(family)/family/page.svelte.test.ts [component, 17 tests]
  - src/routes/(marketing)/family/join/[code]/page.server.test.ts [route, 2 tests]
  - src/routes/(marketing)/family/join/[code]/page.svelte.test.ts [component, 6 tests]
  - src/routes/api/families/[id]/members/add.server.test.ts [route, 4 tests]
  - src/routes/api/families/[id]/server.test.ts [route, 17 tests]
  - src/routes/api/families/create.server.test.ts [route, 5 tests]
  - src/routes/api/families/lists.server.test.ts [route, 7 tests]
  - src/routes/api/family/invite/server.test.ts [route, 4 tests]
  - src/routes/api/family/member-search/server.test.ts [route, 8 tests]
  - src/routes/api/family/roster/server.test.ts [route, 4 tests]
```
<!-- census:end -->
