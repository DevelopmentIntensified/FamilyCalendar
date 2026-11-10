package com.familyplanz.app.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.heightIn
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.theme.FpTheme

/* The setting controls the other account cards reach for, split out of
 * AccountProfileSections.kt to keep that file under the detekt function cap. */

/** A preference row: label, optional hint, trailing switch. (AccountCalendarSection.) */
@Composable
fun AccountSwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit, hint: String? = null) {
	Row(modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
		Column(modifier = Modifier.weight(1f)) {
			Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textStrong)
			hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted) }
		}
		Switch(checked = checked, onCheckedChange = onCheckedChange)
	}
}

/** The section's submit: 48 dp primary pill, full width. (AccountPlanSections.) */
@Composable
fun AccountSaveButton(label: String, onClick: () -> Unit) {
	FpPrimaryButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
		Text(label, fontWeight = FontWeight.SemiBold)
	}
}
