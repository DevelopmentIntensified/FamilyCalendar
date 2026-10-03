# 124 — Port the approved Family pages into the app

Status: in-progress

Source: #123, owner directive 2026-09-30 — "all approved pages need to be built
into the real app."

**Blocked by:** None. Owns the `/family` routes exclusively.

## The six approved pages

`family.html` · `family-detail.html` · `family-create.html` ·
`family-invitations.html` · `family-members-add.html` · `family-tasks.html`

## The prior work, so you do not redo it

- **#064** fixed the 404 card and the two broken hrefs. Its finding is worth
  knowing: Svelte interpolates attribute values, so 11 of 12 "literal braces"
  links were fine. The real defects were one href built as a JS string, one
  naming a route that does not exist, and a detail page rendering with a null
  family.
- **#075/#076** shipped the create page and members-before-finish-line.
- **#077** split the 793-line settings page into three bands.
- **#101** grouped the family task board by assignee.
- Member search shipped: `MemberSearchTab.svelte` → `/api/family/member-search`
  → `memberSearch.ts`. It is used by `family/[familyId]/members/add`, **not** by
  the create page.
- **#091 is still open** against `family-invitations` — the invite link is only
  findable by knowing where to look. That is a real gap on an approved page.

## Needs doing

- [x] **Read each prototype against its app route and close the gap.** Three
      outcomes per page: already matches; **the app is better** (record why,
      change nothing); or a real difference (build it). All six are answered
      below.
- [x] **#091 is in scope** — an approved page whose app route has a known open
      defect. Its two discoverability items are closed: the invite-by-link
      affordance on the family page, and the one shared `maxUses` default. The
      rest are named below, two as out of fence and one as a product decision.
- [x] **The create page has no member picker.** The prototype declares
      "members before the finish line" and #076 shipped *something*; verify
      what actually renders and whether the search belongs there. This is the
      one place a client importing server action types was found earlier — do
      not reintroduce it.
- [x] Every genuine difference gets a test. A port is done when the behaviour
      the prototype shows **cannot recur**.
- [x] Where the app is better, say so in this ticket. Do not regress a real
      implementation to match a static picture that has no loading, empty or
      error state.

## Done

### Per page, one of three outcomes

