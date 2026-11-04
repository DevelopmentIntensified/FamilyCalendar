package com.familyplanz.app.ui.calendar

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.chips.ChipDensity
import com.familyplanz.app.ui.calendar.chips.ChipKind
import com.familyplanz.app.ui.calendar.chips.ChipKindMark
import com.familyplanz.app.ui.calendar.chips.chipColor
import com.familyplanz.app.ui.calendar.chips.chipKindOf
import com.familyplanz.app.ui.calendar.model.isOverdue
import com.familyplanz.app.ui.calendar.model.timeRange
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

/* The small pieces every calendar view shares (#292 L2): the sheet shell with
 * its drag-to-close handle (AC-CAL-8), the chip vocabulary in both densities,
 * the RSVP/creator pills and the section kicker. */

/**
 * A web bottom sheet: scrim, rounded-t-2xl surface, grab handle. Dragging the
 * handle down more than [closeAtDp] closes it; a short drag springs back.
 */
@Composable
fun CalendarSheetShell(
	onClose: () -> Unit,
	modifier: Modifier = Modifier,
	maxHeightFraction: Float = 0.92f,
	content: @Composable ColumnScope.() -> Unit,
) {
	val density = LocalDensity.current
	val offset = remember { Animatable(0f) }
	val scope = rememberCoroutineScope()
	val closeAt = with(density) { 100.dp.toPx() }
	val maxHeight = with(LocalConfiguration.current) { (screenHeightDp * maxHeightFraction).dp }
	Box(modifier = modifier.fillMaxSize()) {
		Box(
			modifier = Modifier
				.fillMaxSize()
				.background(Slate.S900.copy(alpha = 0.4f))
				.clickable(onClickLabel = "Close", onClick = onClose),
		)
		Surface(
			shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
			color = MaterialTheme.colorScheme.surface,
			modifier = Modifier
				.align(Alignment.BottomCenter)
				.fillMaxWidth()
				.heightIn(max = maxHeight)
				.offset { IntOffset(0, offset.value.roundToInt()) },
		) {
			Column {
				Box(
					modifier = Modifier
						.fillMaxWidth()
						.padding(top = 8.dp, bottom = 4.dp)
						.testTag("sheet-handle")
						.semantics { contentDescription = "Drag down to close" }
						.pointerInput(closeAt) {
							detectVerticalDragGestures(
								onDragEnd = {
									if (offset.value > closeAt) {
										onClose()
									} else {
										scope.launch { offset.animateTo(0f, tween(150)) }
									}
								},
								onDragCancel = { scope.launch { offset.animateTo(0f, tween(150)) } },
							) { _, dragAmount ->
								scope.launch { offset.snapTo((offset.value + dragAmount).coerceAtLeast(0f)) }
							}
						},
					contentAlignment = Alignment.Center,
				) {
					Box(Modifier.width(40.dp).height(6.dp).clip(FpShape.Pill).background(Slate.S200))
				}
				content()
			}
		}
	}
}

/** Modal sheet's title row: the date/title at 18 sp bold, a 44 dp close. */
@Composable
fun SheetTitle(text: String, subtitle: String? = null, closeLabel: String, onClose: () -> Unit) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 8.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Column(modifier = Modifier.weight(1f)) {
			Text(text, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong, maxLines = 2, overflow = TextOverflow.Ellipsis)
			subtitle?.let {
				Text(it, fontSize = 12.sp, color = FpTheme.colors.textMuted)
			}
		}
		Box(
			modifier = Modifier
				.size(44.dp)
				.semantics { contentDescription = closeLabel }
				.clickable(role = Role.Button, onClick = onClose),
			contentAlignment = Alignment.Center,
		) {
			Text("Close", fontSize = 13.sp, color = FpTheme.colors.textBody)
		}
	}
}

/** 11 sp semibold uppercase kicker ("CALENDARS", "TASKS", "FILTERED"). */
@Composable
fun SectionKicker(text: String, color: Color = FpTheme.colors.textMuted) {
	Text(
		text.uppercase(),
		fontSize = 11.sp,
		fontWeight = FontWeight.SemiBold,
		letterSpacing = 0.6.sp,
		color = color,
		modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
	)
}

