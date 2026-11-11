# 188 — AI: no prompt/output logs, no evals, raw input in prompts
Status: open
Source: production-readiness AI-guardrails audit, 2026-10-16.
## Done
- Audit: only error paths log (truncated 200-char text, `llm.ts:48-51`); no prompt or completion logging anywhere.
- Quality: no eval pipeline; only unit tests with mocked `chatJson` (`bulkAiService.test.ts:13-14`, `parse-event/server.test.ts:28`). Partial mitigant: `/api/report-phrase` collects unmatched phrases into `unmatchedPhrases` for human review.
- Injection: raw user input interpolated unsanitized and unwrapped — `parse-event/+server.ts:71-73` verbatim `input`; `bulkAiService.ts:359-362` instruction + event/calendar JSON. Blast radius limited by the `parseBulkPlan` whitelist (`bulkAiService.ts:266-303`, ids restricted to allowed/owned `bulk/+server.ts:196-199`).
- Leakage: untargeted events minimized (id + start only `:354-356`, opt-out `:349-351`), but named-event titles/locations (possible PII) and verbatim prose go to a third-party API; no PII filter.
- Fallback: Cerebras single (`llm.ts:3-4`); degrade path is the local regex parser (quality, not availability).
- Human approval PASS (bulk dry-run/review-echo, `bulkConfirmDelete`, `pastWarning`, server re-validates owned ids) — no change.
## Needs doing
- Prompt/output log store; eval harness on model change; delimit + sanitize wrappers before insertion; PII filter pre-send; second provider or recorded accept.
