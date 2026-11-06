package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.focusSource
import com.familyplanz.app.domain.isFocusing
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import java.time.Instant
import java.time.LocalDate

/**
 * `TaskRow.svelte`: the open row (check, title, one clipped meta line,
 * trailing actions) and `TaskCompletedRow.svelte` for finished work.
 * AC-TK-14/15/16/17/18/19/21/26 live here.
 */
@Composable
@Suppress("LongParameterList")
fun TaskRow(
	meId: String?,
	task: Task,
	actions: TaskActions,
	now: Instant = Instant.now(),
	focusPending: FocusPending? = null,
	busy: Boolean = false,
) {
	val late = !task.completed && dueTone(task.dueDate, LocalDate.now()) == DueTone.OVERDUE
	var confirming by remember(task.id) { mutableStateOf(false) }
	TaskRowSurface(late = late, modifier = Modifier.testTag("task-row")) {
		Column(modifier = Modifier.fillMaxWidth().padding(end = 4.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically) {
				TaskCheck(checked = task.completed, enabled = !task.pending && !busy) { actions.onToggleComplete(task) }
				Column(modifier = Modifier.weight(1f).padding(vertical = 8.dp)) {
					RowTitle(task, actions)
					TaskMetaLine(task, now)
				}
				if (!task.pending) Trailing(task, actions, focusPending, busy) { confirming = true }
			}
			if (confirming) {
				InlineDeleteConfirm(
					onYes = {
						confirming = false
						actions.onDelete?.invoke(task)
					},
					onNo = { confirming = false },
				)
			}
			val onRespond = actions.onRespond
			if (onRespond != null && awaitsMyReply(meId, task)) {
				Row(
					horizontalArrangement = Arrangement.spacedBy(8.dp),
					modifier = Modifier.padding(start = 40.dp, bottom = 8.dp),
				) {
					ReplyButton("Accept", FpTheme.colors.accept) { onRespond(task, "accepted") }
					ReplyButton("Decline", FpTheme.colors.decline) { onRespond(task, "declined") }
				}
			}
		}
	}
}

/** The completed row: filled check, struck-through title, its own trash (AC-TK-17). */
@Composable
fun TaskCompletedRow(
	task: Task,
	actions: TaskActions,
	now: Instant = Instant.now(),
	busy: Boolean = false,
) {
	var confirming by remember(task.id) { mutableStateOf(false) }
	TaskRowSurface(late = false, modifier = Modifier.testTag("task-row-done")) {
		Column(modifier = Modifier.fillMaxWidth().padding(end = 4.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically) {
				TaskCheck(checked = true, enabled = !busy) { actions.onToggleComplete(task) }
				Column(modifier = Modifier.weight(1f).padding(vertical = 8.dp)) {
					Text(
						task.title,
						style = MaterialTheme.typography.bodyMedium,
						color = FpTheme.colors.textMuted,
						textDecoration = TextDecoration.LineThrough,
						maxLines = 1,
						overflow = TextOverflow.Ellipsis,
					)
					TaskMetaLine(task, now)
				}
				if (actions.onDelete != null) {
					IconButton(onClick = { confirming = true }, modifier = Modifier.testTag("task-delete")) {
						Icon(Icons.Filled.Delete, contentDescription = "Delete task", tint = FpTheme.colors.textMuted)
					}
				}
			}
			if (confirming) {
				InlineDeleteConfirm(
					onYes = {
						confirming = false
						actions.onDelete?.invoke(task)
					},
					onNo = { confirming = false },
				)
			}
		}
	}
}

@Composable
private fun RowTitle(task: Task, actions: TaskActions) {
	val onEdit = actions.onEdit
	Text(
		task.title,
		style = MaterialTheme.typography.bodyMedium,
		fontWeight = FontWeight.Medium,
		color = if (task.completed) FpTheme.colors.textMuted else FpTheme.colors.textStrong,
		maxLines = 1,
		overflow = TextOverflow.Ellipsis,
		modifier = Modifier
			.fillMaxWidth()
			.then(if (onEdit != null && !task.pending) Modifier.clickable { onEdit(task) } else Modifier)
			.testTag("task-title"),
	)
}

/** Trailing area: the assignee pill, Skip (recurring), Focus and the trash (AC-TK-18/19/26). */
@Composable
private fun Trailing(
	task: Task,
	actions: TaskActions,
	focusPending: FocusPending?,
	busy: Boolean,
	onAskDelete: () -> Unit,
) {
	Row(verticalAlignment = Alignment.CenterVertically) {
		if (task.isRecurring && !task.completed && actions.onSkip != null) {
			TextButton(onClick = { actions.onSkip.invoke(task) }, enabled = !busy) { Text("Skip") }
		}
		if (!task.completed && !task.pending) {
			FocusAction(task, focusPending, actions.onStartFocus) { actions.onStopFocus(task) }
			actions.onStartFocusDesktop?.let { onDesktop ->
				TextButton(
					onClick = { onDesktop(task) },
					enabled = focusPending == null,
				) { Text("Focus on desktop") }
			}
		}
		if (actions.onDelete != null) {
			IconButton(onClick = onAskDelete, enabled = !busy, modifier = Modifier.testTag("task-delete")) {
				Icon(Icons.Filled.Delete, contentDescription = "Delete task", tint = FpTheme.colors.textMuted)
			}
		}
	}
}

/** "Delete?" Yes / No, inline under the row (AC-TK-18). */
@Composable
private fun InlineDeleteConfirm(onYes: () -> Unit, onNo: () -> Unit) {
	Row(
		modifier = Modifier.padding(start = 40.dp, bottom = 8.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(4.dp),
	) {
		Text("Delete?", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textBody)
		TextButton(onClick = onYes, modifier = Modifier.testTag("task-delete-yes")) { Text("Yes") }
		TextButton(onClick = onNo, modifier = Modifier.testTag("task-delete-no")) { Text("No") }
	}
}

/** TaskRow's labelled Accept / Decline: emerald-100 / red-100 pills, semibold xs. */
@Composable
private fun ReplyButton(label: String, tone: ChipTone, onClick: () -> Unit) {
	TextButton(
		onClick = onClick,
		shape = FpShape.Pill,
		colors = ButtonDefaults.textButtonColors(containerColor = tone.container, contentColor = tone.content),
		contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
	) { Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold) }
}

/** Meta slots led by the Focusing chip (#290) and the category chip (#280) when present. */
@Composable
private fun TaskMetaLine(task: Task, now: Instant) {
	TaskMetaSlots(task, now) {
		focusSource(task)?.let { source -> FocusChip(source) }
		task.category?.let { CategoryChip(it) }
	}
}

/** Pending assignment addressed to the signed-in member. */
internal fun awaitsMyReply(meId: String?, task: Task): Boolean =
	meId != null && task.assignmentStatus == "pending" && task.assignedTo == meId

/** The row's focus control (#293): "Focus here" starts a phone session, "Stop" ends whatever runs. */
@Composable
private fun FocusAction(task: Task, pending: FocusPending?, onStart: (Task) -> Unit, onStop: () -> Unit) {
	val focusing = isFocusing(task)
	val asking = when (pending) {
		is FocusPending.Start -> pending.taskId == task.id
		FocusPending.Stop -> focusing
		null -> false
	}
	TextButton(onClick = { if (focusing) onStop() else onStart(task) }, enabled = pending == null) {
		Text(
			when {
				asking -> "Asking…"
				focusing -> "Stop"
				else -> "Focus here"
			},
		)
	}
}

