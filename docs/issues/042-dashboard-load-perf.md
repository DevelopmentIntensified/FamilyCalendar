# 042 — Dashboard load perf (playbook run #2)

Status: in-progress

Method: docs/guides/page-perf-playbook.md.

## Done

- Filed; method: docs/guides/page-perf-playbook.md.
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
- Slice 3 streaming: tasks/events/wins/streak legs run post-paint in ONE
  `dashboardData` promise (per-section fallbacks + warnings in payload;
  streak 500 → degrades to 0). Page: header immediate, card skeletons
  pending, retry catch. Shell TTFB ~1.4s → ~0.54s (−60%), full ~0.97s.
  Browser-verified (header fast, cards resolve, no page errors); 19
  dashboard action tests + 24 card tests green.

## Needs doing

- Baseline: warmed median TTFB/total/bytes for /calendar/dashboard.
- Map load chain + payload drivers + client hot paths.
- Slices per playbook §2, each measured + committed + pushed.
