package com.familyplanz.app.ui.theme

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/**
 * The website's motion values (spec §1.7). Every duration cites its source;
 * [reducedMotion] mirrors `app.css:13-21` (all animation → ~0) via the
 * system animator scale.
 */
object FpMotion {
	/** `--mp-motion` 150 ms (`theme.css:146`). */
	const val STANDARD_MS = 150

	/** Page fade-in on tab switch (`calendar/+layout.svelte:270`). */
	const val PAGE_FADE_MS = 100

	/** Mobile menu slide (`NavbarMobileMenu.svelte:29`). */
	const val MENU_SLIDE_MS = 200

	/** Bell dropdown slide, banner fade (`NotificationBell.svelte`, `calendar/+layout.svelte:153`). */
	const val BANNER_MS = 150

	/** Sheet release animation, 150 ms ease-out (`DayActionSheet.svelte` drag transition). */
	const val SHEET_RELEASE_MS = 150

	/** Sheet swipe-to-close threshold: drag > 100 px (`bottomSheetSwipe.ts:15`). */
	val SheetCloseDistance = 100.dp

	/** Toast auto-dismiss (`toasts.ts:14`). */
	const val TOAST_MS = 6_000L

	/** Toasts on screen at once (`toasts.ts:18` keeps the last 3, then appends). */
	const val TOAST_STACK = 4

	/** "Sent again ✓" pill (`calendar/+layout.svelte:126`). */
	const val SENT_AGAIN_MS = 3_000L

	/** Offline "Synced N changes" (`OfflineBanner.svelte:73-80`). */
	const val SYNCED_MS = 4_000L

	/** Pending recount after reconnect (`OfflineBanner.svelte:86`). */
	const val RECOUNT_MS = 2_000L

	/** `--mp-ease` cubic-bezier(.4,0,.2,1) == Material FastOutSlowIn. */
	val Ease = FastOutSlowInEasing

	/** `tween(ms, ease)`, or a snap when the user turned animations off. */
	fun <T> spec(ms: Int, reduced: Boolean = false): FiniteAnimationSpec<T> =
		if (reduced) snap() else tween(ms, easing = Ease)

	/** CSS `ease-out` release (sheets). */
	fun <T> releaseSpec(reduced: Boolean = false): FiniteAnimationSpec<T> =
		if (reduced) snap() else tween(SHEET_RELEASE_MS, easing = LinearOutSlowInEasing)

	/** True when the system animator scale is 0 (Developer options / accessibility "remove animations"). */
	fun reducedMotion(context: Context): Boolean =
		Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
}

@Composable
fun rememberReducedMotion(): Boolean {
	val context = LocalContext.current
	return remember(context) { FpMotion.reducedMotion(context) }
}

/**
 * `active:scale-[0.97]` (toolbar), `active:scale-95` (FAB), `[0.98]` (buttons):
 * shrink while [interaction] is pressed. Pass the same source as the clickable.
 */
@Composable
fun Modifier.pressScale(interaction: MutableInteractionSource, pressed: Float = 0.97f): Modifier {
	val isPressed by interaction.collectIsPressedAsState()
	val scale by animateFloatAsState(
		if (isPressed) pressed else 1f,
		FpMotion.spec(FpMotion.STANDARD_MS, rememberReducedMotion()),
		label = "pressScale",
	)
	return graphicsLayer {
		scaleX = scale
		scaleY = scale
	}
}
