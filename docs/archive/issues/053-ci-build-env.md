# 053 — CI quality-gate build had no env (static/private blowup)

Status: done

## Done

- Root-caused 2026-09-11 deploy failure: `RESEND_API_KEY is not exported by
  virtual:env/static/private`. `quality-gate` job (owns `npm run build`)
  passed zero env; secrets only went to the `e2e` job. Static imports bake
  at build time → Rollup hard-fails on the first missing name.

## Needs doing

- Fix: `env:` on quality-gate with secret-or-placeholder fallbacks for all
  five static names (ADAPTER, EMAILSECRET, NODE_ENV, NOREPLYEMAIL,
  RESEND_API_KEY) + dummy DATABASE_URL (db/index throws when unset).
- Verify: gate green on next push to test.
- Left alone: EventFormModel `state_referenced_locally` warning
  (pre-existing, non-fatal).
- Per slice: build green, push test immediately.
