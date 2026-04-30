<script lang="ts">
	import type { FamilyMember } from '$lib/types';

	let {
		attendants = { value: [] as string[], detected: false, userEdited: false, visible: false },
		familyMembers = [] as FamilyMember[],
		showDropdown = $bindable(false),
		onToggle = () => {}
	}: {
		attendants: { value: string[]; detected: boolean; userEdited: boolean; visible: boolean };
		familyMembers: FamilyMember[];
		showDropdown?: boolean;
		onToggle?: () => void;
	} = $props();

	function toggleAttendant(memberId: string) {
		const current = attendants.value;
		if (current.includes(memberId)) {
			attendants.value = current.filter(id => id !== memberId);
		} else {
			attendants.value = [...current, memberId];
		}
		attendants.userEdited = true;
		attendants.visible = true;
		showDropdown = false;
	}
</script>

<div class="relative" class:hidden={!attendants.visible && !attendants.userEdited}>
	<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
		<span>Attendants</span>
		{#if attendants.detected}
			<span class="text-green-600 text-xs">✓ detected</span>
		{/if}
	</label>
	<div class="relative">
		<button 
			type="button"
			onclick={() => showDropdown = !showDropdown}
			class="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left"
		>
			{#if attendants.value.length > 0}
				<span class="text-slate-900">{attendants.value.length} selected</span>
			{:else}
				<span class="text-slate-400">Select people...</span>
			{/if}
			<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		
		{#if showDropdown}
			<div class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
				{#if familyMembers.length > 0}
					<div class="max-h-48 overflow-y-auto p-1">
						{#each familyMembers as member}
							<button 
								type="button"
								onclick={() => toggleAttendant(member.id)}
								class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 {attendants.value.includes(member.id) ? 'bg-primary-50 text-primary-700' : ''}"
							>
								<div class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium">
									{member.name?.charAt(0).toUpperCase() || '?'}
								</div>
								<div>
									<div class="text-sm font-medium">{member.name || 'Unnamed'}</div>
									{#if member.email}
										<div class="text-xs text-slate-500">{member.email}</div>
									{/if}
								</div>
								{#if attendants.value.includes(member.id)}
									<svg class="ml-auto h-4 w-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<div class="p-3 text-center text-sm text-slate-500">
						No family members found
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
