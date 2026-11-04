package com.familyplanz.app.ui.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/**
 * The Account screen (2.12): breadcrumb, the title block, the identity card,
 * the banner and the rail of sections with the chosen one's card below.
 * It is a menu destination, not a tab, so it opens from the shell's menu.
 */
@Composable
fun AccountScreen(
	state: AccountState,
	actions: AccountActions,
	menu: @Composable () -> Unit = {},
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Account") { menu() }
		Column(
			modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 24.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			AccountBreadcrumb()
			Column {
				Text("Account Settings", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
				Text(ACCOUNT_SUBTITLE, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
				Text(
					BACK_TO_CALENDAR,
					style = MaterialTheme.typography.bodySmall,
					fontWeight = FontWeight.SemiBold,
					color = MaterialTheme.colorScheme.primary,
					modifier = Modifier.clickable(onClick = actions.onBack).heightIn(min = 44.dp).padding(vertical = 12.dp),
				)
			}
			AccountRail(state.section, actions.onSelectSection)
			IdentityCard(state, actions)
			state.banner?.let { AccountBannerView(it) }
			if (state.loading) {
				Text("Loading your settings\u2026", style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textMuted)
			} else {
				AccountSectionCard(state, actions)
			}
		}
	}
}

/** `Calendar › Account`, 12 sp. */
@Composable
private fun AccountBreadcrumb() {
	Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
		Text("Calendar \u203A", style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp), color = FpTheme.colors.textMuted)
		Text("Account", style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp), fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textBody)
	}
}

/** AC-AC-1: the ten sections plus Report a Bug, in order, active row primary-50/700. */
@Composable
private fun AccountRail(selected: AccountSection, onSelect: (AccountSection) -> Unit) {
	Surface(
		modifier = Modifier.fillMaxWidth(),
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
	) {
		Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
			Text(
				SETTINGS_RAIL_TITLE,
				fontSize = 11.sp,
				fontWeight = FontWeight.Bold,
				letterSpacing = 0.9.sp,
				color = Slate.S400,
			)
			AccountSection.entries.forEach { section ->
				val active = section == selected
				Text(
					section.label,
					style = MaterialTheme.typography.bodyMedium,
					fontWeight = FontWeight.SemiBold,
					color = if (active) MaterialTheme.colorScheme.onPrimaryContainer else FpTheme.colors.textBody,
					modifier = Modifier
						.fillMaxWidth()
						.clip(MaterialTheme.shapes.small)
						.background(if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
						.clickable { onSelect(section) }
						.heightIn(min = 44.dp)
						.padding(horizontal = 8.dp, vertical = 12.dp),
				)
			}
		}
	}
}

/** AC-AC-1/AC-AC-13: the blush avatar, the name and the email (or the guest line). */
@Composable
private fun IdentityCard(state: AccountState, actions: AccountActions) {
	Surface(
		modifier = Modifier.fillMaxWidth(),
		shape = MaterialTheme.shapes.medium,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
	) {
		Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
			Column(
				modifier = Modifier.size(40.dp).clip(CircleShape).background(BLUSH),
				horizontalAlignment = Alignment.CenterHorizontally,
				verticalArrangement = Arrangement.Center,
			) {
				Text(initialOf(state), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = BLUSH_INK)
			}
			Column(modifier = Modifier.weight(1f)) {
				Text(
					listOfNotNull(state.me?.firstName, state.me?.lastName).joinToString(" ").ifBlank { "Your account" },
					style = MaterialTheme.typography.bodyLarge,
					fontWeight = FontWeight.Bold,
					color = FpTheme.colors.textStrong,
				)
				Text(identityEmailLine(state.me), style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
			}
			if (state.me?.isAnonymous != false) {
				Text(
					CLAIM_CTA,
					style = MaterialTheme.typography.bodySmall,
					fontWeight = FontWeight.SemiBold,
					color = MaterialTheme.colorScheme.primary,
					modifier = Modifier.clickable(onClick = actions.onClaim),
				)
			}
		}
	}
}

/** The green success / red error banner the writes land in (AC-AC-9). */
@Composable
private fun AccountBannerView(banner: AccountBanner) {
	Surface(
		modifier = Modifier.fillMaxWidth(),
		shape = MaterialTheme.shapes.medium,
		color = if (banner.success) com.familyplanz.app.ui.theme.Accent.Emerald100 else MaterialTheme.colorScheme.errorContainer,
	) {
		Text(
			banner.text,
			style = MaterialTheme.typography.bodyMedium,
			color = if (banner.success) com.familyplanz.app.ui.theme.Accent.Emerald700 else MaterialTheme.colorScheme.onErrorContainer,
			modifier = Modifier.padding(12.dp),
		)
	}
}

/** The one section whose card shows (AC-AC-2). */
@Composable
private fun AccountSectionCard(state: AccountState, actions: AccountActions) {
	when (state.section) {
		AccountSection.PROFILE -> ProfileSection(state, actions)
		AccountSection.FAMILIES -> FamiliesSection(state, actions)
		AccountSection.NOTIFICATIONS -> NotificationsSection(state, actions)
		AccountSection.CALENDAR -> CalendarSettingsSection(state, actions)
		AccountSection.DASHBOARD -> DashboardModulesSection(state, actions)
		AccountSection.PLAN -> PlanSection(state, actions)
		AccountSection.EMAIL -> EmailSection(state, actions)
		AccountSection.SECURITY -> SecuritySection(actions)
		AccountSection.API_TOKENS -> TokensSection(state, actions)
		AccountSection.DANGER_ZONE -> DangerZoneSection(state, actions)
		AccountSection.REPORT_BUG -> ReportBugSection(actions)
	}
}

/** The blush avatar tint (#FED5CF / #c45e38). */
private val BLUSH = Color(0xFFFED5CF)

private val BLUSH_INK = Color(0xFFC45E38)

private fun initialOf(state: AccountState): String =
	(state.me?.firstName?.take(1) ?: state.me?.email?.take(1) ?: "A").uppercase()
