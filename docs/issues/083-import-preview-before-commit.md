# 083 — ICS import: preview before anything is written

Status: open

Source: bug report 2026-09-27 — "need to be able to view events in import
before adding to calendar and undo if events are messed up".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] Nothing is written until the user confirms. Parsing happens on upload;
      the list is shown; the commit is a separate deliberate act.
- [ ] The preview shows what each event will become: title, when (with the
      recurrence in words), where — as in the approved prototype's preview.
- [ ] Likely duplicates are marked and **left unticked**, and the commit
      reports how many were ticked and how many were skipped. An import that
      silently doubles the calendar is worse than no import.
- [ ] Per-event checkboxes, and a select-all / none that respects the
      duplicate default.
- [ ] A file that parses to nothing explains itself instead of failing flat.
- [ ] The commit is one request carrying the chosen events, so the preview
      cannot drift from what gets saved.
- [ ] The success screen states what landed, where, and offers the way to fix
      a bad import: the selection-mode bulk delete, which already exists.
- [ ] Tests: duplicates detected and unticked, the commit honours the
      selection, and the reported counts match what was written.

## Done

## Notes

- **Deliberately no batch-undo.** The user chose selective import plus the
  existing bulk delete over an import-batch id on the events table. If a real
  user needs a one-click whole-import undo, that is a new ticket with a
  schema change, not a follow-up detail here.
- The prototype's shape is the reference: drop zone, what is in them, then the
  preview. Duplicates unticked by default is the load-bearing decision.
- Reuse the existing dedupe key (title + exact start) so "likely duplicate"
  means what the commit already meant by it.
