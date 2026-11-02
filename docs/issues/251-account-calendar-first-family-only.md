# 251 — Account Calendar section lists only the first family's calendar

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(calendar)/account/+page.server.ts:99` `memberships[0]?.family.id`.

## Repro

Member of two families -> second family calendar missing.

## Done

- Loader queries `inArray(calendars.familyId, <all membership family ids>)` and maps rows via new pure `familyCalendarEntries()` (`src/lib/components/account/accountCalendars.ts`), each calendar named after its own family. Table test `accountCalendars.test.ts` (two families, unnamed fallback, foreign family dropped, no memberships).
- Note: loader itself has no unit seam (direct db + many services); the query change is covered by the helper test + svelte-check only.

## Needs doing

(none)
