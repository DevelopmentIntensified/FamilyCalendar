package com.familyplanz.app.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FpTheme

/* The web CalendarToolbar's pieces (issue 291): month chevrons and the view toggle. */

@Composable
internal fun MonthStepButton(label: String, @DrawableRes icon: Int, leading: Boolean, onClick: () -> Unit) {
	TextButton(
		onClick = onClick,
		colors = ButtonDefaults.textButtonColors(contentColor = FpTheme.colors.textBody),
		contentPadding = PaddingValues(horizontal = 8.dp),
	) {
		if (leading) Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(16.dp))
		Text(label)
		if (!leading) Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(16.dp))
	}
}

/** CalendarToolbar's view toggle: slate-100 track (rounded-xl, p-1), white raised active segment. */
@Composable
internal fun ViewToggle(monthGrid: Boolean, onChange: (Boolean) -> Unit) {
	Row(
		modifier = Modifier
			.padding(horizontal = 16.dp, vertical = 8.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(MaterialTheme.colorScheme.surfaceVariant)
			.padding(4.dp)
			.selectableGroup(),
	) {
		ToggleSegment("List", !monthGrid) { onChange(false) }
		ToggleSegment("Month", monthGrid) { onChange(true) }
	}
}

@Composable
private fun ToggleSegment(label: String, selected: Boolean, onClick: () -> Unit) {
	Surface(
		shape = MaterialTheme.shapes.small,
		color = if (selected) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.surfaceVariant,
		shadowElevation = if (selected) 1.dp else 0.dp,
		modifier = Modifier.selectable(selected = selected, onClick = onClick, role = Role.Tab),
	) {
		Text(
			label,
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Medium,
			color = if (selected) FpTheme.colors.textStrong else MaterialTheme.colorScheme.onSurfaceVariant,
			modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
		)
	}
}
