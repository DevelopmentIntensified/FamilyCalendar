package com.familyplanz.app.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.FpChip
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import com.familyplanz.app.ui.theme.avatarTone

/*
 * The shared chrome of the Families screens (2.7-2.11): breadcrumbs, band
 * titles, the family card shell, avatar strips and role pills. Copy comes
 * from the web pages named in docs/specs/android-mobile-clone.md.
 */

/** AC-FM-4: the roster strip shows at most this many avatars (`+page.server.ts:24`). */
const val ROSTER_STRIP_CAP = 5

/** AC-FM-4: each avatar after the first slides this far under its neighbour. */
val ROSTER_OVERLAP: Dp = (-8).dp

/** `+page.svelte`: shown under a join link whose clipboard write failed. */
const val COPY_FAILED = "Copy failed - select the link above and copy it manually."

private val BREADCRUMB_STYLE = 12.sp

/** `Calendar › Family`: 12 sp slate-400, the trailing crumb bolder. */
@Composable
fun FamilyBreadcrumb(vararg crumbs: String) {
	Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		crumbs.forEachIndexed { index, crumb ->
			val last = index == crumbs.lastIndex
			Text(
				if (last) crumb else "$crumb \u203A",
				style = MaterialTheme.typography.bodySmall.copy(fontSize = BREADCRUMB_STYLE),
				fontWeight = if (last) FontWeight.SemiBold else FontWeight.Normal,
				color = if (last) FpTheme.colors.textBody else FpTheme.colors.textMuted,
			)
		}
	}
}

/** Band title: 12 sp semibold, uppercase, wide tracking, slate-500. */
@Composable
fun FamilyBandTitle(text: String) {
	Text(
		text.uppercase(),
		style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.2.sp),
		fontWeight = FontWeight.SemiBold,
		color = MaterialTheme.colorScheme.onSurfaceVariant,
	)
}

/** The page h1 (e.g. "Families", "Family Tasks"): 24 sp bold slate-900. */
@Composable
fun FamilyPageTitle(text: String) {
	Text(text, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
}

/** A page avatar: disc in the family/tone colour with the initial, 800 weight. */
@Composable
fun FamilyAvatar(initial: String, tone: ChipTone, size: Dp = 44.dp, modifier: Modifier = Modifier) {
	Box(
		modifier = modifier.size(size).clip(FpShape.Pill).background(tone.container),
		contentAlignment = Alignment.Center,
	) {
		Text(
			initial.take(1).uppercase(),
			fontSize = (size.value * 0.4f).sp,
			fontWeight = FontWeight.ExtraBold,
			color = tone.content,
		)
	}
}

/** The family card's tint: `rounded-3xl` orange-100 wash with a glow blob. */
val FAMILY_CARD_TONE = ChipTone(Accent.Orange100, Accent.Orange700)

/**
 * AC-FM-4: up to [ROSTER_STRIP_CAP] overlapped avatars, then "A, B, C +k more".
 * With no names it shows the page's "add a member" line instead.
 */
@Composable
fun FamilyRosterStrip(names: List<String>, modifier: Modifier = Modifier) {
	if (names.isEmpty()) {
		Text(
			"No names yet - add a member and this strip fills in.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
			modifier = modifier,
		)
		return
	}
	val shown = names.take(ROSTER_STRIP_CAP)
	val extra = names.size - shown.size
	Column(modifier = modifier) {
		Row {
			shown.forEachIndexed { index, name ->
				FamilyAvatar(
					initial = name,
					tone = familyAvatarTone(name),
					size = 36.dp,
					modifier = Modifier.offset(x = ROSTER_OVERLAP * index).border(2.dp, Color.White, FpShape.Pill),
				)
			}
		}
		Text(
			buildString {
				append(shown.joinToString(", "))
				if (extra > 0) append(" +$extra more")
			},
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textBody,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
		)
	}
}

/** Role pill: creator/admin primary, member slate (`+page.svelte` role badges). */
@Composable
fun FamilyRolePill(role: String, modifier: Modifier = Modifier) {
	val tone = when (role.lowercase()) {
		"creator", "admin" -> ChipTone(Primary.P100, Primary.P700)
		else -> ChipTone(Slate.S100, Slate.S600)
	}
	FpChip(role.replaceFirstChar { it.uppercase() }, tone, modifier)
}

/** One label/value pair of the card's `dl` (10 sp, 700, uppercase, widest). */
@Composable
fun FamilyStat(label: String, value: String, modifier: Modifier = Modifier) {
	Column(modifier = modifier) {
		Text(
			label.uppercase(),
			fontSize = 10.sp,
			fontWeight = FontWeight.Bold,
			letterSpacing = 1.4.sp,
			color = FpTheme.colors.textMuted,
		)
		Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textStrong)
	}
}

