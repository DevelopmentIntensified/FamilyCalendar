package com.familyplanz.app.ui.secondary.archive

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.ArchiveEventDto
import com.familyplanz.app.data.ArchiveResponse
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.secondary.BackLink
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.LoadGate
import com.familyplanz.app.ui.secondary.PageCard
import com.familyplanz.app.ui.secondary.PageKicker
import com.familyplanz.app.ui.theme.Brand
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

const val ARCHIVE_TITLE = "Archive"
const val ARCHIVE_EMPTY = "No archived events found."
const val ARCHIVE_NOT_ALLOWED = "Archive view not available on your plan."
const val ARCHIVE_UPGRADE = "Upgrade to View Archive"

/** What the archive page can do besides read. */
data class ArchiveActions(
	val onRetry: () -> Unit = {},
	val onOpenCalendar: () -> Unit = {},
	val onOpenEvent: (String) -> Unit = {},
	val onUpgrade: () -> Unit = {},
)

/** `/calendar/archive` at phone width: crumbs, the retention gate as a picture, then a card per month (or the plan-gate copy). */
@Composable
fun ArchiveScreen(state: Load<ArchiveResponse>, actions: ArchiveActions) {
	Row {
		BackLink("Calendar", actions.onOpenCalendar)
		Text(
			"  ›  ",
			modifier = Modifier.align(Alignment.CenterVertically),
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textMuted,
		)
		Text(
			ARCHIVE_TITLE,
			modifier = Modifier.align(Alignment.CenterVertically),
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Medium,
			color = FpTheme.colors.textStrong,
		)
	}
	LoadGate(state, actions.onRetry) { data ->
		RetentionGate(data)
		when {
			!data.archiveAllowed -> PlanGate(data.reason, actions.onUpgrade)
			data.events.isEmpty() -> PageCard { Text(ARCHIVE_EMPTY, style = MaterialTheme.typography.bodyMedium,
				color = MaterialTheme.colorScheme.onSurfaceVariant) }
			else -> MonthCards(data.events, actions.onOpenEvent)
		}
	}
}

@Composable
private fun RetentionGate(data: ArchiveResponse) {
	val scale = remember(data.retentionDays, data.archivedRetentionDays) { retentionScale(data.retentionDays, data.archivedRetentionDays) }
	PageCard(
		modifier = Modifier.testTag("retention-gate"),
		padding = PaddingValues(24.dp),
		borderColor = Slate.S300,
		dashed = true,
	) {
		Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
			Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
				PageKicker("On the ${data.planName ?: "Free"} plan")
				Text(
					"You can look back ${scale.viewable} days",
					style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
					color = FpTheme.colors.textStrong,
				)
				Text(
					"and events stay in the archive for ${scale.deletedAfter} days",
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
				)
			}
			Text(
				familyPill(data.familyCount),
				modifier = Modifier.testTag("retention-family-pill").background(Brand.Mint, FpShape.Pill).padding(horizontal = 10.dp, vertical = 4.dp),
				style = MaterialTheme.typography.labelMedium,
				fontWeight = FontWeight.SemiBold,
				color = Brand.MintInk,
			)
		}
		if (scale.total > 0) RetentionBands(scale)
		Text(
			"The gate is real, but it is stated as a plan limit rather than a date. A family looking for a memory from three years ago " +
				"is told to upgrade, not that it is gone.",
			modifier = Modifier.padding(top = 14.dp),
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
	}
}

@Composable
private fun RetentionBands(scale: RetentionScale) {
	Row(modifier = Modifier.padding(top = 16.dp).fillMaxWidth().height(8.dp).background(Slate.S200, FpShape.Pill)) {
		if (scale.viewablePct > 0) {
			Box(Modifier.weight(scale.viewablePct.toFloat()).height(8.dp).testTag("retention-track-fill").background(Primary.P500, FpShape.Pill))
		}
		if (scale.viewablePct < 100) {
			Box(Modifier.weight((100 - scale.viewablePct).toFloat()).height(8.dp).background(Slate.S300, FpShape.Pill))
		}
	}
	Column(modifier = Modifier.padding(top = 8.dp).testTag("retention-scale"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
		BandRow(Primary.P500, "Viewable now", "${scale.viewable} days")
		BandRow(Slate.S300, "Kept, not viewable", if (scale.kept > 0) "next ${scale.kept}" else "none")
		BandRow(Slate.S100, "Deleted", "after ${scale.deletedAfter} days")
	}
}

@Composable
private fun BandRow(dot: Color, label: String, value: String) {
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
		Box(Modifier.size(10.dp).background(dot, FpShape.Pill))
		Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textBody)
		Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = Slate.S800)
	}
}

/** `rounded-lg border-amber-200 bg-amber-50 p-4` with the plan's own reason and the upgrade pill. */
@Composable
private fun PlanGate(reason: String?, onUpgrade: () -> Unit) {
	Column(
		modifier = Modifier.fillMaxWidth()
			.background(FpTheme.colors.warnSurface, MaterialTheme.shapes.small)
			.padding(16.dp),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Text(
			reason?.takeIf { it.isNotBlank() } ?: ARCHIVE_NOT_ALLOWED,
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.warnContent,
		)
		FpPrimaryButton(onClick = onUpgrade) { Text(ARCHIVE_UPGRADE) }
	}
}

@Composable
private fun MonthCards(events: List<ArchiveEventDto>, onOpenEvent: (String) -> Unit) {
	val months = remember(events) { groupEventsByMonth(events) }
	months.forEach { month ->
		PageCard(modifier = Modifier.testTag("archive-month"), padding = PaddingValues(16.dp)) {
			Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
				Text(month.label, style = MaterialTheme.typography.titleSmall, color = FpTheme.colors.textStrong)
				Text(eventCount(month.events.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
			}
			month.events.forEachIndexed { index, event ->
				if (index > 0) HorizontalDivider(color = Slate.S100)
				EventRow(event) { onOpenEvent(event.id) }
			}
		}
	}
}

@Composable
private fun EventRow(event: ArchiveEventDto, onClick: () -> Unit) {
	FlowRow(
		modifier = Modifier.fillMaxWidth().testTag("archive-event").clickable(onClick = onClick).padding(vertical = 12.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp),
		verticalArrangement = Arrangement.spacedBy(4.dp),
		itemVerticalAlignment = Alignment.CenterVertically,
	) {
		Text(
			archiveEventDate(event.start),
			modifier = Modifier.width(88.dp),
			style = MaterialTheme.typography.bodySmall,
			fontWeight = FontWeight.Bold,
			color = FpTheme.colors.textMuted,
		)
		Text(
			event.title,
			modifier = Modifier.weight(1f),
			style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp),
			fontWeight = FontWeight.SemiBold,
			color = Slate.S800,
		)
		event.calendar?.takeIf { it.isNotBlank() }?.let {
			Text(
				it,
				modifier = Modifier.testTag("archive-calendar").background(Slate.S100, FpShape.Pill).padding(horizontal = 8.dp, vertical = 2.dp),
				style = MaterialTheme.typography.labelSmall,
				fontWeight = FontWeight.SemiBold,
				color = Slate.S600,
			)
		}
		// max-[419px]:w-full - at phone width the place gets its own line.
		event.location?.takeIf { it.isNotBlank() }?.let {
			Text(it, modifier = Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodySmall,
				color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
		}
	}
}
