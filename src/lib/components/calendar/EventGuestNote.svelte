<script lang="ts">
	/**
	 * `event.html`'s "Guests are strings" card, kept because the attendance list
	 * marks every guest "guest — not a user" and this is the sentence behind
	 * that label: `eventAttendance.user_id` is nullable and `name` is the
	 * fallback, so a guest is an attendance row rather than an account.
	 */
	interface Props {
		/** Guests on this event, counted in the card's opening line. */
		guestCount: number;
	}

	let { guestCount }: Props = $props();
</script>

<section
	aria-label="Guests are strings"
	class="border-t border-slate-100 bg-gradient-to-br from-primary-50/60 to-white px-4 py-4 sm:px-6"
>
	<h3 class="mb-1.5 text-sm font-semibold text-slate-700">Guests are strings</h3>
	<p class="text-xs leading-relaxed text-slate-500">
		<code class="text-[11px]">eventAttendance.user_id</code> is nullable, and
		<code class="text-[11px]">name</code> is the fallback.
	</p>
	<p class="mt-1.5 text-xs leading-relaxed text-slate-500" data-testid="guest-count">
		{guestCount === 0
			? 'Nobody on this event is a guest right now.'
			: `${guestCount} ${guestCount === 1 ? 'person on this event is' : 'people on this event are'} a guest — an attendance row with no account behind it.`}
	</p>
	<p class="mt-1.5 text-xs leading-relaxed text-slate-500">
		Guests cannot be assigned a task, cannot be reminded individually, and do not follow the event to a
		mirrored calendar.
	</p>
</section>