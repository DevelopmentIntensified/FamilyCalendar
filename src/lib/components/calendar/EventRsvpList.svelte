<script lang="ts">
	interface Props {
		rsvpData: {
			userId: string | null;
			status: string;
			firstName?: string | null;
		}[];
	}

	let { rsvpData }: Props = $props();

	let going = $derived(rsvpData.filter((r) => r.status === 'going'));
	let maybe = $derived(rsvpData.filter((r) => r.status === 'maybe'));
	let declined = $derived(
		rsvpData.filter((r) => r.status === 'declined' || r.status === 'not_going')
	);
</script>

{#if rsvpData.length > 0}
	<div class="border-t border-slate-100 p-5">
		<h3 class="mb-2 text-sm font-semibold text-slate-700">RSVP Status</h3>
		{#if going.length > 0}
			<div class="mb-2">
				<span class="text-xs font-medium text-emerald-700">Going ({going.length}):</span>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each going as rsvp}
						<span
							class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
							>{rsvp.firstName || rsvp.userId}</span
						>
					{/each}
				</div>
			</div>
		{/if}
		{#if maybe.length > 0}
			<div class="mb-2">
				<span class="text-xs font-medium text-amber-700">Maybe ({maybe.length}):</span>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each maybe as rsvp}
						<span
							class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
							>{rsvp.firstName || rsvp.userId}</span
						>
					{/each}
				</div>
			</div>
		{/if}
		{#if declined.length > 0}
			<div class="mb-2">
				<span class="text-xs font-medium text-red-700">Not Going ({declined.length}):</span>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each declined as rsvp}
						<span
							class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700"
							>{rsvp.firstName || rsvp.userId}</span
						>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