/**
 * chipShell, glyph density (MonthDayCell): white chip, the kind's mark, a
 * truncated 11 sp title and the creator/attendance badges (AC-CAL-6).
 */
@Composable
fun EventChip(event: CalendarEvent, modifier: Modifier = Modifier, dimmed: Boolean = false) {
	val kind = chipKindOf(event)
	Row(
		modifier = modifier
			.heightIn(min = 18.dp)
			.clip(RoundedCornerShape(6.dp))
			.background(MaterialTheme.colorScheme.surface.copy(alpha = if (dimmed) 0.6f else 1f))
			.padding(horizontal = 2.dp, vertical = 1.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(2.dp),
	) {
		ChipKindMark(kind, chipColor(event.color), ChipDensity.GLYPH)
		Text(
			event.title,
			fontSize = 11.sp,
			fontWeight = FontWeight.Medium,
			color = FpTheme.colors.textBody,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
			modifier = Modifier.weight(1f, fill = false),
		)
		CreatorBadge(event.creatorName)
		AttendanceBadge(event)
	}
}

@Composable
private fun CreatorBadge(creator: String?) {
	val initial = creator?.trim()?.take(1)?.uppercase().orEmpty()
	if (initial.isEmpty()) return
	Box(
		modifier = Modifier.size(10.dp).clip(FpShape.Pill).background(Slate.S200),
		contentAlignment = Alignment.Center,
	) {
		Text(initial, fontSize = 7.sp, fontWeight = FontWeight.Bold, color = Slate.S600)
	}
}

/** `invited > 1` shows going/invited (`AttendanceBadge.svelte`). */
@Composable
private fun AttendanceBadge(event: CalendarEvent) {
	val summary = event.attendance ?: return
	if (summary.invited <= 1) return
	Text(
		"${summary.going}/${summary.invited}",
		fontSize = 9.sp,
		fontWeight = FontWeight.Medium,
		color = FpTheme.colors.textMuted,
	)
}

/** Dashed task chip: slate-600, red-600 when overdue, a ring when it recurs (AC-CAL-6). */
@Composable
fun TaskChip(task: CalendarTask, today: LocalDate, modifier: Modifier = Modifier) {
	val overdue = isOverdue(task, today)
	Row(
		modifier = modifier
			.heightIn(min = 18.dp)
			.clip(RoundedCornerShape(6.dp))
			.background(MaterialTheme.colorScheme.surface)
			.padding(horizontal = 2.dp, vertical = 1.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(2.dp),
	) {
		ChipKindMark(ChipKind.TASK, Slate.S400, ChipDensity.GLYPH)
		Text(
			task.title,
			fontSize = 11.sp,
			fontWeight = FontWeight.Medium,
			color = if (overdue) Accent.Red600 else Slate.S600,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
			modifier = Modifier.weight(1f, fill = false),
		)
	}
}

/** "2:00 PM - 3:00 PM" or "All day" for a one-line meta row. */
fun eventWhen(event: CalendarEvent, zone: ZoneId): String =
	if (event.allDay) "All day" else timeRange(event, zone)

/** A 24 dp avatar circle with the person's initial (filters sheet rows). */
@Composable
fun PersonAvatar(name: String, modifier: Modifier = Modifier) {
	Box(
		modifier = modifier.size(24.dp).clip(FpShape.Pill).background(Slate.S200),
		contentAlignment = Alignment.Center,
	) {
		Text(name.take(1).uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Slate.S700)
	}
}

/** A 12 dp calendar colour dot. */
@Composable
fun CalendarDot(hex: String?, dimmed: Boolean = false) {
	Box(
		Modifier
			.size(12.dp)
			.clip(FpShape.Pill)
			.background(chipColor(hex).copy(alpha = if (dimmed) 0.3f else 1f)),
	)
}
