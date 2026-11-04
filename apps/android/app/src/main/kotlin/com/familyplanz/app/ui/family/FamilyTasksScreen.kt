@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** What the Family Task Board can ask of the app. */
@Suppress("MatchingDeclarationName")
class FamilyTasksActions(
	val onFilter: (TaskFilter) -> Unit = {},
	val onShowPublic: (Boolean) -> Unit = {},
	val onTitle: (String) -> Unit = {},
	val onAdd: () -> Unit = {},
	val onToggle: (TaskDto) -> Unit = {},
	val onBack: () -> Unit = {},
)

/**
 * The Family Task Board (2.11): the filter bar, one group per member, the
 * add form and the completed list; the "Public tasks" tab lists other
 * members' public personal tasks (AC-FT-1..4).
 */
@Composable
fun FamilyTasksScreen(
	state: FamilyTasksState,
	actions: FamilyTasksActions,
	familyName: String = "",
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Family") {}
		Column(
			modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			FamilyBreadcrumb("Calendar", "Family", familyName.ifBlank { "Tasks" })
			FamilyPageTitle("Family Tasks")
			FamilyTextLink("\u2039 Back to Family", actions.onBack)
			when (state) {
				FamilyTasksState.Loading -> Text(
					"Loading the board\u2026",
					style = MaterialTheme.typography.bodyMedium,
					color = FpTheme.colors.textMuted,
				)

				is FamilyTasksState.Failed -> Text(
					state.reason,
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.error,
				)

				is FamilyTasksState.Ready -> BoardBody(state, actions)
			}
		}
	}
}

@Composable
private fun BoardBody(state: FamilyTasksState.Ready, actions: FamilyTasksActions) {
	Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
		FilterChip(
			selected = !state.publicTab,
			onClick = { actions.onShowPublic(false) },
			label = { Text("Family board") },
			colors = fpFilterChipColors(),
			border = fpFilterChipBorder(!state.publicTab),
		)
		FilterChip(
			selected = state.publicTab,
			onClick = { actions.onShowPublic(true) },
			label = { Text("Public tasks") },
			colors = fpFilterChipColors(),
			border = fpFilterChipBorder(state.publicTab),
		)
	}
	if (state.publicTab) {
		PublicTab(state)
		return
	}
	FilterBar(state, actions)
	AddRow(state, actions)
	FamilyNoteLine(state.note)
	FamilyErrorLine(state.error)
	val groups = memberGroups(state.board.familyRoster, state.open)
	if (state.filter != TaskFilter.COMPLETED) {
		groups.forEach { group ->
			FamilyBand(groupTitle(group)) {
				if (group.tasks.isEmpty()) {
					Text("Nothing here yet.", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
				}
				group.tasks.forEach { task -> TaskRow(task, actions) }
			}
		}
	}
	if (state.filter != TaskFilter.OPEN && state.done.isNotEmpty()) {
		FamilyBand("Completed") {
			state.done.forEach { task -> TaskRow(task, actions) }
		}
	} else if (state.filter == TaskFilter.COMPLETED && state.done.isEmpty()) {
		FamilyBand("Completed") {
			Text("Nothing completed yet.", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		}
	}
}

@Composable
private fun FilterBar(state: FamilyTasksState.Ready, actions: FamilyTasksActions) {
	Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
		TaskFilter.entries.forEach { filter ->
			val selected = state.filter == filter
			FilterChip(
				selected = selected,
				onClick = { actions.onFilter(filter) },
				label = { Text(filter.label) },
				colors = fpFilterChipColors(),
				border = fpFilterChipBorder(selected),
			)
		}
	}
}

@Composable
private fun AddRow(state: FamilyTasksState.Ready, actions: FamilyTasksActions) {
	Row(verticalAlignment = Alignment.CenterVertically) {
		FamilyField(
			"Add a task (try \u201Cmow lawn @Dad\u201D)",
			state.addTitle,
			actions.onTitle,
			modifier = Modifier.weight(1f),
		)
		FamilyActionChip(if (state.submitting) "Adding\u2026" else "Add", actions.onAdd)
	}
}

@Composable
private fun TaskRow(task: TaskDto, actions: FamilyTasksActions) {
	Row(
		modifier = Modifier.fillMaxWidth().clickable { actions.onToggle(task) }.padding(vertical = 6.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
	) {
		PendingPill(task)
		Text(
			task.title,
			style = MaterialTheme.typography.bodyMedium,
			textDecoration = if (task.completedAt.isNullOrBlank()) TextDecoration.None else TextDecoration.LineThrough,
			color = FpTheme.colors.textStrong,
			modifier = Modifier.weight(1f),
		)
	}
}

/** AC-FT-2's echo: an assignment the assignee has not accepted yet reads "pending". */
@Composable
private fun PendingPill(task: TaskDto) {
	if (task.assignmentStatus == "pending") {
		FamilyRolePill("Pending")
	}
}

/** AC-FT-3: the other members' public personal tasks. */
@Composable
private fun PublicTab(state: FamilyTasksState.Ready) {
	val visible = publicFamilyTasks(state.board.publicTasks, meId = null)
	FamilyBand("Public tasks") {
		if (visible.isEmpty()) {
			Text(
				"No public tasks from the other members yet.",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
		}
		visible.forEach { task ->
			Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
				Text(task.title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
				task.assigneeFirstName?.let { FamilyRolePill(it) }
			}
		}
	}
	FamilyNoteLine(if (visible.isEmpty()) null else "${visible.size} public tasks")
	FamilyErrorLine(state.error)
	val first = state.board.publicTasks.firstOrNull()
	if (first != null) {
		Text(
			"Private tasks never appear here.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
	}
}


