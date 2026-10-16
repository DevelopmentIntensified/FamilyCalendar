# 187 — AI spend cap is dead code while Cerebras bills
Status: open
Source: production-readiness AI-guardrails audit, 2026-10-16. Before-money blocker (usage = vendor bill).
## Done
- `canUseAiFeature`/`recordAiUsage` (`subscriptionService.ts:361,377`) and the `aiUsageTracking` table (`schema.ts:405-421`) have zero route call sites — monthly cap machinery exists but never runs.
- The paid Cerebras call in `parse-event/+server.ts:70` is gated only by auth + an in-memory 20/5min limit (`+server.ts:56-57`) the code itself calls not-a-real-ceiling (resets on deploy).
## Needs doing
- Wire the cap check into both LLM call sites before send; strict per-customer spend caps; alert at threshold.
- Regression test: over-cap caller is refused before any vendor call.
