<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	export let meals: { id: string; kind: string; label: string }[];
	/** The viewed day as 'YYYY-MM-DD' (user zone) — what quick-add posts. */
	export let dateKey: string;

	const KIND_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
	const KIND_LABELS: Record<string, string> = {
		breakfast: 'Breakfast',
		lunch: 'Lunch',
		dinner: 'Dinner',
		snack: 'Snack'
	};

	let labelInput = '';
	let kindInput = 'dinner';
	let busy: string | null = null;

	$: placeholder = `What's for ${KIND_LABELS[kindInput]?.toLowerCase() ?? 'dinner'}?`;

	$: byKind = KIND_ORDER.map((kind) => ({
		kind,
		label: KIND_LABELS[kind] ?? kind,
		items: meals.filter((m) => m.kind === kind)
	})).filter((group) => group.items.length > 0);

	async function addMeal() {
		if (!labelInput.trim() || busy) return;
		busy = 'new';
		try {
			const res = await fetch('/api/meals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date: dateKey, kind: kindInput, label: labelInput })
			});
			if (res.ok) {
				labelInput = '';
				await invalidateAll();
			}
		} finally {
			busy = null;
		}
	}

	async function removeMeal(id: string) {
		if (busy) return;
		busy = id;
		try {
			await fetch('/api/meals', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			await invalidateAll();
		} finally {
			busy = null;
		}
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-3 text-sm font-semibold text-slate-900">Meals</h2>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			addMeal();
		}}
		class="mb-3 flex gap-2"
	>
		<input
			type="text"
			bind:value={labelInput}
			placeholder={placeholder}
			class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		<select
			bind:value={kindInput}
			aria-label="Meal kind"
			class="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm text-slate-700"
		>
			{#each KIND_ORDER as kind (kind)}
				<option value={kind}>{KIND_LABELS[kind]}</option>
			{/each}
		</select>
		<button
			type="submit"
			disabled={!labelInput.trim() || busy === 'new'}
			class="shrink-0 rounded-lg bg-primary-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			Add
		</button>
	</form>

	{#if byKind.length === 0}
		<p class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
			No meals for this day
		</p>
	{:else}
		<div class="space-y-2.5">
			{#each byKind as group (group.kind)}
				<section>
					<h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						{group.label}
					</h3>
					<div class="space-y-1.5">
						{#each group.items as meal (meal.id)}
							<div
								class="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5"
							>
								<p class="min-w-0 flex-1 truncate text-sm text-slate-800">{meal.label}</p>
								<button
									type="button"
									onclick={() => removeMeal(meal.id)}
									disabled={busy === meal.id}
									class="relative shrink-0 rounded-full p-2 text-slate-300 pointer-fine:opacity-0 transition-all hover:bg-red-50 hover:text-red-500 pointer-fine:group-hover:opacity-100 disabled:opacity-40"
									aria-label="Remove {meal.label}"
									title="Remove"
								>
									<svg
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
									<span class="absolute -inset-1" aria-hidden="true"></span>
								</button>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>