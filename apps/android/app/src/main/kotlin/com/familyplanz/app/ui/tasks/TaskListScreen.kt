package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.TaskCategoryDto
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.tasks.TaskClock
import com.familyplanz.app.domain.tasks.emptyState
import com.familyplanz.app.domain.tasks.groupRows
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.theme.FpTheme
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * The Tasks tab (spec 2.4): header card, add card, toolbar with the query,
 * the two bands, the completed footer, the assignments card and the category
 * manager. Every AC-TK rule is visible here or in the row/card composables.
 */
@Composable
fun TaskListScreen(
	state: TasksUiState,
	actions: TaskActions,
	categories: List<String> = emptyList(),
	categoryRows: List<TaskCategoryDto> = emptyList(),
	members: List<com.familyplanz.app.domain.tasks.QuickAddMember> = emptyList(),
	memberNames: Map<String, String> = emptyMap(),
	focusPending: FocusPending? = null,
	now: Instant = Instant.now(),
	onRenameCategory: (TaskCategoryDto, String) -> Unit = { _, _ -> },
	onDeleteCategory: (TaskCategoryDto) -> Unit = {},
	onSaveEdit: (Task, TaskEditForm) -> Unit = { _, _ -> },
	menu: @Composable () -> Unit = {},
) {
	Column(modifier = Modifier.fillMaxSize()) {
		FpHeader("Family Planz") {
			TextButton(onClick = { actions.onStopFocus(null) }, enabled = focusPending == null) { Text("Stop focus") }
			IconButton(onClick = actions.onOpenSettings) {
				Icon(Icons.Filled.Settings, contentDescription = "Sign out", tint = MaterialTheme.colorScheme.onSurfaceVariant)
			}
			menu()
		}
		Box(modifier = Modifier.fillMaxSize()) {
			when (state) {
				TasksUiState.Loading -> LinearProgressIndicator(
					modifier = Modifier.fillMaxWidth().padding(16.dp),
				)

				is TasksUiState.Ready -> TasksContent(
					state = state,
					actions = actions,
					categories = categories,
					categoryRows = categoryRows,
					members = members,
					memberNames = memberNames,
					focusPending = focusPending,
					now = now,
					onRenameCategory = onRenameCategory,
					onDeleteCategory = onDeleteCategory,
					onSaveEdit = onSaveEdit,
				)

				is TasksUiState.Failed -> Column(
					modifier = Modifier.fillMaxSize().padding(24.dp),
					verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
					horizontalAlignment = Alignment.CenterHorizontally,
				) {
					Text(state.reason, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
					FpPrimaryButton(onClick = actions.onRefresh) { Text("Retry") }
				}
			}
		}
	}
}

@Composable
private fun TasksContent(
	state: TasksUiState.Ready,
	actions: TaskActions,
	categories: List<String>,
	categoryRows: List<TaskCategoryDto>,
	members: List<com.familyplanz.app.domain.tasks.QuickAddMember>,
	memberNames: Map<String, String>,
	focusPending: FocusPending?,
	now: Instant,
	onRenameCategory: (TaskCategoryDto, String) -> Unit,
	onDeleteCategory: (TaskCategoryDto) -> Unit,
	onSaveEdit: (Task, TaskEditForm) -> Unit,
) {
	val clock = TaskClock(now, java.time.ZoneId.systemDefault())
	val match = state.match(clock)
	val groups = groupRows(match.rows)
	val open = state.tasks.count { !it.completed }
	val completed = state.tasks.count { it.completed }
	val ticking = anyFocusing(state.tasks)
	val liveNow = rememberFocusNow(ticking, state.tasks)
	LazyColumn(contentPadding = PaddingValues(vertical = 4.dp)) {
		item { TasksHeaderCard(open, completed, state.warnings) }
		item {
			actions.onCreate?.let { onCreate ->
				AddTaskCard(
					error = state.createError,
					categories = categories,
					members = members,
					memberNames = memberNames,
					onCreate = onCreate,
					onDismissError = actions.onDismissCreateError,
				)
			}
		}
		item {
			state.tasks.firstOrNull { com.familyplanz.app.domain.isFocusing(it) }?.let { FocusingNowNote(it.title) }
		}
		item {
			TaskToolbar(
				match = match,
				query = state.query,
				onView = actions.onView,
				onScope = actions.onScope,
				onTime = actions.onTime,
				onSearch = actions.onSearch,
				onSort = actions.onSort,
				onTag = actions.onTag,
			)
		}
		if (match.rows.isEmpty()) {
			item { TaskEmptyList(match.total, state.query) }
		}
		groups.forEach { group ->
			item(key = "group-${group.label}") { GroupHeading(group.label, group.tasks.size) }
			items(group.tasks, key = { "${group.label}-${it.id}" }) { task ->
				if (task.completed) {
					TaskCompletedRow(task, actions, liveNow, busy = task.id in state.busy)
				} else {
					TaskRow(
						meId = state.meId,
						task = task,
						actions = actions,
						now = liveNow,
						focusPending = focusPending,
						busy = task.id in state.busy,
					)
				}
			}
		}
		item {
			actions.onClearCompleted?.let { onClear ->
				CompletedFooter(weeklyCompleted(state.tasks, clock), onClear)
			}
		}
		item {
			AssignmentsCard(
				toAccept = state.pendingAssignments,
				asked = state.requestedByMe,
				onRespond = actions.onRespond,
			)
		}
		item {
			TaskCategoryManager(categoryRows, onRenameCategory, onDeleteCategory)
		}
	}
	state.editing?.let { task ->
		EditTaskDialog(
			task = task,
			categories = categories,
			onDismiss = actions.onDismissEdit,
			onSave = { form -> onSaveEdit(task, form) },
		)
	}
}

/** "ONE-OFF (n)" / "RECURRING (n)" (AC-TK-13). */
@Composable
private fun GroupHeading(label: String, count: Int) {
	Text(
		"$label ($count)",
		style = MaterialTheme.typography.labelMedium,
		color = FpTheme.colors.textMuted,
		modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 4.dp)
			.testTag("group-${label.lowercase()}"),
	)
}

