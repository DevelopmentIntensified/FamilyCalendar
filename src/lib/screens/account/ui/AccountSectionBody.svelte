<!--
	The mounted section's body. Every section component lives behind this one
	file so the /account first paint does not ship all ten (ADR 0010: initial JS
	may only shrink); `AccountScreen` imports this module with `await import()`
	and renders a skeleton until the chunk lands.

	The switch reads the model's own `section` tag, so a body and its model
	cannot disagree.
-->
<script lang="ts">
	import type { AccountActionForm } from '../account.form.rules';
	import type { AccountSectionModel } from '../account.contract';
	import type { AccountFormEnhancer } from '../account.state.svelte';
	import AccountApiTokensSection from './AccountApiTokensSection.svelte';
	import AccountCalendarSection from './AccountCalendarSection.svelte';
	import AccountDangerSection from './AccountDangerSection.svelte';
	import AccountDashboardSection from './AccountDashboardSection.svelte';
	import AccountEmailSection from './AccountEmailSection.svelte';
	import AccountFamiliesSection from './AccountFamiliesSection.svelte';
	import AccountNotificationsSection from './AccountNotificationsSection.svelte';
	import AccountProfileSection from './AccountProfileSection.svelte';
	import AccountSecuritySection from './AccountSecuritySection.svelte';
	import AccountSubscriptionSection from './AccountSubscriptionSection.svelte';

	interface Props {
		model: AccountSectionModel;
		form: AccountActionForm | null;
		/** The page load's instant, for "last used …" and "Resets …". */
		now: Date;
		enhance: AccountFormEnhancer;
		exporting: boolean;
		onExport: () => void;
	}

	let { model, form, now, enhance, exporting, onExport }: Props = $props();
</script>

{#if model.section === 'profile'}
	<AccountProfileSection person={model.person} {enhance} />
{:else if model.section === 'families'}
	<AccountFamiliesSection families={model.families} />
{:else if model.section === 'notifications'}
	<AccountNotificationsSection
		preferences={model.preferences}
		options={model.options}
		{enhance}
	/>
{:else if model.section === 'calendar'}
	<AccountCalendarSection {model} {enhance} />
{:else if model.section === 'dashboard'}
	<AccountDashboardSection {model} {enhance} />
{:else if model.section === 'subscription'}
	<AccountSubscriptionSection {model} {now} />
{:else if model.section === 'email'}
	<AccountEmailSection {model} {enhance} />
{:else if model.section === 'security'}
	<AccountSecuritySection {enhance} />
{:else if model.section === 'api'}
	<AccountApiTokensSection {model} {form} {now} {enhance} />
{:else}
	<AccountDangerSection {model} {exporting} {onExport} {enhance} />
{/if}
