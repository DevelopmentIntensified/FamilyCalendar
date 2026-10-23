# 201 — Can't see events in next month

Status: open

Source: user bug report, https://www.familyplanz.com/report-bug, 2026-10-22 19:37. Exact repro window/session unknown — no report id page host recorded; the reporter hit /calendar during today's SSR outage, so first check is whether the 5.57-era artifact fixed this and it was deploy-filtered, or it reproduces on a junk-cookie 200 session.

## Needs doing

- First: reproduce on a 200 session — is the month boundary invisible, or an empty grid?
- If events past the month edge never load, the likely root cause is already filed: #082 records that `GET /api/events?from=&to=` exists but NOTHING calls it on month move — month navigation does not fetch, merge, or cache. The bug likely lands there; if so close 201 into 082 rather than re-solving.
- If root causes separate, TDD the missing fetch/merge boundary the way 082 was flagged.
