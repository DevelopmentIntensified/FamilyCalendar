<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	export let data: PageData;
	export let form: ActionData;

	$: limitReached = form?.upgradeRequired || data.familyLimitReached;

	const colors = [
		{ name: 'Red', value: '#EF4444' },
		{ name: 'Orange', value: '#F97316' },
		{ name: 'Amber', value: '#F59E0B' },
		{ name: 'Yellow', value: '#EAB308' },
		{ name: 'Lime', value: '#84CC16' },
		{ name: 'Green', value: '#22C55E' },
		{ name: 'Emerald', value: '#10B981' },
		{ name: 'Teal', value: '#14B8A6' },
		{ name: 'Cyan', value: '#06B6D4' },
		{ name: 'Sky', value: '#0EA5E9' },
		{ name: 'Blue', value: '#3B82F6' },
		{ name: 'Indigo', value: '#6366F1' },
		{ name: 'Violet', value: '#8B5CF6' },
		{ name: 'Purple', value: '#A855F7' },
		{ name: 'Fuchsia', value: '#D946EF' },
		{ name: 'Pink', value: '#EC4899' },
		{ name: 'Rose', value: '#F43F5E' }
	];

	let selectedColor = form?.color || '#3B82F6';
	let loading = false;
</script>

<svelte:head>
	<title>Create Family - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-lg">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Family', href: '/family' },
			{ label: 'Create' }
		]} />

		<div class="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6">
				<h1 class="text-2xl font-bold text-slate-900">Create a Family</h1>
				<p class="mt-1 text-sm text-slate-500">Start a new family group to share calendars and events</p>
			</div>

			{#if limitReached}
				<div class="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
					<p class="text-sm text-amber-800">
						You've reached your family limit ({data.familyLimit || 1} family).
						Upgrade to Family Master to create unlimited families.
					</p>
					<a
						href="/pricing"
						class="mt-3 inline-flex rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
					>
						Upgrade Now
					</a>
				</div>
			{/if}

			{#if form?.error}
				<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				novalidate
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-6"
				onsubmit={(e) => limitReached && e.preventDefault()}
			>
				<div class="space-y-2">
					<label for="name" class="block text-sm font-medium text-slate-700">Family Name</label>
				<input
					type="text"
					id="name"
					name="name"
					value={form?.name || ''}
					placeholder="The Smiths"
					maxlength="50"
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
					<p class="text-xs text-slate-500">Choose a name for your family (max 50 characters)</p>
				</div>

				<div class="space-y-3">
					<label class="block text-sm font-medium text-slate-700">Family Color</label>
					<p class="text-xs text-slate-500">Pick a color to identify your family</p>

					<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
						{#each colors as color}
							<button
								type="button"
								onclick={() => selectedColor = color.value}
								class="group relative h-11 w-11 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
								style="background-color: {color.value}"
								title={color.name}
							>
								{#if selectedColor === color.value}
									<svg class="absolute inset-0 m-auto h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>

					<input type="hidden" name="color" value={selectedColor} />

					<div class="mt-3 flex items-center gap-3">
						<div
							class="h-10 w-10 rounded-full"
							style="background-color: {selectedColor}"
						></div>
						<span class="text-sm text-slate-600">Selected color</span>
					</div>
				</div>

				<div class="flex gap-3 pt-2">
					<a
						href="/family"
						class="flex-1 rounded-full border border-slate-300 px-6 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
					>
						Cancel
					</a>
					<button
						type="submit"
						disabled={loading || limitReached}
						class="flex-1 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
					>
						{loading ? 'Creating...' : 'Create Family'}
					</button>
				</div>
			</form>
		</div>
	</div>
</div>
