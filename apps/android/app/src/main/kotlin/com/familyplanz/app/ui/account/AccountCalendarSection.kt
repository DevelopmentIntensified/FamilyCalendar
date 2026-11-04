package com.familyplanz.app.ui.account

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FpTheme

/**
 * Calendar Settings (2.12): week start, zone, default view, default calendar
 * and colour, the family-sync switch, SMART EVENT CREATION, the DAILY VERSE
 * toggle with its translation and the SPONSORSHIP toggle with the consent
 * trail (AC-AC-4..7).
 */
@Composable
fun CalendarSettingsSection(state: AccountState, actions: AccountActions) {
	val settings = state.settings
	AccountCard("Calendar Settings") {
		AccountChoiceRow(
			label = "Week start",
			options = WEEK_START_OPTIONS,
			selected = settings.weekStart,
			onSelect = actions.onWeekStart,
		)
		AccountTextField("Time Zone", settings.timeZone, actions.onTimeZone)
		AccountChoiceRow(
			label = "Default view",
			options = DEFAULT_VIEW_OPTIONS,
			selected = settings.defaultView,
			onSelect = actions.onDefaultView,
		)
		AccountTextField(
			"Default calendar",
			settings.defaultCalendarId.orEmpty(),
			{ actions.onColour(settings.color) },
			placeholder = "None (use first available)",
		)
		AccountTextField("Colour", settings.color, actions.onColour)
		AccountSwitchRow(
			label = "Sync to family calendar",
			hint = "Events you add also land on your family's calendar.",
			checked = settings.syncEventsToFamilyCalendar,
			onCheckedChange = actions.onSyncToFamily,
		)
		SectionLabel("SMART EVENT CREATION")
		AccountSwitchRow(
			label = "Read details from what I type",
			checked = settings.autoParseEventDetails,
			onCheckedChange = actions.onSmartCreation,
		)
		SectionLabel("DAILY VERSE")
		AccountSwitchRow(
			label = "Show the daily verse",
			checked = settings.showDailyVerse,
			onCheckedChange = actions.onDailyVerse,
		)
		if (settings.showDailyVerse) {
			val options = state.translations.takeIf { it.isNotEmpty() }?.map { it.id to (it.label.ifBlank { it.id.uppercase() }) }
				?: FALLBACK_TRANSLATIONS
			AccountChoiceRow(
				label = "Translation",
				options = options,
				selected = settings.verseTranslation,
				onSelect = actions.onTranslation,
			)
		}
		SectionLabel("SPONSORSHIP")
		AccountSwitchRow(
			label = "Show sponsored events on my calendar",
			checked = settings.showAdsAsEvents,
			onCheckedChange = actions.onSponsorship,
		)
		if (state.consentTrail.isEmpty()) {
			Text(NO_CONSENT_COPY, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		} else {
			state.consentTrail.forEach { row ->
				Text(
					"${row.decision} \u00B7 ${row.recordedAt.substringBefore('T')}",
					style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textBody,
				)
			}
		}
	}
}

/** AC-AC-8: per-user module switches; "Kids' Schedule" is the AC's own example. */
@Composable
fun DashboardModulesSection(state: AccountState, actions: AccountActions) {
	val hidden = state.settings.hiddenDashboardModules
	AccountCard("Dashboard modules") {
		Text(
			"Switch a card off and it stays off on your Day Dashboard only.",
			style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		ACCOUNT_MODULES.forEach { (module, label) ->
			AccountSwitchRow(
				label = label,
				checked = module !in hidden,
				onCheckedChange = { actions.onModule(module, it) },
			)
		}
		Text(
			"Meals arrive with the family module; the switch appears once your family turns it on.",
			style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
	}
}

/** A small uppercase label inside a card (the web's section sub-headers). */
@Composable
fun SectionLabel(text: String) {
	Text(
		text,
		style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
		fontWeight = FontWeight.SemiBold,
		color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
		modifier = Modifier.padding(top = 8.dp),
	)
}

/** The Day Dashboard module ids/labels (`dashboardModules.ts:21-33`). */
val ACCOUNT_MODULES: List<Pair<String, String>> = listOf(
	"todaySchedule" to "Today's schedule",
	"upcomingEvents" to "Upcoming events",
	"openTasks" to "Open tasks",
	"kidsSchedule" to "Kids' Schedule",
	"familyActivity" to "Family activity",
	"dailyVerse" to "Daily verse",
)
