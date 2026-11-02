# 274 — Editing an event shows attendees as user ids instead of names

Status: done

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[Calendar] "when editing events, users turn into their uid rather than their name" (2026-11-01 23:12). Page recorded as /report-bug (pre-#257 bug), so origin unknown — likely EventFormModal / AttendantPicker / EventAttendeeGroups edit path.

## Done

- Root cause (still live on `test` at cb888bd): `EventModal` — the detail
  modal opened from Month/Week/Day/List views and the Day Dashboard — renders
  `EventFormModal` for editing, but none of those callers pass
  `familyMembers`, so the edit form's roster is `[]`. The attendance prefill
  (`prefillInvites`, rows from `GET /api/events/[id]/rsvp`) sets member
  attendants to their **userId**; `AttendantPicker` names a chip only via a
  roster lookup, so the chip showed the raw uid. Worse, `toEventData` set
  `isUser: familyMemberIds.has(value)` → `false`, so saving re-sent the uid
  as a **guest name** and `replaceEventInvites` stored it in
  `event_attendance.name` (the uid then rendered as an attendee everywhere).
- Fix (client, `EventFormModel.svelte.ts`): `prefillInvites` (and
  `initialEvent.attendees` with `isUser`) records member invitees; a new
  `invitedUsers` getter exposes the ones missing from the passed roster as
  roster-shaped entries (first/last name from the rows' users join).
  `isUser`, invite-type defaults and the recent-names filter now use
  roster ∪ invitees. `EventMetaFields` feeds `[...familyMembers,
  ...form.invitedUsers]` to `AttendantPicker`, so chips show the name and
  keep the Required/Optional toggle.
- Fix (server, `src/lib/server/utils/eventInvites.ts`): `resolveEventInvites`
  promotes a guest value (string or `isUser:false`) that equals the caller's
  or a roster member's id to a member invite — old cached clients (prod
  0fbcc93) can no longer persist a uid as a name.
- Red → green: `EventFormModel.svelte.test.ts` "#274 invitees outside the
  passed roster" (4 tests: isUser false → true; invitedUsers; no dup with
  roster; toggle off/on keeps isUser), `EventMetaFields.svelte.test.ts`
  "#274: shows an invited member by name" (`Alice Smith` chip, no
  `user-abc123`), `eventInvites.test.ts` 2 promotion tests — all failed
  before the change, pass after.
- Not done: existing rows already saved with a uid in `name` are not
  rewritten (needs a data fix against Neon if any exist).
