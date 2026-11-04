@file:Suppress("TooManyFunctions")
package com.familyplanz.app.ui.calendar

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.model.CalendarEmpty
import com.familyplanz.app.ui.calendar.model.VisibleCalendar
import com.familyplanz.app.ui.calendar.model.monthTitle
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.YearMonth

/*
 * CalendarToolbar (#292 L2): the DateNav pill, the three-segment view toggle
 * (no Day), Add and Select toggles, the actions menu trigger and the search
 * row. Labels are screen-reader only on a phone (AC-CAL-13).
 */

@Composable
fun CalendarToolbar(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions, menu: @Composable () -> Unit = {}) {
	Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp)) {
		DateNav(state, actions)
		Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			ViewToggle(state.view, actions.nav.onSetView)
			Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
				ToggleButton(
					label = "Add by dragging a time range",
					on = state.addMode,
					onClick = actions.modes.onToggleAdd,
				) { WeekIcon(color = if (state.addMode) Primary.P700 else Slate.S400) }
				ToggleButton(
					label = "Select events to edit in bulk",
					on = state.selectionMode,
					onClick = { actions.modes.onSetSelection(!state.selectionMode) },
				) { CheckIcon(color = if (state.selectionMode) Primary.P700 else Slate.S400) }
			}
			ActionsButton(hidden = state.hiddenCalendars.size, onClick = { actions.sheets.onOpen(CalendarSheet.Actions) })
			menu()
		}
		SearchRow(state, visible, actions)
	}
	HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/** One pill: [Month YYYY v][Today][<][>] (DayNav.svelte:48-52). */
@Composable
private fun DateNav(state: CalendarUiState, actions: CalendarActions) {
	val currentPeriod = isCurrentPeriod(state)
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.height(40.dp)
			.clip(MaterialTheme.shapes.medium)
			.border(1.dp, Slate.S200, MaterialTheme.shapes.medium)
			.background(MaterialTheme.colorScheme.surface)
			.testTag("date-nav"),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Box(
			modifier = Modifier.weight(1f).height(40.dp).clickable(onClick = { actions.sheets.onOpen(CalendarSheet.MonthPicker(state.month.year)) }),
			contentAlignment = Alignment.CenterStart,
		) {
			Text(
				monthTitle(state.month),
				fontSize = 18.sp,
				fontWeight = FontWeight.Bold,
				color = FpTheme.colors.textStrong,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
				modifier = Modifier.padding(horizontal = 12.dp),
			)
		}
		Box(
			modifier = Modifier
				.height(40.dp)
				.alpha(if (currentPeriod) 0.5f else 1f)
				.clickable(onClick = actions.nav.onToday)
				.padding(horizontal = 14.dp),
			contentAlignment = Alignment.Center,
		) {
			Text("Today", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S700)
		}
		PeriodArrow("Previous period", left = true, onClick = actions.nav.onPrev)
		PeriodArrow("Next period", left = false, onClick = actions.nav.onNext)
	}
}

/** Today wears 50% opacity on the current period but stays enabled (AC-CAL-12). */
private fun isCurrentPeriod(state: CalendarUiState): Boolean = when (state.view) {
	CalendarView.WEEK -> com.familyplanz.app.ui.calendar.model.weekStartOf(state.anchor, state.mondayFirst) ==
		com.familyplanz.app.ui.calendar.model.weekStartOf(state.today, state.mondayFirst)

	CalendarView.DAY -> state.anchor == state.today
	else -> state.month == YearMonth.from(state.today)
}

@Composable
private fun PeriodArrow(label: String, left: Boolean, onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.size(width = 44.dp, height = 40.dp)
			.semantics { contentDescription = label }
			.clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
		contentAlignment = Alignment.Center,
	) {
		Text(if (left) "\u2039" else "\u203A", fontSize = 20.sp, color = Slate.S500)
	}
}

/** slate-100 track, white raised segment for the chosen view; Month, Week, List only. */
@Composable
private fun ViewToggle(view: CalendarView, onSetView: (CalendarView) -> Unit) {
	Row(
		modifier = Modifier
			.clip(MaterialTheme.shapes.medium)
			.background(Slate.S100)
			.padding(4.dp)
			.testTag("view-toggle"),
		horizontalArrangement = Arrangement.spacedBy(2.dp),
	) {
		listOf(CalendarView.MONTH, CalendarView.WEEK, CalendarView.LIST).forEach { option ->
			val selected = view == option || (view == CalendarView.DAY && option == CalendarView.MONTH)
			Box(
				modifier = Modifier
					.size(width = 36.dp, height = 40.dp)
					.clip(MaterialTheme.shapes.small)
					.background(if (selected) MaterialTheme.colorScheme.surface else Color.Transparent)
					.semantics { contentDescription = option.label }
					.clickable(role = Role.Tab, onClick = { onSetView(option) }),
				contentAlignment = Alignment.Center,
			) {
				when (option) {
					CalendarView.MONTH -> MonthIcon(if (selected) Slate.S900 else Slate.S500)
					CalendarView.WEEK -> WeekIcon(color = if (selected) Slate.S900 else Slate.S500)
					else -> ListIcon(if (selected) Slate.S900 else Slate.S500)
				}
			}
		}
	}
}

