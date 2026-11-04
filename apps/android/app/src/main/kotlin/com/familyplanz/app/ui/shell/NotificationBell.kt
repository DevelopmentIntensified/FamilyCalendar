package com.familyplanz.app.ui.shell

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.familyplanz.app.R
import com.familyplanz.app.ui.theme.FpBadgeText
import com.familyplanz.app.ui.theme.FpElevation
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.NotifTones
import com.familyplanz.app.ui.theme.Slate
import java.time.Duration
import java.time.Instant

const val BELL_PANEL_TAG = "bell-panel"

/** Badge text: the count, capped "99+" (`BottomNav.svelte:168`, `NotificationBell.svelte:193`). */
fun badgeText(count: Int): String = if (count > 99) "99+" else count.toString()

/** The bell's accessible name (`NotificationBell.svelte:178`). */
fun bellLabel(unread: Int): String = if (unread > 0) "Notifications ($unread unread)" else "Notifications"

/** `notificationTypes.ts` LABELS / UNKNOWN_TYPE_LABEL. */
fun notificationLabel(type: String?): String = when (type) {
	"assignment_pending" -> "Asked you"
	"assignment_accepted" -> "Accepted"
	"assignment_declined" -> "Declined"
	"task_completed" -> "Completed"
	"added_to_family" -> "Added to family"
	else -> "Update"
}

/** `notificationTypes.ts` GLYPHS. */
fun notificationGlyph(type: String?): String = when (type) {
	"assignment_pending" -> "?"
	"assignment_accepted", "task_completed" -> "✓"
	"assignment_declined" -> "✕"
	"added_to_family" -> "+"
	else -> "•"
}

private val RELATIVE_UNITS: List<Pair<String, Long>> = listOf(
	"year" to 365L * 86_400,
	"quarter" to 91L * 86_400,
	"month" to 30L * 86_400,
	"week" to 7L * 86_400,
	"day" to 86_400L,
	"hour" to 3_600L,
	"minute" to 60L,
	"second" to 1L,
)

/** Luxon `toRelative()` (`dateUtils.ts:88`): the largest whole unit, "N units ago" / "in N units". */
fun relativeTime(iso: String?, now: Instant = Instant.now()): String {
	val then = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
	val seconds = Duration.between(then, now).seconds
	val abs = kotlin.math.abs(seconds)
	val (unit, size) = RELATIVE_UNITS.firstOrNull { abs / it.second >= 1 } ?: RELATIVE_UNITS.last()
	val n = abs / size
	val word = if (n == 1L) unit else "${unit}s"
	return if (seconds >= 0) "$n $word ago" else "in $n $word"
}

/** A small count pill pinned top-right of an icon (`-right-1 -top-1 h-4 min-w-[16px] px-1`). */
@Composable
fun FpCountBadge(count: Int, color: Color, modifier: Modifier = Modifier) {
	if (count <= 0) return
	Box(
		modifier = modifier
			.heightIn(min = 16.dp)
			.widthIn(min = 16.dp)
			.clip(FpShape.Pill)
			.background(color)
			.padding(horizontal = 4.dp, vertical = 3.dp),
		contentAlignment = Alignment.Center,
	) {
		Text(badgeText(count), style = FpBadgeText, color = Color.White, maxLines = 1)
	}
}

/**
 * NotificationBell.svelte inside the mobile menu: a 44 dp round slate-600
 * button with a red-500 badge; tapping opens the `w-80 rounded-xl border
 * shadow-lg` dropdown (Loading / error + Retry / empty / rows, then "Mark
 * all read"). On Android the web's push block is the native permission
 * banner (§0.5), so it is not repeated here.
 */
@Composable
fun FpNotificationBell(
	unread: Int,
	open: Boolean,
	list: BellList,
	onToggle: () -> Unit,
	onRetry: () -> Unit,
	onRow: (NotificationDto) -> Unit,
	onMarkAll: () -> Unit,
) {
	Box {
		Box(
			modifier = Modifier
				.size(44.dp)
				.clip(FpShape.Pill)
				.clickable(role = Role.Button, onClick = onToggle)
				.semantics { contentDescription = bellLabel(unread) },
			contentAlignment = Alignment.Center,
		) {
			Box {
				Icon(
					painterResource(R.drawable.ic_fp_alerts),
					contentDescription = null,
					tint = FpTheme.colors.textBody,
					modifier = Modifier.size(24.dp),
				)
				FpCountBadge(unread, FpTheme.colors.bellBadge, Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-4).dp))
			}
		}
		if (open) {
			val dropY = with(LocalDensity.current) { (44 + 8).dp.roundToPx() }
			Popup(
				alignment = Alignment.TopEnd,
				offset = IntOffset(0, dropY),
				onDismissRequest = onToggle,
				properties = PopupProperties(focusable = true),
			) {
				BellPanel(unread, list, onRetry, onRow, onMarkAll)
			}
		}
	}
}

