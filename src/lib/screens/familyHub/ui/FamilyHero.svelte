<!--
	The detail page's hero: the family initial on its colour, a blurred wash of
	that colour behind everything, the name, "N members · You: {role}", and the
	admin controls ("Add member", the settings gear). Legacy reference:
	`family/[familyId]/+page.svelte:289-355`.

	The colour falls back to the palette default rather than the retired blue
	(Q-086, owner 2026-11-12).
-->
<script lang="ts">
	import { DEFAULT_FAMILY_COLOR } from '$lib/domains/family/index';
	import type { FamilyHubState } from '../familyHub.detail.state.svelte';

	interface Props {
		state: FamilyHubState;
	}

	let { state }: Props = $props();

	const family = $derived(state.data.family);
	const memberCount = $derived(state.data.members.length);
	const color = $derived(family.color || DEFAULT_FAMILY_COLOR);
	const initial = $derived((family.name || 'F').charAt(0).toUpperCase());

	/** The gear jumps to the settings band instead of a separate route. */
	function jumpToSettings() {
		document.getElementById('family-settings')?.scrollIntoView({
			behavior: 'smooth',
			block: 'start'
		});
	}
</script>

<section
	class="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="family-hero-heading"
>
	<div
		data-family-glow
		class="pointer-events-none absolute right-1 -bottom-8 h-32 w-32 rounded-full blur-xl"
		style="background-color: {color}33"
		aria-hidden="true"
	></div>
	<div class="relative flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white"
				style="background-color: {color}"
				aria-hidden="true"
			>
				{initial}
			</div>
			<div class="min-w-0">
				<h1
					id="family-hero-heading"
					class="truncate text-[22px] font-extrabold tracking-tight text-slate-900"
				>
					{family.name}
				</h1>
				<div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
					<span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
					<span aria-hidden="true">·</span>
					<span class="flex items-center gap-1">
						You:
						<span class={state.pillClass(state.data.currentUserRole)}>
							{state.data.currentUserRole}
						</span>
					</span>
				</div>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if state.isAdmin}
				<a
					href="/family/{family.id}/members/add"
					class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
				>
					Add member
				</a>
				<button
					type="button"
					onclick={jumpToSettings}
					aria-label="Jump to family settings"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				</button>
			{/if}
		</div>
	</div>
</section>
