<!--
	The `/family/create` page body: the approved live preview, the name field,
	the six named swatches, the "Who is in it" picker, the plan banner and the
	usage line, then "What happens next". The form posts the page's own action
	(`?/default`), which runs the shared create use-case; this screen only
	acknowledges the submit and keeps the typed name on a refusal.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createFamilyApi } from '../family.api';
	import type { FamilyCreateFormEcho, FamilyCreatePage } from '../family.contract';
	import {
		familyCreateUsageLabel,
		familyLimitBannerCopy
	} from '../family.create.rules';
	import { FamilyCreateState, type FamilyFormEnhancer } from '../family.create.state.svelte';
	import { DEFAULT_FAMILY_COLOR } from '../family.palette.rules';
	import Breadcrumbs from '$lib/kernel/ui/Breadcrumbs.svelte';
	import FamilyCreatePreview from './FamilyCreatePreview.svelte';
	import FamilyMemberPicker from './FamilyMemberPicker.svelte';
	import FamilyPalettePicker from './FamilyPalettePicker.svelte';

	interface Props {
		data: FamilyCreatePage;
		form: FamilyCreateFormEcho;
		enhance: FamilyFormEnhancer;
	}

	let { data, form, enhance }: Props = $props();

	const toasts = createToasts();
	const state = new FamilyCreateState(createFamilyApi(), toasts, {
		name: form?.name ?? '',
		color: form?.color || DEFAULT_FAMILY_COLOR
	});

	const limitReached = $derived(Boolean(form?.upgradeRequired) || data.familyLimitReached);
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
						{familyLimitBannerCopy(data.familyLimit)}
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
					state.beginSubmit();
					return async ({ update, result }) => {
						await update();
						state.finishSubmit(result.type);
					};
				}}
				class="space-y-6"
				onsubmit={(event) => {
					if (limitReached) event.preventDefault();
				}}
			>
				<FamilyCreatePreview name={state.name} color={state.color} picked={state.picked} />

				<div class="space-y-2">
					<label for="name" class="block text-sm font-medium text-slate-500">
						What do you call it?
					</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={state.name}
						placeholder="The Smiths"
						maxlength="50"
						class="w-full border-0 border-b-2 border-slate-200 bg-transparent px-0 py-2 text-2xl font-extrabold tracking-tight text-slate-900 placeholder:font-bold placeholder:text-slate-200 focus:border-primary-500 focus:outline-none focus:ring-0"
					/>
				</div>

				<FamilyPalettePicker
					color={state.color}
					onpick={(value) => {
						state.color = value;
					}}
				/>

				<div class="border-t border-slate-200 pt-6">
					<FamilyMemberPicker {state} limit={data.memberLimit} />
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
						disabled={state.submitting || limitReached}
						class="w-full rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50 sm:flex-1"
					>
						{state.submitting ? 'Creating…' : 'Create Family'}
					</button>
				</div>

				<p class="text-center text-xs text-slate-500">
					{familyCreateUsageLabel(data.familyUsed, data.familyLimit)}
				</p>
			</form>

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

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
