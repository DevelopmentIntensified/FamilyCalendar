<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { pushToast } from '$lib/client/toasts';
	import { DEFAULT_FAMILY_COLOR, FAMILY_PALETTE } from '$lib/utils/familyPalette';

	export let data: PageData;
	export let form: ActionData;

	$: limitReached = form?.upgradeRequired || data.familyLimitReached;

	// The approved prototype's curated earthy set (prototypes/app-ui/family-create.html)
	// — six colours, named in plain words, rather than seventeen arbitrary hexes.
	// The declaration, and with it the default, lives in $lib/utils/familyPalette so
	// this view and the create action cannot drift apart (#099).
	const colors = FAMILY_PALETTE;

	let name = form?.name ?? '';
	let selectedColor = form?.color || DEFAULT_FAMILY_COLOR;
	let loading = false;

	$: selectedName = colors.find((c) => c.value === selectedColor)?.name ?? colors[0].name;
</script>

<svelte:head>
	<title>Create Family - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-lg">
		<Breadcrumbs
			crumbs={[
				{ label: 'Calendar', href: '/calendar' },
				{ label: 'Family', href: '/family' },
				{ label: 'Create' }
			]}
		/>

		<div class="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
			<div class="mb-5">
				<h1 class="text-sm font-semibold text-slate-900">Create a Family</h1>
				<p class="mt-1 text-sm text-slate-500">
					One family holds the shared calendar, the tasks and the groceries.
				</p>
			</div>

			{#if limitReached}
				<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
					<p class="text-sm text-amber-800">
						You've reached your family limit ({data.familyLimit || 1} family). Upgrade to Family Master
						to create unlimited families.
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
				<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				novalidate
				use:enhance={() => {
					loading = true;
					const created = name.trim() || 'Your family';
					return async ({ update, result }) => {
						loading = false;
						await update();
						// A redirect is a created family: the action throws one on success.
						if (result.type === 'redirect' || result.type === 'success') {
							pushToast({ message: `${created} created — opening it now` });
						}
					};
				}}
				class="space-y-6"
				onsubmit={(e) => limitReached && e.preventDefault()}
			>
				<!-- Live preview: the family as it is named, in the colour it will carry. -->
				<div
					class="relative mb-1 overflow-hidden rounded-2xl p-5"
					style="background-color: {selectedColor}1a"
				>
					<div
						class="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full blur-2xl"
						style="background-color: {selectedColor}33"
					></div>
					<div class="relative">
						<span
							class="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
							style="background-color: {selectedColor}22; color: {selectedColor}"
						>
							Family
						</span>
						<p class="mt-2 break-words text-2xl font-extrabold tracking-tight text-slate-900">
							{name.trim() || 'Your family'}
						</p>
					</div>
				</div>

				<div class="space-y-2">
					<label for="name" class="block text-sm font-medium text-slate-500">
						What do you call it?
					</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={name}
						placeholder="The Smiths"
						maxlength="50"
						class="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 py-2 text-2xl font-extrabold tracking-tight text-slate-900 placeholder:font-bold placeholder:text-slate-200 focus:border-primary-500 focus:outline-none focus:ring-0"
					/>
				</div>

				<div class="space-y-3">
					<span class="block text-sm font-medium text-slate-500">Colour</span>
					<div class="flex flex-wrap gap-2.5" role="group" aria-label="Family colour">
						{#each colors as color}
							<button
								type="button"
								aria-label={color.name}
								aria-pressed={selectedColor === color.value}
								onclick={() => (selectedColor = color.value)}
								class="h-9 w-9 rounded-full ring-offset-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {selectedColor ===
								color.value
									? 'ring-2 ring-slate-900'
									: ''}"
								style="background-color: {color.value}"
							></button>
						{/each}
					</div>
					<span class="sr-only" aria-live="polite">{selectedName} selected</span>

					<input
						type="hidden"
						id="color"
						name="color"
						aria-label="Family colour value"
						value={selectedColor}
					/>

					<p class="text-xs leading-relaxed text-slate-500">
						The colour tints the family calendar, the member avatars and the family chip. It is the
						one thing on this page that ends up visible everywhere else.
					</p>
				</div>

				<div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
					<a
						href="/family"
						class="w-full rounded-full border border-slate-300 px-6 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:flex-1"
					>
						Cancel
					</a>
					<button
						type="submit"
						disabled={loading || limitReached}
						class="w-full rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50 sm:flex-1"
					>
						{loading ? 'Creating…' : 'Create Family'}
					</button>
				</div>

				<p class="text-center text-xs text-slate-500">
					{data.familyUsed} of {data.familyLimit}
					{data.familyLimit === 1 ? 'family' : 'families'} used on your plan.
				</p>
			</form>
		</div>
	</div>
</div>
