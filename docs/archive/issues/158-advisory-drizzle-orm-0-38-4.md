# 158 — Advisory: drizzle-orm 0.38.4 — SQL identifier injection (CVE-2026-39356), in range, not reachable

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 12/15 — HIGH severity in a runtime dependency, but current usage makes it unreachable; upgrade cost is the open question.

## Done

- **Upgraded drizzle-orm 0.38.4 → 0.45.4** (Option A) — CVE-2026-39356 cleared. No breaking-change fallout: full suite (249/3598) + migration runner + build green; `@lucia-auth/adapter-drizzle` peer range `>=0.29 <1` satisfied. drizzle-kit 0.31.10 unchanged and compatible.

## Done

- Installed 0.38.4 (package-lock; range `^0.38.4`). GHSA-gpj5-g38j-94v9 / CVE-2026-39356, high (CVSS 7.5): `escapeName()` does not double embedded quote delimiters → affected `<0.45.2`, patched **0.45.2** (current 0.45.3).
- Advisory's own scope: "applications that use only static schema objects … are not affected." Usage audit:
  - `sql.identifier(` — zero uses in `src/`.
  - `.as(` alias construction — zero uses in `src/`.
  - `sql.raw` — only `src/lib/server/db/migrations/runner.ts:29,57,61,73,75,89`, all constant strings (table name const, `hashtext(...)`, statements from repo migration files). No user input reaches it.
  - `orderBy` — 40+ sites audited, all constant schema columns (`desc(table.col)` / `table.col`); no dynamic sort field anywhere.
- Verdict: **in-range but not exploitable today**. It becomes reachable the day a dynamic sort/report builder is added.

## Needs doing

- Option A — upgrade `drizzle-orm` to 0.45.3 (paired `drizzle-kit` bump if required). Cost: pre-1.0 minor jump (0.38 → 0.45) can carry breaking query-API changes; needs full test suite + a migration dry-run against a branch database.
- Option B — accept as not-reachable and add a guardrail (lint/review rule: no `sql.raw`/`sql.identifier`/`.as()` fed from variables; no request-derived `orderBy`). Cost: rule is only as good as enforcement; residual risk if a future dynamic-sort slips through — and the HIGH advisory stays in `npm audit` forever.
- Not choosing (issue 136).
