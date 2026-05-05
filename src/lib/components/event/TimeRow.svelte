<script lang="ts">
	let {
		startTime = { value: '', detected: false, userEdited: false, visible: false },
		endTime = { value: '', detected: false, userEdited: false, visible: false },
		allDay = false,
		allFieldsVisible = false,
		onChange = () => {}
	}: {
		startTime: { value: string; detected: boolean; userEdited: boolean; visible: boolean };
		endTime: { value: string; detected: boolean; userEdited: boolean; visible: boolean };
		allDay?: boolean;
		allFieldsVisible?: boolean;
		onChange?: () => void;
	} = $props();
</script>

<div class="grid grid-cols-2 gap-3 pt-1" class:hidden={allDay}>
	<!-- Start Time -->
	<div class="relative" class:hidden={!startTime.visible && !allFieldsVisible}>
		<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
			<span>Start Time</span>
			<button type="button" onclick={() => onChange('startTime')} class="text-slate-400 hover:text-slate-600" aria-label="Toggle start time field">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				</svg>
			</button>
		</label>
		<input 
			type="time" 
			bind:value={startTime.value}
			oninput={() => onChange('startTime')}
			class="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-primary-500 focus:outline-none"
		/>
	</div>
	
	<!-- End Time -->
	<div class="relative pt-1" class:hidden={!endTime.visible && !allFieldsVisible}>
		<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
			<span>End Time</span>
			<button type="button" onclick={() => onChange('endTime')} class="text-slate-400 hover:text-slate-600" aria-label="Toggle end time field">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				</svg>
			</button>
		</label>
		<input 
			type="time" 
			bind:value={endTime.value}
			oninput={() => onChange('endTime')}
			class="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-primary-500 focus:outline-none"
		/>
	</div>
</div>
