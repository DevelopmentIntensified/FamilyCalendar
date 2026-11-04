package com.familyplanz.app.ui.secondary.print

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.PrintCellDto
import com.familyplanz.app.data.PrintItemDto
import com.familyplanz.app.data.PrintMonthDto
import com.familyplanz.app.data.PrintMonthRef
import com.familyplanz.app.ui.secondary.BackLink
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.LoadGate
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

const val PRINT_TITLE = "Print"
const val PRINT_BUTTON = "Print"
const val PRINT_JUMP = "Jump to now ↓"
private const val DAYS = 7
private const val CELL_MIN_HEIGHT = 96

/** What the print page can do besides show a month. */
data class PrintActions(
	val onRetry: () -> Unit = {},
	val onBack: () -> Unit = {},
	val onShow: (PrintMonthRef) -> Unit = {},
	val onJumpToNow: () -> Unit = {},
	val onPrint: (PrintMonthDto) -> Unit = {},
)

/** `/calendar/print` at phone width: the controls, then the fridge sheet (a 7-column month grid). */
@Composable
fun PrintScreen(state: Load<PrintMonthDto>, actions: PrintActions) {
	LoadGate(state, actions.onRetry) { month ->
		Controls(month, actions)
		Sheet(month)
	}
}

@Composable
private fun Controls(month: PrintMonthDto, actions: PrintActions) {
	Column {
		BackLink("‹ Calendar", actions.onBack)
		FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			OutlineAction("← ${shortMonth(month.prev)}", Modifier.testTag("print-prev")) { actions.onShow(month.prev) }
			if (!month.isCurrentMonth) {
				OutlineAction(PRINT_JUMP, Modifier.testTag("print-jump"), primary = true, onClick = actions.onJumpToNow)
			}
			OutlineAction("${shortMonth(month.next)} →", Modifier.testTag("print-next")) { actions.onShow(month.next) }
			Text(
				PRINT_BUTTON,
				modifier = Modifier.testTag("print-button").heightIn(min = 44.dp)
					.clip(MaterialTheme.shapes.small).background(MaterialTheme.colorScheme.primary)
					.clickable { actions.onPrint(month) }
					.padding(horizontal = 16.dp, vertical = 10.dp),
				style = MaterialTheme.typography.bodyMedium,
				fontWeight = FontWeight.SemiBold,
				color = MaterialTheme.colorScheme.onPrimary,
			)
		}
	}
}

@Composable
private fun OutlineAction(text: String, modifier: Modifier, primary: Boolean = false, onClick: () -> Unit) {
	val border = if (primary) Primary.P200 else MaterialTheme.colorScheme.outlineVariant
	Text(
		text,
		modifier = modifier.heightIn(min = 44.dp)
			.clip(MaterialTheme.shapes.small)
			.background(if (primary) Primary.P50 else MaterialTheme.colorScheme.surface)
			.border(1.dp, border, MaterialTheme.shapes.small)
			.clickable(onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 10.dp),
		style = MaterialTheme.typography.bodyMedium,
		fontWeight = if (primary) FontWeight.Medium else FontWeight.Normal,
		color = if (primary) Primary.P600 else FpTheme.colors.textBody,
	)
}

@Composable
private fun Sheet(month: PrintMonthDto) {
	val shape = MaterialTheme.shapes.medium
	Column(
		modifier = Modifier.fillMaxWidth().testTag("fridge-sheet").background(MaterialTheme.colorScheme.surface, shape).padding(16.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
			Text(
				"${month.monthName} ${month.year}",
				style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black),
				color = FpTheme.colors.textStrong,
				textAlign = TextAlign.Center,
			)
			Text(
				sheetSubtitle(month.familyName).uppercase(),
				style = MaterialTheme.typography.bodySmall.copy(letterSpacing = 2.5.sp),
				color = FpTheme.colors.textMuted,
				textAlign = TextAlign.Center,
			)
		}
		Grid(month)
		Text("familyplanz.com", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = Slate.S300)
	}
}

/** `grid-cols-7 gap-px` over a slate-300 ground, clipped to rounded-lg. */
@Composable
private fun Grid(month: PrintMonthDto) {
	val labels = weekdayLabels(month.weekStart)
	Column(
		modifier = Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small)
			.background(Slate.S300).border(1.dp, Slate.S300, MaterialTheme.shapes.small),
		verticalArrangement = Arrangement.spacedBy(1.dp),
	) {
		Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
			labels.forEach { label ->
				Text(
					label.uppercase(),
					modifier = Modifier.weight(1f).background(Slate.S100).padding(vertical = 6.dp),
					textAlign = TextAlign.Center,
					style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.5.sp),
					fontWeight = FontWeight.Bold,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
					maxLines = 1,
				)
			}
		}
		month.grid.chunked(DAYS).forEach { week ->
			Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
				week.forEach { cell -> Cell(cell, Modifier.weight(1f)) }
			}
		}
	}
}

@Composable
private fun Cell(cell: PrintCellDto, modifier: Modifier) {
	val ring = if (cell.isToday) Modifier.border(2.dp, Primary.P400) else Modifier
	Column(
		modifier = modifier.heightIn(min = CELL_MIN_HEIGHT.dp)
			.background(if (cell.inMonth) Color.White else Slate.S50).then(ring).padding(4.dp)
			.testTag("print-cell-${cell.iso}"),
		verticalArrangement = Arrangement.spacedBy(2.dp),
	) {
		Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
			DayNumber(cell)
			if (cell.items.size > PRINT_MAX_ITEMS) {
				Text(
					"+${cell.items.size - PRINT_MAX_ITEMS}",
					style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
					fontWeight = FontWeight.SemiBold,
					color = FpTheme.colors.textMuted,
				)
			}
		}
		cell.items.take(PRINT_MAX_ITEMS).forEach { Item(it) }
	}
}

@Composable
private fun DayNumber(cell: PrintCellDto) {
	Box(
		modifier = Modifier.size(20.dp).then(if (cell.isToday) Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary) else Modifier),
		contentAlignment = Alignment.Center,
	) {
		Text(
			cell.day.toString(),
			style = MaterialTheme.typography.labelSmall,
			fontWeight = FontWeight.Bold,
			color = when {
				cell.isToday -> Color.White
				cell.inMonth -> Slate.S700
				else -> Slate.S300
			},
		)
	}
}

@Composable
private fun Item(item: PrintItemDto) {
	Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		Box(Modifier.padding(top = 3.dp).size(8.dp).background(parseColor(item.color), FpShape.Pill))
		Text(
			itemText(item),
			style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, lineHeight = 11.sp),
			fontWeight = FontWeight.SemiBold,
			color = Slate.S800,
			maxLines = 2,
			overflow = TextOverflow.Ellipsis,
		)
	}
}

/** A timed item reads "9a Soccer" with the time in the lighter weight; an all-day item is just the title. */
internal fun itemText(item: PrintItemDto): AnnotatedString = buildAnnotatedString {
	if (!item.allDay && item.time != null) {
		withStyle(SpanStyle(fontWeight = FontWeight.Normal, color = Slate.S500)) { append("${item.time} ") }
	}
	append(item.title)
}

private fun parseColor(hex: String): Color =
	runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(FpTheme.colors.chipRail)
