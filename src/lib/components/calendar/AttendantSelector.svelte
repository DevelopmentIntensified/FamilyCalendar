<script lang="ts">
	import type { FamilyMember } from '$lib/types';

	let {
		familyMembers = [] as FamilyMember[],
		recentAttendants = [] as string[],
		selectedAttendants = [] as string[],
		showAttendants = false,
		onchange = undefined as ((attendants: string[]) => void) | undefined
	} = $props();

	let newAttendant = $state('');

	function toggleMember(userId: string) {
		if (selectedAttendants.includes(userId)) {
			selectedAttendants = selectedAttendants.filter(id => id !== userId);
		} else {
			selectedAttendants = [...selectedAttendants, userId];
		}
		onchange?.(selectedAttendants);
	}

	function addRecent(att: string) {
		if (!selectedAttendants.includes(att)) {
			selectedAttendants = [...selectedAttendants, att];
			onchange?.(selectedAttendants);
		}
	}

	function addNewAttendant() {
		if (newAttendant.trim()) {
			selectedAttendants = [...selectedAttendants, newAttendant.trim()];
			newAttendant = '';
			onchange?.(selectedAttendants);
		}
	}

	function removeAttendant(att: string) {
		selectedAttendants = selectedAttendants.filter(a => a !== att);
		onchange?.(selectedAttendants);
	}
</script>

{#if showAttendants}
	<div class="rounded-2xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-100 p-4">
			<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-700">Attendants</h3>
		</div>

		<div class="p-4 space-y-4">
			<!-- Family Members -->
			{#if familyMembers.length > 0}
				<div>
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Family Members</p>
					<div class="grid grid-cols-2 gap-2">
						{#each familyMembers as member}
							<button
								type="button"
								onclick={() => toggleMember(member.userId)}
								class="flex items-center gap-2 rounded-xl border-2 p-2 text-left transition-all hover:border-primary-300 {
									selectedAttendants.includes(member.userId)
										? 'border-primary-500 bg-primary-50'
										: 'border-slate-200 bg-white'
								}"
							>
								<div class="flex h-8 w-8 items-center justify-center rounded-full {
									selectedAttendants.includes(member.userId)
										? 'bg-primary-100 text-primary-700'
										: 'bg-slate-100 text-slate-600'
								}">
									{member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
								</div>
								<div class="flex-1 min-w-0">
									<p class="truncate text-sm font-medium text-slate-700">
										{member.firstName} {member.lastName}
									</p>
									<p class="truncate text-xs text-slate-500">{member.email}</p>
								</div>
								{#if selectedAttendants.includes(member.userId)}
									<div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white">
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Recent Non-user Attendants -->
			{#if recentAttendants.length > 0}
				<div>
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</p>
					<div class="flex flex-wrap gap-1">
						{#each recentAttendants as att}
							<button
								type="button"
								onclick={() => addRecent(att)}
								class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs transition-all hover:border-primary-300 hover:bg-primary-50"
							>
								+ {att}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Add New Attendant -->
			<div>
				<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Add New</p>
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={newAttendant}
						placeholder="Enter name or email..."
						class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
					/>
					<button
						type="button"
						onclick={addNewAttendant}
						class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
					>
						Add
					</button>
				</div>
			</div>

			<!-- Selected Attendants -->
			{#if selectedAttendants.length > 0}
				<div>
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Selected ({selectedAttendants.length})</p>
					<div class="flex flex-wrap gap-1">
						{#each selectedAttendants as att}
							<span class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-xs text-primary-700">
								{att}
								<button
									type="button"
									onclick={() => removeAttendant(att)}
									class="ml-1 text-primary-500 hover:text-primary-900"
								>
									×
								</button>
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
