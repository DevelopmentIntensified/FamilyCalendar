<script lang="ts">
	export let currentPlan: 'cal_master' | 'family_master' | 'free' = 'free';
	export let disabled = false;

	function handleSelect(plan: typeof currentPlan) {
		currentPlan = plan;
	}
</script>

<div class="rounded-xl border border-slate-200 bg-white p-4">
	<div class="mb-4 text-sm font-medium text-slate-700">Plan Type</div>
	
	<div class="grid gap-3 md:grid-cols-2">
		<button
			type="button"
			on:click={() => handleSelect('cal_master')}
			disabled={disabled}
			class="relative rounded-lg border-2 p-4 text-left transition-all
				{currentPlan === 'cal_master' 
					? 'border-blue-500 bg-blue-50' 
					: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
				}
				{disabled ? 'opacity-50 cursor-not-allowed' : ''}"
		>
			<div class="flex items-start gap-3">
				<div class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current
					{currentPlan === 'cal_master' ? 'border-blue-500 text-blue-500' : 'border-slate-300'}">
					{#if currentPlan === 'cal_master'}
						<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</div>
				<div>
					<div class="font-medium text-slate-900">Cal Master</div>
					<div class="text-sm text-slate-600">Individual calendar plan</div>
				</div>
			</div>
			<div class="mt-2 text-sm text-blue-600 font-medium">
				$5/month or $48/year
			</div>
		</button>

		<button
			type="button"
			on:click={() => handleSelect('family_master')}
			disabled={disabled}
			class="relative rounded-lg border-2 p-4 text-left transition-all
				{currentPlan === 'family_master' 
					? 'border-amber-500 bg-amber-50' 
					: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
				}
				{disabled ? 'opacity-50 cursor-not-allowed' : ''}"
		>
			<div class="flex items-start gap-3">
				<div class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current
					{currentPlan === 'family_master' ? 'border-amber-500 text-amber-500' : 'border-slate-300'}">
					{#if currentPlan === 'family_master'}
						<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</div>
				<div>
					<div class="font-medium text-slate-900">Family Master</div>
					<div class="text-sm text-slate-600">Family calendar with sharing</div>
				</div>
			</div>
			<div class="mt-2 text-sm text-amber-600 font-medium">
				$9/month or $90/year
			</div>
		</button>
	</div>

	{#if currentPlan === 'free'}
		<div class="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
			You're on the Free plan. Upgrade to unlock more features.
			<a href="/pricing" class="ml-1 font-medium text-amber-600 hover:text-amber-700">
				View plans →
			</a>
		</div>
	{/if}
</div>