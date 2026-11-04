package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.GlanceEventDto
import com.familyplanz.app.data.VerseDto
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.FpDot
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/* §2.3's readings: the verse band above the cards and Day at a Glance. */

/** DashboardInfoBand: a quiet reading above the cards — no card chrome, no heading. */
@Composable
fun VerseBand(verse: VerseDto) {
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.clip(MaterialTheme.shapes.medium)
			.background(Color(0xB3F8FAFC))
			.padding(horizontal = 12.dp, vertical = 8.dp)
			.testTag("verse-band"),
		verticalArrangement = Arrangement.spacedBy(2.dp),
	) {
		Text("Daily verse", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Slate.S400)
		Text(verse.text, fontSize = 13.sp, fontStyle = FontStyle.Italic, color = Slate.S600)
		Text(
			listOfNotNull(verse.reference, verse.attribution).joinToString(" — "),
			fontSize = 11.sp,
			color = Slate.S400,
		)
	}
}

/** TodayGlanceCard: all-day rows first, then a 56 dp time column per timed row. */
@Composable
fun GlanceCard(state: DashboardUiState, onOpenDayView: () -> Unit, modifier: Modifier = Modifier) {
	val (allDay, timed) = glanceBuckets(state.glanceEvents)
	FpCard(modifier) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
			Text(state.glanceTitle, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S900, modifier = Modifier.weight(1f))
			Text(state.dateLabel, fontSize = 12.sp, color = Slate.S400)
		}
		Spacer(Modifier.height(12.dp))
		allDay.forEach { event -> GlanceRow(event) }
		timed.forEach { event -> GlanceRow(event) }
		if (allDay.isEmpty() && timed.isEmpty()) {
			DashedNote(state.glanceEmpty, "Open day view →", onOpenDayView, "glance-empty", "glance-open-day")
		}
	}
}

@Composable
private fun GlanceRow(event: GlanceEventDto) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(10.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier
			.fillMaxWidth()
			.padding(vertical = 2.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(if (event.allDay) Slate.S50 else Color.Transparent)
			.padding(horizontal = 8.dp, vertical = 8.dp)
			.testTag("glance-row-${event.id}"),
	) {
		if (!event.allDay) TimeColumn(event)
		EventMark(event)
		Text(event.title, fontSize = 14.sp, color = Slate.S700, modifier = Modifier.weight(1f))
		RsvpPill(event.rsvpStatus)
		AttendanceNote(event)
		FamilyChip(event)
	}
}

/** The right-aligned 56 dp column: start over end. */
@Composable
private fun TimeColumn(event: GlanceEventDto) {
	Column(Modifier.width(56.dp), horizontalAlignment = Alignment.End) {
		Text(timeLabel(event.start), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Slate.S700)
		if (!event.end.isNullOrBlank()) Text(timeLabel(event.end), fontSize = 10.sp, color = Slate.S400)
	}
}

/** The event's calendar colour as a 6 dp mark (#067's ChipKindMark). */
@Composable
private fun EventMark(event: GlanceEventDto) {
	val tint = runCatching { Color(android.graphics.Color.parseColor(event.color.orEmpty())) }
		.getOrDefault(FpTheme.colors.chipRail)
	FpDot(tint, size = 6)
}

@Composable
private fun RsvpPill(status: String?) {
	val visual = rsvpVisual(status) ?: return
	val tone = when (status) {
		"going" -> ChipTone(Accent.Emerald100, Accent.Emerald700)
		"maybe" -> ChipTone(Accent.Amber100, Accent.Amber700)
		else -> ChipTone(Accent.Red100, Accent.Red700)
	}
	FpChip("${visual.icon} ${visual.label}", tone)
}

/** AttendanceBadge `variant="row"`: only when more than one person was invited. */
@Composable
private fun AttendanceNote(event: GlanceEventDto) {
	val attendance = event.attendance ?: return
	if (attendance.invited <= 1) return
	FpChip("${attendance.going}/${attendance.invited} going", ChipTone(Slate.S100, Slate.S600))
}

/** The cyan "Family" chip on a family-source event. */
@Composable
private fun FamilyChip(event: GlanceEventDto) {
	if (event.source != "family") return
	FpChip("Family", ChipTone(Color(0xFFECFEFF), Color(0xFF0891B2)))
}
