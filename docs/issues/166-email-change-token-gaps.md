# 166 — Email-change token path skips code check, uniqueness, single-use

Status: done 2026-10-23

Source: security audit (issue 136), 2026-10-15. Rank 6/16 — token holder can replay within the 15-min window; collision with a registered email = 500.

## Done

- **Token path single-use + collision, 2026-10-23:** `src/routes/(calendar)/account/verify-email/+page.server.ts` — the token now resolves the backing `codes` row and binds it before any write: type + expiry (`:112`), token payload ↔ row `pendingEmail` match (`:116-118`), identity binding — row `email` vs the current session's user (`:120-124`), `emailExists` collision = fail 400 "already in use" (`:126-128`), then `applyEmailChange` and **burn** with `deleteCode` (`:130-131`), so a replayed token finds no row. Code path already had the same collision check.
- **Tests:** 5-test describe `verify-email token path — single-use + collision (#166)` in `page.server.test.ts:159-231` — replayed token rejected with no second apply, token-path + code-path collision fail clean, token whose row's `pendingEmail` mismatches rejected (cross-binding), token bound to a different consumer than the session rejected. File 12/12 green (vitest run 2026-10-23).
- Related: #151 (unthrottled send + unbound verify on the code path) — landed earlier; this closed the token half.
