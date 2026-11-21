/**
 * SvelteKit wiring only. The request pipeline (hook order, Bearer and cookie
 * sessions, the Anonymous Account fallback, the admin gate, `handleError`) is
 * composed in `src/lib/app/requestPipeline.server.ts` and tested by
 * `src/lib/app/app.requestPipeline.db.test.ts`; nothing here may branch
 * (task APP-03). The cold-start migration kick-off moved with it, so the
 * import below still runs before the first request.
 */
import { appHandle, appHandleError } from '$lib/app/requestPipeline.server';

export const handle = appHandle;
export const handleError = appHandleError;
