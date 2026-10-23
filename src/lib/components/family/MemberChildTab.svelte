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
	let consentAcknowledged = $state(false);
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
					email: childEmail,
					consentAcknowledged
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
		<!-- The true version of the prototype's warning (issue 102). The child
	     endpoint creates the account through the standard user-creation path, so
	     the child CAN sign in — by magic link only, since no password is set.
	     Uniqueness is stated as a rule, not as a save-time error. -->
		<aside
			role="note"
			aria-label="A child is a real account"
			class="mb-4 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-100/70 to-white px-4 py-3.5 text-[13px] leading-relaxed text-slate-800"
		>
			<b>A child is a real account.</b> Creating this child makes a real, sign-in-capable account
			with the email you type. <b>No password is set</b>, so the child signs in only through a
			<b>magic link</b> sent to that address — and because you are the <b>only holder</b> of that
			address, only you can let them in. The address has to be <b>unique across all of Family
			Planz</b>, so each child needs one of their own. A placeholder like
			<code>mia@kids.example.com</code> is fine as long as nobody else uses it.
		</aside>
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
	<div>
		<label for="childConsent" class="flex items-start gap-3 text-sm text-slate-700">
			<input
				type="checkbox"
				id="childConsent"
				bind:checked={consentAcknowledged}
				required
				class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-2 focus:ring-primary-500/20"
			/>
			<span>
				I am this child’s parent or guardian and I consent to Family Planz creating and
				storing this account for them. I can remove it at any time. A record of this
				consent is kept.
			</span>
		</label>
	</div>
	<button
		type="submit"
		disabled={creatingChild}
		class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
	>
		{creatingChild ? 'Creating...' : 'Create Child'}
	</button>
</form>
