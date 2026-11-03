package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.domain.isFocusing
import java.time.Instant
import java.time.LocalDate

@Composable
fun TaskListScreen(
	state: AppUiState,
	actions: TaskActions,
	categories: List<String> = emptyList(),
	focusPending: FocusPending? = null,
) {
	Column(modifier = Modifier.fillMaxSize()) {
		FpHeader("Family Planz") {
			TextButton(onClick = actions.onStopFocus, enabled = focusPending == null) { Text("Stop focus") }
			IconButton(onClick = actions.onOpenSettings) {
				Icon(Icons.Filled.Settings, contentDescription = "Sign out", tint = MaterialTheme.colorScheme.onSurfaceVariant)
			}
		}
		Box(modifier = Modifier.fillMaxSize()) {
			when (state) {
				AppUiState.Loading -> LinearProgressIndicator(
					modifier = Modifier.fillMaxWidth().padding(16.dp),
				)

				is AppUiState.Ready -> Column {
					actions.onCreate?.let { AddTaskBar(error = state.createError, categories = categories, onCreate = it) }
					state.tasks.firstOrNull(::isFocusing)?.let { FocusingNowNote(it.title) }
					if (state.tasks.isEmpty()) {
						EmptyTasks()
					} else {
						TaskRows(state, actions, focusPending)
					}
				}

				is AppUiState.Failed -> Column(
					modifier = Modifier.fillMaxSize().padding(24.dp),
					verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
					horizontalAlignment = Alignment.CenterHorizontally,
				) {
					Text(state.reason, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
					FpPrimaryButton(onClick = actions.onRefresh) { Text("Retry") }
				}

				is AppUiState.NeedToken -> {}
			}
		}
	}
}

/** calendar/EmptyState.svelte: primary-50 wash, rounded-2xl, bold slate-800 title + slate-500 hint. */
@Composable
private fun EmptyTasks() {
	FpEmptyState(
		title = "No tasks yet",
		hint = "Add one above, or in the web app; it appears here once you sync.",
	)
}

@Composable
private fun TaskRows(
	state: AppUiState.Ready,
	actions: TaskActions,
	focusPending: FocusPending?,
) {
	val now = rememberFocusNow(ticking = state.tasks.any(::isFocusing), tasks = state.tasks)
	LazyColumn(
		contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
		verticalArrangement = Arrangement.spacedBy(6.dp),
	) {
		items(state.tasks, key = { it.id }) { task ->
			TaskRow(state.meId, task, actions, now, focusPending)
		}
	}
}

@Composable
fun TaskRow(
	meId: String?,
	task: Task,
	actions: TaskActions,
	now: Instant = Instant.now(),
	focusPending: FocusPending? = null,
) {
	val onRespond = actions.onRespond
	val late = !task.completed && dueTone(task.dueDate, LocalDate.now()) == DueTone.OVERDUE
	TaskRowSurface(late = late) {
		Column(modifier = Modifier.fillMaxWidth().padding(end = 4.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically) {
				TaskCheck(checked = task.completed, enabled = !task.pending) { actions.onToggleComplete(task) }
				Column(modifier = Modifier.weight(1f).padding(vertical = 8.dp)) {
					Text(
						task.title,
						style = MaterialTheme.typography.bodyMedium,
						fontWeight = FontWeight.Medium,
						color = if (task.completed) FpTheme.colors.textMuted else FpTheme.colors.textStrong,
						textDecoration = if (task.completed) TextDecoration.LineThrough else null,
					)
					TaskMetaLine(task, now)
				}
				if (!task.completed && !task.pending) {
					FocusAction(task, focusPending, actions.onStartFocus, actions.onStopFocus)
				}
			}
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
		if (isFocusing(task)) FocusChip()
		task.category?.let { CategoryChip(it) }
	}
}

/** Pending assignment addressed to the signed-in member. */
internal fun awaitsMyReply(meId: String?, task: Task): Boolean =
	meId != null && task.assignmentStatus == "pending" && task.assignedTo == meId

/** EmptyState.svelte, shared by the Tasks and Calendar tabs. */
@Composable
internal fun FpEmptyState(title: String, hint: String) {
	Box(modifier = Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
		Surface(
			shape = MaterialTheme.shapes.large,
			color = MaterialTheme.colorScheme.primaryContainer,
			modifier = Modifier.fillMaxWidth(),
		) {
			Column(
				modifier = Modifier.padding(horizontal = 24.dp, vertical = 32.dp),
				horizontalAlignment = Alignment.CenterHorizontally,
				verticalArrangement = Arrangement.spacedBy(4.dp),
			) {
				Text(
					title,
					style = MaterialTheme.typography.titleMedium,
					fontWeight = FontWeight.Bold,
					color = FpTheme.colors.textStrong,
				)
				Text(
					hint,
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
					textAlign = TextAlign.Center,
				)
			}
		}
	}
}
