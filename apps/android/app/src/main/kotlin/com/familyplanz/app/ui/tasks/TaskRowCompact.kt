package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.liveFocusMinutes
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.theme.FpTheme
import java.time.Instant

/**
 * Public compact task row for other screens (L4's Day Dashboard asks for one
 * day's tasks). Same check, title weight and due chip as the Tasks tab, but
 * no actions beyond completion: the full row lives in [TaskRow].
 */
@Composable
fun TaskRowCompact(
	task: Task,
	onToggle: () -> Unit,
	modifier: Modifier = Modifier,
	now: Instant = Instant.now(),
) {
	val late = !task.completed && dueTone(task.dueDate, java.time.LocalDate.now()) == DueTone.OVERDUE
	TaskRowSurface(late = late, modifier = modifier.testTag("task-row-compact")) {
		Row(
			modifier = Modifier.fillMaxWidth().padding(end = 8.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(4.dp),
		) {
			TaskCheck(checked = task.completed, enabled = !task.pending, onToggle = onToggle)
			Column(modifier = Modifier.weight(1f).padding(vertical = 8.dp)) {
				Text(
					task.title,
					style = MaterialTheme.typography.bodyMedium,
					fontWeight = FontWeight.Medium,
					color = if (task.completed) FpTheme.colors.textMuted else FpTheme.colors.textStrong,
					textDecoration = if (task.completed) TextDecoration.LineThrough else null,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
				)
				liveFocusMinutes(task, now)?.let { minutes ->
					Text(
						"${minutes}m focus",
						style = MaterialTheme.typography.labelSmall,
						color = FpTheme.colors.textMuted,
					)
				}
			}
			task.dueDate?.let { due -> FpChip(due.take(10), if (late) FpTheme.colors.late else FpTheme.colors.due, bold = late) }
		}
	}
}
