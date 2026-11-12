# Playbook: rebuild pages, components and client state (step S7)

S7 rebuilds the UI of a module; legacy UI files are reference only. Kernel tasks K-07 (client: api client, toasts), K-08 (ui primitives), K-10 (page harness, visual check) and K-11 (perf check) must be `done` first.

What must survive is **what users see on approved pages**: layout, copy, the interactions and their feedback. The legacy markup, component split, Tailwind classes and test ids are not contracts. Keep a `data-testid` only where an e2e spec uses it (`git grep data-testid=\"x\" -- e2e`).

## Target shape

```text
<m>.<topic>.rules.ts          pure UI logic: sorting, grouping, labels, permission flags, optimistic list edits
<m>.api.ts                    browser client for the module's endpoints (typed by <m>.contract.ts)
<m>.<topic>.state.svelte.ts   one class per page/widget: $state/$derived + methods; takes the api + toasts in its constructor
ui/<Thing>.svelte             components: data + callbacks in, events out; never fetch, never $app/*
ui/<Name>Screen.svelte        the page body: builds the state class, lays out components
src/routes/…/+page.svelte     wiring only: passes data + framework functions in
```

## Steps

1. **Capture the baseline.** Before changing anything, run `npm run visual:baseline -- <m>` (K-10) to screenshot the module's pages as they are today.
2. **Rules.** Move every piece of logic hiding in legacy components and pages into `*.rules.ts`, with table tests in node. Fat pages are mostly this: groceries colour precedence, task grouping and filters, the calendar window.
3. **Api client** `<m>.api.ts` on the kernel api client:

   ```ts
   import { createApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
   import type { Task } from './tasks.contract';

   export function createTasksApi(client = createApiClient()) {
   	return {
   		complete: (taskId: string): Promise<ApiResult<{ task: Task }>> =>
   			client.request('PUT', `/api/tasks/${taskId}`, { completed: true })
   	};
   }
   export type TasksApi = ReturnType<typeof createTasksApi>;
   ```

4. **State class** `<m>.<topic>.state.svelte.ts`. It owns optimistic updates, rollback, pending flags and toasts. Keep `$effect` out of it: side effects are explicit methods, so the class needs no component context and is tested in node.

   ```ts
   export class TaskListState {
   	tasks = $state<Task[]>([]);
   	constructor(private readonly api: TasksApi, private readonly toasts: Toasts, initial: Task[]) {
   		this.tasks = initial;
   	}
   	async complete(taskId: string): Promise<void> {
   		const before = this.tasks;
   		this.tasks = markCompleted(this.tasks, taskId); // rule, tested separately
   		const result = await this.api.complete(taskId);
   		if (!result.ok) {
   			this.tasks = before;
   			this.toasts.error(result.error);
   			return;
   		}
   		this.toasts.success('Task completed');
   	}
   }
   ```

   ```ts
   // tasks.list.state.test.ts (project unit, node)
   it('rolls back and explains when the server refuses', async () => {
   	const toasts = memoryToasts();
   	const api = { complete: async () => ({ ok: false as const, status: 403, error: 'Not yours' }) };
   	const state = new TaskListState(api, toasts, [openTask]);
   	await state.complete(openTask.id);
   	expect(state.tasks).toEqual([openTask]);
   	expect(toasts.items).toEqual([{ kind: 'error', text: 'Not yours' }]);
   });
   ```

5. **Components**, leaves first:
   - Svelte 5 runes only.
   - Props in; callbacks for every action.
   - Build them from `kernel/ui` primitives: Sheet, ConfirmAction, Pill, Skeleton, Toaster.
   - No `fetch`, no `$app/*`, no `bind:` on components (issue 200).
   - Every interaction is acknowledged within 100 ms (optimistic update or pending state) and confirmed by a toast or inline status. Loading states are skeletons.
   - A component that needs a higher-ranked module's UI takes it as a snippet prop (rule R1).

6. **Screen** `ui/<Name>Screen.svelte`: builds the state class from `data` and lays out the components.

7. **Route** `+page.svelte` is wiring only (rule R8, at most 25 lines). SvelteKit functions enter through props:

   ```svelte
   <script lang="ts">
   	import { invalidateAll } from '$app/navigation';
   	import { enhance } from '$app/forms';
   	import { TasksScreen } from '$lib/domains/tasks/ui';
   	let { data } = $props();
   </script>

   <TasksScreen {data} refresh={invalidateAll} {enhance} />
   ```

8. **Visual check:** `npm run visual:check -- <m>` compares with the baseline from step 1 at 390 px and 1280 px. Fix every difference, or list it in the sheet's Notes as intentional (for example an approved design ticket implemented on purpose, named by number).
9. **Perf check:** `npm run perf:check -- <m>`. Every page of the module must be within its load budget ([ADR 0010](../../adr/0010-performance-budget.md)); follow [conventions › Performance](../../architecture/conventions.md#performance). A page over a hard limit is a failing step. A page that misses a target gets a line in the sheet's Notes saying why.

## Tests

| what | file | project | notes |
|---|---|---|---|
| rules | `*.rules.test.ts` | unit (node) | tables; most UI logic lives here |
| state classes | `*.state.test.ts` | unit (node) | fake api + `memoryToasts()`; no DOM |
| components | `ui/*.svelte.test.ts` | ui (jsdom) | few, synchronous; what the user sees + which callback fired; pass `enhance = () => ({})` where needed |
| look | `npm run visual:check -- <m>` | Playwright | approved pages only |
| speed | `npm run perf:check -- <m>` | Playwright | every page the module owns |

No snapshot dumps and no `vi.mock` (rule R9).

## Fat pages

`family/[familyId]/+page.svelte` (1,090 lines), `groceries/+page.svelte` (992), `import/+page.svelte` (768), `calendar/+page.svelte` (733) and `tasks/+page.svelte` (644) get redesigned, not copied:

- rules first;
- then the state class;
- then one component per visual section;
- then a screen that is layout only.

## Svelte checks

Writing Svelte follows [docs/guides/svelte-mcp.md](../../guides/svelte-mcp.md): fetch the docs sections you need and run the autofixer until it is clean. `npm run typecheck` must show 0 v2 errors.
