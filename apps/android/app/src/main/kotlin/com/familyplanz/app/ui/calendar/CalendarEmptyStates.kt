package com.familyplanz.app.ui.calendar

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.VerseDto
import com.familyplanz.app.ui.calendar.model.CalendarEmpty
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/* The calendar's non-grid states (Calendar.svelte:532-665, FirstRunCard,
 * DailyVerseCard): emptied views, the first run, the verse, the skeleton and
 * the amber/red alerts. Copy is verbatim - the ACs assert it. */

/** One primary action under an empty state. */
@Composable
fun CalendarCta(label: String, onClick: () -> Unit) {
	Box(
		modifier = Modifier
			.clip(MaterialTheme.shapes.small)
			.background(MaterialTheme.colorScheme.primary)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 16.dp, vertical = 10.dp),
	) {
		Text(label, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onPrimary)
	}
}

/** All three empty cards share the web's layout: icon, kicker, title, body, CTA. */
@Composable
fun CalendarEmptyCard(
	kicker: String,
	title: String,
	body: String,
	action: String,
	onAction: () -> Unit,
) {
	Column(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 32.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
		verticalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Box(Modifier.size(48.dp).clip(FpShape.Pill).background(Slate.S100))
		Text(kicker.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textMuted)
		Text(title, fontSize = 18.sp, fontWeight = FontWeight.Medium, color = FpTheme.colors.textBody, textAlign = TextAlign.Center)
		Text(body, fontSize = 14.sp, color = FpTheme.colors.textMuted, textAlign = TextAlign.Center)
		CalendarCta(action, onAction)
	}
}

@Composable
@Suppress("LongParameterList")
fun CalendarEmpty(
	empty: CalendarEmpty,
	query: String,
	hiddenCalendarNames: List<String>,
	hiddenAssigneeNames: List<String>,
	onShowAllCalendars: () -> Unit,
	onClearSearch: () -> Unit,
	onShowEveryone: () -> Unit,
) {
	when (empty) {
		CalendarEmpty.FILTERED -> CalendarEmptyCard(
			kicker = "Filtered",
			title = "Every calendar is hidden",
			body = hiddenNames(hiddenCalendarNames) + " hidden. Nothing is drawn until you turn one back on - " +
				"your events and due tasks are all still here.",
			action = "Show all calendars",
			onAction = onShowAllCalendars,
		)

		CalendarEmpty.SEARCH -> CalendarEmptyCard(
			kicker = "Searching",
			title = "Nothing matches \"$query\"",
			body = "Nothing on this calendar matches those words. Everything is still here - only the view is narrowed.",
			action = "Clear search",
			onAction = onClearSearch,
		)

		CalendarEmpty.ASSIGNEE -> CalendarEmptyCard(
			kicker = "Filtered",
			title = if (hiddenAssigneeNames.size == 1) "Nothing for ${hiddenAssigneeNames.first()} in this view" else "Nothing left in this view",
			body = "Switched-off people drop their events and their due tasks from every view. Turn them back on to see them again.",
			action = "Show everyone",
			onAction = onShowEveryone,
		)

		CalendarEmpty.NONE -> Unit
	}
}

/** "{A} and {B} is are hidden" with the web's list wording. */
private fun hiddenNames(names: List<String>): String = when (names.size) {
	0 -> "Every calendar is"
	1 -> "${names[0]} is"
	else -> names.dropLast(1).joinToString(", ") + " and " + names.last() + " are"
}

