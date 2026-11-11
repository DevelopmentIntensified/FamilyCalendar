# 045 — Filesystem tidy (root + docs make sense to a new dev)

Status: done

## Done

- Root: real README (backup `README.original.md`), SPEC.md → archive (stale,
  cites deleted routes), todo.md QA punchlist → archive as-is,
  UBIQUITOUS_LANGUAGE.md → archive (superseded by CONTEXT.md)
- docs/: `plans/` (roadmap, day-dashboard, native-android, arch-deepening),
  `guides/` (perf-playbook, e2e-instructions); playbook refs fixed (STATUS,
  #042, #044) + roadmap internal links fixed
- Deleted `.claude/skills/playwright-cli` (deprecated per AGENTS.md)
- Left alone: sql/ + drizzle/ dual migrations (README documents), build/ +
  test-results/ (gitignored output)
- Build green, pushed test.

## Done

## Needs doing

- Root: real README (backup `.original.md`), SPEC.md → archive (stale, cites
  deleted routes), todo.md single link → android plan, UBIQUITOUS_LANGUAGE.md
  → archive (superseded by CONTEXT.md)
- docs/: `plans/` (roadmap, day-dashboard, native-android, arch-deepening),
  `guides/` (perf-playbook, e2e-instructions); fix `docs/page-perf-playbook`
  refs (STATUS, #042, #044) + roadmap internal links
- Delete `.claude/skills/playwright-cli` (68K, deprecated per AGENTS.md)
- Leave: sql/ + drizzle/ dual migrations (documented in README), build/ +
  test-results/ (gitignored output)
- Per slice: build green, push test immediately.
