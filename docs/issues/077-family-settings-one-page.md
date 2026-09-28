# 077 — Family settings: the page reads as one page

Status: open

Source: `app-ui/family-detail.html` review, dashboard module switches marked
**rebuild** — "compact this and make the whole page look more put together and
less things touching and with too little space, but too spread out".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The dashboard module switches become compact: each module is one row
      with its label, its scope (personal or family-wide) and its state, not a
      tall block of stacked text.
- [ ] The page's bands get a consistent rhythm — the same gap between bands,
      the same internal padding, the same label treatment — so it stops
      reading as nine unrelated screens stacked up.
- [ ] Density goes up and air comes back: less vertical space per module, but
      enough around each band that nothing touches.
- [ ] A module toggle still flips in under 100ms and confirms what changed.
- [ ] The page's existing e2e spec still passes; the settings/toggle flows are
      untouched in behaviour.
- [ ] No horizontal overflow at 320px, and no horizontal scroll introduced to
      save vertical space.

## Done

## Notes

- 793 lines, the largest page in the app. The reviewer's complaint is
  composition, not structure — resist splitting the file here; that is a
  different job with its own risk.
- The module list is the same data the dashboard consumes; if the compact
  rendering needs a shared row component, extract it once and use it in both.
