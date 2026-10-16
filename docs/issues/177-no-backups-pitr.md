# 177 — No backups/PITR evidence, restore never exercised
Status: open
Source: production-readiness database audit, 2026-10-16.
## Done
- Zero backup/PITR/pg_dump/WAL evidence anywhere in repo (docs + src + config grepped); only a planning-doc aside (`docs/archive/family-master-planning.md:140`).
- Neon's managed PITR is assumed-but-uncited for both branches; restoration never exercised in staging — untested is hypothesis.
## Needs doing
- Confirm Neon PITR is on for both branches and cite it; exercise a restore in staging; record RPO/RTO.
- Until then every hard delete (see #178) is unrecoverable by design.
