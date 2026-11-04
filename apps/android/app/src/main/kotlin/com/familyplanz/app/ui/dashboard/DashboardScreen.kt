package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Slate

/** What the Dashboard screen can ask for. */
data class DashboardActions(
	val onPrev: () -> Unit = {},
	val onNext: () -> Unit = {},
	val onToday: () -> Unit = {},
	val onOpenDayView: () -> Unit = {},
	val onBackToCalendar: () -> Unit = {},
	val onRetry: () -> Unit = {},
	val onToggleTask: (com.familyplanz.app.data.TaskDto) -> Unit = {},
	val onPriority: (com.familyplanz.app.data.TaskDto, String) -> Unit = { _, _ -> },
	val onQuickType: (String) -> Unit = {},
	val onQuickCategory: (String) -> Unit = {},
	val onQuickAdd: () -> Unit = {},
	val onOpenTasks: () -> Unit = {},
	val onOpenFamilyTasks: () -> Unit = {},
	val onOpenGroceries: (String?) -> Unit = {},
)

/**
 * `/calendar/dashboard` at phone width: white canvas, gutter 8, one column of
 * `rounded-2xl` cards with 16 dp gaps (§2.3).
 */
@Composable
fun DashboardScreen(state: DashboardUiState, actions: DashboardActions, modifier: Modifier = Modifier) {
	LazyColumn(
		modifier = modifier.fillMaxSize().background(Color.White).testTag("dashboard-screen"),
		contentPadding = PaddingValues(horizontal = 8.dp, vertical = 16.dp),
		verticalArrangement = Arrangement.spacedBy(16.dp),
	) {
		item { DashboardHeader(state, actions) }
		when {
			state.loading -> item { SkeletonBlocks(listOf(44, 44, 44, 56, 56, 56)) }
			state.loadError != null && state.payload == null -> item { DashboardLoadError(actions.onRetry) }
			else -> dashboardCards(state, actions)
		}
	}
}

/** The card band, in §2.3's order: verse, Glance, Top-3, Completed, Board, Kids, Groceries. */
private fun androidx.compose.foundation.lazy.LazyListScope.dashboardCards(
	state: DashboardUiState,
	actions: DashboardActions,
) {
	state.warningBanner?.let { banner -> item { WarningCard(banner) } }
	state.verse?.let { verse -> item { VerseBand(verse) } }
	if (state.showsGlance) {
		item { GlanceCard(state, actions.onOpenDayView, Modifier.testTag("card-glance")) }
	}
	if (state.showsTop3) {
		item { Top3Card(state, actions, Modifier.testTag("card-top3")) }
	}
	if (state.showsCompleted) {
		item { CompletedCard(state, Modifier.testTag("card-completed")) }
	}
	if (state.showsBoard) {
		item { BoardCard(state, actions, Modifier.testTag("card-board")) }
	}
	if (state.showsKids) {
		item { KidsCard(state, actions.onOpenFamilyTasks, Modifier.testTag("card-kids")) }
	}
	if (state.showsGroceries) {
		item { GroceriesCard(state, actions.onOpenGroceries, Modifier.testTag("card-groceries")) }
	}
}

@Composable
private fun DashboardHeader(state: DashboardUiState, actions: DashboardActions) {
	FlowRow(
		modifier = Modifier.fillMaxWidth().testTag("dashboard-header"),
		horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.Start),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Column(Modifier.weight(1f, fill = false)) {
			Text(
				"Day Dashboard",
				fontSize = 20.sp,
				fontWeight = FontWeight.Bold,
				color = Slate.S900,
				modifier = Modifier.testTag("dashboard-title"),
			)
			Text(
				state.dateLine,
				fontSize = 14.sp,
				color = Slate.S500,
				modifier = Modifier.testTag("dashboard-date-line"),
			)
		}
		DayNav(state, actions)
		HeaderButton("Open Day View", actions.onOpenDayView, "dashboard-open-day-view")
		HeaderButton("Back to Calendar", actions.onBackToCalendar, "dashboard-back-calendar")
	}
}

/** DayNav `period="day"`: Today ‹ ›, the same navigator the calendar header uses. */
@Composable
private fun DayNav(state: DashboardUiState, actions: DashboardActions) {
	Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
		if (!state.isToday) {
			NavArrow("Today", "Back to today", actions.onToday, "day-nav-today")
		}
		NavArrow("‹", "Previous day", actions.onPrev, "day-nav-prev")
		NavArrow("›", "Next day", actions.onNext, "day-nav-next")
	}
}

@Composable
private fun NavArrow(label: String, description: String, onClick: () -> Unit, tag: String) {
	Text(
		label,
		fontSize = 14.sp,
		fontWeight = FontWeight.SemiBold,
		color = Slate.S700,
		modifier = Modifier
			.heightIn(min = 44.dp)
			.clip(FpShape.Pill)
			.background(Color.White)
			.semantics { contentDescription = description }
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 12.dp)
			.testTag(tag),
	)
}

/** `rounded-lg border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700`. */
@Composable
private fun HeaderButton(label: String, onClick: () -> Unit, tag: String) {
	Text(
		label,
		fontSize = 14.sp,
		fontWeight = FontWeight.Medium,
		color = Slate.S700,
		modifier = Modifier
			.heightIn(min = 44.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(Color.White)
			.border(1.dp, Slate.S300, MaterialTheme.shapes.medium)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 16.dp, vertical = 12.dp)
			.testTag(tag),
	)
}

/** `rounded-2xl border-amber-200 bg-amber-50 p-3 text-sm text-amber-800`, role=alert. */
@Composable
private fun WarningCard(text: String) {
	Text(
		text,
		fontSize = 14.sp,
		color = Accent.Amber800,
		modifier = Modifier
			.fillMaxWidth()
			.clip(MaterialTheme.shapes.large)
			.background(Color(0xFFFFFBEB))
			.border(1.dp, Accent.Amber200, MaterialTheme.shapes.large)
			.padding(12.dp)
			.testTag("dashboard-warning"),
	)
}

/** Couldn't load the dashboard. + Retry. */
@Composable
private fun DashboardLoadError(onRetry: () -> Unit) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier
			.fillMaxWidth()
			.clip(MaterialTheme.shapes.large)
			.background(Accent.Red50)
			.border(1.dp, Accent.Red200, MaterialTheme.shapes.large)
			.padding(horizontal = 12.dp, vertical = 12.dp)
			.testTag("dashboard-error"),
	) {
		Text(
			"Couldn't load the dashboard.",
			fontSize = 14.sp,
			color = Accent.Red700,
			modifier = Modifier.weight(1f),
		)
		Text(
			"Retry",
			fontSize = 14.sp,
			fontWeight = FontWeight.SemiBold,
			color = Accent.Red700,
			modifier = Modifier.clickable(role = Role.Button, onClick = onRetry).padding(8.dp).testTag("dashboard-retry"),
		)
	}
}
