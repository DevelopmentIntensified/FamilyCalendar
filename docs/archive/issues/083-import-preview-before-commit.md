# 083 — ICS import: preview before anything is written

Status: in-progress

Source: bug report 2026-09-27 — "need to be able to view events in import
before adding to calendar and undo if events are messed up".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] A client component test for the preview screen (checkbox defaults,
      select-all/none, the duplicate badge). The action + pure-logic seams are
      covered; the screen itself is not.
- [ ] Playwright coverage of upload → preview → commit, asserting nothing lands
      until the commit POST fires.
- [ ] Deep link from the success screen into the calendar's selection mode.
      It currently says "tap Select in the toolbar" because `calendar/+page.svelte`
      has no `?select=1` param — that file belongs to a later ticket.
- [ ] Non-blocking: the dedupe key stays exact-start, so a near-miss (2:00 vs
      2:01) is not flagged. Fuzzier matching is a new ticket, not a tweak here.

## Done

- [x] Nothing is written until the user confirms. `?/preview` parses on upload
      and returns rows; `?/commit` is a separate deliberate act. No shared
      server state between them — the commit carries the rows themselves.
- [x] The preview shows what each event will become: title, when (with the
      recurrence in words, never a raw RRULE), where — as in the prototype's
      preview. `describeWhen` / `describeRecurrence` in
      `icsImportPreview.ts`, rendered in the viewer's zone.
- [x] Likely duplicates are marked and **left unticked**. Two reasons, both on
      the existing dedupe key (title + exact start): `already-on-calendar` and
      `earlier-in-file`. The commit reports `selected` / `imported` /
      `skipped` / `skippedDuplicates` / `failed`. An import that silently
      doubles the calendar is worse than no import.
- [x] Per-event checkboxes, plus select-all / select-none / back-to-suggested.
      The suggestion (duplicates unticked) is the default the screen opens with.
- [x] A file that parses to nothing explains itself instead of failing flat.
- [x] The commit is one request carrying only the ticked events, so the preview
      cannot drift from what gets saved. `coerceDrafts` re-parses the posted
      rows at the boundary, drops the preview-only fields, and rejects the whole
      batch if any row is malformed. Dedupe re-runs at commit time — the
      calendar can change between preview and commit.
- [x] The success screen states what landed, where, and offers the way to fix
      a bad import: the selection-mode bulk delete, which already exists.
- [x] Tests: duplicates detected and unticked, the commit honours the
      selection, and the reported counts match what was written. 75 new tests
      (55 pure-logic, 20 action).

## Notes

- **Deliberately no batch-undo.** The user chose selective import plus the
  existing bulk delete over an import-batch id on the events table. If a real
  user needs a one-click whole-import undo, that is a new ticket with a
  schema change, not a follow-up detail here.
- The prototype's shape is the reference: drop zone, what is in them, then the
  preview. Duplicates unticked by default is the load-bearing decision.
- Reuse the existing dedupe key (title + exact start) so "likely duplicate"
  means what the commit already meant by it.

### Contract

```
POST ?/preview  multipart: calendarId, file
  -> { preview: { calendarId, calendarName, fileName, items[], duplicates,
                  defaultSelection[] } }
     items[i] = IcsEventDraft + { key, whenText, duplicate, duplicateReason }

POST ?/commit   urlencoded: calendarId, picked (JSON array of ticked items)
  -> { calendarName, imported, selected, skipped, skippedDuplicates, failed[] }
```

Both actions take an optional `ImportDeps` seam (parser, ownership, existing
keys, createEvent, viewer zone) so tests drive them without module mocks; the
parser stays real in tests.

### Files

- `src/lib/server/services/icsImportPreview.ts` (new) — `dedupeKey`,
  `describeWhen`, `describeRecurrence`, `buildPreview`, `defaultSelection`,
  `planCommit`, `coerceDrafts`.
- `src/lib/server/services/icsImportPreview.test.ts` (new) — 55 tests.
- `src/routes/(calendar)/calendar/import/+page.server.ts` — `default` action
  replaced by `preview` + `commit`; deps seam; dedupe key centralised.
- `src/routes/(calendar)/calendar/import/page.server.test.ts` (new) — 20 tests.
- `src/routes/(calendar)/calendar/import/+page.svelte` — upload → preview →
  success screens, per-event checkboxes, toast on both POSTs.

> Scope note: this slice landed whole rather than in two halves — ~1.5k lines
> across 5 files, of which ~795 are the two test files. Truncating it at the
> commit step would have left a preview screen with nothing to press.