@Composable
private fun BellPanel(
	unread: Int,
	list: BellList,
	onRetry: () -> Unit,
	onRow: (NotificationDto) -> Unit,
	onMarkAll: () -> Unit,
) {
	Surface(
		modifier = Modifier.widthIn(max = 320.dp).testTag(BELL_PANEL_TAG),
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
		shadowElevation = FpElevation.Lg,
	) {
		Column(modifier = Modifier.padding(vertical = 8.dp)) {
			Text(
				"Notifications",
				style = MaterialTheme.typography.titleSmall,
				color = FpTheme.colors.textStrong,
				modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
			)
			HorizontalDivider(color = FpTheme.colors.rowBorder)
			when (list) {
				BellList.Loading -> BellNote("Loading…")
				BellList.Failed -> Row(
					modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
					verticalAlignment = Alignment.CenterVertically,
					horizontalArrangement = Arrangement.SpaceBetween,
				) {
					Text("Couldn't load notifications.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
					Text(
						"Retry",
						style = MaterialTheme.typography.bodyMedium,
						fontWeight = FontWeight.Medium,
						color = MaterialTheme.colorScheme.primary,
						modifier = Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClick = onRetry).padding(8.dp),
					)
				}
				is BellList.Ready -> if (list.rows.isEmpty()) {
					BellNote("No notifications yet — all quiet on the home front.")
				} else {
					LazyColumn(modifier = Modifier.heightIn(max = 320.dp)) {
						items(list.rows, key = { it.id }) { row -> BellRow(row) { onRow(row) } }
					}
				}
			}
			if (unread > 0) {
				HorizontalDivider(Modifier.padding(top = 8.dp), color = FpTheme.colors.rowBorder)
				Text(
					"Mark all read",
					style = MaterialTheme.typography.bodyMedium,
					fontWeight = FontWeight.Medium,
					color = MaterialTheme.colorScheme.primary,
					modifier = Modifier
						.padding(top = 8.dp)
						.fillMaxWidth()
						.heightIn(min = 44.dp)
						.clickable(role = Role.Button, onClick = onMarkAll)
						.padding(horizontal = 16.dp, vertical = 12.dp),
				)
			}
		}
	}
}

@Composable
private fun BellNote(text: String) {
	Text(
		text,
		style = MaterialTheme.typography.bodyMedium,
		color = MaterialTheme.colorScheme.onSurfaceVariant,
		modifier = Modifier.padding(16.dp),
	)
}

@Composable
private fun BellRow(row: NotificationDto, onClick: () -> Unit) {
	val type = row.rawType ?: row.type
	val tone = NotifTones.of(type)
	val unread = row.readAt == null
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.background(if (unread) Slate.S50 else Color.Transparent)
			.clickable(onClick = onClick)
			.padding(horizontal = 16.dp, vertical = 10.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Box(Modifier.size(24.dp).clip(FpShape.Pill).background(tone.container), contentAlignment = Alignment.Center) {
			Text(notificationGlyph(type), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = tone.content)
		}
		Column(modifier = Modifier.weight(1f)) {
			Text(
				row.message,
				style = MaterialTheme.typography.bodyMedium,
				fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal,
				color = if (unread) FpTheme.colors.textStrong else FpTheme.colors.textBody,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
			)
			Row(
				modifier = Modifier.padding(top = 2.dp),
				horizontalArrangement = Arrangement.spacedBy(8.dp),
				verticalAlignment = Alignment.CenterVertically,
			) {
				Text(
					notificationLabel(type),
					style = FpBadgeText,
					fontWeight = FontWeight.Bold,
					color = tone.content,
					modifier = Modifier.clip(FpShape.Pill).background(tone.container).padding(horizontal = 6.dp, vertical = 3.dp),
				)
				Text(
					relativeTime(row.createdAt),
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textMuted,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
				)
			}
		}
	}
}
