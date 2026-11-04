@file:Suppress("TooManyFunctions")
package com.familyplanz.app.ui.secondary

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/*
 * Pieces the menu pages (Stats, Archive, Report a Bug, Import, Print) and the
 * admin pages share. They copy the web classes `rounded-xl border-slate-200
 * bg-white p-5 shadow-sm` (page cards), `px-4 py-8` (page gutter) and the
 * status tones (Tailwind 3.4.19 palette). L1's FpKicker / status tokens will
 * replace the local constants here when they land.
 */

/** Status tones the pages use; Tailwind 3.4.19 default palette. */
internal object PageTones {
	val Red800 = Color(0xFF991B1B)
	val Green50 = Color(0xFFF0FDF4)
	val Green100 = Color(0xFFDCFCE7)
	val Green200 = Color(0xFFBBF7D0)
	val Green300 = Color(0xFF86EFAC)
	val Green600 = Color(0xFF16A34A)
	val Green700 = Color(0xFF15803D)
	val Green800 = Color(0xFF166534)
	val Amber300 = Color(0xFFFCD34D)
	val Orange50 = Color(0xFFFFF7ED)
	val Orange100 = Color(0xFFFFEDD5)
	val Orange700 = Color(0xFFC2410C)
	val Rose100 = Color(0xFFFFE4E6)
	val Rose700 = Color(0xFFBE123C)
	val Emerald100 = Color(0xFFD1FAE5)
	val Emerald700 = Color(0xFF047857)
}

/** A menu page: the app header with the menu button, then the page body on the slate-50 canvas (`px-4 py-8`). */
@Composable
internal fun PageScaffold(title: String, nav: AppNav, content: @Composable ColumnScope.() -> Unit) {
	Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
		FpHeader(title) { ShellMenuButton(nav) }
		Column(
			modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 32.dp),
			verticalArrangement = Arrangement.spacedBy(16.dp),
			content = content,
		)
	}
}

/** Forwards a ViewModel's snack and 401 to the shell. */
@Composable
internal fun PageEffects(vm: PageViewModel) {
	val shell = LocalShell.current
	val snack by vm.snack.collectAsStateWithLifecycle()
	val ended by vm.sessionEnded.collectAsStateWithLifecycle()
	LaunchedEffect(snack) {
		snack?.let {
			shell.showSnack(it)
			vm.consumeSnack()
		}
	}
	LaunchedEffect(ended) {
		ended?.let(shell::endSession)
	}
}

/** Draws a 1dp dashed outline (`border-dashed`), which Compose borders cannot do. */
internal fun Modifier.dashedBorder(color: Color, shape: Shape): Modifier = drawBehind {
	val outline = shape.createOutline(size, layoutDirection, this)
	val dash = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))
	val stroke = Stroke(width = 1.dp.toPx(), pathEffect = dash)
	when (outline) {
		is androidx.compose.ui.graphics.Outline.Rounded ->
			drawRoundRect(color, cornerRadius = CornerRadius(outline.roundRect.topLeftCornerRadius.x), style = stroke)
		else -> drawRect(color, style = stroke)
	}
}

/** `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`; [background] overrides the fill, [dashed] the outline. */
@Composable
@Suppress("LongParameterList")
internal fun PageCard(
	modifier: Modifier = Modifier,
	padding: PaddingValues = PaddingValues(20.dp),
	borderColor: Color = MaterialTheme.colorScheme.outlineVariant,
	fill: Color = MaterialTheme.colorScheme.surface,
	dashed: Boolean = false,
	content: @Composable ColumnScope.() -> Unit,
) {
	val shape = MaterialTheme.shapes.medium
	Surface(
		modifier = modifier.fillMaxWidth().then(if (dashed) Modifier.dashedBorder(borderColor, shape) else Modifier),
		shape = shape,
		color = fill,
		border = if (dashed) null else BorderStroke(1.dp, borderColor),
		shadowElevation = 1.dp,
	) {
		Column(modifier = Modifier.padding(padding), content = content)
	}
}

/** `text-2xl font-bold text-slate-900` page title. */
@Composable
internal fun PageTitle(text: String) {
	Text(text, style = MaterialTheme.typography.headlineSmall, color = FpTheme.colors.textStrong)
}

