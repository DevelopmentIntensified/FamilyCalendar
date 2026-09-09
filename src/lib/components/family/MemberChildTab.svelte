<script lang="ts">
	interface Props {
		familyId: string;
		onSuccess: () => void;
		onError: (message: string) => void;
	}

	let { familyId, onSuccess, onError }: Props = $props();

	let childFirstName = $state('');
	let childLastName = $state('');
	let childEmail = $state('');
	let creatingChild = $state(false);

	async function createChild() {
		creatingChild = true;
		onError('');
		try {
			const res = await fetch('/family/' + familyId + '/members/add/child', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					firstName: childFirstName,
					lastName: childLastName,
					email: childEmail
				})
			});
			const json = await res.json().catch(() => ({}));
			if (json.error) {
				onError(json.error);
			} else {
				onSuccess();
			}
		} catch {
			onError('Network problem. Please try again.');
		} finally {
			creatingChild = false;
		}
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		createChild();
	}}
	class="space-y-4"
>
	<div>
		<label for="childFirstName" class="mb-2 block text-sm font-medium text-slate-700"
			>Child's First Name</label
		>
		<input
			type="text"
			id="childFirstName"
			bind:value={childFirstName}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div>
		<label for="childLastName" class="mb-2 block text-sm font-medium text-slate-700"
			>Child's Last Name</label
		>
		<input
			type="text"
			id="childLastName"
			bind:value={childLastName}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div>
		<label for="childEmail" class="mb-2 block text-sm font-medium text-slate-700">Email</label>
		<input
			type="email"
			id="childEmail"
			bind:value={childEmail}
			required
			placeholder="email for the child's account"
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
		<p class="mt-1 text-xs text-slate-400">
			Each child needs their own email address for their account.
		</p>
	</div>
	<button
		type="submit"
		disabled={creatingChild}
		class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
	>
		{creatingChild ? 'Creating...' : 'Create Child'}
	</button>
</form>
