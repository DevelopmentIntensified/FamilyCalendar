package com.familyplanz.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.BannerTone
import com.familyplanz.app.ui.theme.FpShape

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
