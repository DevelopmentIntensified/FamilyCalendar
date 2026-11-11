# 100 — Create a family: the member picker needs a search of its own

Status: done

Source: residue from `app-ui/family-create.html` — 076's note assumes the
existing family search endpoint can be reused. It cannot. Verified against the
code.

**Blocked by:** None (can start immediately). 076 consumes this; nothing here
depends on 075.

## Needs doing

- [x] A member search that works **before the family exists**, which the
      existing endpoint cannot do: it refuses any caller who is not already a
      member of the family in the query string, and on the create page there is
      no family to be a member of.
- [x] A search that is a type-ahead, which is also the opposite of what the
      existing lookup does. That one is an **exact** match — an exact email, or
      an exact first-and-last pair — and its own documentation says why: a
      substring scan would let any family member enumerate every verified user
      in the product one letter at a time. A create-page picker needs prefix
      matching, so it needs its own bounded search and its own limits.
- [x] The new search is bounded on purpose: a length floor, a row cap, and no
      ordering that leaks. The enumeration guard is the reason the existing
      lookup is shaped the way it is; it does not get weakened to make a picker
      nicer.
- [x] The search cannot return the caller, and cannot return anyone already in
      the family being created.
- [x] Tests: a prefix matches a person, a single letter does not, the caller
      never appears in their own results, the row cap holds, and a short query
      is refused rather than scanned.

## Done

### Why a new endpoint, rather than a looser existing one

Two independent reasons, and the second is the one that matters:

1. `/api/family/search` gates on `getUserFamilies(caller).families?.id ===
   familyId`. On the create page there is no family, so every call is a 403.
   A picker cannot ask a question only a member of a nonexistent family may ask.
2. Its matching is **exact by design**, and the comment on `searchUsers` says
   why: a wildcard scan there would let any family member enumerate every
   verified user one letter at a time. Making it prefix-match to serve a picker
   would hand that oracle to every family in the product.

So the guard was not loosened anywhere. The invite-flow door is byte-for-byte
what it was, and the type-ahead got **its own door** carrying **its own**
bounds. That is the whole reason this is a new file rather than a parameter.

### `src/lib/server/db/actions/memberSearch.ts`

`findVerifiedUsersByPrefix(query, { callerId, excludeUserIds })` — a prefix
(`term%`) match on first name, last name **or** email, `emailVerified = true`,
the caller and every already-picked id excluded, `LIMIT 10`, **no `ORDER BY`**.

The guard, in the order it bites:

- **A length floor of 2** (`MEMBER_SEARCH_MIN_QUERY`). A single letter is
  refused, not scanned — that refusal is the whole enumeration guard for a
  prefix search, and it happens *before* a query is built. A term over 60
  characters is refused too, so a long term cannot be a slow one.
- **A row cap of 10** (`MEMBER_SEARCH_ROW_CAP`). One query cannot return the
  table.
- **No ordering.** An `ORDER BY` leaks more than a match does: by `createdAt`
  it leaks join order, by `email` it leaks a position in an alphabetical list
  and therefore a count. There is deliberately no ordering at all, which is why
  a full page of matches is truncated arbitrarily rather than helpfully.
- **Wildcards escaped** (`a%n` matches `a%n`, not everything), so a crafted
  term cannot turn the prefix into the full scan the floor exists to prevent.
  Copied rather than imported from `families.ts` so the two doors cannot be
  edited into one.
- **Verified users only; never the caller; never anyone already picked.**

10 specs in `memberSearch.test.ts`, asserting the compiled where-clause rather
than the returned rows — the enumeration guard lives in the SQL, so that is
where it has to be pinned. The stub records the builder calls; the walker
flattens the drizzle condition into its column names and bound parameters, so
the tests can read the actual prefix: `'ann%'` is in, `'%ann%'` is not.

### `src/routes/api/family/member-search/+server.ts`

`GET ?q=…&exclude=…` — its own door, with its own guard, following the house
`deps` seam used by `/login/email` (so the route is testable without a
database):

- `401` with no signed-in user. Any signed-in user may search: there is no
  family to be a member of yet, and inventing a membership requirement would
  mean inventing a family first. The bounds below are what stands in for it.
- `429` at 20 searches per 5 minutes per client (`clientKey` + `rateLimit`, the
  existing utility) — enough to type-ahead, not to crawl. Refused **before** a
  query is spent.
- `400` under the floor or over the ceiling, again before a query is spent. The
  route and the query read the *same exported constants*, so the two cannot
  drift.
- The caller id is passed as an exclusion on every call, and `exclude`
  (repeatable) carries the ids the picker has already chosen.
- If the query refuses a term anyway, the door answers `{ users: [] }` — empty,
  never the reason.

8 specs in `server.test.ts`, including one that asserts the search runs with
**no `familyId` in the URL at all** — 076's wrong assumption, pinned so it
cannot come back.

## Notes

- **076 says the picker should "reuse the existing family search endpoint
  rather than a new one". That is wrong on two counts, and both were verified:
  the endpoint gates on membership of a family that does not exist yet, and its
  matching is exact-by-design against enumeration. 076's picker should call
  the endpoint built here** — `GET /api/family/member-search?q=…&exclude=…`.
  076's own to-dos — the member picker UI, the single transaction, the limit —
  are unaffected and can land on top of this.
- The member limit check the picker needs already exists as a service and
  already returns the limit, the current count and a reason. 076 asks for it to
  be "enforced on the server"; the primitive is there, the create action just
  never calls it. Use the existing call rather than writing a second one.
  **This endpoint deliberately carries no limit logic at all.**
  One note for 076: `canAddFamilyMember(familyId, …)` needs a family id, and on
  the create page there is not one yet — so pass the creator's own limit as
  `options.limit`, read from `getUserSubscriptionLimits(creatorId)`, rather than
  reimplementing the check against a family that does not exist.
- This endpoint is the one place a not-yet-created family legitimately needs
  to look up people. That is why it must be its own narrow door rather than a
  loosened version of the invite-flow one.
- **Flagged for review, deliberately not changed:** the result carries the
  person's **email**, because a picker that shows only names cannot tell two
  people called Sarah apart, and the prototype shows the email under the name.
  The invite-flow door shows email too, but only to a member of the family
  being searched; here any signed-in user can type two characters and get ten
  verified users' addresses. The exposure is real and bounded — 2-character
  floor, 10 rows, 20 searches per 5 minutes, no ordering — but it is wider
  than the door next door. If that is not the trade we want, drop `email` from
  the select and the picker shows names only; it is one line and one test.
