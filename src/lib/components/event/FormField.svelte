<script lang="ts">
	let {
		field = { value: '', detected: false, userEdited: false, visible: false },
		label = '',
		type = 'text',
		placeholder = '',
		required = false,
		detected = false,
		onChange = () => {},
		onToggle = () => {},
		bindValue = $bindable(''),
		...rest
	}: {
		field: { value: string; detected: boolean; userEdited: boolean; visible: boolean };
		label?: string;
		type?: string;
		placeholder?: string;
		required?: boolean;
		detected?: boolean;
		onChange?: () => void;
		onToggle?: () => void;
		bindValue?: string;
	} = $props();
</script>

<div class="relative" class:hidden={!field.visible && !field.userEdited}>
	<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
		<span>{label || 'Field'}</span>
		{#if field.detected || detected}
			<span class="text-green-600 text-xs">✓ detected</span>
		{/if}
		{#if onToggle}
			<button type="button" onclick={onToggle} class="text-slate-400 hover:text-slate-600" aria-label="Toggle {label} field">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				</svg>
			</button>
		{/if}
	</label>
	<input
		type={type || 'text'}
		bind:value={bindValue}
		oninput={onChange}
		placeholder={placeholder}
		{required}
		class="w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:border-primary-500 focus:outline-none {field.detected || detected ? 'border-green-300 bg-green-50' : ''}"
		{...rest}
	/>
</div>
