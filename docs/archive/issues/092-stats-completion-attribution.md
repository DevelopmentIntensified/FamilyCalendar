# 092 — Calendar stats credit task completions to the wrong person

Status: done

Source: split out of #013 during the 2026-09-29 re-triage, which found 3 of its
5 residue bullets were already shipped. This is the one that is a dashboard
attribution concern rather than a tasks/family finding.

**Blocked by:** None (can start immediately).

## The problem

A Task can be **assigned** to one person and completed by another. The
completion-history row records both: who the Task belongs to, and who actually
checked it off. The dashboard already counts completions by the actor, so
"tasks I completed" is right there.

The calendar stats page does not. It filters task completions by the **owner**
of the Task, not by who completed it. So if your partner checks off a task
assigned to you, the stat credits you.

The actor column exists and is populated — the legacy owner column is still
there as a fallback, which is what the dashboard query does. The stats page
just never grew the second leg.

## Needs doing

- [ ] Count completions by the actor, matching what the dashboard already does:
      the actor when present, falling back to the owner for legacy rows written
      before the column existed.
- [ ] A test proving the two cases separately — completed-by-me, and
      completed-by-someone-else-on-my-task. The fallback needs its own test, or
      it is untestable the day someone removes it.
- [ ] Check whether any other completion-history read still filters by owner
      only, and bring it in line if so. Grep the completion reads, do not assume
      this page is the only one.

## Done

- Fixed 2026-10-19. The four viewer-facing figures (`completedOnce`,
  `recurringCompletions`, `recentlyCompleted`, `month`) in
  `src/lib/server/db/actions/taskStats.ts` now filter with
  `attributedToViewer(userId)` — actor when present, task owner for legacy
  actor-less rows — matching the dashboard's streak exactly. A partner
  checking off a task assigned to you no longer inflates your numbers; your
  checking off their task now counts for you.
- The predicate moved to ONE home: `completionAttribution.ts` (dashboard.ts
  imports it; no hand-copy).
- `doneBy` deliberately stays scoped to the viewer's own tasks: it names the
  other people who did the work on them (feeds the assigned-vs-done card) and
  already credits the actor by name — viewer-attribution would collapse it to
  a single row. Pinned by test + comment.
- Tests: `taskStats.attribution.test.ts` (3) — red first: rendered the
  captured where-clauses through drizzle's QueryBuilder and proved the defect
  (`where "taskCompletions"."userId" = $1`, no actor leg), then green with the
  two-leg predicate, with the legacy fallback leg asserted on its own. #146
  suite (2) and dashboard suite (9) stayed green.
- Bullet 3 (other owner-only reads): swept — `dashboard.ts` already used the
  two-leg predicate, `export.ts` reads owner-OR-actor (correct for export),
  `cursor.ts`/`mutations.ts` are write paths. No other read filtered by owner
  only.

## Notes

- Small, self-contained, and the only remaining item that is a stats question
  rather than a data-model one.
- The user-visible effect is a number that is quietly wrong, which is worse than
  a missing number — someone may be relying on it.
