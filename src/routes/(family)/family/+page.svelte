<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { pushToast } from '$lib/client/toasts';
	import { copyOrShare } from '$lib/client/share';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { rolePillClass } from '$lib/utils/familyDisplay';
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

	/* ── The approved side rail (issue 124) ─────────────────────────────────
	   `family.html` is a two-column page: the family card on the left, and a
	   19rem rail on the right holding MEMBERS and INVITATIONS. Measured at
	   1440px the prototype resolves to `908px 304px`; this page was a single
	   896px stack with neither band. Both are transcribed here.

	   The rail is per family, because the app answers for every family the
	   viewer belongs to where the prototype had exactly one fixture. */
	type RosterRow = NonNullable<PageData['roster']>[number];
	type ActiveInvite = NonNullable<PageData['activeInvites']>[number];

	// SAFETY: `+page.server.ts` returns `roster` from ONE query over every family
	// the viewer belongs to, in this row shape; `?? []` covers a fixture written
	// before the rail existed. `activeInvites` is the same read over the codes.
	// (The anti-slop plugin wants a one-line SAFETY on the statement; two remain.)
	$: roster = (data.roster ?? []) as RosterRow[];
	$: activeInvites = (data.activeInvites ?? []) as ActiveInvite[];

	/** Roster rows per family, first-name order (the loader orders them). */
	function groupByFamily(rows: RosterRow[]): Map<string, RosterRow[]> {
		const out = new Map<string, RosterRow[]>();
		for (const row of rows) {
			const list = out.get(row.familyId);
			if (list) list.push(row);
			else out.set(row.familyId, [row]);
		}
		return out;
	}
	$: rosterByFamily = groupByFamily(roster);

	/** The join code still in use per family — the loader filtered the rest out. */
	$: inviteByFamily = new Map(activeInvites.map((i) => [i.familyId, i]));

	function personName(row: RosterRow): string {
		return [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Family member';
	}

	/** "2 of 5 used" — a code with no ceiling prints ∞, never `null`. */
	function usesLabel(invite: ActiveInvite): string {
		return `${invite.useCount ?? 0} of ${invite.maxUses ?? '∞'} used`;
	}

	function expiryLabel(value: Date | string): string {
		const d = value instanceof Date ? value : new Date(value);
		return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
	}

	/** The rail's copy button: the same ack-then-confirm ladder as the mint form. */
	let railCopying = '';
	let railCopied = '';
	let railCopyFailed = '';

	async function copyRailCode(code: string) {
		railCopying = code;
		const outcome = await copyOrShare(`${origin}/family/join/${code}`, {
			share: true,
			title: 'Join this family'
		});
		railCopying = '';
		if (outcome === 'cancelled') return;
		railCopyFailed = outcome === 'failed' ? code : '';
		railCopied = outcome === 'failed' ? '' : code;
		pushToast({
			message:
				outcome === 'failed'
					? "Couldn't copy the join link — select it and copy it by hand."
					: 'Join link copied — send it to whoever you are inviting.'
		});
	}
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-6xl px-3 py-4 pb-20 sm:px-4">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Family' }]} />

		<!-- The approved composition (issue 124): one main column and a 19rem rail.
		     `family.html` splits at 1000px; `lg` (1024px) is the nearest house step. -->
		<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5">
			<main class="min-w-0">
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
						class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-labelledby="families-list-heading"
					>
						<h2 id="families-list-heading" class="text-sm font-semibold text-slate-900">
							Your families
						</h2>
						<p class="mt-0.5 text-xs text-slate-400">Open a family to see members and settings</p>
						<ul class="mt-3 space-y-4">
							{#each families as family (family.id)}
								{@const rosterShown = (family.members ?? []).slice(0, ROSTER_STRIP_CAP)}
								{@const rosterHidden = (family.members ?? []).length - rosterShown.length}
								<li
									class="relative overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50/70 to-white p-7 shadow-sm transition-shadow hover:shadow-md"
								>
									<!-- `family.html`'s `.famcard__glow`: one blurred wash of the
									     family's own colour in the bottom corner. Measured 144px
									     with a 24px blur; the app card had none. -->
									<div
										data-family-glow
										class="pointer-events-none absolute -bottom-10 right-1 h-36 w-36 rounded-full blur-2xl"
										style="background-color: {family.color ?? '#fdba74'}4d"
										aria-hidden="true"
									></div>
									<!-- The whole face of the card is the way into the family. The
									     three affordances below sit OUTSIDE this link — a link inside a
									     link is not a link, it is a bug. -->
									<a href="/family/{family.id}" class="group relative block">
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
											<!-- `family.html` puts the plan usage beside the family's name
											     on the card itself. It is the same figure the hero
											     carries, so it is not printed twice. -->
										</div>

										<!-- The stat strip: one baseline, one separator, per the approved
										     card. Column rules sit on the cells, not on the strip. -->
										<dl
											class="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-orange-100 pt-4"
										>
											<div class="flex items-baseline gap-1.5">
												<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
													Members
												</dt>
												<dd class="whitespace-nowrap text-[13px] font-bold text-slate-800">
													{family.memberCount}
												</dd>
											</div>
											<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
												<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
													Created
												</dt>
												<dd class="whitespace-nowrap text-[13px] font-bold text-slate-800">
													{family.createdLabel}
												</dd>
											</div>
											<div class="flex items-baseline gap-1.5 border-l border-orange-200 pl-5">
												<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
													Colour
												</dt>
												<dd
													class="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-slate-800"
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
												<dt class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
													Open tasks
												</dt>
												<dd class="whitespace-nowrap text-[13px] font-bold text-slate-800">
													{family.openTasks}
												</dd>
											</div>
										</dl>

										<!-- The roster strip (issue 124): WHO is in this family. The
										     avatars are initials in each person's own tone — the
										     prototype draws `background:${m.tone}` and every app
										     avatar measured one flat grey. -->
										<div class="mt-5">
											{#if rosterShown.length > 0}
												<ul class="flex items-center" aria-hidden="true">
													{#each rosterShown as member, i (i)}
														<li
															data-roster-avatar={avatarColor(member.userId)}
															class="grid h-9 w-9 place-items-center rounded-full border-2 border-white text-xs font-extrabold {avatarColor(
																member.userId
															)} {i > 0 ? '-ml-2' : ''}"
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

									<!-- The approved card's ways in. Each names where it goes. The
									     fourth is `family.html`'s `link-add` row: the page carried
									     no route into the add-member form at all. -->
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
							{/each}
						</ul>
					</section>
				{:else}
					<!-- Empty state -->
					<section
						class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
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
					class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
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
											on:click={() => copyInviteLink(family.id)}
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
			</main>

			<!-- The approved side rail: MEMBERS and INVITATIONS, one pair per family.
			     Both bands are the prototype's own (`.mrow` rows carrying a Member Type
			     and a role chip; the live code with its uses, expiry, copy and manage). -->
			<aside aria-label="Family details" class="mt-5 flex min-w-0 flex-col gap-5 lg:mt-4">
				{#each families as family (family.id)}
					{@const railRoster = rosterByFamily.get(family.id) ?? []}
					{@const railInvite = inviteByFamily.get(family.id)}
					<section
						class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-labelledby="rail-members-{family.id}"
					>
						<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
							<h2
								id="rail-members-{family.id}"
								class="text-xs font-semibold uppercase tracking-wide text-slate-500"
							>
								Members
							</h2>
							<a href="/family/{family.id}" class="text-xs font-medium text-primary-600">
								Manage →
							</a>
						</div>
						{#if railRoster.length === 0}
							<p class="text-xs text-slate-500">No names yet.</p>
						{:else}
							<ul>
								{#each railRoster as person (person.userId)}
									<li data-testid="rail-member" class="flex items-center gap-2.5 py-2 first:pt-0">
										<div
											class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold {avatarColor(
												person.userId
											)}"
											aria-hidden="true"
										>
											{initials(person.firstName)}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-slate-800">
												{personName(person)}
											</p>
											<p class="truncate text-xs text-slate-400">
												{person.memberType ?? 'member'}
											</p>
										</div>
										<span class={rolePillClass(person.role ?? 'member')}>
											{person.role ?? 'member'}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</section>

					<section
						class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-labelledby="rail-invites-{family.id}"
					>
						<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
							<h2
								id="rail-invites-{family.id}"
								class="text-xs font-semibold uppercase tracking-wide text-slate-500"
							>
								Invitations
							</h2>
							{#if railInvite}
								<span
									class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
								>
									{usesLabel(railInvite)}
								</span>
							{/if}
						</div>
						{#if railInvite}
							<div class="flex items-center gap-2">
								<code
									class="flex-1 truncate rounded bg-slate-100 px-2.5 py-1.5 font-mono text-sm font-extrabold tracking-wider text-slate-900"
									>{railInvite.code}</code
								>
								<button
									type="button"
									aria-label="Copy join link for {family.name}"
									aria-busy={railCopying === railInvite.code}
									on:click={() => copyRailCode(railInvite.code)}
									class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
								>
									<svg
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8 16V6a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H8zM4 8v10a2 2 0 002 2h8"
										/>
									</svg>
								</button>
							</div>
							<p class="mt-2 text-xs text-slate-400">
								{#if railCopied === railInvite.code}
									Copied — send it to whoever you are inviting.
								{:else if railCopyFailed === railInvite.code}
									<span class="text-red-600"
										>Copy failed — select the code and copy it by hand.</span
									>
								{:else}
									Expires {expiryLabel(railInvite.expiresAt)}
								{/if}
							</p>
						{:else}
							<p class="text-xs text-slate-500">No live join link for this family.</p>
						{/if}
						<a
							href="/family/invitations?familyId={family.id}"
							class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
						>
							Manage invitations
						</a>
					</section>
				{/each}
			</aside>
		</div>
	</div>
</div>