@Composable
private fun ToggleButton(label: String, on: Boolean, onClick: () -> Unit, icon: @Composable () -> Unit) {
	Box(
		modifier = Modifier
			.size(width = 40.dp, height = 40.dp)
			.clip(MaterialTheme.shapes.medium)
			.border(1.dp, if (on) Primary.P300 else Slate.S200, MaterialTheme.shapes.medium)
			.background(if (on) Primary.P50 else Color.Transparent)
			.semantics { contentDescription = label }
			.clickable(role = Role.Button, onClick = onClick),
		contentAlignment = Alignment.Center,
	) {
		icon()
	}
}

/** The actions trigger, wearing the hidden-filter count (AC-CAL-16). */
@Composable
private fun ActionsButton(hidden: Int, onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.size(44.dp)
			.clip(MaterialTheme.shapes.medium)
			.border(1.dp, Slate.S200, MaterialTheme.shapes.medium)
			.background(MaterialTheme.colorScheme.surface)
			.semantics { contentDescription = "Calendar actions" }
			.clickable(role = Role.Button, onClick = onClick),
		contentAlignment = Alignment.Center,
	) {
		Text("\u22EE", fontSize = 18.sp, color = Slate.S500)
		if (hidden > 0) {
			Box(
				modifier = Modifier
					.align(Alignment.TopEnd)
					.size(18.dp)
					.clip(FpShape.Pill)
					.background(Slate.S700)
					.testTag("hidden-badge"),
				contentAlignment = Alignment.Center,
			) {
				Text("$hidden", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
			}
		}
	}
}

/** Search row: the web's placeholder, "N of M" and a Clear while searching. */
@Composable
private fun SearchRow(state: CalendarUiState, visible: VisibleCalendar, actions: CalendarActions) {
	Row(
		modifier = Modifier
			.heightIn(min = 40.dp)
			.fillMaxWidth()
			.clip(MaterialTheme.shapes.medium)
			.border(1.dp, Slate.S200, MaterialTheme.shapes.medium)
			.background(MaterialTheme.colorScheme.surface)
			.padding(horizontal = 12.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Box(modifier = Modifier.weight(1f)) {
			BasicTextField(
				value = state.query,
				onValueChange = actions.filters.onQuery,
				singleLine = true,
				textStyle = TextStyle(fontSize = 14.sp, color = FpTheme.colors.textStrong),
				modifier = Modifier.fillMaxWidth().testTag("calendar-search"),
			)
			if (state.query.isEmpty()) {
				Text("Search events, places, notes.", fontSize = 14.sp, color = FpTheme.colors.textMuted)
			}
		}
		if (state.query.isNotBlank()) {
			Text(
				if (visible.matches == 0 && visible.empty == CalendarEmpty.SEARCH) "No matches" else "${visible.matches} of ${visible.total}",
				fontSize = 12.sp,
				color = FpTheme.colors.textMuted,
			)
			Text(
				"Clear",
				fontSize = 13.sp,
				fontWeight = FontWeight.SemiBold,
				color = Primary.P700,
				modifier = Modifier.clickable(role = Role.Button, onClick = { actions.filters.onQuery("") }).padding(start = 8.dp),
			)
		}
	}
}

/* Three tiny Canvas glyphs (no icon font here): a month grid, a week column
 * set and a list. */

@Composable
private fun MonthIcon(color: Color) {
	Canvas(Modifier.size(16.dp)) {
		val cell = size.width / 4.5f
		for (row in 0 until 3) for (col in 0 until 3) {
			drawRect(color, Offset(col * (cell + 1f), row * (cell + 1f) + 2f), Size(cell, cell))
		}
		drawRect(color, Offset(0f, 0f), Size(size.width, 1.5f))
	}
}

@Composable
private fun WeekIcon(color: Color) {
	Canvas(Modifier.size(16.dp)) {
		drawRect(color, Offset(0f, 0f), Size(size.width, 1.5f))
		for (col in 0 until 3) {
			val x = col * (size.width / 3f) + 1f
			drawRect(color, Offset(x, 4f), Size(size.width / 3.4f, size.height - 4f))
		}
	}
}

@Composable
private fun ListIcon(color: Color) {
	Canvas(Modifier.size(16.dp)) {
		for (row in 0 until 3) {
			drawRect(color, Offset(0f, row * 6f + 1f), Size(size.width, 1.8f))
		}
	}
}

/** CheckIcon is drawn from the same Canvas vocabulary so the toggle needs no font. */
@Composable
private fun CheckIcon(color: Color) {
	Canvas(Modifier.size(16.dp)) {
		drawRect(color, Offset(1f, 8f), Size(6f, 2f))
		drawRect(color, Offset(6f, 5f), Size(2f, 6f))
		drawRect(color, Offset(8f, 2f), Size(6f, 2f))
	}
}

/** Kept so a caller can preview the toolbar's month label without a state. */
internal fun toolbarMonthLabel(month: YearMonth): String = monthTitle(month)
