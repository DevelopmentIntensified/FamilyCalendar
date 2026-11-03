package com.familyplanz.app.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.isFocusing
import com.familyplanz.app.ui.theme.FpTheme
import kotlinx.coroutines.delay
import java.time.Instant

/*
 * TaskFocus focus on the Tasks tab (#290), in FamilyPlanz's own look: every
 * color, shape and type size comes from MaterialTheme, so a row restyle
 * carries these pieces with it.
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

/** "Focusing" label on the running task's row: the web pill (#291), in the theme's focus tone. */
@Composable
fun FocusChip() {
	FpChip("Focusing", FpTheme.colors.focus, Modifier.testTag("focusing-chip"), bold = true)
}

/**
 * The row's focus control: "Focus" asks the desktop to start this task,
 * "Stop" (on the running task) asks it to stop. While any focus command is in
 * flight the control reads "Asking…" on the affected row and every focus
 * control is disabled.
 */
@Composable
fun FocusAction(task: Task, pending: FocusPending?, onStart: (Task) -> Unit, onStop: () -> Unit) {
	val focusing = isFocusing(task)
	val asking = when (pending) {
		is FocusPending.Start -> pending.taskId == task.id
		FocusPending.Stop -> focusing
		null -> false
	}
	TextButton(
		onClick = { if (focusing) onStop() else onStart(task) },
		enabled = pending == null,
	) {
		Text(
			when {
				asking -> "Asking…"
				focusing -> "Stop"
				else -> "Focus"
			},
		)
	}
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

/** Spacing derived from the theme's label size, so no fixed dp lives here. */
@Composable
private fun typeInset(): Dp = with(LocalDensity.current) { MaterialTheme.typography.labelSmall.fontSize.toDp() } * 0.75f
