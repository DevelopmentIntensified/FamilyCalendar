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

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun TaskListScreen(
	state: AppUiState,
	onRefresh: () -> Unit,
	onOpenSettings: () -> Unit,
	onToggleComplete: (Task) -> Unit,
	onStartFocus: (Task) -> Unit,
	onStopFocus: () -> Unit,
	onRespond: ((Task, String) -> Unit)? = null,
) {
	Scaffold(
		topBar = {
			TopAppBar(
				title = { Text("Family Planz") },
				actions = {
					TextButton(onClick = onStopFocus) { Text("Stop focus") }
					IconButton(onClick = onOpenSettings) {
						Icon(Icons.Filled.Settings, contentDescription = "Settings")
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

				is AppUiState.Ready -> if (state.tasks.isEmpty()) {
					EmptyTasks()
				} else {
					TaskRows(state, onToggleComplete, onStartFocus, onRespond)
				}

				is AppUiState.Failed -> Column(
					modifier = Modifier.fillMaxSize().padding(24.dp),
					verticalArrangement = Arrangement.Center,
					horizontalAlignment = Alignment.CenterHorizontally,
				) {
					Text(state.reason, style = MaterialTheme.typography.bodyMedium)
					Button(onClick = onRefresh) { Text("Retry") }
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
			"Add tasks in the web app; they appear here once you sync.",
			style = MaterialTheme.typography.bodyMedium,
		)
	}
}

@Composable
private fun TaskRows(
	state: AppUiState.Ready,
	onToggleComplete: (Task) -> Unit,
	onStartFocus: (Task) -> Unit,
	onRespond: ((Task, String) -> Unit)?,
) {
	LazyColumn {
		items(state.tasks, key = { it.id }) { task ->
			TaskRow(state.meId, task, onToggleComplete, onStartFocus, onRespond)
			HorizontalDivider()
		}
	}
}

@Composable
fun TaskRow(
	meId: String?,
	task: Task,
	onToggleComplete: (Task) -> Unit,
	onStartFocus: (Task) -> Unit,
	onRespond: ((Task, String) -> Unit)?,
) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
		Row(verticalAlignment = Alignment.CenterVertically) {
			Checkbox(
				checked = task.completed,
				onCheckedChange = { onToggleComplete(task) },
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
				Text(
					taskMeta(task),
					style = MaterialTheme.typography.bodySmall,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
				)
			}
			if (!task.completed) {
				TextButton(onClick = { onStartFocus(task) }) { Text("Focus") }
			}
		}
		if (meId != null && task.assignmentStatus == "pending" && task.assignedTo == meId && onRespond != null) {
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

internal fun taskMeta(task: Task): String =
	buildList {
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
		task.focusMinutes?.let { add("${it}m focus") }
	}.joinToString(" · ")
