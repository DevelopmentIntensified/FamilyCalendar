<!--
	The `/family` page's side rail, one MEMBERS + INVITATIONS pair per family: the
	roster with each person's Member Type and role pill, and the family's live
	join code with its uses, expiry, copy button and a way into the manager.

	Props in; the copy callback goes to the page state.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { idColor } from '$lib/kernel/ui/colorHash';
	import type { FamilyActiveInvite, FamilyCardView, FamilyRosterRowView } from '../family.contract';
	import { rolePillClass } from '../family.display.rules';
	import {
		familyExpiryLabel,
		familyInviteUsesLabel,
		familyPersonInitial,
		familyRailPersonName
	} from '../family.home.rules';

	interface Props {
		families: readonly FamilyCardView[];
		rosterByFamily: ReadonlyMap<string, readonly FamilyRosterRowView[]>;
		inviteByFamily: ReadonlyMap<string, FamilyActiveInvite>;
		railCopiedCode: string;
		railCopyFailedCode: string;
		oncopy: (code: string) => void;
	}

	let { families, rosterByFamily, inviteByFamily, railCopiedCode, railCopyFailedCode, oncopy } =
		$props();
</script>

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
				<a href="/family/{family.id}" class="text-xs font-medium text-primary-600">Manage →</a>
			</div>
			{#if railRoster.length === 0}
				<p class="text-xs text-slate-500">No names yet.</p>
			{:else}
				<ul>
					{#each railRoster as person (person.userId)}
						<li data-testid="rail-member" class="flex items-center gap-2.5 py-2 first:pt-0">
							<div
								class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold {idColor(
									person.userId
								)}"
								aria-hidden="true"
							>
								{familyPersonInitial(person.firstName)}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-slate-800">
									{familyRailPersonName(person)}
								</p>
								<p class="truncate text-xs text-slate-400">{person.memberType ?? 'member'}</p>
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
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
						{familyInviteUsesLabel(railInvite)}
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
						onclick={() => oncopy(railInvite.code)}
						class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
					{#if railCopiedCode === railInvite.code}
						Copied — send it to whoever you are inviting.
					{:else if railCopyFailedCode === railInvite.code}
						<span class="text-red-600">Copy failed — select the code and copy it by hand.</span>
					{:else}
						Expires {familyExpiryLabel(railInvite.expiresAt)}
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
