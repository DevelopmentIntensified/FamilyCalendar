# 187 — AI spend cap is dead code while Cerebras bills

Status: done

Source: production-readiness AI-guardrails audit, 2026-10-16. Before-money blocker (usage = vendor bill).

## Done

- Wired `canUseAiFeature`/`recordAiUsage` into both `chatJson` call sites (`grep chatJson` = exactly two in src):
  - `parse-event/+server.ts` — cap checked before `deps.chatJson`; over-cap → `429 { error }`, zero vendor call; usage recorded after every billed request. In-memory 20/5min limit and cloud opt-out untouched.
  - `bulkAiService.ts` (`planBulkEditsWithAI`) — the seam gate (`AiSpendGate`) is a REQUIRED argument, so a future caller cannot forget to wire the cap (optional gates were how the cap went dead in the first place). Over-cap → `[]`. Note: this service currently has zero production route callers (route uses local `planBulkEdits`), so the wired seam is the second site's ground truth.
- Usage is recorded on EVERY billed vendor request, including those whose response is null/unusable — the vendor bills per request regardless of parse quality; not recording nulls would let failure-spam escape the cap.
- No alert/threshold signal surfaced: no existing notify pattern in `src/lib/server` to attach to (inventing alerting infra was out of scope).
- Tests red→green: over-cap refused before any vendor call (both sites), under-cap passes and records, null-response still recorded, `71/71` across `parse-event/server.test.ts` + `bulkAiService.test.ts`.
- `canUseAiFeature`/`recordAiUsage` (`subscriptionService.ts:361,377`) and the `aiUsageTracking` table (`schema.ts:405-421`) have zero route call sites — monthly cap machinery exists but never runs.
- The paid Cerebras call in `parse-event/+server.ts:70` is gated only by auth + an in-memory 20/5min limit (`+server.ts:56-57`) the code itself calls not-a-real-ceiling (resets on deploy).
## Needs doing
- Wire the cap check into both LLM call sites before send; strict per-customer spend caps; alert at threshold.
- Regression test: over-cap caller is refused before any vendor call.
