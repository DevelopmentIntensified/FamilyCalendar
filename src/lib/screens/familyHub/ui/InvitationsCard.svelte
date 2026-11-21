<!--
	The admin-only Invitations card in the main column: both doors to the
	invitations manager (Q-090, owner 2026-11-12: keep both).
	Legacy reference: `family/[familyId]/+page.svelte:708-782`.
-->
<script lang="ts">
	interface Props {
		familyId: string;
	}

	let { familyId }: Props = $props();
</script>

<section
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="invitations-heading"
>
	<h2
		id="invitations-heading"
		class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
	>
		Invitations
	</h2>
	<div class="space-y-1.5">
		<a
			href="/family/invitations"
			class="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
			<span class="flex-1">Manage invitations</span>
		</a>
		<a
			href="/family/{familyId}/members/add"
			class="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
					d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
				/>
			</svg>
			<span class="flex-1">Add member</span>
		</a>
	</div>
</section>
