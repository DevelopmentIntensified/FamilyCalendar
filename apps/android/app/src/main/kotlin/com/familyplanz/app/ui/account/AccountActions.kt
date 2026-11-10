package com.familyplanz.app.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpTheme

/** Everything the Account screen can ask of the app (one shape, so the cards stay pure). */
@Suppress("LongParameterList")
class AccountActions(
	val onSelectSection: (AccountSection) -> Unit = {},
	val onBack: () -> Unit = {},
	val onFirstName: (String) -> Unit = {},
	val onLastName: (String) -> Unit = {},
	val onSaveProfile: () -> Unit = {},
	val onEmail: (String) -> Unit = {},
	val onSaveEmail: () -> Unit = {},
	val onWeekStart: (String) -> Unit = {},
	val onDefaultView: (String) -> Unit = {},
	val onTimeZone: (String) -> Unit = {},
	val onColour: (String) -> Unit = {},
	val onSyncToFamily: (Boolean) -> Unit = {},
	val onSmartCreation: (Boolean) -> Unit = {},
	val onDailyVerse: (Boolean) -> Unit = {},
	val onTranslation: (String) -> Unit = {},
	val onSponsorship: (Boolean) -> Unit = {},
	val onModule: (String, Boolean) -> Unit = { _, _ -> },
	val onNotification: (String, Boolean) -> Unit = { _, _ -> },
	val onRevokeSessions: () -> Unit = {},
	val onTokenName: (String) -> Unit = {},
	val onCreateToken: () -> Unit = {},
	val onRevokeToken: (String) -> Unit = {},
	val onDismissToken: () -> Unit = {},
	val onDeleteConfirm: (String) -> Unit = {},
	val onDelete: () -> Unit = {},
	val onOpenPlans: () -> Unit = {},
	val onJoinWaitlist: () -> Unit = {},
	val onOpenAlerts: () -> Unit = {},
	val onOpenFamily: () -> Unit = {},
	val onCreateFamily: () -> Unit = {},
	val onClaim: () -> Unit = {},
	val onReportBug: () -> Unit = {},
	val onExport: () -> Unit = {},
)

/** A labelled radio-style row used by the calendar settings (one choice per group). */
@Composable
fun AccountChoiceRow(
	label: String,
	options: List<Pair<String, String>>,
	selected: String,
	onSelect: (String) -> Unit,
) {
	Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
		color = FpTheme.colors.textStrong)
	Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
		options.forEach { (id, text) ->
			val on = selected == id
			FilterChip(
				selected = on,
				onClick = { onSelect(id) },
				label = { Text(text) },
				colors = fpFilterChipColors(),
				border = fpFilterChipBorder(on),
			)
		}
	}
}

/** One line of the plan's limits table. */
@Composable
fun AccountLimitRow(label: String, value: String) {
	Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
		Text(label, style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textBody, modifier = Modifier.weight(1f))
		Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
	}
}
