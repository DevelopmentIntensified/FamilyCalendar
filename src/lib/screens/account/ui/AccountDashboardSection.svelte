<!--
	Dashboard modules: the registry split into "Above your cards" and "Cards",
	each row showing its scope, its meaning, the "parked" badge when no card is
	mounted, and its show-based checkbox (`module_<id>`). The footer explains
	that only off-switches are saved.
-->
<script lang="ts">
	import type { AccountSectionModel } from '../account.contract';
	import { accountModuleVisibility } from '../account.dashboard.rules';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	type AccountDashboardModel = Extract<AccountSectionModel, { section: 'dashboard' }>;

	interface Props {
		model: AccountDashboardModel;
		enhance: AccountFormEnhancer;
	}

	let { model, enhance }: Props = $props();

	let saving = $state(false);

	// Show-based switches; the action stores the inverse (080).
	const shown = $derived(accountModuleVisibility(model.hidden));
	// The two approved headings, in order: the quiet strip, then the cards.
	const groups = $derived([
		{ band: 'Above your cards', modules: model.modules.filter((module) => module.band === 'info') },
		{ band: 'Cards', modules: model.modules.filter((module) => module.band === 'card') }
	]);
</script>

<div id="dashboard">
	<h2 class="mb-1 text-lg font-semibold text-slate-900">Dashboard modules</h2>
	<p data-testid="dashboard-subtitle" class="mb-4 text-sm text-slate-500">
		personal · overrides the family setting
	</p>

	<form
		method="POST"
		action="?/saveDashboardModules"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
		class="space-y-4"
	>
		<div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
			{#each groups as group (group.band)}
				<h3 class="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					{group.band}
				</h3>
				{#each group.modules as module (module.id)}
					{@const mounted = module.mounted}
					<label
						data-testid="dashboard-module-row"
						data-module-id={module.id}
						data-scope={module.scope}
						class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3"
					>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-slate-800">{module.label}</span>
							<span class="mt-0.5 block text-xs text-slate-500">
								{module.scope}{mounted ? '' : ' · not mounted anywhere'} — {module.meaning}
							</span>
						</span>
						<span class="flex shrink-0 items-center gap-2">
							{#if !mounted}
								<span class="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
									>parked</span
								>
							{/if}
							<input
								type="checkbox"
								name="module_{module.id}"
								value="on"
								class="h-5 w-5 rounded border-slate-300"
								checked={shown[module.id]}
							/>
						</span>
					</label>
				{/each}
			{/each}
		</div>

		<button
			type="submit"
			disabled={saving}
			class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{saving ? 'Saving…' : 'Save Dashboard Modules'}
		</button>

		<p class="text-xs leading-relaxed text-slate-500">
			A saved switch exists only when a module is <b>off</b>, so nothing saved means everything on.
			The Meals row writes a value that no loader ever reads — the card is not mounted anywhere in
			the app.
		</p>
	</form>
</div>
