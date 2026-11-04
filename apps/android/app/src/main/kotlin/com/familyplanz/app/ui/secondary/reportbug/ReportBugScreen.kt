package com.familyplanz.app.ui.secondary.reportbug

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.secondary.BackLink
import com.familyplanz.app.ui.secondary.PageCard
import com.familyplanz.app.ui.secondary.PageLead
import com.familyplanz.app.ui.secondary.PageTones
import com.familyplanz.app.ui.secondary.SelectField
import com.familyplanz.app.ui.secondary.SelectOption
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

const val REPORT_BUG_TITLE = "Report a Bug"
const val REPORT_BUG_THANKS = "Thanks — report submitted"
const val REPORT_BUG_SUBMIT = "Submit Bug Report"
const val REPORT_BUG_SUBMITTING = "Submitting…"
const val REPORT_BUG_PLACEHOLDER = "What were you doing, what happened, and what did you expect to happen?"

/** What the form does besides show state. */
data class ReportBugActions(
	val onArea: (String) -> Unit = {},
	val onDescription: (String) -> Unit = {},
	val onSubmit: () -> Unit = {},
	val onBack: () -> Unit = {},
	val onBackToCalendar: () -> Unit = {},
)

/** `/report-bug`: one card, the form or (after a send) the thank-you. */
@Composable
fun ReportBugScreen(state: ReportBugUiState, actions: ReportBugActions) {
	PageCard(padding = PaddingValues(24.dp)) {
		if (state.submitted) Thanks(actions.onBackToCalendar) else Form(state, actions)
	}
}

@Composable
private fun Thanks(onBackToCalendar: () -> Unit) {
	Column(
		modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp).testTag("report-thanks"),
		horizontalAlignment = Alignment.CenterHorizontally,
		verticalArrangement = Arrangement.spacedBy(4.dp),
	) {
		Box(Modifier.padding(bottom = 8.dp).size(48.dp).background(PageTones.Green100, FpShape.Pill), contentAlignment = Alignment.Center) {
			Text("✓", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = PageTones.Green600)
		}
		Text(REPORT_BUG_THANKS, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
		Text(
			"We've logged your bug report. We'll use it to make the app better.",
			style = MaterialTheme.typography.bodyMedium,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
			textAlign = TextAlign.Center,
		)
		FpPrimaryButton(onClick = onBackToCalendar, modifier = Modifier.padding(top = 20.dp)) { Text("Back to Calendar") }
	}
}

@Composable
private fun Form(state: ReportBugUiState, actions: ReportBugActions) {
	val areas = BUG_AREAS.map { SelectOption(it, BUG_AREA_LABELS[it] ?: it) }
	Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
		Column {
			BackLink("← Back", actions.onBack)
			Text(REPORT_BUG_TITLE, style = MaterialTheme.typography.titleLarge, color = FpTheme.colors.textStrong)
			Box(Modifier.padding(top = 4.dp)) { PageLead("Something not working? Tell us what happened and we'll look into it.") }
		}
		state.error?.let {
			Text(
				it,
				modifier = Modifier.fillMaxWidth().testTag("report-error")
					.background(MaterialTheme.colorScheme.errorContainer, MaterialTheme.shapes.small).padding(12.dp),
				style = MaterialTheme.typography.bodyMedium,
				color = PageTones.Red800,
			)
		}
		Label("What's the bug about?")
		SelectField(areas, state.area, actions.onArea, testTag = "report-area")
		Label("Describe the bug")
		OutlinedTextField(
			value = state.description,
			onValueChange = actions.onDescription,
			modifier = Modifier.fillMaxWidth().testTag("report-description"),
			placeholder = { Text(REPORT_BUG_PLACEHOLDER) },
			minLines = 6,
			shape = MaterialTheme.shapes.small,
			colors = fpFieldColors(),
		)
		FpPrimaryButton(onClick = actions.onSubmit, enabled = !state.pending) {
			Text(if (state.pending) REPORT_BUG_SUBMITTING else REPORT_BUG_SUBMIT)
		}
	}
}

@Composable
private fun Label(text: String) {
	Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = FpTheme.colors.textBody)
}
