package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Slate
import com.familyplanz.app.ui.theme.avatarTone

/* Small parts the dashboard cards share: the Completed card, the round check, a link, an avatar. */

/** CompletedTodayCard: "{n} wins" in emerald, a row per win with its time. */
@Composable
fun CompletedCard(state: DashboardUiState, modifier: Modifier = Modifier) {
	val rows = state.completed
	FpCard(modifier) {
		Text(state.completedTitle, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S900)
		if (rows.isEmpty()) {
			Text(state.completedEmpty, fontSize = 14.sp, color = Slate.S500, modifier = Modifier.padding(top = 8.dp))
			return@FpCard
		}
		Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			Text("${rows.size}", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color(0xFF059669))
			Text(if (rows.size == 1) "win" else "wins", fontSize = 14.sp, color = Slate.S500)
		}
		rows.forEach { (task, time) -> CompletedRow(task.id, task.title, time) }
	}
}

@Composable
private fun CompletedRow(id: String, title: String, time: String) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("completed-row-$id"),
	) {
		Box(
			contentAlignment = Alignment.Center,
			modifier = Modifier.size(16.dp).clip(FpShape.Pill).background(Color(0xFF10B981)),
		) {
			Text("✓", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White)
		}
		Text(title, fontSize = 14.sp, color = Slate.S700, modifier = Modifier.weight(1f))
		if (time.isNotBlank()) Text(time, fontSize = 12.sp, color = Slate.S400)
	}
}

/** The round `h-6 w-6 border-2 border-slate-300` check: a 24 dp disc in a 44 dp target. */
@Composable
fun CheckCircle(label: String, enabled: Boolean, onClick: () -> Unit) {
	Box(
		contentAlignment = Alignment.Center,
		modifier = Modifier
			.size(44.dp)
			.semantics { contentDescription = label }
			.clickable(enabled = enabled, role = Role.Button, onClick = onClick),
	) {
		Box(Modifier.size(24.dp).clip(FpShape.Pill).background(Color.White).border(2.dp, Slate.S300, FpShape.Pill))
	}
}

/** `rounded-lg border-dashed px-3 py-4` note with a primary link under it. */
@Composable
fun DashedNote(text: String, link: String, onClick: () -> Unit, tag: String, linkTag: String) {
	Column(
		horizontalAlignment = Alignment.CenterHorizontally,
		modifier = Modifier.fillMaxWidth().dashedBorder(Slate.S200, 8.dp).padding(horizontal = 12.dp, vertical = 16.dp).testTag(tag),
	) {
		Text(text, fontSize = 14.sp, color = Slate.S400)
		LinkText(link, onClick, linkTag, Modifier.padding(top = 4.dp))
	}
}

/** `text-xs font-semibold text-primary-600` — the cards' "View all … →" links. */
@Composable
fun LinkText(label: String, onClick: () -> Unit, tag: String, modifier: Modifier = Modifier) {
	Text(
		label,
		fontSize = 12.sp,
		fontWeight = FontWeight.SemiBold,
		color = Color(0xFF2563EB),
		modifier = modifier.clickable(role = Role.Button, onClick = onClick).padding(vertical = 8.dp).testTag(tag),
	)
}

/** The avatar disc every member group leads with (20 dp on the board, 24 on kids). */
@Composable
fun MemberDisc(ownerId: String, initials: String, size: Int = 20) {
	val tone = avatarTone(ownerId)
	Box(
		contentAlignment = Alignment.Center,
		modifier = Modifier.size(size.dp).clip(FpShape.Pill).background(tone.container),
	) {
		Text(initials, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = tone.content)
	}
}
