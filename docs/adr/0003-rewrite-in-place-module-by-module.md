# 0003. Rewrite in place, one module at a time, never red

Status: accepted (2026-11-11)

The website and server get a near-total rewrite: new structure, new boundaries, new tests. It happens on branch `rewrite/v2` (worktree `../fc-v2`), one module at a time, inside the running app. We are not building an empty app beside the old one.

Each module rebuild first pins the module's external contract (the `/api` wire) with golden tests against the legacy code. It then redesigns the module from its behaviour inventory, points the routes and callers at it, and deletes the legacy code and legacy tests. Internals, page data, components and tests are rewritten freely, and legacy code is copied only where it is correct and pure. Only external contracts are preserved: the `/api` wire, the schema, the CONTEXT.md rules and the approved look. The app builds, passes its gates and stays deployable after every task. Progress is measured by `npm run census` (legacy files left), not by how much new code exists.

## Why

About 57k lines of tests, a production database and the Android/TaskFocus HTTP contract all encode behaviour nobody has written down in one place. A greenfield rebuild would have to rediscover all of it at once, and could only be verified at the end. In-place porting keeps every step small enough for a weaker agent to verify, and every step can be reverted on its own.

## Consequences

- During the rewrite, legacy and v2 code live side by side. v2 code may not import legacy code (rule R14). Legacy code may import v2 code.
- `test` keeps moving while the rewrite runs. `rewrite/v2` merges `origin/test` regularly ([sync-with-test.md](../rewrite/playbooks/sync-with-test.md)).
- Nothing reaches `test` or `main` until the census is zero and the owner signs off ([plan.md](../rewrite/plan.md#cutover)).
