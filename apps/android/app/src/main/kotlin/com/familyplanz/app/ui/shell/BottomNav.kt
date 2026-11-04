package com.familyplanz.app.ui.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp

const val BOTTOM_NAV_TAG = "bottom-nav"

/** The web's keyboard threshold: the viewport shrank by more than 150 px (`BottomNav.svelte:95`). */
const val KEYBOARD_THRESHOLD_DP = 150

/** Tab tones (`BottomNav.svelte:145,171`): icon pill on primary-50/600 or bare slate-400; label primary-600 / slate-500. */
data class TabTone(val pill: ChipTone, val label: Color)

fun tabTone(selected: Boolean): TabTone =
	if (selected) TabTone(ChipTone(Primary.P50, Primary.P600), Primary.P600) else TabTone(ChipTone(Color.Transparent, Slate.S400), Slate.S500)

/** The tab's accessible name: the web aria-label, Alerts with its unread count. */
fun tabLabel(tab: PhoneTab, unread: Int): String =
	if (tab == PhoneTab.ALERTS && unread > 0) "Alerts ($unread unread)" else tab.description

/** `text-[11px] font-medium leading-none`. */
private val TabLabelText = TextStyle(fontSize = 11.sp, lineHeight = 11.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)

/**
 * BottomNav.svelte: white, slate-200 top rule, six equal columns
 * (`min-h-[52px] py-2.5 gap-0.5`), the icon in an `h-7 rounded-full` pill
 * (no side padding), an 11 sp label, and the primary-600 unread badge on
 * Alerts. [hidden] (IME open) keeps the bar laid out but invisible and
 * inert, like the web's `opacity-0 pointer-events-none`.
 */
@Composable
fun FpBottomNav(selected: PhoneTab?, unread: Int, hidden: Boolean, onSelect: (PhoneTab) -> Unit) {
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.alpha(if (hidden) 0f else 1f)
			.background(MaterialTheme.colorScheme.surface)
			.testTag(BOTTOM_NAV_TAG),
	) {
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
		Row(modifier = Modifier.fillMaxWidth().navigationBarsPadding().selectableGroup()) {
			PhoneTab.entries.forEach { tab ->
				TabItem(tab, tab == selected, if (tab == PhoneTab.ALERTS) unread else 0, enabled = !hidden) { onSelect(tab) }
			}
		}
	}
}

@Composable
private fun RowScope.TabItem(tab: PhoneTab, selected: Boolean, badge: Int, enabled: Boolean, onClick: () -> Unit) {
	val tone = tabTone(selected)
	val label = tabLabel(tab, badge)
	Column(
		modifier = Modifier
			.weight(1f)
			.heightIn(min = 52.dp)
			.selectable(selected = selected, enabled = enabled, onClick = onClick, role = Role.Tab)
			.then(if (label != tab.label) Modifier.semantics { contentDescription = label } else Modifier)
			.testTag("tab-${tab.name.lowercase()}")
			.padding(vertical = 10.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
		verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
	) {
		Box {
			Box(
				modifier = Modifier.height(28.dp).clip(FpShape.Pill).background(tone.pill.container).testTag("tab-pill-${tab.name.lowercase()}"),
				contentAlignment = Alignment.Center,
			) {
				Icon(
					painterResource(tab.icon),
					contentDescription = null,
					tint = tone.pill.content,
					modifier = Modifier.size(20.dp).testTag("tab-icon-${tab.name.lowercase()}"),
				)
			}
			FpCountBadge(badge, FpTheme.colors.tabBadge, Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-4).dp))
		}
		Text(
			tab.label,
			style = TabLabelText,
			color = tone.label,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
			textAlign = TextAlign.Center,
			modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp),
		)
	}
}
