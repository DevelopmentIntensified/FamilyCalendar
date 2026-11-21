<!--
	Search-and-chip attendee picker. It filters the roster and the recent guest
	names and reports every selection change; the form's state class stays the
	authority. A known member's chip carries its required/optional toggle —
	guests are always optional on the server — and free text offers "Add
	\"<name>\"" as a guest.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import { initials } from '$lib/kernel/ui/colorHash';
	import { calendarContactColor } from '../calendar.eventView.rules';
	import type { CalendarFamilyMember } from '../calendar.eventForm.state.svelte';

	interface Props {
		selected: readonly string[];
		members: readonly CalendarFamilyMember[];
		recent: readonly string[];
		inviteTypes: Record<string, 'required' | 'optional'>;
		ontoggle: (value: string) => void;
		ontype: (value: string, type: 'required' | 'optional') => void;
	}

	let { selected, members, recent, inviteTypes, ontoggle, ontype }: Props = $props();

	let search = $state('');
	let dropdownOpen = $state(false);

	const memberOf = (value: string) => members.find((member) => member.userId === value);

	const displayName = (value: string): string => {
		const member = memberOf(value);
		if (!member) return value;
		return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || value;
	};

	const filteredMembers = $derived.by(() => {
		const seen = new Set<string>();
		const unique = members.filter((member) => {
			if (seen.has(member.userId)) return false;
			seen.add(member.userId);
			return true;
		});
		const query = search.trim().toLowerCase();
		if (!query) return unique;
		return unique.filter(
			(member) =>
				member.firstName?.toLowerCase().includes(query) ||
				member.lastName?.toLowerCase().includes(query) ||
				member.email?.toLowerCase().includes(query)
		);
	});

	const filteredRecent = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return query ? recent.filter((name) => name.toLowerCase().includes(query)) : [...recent];
	});

	function pick(value: string) {
		if (!selected.includes(value)) ontoggle(value);
		search = '';
		dropdownOpen = false;
	}

	function addCustom() {
		const name = search.trim();
		if (name && !selected.includes(name)) {
			ontoggle(name);
			search = '';
			dropdownOpen = false;
		}
	}
</script>

<div class="relative">
	{#if selected.length > 0}
		<div class="mb-2 flex flex-wrap gap-2">
			{#each selected as value (value)}
				{@const member = memberOf(value)}
				{@const color = calendarContactColor(value)}
				<span
					class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 pr-3 text-sm"
				>
					<span
						class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
						style="background-color: {color.bg}; color: {color.text}"
					>
						{member ? initials(member.firstName, member.lastName) : initials(value, '')}
					</span>
					<span class="text-slate-700">{displayName(value)}</span>
					{#if member}
						<button
							type="button"
							onclick={() =>
								ontype(value, inviteTypes[value] === 'required' ? 'optional' : 'required')}
							class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors {inviteTypes[
								value
							] === 'required'
								? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
								: 'bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-700'}"
							title="Required invitees are expected to attend. Click to toggle."
						>
							{inviteTypes[value] === 'required' ? '★ Required' : 'Optional'}
						</button>
					{/if}
					<button
						type="button"
						onclick={() => ontoggle(value)}
						class="-m-1.5 rounded-full p-1.5 text-slate-400 hover:text-slate-600"
						aria-label="Remove {value}"
					>
						<svg
							class="h-3 w-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2.5"
						>
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
			bind:value={search}
			onfocus={() => (dropdownOpen = true)}
			onblur={() => setTimeout(() => (dropdownOpen = false), 150)}
			placeholder="Search family or type a name..."
			class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
			data-testid="attendee-search"
		/>
		{#if dropdownOpen && (filteredMembers.length > 0 || filteredRecent.length > 0 || search.trim())}
			<div
				class="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
			>
				{#if filteredMembers.length > 0}
					<div class="p-1">
						{#each filteredMembers as member (member.userId)}
							{@const color = calendarContactColor((member.firstName ?? '') + (member.lastName ?? ''))}
							{@const isSelected = selected.includes(member.userId)}
							<button
								type="button"
								onclick={() => pick(member.userId)}
								class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 {isSelected
									? 'bg-primary-50'
									: ''}"
							>
								<div
									class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
									style="background-color: {color.bg}; color: {color.text}"
								>
									{member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
									{#if isSelected}
										<div
											class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white"
										>
											<svg
												class="h-2 w-2 text-white"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="3"
											>
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										</div>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-slate-700">
										{member.firstName}
										{member.lastName}
									</p>
								</div>
							</button>
						{/each}
					</div>
				{/if}

				{#if filteredRecent.length > 0}
					<div class="border-t border-slate-100 p-1">
						<div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
							Recent
						</div>
						{#each filteredRecent as name (name)}
							{@const color = calendarContactColor(name)}
							<button
								type="button"
								onclick={() => pick(name)}
								class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 {selected.includes(
									name
								)
									? 'bg-primary-50'
									: ''}"
							>
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
									style="background-color: {color.bg}; color: {color.text}"
								>
									{name.charAt(0).toUpperCase()}
								</span>
								<span class="truncate text-sm text-slate-700">{name}</span>
							</button>
						{/each}
					</div>
				{/if}

				{#if search.trim() && !filteredMembers.length && !filteredRecent.length}
					<button
						type="button"
						onclick={addCustom}
						class="m-1 w-full rounded-lg border-2 border-dashed border-slate-200 py-2 text-sm text-slate-500 transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
					>
						Add "{search.trim()}"
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
