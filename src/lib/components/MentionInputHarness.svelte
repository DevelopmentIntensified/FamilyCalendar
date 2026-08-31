<script lang="ts">
	import MentionInput from './MentionInput.svelte';
	import type { TaskQuickAddMember } from '$lib/utils/taskQuickAdd';

	export let members: TaskQuickAddMember[];
	export let title = '';
</script>

<MentionInput
	bind:value={title}
	{members}
	placeholder="Add a task..."
	aria-label="Quick add"
	class="harness-input"
/>
<p class="title-probe">{title}</p>
