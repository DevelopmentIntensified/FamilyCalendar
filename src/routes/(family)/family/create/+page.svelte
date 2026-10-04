<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import CreateFamilyMemberPicker from '$lib/components/family/CreateFamilyMemberPicker.svelte';
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

	/**
	 * The people picked so far, mirrored up from the picker so the approved
	 * preview can draw them (`family-create.html:63-66`: one avatar per picked
	 * member, and a dashed "+" slot while there is room). The picker owns the
	 * choice; this only draws it.
	 */
	type Picked = { id: string; firstName: string; lastName: string };
	let picked: Picked[] = [];

	function initialsFor(person: Picked): string {
		const first = person.firstName?.charAt(0) ?? '';
		const last = person.lastName?.charAt(0) ?? '';
		return (first + last).toUpperCase() || '?';
	}

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
				<!-- Live preview: the family as it is named, in the colour it will carry,
				     with the people who will be in it. Measured against
				     `family-create.html`: padding 22px (1.375rem), radius 24px, a 112px
				     blurred glow, and — the part that was missing — one avatar per picked
				     member plus a dashed "+" slot while there is room. -->
				<div
					data-family-preview
					class="relative mb-1 overflow-hidden rounded-3xl p-6"
					style="background-color: {selectedColor}1a"
				>
					<div
						data-preview-glow
						class="pointer-events-none absolute right-1 -top-6 h-28 w-28 rounded-full blur-xl"
						style="background-color: {selectedColor}33"
					></div>
					<div class="relative">
						<span
							class="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
							style="background-color: {selectedColor}22; color: {selectedColor}"
						>
							Family
						</span>
						<p class="mt-2 break-words text-[22px] font-extrabold tracking-tight text-slate-900">
							{name.trim() || 'Your family'}
						</p>
						<div class="mt-4 flex items-center">
							{#each picked as person (person.id)}
								<span
									data-preview-avatar
									title="{person.firstName} {person.lastName}"
									class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-white/70 text-[11px] font-extrabold text-slate-700"
								>
									{initialsFor(person)}
								</span>
							{/each}
							{#if picked.length < 2}
								<span
									data-preview-open-slot
									title="Room for another"
									class="-ml-1 grid h-8 w-8 place-items-center rounded-full border-2 border-dashed border-slate-300 text-sm text-slate-400"
								>
									+
								</span>
							{/if}
						</div>
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

				<!-- Members before the finish line (issue 076). Inside the form, so a
				     pick posts with the create; the action re-checks every id against
				     a real verified account and the plan's member limit. -->
				<div class="border-t border-slate-200 pt-6">
					<CreateFamilyMemberPicker
						limit={data.memberLimit}
						onPicked={(people) => (picked = people)}
					/>
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

			<!-- What happens next (`family-create.html:113-121`). The page used to end at
			     the usage line, with nothing saying what creating a family actually
			     does — which is the whole argument for picking members here. -->
			<section
				aria-label="What happens next"
				class="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					What happens next
				</h2>
				<ol class="space-y-2 text-sm text-slate-700">
					<li class="flex gap-2.5 border-t border-slate-100 pt-2">
						<b class="text-slate-900">1</b>
						<span>A family, and a membership for you in it with the creator role.</span>
					</li>
					<li class="flex gap-2.5 border-t border-slate-100 pt-2">
						<b class="text-slate-900">2</b>
						<span>
							A family calendar, so events you add are shared rather than duplicated per person.
						</span>
					</li>
					<li class="flex gap-2.5 border-t border-slate-100 pt-2">
						<b class="text-slate-900">3</b>
						<span>You land on the family page, with everyone you picked already in it.</span>
					</li>
				</ol>
				<p class="mt-3 text-xs leading-relaxed text-slate-500">
					A family created with nobody in it is a shell — the calendar belongs to the family, and
					with no members there is nobody to see it. That is why members are picked here rather than
					after.
				</p>
			</section>
		</div>
	</div>
</div>
