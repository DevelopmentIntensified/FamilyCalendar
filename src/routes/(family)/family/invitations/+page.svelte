<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { copyOrShare } from '$lib/client/share';
	import { pushToast } from '$lib/client/toasts';

	export let data: PageData;
	let { invitations, family, canManageInvites, memberships } = data;

	let creating = false;
	let revoking = '';
	let error = '';
	let copiedCode = '';
	let copyFailedCode = '';
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * The approved New-code controls (`family-invitations.html:104-117`).
	 *
	 * The prototype offers a validity window and a max-use count. The route has
	 * honoured both since issue 091 — `clampCount(expiresInDays, 1, 30, 7)` and
	 * `clampCount(maxUses, 1, 50, DEFAULT_INVITE_MAX_USES)` — and nothing ever
	 * sent them, so every code this page minted was 7 days and 10 uses whatever
	 * the person wanted. The controls now reach the route.
	 *
	 * "Never expires" is deliberately absent: `familyInviteCodes.expiresAt` is
	 * NOT NULL and `verifyInviteCode` filters on `expiresAt > now`, so an
	 * immortal code is a schema change, not a UI option.
	 */
	const VALIDITY_CHOICES = [
		{ label: '7 days', days: 7 },
		{ label: '24 hours', days: 1 },
		{ label: '30 days', days: 30 }
	];
	/** The prototype's own bounds for the field (min 1, max 20). */
	const MAX_USES_MIN = 1;
	const MAX_USES_MAX = 20;

	let validityDays = 7;
	let maxUses = 10;

	function expiryDate(value: string | Date): Date {
		return value instanceof Date ? value : new Date(value);
	}

	function isUsable(invite: PageData['invitations'][number], now = Date.now()): boolean {
		const expires = expiryDate(invite.expiresAt).getTime();
		const usedUp = invite.maxUses !== null && (invite.useCount ?? 0) >= invite.maxUses;
		return expires > now && !usedUp;
	}

	/** The one code this page is really about: live, else the next one down. */
	$: liveInvite = invitations.find((i) => isUsable(i)) ?? null;
	$: otherInvites = invitations.filter((i) => i !== liveInvite);

	/** One path for every link on this page (issue 124). */
	async function copyInvite(code: string, url: string) {
		const outcome = await copyOrShare(url, {
			share: true,
			title: `Join ${family?.name ?? 'the family'}`
		});
		if (outcome === 'cancelled') return;
		copyFailedCode = outcome === 'failed' ? code : '';
		copiedCode = outcome === 'failed' ? '' : code;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			copiedCode = '';
			copyFailedCode = '';
		}, 2000);
	}

	const origin = typeof window !== 'undefined' ? window.location.origin : '';

	const joinUrl = (code: string) => `${origin}/family/join/${code}`;

	const createInvitation = async () => {
		// Ack in the click tick, before the request is even sent.
		creating = true;
		error = '';
		try {
			const res = await fetch('/api/family/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					familyId: family?.id,
					// Both are coerced: a select and a number input hand back
					// different types, and the route's clampCount wants numbers.
					expiresInDays: Number(validityDays),
					maxUses: Number(maxUses)
				})
			});
			const json = await res.json();
			if (json.error) {
				error = json.error;
				pushToast({ message: `Couldn't make a new code — ${json.error}` });
			} else {
				await invalidateAll();
				pushToast({
					message: `New code ${json.code} is live — send it to whoever you are inviting.`
				});
			}
		} catch {
			error = 'Failed to create invitation';
			pushToast({ message: "Couldn't make a new code — check your connection and try again." });
		} finally {
			creating = false;
		}
	};

	const revokeInvitation = async (code: string) => {
		revoking = code;
		error = '';
		try {
			const res = await fetch('/api/family/invite', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			const json = await res.json();
			if (json.error) {
				error = json.error;
				pushToast({ message: `Couldn't revoke ${code} — ${json.error}` });
			} else {
				await invalidateAll();
				pushToast({
					message: `${code} revoked — anybody still holding the link is now locked out.`
				});
			}
		} catch {
			error = 'Failed to revoke invitation';
			pushToast({ message: `Couldn't revoke ${code} — check your connection and try again.` });
		} finally {
			revoking = '';
		}
	};
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-6xl">
		<Breadcrumbs
			crumbs={[
				{ label: 'Calendar', href: '/calendar' },
				{ label: 'Family', href: '/family' },
				{ label: family?.name || 'Family', href: family?.id ? `/family/${family.id}` : undefined },
				{ label: 'Invitations' }
			]}
		/>

		<!-- The approved composition (issue 124): a main column and an 18rem rail.
		     Measured at 1440px, `family-invitations.html`'s `.lg` resolves to
		     `928px 288px`; the page was one 896px card with nothing beside it. -->
		<div class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<main class="min-w-0">
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold text-slate-900">Family Invitations</h1>
						{#if family}
							<p class="mt-1 text-sm text-slate-500">
								Managing invitations for: <span class="font-medium text-slate-700"
									>{family.name}</span
								>
							</p>
						{/if}
					</div>
					<a
						href="/family/{family?.id}"
						class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
					>
						Back to Family
					</a>
				</div>

				{#if error}
					<div role="alert" class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
				{/if}

				<!-- Multi-family: this page manages ONE family's invites at a time, so a
				     user in two families needs a way to say which (issue 098). -->
				{#if memberships.length > 1}
					<nav class="mb-4 flex flex-wrap gap-1.5" aria-label="Choose a family">
						{#each memberships as m (m.id)}
							<a
								href="/family/invitations?familyId={m.id}"
								aria-current={m.id === family?.id ? 'page' : undefined}
								class="inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors {m.id ===
								family?.id
									? 'border-primary-600 bg-primary-50 text-primary-700'
									: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
							>
								{m.name}
							</a>
						{/each}
					</nav>
				{/if}

				{#if !canManageInvites}
					<section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div class="py-12 text-center">
							<p class="text-slate-500">
								Only the family creator or an admin can manage invitations.
							</p>
						</div>
					</section>
				{:else if invitations.length > 0}
					<!-- The live code, drawn the way the prototype draws it: 28px extra-bold
					     monospace with wide tracking, inside a blue-washed box. Measured
					     there as 18px padding / 16px radius; the app drew a 14px chip. -->
					{#if liveInvite}
						{@const liveUrl = joinUrl(liveInvite.code)}
						<section
							data-invite-codebox
							class="flex flex-wrap items-center gap-4 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-100/60 to-white p-5"
							aria-labelledby="live-code-heading"
						>
							<div class="min-w-0 flex-1">
								<h2
									id="live-code-heading"
									class="text-[10px] font-bold uppercase tracking-widest text-slate-500"
								>
									Active code
								</h2>
								<code
									class="mt-1 block font-mono text-[28px] font-extrabold leading-none tracking-[0.12em] text-slate-900"
									>{liveInvite.code}</code
								>
								{#if liveInvite.maxUses !== null}
									<div class="mt-3 flex max-w-[11rem] gap-1.5" aria-hidden="true">
										{#each Array(liveInvite.maxUses) as _, i (i)}
											<span
												data-use-slot={i < (liveInvite.useCount ?? 0) ? 'used' : 'free'}
												class="h-2 flex-1 rounded-full {i < (liveInvite.useCount ?? 0)
													? 'bg-primary-600'
													: 'bg-slate-200'}"
											></span>
										{/each}
									</div>
								{/if}
								<p class="mt-1.5 text-xs text-slate-500">
									{liveInvite.useCount ?? 0} of {liveInvite.maxUses ?? '∞'} used · expires {expiryDate(
										liveInvite.expiresAt
									).toLocaleDateString()}
								</p>
							</div>
							<div class="flex shrink-0 flex-col gap-2">
								<button
									type="button"
									on:click={() => copyInvite(liveInvite.code, liveUrl)}
									class="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
								>
									{copiedCode === liveInvite.code ? 'Copied ✓' : 'Copy join link'}
								</button>
								<div class="min-w-0 text-xs text-slate-500">
									<input
										type="text"
										readonly
										aria-label="Join link for {family?.name ?? 'this family'}"
										value={liveUrl}
										class="w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-600"
									/>
								</div>
								{#if copyFailedCode === liveInvite.code}
									<p class="text-xs text-red-600">
										Copy failed — select the link above and copy it manually.
									</p>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Every other code this family holds, active or spent. -->
					{#if otherInvites.length > 0}
						<section class="mt-4" aria-label="Other codes">
							<ul class="space-y-3">
								{#each otherInvites as invite (invite.code)}
									{@const inviteUrl = joinUrl(invite.code)}
									<li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-2">
													<code
														class="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold text-slate-700"
														>{invite.code}</code
													>
													{#if !isUsable(invite)}
														<span
															class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600"
															>Inactive</span
														>
													{/if}
												</div>
												<p class="mt-2 text-sm text-slate-500">
													{invite.useCount ?? 0} of {invite.maxUses ?? '∞'} used · expires {expiryDate(
														invite.expiresAt
													).toLocaleDateString()}
												</p>
											</div>
											<div class="flex items-center gap-2">
												<button
													type="button"
													on:click={() => copyInvite(invite.code, inviteUrl)}
													class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
												>
													{copiedCode === invite.code ? 'Copied ✓' : 'Copy'}
												</button>
												<button
													type="button"
													aria-label="Revoke {invite.code}"
													on:click={() => revokeInvitation(invite.code)}
													disabled={revoking === invite.code}
													class="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
												>
													{revoking === invite.code ? 'Revoking…' : 'Revoke'}
												</button>
											</div>
										</div>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				{:else}
					<section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div class="py-12 text-center">
							<svg
								class="mx-auto mb-4 h-12 w-12 text-slate-300"
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
							<p class="mb-4 text-slate-500">No active invitations for this family.</p>
							<p class="text-sm text-slate-400">
								Create an invitation to invite new members to your family.
							</p>
						</div>
					</section>
				{/if}
			</main>

			<!-- The approved rail: NEW CODE and REVOKE, each in its own band. -->
			<aside class="mt-4 flex min-w-0 flex-col gap-4 lg:mt-0">
				{#if canManageInvites}
					<section
						class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-label="New code"
					>
						<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
							New code
						</h2>
						<p class="text-xs leading-relaxed text-slate-500">
							A new code joins the codes this family already has. It leaves the current code
							working, so send it only to the person you mean to invite — revoke the old one when
							you are done.
						</p>

						<div class="mt-3">
							<label for="validity" class="mb-1.5 block text-xs font-medium text-slate-500">
								Valid for
							</label>
							<select
								id="validity"
								bind:value={validityDays}
								class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							>
								{#each VALIDITY_CHOICES as choice (choice.days)}
									<option value={choice.days}>{choice.label}</option>
								{/each}
							</select>
						</div>

						<div class="mt-3">
							<label for="maxUses" class="mb-1.5 block text-xs font-medium text-slate-500">
								Max uses
							</label>
							<input
								id="maxUses"
								type="number"
								bind:value={maxUses}
								min={MAX_USES_MIN}
								max={MAX_USES_MAX}
								class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							/>
							<p class="mt-1 text-xs text-slate-400">
								A use is spent when the link is opened, not when somebody joins.
							</p>
						</div>

						<button
							type="button"
							on:click={createInvitation}
							disabled={creating}
							aria-busy={creating}
							class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
						>
							{creating ? 'Creating…' : 'Create new code'}
						</button>
					</section>

					<section
						class="min-w-0 rounded-2xl border border-red-200 bg-gradient-to-br from-red-100/40 to-white p-4 shadow-sm"
						aria-label="Revoke"
					>
						<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
							Revoke
						</h2>
						<p class="text-xs leading-relaxed text-slate-500">
							Revoking kills the link for anyone who has not used it yet. It cannot un-join somebody
							who already has.
						</p>
						{#if liveInvite}
							<button
								type="button"
								on:click={() => revokeInvitation(liveInvite.code)}
								disabled={revoking === liveInvite.code}
								aria-busy={revoking === liveInvite.code}
								class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
							>
								{revoking === liveInvite.code ? 'Revoking…' : `Revoke ${liveInvite.code}`}
							</button>
						{/if}
					</section>

					<a
						href="/family/{family?.id}/members/add"
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
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
								d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
							/>
						</svg>
						Add a member
					</a>
				{/if}
			</aside>
		</div>
	</div>
</div>
