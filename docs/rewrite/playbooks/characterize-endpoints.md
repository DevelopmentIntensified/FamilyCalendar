# Playbook: characterize endpoints (golden contract tests)

Goal: pin what every route does **today**, as a client sees it: status, full JSON body, error messages, and absent-versus-null handling. The same tests then run unchanged after the port. They are the proof the port changed nothing.

On 2026-11-11 this was verified to work against legacy handlers: `POST /api/bug-report` and `GET /api/tasks` ran on the rebuilt test database through the legacy `db` singleton, and the tests passed.

## Where

`src/lib/domains/<m>/<m>.http.db.test.ts` (screens: `src/lib/screens/<m>/…`). It runs in committed mode, because legacy handlers write through the `db` singleton, outside any test transaction.

## Template

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import { bugReports } from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// Import the ROUTE module, not the legacy action: the route is what clients hit,
// and after the port it re-exports the new handler, so this import never changes.
import { POST as postBugReport } from '../../../routes/api/bug-report/+server';

const ctx = () => goldenCtx({ db: testDb() });

describe('POST /api/bug-report', () => {
	beforeEach(truncateAll);

	it('files a report for a signed-in user and answers {success, id}', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			path: '/api/bug-report',
			headers: { 'x-real-ip': '10.0.0.1' },
			body: { area: 'tasks', description: '  Row vanished ', url: '/calendar/tasks' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, id: expect.any(String) });
		const rows = await testDb().select().from(bugReports).where(eq(bugReports.userId, user.id));
		expect(rows.map((r) => [r.area, r.description, r.url])).toEqual([['tasks', 'Row vanished', '/calendar/tasks']]);
	});

	it('rejects an unknown area with the legacy message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postBugReport, {
			ctx: ctx(),
			user,
			headers: { 'x-real-ip': '10.0.0.2' },
			body: { area: 'weather', description: 'x' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({
			error: 'area (one of calendar, tasks, account, payments, dashboard, other) and description (<=5000 chars) are required'
		});
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postBugReport, { ctx: ctx(), body: { area: 'tasks', description: 'x' } });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});
```

## What to cover per route and method

1. **Success:** the full body with `toEqual`. Use matchers only for generated values: `expect.any(String)` for ids, `expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)` for timestamps.
2. **Every refusal:** 401 when signed out, 403 for the wrong person (seed a second user), 404 for a missing id, every 400 message the code can produce, and 409 with its extra fields.
3. **Absent versus null:** for every field the [Android contract](../../guides/task-api-spec.md) or the legacy code treats specially, send it absent, `null` and present. One example is `PUT /api/tasks/:id`, where absent `focusMinutes` must never wipe the stored value.
4. **Side effects a client can observe:** rows written (read them back), notifications created, and the next GET reflecting the change.
5. **Only `/api/**`.** Page loads and form actions are internal to the website and are redesigned with the UI, so they get no goldens; their behaviour is covered by the module's service tests and the visual check.

## Gotchas

- **Rate-limited legacy routes** share one bucket map across the whole test file. Give each test its own `x-real-ip` header. After the port the limiter comes from the ctx, and `goldenCtx()` builds a fresh limiter on every call, so a budget test creates ONE ctx and passes it to every request of its burst: a ctx per request never reaches the limit once the handler is ported, and the golden cannot be fixed after S2.
- **Bearer callers:** pass `via: 'token'`. That sets `actor.via` (legacy `locals.session` is already null in `invoke`).
- **Admin routes:** seed the user with `roles: ['admin']`.
- **Time-dependent legacy code** reads the real clock, so assert shapes, not exact dates. Pin exact dates only in S5 service tests, where `testCtx({ now })` controls time.
- **A legacy handler can't run** in the db project (import or env errors from `$env/static/private`): write the golden from [task-api-spec.md](../../guides/task-api-spec.md) and the legacy route's unit test expectations instead, mark the `describe` with `// golden from spec: legacy handler not runnable here (<reason>)`, and note it in the sheet. It must be green at S6.
- **Never edit a golden after S2.** If S6 makes one fail, the port is wrong. If the legacy behaviour itself is the bug and the sheet marks it FIX-IN-PORT, update the golden in a separate commit named `rewrite(<m>): fix-in-port #NNN`, with the ticket in the message. The one exception is a spec-golden skipped at S2 (`it.skip`, waiting on a port such as `ctx.mail`): S6 removes its `.skip` and nothing else, so its assertions, the rows written included, are complete at S2.
