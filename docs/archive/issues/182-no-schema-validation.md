# 182 — No schema validator — hand-rolled checks per endpoint
Status: open
Source: production-readiness security audit, 2026-10-16.
## Done
- No Zod-class validator anywhere (zod not in dependencies); every endpoint hand-rolls checks (`api/contact/+page.server.ts:44-54`, `taskEditPayload.ts`, `normalizeTags`).
- Contact goes through manual HTML escaping (`:6-13,64-71`) and all `{@html}` sinks are static literals (`featureIcons.ts:1-2`); Drizzle is parameterized (SQLi OK). Safe incidentally, not boundary-enforced.
## Needs doing
- Adopt a Zod-class validator at the boundary (one seam, highest point), or accept hand-rolled with a per-route checklist. Cost: dependency + retrofit; benefit: XSS/SQLi/CSRF enforced, not incidental.
