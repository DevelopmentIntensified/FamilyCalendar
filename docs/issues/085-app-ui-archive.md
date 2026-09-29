# 085 — Archive: port the approved prototype to the app

Status: open

Source: `app-ui/archive.html`, approved for building in the review tool on 2026-09-29.

> **Question:** Does anyone ever come back here, or is this dead weight behind a paywall?
> **Approach:** Shown behind its real gate, with the retention numbers on screen so the gate makes sense.
> **Real route:** src/routes/(calendar)/calendar/archive/ — +page.svelte 55. Gated on activeSubscriptions.retentionViewDays (365) and archivedRetentionDays (730). Nothing links here except the navbar.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] Port this prototype to the real route, keeping the structure it reproduces
- [ ] Port the raised findings, each as its own acceptance criterion:
- [ ] The prototype keeps reproducing the app rather than the app keeping the prototype

## Done

## Notes

- Raised by the prototype tree's lock-in button, not by hand.
- Approved with no bad marks.
