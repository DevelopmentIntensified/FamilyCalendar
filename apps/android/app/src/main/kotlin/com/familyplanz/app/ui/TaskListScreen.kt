package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import com.familyplanz.app.domain.isFocusing
import com.familyplanz.app.domain.liveFocusMinutes
import java.time.Instant

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun TaskListScreen(
	state: AppUiState,
	actions: TaskActions,
	categories: List<String> = emptyList(),
	focusPending: FocusPending? = null,
) {
	Scaffold(
		topBar = {
			TopAppBar(
				title = { Text("Family Planz") },
				actions = {
					TextButton(onClick = actions.onStopFocus, enabled = focusPending == null) { Text("Stop focus") }
					IconButton(onClick = actions.onOpenSettings) {
						Icon(Icons.Filled.Settings, contentDescription = "Sign out")
					}
				},
			)
		},
	) { padding ->
		Box(modifier = Modifier.padding(padding).fillMaxSize()) {
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
					verticalArrangement = Arrangement.Center,
					horizontalAlignment = Alignment.CenterHorizontally,
				) {
					Text(state.reason, style = MaterialTheme.typography.bodyMedium)
					Button(onClick = actions.onRefresh) { Text("Retry") }
				}

				is AppUiState.NeedToken -> {}
			}
		}
	}
}

@Composable
private fun EmptyTasks() {
	Column(
		modifier = Modifier.fillMaxSize().padding(24.dp),
		verticalArrangement = Arrangement.Center,
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		Text("No tasks yet", style = MaterialTheme.typography.titleMedium)
		Text(
			"Add one above, or in the web app; it appears here once you sync.",
			style = MaterialTheme.typography.bodyMedium,
		)
	}
}

@Composable
private fun TaskRows(
	state: AppUiState.Ready,
	actions: TaskActions,
	focusPending: FocusPending?,
) {
	val now = rememberFocusNow(ticking = state.tasks.any(::isFocusing), tasks = state.tasks)
	LazyColumn {
		items(state.tasks, key = { it.id }) { task ->
			TaskRow(state.meId, task, actions, now, focusPending)
			HorizontalDivider()
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
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
		Row(verticalAlignment = Alignment.CenterVertically) {
			Checkbox(
				checked = task.completed,
				onCheckedChange = { actions.onToggleComplete(task) },
				enabled = !task.pending,
			)
			Column(modifier = Modifier.weight(1f).padding(vertical = 8.dp)) {
				Text(
					task.title,
					style = MaterialTheme.typography.titleMedium,
					color = if (task.completed) {
						MaterialTheme.colorScheme.onSurfaceVariant
					} else {
						MaterialTheme.colorScheme.onSurface
					},
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
				modifier = Modifier.padding(start = 48.dp, bottom = 8.dp),
			) {
				TextButton(onClick = { onRespond(task, "accepted") }) { Text("Accept") }
				TextButton(onClick = { onRespond(task, "declined") }) { Text("Decline") }
			}
		}
	}
}

/** Meta text plus the category chip (#280) when the task has one. */
@Composable
private fun TaskMetaLine(task: Task, now: Instant) {
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
		if (isFocusing(task)) FocusChip()
		task.category?.let { CategoryChip(it) }
		val meta = taskMeta(task, now)
		if (meta.isNotEmpty() || task.category == null) {
			Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
		}
	}
}

/** Pending assignment addressed to the signed-in member. */
internal fun awaitsMyReply(meId: String?, task: Task): Boolean =
	meId != null && task.assignmentStatus == "pending" && task.assignedTo == meId

internal fun taskMeta(task: Task, now: Instant): String =
	buildList {
		if (task.pending) {
			add("saving…")
		}
		if (task.priority != TaskPriority.NORMAL) {
			add(task.priority.name.lowercase())
		}
		task.dueDate?.let { add("due ${it.take(10)}") }
		if (task.familyTask) {
			add("family")
		}
		task.assignedName?.let { add("→ $it") }
		task.assignmentStatus?.let { add(it) }
		task.recurringLabel?.let { add(it) }
		liveFocusMinutes(task, now)?.let { add("${it}m focus") }
	}.joinToString(" · ")