/** FirstRunCard: a brand-new user's nudge, dismissible for good (AC-CAL-40). */
@Composable
fun FirstRunCard(onBrowseTasks: () -> Unit, onDismiss: () -> Unit) {
	Surface(
		shape = MaterialTheme.shapes.large,
		color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
	) {
		Box {
			Column(
				modifier = Modifier.padding(horizontal = 24.dp, vertical = 24.dp),
				horizontalAlignment = Alignment.CenterHorizontally,
				verticalArrangement = Arrangement.spacedBy(8.dp),
			) {
				Box(Modifier.size(112.dp).clip(MaterialTheme.shapes.large).background(MaterialTheme.colorScheme.primaryContainer))
				Text("Blank calendar!", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
				Text(
					"Add your first thing - or start from Smart tasks.",
					fontSize = 14.sp,
					color = FpTheme.colors.textBody,
					textAlign = TextAlign.Center,
				)
				CalendarCta("Browse Smart tasks", onBrowseTasks)
			}
			Box(
				modifier = Modifier.align(Alignment.TopEnd).size(44.dp).clickable(onClickLabel = "Dismiss", onClick = onDismiss),
				contentAlignment = Alignment.Center,
			) {
				Text("Dismiss", fontSize = 12.sp, color = FpTheme.colors.textMuted)
			}
		}
	}
}

/** DailyVerseCard: amber paper, kicker, italic verse, reference (AC-CAL-38). */
@Composable
fun DailyVerseCard(verse: VerseDto) {
	Surface(
		shape = MaterialTheme.shapes.medium,
		color = FpTheme.colors.warnSurface,
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
	) {
		Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
			Text("DAILY VERSE", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.warnContent)
			Text(verse.text, fontSize = 14.sp, fontStyle = FontStyle.Italic, color = FpTheme.colors.warnContent)
			Text(verse.reference, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = FpTheme.colors.warnContent)
		}
	}
}

/** A 7 x 6 grid of pulsing 72 dp cells under a 40 x 256 bar (AC-CAL-36). */
@Composable
fun CalendarSkeleton(modifier: Modifier = Modifier) {
	val transition = rememberInfiniteTransition(label = "calendar-skeleton")
	val alpha by transition.animateFloat(
		initialValue = 0.5f,
		targetValue = 1f,
		animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
		label = "cell-alpha",
	)
	Column(modifier = modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
		Box(Modifier.height(40.dp).width(256.dp).clip(FpShape.Cell).background(Slate.S100).alpha(alpha))
		repeat(6) {
			Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				repeat(7) {
					Box(
						Modifier
							.weight(1f)
							.aspectRatio(0.62f)
							.height(72.dp)
							.clip(FpShape.Cell)
							.background(Slate.S100)
							.alpha(alpha),
					)
				}
			}
		}
	}
}

/** The amber warning line ("Couldn't load tasks just now...") and the red error + Retry. */
@Composable
fun CalendarAlert(text: String, retry: (() -> Unit)? = null) {
	Surface(
		shape = MaterialTheme.shapes.medium,
		color = if (retry == null) FpTheme.colors.warnSurface else Accent.Red50,
		modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
	) {
		Row(
			modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
			verticalAlignment = Alignment.CenterVertically,
		) {
			Text(
				text,
				fontSize = 13.sp,
				color = if (retry == null) FpTheme.colors.warnContent else Accent.Red700,
				modifier = Modifier.weight(1f),
			)
			if (retry != null) {
				Text(
					"Retry",
					fontSize = 13.sp,
					fontWeight = FontWeight.SemiBold,
					color = MaterialTheme.colorScheme.primary,
					modifier = Modifier.clickable(role = Role.Button, onClick = retry).padding(8.dp),
				)
			}
		}
	}
}

/** "Downloading this month." while a month's range is in flight (AC-CAL-35). */
@Composable
fun DownloadingLine() {
	Text(
		"Downloading this month.",
		fontSize = 12.sp,
		color = FpTheme.colors.textMuted,
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
	)
}

/** The placeholder the list view uses when a month is genuinely empty. */
@Composable
fun ListEmptyIllustration() {
	Box(
		Modifier
			.size(96.dp)
			.clip(MaterialTheme.shapes.medium)
			.background(Slate.S100),
	)
}

internal val SkeletonDivider: Color get() = Slate.S100
