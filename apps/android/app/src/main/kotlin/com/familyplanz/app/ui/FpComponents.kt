package com.familyplanz.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SelectableChipColors
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.BannerTone
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpKickerText
import com.familyplanz.app.ui.theme.FpKickerWideText
import com.familyplanz.app.ui.theme.FpChipText
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

/** TaskRow meta-slot pill: rounded-full, h 18, px 7, 10px text in the tone's colours. */
@Composable
fun FpChip(text: String, tone: ChipTone, modifier: Modifier = Modifier, bold: Boolean = false) {
	Text(
		text,
		style = FpChipText,
		fontWeight = if (bold) FontWeight.Bold else FontWeight.Medium,
		color = tone.content,
		maxLines = 1,
		overflow = TextOverflow.Ellipsis,
		modifier = modifier
			.clip(FpShape.Pill)
			.background(tone.container)
			.heightIn(min = 18.dp)
			.padding(horizontal = 7.dp, vertical = 3.dp),
	)
}

/** Priority slot: a 8dp dot travelling with its label (priorityTone.ts PRIORITY_DOT). */
@Composable
fun FpDot(color: Color, size: Int = 8) {
	Box(modifier = Modifier.size(size.dp).clip(FpShape.Pill).background(color))
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

/** Web filter pills (TaskTagFilter): white/slate-200 off, primary-50/primary-700 on. */
@Composable
fun fpFilterChipColors(): SelectableChipColors = FilterChipDefaults.filterChipColors(
	containerColor = MaterialTheme.colorScheme.surface,
	labelColor = FpTheme.colors.textBody,
	selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
	selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
	selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
)

@Composable
fun fpFilterChipBorder(selected: Boolean): BorderStroke =
	BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.inversePrimary else MaterialTheme.colorScheme.outlineVariant)

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

/**
 * TaskToolbar view / filter pill: `min-h-[44px] rounded-full border px-3.5
 * text-sm font-medium`; on `border-slate-900 bg-slate-900 text-white`, off
 * `border-slate-200 bg-white text-slate-600` (`TaskToolbar.svelte:115-118`).
 */
@Composable
fun FpFilterChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
	val colors = FpTheme.colors
	val tone = if (selected) colors.chipSelected else colors.chipIdle
	val border = if (selected) colors.chipSelected.container else MaterialTheme.colorScheme.outlineVariant
	Box(
		modifier = modifier
			.heightIn(min = 44.dp)
			.clip(FpShape.Pill)
			.background(tone.container)
			.border(1.dp, border, FpShape.Pill)
			.selectable(selected = selected, role = Role.Button, onClick = onClick)
			.padding(horizontal = 14.dp),
		contentAlignment = Alignment.Center,
	) {
		Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = tone.content, maxLines = 1)
	}
}

const val BANNER_DISMISS_LABEL = "Dismiss"

/**
 * The calendar-group banner row (`calendar/+layout.svelte:149-263`): full
 * width, a bottom rule in the tone's border, `px-4 py-2.5 text-sm`, centred
 * copy, and an optional ✕ "Dismiss" (`rounded-full p-1 font-semibold`).
 */
@Composable
fun FpBanner(
	tone: BannerTone,
	modifier: Modifier = Modifier,
	onDismiss: (() -> Unit)? = null,
	content: @Composable ColumnScope.() -> Unit,
) {
	Column(modifier = modifier.fillMaxWidth().background(tone.surface)) {
		Row(
			modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
		) {
			CompositionLocalProvider(LocalContentColor provides tone.content) {
				ProvideTextStyle(MaterialTheme.typography.bodyMedium.copy(color = tone.content)) {
					Column(
						modifier = Modifier.weight(1f, fill = false),
						horizontalAlignment = Alignment.CenterHorizontally,
						verticalArrangement = Arrangement.spacedBy(8.dp),
						content = content,
					)
				}
			}
			onDismiss?.let { dismiss ->
				Text(
					"✕",
					style = MaterialTheme.typography.bodyMedium,
					fontWeight = FontWeight.SemiBold,
					color = tone.content,
					modifier = Modifier
						.minimumInteractiveComponentSize()
						.clip(FpShape.Pill)
						.clickable(role = Role.Button, onClick = dismiss)
						.semantics { contentDescription = BANNER_DISMISS_LABEL }
						.padding(4.dp),
				)
			}
		}
		HorizontalDivider(color = tone.border)
	}
}
