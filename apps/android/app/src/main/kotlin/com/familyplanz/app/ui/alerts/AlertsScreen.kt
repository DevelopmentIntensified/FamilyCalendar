package com.familyplanz.app.ui.alerts

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.NotificationDto
import com.familyplanz.app.ui.dashboard.SkeletonBlocks
import com.familyplanz.app.ui.dashboard.dashedBorder
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/** What the Alerts screen can ask for. */
data class AlertsActions(
	val onFilter: (AlertFilter) -> Unit = {},
	val onOpen: (NotificationDto) -> Unit = {},
	val onMarkAllRead: () -> Unit = {},
	val onAskPrune: (Boolean) -> Unit = {},
	val onPrune: () -> Unit = {},
	val onRetry: () -> Unit = {},
)

/** notifications/+page.svelte at phone width: white canvas, `px-4 py-6`, one column. */
@Composable
fun AlertsScreen(state: AlertsUiState, actions: AlertsActions, modifier: Modifier = Modifier) {
	LazyColumn(
		modifier = modifier.fillMaxSize().background(Color.White).testTag("alerts-screen"),
		contentPadding = PaddingValues(horizontal = 16.dp, vertical = 24.dp),
	) {
		item { TitleRow(state, actions) }
		when {
			state.loading -> item { SkeletonBlocks(listOf(64, 64, 64)) }
			state.loadError != null && state.rows.isEmpty() -> item { LoadError(state.loadError, actions.onRetry) }
			state.rows.isEmpty() -> item { EmptyFeed() }
			else -> feed(state, actions)
		}
	}
}

private fun LazyListScope.feed(state: AlertsUiState, actions: AlertsActions) {
	item { FilterChips(state, actions.onFilter) }
	val visible = state.rows.filteredBy(state.filter)
	val needsYou = visible.filter { it.needsYou }
	val news = visible.filterNot { it.needsYou }
	if (visible.isEmpty()) {
		item {
			Text(
				"Nothing matches this filter.",
				style = MaterialTheme.typography.bodyMedium,
				color = Slate.S400,
				textAlign = TextAlign.Center,
				modifier = Modifier.fillMaxWidth().background(Color.White, MaterialTheme.shapes.medium)
					.dashedBorder(Slate.S300, 12.dp).padding(horizontal = 24.dp, vertical = 40.dp),
			)
		}
	}
	listOf("needs_you" to ("Needs you" to needsYou), "news" to ("Just news" to news)).forEach { (key, section) ->
		val (title, rows) = section
		if (rows.isNotEmpty()) item(key = key) { Section(key, title, rows, actions.onOpen) }
	}
}

@Composable
private fun TitleRow(state: AlertsUiState, actions: AlertsActions) {
	FlowRow(
		modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.Start),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Column(Modifier.weight(1f, fill = false)) {
			Text("Alerts", style = MaterialTheme.typography.headlineSmall, color = Slate.S900)
			Text(
				if (state.unreadCount > 0) "${state.unreadCount} unread" else "You're all caught up",
				style = MaterialTheme.typography.bodyMedium,
				color = Slate.S500,
				modifier = Modifier.testTag("unread-count"),
			)
		}
		FeedActions(state, actions)
	}
}

@Composable
private fun FeedActions(state: AlertsUiState, actions: AlertsActions) {
	FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
		val read = state.readCount
		if (read > 0) {
			if (state.askingToPrune) {
				Text(
					"Delete $read read alert${if (read == 1) "" else "s"}?",
					style = MaterialTheme.typography.bodySmall,
					color = Slate.S500,
					modifier = Modifier.align(Alignment.CenterVertically),
				)
				PillButton(if (state.pruning) "Deleting…" else "Delete them", PillStyle.Danger, actions.onPrune)
				PillButton("Keep them", PillStyle.Outline) { actions.onAskPrune(false) }
			} else {
				PillButton("Delete read alerts", PillStyle.Outline) { actions.onAskPrune(true) }
			}
		}
		if (state.unreadCount > 0) {
			PillButton(if (state.markingAll) "Marking…" else "Mark all read", PillStyle.Text, actions.onMarkAllRead)
		}
	}
}

private enum class PillStyle { Outline, Danger, Text }

@Composable
private fun PillButton(label: String, style: PillStyle, onClick: () -> Unit) {
	val (fill, ink) = when (style) {
		PillStyle.Outline -> Color.White to Slate.S600
		PillStyle.Danger -> Accent.Red600 to Color.White
		PillStyle.Text -> Color.Transparent to Primary.P600
	}
	Text(
		label,
		style = MaterialTheme.typography.bodyMedium,
		fontWeight = FontWeight.Medium,
		color = ink,
		modifier = Modifier
			.heightIn(min = 44.dp)
			.clip(FpShape.Pill)
			.background(fill)
			.then(if (style == PillStyle.Outline) Modifier.border(1.dp, Slate.S200, FpShape.Pill) else Modifier)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 12.dp),
	)
}

