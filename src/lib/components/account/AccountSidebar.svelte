<script lang="ts">
	import { ACCOUNT_SECTIONS, type AccountSectionId } from './accountSections';

	interface Identity {
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
	}

	interface Props {
		activeSection: string;
		/** 105: the approved page puts a "Signed in as" card under the section
		 *  nav. Absent renders no card rather than an empty one. */
		user?: Identity | null;
	}

	let { activeSection, user = null }: Props = $props();

	// 105: a name with a trailing space reads as a typo, and an anonymous
	// account has an email of null, so both are assembled rather than printed.
	const displayName = $derived(
		[user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null
	);
	const initial = $derived((displayName?.[0] ?? '?').toUpperCase());

	// The icon per section is presentation; which sections exist is declared
	// once, in accountSections.ts, and shared with the page's own dispatch.
	const icons: Record<AccountSectionId, string> = {
		profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
		families:
			'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
		notifications:
			'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17m5 1v2a2 2 0 002 2 2 2 0 002-2v-2m7-2a2 2 0 11-4 0 2 2 0 014 0z',
		calendar:
			'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
		dashboard:
			'M4 5a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z',
		subscription:
			'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
		email:
			'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
		security:
			'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
		api: 'M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 13a6 6 0 01-6-6H9a6 6 0 01-6-6',
		danger:
			'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
	};
</script>

<!-- The approved page's left column is two stacked cards: the section nav
     and, under it, who you are signed in as. The nav element still wraps the
     section links alone so "nav a" stays the section list. -->
<div class="w-full lg:w-64 lg:border-r lg:border-slate-200">
	<nav class="border-b border-slate-200 p-4">
		<div class="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
			Settings
		</div>
		<ul class="space-y-1">
		{#each ACCOUNT_SECTIONS as section}
			<li>
				<a
					href="#{section.id}"
					class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
						{activeSection === section.id
						? 'bg-primary-50 text-primary-700'
						: section.id === 'danger'
							? 'text-red-600 hover:bg-red-50'
							: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d={icons[section.id]}
						/>
					</svg>
					{section.label}
				</a>
			</li>
		{/each}
		<li class="pt-2">
			<a
				href="/report-bug"
				class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				Report a Bug
			</a>
		</li>
		</ul>
	</nav>

	{#if user}
		<div data-testid="account-identity" class="flex items-center gap-3 p-4">
			<span
				data-testid="account-initial"
				aria-hidden="true"
				class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-100 text-sm font-extrabold text-orange-700"
			>
				{initial}
			</span>
			<span class="min-w-0">
				{#if displayName}
					<span class="block truncate text-sm font-bold text-slate-800">{displayName}</span>
				{/if}
				<span class="block truncate text-xs text-slate-500">{user.email ?? 'No email yet'}</span>
			</span>
		</div>
	{/if}
</div>
