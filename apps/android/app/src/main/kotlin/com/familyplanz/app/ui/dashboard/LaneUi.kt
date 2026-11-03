package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.FpToast
import com.familyplanz.app.ui.theme.Slate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/*
 * Lane 4's local stand-ins for L1 shell pieces that have not landed yet.
 * PLUG-IN: when L1's FpToast host (6 s, stack 4, action) ships, [LaneToasts]
 * forwards to it and this host goes away.
 */

/** Tailwind `border-dashed`: a 1 dp dashed rounded outline (empty-state boxes). */
fun Modifier.dashedBorder(color: Color = Slate.S200, radius: Dp = 8.dp): Modifier = drawBehind {
	val stroke = 1.dp.toPx()
	drawRoundRect(
		color = color,
		topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2),
		size = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke),
		cornerRadius = CornerRadius(radius.toPx()),
		style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
	)
}

/** A screen-local toast host that carries an action (Undo); `Toaster.svelte` keeps toasts 6 s. */
@Stable
class LaneToasts(private val scope: CoroutineScope) {
	val host = SnackbarHostState()

	fun show(text: String, action: String? = null, onAction: () -> Unit = {}) {
		scope.launch {
			host.currentSnackbarData?.dismiss()
			val result = host.showSnackbar(
				message = text,
				actionLabel = action,
				duration = if (action != null) SnackbarDuration.Long else SnackbarDuration.Short,
			)
			if (result == SnackbarResult.ActionPerformed) onAction()
		}
	}
}

@Composable
fun rememberLaneToasts(): LaneToasts {
	val scope = rememberCoroutineScope()
	return remember(scope) { LaneToasts(scope) }
}

@Composable
fun LaneToastHost(toasts: LaneToasts, modifier: Modifier = Modifier) {
	SnackbarHost(toasts.host, modifier = modifier.testTag("lane-toast")) { FpToast(it) }
}

/** `animate-pulse rounded-2xl bg-slate-100` skeleton blocks, [heights] in dp. */
@Composable
fun SkeletonBlocks(heights: List<Int>, modifier: Modifier = Modifier) {
	Column(modifier.testTag("skeleton"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
		heights.forEach { h ->
			Box(
				Modifier.fillMaxWidth().height(h.dp).clip(MaterialTheme.shapes.large).background(Slate.S100)
					.testTag("skeleton-block"),
			)
		}
	}
}

/** `rounded-lg border-dashed border-slate-200 px-3 py-4` empty box. */
@Composable
fun DashedBox(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	Box(modifier.fillMaxWidth().dashedBorder().padding(horizontal = 12.dp, vertical = 16.dp)) { content() }
}