@Composable
private fun FilterChips(state: AlertsUiState, onFilter: (AlertFilter) -> Unit) {
	FlowRow(
		modifier = Modifier.padding(bottom = 16.dp),
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp),
	) {
		AlertFilter.entries.forEach { chip ->
			val on = state.filter == chip
			Box(
				contentAlignment = Alignment.Center,
				modifier = Modifier
					.height(36.dp)
					.clip(FpShape.Pill)
					.background(if (on) Primary.P600 else Color.White)
					.border(1.dp, if (on) Primary.P600 else Slate.S200, FpShape.Pill)
					.semantics { selected = on }
					.clickable(role = Role.Button) { onFilter(chip) }
					.padding(horizontal = 12.dp)
					.testTag("alert-filter-${chip.name.lowercase()}"),
			) {
				Text(
					buildAnnotatedString {
						append(chip.label)
						append(" ")
						withStyle(SpanStyle(color = (if (on) Color.White else Slate.S600).copy(alpha = 0.7f))) {
							append(state.rows.countFor(chip).toString())
						}
					},
					fontSize = 12.sp,
					fontWeight = FontWeight.SemiBold,
					color = if (on) Color.White else Slate.S600,
				)
			}
		}
	}
}

@Composable
private fun Section(key: String, title: String, rows: List<NotificationDto>, onOpen: (NotificationDto) -> Unit) {
	Column(Modifier.padding(bottom = 16.dp).testTag("alerts-section-$key")) {
		Text(
			buildAnnotatedString {
				append(title)
				append(" ")
				withStyle(SpanStyle(fontWeight = FontWeight.Normal, color = Slate.S400)) { append(rows.size.toString()) }
			},
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Bold,
			color = Slate.S900,
			modifier = Modifier.padding(start = 4.dp, end = 4.dp, bottom = 4.dp),
		)
		Surface(
			shape = MaterialTheme.shapes.medium,
			color = Color.White,
			border = BorderStroke(1.dp, Slate.S200),
			shadowElevation = 1.dp,
		) {
			Column {
				rows.forEachIndexed { i, row ->
					if (i > 0) HorizontalDivider(color = Slate.S100)
					AlertRow(row) { onOpen(row) }
				}
			}
		}
	}
}

@Composable
private fun AlertRow(row: NotificationDto, onClick: () -> Unit) {
	val tone = alertTone(row.kind)
	Row(
		horizontalArrangement = Arrangement.spacedBy(12.dp),
		modifier = Modifier
			.fillMaxWidth()
			.then(
				if (row.unread) Modifier.background(Brush.horizontalGradient(listOf(Primary.P50, Color.Transparent))) else Modifier,
			)
			.clickable(onClick = onClick)
			.padding(12.dp)
			.testTag("alert-row-${row.id}"),
	) {
		Box(Modifier.width(8.dp).padding(top = 6.dp)) {
			if (row.unread) Box(Modifier.size(8.dp).clip(FpShape.Pill).background(Primary.P600).testTag("unread-dot"))
		}
		Box(
			contentAlignment = Alignment.Center,
			modifier = Modifier.size(32.dp).clip(FpShape.Pill).background(tone.container),
		) {
			Text(alertGlyph(row.kind), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = tone.content)
		}
		Column(Modifier.weight(1f)) {
			Text(
				buildAnnotatedString {
					withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(row.actorName) }
					append(" ")
					append(row.message)
				},
				style = MaterialTheme.typography.bodyMedium,
				fontWeight = if (row.unread) FontWeight.SemiBold else FontWeight.Normal,
				color = if (row.unread) Slate.S900 else Slate.S600,
			)
			Spacer(Modifier.height(4.dp))
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
				Text(
					alertLabel(row.kind),
					fontSize = 11.sp,
					fontWeight = FontWeight.Bold,
					color = tone.content,
					modifier = Modifier.clip(FpShape.Pill).background(tone.container).padding(horizontal = 8.dp, vertical = 2.dp),
				)
				Text(relativeTime(row.createdAt), style = MaterialTheme.typography.bodySmall, color = Slate.S400)
			}
		}
	}
}

@Composable
private fun EmptyFeed() {
	Column(
		horizontalAlignment = Alignment.CenterHorizontally,
		modifier = Modifier.fillMaxWidth().background(Color.White, MaterialTheme.shapes.medium)
			.dashedBorder(Slate.S300, 12.dp).padding(horizontal = 24.dp, vertical = 48.dp)
			.testTag("alerts-empty"),
	) {
		Text("🔔", fontSize = 30.sp)
		Spacer(Modifier.height(12.dp))
		Text("No alerts yet", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Slate.S700)
		Spacer(Modifier.height(4.dp))
		Text(
			"When family members assign you tasks, accept, decline, or complete them — or add you to their family — you'll see it here.",
			style = MaterialTheme.typography.bodyMedium,
			color = Slate.S400,
			textAlign = TextAlign.Center,
		)
	}
}

@Composable
private fun LoadError(message: String, onRetry: () -> Unit) {
	Row(
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		modifier = Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(Accent.Red50)
			.border(1.dp, Accent.Red200, MaterialTheme.shapes.medium).padding(horizontal = 12.dp, vertical = 8.dp),
	) {
		Text("Couldn't load your alerts. $message", style = MaterialTheme.typography.bodyMedium, color = Accent.Red700, modifier = Modifier.weight(1f))
		Text(
			"Retry",
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.SemiBold,
			color = Accent.Red700,
			modifier = Modifier.clickable(role = Role.Button, onClick = onRetry).padding(8.dp),
		)
	}
}
