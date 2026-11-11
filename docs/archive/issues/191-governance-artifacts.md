# 191 — No security program artifacts: disclosure policy, reviews, ownership

Status: done
Source: production-readiness governance audit, 2026-10-16.
## Done

- `SECURITY.md` (repo root): single-current-version support table, GitHub private vulnerability reporting as the disclosure path, 5d ack / 10d triage / 30–60d fix SLAs, scope incl. native shell, safe harbor.
- `docs/guides/access-review.md`: quarterly review template (Neon branches/roles, Vercel, Resend keys, GitHub collaborators, registrar/DNS), filled example rows + [PLACEHOLDER] rows, follow-up-issue rule.
- `docs/guides/ownership.md`: ownership tables with placeholders, single-committer reality + PR-review rule on second committer, current compensating controls.
- Residual human step (owner-only knowledge): fill the [PLACEHOLDER]s — Vercel/Resend/GitHub membership, registrar, expiry dates — and run the first quarterly review off the template.
- No `SECURITY.md` / vulnerability-disclosure policy; no pen-test report; no customer questionnaire artifacts (tracker awareness is high — #156-161, 029, 142 — awareness is not artifacts).
- No access list, no quarterly review artifact; org ownership of domains/accounts/repos unrecorded [INFERENCE].
- Engineering governance: structured branching enforced (push to `test`, auto-deploy, master gate #130/#143; `AGENTS.md:45-48`) but no PR/code-review requirement documented (single-committer workflow).
- Onboarding PASS (`AGENTS.md`, `CONTEXT.md`, `README.md`, current `docs/`, bootstrap <1hr) — no change.
## Needs doing
- `SECURITY.md` + disclosure path; quarterly access-review artifact; ownership recorded in-org; PR-review rule when a second committer joins (or now).
