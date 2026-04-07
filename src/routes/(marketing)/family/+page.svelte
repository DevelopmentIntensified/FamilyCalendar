<script lang="ts">
	export let data: PageData;
	let families = data.families;
</script>

<div class="h-min- relative top-16 w-full p-10">
	<div class="h-full rounded border-black p-5 shadow">
		<h1 class="mb-5 text-3xl font-bold">Family Page</h1>
		{#each families as family}
			<div class="mb-3 rounded border p-3">
				<h2 class="text-xl font-semibold">{family.name}</h2>
				<p>Members: {family.memberCount}</p>
				<button class="mt-2 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700">
					View Family Details
				</button>
			</div>
		{/each}
		<a
			class="mt-2 rounded bg-green-500 px-4 py-2 font-bold text-white hover:bg-green-700"
			href="/family/create"
		>
			Create New Family
		</a>
		<button class="mt-2 rounded bg-yellow-500 px-4 py-2 font-bold text-white hover:bg-yellow-700">
			<a href="/family/invitations">view family invitations</a>
		</button>
	</div>
</div>
