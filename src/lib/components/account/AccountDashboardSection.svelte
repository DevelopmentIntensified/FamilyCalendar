<script lang="ts">
	import { enhance } from '$app/forms';
	import { CARD_DASHBOARD_MODULES, INFO_DASHBOARD_MODULES } from '$lib/dashboardModules';
	import { shownModuleIds } from './accountDashboardModules';

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
	<p class="mb-4 text-sm text-slate-500">
		Choose what appears on your Day Dashboard. This is personal to you — family admins can also
		switch family cards off for everyone from the family page.
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
						class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3"
					>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-slate-800">{mod.label}</span>
							<span class="mt-0.5 block text-xs text-slate-500">{mod.meaning}</span>
						</span>
						<input
							type="checkbox"
							name="module_{mod.id}"
							value="on"
							class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
							checked={shown[mod.id]}
						/>
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
	</form>
</div>
