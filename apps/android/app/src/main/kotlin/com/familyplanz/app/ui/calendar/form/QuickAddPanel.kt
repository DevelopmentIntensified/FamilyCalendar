package com.familyplanz.app.ui.calendar.form

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.calendar.CalendarFormActions
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import java.time.LocalDate

/*
 * The web's multi-event panel (EventQuickAdd.svelte): "N events detected",
 * one line per parse, "Create N events" + "Just the first". Only a phrase
 * the parser split gets here (#302).
 */

internal const val QUICK_ADD_MULTI_TAG = "quick-add-multi"

internal fun quickAddListLine(title: String?, date: String?, time: String?): String =
	"${title.orEmpty().ifBlank { "Untitled" }} — ${date.orEmpty()}" +
		time?.takeIf { it.isNotBlank() }?.let { " at $it" }.orEmpty()

/** "2 events detected" + each line + the two buttons, over the Quick Add input. */
@Composable
internal fun QuickAddMultiPanel(findings: List<com.familyplanz.app.data.ParsedEventDto>, actions: CalendarFormActions) {
	val on = Modifier
		.testTag(QUICK_ADD_MULTI_TAG)
		.fillMaxWidth()
		.clip(RoundedCornerShape(10.dp))
		.background(Primary.P50)
		.padding(10.dp)
	Column(on) {
		Text("${findings.size} events detected", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Primary.P700)
		findings.map { quickAddListLine(it.title, it.date, it.startTime) }.forEach { line ->
			Text(line, fontSize = 12.sp, color = Slate.S600)
		}
		Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
			Text(
				"Create ${findings.size} events",
				fontSize = 12.sp,
				fontWeight = FontWeight.SemiBold,
				color = Primary.P700,
				modifier = Modifier
					.clip(RoundedCornerShape(8.dp))
					.background(Primary.P600)
					.clickable(role = Role.Button, onClick = actions.onCreateAll)
					.padding(horizontal = 10.dp, vertical = 6.dp)
					.testTag("quick-add-create-all"),
			)
			Text(
				"Just the first",
				fontSize = 12.sp,
				color = Slate.S600,
				modifier = Modifier
					.clip(RoundedCornerShape(8.dp))
					.clickable(role = Role.Button, onClick = actions.onDismissMulti)
					.padding(horizontal = 10.dp, vertical = 6.dp)
					.testTag("quick-add-dismiss-multi"),
			)
		}
	}
}
