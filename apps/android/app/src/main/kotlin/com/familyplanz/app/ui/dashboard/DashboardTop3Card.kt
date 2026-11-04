package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/* TopPrioritiesCard: the ranked rows, grouped One-off then Recurring. */

@Composable
fun Top3Card(state: DashboardUiState, actions: DashboardActions, modifier: Modifier = Modifier) {
	val groups = state.top3Groups
	FpCard(modifier) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
			Text(
				"Top-3 Priorities",
				fontSize = 14.sp,
				fontWeight = FontWeight.SemiBold,
				color = Slate.S900,
				modifier = Modifier.weight(1f),
			)
			if (groups.isEmpty()) Text("All clear", fontSize = 12.sp, color = Slate.S400)
		}
		Spacer(Modifier.height(8.dp))
		if (groups.isEmpty()) {
			DashedNote("All clear — nothing needs you right now.", "View all tasks →", actions.onOpenTasks, "top3-empty", "top3-view-all")
			return@FpCard
		}
		groups.forEach { group -> Top3GroupBlock(group, state, actions) }
		LinkText("View all tasks →", actions.onOpenTasks, "top3-footer", Modifier.align(Alignment.End))
	}
}

@Composable
private fun Top3GroupBlock(group: Top3Group, state: DashboardUiState, actions: DashboardActions) {
	Column(Modifier.padding(bottom = 8.dp).testTag("top3-${group.key}")) {
		Text(
			"${group.label.uppercase()} (${group.tasks.size})",
			fontSize = 12.sp,
			fontWeight = FontWeight.SemiBold,
			color = Slate.S400,
			modifier = Modifier.padding(bottom = 4.dp),
		)
		group.tasks.forEachIndexed { index, task -> Top3Row(task, group.start + index + 1, state, actions) }
	}
}

@Composable
private fun Top3Row(task: TaskDto, number: Int, state: DashboardUiState, actions: DashboardActions) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(12.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier
			.fillMaxWidth()
			.padding(vertical = 2.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(Slate.S50)
			.padding(horizontal = 8.dp, vertical = 8.dp)
			.testTag("top3-row-${task.id}"),
	) {
		Text("$number", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Slate.S300, modifier = Modifier.width(16.dp))
		CheckCircle("Mark done: ${task.title}", state.busyId != task.id) { actions.onToggleTask(task) }
		Column(Modifier.weight(1f)) {
			Text(task.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Slate.S900)
			AssigneeLine(task, state)
			FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
				if (task.familyId != null) {
					FpChip("Family", FpTheme.colors.family)
				} else {
					FpChip(if (task.visibility == "private") "🔒 Private" else "🌐 Public", FpTheme.colors.due)
				}
				task.category?.let { FpChip(it, FpTheme.colors.category) }
			}
		}
		dueBadge(task.dueDate)?.let { FpChip(it, dueToneChip(task.dueDate), Modifier.testTag("top3-due-${task.id}")) }
		PrioritySegments(task, state, actions)
	}
}

@Composable
private fun AssigneeLine(task: TaskDto, state: DashboardUiState) {
	val badge = assigneeBadge(task, state.meId)
	if (badge != null) {
		FpChip("→ $badge", ChipTone(Accent.Amber100, Accent.Amber700))
	} else {
		Text(memberLine(task, state), fontSize = 11.sp, color = Slate.S400)
	}
}

private fun assigneeBadge(task: TaskDto, meId: String): String? {
	if (task.assignedTo == null || task.assignedTo == meId) return null
	return "${task.assigneeFirstName.orEmpty()} ${task.assigneeLastName.orEmpty()}".trim().ifEmpty { null }
}

private fun memberLine(task: TaskDto, state: DashboardUiState): String = when {
	task.assignedTo == null -> "Unassigned"
	task.assignedTo == state.meId -> "You"
	else -> assigneeBadge(task, state.meId) ?: "Unassigned"
}

/** Low / Normal / High: 44 dp targets, the current one wearing its own tone. */
@Composable
private fun PrioritySegments(task: TaskDto, state: DashboardUiState, actions: DashboardActions) {
	val current = state.priorityOf(task)
	Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
		listOf("low" to "Low", "normal" to "Normal", "high" to "High").forEach { (key, label) ->
			val on = current == key
			Text(
				label,
				fontSize = 11.sp,
				fontWeight = FontWeight.SemiBold,
				color = if (on) priorityInk(key) else Slate.S300,
				modifier = Modifier
					.heightIn(min = 44.dp)
					.clip(MaterialTheme.shapes.small)
					.background(if (on) priorityFill(key) else Color.Transparent)
					.semantics { contentDescription = "Set priority $label" }
					.clickable(enabled = state.busyId != task.id) { actions.onPriority(task, key) }
					.padding(horizontal = 8.dp, vertical = 12.dp)
					.testTag("priority-${task.id}-$key"),
			)
		}
	}
}

private fun priorityFill(priority: String): Color = when (priority) {
	"high" -> Accent.Red100
	"low" -> Slate.S100
	else -> Slate.S200
}

private fun priorityInk(priority: String): Color = when (priority) {
	"high" -> Accent.Red700
	"low" -> Slate.S600
	else -> Slate.S700
}

/** priorityTone.ts dueTone on the due pill: overdue red, due today amber, else neutral. */
private fun dueToneChip(due: String?): ChipTone {
	val date = due?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
	val days = date?.let { ChronoUnit.DAYS.between(LocalDate.now(), it) }
	return when {
		days == null -> ChipTone(Slate.S100, Slate.S600)
		days < 0 -> ChipTone(Accent.Red100, Accent.Red700)
		days == 0L -> ChipTone(Accent.Amber100, Accent.Amber700)
		else -> ChipTone(Slate.S100, Slate.S600)
	}
}
