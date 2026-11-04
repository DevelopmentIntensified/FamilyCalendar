package com.familyplanz.app.ui.shell

import androidx.compose.animation.core.animate
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.familyplanz.app.ui.theme.FpElevation
import com.familyplanz.app.ui.theme.FpMotion
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.rememberReducedMotion
import kotlin.math.roundToInt

const val SHEET_TAG = "fp-sheet"
const val SHEET_HANDLE_TAG = "fp-sheet-handle"
const val SCRIM_TAG = "fp-scrim"

/** `bottomSheetSwipe.ts` endSwipe: close only past the threshold (strictly greater). */
fun sheetShouldClose(dragPx: Float, thresholdPx: Float): Boolean = dragPx > thresholdPx

/**
 * `bg-black/40` (sheets, modals) or `bg-slate-900/30` (toolbar sheets): a
 * full-size wash that closes on tap. The web's `backdrop-blur-sm` is skipped.
 */
@Composable
fun FpScrim(onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = FpTheme.colors.scrim) {
	Box(
		modifier = modifier
			.fillMaxSize()
			.background(color)
			.testTag(SCRIM_TAG)
			.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick),
	)
}

/**
 * The shared mobile bottom sheet (DayActionSheet / EventModal): a scrim, then
 * a white `rounded-t-2xl shadow-2xl` panel at most 92% tall, with the grab
 * handle (`h-1.5 w-10 bg-slate-200`, `pt-2 pb-1`). Only the handle drags:
 * past [FpMotion.SheetCloseDistance] it closes, otherwise it springs back in
 * 150 ms ease-out. Back and a scrim tap also close. [label] is the sheet's
 * accessible name (the web's `aria-label`).
 */
@Composable
fun FpSheet(
	onDismiss: () -> Unit,
	label: String,
	modifier: Modifier = Modifier,
	scrim: Color = FpTheme.colors.scrim,
	content: @Composable ColumnScope.() -> Unit,
) {
	Dialog(
		onDismissRequest = onDismiss,
		properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
	) {
		// The scrim below is the web's; drop the platform dialog dim.
		(LocalView.current.parent as? DialogWindowProvider)?.window?.setDimAmount(0f)
		FpSheetLayout(onDismiss, label, modifier, scrim, content)
	}
}

/** [FpSheet]'s body without the dialog window, for hosts that overlay in place. */
@Composable
fun FpSheetLayout(
	onDismiss: () -> Unit,
	label: String,
	modifier: Modifier = Modifier,
	scrim: Color = FpTheme.colors.scrim,
	content: @Composable ColumnScope.() -> Unit,
) {
	val density = LocalDensity.current
	val threshold = with(density) { FpMotion.SheetCloseDistance.toPx() }
	var drag by remember { mutableFloatStateOf(0f) }
	val reduced = rememberReducedMotion()
	BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
		val maxSheet = maxHeight * 0.92f
		FpScrim(onClick = onDismiss, color = scrim)
		Column(
			modifier = modifier
				.align(Alignment.BottomCenter)
				.fillMaxWidth()
				.heightIn(max = maxSheet)
				.offset { IntOffset(0, drag.roundToInt()) }
				.shadow(FpElevation.Xxl, FpShape.SheetTop)
				.clip(FpShape.SheetTop)
				.background(MaterialTheme.colorScheme.surface)
				.navigationBarsPadding()
				.testTag(SHEET_TAG)
				.semantics { paneTitle = label },
		) {
			Box(
				modifier = Modifier
					.fillMaxWidth()
					.testTag(SHEET_HANDLE_TAG)
					.semantics { contentDescription = "Drag down to close" }
					.draggable(
						orientation = Orientation.Vertical,
						state = rememberDraggableState { delta -> drag = (drag + delta).coerceAtLeast(0f) },
						onDragStopped = {
							if (sheetShouldClose(drag, threshold)) {
								onDismiss()
							} else {
								animate(drag, 0f, animationSpec = FpMotion.releaseSpec(reduced)) { value, _ -> drag = value }
							}
						},
					)
					.padding(top = 8.dp, bottom = 4.dp),
				contentAlignment = Alignment.Center,
			) {
				Box(Modifier.size(width = 40.dp, height = 6.dp).clip(FpShape.Pill).background(FpTheme.colors.sheetHandle))
			}
			content()
		}
	}
}
