package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.tasks.SMART_TASK_TEMPLATES
import com.familyplanz.app.domain.tasks.SmartTaskCategory
import com.familyplanz.app.domain.tasks.SmartTaskTemplate
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * AC-TK-7: "Smart tasks" expands a group per template category, the first
 * group open by default; tapping a template creates it (the caller adds it).
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
fun SmartTasksPanel(open: Boolean, onToggle: () -> Unit, onPick: (SmartTaskTemplate) -> Unit) {
	var openGroup by rememberSaveable { mutableStateOf(SmartTaskCategory.entries.first()) }
	Column(modifier = Modifier.fillMaxWidth().testTag("smart-tasks")) {
		TextButton(onClick = onToggle, modifier = Modifier.testTag("smart-tasks-toggle")) {
			Text(if (open) "Smart tasks \u25b4" else "Smart tasks \u25be")
		}
		if (!open) return@Column
		FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
			SmartTaskCategory.entries.forEach { category ->
				FilterChip(
					selected = openGroup == category,
					onClick = { openGroup = category },
					label = { Text(category.label) },
					shape = FpShape.Pill,
					colors = fpFilterChipColors(),
					border = fpFilterChipBorder(openGroup == category),
				)
			}
		}
		SMART_TASK_TEMPLATES.filter { it.category == openGroup }.forEach { template ->
			Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
				Column(modifier = Modifier.weight(1f).padding(vertical = 4.dp)) {
					Text(
						template.name,
						style = MaterialTheme.typography.bodySmall,
						color = FpTheme.colors.textStrong,
					)
					Text(
						template.cadenceNote,
						style = MaterialTheme.typography.labelSmall,
						color = FpTheme.colors.textMuted,
					)
				}
				TextButton(
					onClick = { onPick(template) },
					modifier = Modifier.testTag("smart-${template.id}"),
				) { Text("Add") }
			}
		}
	}
}
