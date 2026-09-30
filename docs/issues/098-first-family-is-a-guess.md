# 098 — "My family" is a first-row guess, and it is authorising things

Status: in-progress

Source: `app-ui/family.html` review, while grounding the family card. Two
defects a prototype agent surfaced that the card review did not name: the
plan-usage figure can only ever read one, and the same helper decides who is
allowed to do what.

**Blocked by:** None (can start immediately).

## The problem

The app has a helper that answers "which family is this user's family?". It
takes the user's first membership row and returns that one family. There is no
ordering, so which row comes first is whatever the database hands back.

Six places lean on it, and **five of them use it as an authorisation check** —
comparing the returned family id against the family id in the URL and
refusing the request when they differ. For a user who belongs to two families,
that check passes only for the family that happened to come back first. For
everyone else it refuses.

Concretely, a creator who belongs to a second family cannot add a member to
it, cannot create a child in it, cannot use the member search inside it, and
sees the invitations page report that they have no family at all. A genuine
second family is close to unusable, and the failure looks like a permissions
problem, not a data problem, so it is hard to report.

Two more routes repeat the same first-row guess inline rather than through the
helper, and one of them is a crash.

## Needs doing

- [x] Authorisation stops going through "the user's one family". Every check
      that compares a family id in the URL against the helper's answer becomes
      a real membership check for that family: the existing per-family role
      lookup already exists and is the right primitive. **Five call sites, all
      converted** — `api/family/search`, `api/family/invite` (POST + DELETE),
      `family/[familyId]/members/add/direct`, `.../add/child`. Three of the five
      already called `getFamilyMemberRole` on the very next line, so the
      first-row comparison was redundant *as well as* wrong; each now reads its
      own role once and distinguishes "not a member" from "not an admin".
- [x] The helper stops being a guess. `getUserFamilies` is **deleted**, replaced
      by `getUserFamilyMemberships(userId)` → `UserFamilyMembership[]`, ordered
      `families.createdAt` ASC so "first" is defined rather than whatever the
      database hands back. Each row carries `{ family, role, memberType,
      memberCount }` — `role` is the membership role (the permission),
      `memberType` is the Member Type (the personal profile, NOT a permission),
      kept distinct per CONTEXT.md.
- [x] The families list shows **all** of them, and its "N families you belong
      to" line can finally read a number other than one.
- [x] The plan-usage figure on the families list is backed by a real count
      against the user's plan limit. **Chose to LOAD the subscription and show
      the pill**, not remove it — see the decision note below.
- [ ] The duplicate family-tasks route is deleted or made to work. It is a
      near-copy of the real one, it never runs, and it calls a helper that does
      not exist in the file — so the page throws on load. Pick one: delete it
      and redirect the path, or keep it and fix it. Do not leave a second copy
      of a page that cannot render. **NOT DONE HERE**: that route is
      `src/routes/(family)/family/tasks/+page.server.ts`, inside the
      family-tasks subtree another agent owns, and the slice was fenced off.
- [x] Tests: the families list renders both of a two-family user; the plan-usage
      figure matches the real count against the real limit (default tier and a
      subscribed tier); a non-member's family still resolves to nobody.
- [ ] Tests still owed on the API surface: a user in two families can add a
      member, create a child and search in **both**; a user in one family is
      refused for a family they are not in. The conversion is done and the
      checks are now per-family membership, but the routes have no handler-level
      tests yet.

## Done

- `getUserFamilyMemberships` reads the user's memberships with one query, and
  **folds each family's roster size into it** via a self-join on an aliased
  `familyMembers` (`roster`) + `count()`. The old loader spent a *separate*
  query per family for `memberCount`; now the loader's own queries are
  membership+roster, one grouped open-Task count, one subscription read.
