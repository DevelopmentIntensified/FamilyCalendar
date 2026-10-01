# 105 — Account: the section list is not the approved one

Status: open

Source: `app-ui/account.html` review, prototype approved (no marks). The
prototype's decision — one settings page behind hash-linked section nav — is
already built. The section list underneath it is not the same.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] **Your families** is a section. The approved page has it; the app has
      nothing. It says which families the user belongs to and how many members
      each has, and it links into the family rather than making the user go
      and look. The family count here must be a real count — see 098, because
      the underlying helper can currently only ever return one.
- [ ] **Notification settings** is a section. The approved page has it; the app
      has no notification preferences anywhere on the account page, only the
      read-only alerts feed.
- [ ] **Dashboard modules** is its own section instead of living inside the
      calendar form. The per-user hide switches for the Day Dashboard modules
      are currently checkboxes inside one big "Save calendar settings" form,
      which means hiding a dashboard card and changing your week start are the
      same save. Splitting them is a real change to that form's save semantics,
      so it needs its own action and its own submit.
- [ ] The section nav, the one-section-at-a-time rendering, and the existing
      seven sections all keep working. Any new section is additive to the nav
      and reachable by its own hash.
- [ ] The plan section keeps the usage line the approved page shows — members
      per family, look-back days, archive retention, attachment size, whether
      export and import are on the plan. The prototype shows a limits table
      rather than a bare plan name.
- [ ] Tests: the nav lists the sections, each hash renders its section, and the
      new module section saves independently of the calendar form.

## Done

## Notes

- The big decision — one page or seven — is **already made and already built**.
  The page has hash-linked sidebar nav, a single section rendered at a time,
  and seven section components. Do not reopen that; this ticket is about which
  sections exist and where the module switches live.
- 077 explicitly ruled out swapping the module switches on the account page
  for the compact row it built for the family page, because that would change
  the calendar form's save semantics and 077 was not allowed to change
  behaviour. **This is the ticket where that becomes safe** — splitting the
  switches out of the form is exactly the change 077 deferred. The compact row
  is shaped to be adopted once it is.
- The approved prototype also argues that Plan is "a purchase flow wearing a
  settings costume". It then leaves Plan on the page with a "Change plan"
  button, so the argument is made and not acted on. Take the prototype as drawn
  and keep the section; do not invent a move.
- The ad-consent switch currently sits in the same calendar form, next to the
  module switches. 088 is about that switch having two sources of truth. If
  this ticket moves the module switches out of the form, check 088's seam at
  the same time rather than leaving the ad switch as the only thing still
  trapped in there.
