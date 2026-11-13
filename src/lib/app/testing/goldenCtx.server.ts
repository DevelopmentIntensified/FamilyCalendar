/**
 * `goldenCtx()` — the ctx for `/api` golden tests: `testCtx` plus the real
 * cross-module adapters, wired exactly as production wires them (../ports.server).
 *
 *   const ctx = () => goldenCtx({ db: testDb() });
 *   const res = await invoke(postBugReport, { ctx: ctx(), user, body });
 *
 * Without the real adapters a frozen golden could not see a ported handler's
 * effect on the other module's rows (a handler reading `ctx.calendarAccess`,
 * for example), and the goldens may not change after S2. Create one ctx per
 * test; a rate-budget test reuses ONE ctx for every request of its burst.
 *
 * S5 service tests keep `testCtx` and pass a memory fake for each port they
 * exercise; they never need the real adapter.
 *
 * Doc: docs/architecture/testing.md#golden-contract-tests-characterization
 */
import { wirePorts, type AppPorts } from '$lib/app/ports.server';
import { testCtx, type TestCtx, type TestCtxOverrides } from '$lib/kernel/testing/testCtx.server';

export function goldenCtx(overrides: TestCtxOverrides = {}): TestCtx & AppPorts {
	return wirePorts(testCtx(overrides));
}
