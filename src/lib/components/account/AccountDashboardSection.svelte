<script lang="ts">
	import { enhance } from '$app/forms';
	import { CARD_DASHBOARD_MODULES, INFO_DASHBOARD_MODULES } from '$lib/dashboardModules';
	import { isModuleMounted, shownModuleIds } from './accountDashboardModules';

	interface Props {
		hiddenDashboardModules?: string[] | null;
	}

	let { hiddenDashboardModules }: Props = $props();

	let saving = $state(false);

	// Show-based switches; the action stores the inverse (080).
	let shown = $derived(shownModuleIds(hiddenDashboardModules));
</script>

<div id="dashboard">
	<h2 class="mb-1 text-lg font-semibold text-slate-900">Dashboard modules</h2>
	<p data-testid="dashboard-subtitle" class="mb-4 text-sm text-slate-500">
		personal · overrides the family setting
	</p>

	<!-- 105: its own action and its own submit. Hiding a dashboard card and
	     changing your week start were one save; they are two now, so a failed
	     week-start save cannot silently blank the dashboard and vice versa. -->
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
			{#each [{ band: 'Above your cards', modules: INFO_DASHBOARD_MODULES }, { band: 'Cards', modules: CARD_DASHBOARD_MODULES }] as group (group.band)}
				<h3 class="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					{group.band}
				</h3>
				{#each group.modules as mod (mod.id)}
					<label
						data-testid="dashboard-module-row"
						data-module-id={mod.id}
						data-scope={mod.scope}
						class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3"
					>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-slate-800">{mod.label}</span>
							<!-- 105 rerun: the approved row leads with its SCOPE - the
							     fact that decides whether a family admin can pull this
							     switch for everyone. The longer explanation stays
							     after it rather than replacing it. -->
							<span class="mt-0.5 block text-xs text-slate-500">
								{mod.scope}{isModuleMounted(mod.id) ? '' : ' · not mounted anywhere'} — {mod.meaning}
							</span>
						</span>
						<span class="flex shrink-0 items-center gap-2">
							{#if !isModuleMounted(mod.id)}
								<span class="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
									>parked</span
								>
							{/if}
							<input
								type="checkbox"
								name="module_{mod.id}"
								value="on"
								class="h-5 w-5 rounded border-slate-300"
								checked={shown[mod.id]}
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