- **The card's stat is open Family Tasks** (`completed_at IS NULL AND
  archived_at IS NULL`, the same definition the Family Task Board uses), counted
  for all of the user's families in **one grouped query** — `GROUP BY
  tasks.family_id` over `IN (…)`, never one query per card. Chosen over
  "upcoming this week" and "last activity" because it is the only one that is
  honest: Recurring Events expand virtually, so an event-row count under-reports
  a family that lives on a weekly routine; "last activity" needs an invented
  definition across two tables. Open Tasks are one row per Task by definition
  (including Recurring Tasks — no occurrence expansion), so the number on the
  card agrees with the board you land on.
- The families-list page renders `N members · M open tasks` per card, with a
  visible `·` separator and an `sr-only` comma so a screen reader does not read
  "4 members 3 open tasks" as one number.
- **Plan pill decision: load it and show it.** `getUserSubscriptionLimits` is
  already the seam behind `/account`, `/family/create` and `/calendar/archive`,
  so the data is one cheap read and real. A family at its limit whose Create
  button leads to a guaranteed refusal is a dead end, so at the limit the button
  becomes an "Upgrade to add families" link to `/pricing` and the pill turns
  amber. The create page's banner stays where it is for the hard refusal.
- The families list page also links "Family Tasks" to `/family/tasks`, which is
  the **duplicate** route — see Needs doing. Left alone deliberately: fixing the
  link means deciding that route's fate, which is not this slice's call.
- `getAccessibleCalendarIds` was the other inline first-membership guess (found
  by grepping the pattern, not the helper name, as the notes warned). It now
  reads **every** membership and `inArray`s the family ids, so a second family's
  calendar is no longer invisible. Test updated: "adds the first family
  calendar" → "adds every family calendar the user belongs to".
- `src/routes/(family)/family/invitations/+page.server.ts` also went through the
  helper, so it was refusing its second family. It now takes `?familyId=`,
  defaults to the oldest membership, and returns `memberships` so the page can
  offer a per-family switcher when there is more than one.

### Verification

- `npx vitest run --project server` — 110 files, **1886 passed**.
- `npx vitest run --project client` — 87 files, **535 passed**. (An earlier run
  showed 3 failures in `calendar/groceries/page.svelte.test.ts`, in another
  agent's fenced subtree and unrelated to these files; the clean run above is
  the accurate figure.)
- `npm run build` — green (Vercel adapter).
- `npx svelte-check` — **49 errors, none in any file this slice touched**. The
  rest are in other agents' in-flight files.
- `npx oxlint` on all ten changed files — 0 warnings, 0 errors.
- New tests: `src/routes/(family)/family/page.server.test.ts` (7) — the
  two-family user (the case that is broken today), per-family memberCount and
  zero-filled openTasks, explicit ordering, the empty user, the
  **query-count pin** (1 family and 3 families cost the same 3 selects, so a
  per-card query cannot come back), and plan usage against both the default
  limit and a subscribed tier.

## Decided against

- **Removing the plan-usage affordance** instead of loading it. 078 allows
  either. Loading wins because the subscription read already exists as a shared
  seam, so "no data behind the pill" is not a real constraint any more — and
  leaving the pill there while deleting the Create link would just move the dead
  end.
- **A schema change.** None of this needs DDL: `familyMembers` already has the
  `(user_id, family_id)` compound primary key and `families.created_at`, which
  is everything the new ordering and the roster count rely on. No SQL to hand
  over.
- **`getUserFamilyId`** still documents a "Single-membership assumption" and is
  used by `/account` to list family calendars. It is the same bug class, but it
  is the account page's loader, not this one — left alone to keep the slice
  inside its fence. Worth its own ticket alongside the family-tasks route.

## Notes

- **The invite-flow authorisation is a real permission check and it is
  currently wrong**, not merely brittle. Every one of the affected paths
  compares against a first-row guess, so a second family reads as a family you
  do not belong to. Fix this before the plan-usage pill: a plan figure on a
  page that only ever lists one of your families would be a number about
  nothing.
- Two routes do the first-row guess inline instead of calling the helper, and
  the duplicate family-tasks route also **ignores the family id in its own
  URL** — it renders whichever family the first row names, at any path. Grep
  for the first-membership pattern rather than for the helper by name; two of
  the six are not going through it.
- The near-duplicate route is the one that crashes. Its page calls a name
  helper that is never defined or imported in that file, so the call throws
  the moment the list renders. Nothing links to it, which is why it has gone
  unnoticed — check the nav tables and the breadcrumb before deleting, and
  make sure whatever redirects there is a real redirect.
- 078 covers the family card's spacing and its extra stat. This ticket covers
  the loader underneath it — 078's own note asks whether the pill can be backed
  with data, and the answer is currently no. Do that work here, then 078's stat
  has something to sit on.
- 078's note says the real page has an upgrade banner where the prototype has
  the pill. It does not — the page has neither. The banner lives on the family
  create page. Read 078's note as out of date.
