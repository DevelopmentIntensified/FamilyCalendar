<!--
	One `/family` card: the family's initial on its colour, the stat strip
	(Members / Created / Colour / Open tasks), the roster strip and the ways in.
	The whole face is the link; the buttons sit outside it, because a link
	inside a link is a bug.

	Render only — the page passes the card it composed server-side and the
	buttons are plain links.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { idColor } from '$lib/kernel/ui/colorHash';
	import type { FamilyCardView } from '../family.contract';
	import { familyInitial, familyPersonInitial, familyRosterStrip } from '../family.home.rules';

	interface Props {
		family: FamilyCardView;
	}

	let { family }: Props = $props();

	const strip = $derived(familyRosterStrip(family.members ?? []));
</script>

<li
	class="relative overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50/70 to-white p-7 shadow-sm transition-shadow hover:shadow-md"
>
	<div
		data-family-glow
		class="pointer-events-none absolute -bottom-10 right-1 h-36 w-36 rounded-full blur-2xl"
		style="background-color: {family.color ?? '#fdba74'}4d"
		aria-hidden="true"
	></div>
	<a href="/family/{family.id}" class="group relative block">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="flex min-w-0 items-center gap-3">
				{#if family.color}
					<div
						class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold text-white"
						style="background-color: {family.color}"
						aria-hidden="true"
					>
						{familyInitial(family.name)}
					</div>
				{:else}
					<div
						class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-lg font-extrabold text-slate-600"
						aria-hidden="true"
					>
						{familyInitial(family.name)}
					</div>
				{/if}
				<div class="min-w-0">
					<p class="truncate text-xl font-extrabold tracking-tight text-slate-900">
						{family.name}
					</p>
					<p class="mt-0.5 text-xs text-slate-500">Family · settings, members and modules</p>
				</div>
			</div>
		</div>

		<dl class="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-orange-100 pt-4">
			<div class="flex items-baseline gap-1.5">
				<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Members</dt>
				<dd class="whitespace-nowrap text-[13px] font-bold text-slate-800">
					{family.memberCount}
				</dd>
			</div>
			<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
				<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Created</dt>
				<dd class="whitespace-nowrap text-[13px] font-bold text-slate-800">
					{family.createdLabel}
				</dd>
			</div>
			<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
				<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Colour</dt>
				<dd class="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-slate-800">
					{#if family.color}
						<span
							class="inline-block h-2.5 w-2.5 rounded-full"
							style="background-color: {family.color}"
							aria-hidden="true"
						></span>
						{family.color.toUpperCase()}
					{:else}
						Not set
					{/if}
				</dd>
			</div>
			<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
				<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Open tasks</dt>
				<dd class="whitespace-nowrap text-[13px] font-bold text-slate-800">{family.openTasks}</dd>
			</div>
		</dl>

		<div class="mt-5">
			{#if strip.shown.length > 0}
				<ul class="flex items-center" aria-hidden="true">
					{#each strip.shown as member, i (member.userId)}
						<li
							data-roster-avatar={idColor(member.userId)}
							class="grid h-9 w-9 place-items-center rounded-full border-2 border-white text-xs font-extrabold {idColor(
								member.userId
							)} {i > 0 ? '-ml-2' : ''}"
						>
							{familyPersonInitial(member.firstName)}
						</li>
					{/each}
				</ul>
				<p class="mt-1.5 truncate text-xs text-slate-500">
					<span class="sr-only">Members: </span>
					{strip.shown.map((member) => member.firstName).join(', ')}
					{#if strip.hidden > 0}
						<span class="text-slate-400">+{strip.hidden} more</span>
					{/if}
				</p>
			{:else}
				<p class="text-xs text-slate-500">
					No names yet — add a member and this strip fills in.
				</p>
			{/if}
		</div>
	</a>

	<div class="relative mt-5 flex flex-wrap gap-2">
		<a
			href="/family/{family.id}"
			class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
		>
			Open family
		</a>
		<a
			href="/family/{family.id}#members-heading"
			class="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
		>
			Members
		</a>
		{#if family.canInvite}
			<a
				href="/family/{family.id}/members/add"
				class="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
			>
				Add a member
			</a>
		{/if}
		<a
			href="/family/tasks"
			class="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
		>
			Family tasks
		</a>
	</div>
</li>
