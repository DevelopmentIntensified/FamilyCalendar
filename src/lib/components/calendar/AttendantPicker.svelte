<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { getContactColor, getInitials } from '$lib/utils/contactColors';

	/**
	 * Search-and-chip attendant picker. Knows how to filter family
	 * members and recent names; every selection change is delegated
	 * via `toggle` so the caller's model stays authoritative.
	 */
	export let selected: string[] = [];
	export let familyMembers: { userId: string; firstName?: string; lastName?: string; email: string }[] = [];
	export let recent: string[] = [];

	const dispatch = createEventDispatcher<{ toggle: string }>();

	let contactSearch = '';
	let dropdownOpen = false;

	function pick(value: string) {
		if (!selected.includes(value)) dispatch('toggle', value);
		contactSearch = '';
		dropdownOpen = false;
	}

	function addCustom() {
		const name = contactSearch.trim();
		if (name && !selected.includes(name)) {
			dispatch('toggle', name);
			contactSearch = '';
			dropdownOpen = false;
		}
	}

	function dedupeMembers(members: typeof familyMembers) {
		const seen = new Set<string>();
		return members.filter((m) => {
			if (seen.has(m.userId)) return false;
			seen.add(m.userId);
			return true;
		});
	}

	$: dedupedFamilyMembers = dedupeMembers(familyMembers);

	$: filteredFamilyMembers = dedupedFamilyMembers.filter((m) => {
		if (!contactSearch.trim()) return true;
		const search = contactSearch.toLowerCase();
		return (
			m.firstName?.toLowerCase().includes(search) ||
			m.lastName?.toLowerCase().includes(search) ||
			m.email?.toLowerCase().includes(search)
		);
	});

	$: filteredRecent = recent.filter((att: string) => {
		if (!contactSearch.trim()) return true;
		return att.toLowerCase().includes(contactSearch.toLowerCase());
	});
</script>

<div class="relative">
	{#if selected.length > 0}
		<div class="flex flex-wrap gap-2 mb-2">
			{#each selected as att}
				{@const member = familyMembers.find((m) => m.userId === att)}
				{@const color = getContactColor(att)}
				{@const initials = member ? getInitials(member.firstName ?? '', member.lastName ?? '') : getInitials(att)}
				{@const displayName = member
					? [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email
					: att}
				<span class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 pr-3 text-sm">
					<span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
						style="background-color: {color.bg}; color: {color.text}">
						{initials}
					</span>
					<span class="text-slate-700">{displayName}</span>
					<button type="button" on:click={() => pick(att)} class="text-slate-400 hover:text-slate-600" aria-label="Remove {att}">
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="relative">
		<input
			type="text"
			bind:value={contactSearch}
			on:focus={() => (dropdownOpen = true)}
			on:blur={() => setTimeout(() => (dropdownOpen = false), 150)}
			placeholder="Search family or type a name..."
			class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
		/>
		{#if dropdownOpen && (filteredFamilyMembers.length > 0 || filteredRecent.length > 0 || contactSearch.trim())}
			<div class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
				{#if filteredFamilyMembers.length > 0}
					<div class="p-1">
						{#each filteredFamilyMembers as member}
							{@const color = getContactColor((member.firstName ?? '') + (member.lastName ?? ''))}
							{@const isSelected = selected.includes(member.userId)}
							<button
								type="button"
								on:click={() => pick(member.userId)}
								class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 {isSelected ? 'bg-primary-50' : ''}"
							>
								<div class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
									style="background-color: {color.bg}; color: {color.text}">
									{member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
									{#if isSelected}
										<div class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
											<svg class="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										</div>
									{/if}
								</div>
								<div class="flex-1 min-w-0">
									<p class="truncate text-sm font-medium text-slate-700">{member.firstName} {member.lastName}</p>
								</div>
							</button>
						{/each}
					</div>
				{/if}

				{#if filteredRecent.length > 0}
					<div class="border-t border-slate-100 p-1">
						<div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent</div>
						{#each filteredRecent as att}
							{@const color = getContactColor(att)}
							{@const isSelected = selected.includes(att)}
							<button
								type="button"
								on:click={() => pick(att)}
								class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 {isSelected ? 'bg-primary-50' : ''}"
							>
								<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
									style="background-color: {color.bg}; color: {color.text}">
									{att.charAt(0).toUpperCase()}
								</span>
								<span class="truncate text-sm text-slate-700">{att}</span>
							</button>
						{/each}
					</div>
				{/if}

				{#if contactSearch.trim() && !filteredFamilyMembers.length && !filteredRecent.length}
					<button
						type="button"
						on:click={addCustom}
						class="w-full rounded-lg border-2 border-dashed border-slate-200 m-1 py-2 text-sm text-slate-500 transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
					>
						Add "{contactSearch.trim()}"
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
