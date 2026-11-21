<!--
	`/privacy` — static prose: what we store, the children's-data paragraph, what
	we never do, the services table, deletion and guest calendars, and the
	contact CTA. Copy is the legacy page's, verbatim, including the "Last updated:
	October 2026" line.
-->
<script lang="ts">
	import { pageTitle } from '../marketing.seo.rules';

	const services = [
		{
			name: 'Cerebras',
			sees: 'The exact text you type into quick-add',
			why: 'Parsing your words into events. You can turn this off with the cloud-AI setting on the account page.'
		},
		{ name: 'Resend', sees: 'Your name and email address', why: 'Sending sign-in links and password resets.' },
		{ name: 'Vercel', sees: 'Hosting, technical logs, and ad images you upload', why: 'Running the site.' },
		{
			name: 'Neon',
			sees: 'Your app data',
			why: 'The database that stores your calendars and tasks.'
		},
		{
			name: 'OpenStreetMap Nominatim',
			sees: 'Location search strings',
			why: 'Turning a place name into a map location.'
		},
		{
			name: 'Crossway (ESV Bible)',
			sees: 'Nothing about you',
			why: 'Fetching public Bible verse text for the verse feature.'
		}
	];
</script>

<svelte:head>
	<title>{pageTitle('/privacy')}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Privacy Policy</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				How we handle your family's data — in plain language.
			</p>
			<p class="mt-2 text-sm text-slate-500">Last updated: October 2026</p>
		</div>

		<div class="mb-8 rounded-2xl bg-white p-8 shadow-sm">
			<h2 class="mb-4 text-2xl font-bold text-slate-900">What we store</h2>
			<p class="text-slate-600">
				Family Planz stores only what is needed to run your calendar: your account information (name and
				email address), the calendars, events, and tasks you create, and attendance responses for shared
				events. We don't collect anything beyond that.
			</p>
		</div>

		<div class="mb-8 rounded-2xl bg-white p-8 shadow-sm">
			<h2 class="mb-4 text-2xl font-bold text-slate-900">Children's data</h2>
			<p class="text-slate-600">
				A child account is created and controlled by a parent or guardian — a child cannot create one
				themselves. When a parent adds a child, we store the child's name, their email address (used to
				sign in), and the family calendar content the parent shares with them, just like any other family
				member. The parent who creates the account must confirm they consent to it, and we keep a record
				of that consent, with who gave it and when. A parent can remove a child account from the family at
				any time.
			</p>
		</div>

		<div class="mb-8 rounded-2xl bg-white p-8 shadow-sm">
			<h2 class="mb-4 text-2xl font-bold text-slate-900">What we never do</h2>
			<p class="text-slate-600">
				We never sell your personal data. We never share your information with advertisers beyond the
				ad-consent settings you control on the account page. Your family's schedule belongs to your
				family.
			</p>
		</div>

		<div class="mb-8 rounded-2xl bg-white p-8 shadow-sm">
			<h2 class="mb-4 text-2xl font-bold text-slate-900">Services we use</h2>
			<p class="mb-4 text-slate-600">
				Some everyday features rely on trusted services. Each one only sees the minimum it needs, and none
				of them use your data for advertising or training.
			</p>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm text-slate-600">
					<thead class="text-xs font-semibold uppercase text-slate-500">
						<tr>
							<th class="py-2 pr-4">Service</th>
							<th class="py-2 pr-4">What it sees</th>
							<th class="py-2">Why</th>
						</tr>
					</thead>
					<tbody class="align-top">
						{#each services as service (service.name)}
							<tr class="border-t border-slate-100">
								<td class="py-3 pr-4 font-medium text-slate-800">{service.name}</td>
								<td class="py-3 pr-4">{service.sees}</td>
								<td class="py-3">{service.why}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<div class="mb-16 grid gap-8 md:grid-cols-2">
			<div class="rounded-2xl bg-white p-8 shadow-sm">
				<h2 class="mb-4 text-2xl font-bold text-slate-900">Data deletion</h2>
				<p class="text-slate-600">
					Deleting your account removes your data. You can do this any time from the Danger Zone in your
					account settings, and the deletion is permanent.
				</p>
			</div>
			<div class="rounded-2xl bg-white p-8 shadow-sm">
				<h2 class="mb-4 text-2xl font-bold text-slate-900">Guest calendars</h2>
				<p class="text-slate-600">
					Calendars created without an account are temporary by design. Guest calendars are
					automatically deleted after 90 days of inactivity.
				</p>
			</div>
		</div>

		<div class="rounded-2xl bg-slate-900 p-8 text-center md:p-12">
			<h2 class="mb-4 text-2xl font-bold text-white">Questions about your data?</h2>
			<p class="mx-auto mb-6 max-w-2xl text-slate-400">
				If anything here is unclear or you'd like something removed, get in touch.
			</p>
			<a
				href="mailto:hello@familyplanz.com"
				class="inline-block rounded-full bg-primary-600 px-8 py-3 font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700"
			>
				hello@familyplanz.com
			</a>
		</div>
	</div>
</div>