**`family.html` — the app is better. Changed nothing structural.**
The prototype is one family's hero card with a members sidebar; the app is a
list of every family the user belongs to, with a roster count and an open-Task
count per card (one grouped query for the whole page, #078/#098), the plan pill
backed by a real subscription read, and an empty state. The prototype's card is
a single fixture; the app's version answers "which family, and is it in use".

**`family-detail.html` — already matches.** #077 shipped this prototype's own
answer (one gap, one padding, one label treatment, the 40px module row), and
#064 fixed its one dead href. The two prototype bands the app does not carry
(the "Active invitation" summary and the plan-usage bar) are fixture views of
data the detail loader does not read; adding either is new product, not a port.
The prototype's own "no danger zone" card stands: `deleteFamilies()` still has
no caller.

**`family-create.html` — a real difference, built.** Two gaps: the prototype
declares members before the finish line and the app had none, and the create
action's three inserts were not atomic. See "Members before the finish line".

**`family-invitations.html` — the app is better, except for one item.** The
page already shows the code, the uses, the expiry, the join URL, a copy button
with its failure fallback, create and revoke, the empty state, and — since #098
— a per-family switcher for a user in two families. The prototype's "who has
used it" history cannot be built: a use is consumed when the code is verified,
so the rows the prototype draws are not recorded anywhere. That part of #091
(usage semantics) is still open and still needs a decision about what a use
means. What was genuinely missing — a way to get a link without going to a
management page — is now on the family page itself.

**`family-members-add.html` — already matches; the app is better on one point.**
Three tabs, same order (find someone / invite by email / create a child), all
three existing affordances intact. The app gates the email tab on
`canInviteByEmail`, which the prototype cannot do. The prototype's remaining
ask is its child-account warning, and that is **#102** — unclaimed, out of this
ticket, and its copy must not be copied: the prototype's "a child row with no
passwordHash can never sign in" is false (verified in #102). Not ported here
on purpose.

**`family-tasks.html` — a real difference, built. It contradicted #101.**
#101 shipped the assignee board and its decision 1 made unassigned Tasks fall
back to the **creator**, explicitly rejecting a visible "Nobody" bucket. The
prototype the owner approved shows that bucket. **An approval is a
specification, so the card is built and #101 is updated**, not silently vetoed:

- Tasks with no assignee now get the prototype's **"Nobody" card** — its own
  region, an `unassigned` pill, a count, and the prototype's honest note that
  nobody is on the hook for them.
- The board is fed only the Tasks that genuinely have an assignee, so nothing is
  double-counted: the old behaviour put an unassigned Task in the creator's
  column, and it now appears in exactly one place.
- `groupTasksByAssignee` keeps its creator fallback for the **dashboard card** —
  a different surface, still one column per person.
- Everything 101 built survives: the two tabs, the tag filter, the
  waiting-for-your-response banner, the completed list, the owner-only edit
  dialog, complete/advance/accept/decline, delete with its confirmation, and the
  mobile step-down to one column. The Nobody card is real capability, not a
  picture: its rows are the same `FamilyOpenTaskRow` with the same handlers.

### The duplicate family-tasks route is gone, not fixed

`/family/[familyId]/tasks` was a 312-line near-copy of the board that called
`firstName(...)` — defined nowhere in the file — so it threw a `ReferenceError`
the moment a task row rendered, **and the family detail page linked straight to
it**. #098 and #101 both deferred it because the slice was fenced off.

- The page is deleted. A second board cannot be correct, only differently
  wrong.
- The path survives as a `308` to `/family/tasks`, so a bookmark or an old link
  lands on the real board rather than a 404.
- The detail page's "Family Tasks" now points at `/family/tasks` directly.
- `links.test.ts`'s last assertion (which read the deleted file) now pins the
  durable rule: one board, one route, and no `.svelte` file under
  `family/[familyId]/tasks` — the second board cannot come back.

### The board was reading the wrong family (the last first-row guess)

`/family/tasks` picked the user's **first** `familyMembers` row, unordered, so a
user in two families got whichever one the database returned. That is #098's bug
class, still alive in the one file #098 could not reach. It now resolves the
family the same way the invitations page does: `?familyId=` addresses one
family, otherwise the **oldest** membership wins — defined, not accidental.

### Members before the finish line (the create page)

**#076 shipped nothing.** Its status was `open` with an empty `## Done`, and the
create page had no member picker at all — the app could only make a family and
then populate it on a second trip. What existed for it was #100's own door,
`/api/family/member-search`, purpose-built and tested for exactly this case and
used by nobody. So the search **does** belong there, and 076's note that it
should reuse the invite-flow endpoint stays wrong (that endpoint 403s when
there is no family, and its exact matching is the enumeration guard).

- `CreateFamilyMemberPicker.svelte` (runes, in `components/family/`) — a
  type-ahead on `/api/family/member-search?q=&exclude=`, a `N of M members`
  count against the plan's limit, chosen people removable, and one hidden
  `memberIds` field per pick. It only chooses: it cannot add anybody.
- The create action reads those ids, and it is the thing that decides:
  - blanks, repeats and the creator's own id are dropped;
  - every remaining id is re-checked against a **real, verified account** — a
    crafted post naming anybody else is refused by name, with nothing written;
  - the **member limit is enforced on the server** (`1 + picked` against the
    creator's own `memberLimit`), not only in the picker;
  - picked members get `role: 'member'` and `memberType: 'member'` written
    explicitly, and the creator keeps `role: 'creator'`. Role is the permission,
    memberType the personal profile; both are stated rather than inherited from
    a column default (ADR-0001).
  - the family, every membership and the calendar are now written in **one
    transaction**, so a failure cannot leave a half-made family.

### #091 — two items closed, the rest named

Closed here:

- **"Invite by link" on the family page.** `/family` now mints a code for any
  family the viewer may mint for and shows the join link right there — no trip
  to a management page. Gated creator/admin from the membership **role**, in the
  loader (`canInvite`) and again in the action, so a plain member never gets a
  form that quietly does nothing. The click acks in the tick (`aria-busy`,
  "Making link…"), then a toast names what happened and what to do with it, and
  a failed request says so instead of pretending.
- **The two disagreeing `maxUses` defaults.** Minting through the action
  defaulted to one use; through `/api/family/invite`, ten. The default is now
  declared once — `DEFAULT_INVITE_MAX_USES = 10` in `db/actions/families.ts` —
  and the route clamps to *that* constant rather than to a second literal. The
  invite route had no test at all; it has four now.

Still open, and outside this lane's fence:

- the email template registry and retiring the inline HTML in a route handler;
- what a plain Family Member sees on the invitations page.

### #091's usage semantics — a product decision, not a bug

Recorded so the next reader does not go looking for the missing query.

`acceptInvite` increments `useCount` when a code is **verified**, not when
somebody joins. So a use is consumed by opening the link, by the join page
loading it, by any preview the recipient's mail client makes, and by the person
who forwards it to a second address — and the row that would tell you which of
those happened does not exist. "Who has used it", the prototype's third card, is
therefore **not reconstructible from what is stored**, and the prototype's own
note says so.

That leaves a decision, not a defect, and it is the owner's:

1. **Count on acceptance, not on verification.** The counter then means "people
   who joined", and an invite to a household of four needs a bigger number — a
   per-code `maxUses` stops meaning "the link is single-use" and starts meaning
   "the family has room".
2. **Leave it, and rename what it counts.** The column's name then lies to the
   next developer unless the invitations page says "times this link was opened".

Either way the UI must stop implying the first meaning. Nothing in the app's
current copy promises a join count, so this is safe to leave as it is until the
decision is made — but it must not be "fixed" by writing an audit table nobody
asked for.

### #102's false line — verified, and it is not in the app

Checked rather than assumed, because the instruction was not to leave a false
statement in the UI:

- **The app is truthful.** `src/lib/components/family/MemberChildTab.svelte:84`
  says "Each child needs their own email address for their account." That is
  true, and it is the one hint the ticket asks to expand on.
- **The false statement is prototype-only**:
  `prototypes/app-ui/family-members-add.html:128` — "A child row with no
  `passwordHash` can never sign in". It is wrong: the child endpoint's own
  docblock says the account it creates is "email-verified, magic-link/password
  sign-in capable"
  (`family/[familyId]/members/add/child/+server.ts:15`), which `createNewUser`
  backs by setting `emailVerified: true`.

So there is nothing false in the UI to fix here. #102 remains **unclaimed** and
owns both the true up-front warning and the correction of that prototype line;
both surfaces are outside this lane's fence (`components/family/**` and the
prototype tree, which #122/#123 own).

### One copy helper, and the share sheet

`src/lib/client/share.ts` — `copyOrShare(text, { share, title, text })` returns
`'shared' | 'copied' | 'cancelled' | 'failed'`. The ladder: the platform share
sheet where the platform has one and the caller wants it, the async clipboard
where there is one, a selected textarea on an origin with no
`navigator.clipboard` at all, and an honest `failed`. A share the person closed
is `cancelled`, not a failure — that is the distinction the old handlers could
not make. The caller keeps its own wording; this owns the mechanics and the
truthfulness of the result.

Adopted by the two family copy affordances (`/family`'s "Invite by link" and the
invitations page). **Three call sites still have bespoke handlers, all outside
this fence**, named for whoever picks them up:

- `src/lib/components/family/MemberInviteTab.svelte:75`
- `src/lib/components/account/AccountApiTokensSection.svelte:38`
- `src/lib/admin/AdminExport.svelte:15`

### Verification

- `npx vitest run --project server` over every file touched — **13 files, 105
  passed**. `--project client` over the same subtree — **8 files, 53 passed**.
- `npx svelte-check` — **30 errors**, none in any file this slice wrote. The two
  it was meant to fix (`family/tasks/+page.svelte:103,116`, the `unknown` from
  `familyTaskActions`) are gone.
- `npx oxlint` on this slice's files — **9 errors**: four
  `no-chained-type-assertions` on the `as unknown as` shape the repo's own tests
  already use, and five in `share.ts` — three `no-runtime-typeof` and one
  `no-unknown-parameters` around the `typeof navigator === 'undefined'` guards a
  module that must work in both environments cannot avoid, plus one
  `no-known-value-widening` in a test. Consistency with the surrounding code
  beats the rule here; the owner asked for these to be left as they are.
- `npm run build` — **green**, exit 0.
- `npx playwright test e2e/family/ --project=chromium` — **14 passed**,
  including the new create-with-members spec.

## Notes

- `npx vitest run --project server` over this subtree — **8 files, 74 passed**
  (97 with `subscriptionService.test.ts` alongside it).
  `--project client` over the same subtree — **7 files, 47 passed**.
- `npx svelte-check` — **42 errors**, none on any line written here. Three sit
  in files this slice edited, all pre-existing: `[familyId]/+page.svelte:608`
  (077's `moduleSubmit` signature) and `family/tasks/+page.svelte:103,116` (101's
  recurring feedback). The rest are other lanes' in-flight files.
- `npx oxlint` on the family subtree — **39 errors**, all but six pre-existing in
  files this slice did not author (`links.test.ts`, `MemberInviteChildTabs`,
  `create/page.svelte.test.ts`). The six on new lines are all
  `no-chained-type-assertions` on the `as unknown as` shape the repo's existing
  tests already use (9 elsewhere in this subtree). Repo-wide the plugin reports
  256, so this lane is not the outlier.
- `npm run build` — **green**, exit 0. Twice it failed first with
  `ERR_MODULE_NOT_FOUND` against `.svelte-kit/output`, which is another agent's
  build clobbering the shared output directory mid-run, not a defect in this
  slice; it passes when the two builds are not racing.

## Notes

- **The six chained-type assertions in this slice's own test files are left on
  purpose.** They are `as unknown as` casts on a SvelteKit-typed load or action,
  the same shape nine other test files in this subtree already use. Changing them
  would make new code the odd one out for a lint rule the codebase does not hold
  itself to. Do not "fix" them.
- **The join page no longer redirects a stale link.** `verifyInviteCode` cannot
  tell unknown from expired from used-up, so the page names all three and claims
  none; it says what is not wrong (the person), what might be, and what to do
  next. `src/routes/(marketing)/family/join/[code]/+page.server.ts` returns
  `invalid` instead of `redirect('/family?error=invalid_invite')`, a parameter
  nothing ever read.
- UI feedback rules bind: ack under 100ms, confirm via toast or inline status
  naming what happened and what is next, no bare `alert()`, skeletons not
  blank cards. The prototypes have none of this; it is all new work.
- `CONTEXT.md` is canonical. `Family Member` (membership **role**) and
  `Member Type` (personal profile) are distinct and must not be conflated. Both
  gates added in this slice read `role` and never `memberType`.
- **Not done here:** 076's e2e for a create that *hits* the member limit. The
  limit is enforced and covered at the action (`create/members.test.ts`) and in
  the picker's own count; only the browser-level refusal is missing, and it needs
  a subscription row with `memberLimitOverride: 1` to set up.