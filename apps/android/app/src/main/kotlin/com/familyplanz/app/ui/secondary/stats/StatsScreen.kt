package com.familyplanz.app.ui.secondary.stats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.StatsPersonDto
import com.familyplanz.app.data.StatsResponse
import com.familyplanz.app.ui.secondary.CardHeading
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.LoadGate
import com.familyplanz.app.ui.secondary.PageCard
import com.familyplanz.app.ui.secondary.PageKicker
import com.familyplanz.app.ui.secondary.PageLead
import com.familyplanz.app.ui.secondary.PageTitle
import com.familyplanz.app.ui.secondary.PageTones
import com.familyplanz.app.ui.theme.Brand
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

const val STATS_TITLE = "Task stats"
const val STATS_EMPTY_RECENT = "Nothing checked off yet — your first win awaits."

/** `/calendar/stats` at phone width: streak hero, recently completed, this month, the two assignment bar charts. */
@Composable
fun StatsScreen(state: Load<StatsResponse>, onRetry: () -> Unit) {
	PageTitleBlock()
	LoadGate(state, onRetry) { data ->
		StreakHero(data)
		RecentlyCompleted(data)
		ThisMonth(data)
		BarCard("Tasks land on", data.stats.topAssignees, "No assignments out yet.")
		BarCard("Tasks come from", data.stats.topAssigners, "Nobody has assigned you anything yet.")
	}
}

@Composable
private fun PageTitleBlock() {
	Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
		PageTitle(STATS_TITLE)
		PageLead(
			"Everything here is a read of the completion history - the one record that survives the recurring-task cursor overwriting itself.",
		)
	}
}

@Composable
private fun StreakHero(data: StatsResponse) {
	val weeks = remember(data.completionIso, data.todayIso) { recentWeekCells(data.completionIso, data.todayIso) }
	val shape = MaterialTheme.shapes.medium
	Column(
		modifier = Modifier.fillMaxWidth().testTag("streak-hero")
			.background(Brush.linearGradient(listOf(PageTones.Orange50, Color.White)), shape)
			.border(1.dp, PageTones.Orange100, shape)
			.padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(16.dp),
	) {
		Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
			PageKicker("Current streak")
			Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				Text(
					data.streak.current.toString(),
					modifier = Modifier.testTag("streak-weeks"),
					style = MaterialTheme.typography.displaySmall.copy(fontSize = 48.sp, lineHeight = 48.sp),
					color = FpTheme.colors.textStrong,
				)
				Text("weeks", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = Slate.S700)
			}
			val frozen = if (data.streak.freezeUsedInCurrentGap) " · one frozen" else ""
			Text("Best: ${data.streak.best} weeks$frozen", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		}
		WeekSquares(weeks)
		Text(
			"Weeks of \"at least one task completed\". A week is the smallest unit that survives a normal family week, " +
				"and it is the unit a missed Sunday does not erase.",
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
	}
}

@Composable
private fun WeekSquares(weeks: List<WeekCell>) {
	Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
		weeks.forEach { week ->
			Column(
				modifier = Modifier.weight(1f).testTag("streak-week"),
				horizontalAlignment = Alignment.CenterHorizontally,
				verticalArrangement = Arrangement.spacedBy(6.dp),
			) {
				Box(
					modifier = Modifier.fillMaxWidth().height(36.dp)
						.then(if (week.isCurrent) Modifier.border(2.dp, Primary.P500, MaterialTheme.shapes.small) else Modifier)
						.padding(if (week.isCurrent) 3.dp else 0.dp)
						// `bg-mint-200` is not a colour in the web's Tailwind config; the brand mint is the intended tone.
						.background(if (week.hit) Brand.Mint else Slate.S100, MaterialTheme.shapes.small)
						.testTag(if (week.hit) "streak-hit" else "streak-miss"),
				)
				Text(
					week.label,
					style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
					fontWeight = FontWeight.Bold,
					color = FpTheme.colors.textMuted,
				)
			}
		}
	}
}

@Composable
private fun RecentlyCompleted(data: StatsResponse) {
	PageCard(modifier = Modifier.testTag("recently-completed")) {
		CardHeading("Recently completed", Modifier.padding(bottom = 12.dp))
		val rows = data.stats.recentlyCompleted
		if (rows.isEmpty()) {
			Text(STATS_EMPTY_RECENT, modifier = Modifier.padding(vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textMuted)
		}
		rows.forEachIndexed { index, row ->
			if (index > 0) HorizontalDivider(color = Slate.S100)
			Row(
				modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
				verticalAlignment = Alignment.CenterVertically,
				horizontalArrangement = Arrangement.spacedBy(8.dp),
			) {
				Text(row.title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = Slate.S800, maxLines = 1, overflow = TextOverflow.Ellipsis)
				if (row.recurring) {
					Text(
						"↻ repeating",
						modifier = Modifier.background(PageTones.Orange50, FpShape.Pill).padding(horizontal = 8.dp, vertical = 2.dp),
						style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
						fontWeight = FontWeight.SemiBold,
						color = PageTones.Orange700,
					)
				}
				Text(
					completedLabel(row.completedAt),
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textMuted,
				)
			}
		}
		Text(
			"The repeating tag is not a flag on the task — it is a recurrence on the same row, shown next to a timestamp that lives in a different table.",
			modifier = Modifier.padding(top = 10.dp),
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
	}
}

@Composable
private fun ThisMonth(data: StatsResponse) {
	val month = data.month ?: data.stats.month
	PageCard {
		CardHeading("This month")
		monthCompletionLabel(data.todayIso)?.let {
			Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
		}
		Row(modifier = Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
			BigFigure((month?.completed ?: 0).toString(), "completed", "month-completed")
			BigFigure((month?.recurring ?: 0).toString(), "of them recurring", "month-recurring")
		}
	}
}

@Composable
private fun BigFigure(value: String, caption: String, tag: String) {
	Column {
		Text(
			value,
			modifier = Modifier.testTag(tag),
			style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold),
			color = FpTheme.colors.textStrong,
		)
		Text(caption, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
	}
}

@Composable
private fun BarCard(title: String, rows: List<StatsPersonDto>, empty: String) {
	val bars = remember(rows) { assignmentBars(rows) }
	PageCard {
		CardHeading(title, Modifier.padding(bottom = 12.dp))
		if (bars.isEmpty()) Text(empty, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textMuted)
		bars.forEach { bar ->
			Row(
				modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
				verticalAlignment = Alignment.CenterVertically,
				horizontalArrangement = Arrangement.spacedBy(10.dp),
			) {
				Text(
					bar.name,
					modifier = Modifier.width(80.dp),
					style = MaterialTheme.typography.bodyMedium,
					fontWeight = FontWeight.SemiBold,
					color = Slate.S700,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
				)
				Track(bar.pct, Modifier.weight(1f))
				Text(
					bar.total.toString(),
					modifier = Modifier.width(32.dp),
					textAlign = TextAlign.End,
					style = MaterialTheme.typography.bodySmall,
					fontWeight = FontWeight.Bold,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
				)
			}
		}
	}
}

/** `h-2.5 rounded-full bg-slate-100` track with a primary-500 fill [pct] wide. */
@Composable
private fun Track(pct: Int, modifier: Modifier) {
	Box(modifier = modifier.height(10.dp).background(Slate.S100, FpShape.Pill)) {
		if (pct > 0) {
			Box(
				modifier = Modifier.fillMaxWidth(pct / 100f).height(10.dp).testTag("bar-fill")
					.background(Primary.P500, RoundedCornerShape(50)),
			)
		}
	}
}
