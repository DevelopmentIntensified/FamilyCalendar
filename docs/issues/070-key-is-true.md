# 070 — The key is true

Status: open

Source: `calendar-ui/d-working-calendar.html` review, the only **rebuild** mark:
"This doesn't seem to be true. Can you make it true with the events themselves."

**Blocked by:** 067 (sponsored events labelled), 068 (all-day legible), 069
(grid filters by calendar).

## Needs doing

- [ ] A key/legend on the calendar that states exactly what the chips mean —
      one entry per treatment, each one matching a rendering that exists.
- [ ] Every claim in it is backed by behaviour: colour = calendar is only said
      once 069 makes it filterable; sponsored is only said once 067 labels it.
- [ ] The key does not repeat what the chips already say at a glance. If a
      distinction is self-evident, it does not get a legend entry.
- [ ] It survives 320px — collapsed by default, one tap to open, and no
      horizontal overflow at the repo's narrowest supported width.
- [ ] Prototype D's key is rebuilt from the shipped behaviour, not the other
      way round: the prototype reproduces the app, not the reverse.
- [ ] Tests for the key's contents and its collapsed state.

## Done

## Notes

- The app has no legend today. This ticket adds one only after the chips earn
  it; the ordering with 067/068/069 is the whole point.
