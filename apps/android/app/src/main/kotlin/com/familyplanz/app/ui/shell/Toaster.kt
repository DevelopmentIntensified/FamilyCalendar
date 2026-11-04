package com.familyplanz.app.ui.shell

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.clickable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.familyplanz.app.R
import com.familyplanz.app.ui.theme.FpElevation
import com.familyplanz.app.ui.theme.FpMotion
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** One toast (`toasts.ts` Toast): a message and an optional action such as "Undo". */
data class FpToastItem(
	val id: Long,
	val message: String,
	val actionLabel: String? = null,
	val onAction: (() -> Unit)? = null,
)

/**
 * `src/lib/client/toasts.ts`: a push keeps the last three and appends, so at
 * most [FpMotion.TOAST_STACK] show; each leaves after [FpMotion.TOAST_MS]
 * (the timer runs in [FpToaster], so it follows the UI clock).
 */
class ToastQueue {
	private val _toasts = MutableStateFlow<List<FpToastItem>>(emptyList())
	val toasts: StateFlow<List<FpToastItem>> = _toasts
	private var nextId = 1L

	fun push(message: String, actionLabel: String? = null, onAction: (() -> Unit)? = null): Long {
		val id = nextId++
		_toasts.update { it.takeLast(FpMotion.TOAST_STACK - 1) + FpToastItem(id, message, actionLabel, onAction) }
		return id
	}

	fun dismiss(id: Long) {
		_toasts.update { list -> list.filterNot { it.id == id } }
	}

	/** Toaster.svelte `run`: the action, then the toast goes. */
	fun runAction(id: Long) {
		_toasts.value.firstOrNull { it.id == id }?.onAction?.invoke()
		dismiss(id)
	}

	fun clear() {
		_toasts.value = emptyList()
	}
}

const val TOASTER_TAG = "toaster"
const val TOAST_DISMISS_LABEL = "Dismiss notification"

/**
 * Toaster.svelte: the region sits `bottom-20` (80 dp) above the bottom safe
 * area, clear of the 52 dp tab bar; `px-4`, gap 8, toasts max 384 dp wide.
 * Place it as an overlay aligned to the bottom of the signed-in area.
 */
@Composable
fun FpToaster(queue: ToastQueue, modifier: Modifier = Modifier) {
	val toasts by queue.toasts.collectAsStateWithLifecycle()
	if (toasts.isEmpty()) return
	Column(
		modifier = modifier
			.fillMaxWidth()
			.windowInsetsPadding(WindowInsets.navigationBars)
			.padding(start = 16.dp, end = 16.dp, bottom = 80.dp)
			.testTag(TOASTER_TAG)
			.semantics { paneTitle = "Notifications" },
		verticalArrangement = Arrangement.spacedBy(8.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		toasts.forEach { toast ->
			key(toast.id) {
				LaunchedEffect(toast.id) {
					delay(FpMotion.TOAST_MS)
					queue.dismiss(toast.id)
				}
				FpToast(toast, onAction = { queue.runAction(toast.id) }, onDismiss = { queue.dismiss(toast.id) })
			}
		}
	}
}

/**
 * One toast card: white, slate-200 border, rounded-xl, shadow-lg, `px-4 py-3`
 * 14 sp slate-800; action `text-xs font-semibold text-primary-600 px-2.5 py-1
 * rounded-lg`; a 14 dp slate-300 ✕ "Dismiss notification".
 */
@Composable
fun FpToast(toast: FpToastItem, onAction: () -> Unit, onDismiss: () -> Unit) {
	val colors = FpTheme.colors
	Surface(
		modifier = Modifier.widthIn(max = 384.dp).fillMaxWidth().testTag("toast-${toast.id}")
			.semantics { liveRegion = LiveRegionMode.Polite },
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
		shadowElevation = FpElevation.Lg,
	) {
		Row(
			modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(12.dp),
		) {
			Text(
				toast.message,
				style = MaterialTheme.typography.bodyMedium,
				color = colors.toastText,
				modifier = Modifier.weight(1f).padding(vertical = 8.dp),
			)
			toast.actionLabel?.let { label ->
				Text(
					label,
					style = MaterialTheme.typography.bodySmall,
					fontWeight = FontWeight.SemiBold,
					color = MaterialTheme.colorScheme.primary,
					modifier = Modifier
						.minimumInteractiveComponentSize()
						.clip(MaterialTheme.shapes.small)
						.clickable(role = Role.Button, onClick = onAction)
						.padding(horizontal = 10.dp, vertical = 4.dp),
				)
			}
			Icon(
				painterResource(R.drawable.ic_fp_close),
				contentDescription = TOAST_DISMISS_LABEL,
				tint = colors.toastDismiss,
				modifier = Modifier
					.minimumInteractiveComponentSize()
					.clip(FpShape.Pill)
					.clickable(role = Role.Button, onClick = onDismiss)
					.padding(4.dp)
					.size(14.dp),
			)
		}
	}
}
