# 285 — Day Dashboard shows multi-day events only on their start day

Status: done

Source: 2026-11-02 leftovers pass.

## Evidence

#217 follow-up: `src/routes/(calendar)/calendar/dashboard/+page.server.ts` filters day events by start date only, so a trip Oct 15-Nov 10 doesn't appear on Nov 3's dashboard.

## Done

- Boundary decided: the viewed day is `[dayStart, nextDayStart)` in the user's zone. A span shows when `start < nextDayStart && end > dayStart` (end exclusive — an event ending exactly at 00:00 belongs to the previous day only). A point event (no end, or end <= start) shows when its start is inside the window, so an end-less event at exactly 00:00 still shows. All-day events use the same rule on their stored instants. Documented in `src/lib/utils/dayOverlap.ts`.
- `pickDayEntries` (same file) narrows `parseEvents` output (which already splits multi-day events into one entry per local day) to one entry per event on the viewed day, dropping the 00:00-end entry. The dashboard loader's day filter now calls it — a single-expression swap; the loader's return shape is untouched.
- Finding: the issue's headline symptom (Oct 15-Nov 10 trip missing on Nov 3) was already masked by #217's overlap expansion + `parseEvents` per-day split for non-recurring events; the live defect was the 00:00-end leak (and the inclusive `endOf('day')` bound). Not covered: a *recurring* multi-day occurrence that starts more than 1 day before the viewed day, since the loader only expands ±1 day.
- Tests: `src/lib/utils/dayOverlap.test.ts` — weeks-long trip, end at exactly 00:00 (dropped), end at 00:00 + 1ms (kept), start at next 00:00 (dropped), zero-length at 00:00 (kept), zone edge (03:30Z is Nov 3 in Chicago, Nov 4 in UTC), and a parseEvents pipeline case (trip, overnight, all-day multi-day, 00:00-end, next-day) in UTC / America/Chicago / Pacific/Auckland.
- Evidence: suite green under TZ=UTC and TZ=America/Chicago (same caveats as #284); `npm run build` passes.

## Needs doing

- (follow-up, optional) widen the dashboard expansion window for recurring multi-day series whose occurrence starts >1 day before the viewed day.
