<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { pushToast } from '$lib/client/toasts';
	import { copyOrShare } from '$lib/client/share';
	export let data: PageData;
	export let form: ActionData;
	let families = data.families;
	let plan = data.plan;
	$: atFamilyLimit = plan.used >= plan.limit;

	/* ── The approved card (issue 124) ──────────────────────────────────────
	   `family.html` draws one family's face: its initial on its colour, a stat
	   strip, an avatar per member and three ways in. The app keeps the list —
	   every family the user belongs to — and gives each family that card.

	   The strip is capped so a twelve-person household cannot push the card's
	   buttons off the fold; the rest are counted out loud instead of dropped
	   silently. */
	const ROSTER_STRIP_CAP = 5;

	function initial(name: string): string {
		return (name || 'F').charAt(0).toUpperCase();
	}

	/** "Maya" → "M", "Maya Lopez" → "ML". A name with no letters is a dot, not a blank. */
	function initials(firstName: string | null | undefined): string {
		const parts = (firstName ?? '').trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '•';
		return parts.length === 1
			? parts[0].charAt(0).toUpperCase()
			: (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
	}

	/* ── Invite by link (issue 091) ─────────────────────────────────────────
	   The code, the copy button and the join route all worked; nobody could
	   find them. So the family page mints its own code and shows the link where
	   the person already is, instead of sending them to a page about managing
	   codes. Gate is creator/admin — the same rule the action enforces. */
	type MintResult = { familyId?: string; inviteUrl?: string; error?: string } | null | undefined;
	function asMintResult(value: ActionData): MintResult {
		// SAFETY: `?/mintInvite` is this page's only action, so `form` is one of
		// those three shapes — or absent before the first submit.
		return (value ?? null) as MintResult;
	}
	$: mint = asMintResult(form);
	$: mintError = mint?.error ?? '';
	/** The family the last answer belongs to, so a link never shows above another. */
	$: mintedFor = mint?.inviteUrl ? (mint.familyId ?? '') : '';
	$: mintedUrl = mint?.inviteUrl ?? '';

	/** familyId whose request is in flight. */
	let mintingFamilyId = '';
	let copiedFamilyId = '';
	let copyFailedFamilyId = '';

	const origin = typeof window !== 'undefined' ? window.location.origin : '';

	function mintInviteSubmit(familyId: string, name: string) {
		// Ack in the click tick: the button goes busy before the request is sent.
		mintingFamilyId = familyId;
		return async ({
			result,
			update
		}: {
			result?: { type: string };
			update?: () => Promise<void>;
		}) => {
			// enhance calls back once before the action (no result) and once after.
			if (!result || !update) return;
			mintingFamilyId = '';
			await update();
			pushToast({
				message:
					result.type === 'success'
						? `Join link ready for ${name} — send it to them; it admits 10 people for 7 days.`
						: `Couldn't make a join link for ${name} — try again.`
			});
		};
	}

	async function copyInviteLink(familyId: string) {
		// One copy path for the whole app (issue 124): the platform share sheet
		// where there is one, the clipboard where there is not, and an honest
		// failure where neither is available.
		const outcome = await copyOrShare(origin + mintedUrl, {
			share: true,
			title: `Join ${data.families.find((f) => f.id === familyId)?.name ?? 'the family'}`
		});
		if (outcome === 'cancelled') return;
		copiedFamilyId = outcome === 'failed' ? '' : familyId;
		copyFailedFamilyId = outcome === 'failed' ? familyId : '';
	}
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-4xl px-3 py-4 pb-20 sm:px-4">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Family' }]} />

		<!-- Hero card -->
		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			aria-labelledby="families-hero-heading"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0">
					<h1 id="families-hero-heading" class="text-xl font-bold text-slate-900">Families</h1>
					<p class="mt-0.5 text-xs text-slate-400">
						{families.length === 1 ? '1 family' : `${families.length} families`} you belong to
					</p>
					<!-- Plan usage, read from the user's subscription (issue 098). At the
					     limit the Create button below would only bounce off the create
					     page's upgrade banner, so the pill says so up front. -->
					<p
						class="mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium {atFamilyLimit
							? 'border-amber-200 bg-amber-50 text-amber-800'
							: 'border-slate-200 bg-slate-50 text-slate-600'}"
					>
						{plan.used} of {plan.limit}
						{plan.limit === 1 ? 'family' : 'families'} on your plan
					</p>
				</div>
				{#if atFamilyLimit}
					<a
						href="/pricing"
						class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
					>
						Upgrade to add families
					</a>
				{:else}
					<a
						href="/family/create"
						class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
					>
						Create New Family
					</a>
				{/if}
			</div>
		</section>

		{#if families.length > 0}
			<!-- Families card -->
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-labelledby="families-list-heading"
			>
				<h2 id="families-list-heading" class="text-sm font-semibold text-slate-900">
					Your families
				</h2>
				<p class="mt-0.5 text-xs text-slate-400">Open a family to see members and settings</p>
				<ul class="mt-3 space-y-2.5">
					{#each families as family (family.id)}
						{@const rosterShown = (family.members ?? []).slice(0, ROSTER_STRIP_CAP)}
						{@const rosterHidden = (family.members ?? []).length - rosterShown.length}
						<li
							class="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/70 to-white p-4 shadow-sm transition-shadow hover:shadow-md"
						>
							<!-- The whole face of the card is the way into the family. The
							     three affordances below sit OUTSIDE this link — a link inside a
							     link is not a link, it is a bug. -->
							<a href="/family/{family.id}" class="group block">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="flex min-w-0 items-center gap-3">
										{#if family.color}
											<div
												class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold text-white"
												style="background-color: {family.color}"
												aria-hidden="true"
											>
												{initial(family.name)}
											</div>
										{:else}
											<div
												class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-lg font-extrabold text-slate-600"
												aria-hidden="true"
											>
												{initial(family.name)}
											</div>
										{/if}
										<div class="min-w-0">
											<p class="truncate text-xl font-extrabold tracking-tight text-slate-900">
												{family.name}
											</p>
											<p class="mt-0.5 text-xs text-slate-500">
												Family · settings, members and modules
											</p>
										</div>
									</div>
								</div>

								<!-- The stat strip: one baseline, one separator, per the approved
								     card. Column rules sit on the cells, not on the strip. -->
								<dl class="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-orange-100 pt-3">
									<div class="flex items-baseline gap-1.5">
										<dt
											class="text-[10px] font-bold uppercase tracking-widest text-slate-500"
										>
											Members
										</dt>
										<dd class="text-[13px] font-bold whitespace-nowrap text-slate-800">
											{family.memberCount}
										</dd>
									</div>
									<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
										<dt
											class="text-[10px] font-bold uppercase tracking-widest text-slate-500"
										>
											Created
										</dt>
										<dd class="text-[13px] font-bold whitespace-nowrap text-slate-800">
											{family.createdLabel}
										</dd>
									</div>
									<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
										<dt
											class="text-[10px] font-bold uppercase tracking-widest text-slate-500"
										>
											Colour
										</dt>
										<dd
											class="flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap text-slate-800"
										>
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
										<dt
											class="text-[10px] font-bold uppercase tracking-widest text-slate-500"
										>
											Open tasks
										</dt>
										<dd class="text-[13px] font-bold whitespace-nowrap text-slate-800">
											{family.openTasks}
										</dd>
									</div>
								</dl>

								<!-- The roster strip (issue 124): WHO is in this family. The
								     avatars are initials; the names underneath are what makes it
								     answer a person rather than a tally. -->
								<div class="mt-4">
									{#if rosterShown.length > 0}
										<ul class="flex items-center" aria-hidden="true">
											{#each rosterShown as member, i (i)}
												<li
													class="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-slate-200 text-xs font-extrabold text-slate-600 {i >
														0
														? '-ml-2'
														: ''}"
												>
													{initials(member.firstName)}
												</li>
											{/each}
										</ul>
										<p class="mt-1.5 truncate text-xs text-slate-500">
											<span class="sr-only">Members: </span>
											{rosterShown.map((m) => m.firstName).join(', ')}
											{#if rosterHidden > 0}
												<span class="text-slate-400">+{rosterHidden} more</span>
											{/if}
										</p>
									{:else}
										<p class="text-xs text-slate-500">
											No names yet — add a member and this strip fills in.
										</p>
									{/if}
								</div>
							</a>

							<!-- The approved card's three ways in. Each names where it goes. -->
							<div class="mt-4 flex flex-wrap gap-2">
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
								<a
									href="/family/tasks"
									class="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
								>
									Family tasks
								</a>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{:else}
			<!-- Empty state -->
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-labelledby="families-empty-heading"
			>
				<div class="py-10 text-center">
					<svg
						class="mx-auto mb-4 h-14 w-14 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					<p id="families-empty-heading" class="text-lg font-medium text-slate-700">
						No families yet
					</p>
					<p class="mt-1 text-sm text-slate-500">
						Create a family, then invite the people you share plans with.
					</p>
					<a
						href="/family/create"
						class="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
					>
						Create Your First Family
					</a>
				</div>
			</section>
		{/if}

		<!-- Invitations card -->
		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			aria-labelledby="families-invitations-heading"
		>
			<h2 id="families-invitations-heading" class="text-sm font-semibold text-slate-900">
				Invitations
			</h2>
			<p class="mt-0.5 text-xs text-slate-400">
				Get a join link to send, or manage the codes your family already has
			</p>
			{#if mintError}
				<div role="alert" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
					{mintError}
				</div>
			{/if}
			<div class="mt-3 space-y-1.5">
				{#each families.filter((f) => f.canInvite) as family (family.id)}
					{@const minting = mintingFamilyId === family.id}
					<div class="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
						<form
							method="POST"
							action="?/mintInvite"
							use:enhance={() => mintInviteSubmit(family.id, family.name)}
						>
							<input type="hidden" name="familyId" value={family.id} />
							<div class="flex min-w-0 items-center gap-3">
								<svg
									class="h-5 w-5 shrink-0 text-slate-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m8.656 2.828a4 4 0 000-5.656l-3-3a4 4 0 00-5.656 5.656l1.5 1.5"
									/>
								</svg>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-slate-700">{family.name}</p>
									<p class="text-xs text-slate-400">Join link, good for 10 people</p>
								</div>
								<button
									type="submit"
									disabled={minting}
									aria-busy={minting}
									class="shrink-0 rounded-full bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
								>
									{minting ? 'Making link…' : 'Invite by link'}
								</button>
							</div>
						</form>

						{#if mintedFor === family.id}
							<div class="mt-2 flex items-center gap-2">
								<input
									type="text"
									readonly
									aria-label="Join link for {family.name}"
									value={origin + mintedUrl}
									class="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
								/>
								<button
									type="button"
									onclick={() => copyInviteLink(family.id)}
									class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
								>
									{copiedFamilyId === family.id ? 'Copied' : 'Copy'}
								</button>
							</div>
							{#if copyFailedFamilyId === family.id}
								<p class="mt-1 text-xs text-red-600">
									Copy failed — select the link above and copy it manually.
								</p>
							{/if}
						{/if}
					</div>
				{/each}
				<a
					href="/family/invitations"
					class="flex min-h-11 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
				>
					<svg
						class="h-5 w-5 shrink-0 text-slate-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
					<span class="min-w-0 flex-1 truncate">View family invitations</span>
					<svg
						class="h-4 w-4 shrink-0 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</a>
				<a
					href="/family/tasks"
					class="flex min-h-11 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
				>
					<svg
						class="h-5 w-5 shrink-0 text-slate-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4"
						/>
					</svg>
					<span class="min-w-0 flex-1 truncate">Family Tasks</span>
					<svg
						class="h-4 w-4 shrink-0 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</a>
			</div>
		</section>
	</div>
</div>
