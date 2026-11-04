package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import com.familyplanz.app.domain.FocusSource
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.isFocusing
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.theme.FpTheme
import java.time.Instant
import kotlinx.coroutines.delay

/*
 * TaskFocus focus on the Tasks tab (#290, #293), in FamilyPlanz's own look:
 * every color, shape and type size comes from MaterialTheme.
 */

/** Live time re-reads the clock this often while some task is focusing. */
private const val FOCUS_TICK_MS = 30_000L

/** "Now" for live focus time: ticks while [ticking], re-reads whenever [tasks] change. */
@Composable
fun rememberFocusNow(ticking: Boolean, tasks: List<Task>): Instant {
	var now by remember { mutableStateOf(Instant.now()) }
	LaunchedEffect(ticking, tasks) {
		now = Instant.now()
		while (ticking) {
			delay(FOCUS_TICK_MS)
			now = Instant.now()
		}
	}
	return now
}

/**
 * "Focusing (desktop)" / "Focusing (phone)" on the running task's row: one
 * chip, so the phone's own timer and the desktop's are told apart at a glance
 * (#293).
 */
@Composable
fun FocusChip(source: FocusSource) {
	FpChip(
		text = "Focusing (${source.label})",
		tone = FpTheme.colors.focus,
		modifier = Modifier.testTag("focusing-chip"),
		bold = true,
	)
}

/** Subtle "Focusing now: <title>" line above the list while one task runs. */
@Composable
fun FocusingNowNote(title: String) {
	Text(
		"Focusing now: $title",
		style = MaterialTheme.typography.bodySmall,
		color = MaterialTheme.colorScheme.primary,
		maxLines = 1,
		modifier = Modifier.fillMaxWidth().padding(horizontal = typeInset() * 2, vertical = typeInset() / 2),
	)
}

/** Ticking only while something runs: [focusing] comes from the rows. */
internal fun anyFocusing(tasks: List<Task>): Boolean = tasks.any(::isFocusing)

/** Spacing derived from the theme's label size, so no fixed dp lives here. */
@Composable
private fun typeInset(): Dp = with(LocalDensity.current) { MaterialTheme.typography.labelSmall.fontSize.toDp() } * 0.75f
