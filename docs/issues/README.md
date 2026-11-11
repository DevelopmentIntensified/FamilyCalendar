# Issues

Local markdown tickets; there is no hosted tracker. This folder holds only **active** tickets. Finished or dead ones move to [docs/archive/issues/](../archive/issues/).

Work on the v2 rewrite is tracked in [docs/rewrite/LEDGER.md](../rewrite/LEDGER.md), not here. Open web/server tickets from before the rewrite were archived; the ones it must honour are in [docs/rewrite/carryover.md](../rewrite/carryover.md).

## Conventions

- **Naming:** `NNN-short-slug.md`, numbered sequentially. Before picking a number, check the highest in both this folder and `docs/archive/issues/` (the last archived is 323).
- **Format:**
  - first line `# NNN — Title`;
  - a `Status: open|in-progress|done` line;
  - sections `## Done` and `## Needs doing`.
- **Workflow:**
  1. When you start work, set `Status: in-progress` and list the specifics under `## Needs doing`.
  2. When it is finished, move the items to `## Done`, flip the status to `done` and verify with `npm run build`.
  3. In the same commit, `git mv` the ticket to `docs/archive/issues/` and update [STATUS.md](../STATUS.md).
- One ticket per unrelated piece of work: a new numbered file. Never batch.

## Active

| ticket | area |
|---|---|
| [210 Native Android app](210-native-android-app.md) | Android |
| [280 Task categories ↔ TaskFocus](280-task-categories-taskfocus.md) | Android / TaskFocus |
| [293 Phone focus sessions](293-phone-focus-sessions.md) | Android |
| [294 Android shell/theme](294-android-shell-theme.md) | Android |
| [309 Android event form controls](309-android-event-form-controls.md) | Android |
