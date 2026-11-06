package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.TaskPriority
import com.familyplanz.app.domain.tasks.QuickAddMember
import com.familyplanz.app.domain.tasks.TaskQuickAddResult
import com.familyplanz.app.domain.tasks.parseTaskQuickAdd
import com.familyplanz.app.domain.tasks.splitTaskRecords
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * `AddTaskCard.svelte`: "New task" over one quick-add field. Typing parses
 * (date, priority, @member, #tags, cadence - AC-TK-3), a pasted list switches
 * to bulk (AC-TK-4), an unknown @member blocks the add (AC-TK-5), the quick
 * date chips and "More" cover due/category/visibility (AC-TK-6) and the
 * Smart tasks list expands to templates that create on tap (AC-TK-7).
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
@Suppress("CyclomaticComplexMethod", "LongMethod", "LongParameterList")
fun AddTaskCard(
	error: String?,
	categories: List<String> = emptyList(),
	members: List<QuickAddMember> = emptyList(),
	memberNames: Map<String, String> = emptyMap(),
	onCreate: (NewTaskInput) -> Unit,
	onDismissError: () -> Unit = {},
) {
	var text by rememberSaveable { mutableStateOf("") }
	var due by rememberSaveable { mutableStateOf<String?>(null) }
	var priority by rememberSaveable { mutableStateOf(TaskPriority.NORMAL) }
	var category by rememberSaveable { mutableStateOf<String?>(null) }
	var visibility by rememberSaveable { mutableStateOf("public") }
	var more by rememberSaveable { mutableStateOf(false) }
	var smartOpen by rememberSaveable { mutableStateOf(false) }
	var confirmingBulk by rememberSaveable { mutableStateOf(false) }
	val today = LocalDate.now()
	val lines = splitTaskRecords(text, today.year).map { it.text }
	val bulk = lines.size > 1
	val parsed = if (text.isBlank() || bulk) null else parseTaskQuickAdd(text, today, members)
	val blocked = parsed?.unknownMember != null

	fun removeLine(index: Int) {
		text = lines.filterIndexed { i, _ -> i != index }.joinToString("\n")
		confirmingBulk = false
	}

	fun submit(taskText: String, parsedRow: TaskQuickAddResult?) {
		val row = parsedRow ?: parseTaskQuickAdd(taskText, today, members)
		onCreate(
			NewTaskInput(
				title = row.title,
				dueDate = due?.let(LocalDate::parse) ?: row.due,
				priority = if (priority != TaskPriority.NORMAL) priority else row.priority,
				category = category?.trim()?.takeIf { it.isNotEmpty() },
				assignedTo = row.assignedTo,
				tags = row.tags,
				recurrenceFrequency = row.recurrenceFrequency,
				recurrenceInterval = row.recurrenceInterval,
				visibility = if (visibility == "private") "private" else row.visibility,
			),
		)
		text = ""
		due = null
		priority = TaskPriority.NORMAL
		confirmingBulk = false
	}

	/** Bulk: one create per parsed line (AC-TK-4). */
	fun submitAll() {
		lines.forEach { line -> submit(line, parseTaskQuickAdd(line, today, members)) }
	}

	FpCard(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("add-task-card"),
		padding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
	) {
		Column {
			Text(
				"New task",
				style = MaterialTheme.typography.titleSmall,
				fontWeight = FontWeight.SemiBold,
				color = FpTheme.colors.textStrong,
			)
			Text(
				"Type a task, or paste a list",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
				MentionField(
					value = text,
					onValueChange = {
						text = it
						confirmingBulk = false
					},
					members = members,
					modifier = Modifier.weight(1f),
					onDone = {
						when {
							blocked -> Unit
							bulk && !confirmingBulk -> confirmingBulk = true
							bulk -> submitAll()
							else -> submit(text, parsed)
						}
					},
				)
				FpPrimaryButton(
					onClick = {
						when {
							blocked -> Unit
							bulk && !confirmingBulk -> confirmingBulk = true
							bulk -> submitAll()
							else -> submit(text, parsed)
						}
					},
					enabled = text.isNotBlank() && !blocked,
					modifier = Modifier.testTag("add-task-button"),
				) {
					Text(
						when {
							bulk && confirmingBulk -> "Confirm ${lines.size}"
							bulk -> "Add ${lines.size}"
							else -> "Add"
						},
					)
				}
			}
			if (bulk) {
				BulkList(lines, confirmingBulk, onRemove = ::removeLine)
			} else {
				parsed?.takeIf { it.hasInfo }?.let { PreviewLine(it, memberNames) }
				parsed?.unknownMember?.let { UnknownMemberLine(it) }
			}
			QuickDateChips(due, onDue = { due = it }, more = more, onMore = { more = !more })
			if (more) {
				CategoryControl(category, categories) { category = it }
				VisibilityChips(visibility) { visibility = it }
			}
			SmartTasksPanel(smartOpen, onToggle = { smartOpen = !smartOpen }) { template ->
				onCreate(template.toInput(today))
				text = ""
			}
			error?.let {
				Row(verticalAlignment = Alignment.CenterVertically) {
					Text(
						it,
						color = MaterialTheme.colorScheme.error,
						style = MaterialTheme.typography.bodySmall,
						modifier = Modifier.weight(1f).testTag("create-error"),
					)
					TextButton(onClick = onDismissError) { Text("\u00d7") }
				}
			}
		}
	}
}

/** Today / Tomorrow / Next week + More (AC-TK-6). */
@Composable
private fun QuickDateChips(due: String?, onDue: (String?) -> Unit, more: Boolean, onMore: () -> Unit) {
	val today = LocalDate.now()
	FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
		QuickDateChip("Today", due == today.toString()) { onDue(today.toString()) }
		QuickDateChip("Tomorrow", due == today.plusDays(1).toString()) { onDue(today.plusDays(1).toString()) }
		QuickDateChip("Next week", due == today.plusWeeks(1).toString()) { onDue(today.plusWeeks(1).toString()) }
		TextButton(onClick = onMore, modifier = Modifier.testTag("add-more")) { Text(if (more) "Less" else "More") }
	}
}

