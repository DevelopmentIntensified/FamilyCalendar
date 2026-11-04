package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.tasks.OwnerView
import com.familyplanz.app.domain.tasks.ScopeChip
import com.familyplanz.app.domain.tasks.TaskMatch
import com.familyplanz.app.domain.tasks.TaskQuery
import com.familyplanz.app.domain.tasks.TaskSortKey
import com.familyplanz.app.domain.tasks.TimeFilter
import com.familyplanz.app.domain.tasks.matchLine
import com.familyplanz.app.domain.tasks.timeCount
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * `TasksMainList.svelte` + `TaskToolbar.svelte`: the "Your tasks" card, the
 * live Filter line (AC-TK-10), the owner chips (AC-TK-8), the scope chips,
 * search, sort (AC-TK-11), the tag filter (AC-TK-12) and the time jump bar
 * with its counts (AC-TK-9).
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
fun TaskToolbar(
	match: TaskMatch,
	query: TaskQuery,
	onView: (OwnerView) -> Unit,
	onScope: (ScopeChip) -> Unit,
	onTime: (TimeFilter) -> Unit,
	onSearch: (String) -> Unit,
	onSort: (TaskSortKey) -> Unit,
	onTag: (String) -> Unit,
) {
	FpCard(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("tasks-toolbar"),
		padding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
	) {
		Column {
			CardHeading()
			FilterLine(match, query)
			OwnerChips(query.view, onView)
			ScopeChips(query.scope, onScope)
			SearchAndSort(query, onSearch, onSort)
			TagField(query.tag, onTag)
			TimeChips(match, query, onTime)
			ShowingLine(query)
		}
	}
}

@Composable
private fun CardHeading() {
	Text(
		"Your tasks",
		style = MaterialTheme.typography.titleSmall,
		fontWeight = FontWeight.SemiBold,
		color = FpTheme.colors.textStrong,
	)
	Text(
		"Filter, search, and sort your list",
		style = MaterialTheme.typography.bodySmall,
		color = FpTheme.colors.textMuted,
	)
}

/** TaskToolbar's one filter line: "Filter" + "1 of 8 match “milk”". */
@Composable
private fun FilterLine(match: TaskMatch, query: TaskQuery) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Text(
			"Filter",
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Medium,
			color = FpTheme.colors.textStrong,
		)
		Text(
			match.matchLine(query),
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
			maxLines = 1,
			modifier = Modifier.testTag("task-filter-count"),
		)
	}
}

/** AC-TK-8: selected chip is slate-900 with white text. */
@Composable
private fun OwnerChips(selected: OwnerView, onView: (OwnerView) -> Unit) {
	FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		OwnerView.entries.forEach { view ->
			ToolbarChip(view.label, view == selected, Modifier.testTag("view-${view.name.lowercase()}")) {
				onView(view)
			}
		}
	}
}

@Composable
private fun ScopeChips(selected: ScopeChip, onScope: (ScopeChip) -> Unit) {
	FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		ScopeChip.entries.forEach { scope ->
			ToolbarChip(scope.label, scope == selected, Modifier.testTag("scope-${scope.name.lowercase()}")) {
				onScope(scope)
			}
		}
	}
}

/** AC-TK-11: the sort menu names the current key and offers all five. */
@Composable
private fun SearchAndSort(query: TaskQuery, onSearch: (String) -> Unit, onSort: (TaskSortKey) -> Unit) {
	var open by remember { mutableStateOf(false) }
	Row(
		modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(4.dp),
	) {
		OutlinedTextField(
			value = query.search,
			onValueChange = onSearch,
			modifier = Modifier.weight(1f).testTag("task-search"),
			singleLine = true,
			placeholder = { Text("Search\u2026") },
			shape = FpShape.Input,
			colors = fpFieldColors(),
			keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
		)
		TextButton(onClick = { open = true }, modifier = Modifier.testTag("task-sort")) {
			Text("Sort: ${query.sort.label}")
		}
		DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
			TaskSortKey.entries.forEach { key ->
				DropdownMenuItem(
					text = { Text(key.label) },
					onClick = {
						onSort(key)
						open = false
					},
					modifier = Modifier.testTag("sort-${key.wire}"),
				)
			}
		}
	}
}

/** AC-TK-12: "# Filter by #tag…"; clearing the field drops the filter. */
@Composable
private fun TagField(tag: String, onTag: (String) -> Unit) {
	OutlinedTextField(
		value = tag,
		onValueChange = { onTag(it.removePrefix("#")) },
		modifier = Modifier.fillMaxWidth().padding(top = 4.dp).testTag("task-tag"),
		singleLine = true,
		placeholder = { Text("# Filter by #tag\u2026") },
		trailingIcon = {
			if (tag.isNotEmpty()) {
				TextButton(onClick = { onTag("") }, modifier = Modifier.testTag("task-tag-clear")) { Text("\u00d7") }
			}
		},
		shape = FpShape.Input,
		colors = fpFieldColors(),
	)
}

/** AC-TK-9: counts on every chip; a non-zero Overdue chip not selected is red-tinted. */
@Composable
private fun TimeChips(match: TaskMatch, query: TaskQuery, onTime: (TimeFilter) -> Unit) {
	FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		TimeFilter.entries.forEach { filter ->
			val count = match.timeCount(filter)
			val selected = query.time == filter
			val overdueTint = filter == TimeFilter.OVERDUE && count > 0 && !selected
			FilterChip(
				selected = selected,
				onClick = { onTime(filter) },
				label = { Text("${filter.label} $count") },
				modifier = Modifier.testTag("time-${filter.name.lowercase()}"),
				shape = FpShape.Pill,
				colors = FilterChipDefaults.filterChipColors(
					selectedContainerColor = FpTheme.colors.textStrong,
					selectedLabelColor = Color.White,
					containerColor = if (overdueTint) FpTheme.colors.late.container else Color.Transparent,
					labelColor = if (overdueTint) FpTheme.colors.late.content else FpTheme.colors.textBody,
				),
			)
		}
	}
}

/** The sky-600 "Showing … · Filtering by #… · Searching “…”" line. */
@Composable
private fun ShowingLine(query: TaskQuery) {
	if (!query.showingActive && !query.tagActive && !query.searchActive) return
	val parts = buildList {
		if (query.view != OwnerView.OPEN) add("Showing ${query.view.label} tasks")
		if (query.scope != ScopeChip.EVERY) add("Showing ${query.scope.label.lowercase()} tasks")
		if (query.tagActive) add("Filtering by #${query.tag.trim().lowercase()}")
		if (query.searchActive) add("Searching \u201c${query.search.trim()}\u201d")
		if (query.time != TimeFilter.ALL) add(query.time.label)
	}
	Text(
		parts.joinToString(" \u00b7 "),
		style = MaterialTheme.typography.bodySmall,
		color = MaterialTheme.colorScheme.tertiary,
		modifier = Modifier.padding(top = 4.dp).testTag("tasks-showing"),
	)
}

/** The owner/scope pill: slate-900 fill with white text when selected. */
@Composable
private fun ToolbarChip(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
	FilterChip(
		selected = selected,
		onClick = onClick,
		label = { Text(label) },
		modifier = modifier,
		shape = FpShape.Pill,
		colors = FilterChipDefaults.filterChipColors(
			selectedContainerColor = FpTheme.colors.textStrong,
			selectedLabelColor = Color.White,
			containerColor = Color.Transparent,
			labelColor = FpTheme.colors.textBody,
		),
	)
}
