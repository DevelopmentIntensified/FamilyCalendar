package com.familyplanz.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableChipColors
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpChipText
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/*
 * The website's chip vocabulary and its filter pills (issue 291/292). Split
 * out of FpComponents.kt so each file stays one idea.
 */

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
