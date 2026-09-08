# 041 — Calendar page load perf (server + client findings)

Status: in-progress

## Done

- Mapped full load pipeline with file:line evidence (see Needs doing).
- Baseline (dev SSR, anon, warmed): TTFB ~0.95s median, HTML 122752B.
- #2 triple-settings: page reuses layout's settings via `parent()` +
  `zoneFromSettings()` pure helper (own vitest suite) — 2 SELECTs saved
  per load. TTFB ~0.95s → ~0.81s median, size unchanged. Bigger win
  expected on Neon (per-roundtrip latency).
- With-data baseline (Neon, daily+weekly recurring + 40 one-offs):
  TTFB ~1.35s, HTML 465306B. (Dev server reads dotenv `.env` → Neon,
  NOT `.env.local`; local seeds were wiped from scope — Neon verified
  clean of junk.)
- #3 month window: `monthGridWindow(?date=)` + `ExpansionWindow` param
  on `expandEventsForUser` (legacy ±2y default keeps dashboard/print
  unchanged); one-off SELECTs scoped by overlap, recurring masters still
  load. HTML 465KB → 158KB (−66%), TTFB ~1.35s → ~1.15s warmed.
  Caught live: drizzle timestamptz mode:'string' rejects Date params —
  window carries ISO strings for queries. 4 window tests green.
- #4 batched cursor sync: 1 SELECT + N sequential UPDATEs → 1 SELECT +
  1 UPDATE (`inArray`). Mock-contract tests unchanged, 4 green. A/B with
  5 stale tasks (Neon): OLD 1.8–3.2s vs NEW ~1.2s warmed.
- #5 verse local-only: deleted ESV remote fetch (API + cache + fallback
  scaffolding, −91 lines); `getVerseForDate` resolves from `DAILY_VERSES`.
  13 tests updated/green. No local TTFB delta (no-key path was already
  fast) — kills the 10s-timeout worst case on cold starts with a key.

## Needs doing

Server (biggest first):

1. **Parallelize the load chain** (`+page.server.ts:43-243`): ~10
   SEQUENTIAL `await guard(...)` stages. `settings`/`personal`/`familyId`
   need only `userId` → one `Promise.all`. Family block needs `familyId`;
   tasks/events need `zone`. Est: 10+ roundtrips → ~4.
2. **Triple `userSettings` fetch per load**: layout server
   (`(calendar)/calendar/+layout.server.ts`) + page (`+page.server.ts:67`)
   + `getUserZone` (`userTimezone.ts:11` re-selects settings just for
   `timeZone`). Fetch once, derive + validate zone from the row.
3. **Writes in the read path**: `syncRecurringCursors`
   (`tasks.ts:896`) runs on EVERY calendar load — 1 SELECT + N sequential
   per-row UPDATEs (`tasks.ts:921-923`). Batch to one
   `UPDATE...WHERE`, and/or move off the critical path (fire-and-forget
   after response, or run on task mutations only).
4. **±2yr recurrence expansion** (`eventDisplayService.ts:46-47`):
   EVERY recurring master explodes into ~1460 occurrences, all serialized
   into page HTML. Scope window to the visible range (month ±1) and push a
   date filter + limit into the `events` SELECTs (`+page.server.ts:89-94`,
   `:131-136` — currently unbounded, no date WHERE, no limit).
5. **Remote verse fetch blocks response** (`verseService.ts:282` external
   HTTP on cold start). Return as streaming promise + `{#await}` in
   DailyVerseCard; same for ads section.
6. **Move shared loads to layout**: roster/calendarIds/settings refetch on
   every page nav although the group layout persists — layout loads don't
   re-run on in-group navigation. Page loads shrink to page-specific data.

Client:

7. **MonthDays per-cell full scan** (`MonthDays.svelte:133-134`): each of
   ~42 day cells `.filter()`s the ENTIRE occurrence array (+ tasks) on
   every reactive pass → O(cells × occurrences). Pre-group into
   `Map<dateKey, events>` once per data change.
8. **Eager views/modals in route chunk**: `Calendar.svelte:5-9` statically
   imports Month+Week+Day+List views; page statically imports 1420-line
   `EventFormModal`. Dynamic-`import()` non-default view + modals so
   first paint ships one view.
9. **Payload trim**: every occurrence carries full row (description,
   notes, tags). List-view/modal details can lazy-fetch by id.

Cached/second loads:

10. `data-sveltekit-preload-data="hover"` already on (`app.html:33`) —
    keep. After (6), in-group navs skip layout re-fetch entirely.
    Timezone `fetch→invalidateAll` on layout mount
    (`+layout.svelte:19-29`) forces a full reload once per session —
    scope to first-visit only (cookie/localStorage flag).
