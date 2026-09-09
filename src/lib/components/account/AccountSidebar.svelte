<script lang="ts">
	interface Props {
		activeSection: string;
	}

	let { activeSection }: Props = $props();

	const sections = [
		{
			id: 'profile',
			label: 'Profile',
			icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
		},
		{
			id: 'calendar',
			label: 'Calendar',
			icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
		},
		{
			id: 'subscription',
			label: 'Subscription',
			icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
		},
		{
			id: 'email',
			label: 'Email',
			icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
		},
		{
			id: 'security',
			label: 'Security',
			icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
		},
		{
			id: 'danger',
			label: 'Danger Zone',
			icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
		}
	];
</script>

<nav class="w-full border-b border-slate-200 p-4 lg:w-64 lg:border-b-0 lg:border-r">
	<ul class="space-y-1">
		{#each sections as section}
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
							d={section.icon}
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
