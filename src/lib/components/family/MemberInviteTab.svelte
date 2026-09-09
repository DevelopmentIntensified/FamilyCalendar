<script lang="ts">
	interface Props {
		familyId: string;
		onSuccess: () => void;
		onError: (message: string) => void;
	}

	let { familyId, onSuccess, onError }: Props = $props();

	let inviteEmail = $state('');
	let inviteFirstName = $state('');
	let inviteLastName = $state('');
	let inviting = $state(false);
	let inviteLink = $state('');
	let generatingLink = $state(false);
	let copiedLink = $state(false);
	let copyFailed = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	async function sendInvite() {
		inviting = true;
		try {
			const res = await fetch('/family/' + familyId + '/members/add/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteEmail,
					firstName: inviteFirstName,
					lastName: inviteLastName
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
			inviting = false;
		}
	}

	async function generateInviteLink() {
		generatingLink = true;
		onError('');
		inviteLink = '';
		try {
			const res = await fetch('/family/' + familyId + '/members/add/email/link', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteEmail,
					firstName: inviteFirstName,
					lastName: inviteLastName
				})
			});
			const json = await res.json().catch(() => ({}));
			if (json.error) {
				onError(json.error);
			} else if (json.link) {
				inviteLink = json.link;
			}
		} catch {
			onError('Network problem. Please try again.');
		} finally {
			generatingLink = false;
		}
	}

	async function copyLink() {
		if (!inviteLink) return;
		try {
			await navigator.clipboard.writeText(inviteLink);
			copyFailed = false;
			copiedLink = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copiedLink = false), 2000);
		} catch {
			copiedLink = false;
			copyFailed = true;
		}
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		sendInvite();
	}}
	class="space-y-4"
>
	<div>
		<label for="firstName" class="mb-2 block text-sm font-medium text-slate-700">First Name</label>
		<input
			type="text"
			id="firstName"
			bind:value={inviteFirstName}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div>
		<label for="lastName" class="mb-2 block text-sm font-medium text-slate-700">Last Name</label>
		<input
			type="text"
			id="lastName"
			bind:value={inviteLastName}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div>
		<label for="email" class="mb-2 block text-sm font-medium text-slate-700">Email</label>
		<input
			type="email"
			id="email"
			bind:value={inviteEmail}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div class="flex gap-3">
		<button
			type="submit"
			disabled={inviting}
			class="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{inviting ? 'Sending Invite...' : 'Send Invite'}
		</button>
		<button
			type="button"
			onclick={generateInviteLink}
			disabled={generatingLink || !inviteEmail || !inviteFirstName || !inviteLastName}
			class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
		>
			{generatingLink ? 'Generating...' : 'Get Invite Link'}
		</button>
	</div>
</form>

{#if inviteLink}
	<div class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
		<p class="mb-2 text-sm font-medium text-primary-800">
			Share this link with {inviteFirstName}:
		</p>
		<div class="flex gap-2">
			<input
				type="text"
				readonly
				value={inviteLink}
				class="flex-1 rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs text-slate-700"
			/>
			<button
				onclick={copyLink}
				class="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700"
			>
				{copiedLink ? 'Copied ✓' : 'Copy'}
			</button>
		</div>
		{#if copyFailed}
			<p class="mt-2 text-xs text-red-600">
				Copy failed — select the link above and copy it manually: {inviteLink}
			</p>
		{/if}
		<p class="mt-2 text-xs text-primary-600">Expires in 24 hours</p>
	</div>
{/if}
