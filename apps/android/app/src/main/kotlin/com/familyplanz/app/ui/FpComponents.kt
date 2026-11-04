package com.familyplanz.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FpKickerText
import com.familyplanz.app.ui.theme.FpKickerWideText
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/*
 * The website's shared component looks (issue 291), built only from theme
 * tokens. Each names the web component it copies.
 */

/**
 * A page title row under the shell [com.familyplanz.app.ui.shell.FpNavbar]:
 * white, slate-200 bottom rule, the page h1 (`text-xl font-bold`) and the
 * page's own actions. The brand mark lives in the Navbar now (#292 §2.1).
 */
@Composable
fun FpHeader(title: String, actions: @Composable RowScope.() -> Unit = {}) {
	Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
		Row(
			modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 16.dp, end = 4.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(8.dp),
		) {
			Text(
				title,
				style = MaterialTheme.typography.titleLarge,
				color = FpTheme.colors.textStrong,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
				modifier = Modifier.weight(1f),
			)
			actions()
		}
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
	}
}

/** The login page's submit: full-width pill, primary-600, 48dp, disabled slate-200/slate-500. */
@Composable
fun FpPrimaryButton(
	onClick: () -> Unit,
	modifier: Modifier = Modifier,
	enabled: Boolean = true,
	content: @Composable RowScope.() -> Unit,
) {
	Button(
		onClick = onClick,
		enabled = enabled,
		modifier = modifier.heightIn(min = 48.dp),
		shape = FpShape.Pill,
		colors = ButtonDefaults.buttonColors(
			containerColor = MaterialTheme.colorScheme.primary,
			contentColor = MaterialTheme.colorScheme.onPrimary,
			disabledContainerColor = MaterialTheme.colorScheme.outlineVariant,
			disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
		),
		elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
		content = content,
	)
}

/** "Start planning — no account needed": pill, slate-300 border, slate-600 text. */
@Composable
fun FpOutlineButton(
	onClick: () -> Unit,
	modifier: Modifier = Modifier,
	enabled: Boolean = true,
	content: @Composable RowScope.() -> Unit,
) {
	OutlinedButton(
		onClick = onClick,
		enabled = enabled,
		modifier = modifier.heightIn(min = 48.dp),
		shape = FpShape.Pill,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
		colors = ButtonDefaults.outlinedButtonColors(contentColor = FpTheme.colors.textBody),
		content = content,
	)
}

/** AuthCard / TasksHeader: white, slate-200 border, rounded-2xl, shadow-sm. */
@Composable
fun FpCard(
	modifier: Modifier = Modifier,
	padding: PaddingValues = PaddingValues(16.dp),
	content: @Composable ColumnScope.() -> Unit,
) {
	Surface(
		modifier = modifier,
		shape = MaterialTheme.shapes.large,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
		shadowElevation = 1.dp,
	) {
		Column(modifier = Modifier.padding(padding), content = content)
	}
}


/** AuthInput: white fill, slate-300 border, primary-500 focus ring, 10px radius. */
@Composable
fun fpFieldColors(): TextFieldColors = OutlinedTextFieldDefaults.colors(
	focusedBorderColor = MaterialTheme.colorScheme.primary,
	unfocusedBorderColor = MaterialTheme.colorScheme.outline,
	focusedContainerColor = MaterialTheme.colorScheme.surface,
	unfocusedContainerColor = MaterialTheme.colorScheme.surface,
	disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
	focusedLabelColor = MaterialTheme.colorScheme.primary,
	cursorColor = MaterialTheme.colorScheme.primary,
	unfocusedPlaceholderColor = FpTheme.colors.textMuted,
	focusedPlaceholderColor = FpTheme.colors.textMuted,
)

/**
 * Uppercase kicker: `text-[11px] font-bold uppercase tracking-[0.08em]`
 * slate-400 (`AccountSidebar.svelte:67`); [wide] = `tracking-widest`
 * (`family/+page.svelte` `dt`). Pass slate-500 for AssignmentsCard headings.
 */
@Composable
fun FpKicker(text: String, modifier: Modifier = Modifier, wide: Boolean = false, color: Color = FpTheme.colors.kicker) {
	Text(
		text.uppercase(),
		style = if (wide) FpKickerWideText else FpKickerText,
		color = color,
		maxLines = 1,
		overflow = TextOverflow.Ellipsis,
		modifier = modifier,
	)
}

