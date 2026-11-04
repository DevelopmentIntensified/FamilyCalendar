package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.FpDot
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate
import com.familyplanz.app.ui.groceries.FieldLook
import com.familyplanz.app.ui.groceries.GroceryField

/* FamilyTaskBoardCard: the streak line, the quick-add and one column per member. */

@Composable
fun BoardCard(state: DashboardUiState, actions: DashboardActions, modifier: Modifier = Modifier) {
	FpCard(modifier) {
		Text("Family Task Board", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S900)
		Spacer(Modifier.height(8.dp))
		BoardSummary(state, actions.onOpenFamilyTasks)
		Spacer(Modifier.height(12.dp))
		BoardQuickAdd(state, actions)
		Spacer(Modifier.height(12.dp))
		if (state.boardTasks.isEmpty()) {
			Text("No open family tasks — enjoy the calm 👪.", fontSize = 12.sp, color = Slate.S400, modifier = Modifier.padding(bottom = 8.dp))
		}
		state.boardGroups.forEach { group -> BoardGroupBlock(group, state, actions) }
	}
}

/** "{open} open · {n}-week streak" (or the streak invitation), plus the Board link. */
@Composable
private fun BoardSummary(state: DashboardUiState, onOpenBoard: () -> Unit) {
	Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
		val streak = state.weekStreak
		val tail = if (streak > 0) "$streak-week streak" else "Start a streak — check off today's tasks 🔥"
		Text("${state.boardTasks.size} open · $tail", fontSize = 12.sp, color = Slate.S500, modifier = Modifier.weight(1f))
		LinkText("Board →", onOpenBoard, "board-link")
	}
}

/** The quick-add: one MentionInput line, ? help, Add, and a compact category field below. */
@Composable
private fun BoardQuickAdd(state: DashboardUiState, actions: DashboardActions) {
	Column(Modifier.testTag("board-quick-add")) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			GroceryField(
				value = state.quickTitle,
				onValueChange = actions.onQuickType,
				look = FieldLook(
					placeholder = "Add a family task… try \"saturday for Dad\"",
					label = "Add a family task",
				),
				modifier = Modifier.weight(1f).testTag("board-quick-input"),
				onDone = actions.onQuickAdd,
			)
			FpPrimaryButton(onClick = actions.onQuickAdd, enabled = state.quickTitle.isNotBlank() && !state.adding) {
				Text(if (state.adding) "Adding…" else "Add", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
			}
		}
		GroceryField(
			value = state.quickCategory,
			onValueChange = actions.onQuickCategory,
			look = FieldLook(placeholder = "Category (optional)", label = "Category", vertical = 6.dp, textSize = 12),
			modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
		)
		if (state.quickError.isNotBlank()) {
			Text(
				state.quickError,
				fontSize = 12.sp,
				color = Color(0xFFDC2626),
				modifier = Modifier.padding(top = 4.dp).testTag("board-quick-error"),
			)
		}
	}
}

/** One column: avatar, NAME, "· n"; a member with nothing shows "nothing assigned". */
@Composable
private fun BoardGroupBlock(group: BoardGroup, state: DashboardUiState, actions: DashboardActions) {
	Column(Modifier.padding(bottom = 10.dp).testTag("board-group-${group.ownerId}")) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			MemberDisc(group.ownerId, group.initial)
			Text(
				"${group.name.uppercase()} · ${group.tasks.size}",
				fontSize = 11.sp,
				fontWeight = FontWeight.SemiBold,
				color = Slate.S400,
			)
		}
		if (group.tasks.isEmpty()) {
			Text(
				"nothing assigned",
				fontSize = 12.sp,
				color = Slate.S400,
				modifier = Modifier.padding(start = 28.dp).testTag("board-empty-${group.ownerId}"),
			)
		} else {
			group.tasks.forEach { task -> BoardTaskRow(task, state, actions) }
		}
	}
}

@Composable
private fun BoardTaskRow(task: TaskDto, state: DashboardUiState, actions: DashboardActions) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier
			.fillMaxWidth()
			.padding(vertical = 2.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(Slate.S50)
			.padding(horizontal = 8.dp, vertical = 6.dp)
			.testTag("board-task-${task.id}"),
	) {
		CheckCircle("Mark done: ${task.title}", state.busyId != task.id) { actions.onToggleTask(task) }
		FpDot(FpTheme.colors.priorityDot(task.priority))
		Text(task.title, fontSize = 14.sp, color = Slate.S800, modifier = Modifier.weight(1f))
		task.category?.let { FpChip(it, FpTheme.colors.category) }
		dueBadge(task.dueDate)?.let { FpChip(it, FpTheme.colors.due) }
	}
}

/** A 2 dp priority dot, `priorityDot(priority) || bg-slate-300`. */
private fun com.familyplanz.app.ui.theme.FpColors.priorityDot(priority: String): Color = when (priority.lowercase()) {
	"high" -> priorityHigh
	"low" -> priorityLow
	else -> priorityNormal
}
