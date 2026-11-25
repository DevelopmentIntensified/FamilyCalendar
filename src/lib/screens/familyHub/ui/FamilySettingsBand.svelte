<!--
	The Family Settings band (admins only, inline — no toggle): the name field,
	the six named swatches plus the free colour input, the colour copy, Save
	Changes/"Saving…" and the Day Dashboard Modules list (the shared
	`DashboardModuleRow` from `dashboardModules`). The `form.error` banner sits
	above the page grid, so this band only renders its fields.
	Legacy reference: `family/[familyId]/+page.svelte:618-700`.

	The inputs bind to the state class, which re-seeds them only when the
	server's `id|name|color` changes — an unrelated reload never clobbers a
	half-typed name.
-->
<script lang="ts">
	import { FAMILY_PALETTE } from '$lib/domains/family/index';
	import { DashboardModuleRow } from '$lib/domains/dashboardModules/ui';
	import type {
		FamilyHubFormEnhancer,
		FamilyHubState
	} from '../familyHub.detail.state.svelte';

	interface Props {
		state: FamilyHubState;
		enhance: FamilyHubFormEnhancer;
	}

	let { state, enhance }: Props = $props();
</script>

<section
	id="family-settings"
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="settings-heading"
>
	<h2 id="settings-heading" class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
		Family Settings
	</h2>
	<form method="POST" action="?/updateFamily" use:enhance={state.saveFamilySubmit}>
		<div class="grid gap-3">
			<div>
				<label for="name" class="mb-1 block text-sm font-medium text-slate-700">Family Name</label>
				<input
					type="text"
					id="name"
					name="name"
					bind:value={state.editingName}
					class="w-full rounded-lg border border-slate-300 px-4 py-2 text-[22px] font-extrabold tracking-tight transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
			</div>
			<div>
				<span class="mb-1.5 block text-sm font-medium text-slate-700">Colour</span>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Colour swatches">
					{#each FAMILY_PALETTE as swatch (swatch.value)}
						<button
							type="button"
							aria-label="Set colour {swatch.name}"
							aria-pressed={state.editingColor === swatch.value}
							onclick={() => (state.editingColor = swatch.value)}
							title={swatch.name}
							class="h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {state.editingColor ===
							swatch.value
								? 'ring-2 ring-slate-900 ring-offset-2'
								: ''}"
							style="background-color: {swatch.value}"
						></button>
					{/each}
				</div>
				<input
					type="color"
					id="color"
					name="color"
					aria-label="Family colour"
					bind:value={state.editingColor}
					class="mt-3 h-10 w-full rounded-lg border border-slate-300"
				/>
				<p class="mt-2 text-xs leading-relaxed text-slate-500">
					Colour tints the calendar, the members and the family calendar chip.
				</p>
			</div>
		</div>
		<button
			type="submit"
			disabled={state.savingFamily}
			class="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{state.savingFamily ? 'Saving…' : 'Save Changes'}
		</button>
	</form>

	<div class="mt-4 border-t border-slate-200 pt-4">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Day Dashboard Modules</h3>
		<p class="mt-1 text-xs text-slate-500">
			Family-wide master switches. A switched-off card is hidden for everyone — each member can still
			hide or show a card for themself alone in Account settings.
		</p>
		<ul class="mt-3 space-y-1.5">
			{#each state.familyModules as module (module.id)}
				<li>
					<DashboardModuleRow
						label={module.label}
						scope={module.scope}
						moduleId={module.id}
						state={state.moduleState(module)}
						optimistic={state.moduleOptimistic[module.id] ?? null}
						pending={state.modulePending === module.id}
						submitValue={state.moduleSubmitValue(module)}
						onAcknowledge={() => state.optimisticModuleFlip(module)}
						onSubmit={state.moduleSubmit(module)}
						{enhance}
					/>
				</li>
			{/each}
		</ul>
	</div>
</section>
