# 092 — Calendar stats credit task completions to the wrong person

Status: open

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

## Notes

- Small, self-contained, and the only remaining item that is a stats question
  rather than a data-model one.
- The user-visible effect is a number that is quietly wrong, which is worse than
  a missing number — someone may be relying on it.
