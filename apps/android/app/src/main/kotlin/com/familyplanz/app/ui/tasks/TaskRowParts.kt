package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.TaskPriority
import com.familyplanz.app.domain.liveFocusMinutes
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.FpDot
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpChipText
import com.familyplanz.app.ui.theme.FpColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.avatarTone
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * The web TaskRow look (TaskRow.svelte, issue 291) as small parts the row
 * composes: the round check, the row surface, and the one meta line of slots.
 */

/** priorityTone.ts dueTone: overdue red, due today amber, else neutral. */
enum class DueTone { OVERDUE, TODAY, LATER }

internal fun dueDateOf(due: String?): LocalDate? =
	due?.takeIf { it.length >= 10 }?.let {
		try {
			LocalDate.parse(it.take(10))
		} catch (_: DateTimeException) {
			null
		}
	}

internal fun dueTone(due: String?, today: LocalDate): DueTone? {
	val date = dueDateOf(due) ?: return null
	return when {
		date.isBefore(today) -> DueTone.OVERDUE
		date == today -> DueTone.TODAY
		else -> DueTone.LATER
	}
}

/** taskUrgency.ts lateChip: "1 day late" / "N days late"; null when not late. */
internal fun lateLabel(due: String?, today: LocalDate): String? {
	val date = dueDateOf(due) ?: return null
	val days = ChronoUnit.DAYS.between(date, today)
	return when {
		days <= 0 -> null
		days == 1L -> "1 day late"
		else -> "$days days late"
	}
}

/** One fact on the row's meta line, in TaskRow.svelte's slot vocabulary. */
enum class SlotKind { SAVING, DUE, LATE, RECUR, EVENT, TAG, PRIORITY, FAMILY, WHO, STATUS, FOCUS }

data class MetaSlot(val kind: SlotKind, val text: String, val tone: DueTone? = null)

/**
 * Web slot order (due, late, recurrence/event, [category], tags, priority,
 * family, who), plus the native-only saving ack first and focus time last.
 * The category chip renders separately ([CategoryChip], tag `category-chip`).
 */
@Suppress("CyclomaticComplexMethod")
internal fun taskMetaSlots(
	task: Task,
	now: Instant = Instant.now(),
	today: LocalDate = LocalDate.now(),
): List<MetaSlot> = buildList {
	if (task.pending) add(MetaSlot(SlotKind.SAVING, "saving…"))
	val tone = if (task.completed) null else dueTone(task.dueDate, today)
	task.dueDate?.let { add(MetaSlot(SlotKind.DUE, "due ${it.take(10)}", tone)) }
	if (!task.completed) lateLabel(task.dueDate, today)?.let { add(MetaSlot(SlotKind.LATE, it)) }
	task.recurringLabel?.let { add(MetaSlot(SlotKind.RECUR, task.recurringLabel)) }
	task.eventTitle?.let { add(MetaSlot(SlotKind.EVENT, it)) }
	task.tags.forEach { tag -> add(MetaSlot(SlotKind.TAG, "#${tag.removePrefix("#")}")) }
	if (task.priority != TaskPriority.NORMAL) {
		add(MetaSlot(SlotKind.PRIORITY, task.priority.name.lowercase().replaceFirstChar(Char::uppercase)))
	}
	if (task.familyTask) add(MetaSlot(SlotKind.FAMILY, "Family"))
	when {
		task.assignedName != null -> add(MetaSlot(SlotKind.WHO, task.assignedName))
		task.familyTask -> add(MetaSlot(SlotKind.WHO, "unassigned"))
	}
	task.assignmentStatus?.let { add(MetaSlot(SlotKind.STATUS, it)) }
	liveFocusMinutes(task, now)?.let { add(MetaSlot(SlotKind.FOCUS, "${it}m focus")) }
}

/** Chip tone per slot kind; null = plain meta text (slate-400). Pure, for tests. */
@Suppress("CyclomaticComplexMethod")
internal fun FpColors.toneFor(slot: MetaSlot): ChipTone? = when (slot.kind) {
	SlotKind.DUE -> when (slot.tone) {
		DueTone.OVERDUE -> late
		DueTone.TODAY -> dueToday
		DueTone.LATER -> due
		null -> null
	}
	SlotKind.LATE -> late
	SlotKind.RECUR -> recurring
	SlotKind.FAMILY -> family
	SlotKind.STATUS -> if (slot.text == "pending") pending else assignee
	SlotKind.TAG -> tag
	SlotKind.EVENT -> focus
	SlotKind.FOCUS -> focus
	SlotKind.SAVING, SlotKind.PRIORITY, SlotKind.WHO -> null
}

internal fun FpColors.priorityDot(priority: TaskPriority) = when (priority) {
	TaskPriority.HIGH -> priorityHigh
	TaskPriority.NORMAL -> priorityNormal
	TaskPriority.LOW -> priorityLow
}

/**
 * The meta line, one 20 dp line, clipped (AC-TK-15, `TaskRow.svelte:168`):
 * six tags push facts past the right edge instead of wrapping into a second
 * line, so every row keeps one height.
 */
@Composable
internal fun TaskMetaSlots(task: Task, now: Instant, leading: @Composable () -> Unit = {}) {
	val colors = FpTheme.colors
	Row(
		modifier = Modifier.fillMaxWidth().heightIn(max = 20.dp).clipToBounds().testTag("task-meta"),
		horizontalArrangement = Arrangement.spacedBy(4.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		leading()
		taskMetaSlots(task, now).forEach { slot ->
			val tone = colors.toneFor(slot)
			when {
				slot.kind == SlotKind.WHO -> AssigneeChip(task.assignedTo.orEmpty(), slot.text)
				slot.kind == SlotKind.PRIORITY -> PrioritySlot(task.priority, slot.text)
				tone != null -> FpChip(slot.text, tone, bold = slot.kind == SlotKind.LATE)
				else -> MetaText(slot.text)
			}
		}
	}
}

@Composable
private fun MetaText(text: String) {
	Text(text, style = MaterialTheme.typography.labelSmall, color = FpTheme.colors.textMuted, maxLines = 1)
}

@Composable
private fun PrioritySlot(priority: TaskPriority, label: String) {
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		FpDot(FpTheme.colors.priorityDot(priority))
		Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
	}
}

/** TaskRow's assignee pill: slate-100 pill, avatarColor() initial disc, the name. */
@Composable
private fun AssigneeChip(id: String, name: String) {
	val tone = avatarTone(id)
	Row(
		modifier = Modifier
			.clip(FpShape.Pill)
			.background(FpTheme.colors.assignee.container)
			.padding(start = 2.dp, end = 8.dp, top = 2.dp, bottom = 2.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(4.dp),
	) {
		Box(
			modifier = Modifier.size(16.dp).clip(FpShape.Pill).background(tone.container),
			contentAlignment = Alignment.Center,
		) {
			Text(
				name.firstOrNull()?.uppercase() ?: "?",
				style = FpChipText,
				fontWeight = FontWeight.Bold,
				color = tone.content,
			)
		}
		Text(name, style = FpChipText, color = FpTheme.colors.assignee.content, maxLines = 1)
	}
}
