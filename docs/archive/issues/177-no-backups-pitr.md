# 177 — No backups/PITR evidence, restore never exercised
Status: in-progress
Source: production-readiness database audit, 2026-10-16.
## Done

- Runbook shipped: `docs/guides/backup-restore.md` — Neon PITR mechanics cited (branch-restore/history-window docs), per-plan history-window table, unpooled-URL pg_dump → local Docker restore drill with verification steps, RPO/RTO section (`[INFERENCE]`/`[UNMEASURED]` marked), human-steps block (confirm history window both projects, run drill, record numbers). Drill not yet exercised — issue stays open until a restore has actually run.
- Zero backup/PITR/pg_dump/WAL evidence anywhere in repo (docs + src + config grepped); only a planning-doc aside (`docs/archive/family-master-planning.md:140`).
- Neon's managed PITR is assumed-but-uncited for both branches; restoration never exercised in staging — untested is hypothesis.
## Needs doing
- Confirm Neon PITR is on for both branches and cite it; exercise a restore in staging; record RPO/RTO.
- Until then every hard delete (see #178) is unrecoverable by design.
