package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.tasks.headerLine
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.FpTheme

/**
 * `TasksHeader.svelte`: the "Tasks" card with the live counts (AC-TK-1) and,
 * under it, any amber warnings the sections read reported (a list that
 * failed server-side comes back empty and named).
 */
@Composable
fun TasksHeaderCard(open: Int, completed: Int, warnings: List<String> = emptyList()) {
	FpCard(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("tasks-header"),
		padding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
	) {
		Column {
			Text(
				"Tasks",
				style = MaterialTheme.typography.titleMedium,
				fontWeight = FontWeight.Bold,
				color = FpTheme.colors.textStrong,
			)
			Text(
				headerLine(open, completed),
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
				modifier = Modifier.testTag("tasks-counts"),
			)
			warnings.forEach { warning ->
				Text(
					warning,
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.warnContent,
					modifier = Modifier.testTag("tasks-warning"),
				)
			}
		}
	}
}
