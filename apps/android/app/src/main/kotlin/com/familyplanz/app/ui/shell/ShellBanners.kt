package com.familyplanz.app.ui.shell

import com.familyplanz.app.ui.nav.AppRoute
import java.time.Duration
import java.time.Instant
import kotlin.math.ceil

/** `OfflineBanner.svelte:65-69`, verbatim. */
const val OFFLINE_TEXT = "You're offline — showing your recent events and tasks (this month, last month, next month). " +
	"Months or tasks you haven't visited recently aren't available offline. " +
	"Changes you make now will sync automatically when you're back online."

private fun changes(n: Int) = if (n == 1) "change" else "changes"

/** `OfflineBanner.svelte:71-74`. */
fun pendingText(n: Int) = "$n ${changes(n)} waiting to sync."

/** `OfflineBanner.svelte:76-79`. */
fun syncedText(n: Int) = "Synced $n ${changes(n)}."

/**
 * OfflineBanner's state: offline, writes waiting, or the "Synced N" notice
 * that follows a flush. [onPending] going N → 0 while online announces N
 * (the caller clears it after [com.familyplanz.app.ui.theme.FpMotion.SYNCED_MS]).
 */
data class OfflineBannerState(val online: Boolean = true, val pending: Int = 0, val synced: Int? = null) {
	val visible: Boolean get() = !online || pending > 0 || synced != null

	fun onOnline(value: Boolean): OfflineBannerState =
		if (value) copy(online = true) else copy(online = false, synced = null)

	fun onPending(count: Int): OfflineBannerState {
		val announce = online && pending > 0 && count == 0
		return copy(pending = count, synced = if (announce) pending else synced)
	}

	fun syncedShown(): OfflineBannerState = copy(synced = null)
}

/** Web `INACTIVITY_WINDOW_DAYS` (`calendar/+layout.svelte:50`). */
const val INACTIVITY_WINDOW_DAYS = 90

/** Red variant at or under this many days (`calendar/+layout.svelte:57`). */
const val URGENT_DAYS = 14

/** `daysRemaining`: 90 − days since `lastActiveAt`, rounded up, never below 0; no date → 90. */
fun guestDaysLeft(lastActiveAt: String?, now: Instant): Int {
	val last = lastActiveAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return INACTIVITY_WINDOW_DAYS
	val elapsedDays = Duration.between(last, now).toMillis() / MILLIS_PER_DAY
	return maxOf(0, ceil(INACTIVITY_WINDOW_DAYS - elapsedDays).toInt())
}

private const val MILLIS_PER_DAY = 24.0 * 60 * 60 * 1000

/** The one account notice the calendar group shows (`calendar/+layout.svelte:149-263`). */
sealed interface AccountBanner {
	/** Registered but `emailVerified == false`. */
	data object Verify : AccountBanner

	/** Anonymous account; [urgent] = red variant. */
	data class Guest(val daysLeft: Int) : AccountBanner {
		val urgent: Boolean get() = daysLeft <= URGENT_DAYS
	}
}

/**
 * Precedence claimed → verify → merged → guest. Claimed and merged follow
 * web-only flows (query params after `/claim`), so the app shows them only
 * once G13 lands; here: verify, else guest, else nothing.
 */
fun accountBanner(me: ShellMeDto?, now: Instant, verifyDismissed: Boolean): AccountBanner? {
	if (me == null) return null
	val anonymous = me.isAnonymous == true
	return when {
		!anonymous && me.emailVerified == false && !verifyDismissed -> AccountBanner.Verify
		anonymous -> AccountBanner.Guest(guestDaysLeft(me.lastActiveAt, now))
		else -> null
	}
}

/** Banners render on the `(calendar)` group only — not Family, Account or the menu pages. */
val BANNER_ROUTES: Set<AppRoute> = setOf(
	AppRoute.CALENDAR,
	AppRoute.DASHBOARD,
	AppRoute.TASKS,
	AppRoute.GROCERIES,
	AppRoute.ALERTS,
)

/** Verify-banner copy (`calendar/+layout.svelte:170-226`). */
object VerifyCopy {
	const val PROMPT = "Your email isn't verified yet — enter the code we sent to unlock family features like member search."
	const val FIELD = "Verification code"
	const val VERIFY = "Verify"
	const val VERIFYING = "Verifying…"
	const val RESEND = "Resend"
	const val SENT_AGAIN = "Sent again ✓"
	const val INVALID = "Invalid code"
	const val VERIFY_NETWORK = "Verification failed — check your connection and try again."
	const val RESEND_FAILED = "Couldn't resend the code — try again."
	const val RESEND_NETWORK = "Couldn't resend the code — check your connection."
}

/** Guest-banner copy (`calendar/+layout.svelte:250-262`). The web's ⚠️ is left out (owner content rule: no emoji beyond 👪). */
object GuestCopy {
	const val NORMAL = "You're using a guest calendar — your events can't sync to other devices."
	const val NORMAL_LINK = "Add an email to save them"
	const val NORMAL_HINT = "(deleted after 90 days of inactivity)"
	const val URGENT = "Guest calendar — inactive accounts are deleted after 90 days."
	const val URGENT_LINK = "Save your data with an email"

	fun daysLeft(d: Int) = "$d day${if (d == 1) "" else "s"} left."
}