@Composable
private fun QuickDateChip(label: String, selected: Boolean, onClick: () -> Unit) {
	FilterChip(
		selected = selected,
		onClick = onClick,
		label = { Text(label) },
		modifier = Modifier.testTag("quick-date-${label.lowercase().replace(' ', '-')}"),
		shape = FpShape.Pill,
		colors = fpFilterChipColors(),
		border = fpFilterChipBorder(selected),
	)
}

/** "Who can see this" Private / Public (owner-only on the web; the phone offers both). */
@Composable
private fun VisibilityChips(visibility: String, onVisibility: (String) -> Unit) {
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		Text("Who can see this", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		listOf("private", "public").forEach { option ->
			QuickDateChip(option.replaceFirstChar(Char::uppercase), visibility == option) { onVisibility(option) }
		}
	}
}

/** The parsed preview (AC-TK-3): "Buy milk · due Tue Nov 4", plus who it is for. */
@Composable
private fun PreviewLine(parsed: TaskQuickAddResult, memberNames: Map<String, String>) {
	FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.testTag("quick-add-preview")) {
		parsed.due?.let { FpChip("\u2192 due ${formatDue(it)}", FpTheme.colors.due) }
		if (parsed.priority != TaskPriority.NORMAL) {
			FpChip(parsed.priority.label, if (parsed.priority == TaskPriority.HIGH) FpTheme.colors.late else FpTheme.colors.due)
		}
		parsed.tags.forEach { FpChip("#$it", FpTheme.colors.tag) }
		parsed.recurrenceFrequency?.let { FpChip("repeats $it", FpTheme.colors.recurring) }
		parsed.assignedTo?.let { id ->
			FpChip("for ${memberNames[id] ?: id}", FpTheme.colors.assignee)
		}
		if (parsed.visibilityExplicit) FpChip(parsed.visibility, FpTheme.colors.tag)
	}
}

/** Bulk paste: "3 tasks parsed", one row per task, "Add 3" → "Confirm 3" (AC-TK-4). */
@Composable
private fun BulkList(lines: List<String>, confirming: Boolean, onRemove: (Int) -> Unit) {
	Column(modifier = Modifier.fillMaxWidth().padding(top = 4.dp).testTag("bulk-list")) {
		Text(
			"${lines.size} tasks parsed",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textBody,
			modifier = Modifier.testTag("bulk-count"),
		)
		lines.forEachIndexed { index, line ->
			Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
				Text(
					line,
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textBody,
					modifier = Modifier.weight(1f),
					maxLines = 1,
				)
				TextButton(onClick = { onRemove(index) }) { Text("\u00d7") }
			}
		}
		if (confirming) {
			Text(
				"Press Confirm to add all ${lines.size}.",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
		}
	}
}

/** formatDue: "Sep 5", or with the year when it is not this year. */
internal fun formatDue(date: LocalDate): String {
	val today = LocalDate.now()
	val pattern = if (date.year == today.year) "EEE MMM d" else "EEE MMM d, yyyy"
	return date.format(DateTimeFormatter.ofPattern(pattern, java.util.Locale.ENGLISH))
}

/** A template creates its task on tap (AC-TK-7). */
private fun com.familyplanz.app.domain.tasks.SmartTaskTemplate.toInput(today: LocalDate) = NewTaskInput(
	title = name,
	dueDate = today.plusDays(7),
	recurrenceFrequency = recurrenceFrequency,
	recurrenceInterval = recurrenceInterval,
	visibility = "public",
)

