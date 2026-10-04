<script lang="ts">
	interface FamilyMembership {
		id: string;
		name: string;
		role: string | null;
		memberType: string | null;
		memberCount: number;
	}

	interface Props {
		families: FamilyMembership[];
	}

	let { families }: Props = $props();
</script>

<!-- 105: "Your families" is a section. It says which families the user belongs
     to and how many members each has, and it links into the family rather
     than making the reader go and look for it. The roster sizes come from
     `getUserFamilyMemberships`, which counts each family's members in the same
     query (098) — this section does not get to guess one. -->
<div id="families">
	<h2 class="mb-1 text-lg font-semibold text-slate-900">Your families</h2>
	<p class="mb-4 text-sm text-slate-500">
		You belong to {families.length}
		{families.length === 1 ? 'family' : 'families'}. Leaving a family is done from the family page,
		not from here — so the one irreversible action on a shared account is on a page you have to
		navigate to rather than the one that lists what you belong to.
	</p>

	{#if families.length === 0}
		<p class="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
			You belong to no families yet. Create one to share calendars, chores and the kids' schedule.
		</p>
	{:else}
		<ul class="mb-4 space-y-2">
			{#each families as family (family.id)}
				<li>
					<a
						href="/family/{family.id}"
						class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
					>
						<span
							class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-100 text-sm font-bold text-primary-700"
							aria-hidden="true"
						>
							{family.name.slice(0, 1).toUpperCase()}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-slate-800">{family.name}</span>
							<span class="block text-xs text-slate-500">
								{family.memberCount}
								{family.memberCount === 1 ? 'member' : 'members'}{family.role
									? ` · ${family.role}`
									: ''}
							</span>
						</span>
						<span class="shrink-0 text-sm text-slate-400">Manage →</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<a
		href="/family/create"
		class="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
	>
		+ Create a family
	</a>
</div>
