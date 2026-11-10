package com.familyplanz.app.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.ActivityRowDto
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.ui.alerts.relativeTime
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/**
 * AC-FD-10: the family's feed as the web composes it
 * (`family/[familyId]/+page.svelte:593-606`): one sentence per row and a
 * relative time pinned to the row's end (#306), or the page's empty line.
 */
@Composable
internal fun ActivityBand(detail: FamilyDetailDto) {
	FamilyBand("Recent Activity") {
		if (detail.activity.isEmpty()) {
			Text(
				NO_ACTIVITY_COPY,
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
			return@FamilyBand
		}
		Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
			detail.activity.forEachIndexed { index, row -> ActivityRow(row, index) }
		}
	}
}

/** `rounded-lg border-slate-100 bg-slate-50/60 px-2.5 py-1.5`: the sentence wraps, the time never does. */
@Composable
private fun ActivityRow(row: ActivityRowDto, index: Int) {
	val time = row.at?.let { relativeTime(it) }.orEmpty()
	Row(
		horizontalArrangement = Arrangement.spacedBy(12.dp),
		modifier = Modifier
			.fillMaxWidth()
			.clip(MaterialTheme.shapes.small)
			.background(FpTheme.colors.rowSurface)
			.border(1.dp, FpTheme.colors.rowBorder, MaterialTheme.shapes.small)
			.padding(horizontal = 10.dp, vertical = 6.dp)
			.testTag("activity-row-$index"),
	) {
		Text(
			activitySentence(row),
			style = MaterialTheme.typography.bodyMedium,
			color = Slate.S700,
			modifier = Modifier.weight(1f).testTag("activity-text-$index"),
		)
		if (time.isNotEmpty()) {
			Text(
				time,
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
				maxLines = 1,
				softWrap = false,
				modifier = Modifier.testTag("activity-time-$index"),
			)
		}
	}
}

/** "✅ Sam completed 'Mow lawn'" / "📋 Sam assigned 'Mow lawn' to Ada": the web's sentence, word for word. */
fun activitySentence(row: ActivityRowDto): String {
	val completed = row.kind == "completed"
	val target = row.targetName?.takeIf { !completed && it.isNotBlank() }
	return buildString {
		append(if (completed) "✅ " else "📋 ")
		append(row.actorName)
		append(if (completed) " completed '" else " assigned '")
		append(row.title)
		append("'")
		if (target != null) append(" to ").append(target)
	}
}

/** AC-FD-10 verbatim. */
const val NO_ACTIVITY_COPY = "No activity yet \u2014 complete something to get things moving."
