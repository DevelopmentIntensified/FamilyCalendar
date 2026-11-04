package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.theme.FpTheme

/**
 * `AssignmentsCard.svelte` (AC-TK-22): "TO ACCEPT (n)" and "YOU ASKED FOR
 * (n)" with a status pill per row; the whole card is hidden when both are
 * empty. Accept/Decline only show on the rows waiting for my answer.
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
fun AssignmentsCard(
	toAccept: List<Task>,
	asked: List<Task>,
	onRespond: ((Task, String) -> Unit)? = null,
) {
	if (toAccept.isEmpty() && asked.isEmpty()) return
	FpCard(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("assignments-card"),
		padding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
	) {
		Column {
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
				Text(
					"Assignments",
					style = MaterialTheme.typography.titleSmall,
					fontWeight = FontWeight.SemiBold,
					color = FpTheme.colors.textStrong,
				)
				if (toAccept.isNotEmpty()) {
					Text(
						"${toAccept.size} waiting",
						style = MaterialTheme.typography.bodySmall,
						color = FpTheme.colors.textMuted,
					)
				}
			}
			if (toAccept.isNotEmpty()) {
				SectionHeading("TO ACCEPT (${toAccept.size})")
				toAccept.forEach { task -> AssignmentRow(task, onRespond) }
			}
			if (asked.isNotEmpty()) {
				SectionHeading("YOU ASKED FOR (${asked.size})")
				asked.forEach { task -> AssignmentRow(task, onRespond = null) }
			}
		}
	}
}

@Composable
private fun SectionHeading(text: String) {
	Text(
		text,
		style = MaterialTheme.typography.labelSmall,
		color = FpTheme.colors.textMuted,
		modifier = Modifier.padding(top = 6.dp, bottom = 2.dp),
	)
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun AssignmentRow(task: Task, onRespond: ((Task, String) -> Unit)?) {
	Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
		Column(modifier = Modifier.weight(1f)) {
			Text(
				task.title,
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textStrong,
				maxLines = 1,
			)
			FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
				task.assignedName?.let { FpChip(it, FpTheme.colors.assignee) }
				task.assignmentStatus?.let { status ->
					FpChip(status, if (status == "pending") FpTheme.colors.pending else FpTheme.colors.accept)
				}
			}
		}
		if (onRespond != null && task.assignmentStatus == "pending") {
			TextButton(onClick = { onRespond(task, "accepted") }, modifier = Modifier.testTag("assignment-accept")) {
				Text("\u2713 Accept")
			}
			TextButton(onClick = { onRespond(task, "declined") }, modifier = Modifier.testTag("assignment-decline")) {
				Text("\u2715 Decline")
			}
		}
	}
}
