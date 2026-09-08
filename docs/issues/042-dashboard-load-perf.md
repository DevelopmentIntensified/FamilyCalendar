# 042 — Dashboard load perf (playbook run #2)

Status: in-progress

Method: docs/page-perf-playbook.md.

## Done

- Filed; method: docs/page-perf-playbook.md.
- Baseline (Neon, bench anon, warmed): TTFB ~1.4s median, 124607B.
  Page svelte thin (91 lines, card composition); server 346 lines.
- Chain: zone → settings+familyId → switches → tasks(+cursor sync) →
  events (day-cal fetch + ±2y expand, then filter to ONE day) →
  family/roster/kids → top3 → wins → completionTimestamps → verse.
  ~10 sequential stages. Prime suspects: triple settings/family/zone
  (layout has all three now), day-filter-after-±2y-expand, unbounded
  getCompletionTimestamps.
- Slice 1 dedupe: settings/familyId/roster/zone via `parent()` (−4
  SELECTs: settings, familyId, roster, zone-settings). TTFB flat
  (~1.4s, familyless anon — noise); family users save the roster join
  per load/nav.
- Slice 2 day window: dashboard expands the viewed day (±1d pad) not
  ±2y (+ single-day window test). TTFB ~flat locally (expansion is Node
  CPU, cheap at bench scale) — kills O(years) scaling per recurring
  master + per-occurrence downstream. Correctness: today's Bench
  occurrence renders, warnings clean.

## Needs doing

- Baseline: warmed median TTFB/total/bytes for /calendar/dashboard.
- Map load chain + payload drivers + client hot paths.
- Slices per playbook §2, each measured + committed + pushed.