/** `text-sm text-slate-500` page lead. */
@Composable
internal fun PageLead(text: String) {
	Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** `text-[10px] font-bold uppercase tracking-widest text-slate-400`. */
@Composable
internal fun PageKicker(text: String, modifier: Modifier = Modifier) {
	Text(
		text.uppercase(),
		modifier = modifier,
		style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, letterSpacing = 1.sp),
		fontWeight = FontWeight.Bold,
		color = FpTheme.colors.textMuted,
	)
}

/** `h2 text-sm font-semibold text-slate-900` card heading. */
@Composable
internal fun CardHeading(text: String, modifier: Modifier = Modifier) {
	Text(text, modifier = modifier, style = MaterialTheme.typography.titleSmall, color = FpTheme.colors.textStrong)
}

/** A grey block standing in for a card while its data loads (skeletons, not blank screens). */
@Composable
internal fun SkeletonCard(height: Int) {
	Surface(
		modifier = Modifier.fillMaxWidth().height(height.dp),
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surfaceContainerHighest,
	) {}
}

/** `rounded-lg border-red-200 bg-red-50 text-red-800` notice with a "Try again" action. */
@Composable
internal fun FailedNotice(message: String, onRetry: (() -> Unit)?) {
	Column(
		modifier = Modifier.fillMaxWidth()
			.background(MaterialTheme.colorScheme.errorContainer, MaterialTheme.shapes.small)
			.padding(16.dp),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Text(message, style = MaterialTheme.typography.bodyMedium, color = PageTones.Red800)
		if (onRetry != null) FpPrimaryButton(onClick = onRetry) { Text("Try again") }
	}
}

/** Skeleton while loading, a retry notice on failure, [content] when loaded. */
@Composable
internal fun <T> LoadGate(state: Load<T>, onRetry: (() -> Unit)?, content: @Composable ColumnScope.(T) -> Unit) {
	Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
		when (state) {
			Load.Loading -> {
				SkeletonCard(160)
				SkeletonCard(120)
			}
			is Load.Failed -> FailedNotice(state.message, onRetry)
			is Load.Loaded -> content(state.value)
		}
	}
}

/** A text-only back/crumb link, 44dp tall (`min-h-[44px]`). */
@Composable
internal fun BackLink(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
	Row(
		modifier = modifier.heightIn(min = 44.dp).clickable(onClick = onClick),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Text(label, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody, maxLines = 1, overflow = TextOverflow.Ellipsis)
	}
}

/** Pill-shaped status badge (`rounded-full px-2 py-0.5 text-[10px] font-bold`). */
@Composable
internal fun Badge(text: String, container: Color, content: Color, modifier: Modifier = Modifier) {
	Text(
		text,
		modifier = modifier
			.background(container, FpShape.Pill)
			.padding(horizontal = 8.dp, vertical = 2.dp),
		style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
		fontWeight = FontWeight.Bold,
		color = content,
	)
}

/** One choice of a [SelectField]. */
internal data class SelectOption(val value: String, val label: String)

/** A web `<select>`: `rounded-lg border-slate-300 px-4 py-2.5` showing the choice, a menu of options on tap. */
@Composable
internal fun SelectField(
	options: List<SelectOption>,
	selected: String,
	onSelect: (String) -> Unit,
	modifier: Modifier = Modifier,
	testTag: String = "select",
) {
	var open by remember { mutableStateOf(false) }
	val current = options.firstOrNull { it.value == selected }?.label ?: selected
	Box(modifier = modifier.fillMaxWidth()) {
		Row(
			modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp)
				.background(MaterialTheme.colorScheme.surface, MaterialTheme.shapes.small)
				.border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.small)
				.clickable { open = true }
				.padding(horizontal = 16.dp, vertical = 10.dp)
				.testTag(testTag),
			verticalAlignment = Alignment.CenterVertically,
		) {
			Text(current, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge,
				color = FpTheme.colors.textStrong, maxLines = 1)
			Text("▾", color = FpTheme.colors.textMuted)
		}
		DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
			options.forEach { option ->
				DropdownMenuItem(
					text = { Text(option.label) },
					onClick = {
						open = false
						onSelect(option.value)
					},
				)
			}
		}
	}
}