/** AC-TK-25: first run vs. filters that hid everything. */
@Composable
private fun TaskEmptyList(total: Int, query: com.familyplanz.app.domain.tasks.TaskQuery) {
	val empty = emptyState(
		com.familyplanz.app.domain.tasks.TaskMatch(emptyList(), total, emptyMap()),
		query,
	)
	Column(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp).testTag("tasks-empty"),
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		Text(empty.title, style = MaterialTheme.typography.titleSmall, color = FpTheme.colors.textStrong)
		Text(empty.hint, style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
	}
}

/** "· n completed this week" + Clear completed (AC-TK-23). */
@Composable
private fun CompletedFooter(completedThisWeek: Int, onClearCompleted: () -> Unit) {
	Column(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("completed-footer"),
	) {
		Text(
			"$completedThisWeek completed this week",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		var confirming by remember { mutableStateOf(false) }
		TextButton(onClick = { confirming = true }, modifier = Modifier.testTag("clear-completed")) {
			Text("Clear completed")
		}
		if (confirming) {
			ClearCompletedDialog(
				onYes = {
					confirming = false
					onClearCompleted()
				},
				onNo = { confirming = false },
			)
		}
	}
}

/** The web's "Delete all completed?" prompt. */
@Composable
private fun ClearCompletedDialog(onYes: () -> Unit, onNo: () -> Unit) {
	androidx.compose.material3.AlertDialog(
		onDismissRequest = onNo,
		title = { Text("Delete all completed?") },
		confirmButton = { TextButton(onClick = onYes, modifier = Modifier.testTag("confirm-clear-yes")) { Text("Yes, delete") } },
		dismissButton = { TextButton(onClick = onNo) { Text("No") } },
	)
}

/** Completed rows whose `completedAt` falls in the last seven days. */
internal fun weeklyCompleted(tasks: List<Task>, clock: TaskClock): Int {
	val nowMillis = clock.now.toEpochMilli()
	val window = TimeUnit.DAYS.toMillis(7)
	return tasks.count { task ->
		val stamp = com.familyplanz.app.domain.tasks.dueInstant(task.completedAt, clock.zone)?.toEpochMilli() ?: return@count false
		task.completed && stamp >= nowMillis - window
	}
}