/** A settings-style switch row: label, optional hint, trailing switch. */
@Composable
fun FamilySwitchRow(
	label: String,
	checked: Boolean,
	onCheckedChange: (Boolean) -> Unit,
	hint: String? = null,
	enabled: Boolean = true,
) {
	Row(
		modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(vertical = 4.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Column(modifier = Modifier.weight(1f)) {
			Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textStrong)
			hint?.let {
				Text(it, style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
			}
		}
		Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
	}
}

/** Small text action (`Members`, `Family tasks`, `Open family` on slate-100). */
@Composable
fun FamilyActionChip(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
	TextButton(
		onClick = onClick,
		modifier = modifier
			.clip(MaterialTheme.shapes.small)
			.background(Slate.S100)
			.heightIn(min = 44.dp),
	) {
		Text(text, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textBody)
	}
}

/**
 * A join link with Copy / "Copied" and the copy-failure line (AC-FM-6).
 * [copied] is true right after a successful clipboard write.
 */
@Composable
fun FamilyJoinLink(
	link: String,
	copied: Boolean,
	onCopy: () -> Unit,
	copyFailed: Boolean,
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier) {
		Row(verticalAlignment = Alignment.CenterVertically) {
			Text(
				link,
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textBody,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
				modifier = Modifier.weight(1f),
			)
			FamilyActionChip(if (copied) "Copied" else "Copy", onCopy)
		}
		if (copyFailed) {
			Text(COPY_FAILED, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
		}
	}
}

/** A red inline error line (server messages land here verbatim). */
@Composable
fun FamilyErrorLine(text: String?, modifier: Modifier = Modifier) {
	if (text.isNullOrBlank()) return
	Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = modifier)
}

/** The one-line success note the screens show after a write. */
@Composable
fun FamilyNoteLine(text: String?, modifier: Modifier = Modifier) {
	if (text.isNullOrBlank()) return
	Text(text, style = MaterialTheme.typography.bodySmall, color = Accent.Emerald700, modifier = modifier)
}

/** A labelled text field (name, email, code); 10 px radius like the web's AuthInput. */
@Composable
fun FamilyField(
	label: String,
	value: String,
	onValueChange: (String) -> Unit,
	modifier: Modifier = Modifier,
	placeholder: String? = null,
	singleLine: Boolean = true,
	enabled: Boolean = true,
) {
	OutlinedTextField(
		value = value,
		onValueChange = onValueChange,
		label = { Text(label) },
		placeholder = placeholder?.let { { Text(it) } },
		singleLine = singleLine,
		enabled = enabled,
		shape = FpShape.Input,
		colors = fpFieldColors(),
		keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
		modifier = modifier.fillMaxWidth(),
	)
}

/** A row of the members rail: avatar, name, memberType, role pill. */
@Composable
fun FamilyMemberRow(
	name: String,
	memberType: String?,
	role: String?,
	onClick: (() -> Unit)? = null,
	modifier: Modifier = Modifier,
	trailing: @Composable RowScope.() -> Unit = {},
) {
	Row(
		modifier = modifier
			.fillMaxWidth()
			.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
			.padding(vertical = 6.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
	) {
		FamilyAvatar(initial = name, tone = familyAvatarTone(name), size = 32.dp)
		Column(modifier = Modifier.weight(1f)) {
			Text(name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textStrong)
			memberType?.let {
				Text(it.replaceFirstChar { c -> c.uppercase() }, style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
			}
		}
		role?.let { FamilyRolePill(it) }
		trailing()
	}
}

/** The sign-in-style link button the family screens use for cross-links ("Family Tasks ›"). */
@Composable
fun FamilyTextLink(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
	Text(
		text,
		style = MaterialTheme.typography.bodyMedium.copy(textDecoration = TextDecoration.None),
		fontWeight = FontWeight.SemiBold,
		color = MaterialTheme.colorScheme.primary,
		modifier = modifier.clickable(onClick = onClick).heightIn(min = 44.dp).padding(vertical = 12.dp),
	)
}

/** The avatar tone for a name: the web's `avatarColor(name)` hash, so a member keeps one colour. */
fun familyAvatarTone(name: String): ChipTone = avatarTone(name)
