package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/* The web TaskRow's chrome (issue 291): the round check and the row surface. */

/**
 * TaskRow's round check: 20dp ring, border-2 slate-300; done = primary-500
 * fill with a white tick (TaskCompletedRow). Toggleable + Checkbox role, so
 * it reads and behaves as the checkbox it replaces.
 */
@Composable
internal fun TaskCheck(checked: Boolean, enabled: Boolean, onToggle: () -> Unit) {
	val ring = MaterialTheme.colorScheme.outline
	val fill = MaterialTheme.colorScheme.primary
	Box(
		modifier = Modifier
			.size(40.dp)
			.toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = { onToggle() }),
		contentAlignment = Alignment.Center,
	) {
		Box(
			modifier = Modifier
				.size(20.dp)
				.clip(FpShape.Pill)
				.background(if (checked) fill else MaterialTheme.colorScheme.surface)
				.border(2.dp, if (checked) fill else ring, FpShape.Pill),
			contentAlignment = Alignment.Center,
		) {
			if (checked) {
				Icon(
					Icons.Filled.Check,
					contentDescription = null,
					tint = MaterialTheme.colorScheme.onPrimary,
					modifier = Modifier.size(12.dp),
				)
			}
		}
	}
}

/** TaskRow surface: rounded-lg, slate-100 border on slate-50; a late row goes red-200 on red-50. */
@Composable
internal fun TaskRowSurface(late: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	val colors = FpTheme.colors
	Surface(
		modifier = modifier,
		shape = MaterialTheme.shapes.small,
		color = if (late) colors.lateRowSurface else colors.rowSurface,
		border = BorderStroke(1.dp, if (late) colors.lateRowBorder else colors.rowBorder),
		content = content,
	)
}
