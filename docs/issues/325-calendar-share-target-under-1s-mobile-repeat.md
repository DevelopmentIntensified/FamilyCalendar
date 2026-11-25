# 325 — Calendar month + share-target under 1 s on mobile repeat

Status: open
Roles: performance
Source: owner decision 2026-11-22 (ADR 0010 §6 exception), v2 rewrite final gate.

## Done

- **Exception recorded (2026-11-22).** The owner approved `calendarPage/calendar-month` and `calendarPage/share-target` exceeding the hard limit "mobile ready, repeat visit ≤ 1000 ms" at legacy parity, because legacy missed it too and ours is not slower. Every other hard limit still applies to these pages. Written up in [ADR 0010 › Exceptions](../adr/0010-performance-budget.md#exceptions), the [calendarPage sheet](../rewrite/modules/calendarPage.md) and the screen README; encoded as `HARD_LIMIT_EXCEPTIONS` in `e2e/pages/perf-report.ts` (the limit is the legacy baseline: 1134 ms and 1728 ms), so `perf:check` still fails a page slower than legacy.
- **Measurements** (production build, 2026-11-22, 2 runs; the runs overlapped other builds), mobile repeat-visit ready:

  | page | ours | legacy |
  |---|---|---|
  | `/calendar` (`calendar-month`) | 1037 / 1098 ms | 1134 ms |
  | `/share-target` deep link (server redirect → `/calendar` → Quick Add modal, ready `#nl-input`) | 1509 / 1607 ms | 1728 ms |

  Initial JS for both is under the legacy ceiling (calendar-month 138 KB vs 197 KB).
- **Why it misses:** the month grid arrives through a streamed `grid` promise and the card renders after hydration on a 4x-CPU phone; share-target adds the redirect and the modal mount.

## Needs doing

Get both pages to ≤ 1000 ms mobile repeat-visit ready. Options:

1. **Server-render the month grid** (resolve the `grid` promise in the loader instead of streaming it, so the card is in the HTML and paints before hydration). Trade-off: TTFB rises by the grid's query time and the HTML grows (the page-perf playbook #041: legacy once shipped 465 KB of HTML and 1.35 s TTFB). Needs a size cap on the rendered cells and a TTFB check (hard limit 300 ms, desktop).
2. **Server-render the Quick Add modal on the share-target deep link** (the redirect carries the parsed params; the modal's markup ships in the `/calendar` HTML when they are present), so `#nl-input` exists before hydration. Trade-off: HTML grows on deep links only; the event form chunk (~42 KB) still has to hydrate, and the modal must stay a lazy chunk on every other visit.
3. **Drop the redirect hop** by serving the Quick Add state from `/share-target` itself. Trade-off: a second route owning calendar UI, which the calendar module's boundary rules argue against; try only if 1 and 2 leave share-target over.
4. **Cheaper hydration** (fewer components in the first paint, defer the toolbar's secondary rows). Trade-off: smaller gain on a 4x-CPU phone than 1; useful as a top-up.

Acceptance:

- [ ] `npm run perf:check -- calendarPage` on a production build: `calendar-month` and `share-target` both ≤ 1000 ms mobile repeat-visit ready, with every other hard limit and the initial-JS ceiling still passing.
- [ ] The two `HARD_LIMIT_EXCEPTIONS` entries in `e2e/pages/perf-report.ts` are deleted (and their `perf-report.unit.ts` rows), and the exception notes in ADR 0010, the calendarPage sheet and the screen README are removed or turned into a dated "resolved" line.
- [ ] Move this ticket to `docs/archive/issues/` and update [STATUS.md](../STATUS.md) and the issues README.
