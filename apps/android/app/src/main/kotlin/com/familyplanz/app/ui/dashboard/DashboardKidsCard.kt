package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.KidsEventDto
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.Slate

/* KidsScheduleCard: one band per child, each event's title with its time and place. */

@Composable
fun KidsCard(state: DashboardUiState, onViewFamily: () -> Unit, modifier: Modifier = Modifier) {
	FpCard(modifier) {
		Text("Kids' Schedule", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S900)
		Spacer(Modifier.height(12.dp))
		val groups = state.kidsGroups
		if (groups.isEmpty()) {
			DashedNote(state.kidsEmpty, "View family →", onViewFamily, "kids-empty", "kids-view-family")
			return@FpCard
		}
		groups.forEach { group -> KidsGroupBlock(group) }
	}
}

/** `rounded-xl border-slate-100 bg-slate-50/50 px-3 py-2.5`, labelled by the child's name. */
@Composable
private fun KidsGroupBlock(group: KidGroup) {
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.padding(bottom = 8.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(Slate.S50)
			.padding(horizontal = 12.dp, vertical = 10.dp)
			.testTag("kids-group-${group.id}"),
	) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			MemberDisc(group.id, group.initials, size = 24)
			Text(group.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S900)
		}
		group.events.forEach { event -> KidsEventRow(event) }
	}
}

@Composable
private fun KidsEventRow(event: KidsEventDto) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier.fillMaxWidth().padding(top = 4.dp).testTag("kids-event-${event.id}"),
	) {
		Text(event.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Slate.S900, modifier = Modifier.weight(1f))
		Text(kidsTimeLabel(event).uppercase(), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Slate.S400)
		event.location?.takeIf { it.isNotBlank() }?.let { place ->
			Text("· $place", fontSize = 12.sp, color = Slate.S500, maxLines = 1)
		}
	}
}
