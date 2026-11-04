package com.familyplanz.app.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.AdminBugsDto
import com.familyplanz.app.data.AdminCountsDto
import com.familyplanz.app.data.AdminNlpDto
import com.familyplanz.app.data.BugReportDto
import com.familyplanz.app.data.UnmatchedPhraseDto
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.secondary.ActionButton
import com.familyplanz.app.ui.secondary.Badge
import com.familyplanz.app.ui.secondary.ButtonLooks
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.secondary.LoadGate
import com.familyplanz.app.ui.secondary.PageCard
import com.familyplanz.app.ui.secondary.PageLead
import com.familyplanz.app.ui.secondary.PageTitle
import com.familyplanz.app.ui.secondary.PageTones
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

const val ADMIN_TITLE = "Admin"
const val BUGS_TITLE = "Bug Reports"
const val NLP_TITLE = "Unmatched Phrases"
const val BUGS_EMPTY = "No open bug reports."
const val NLP_EMPTY = "Nothing unmatched. Parsers are holding up."
const val EXPORT_COPIED = "Export copied to clipboard — paste it into your agent."

enum class AdminTab { BUGS, NLP }

/** Admin layout: the "Admin" link, the two tabs with open counts, and "Back to app". */
@Composable
fun AdminTabs(active: AdminTab?, badges: AdminBadges, onOpenAdmin: () -> Unit, onTab: (AdminTab) -> Unit, onBackToApp: () -> Unit) {
	Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 16.dp, vertical = 8.dp)) {
		FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
			Text(
				ADMIN_TITLE,
				modifier = Modifier.testTag("admin-home").heightIn(min = 44.dp).clickable(onClick = onOpenAdmin).padding(end = 8.dp),
				style = MaterialTheme.typography.bodyMedium,
				fontWeight = FontWeight.Bold,
				color = FpTheme.colors.textStrong,
			)
			Tab(BUGS_TITLE, badges.bugs, active == AdminTab.BUGS, Color(0xFFFEE2E2) to PageTones.Rose700, "admin-tab-bugs") { onTab(AdminTab.BUGS) }
			Tab(NLP_TITLE, badges.phrases, active == AdminTab.NLP, Slate.S200 to Slate.S600, "admin-tab-nlp") { onTab(AdminTab.NLP) }
			ActionButton("← Back to app", onBackToApp, ButtonLooks.Outline)
		}
	}
}

@Composable
private fun Tab(label: String, count: Int, selected: Boolean, badge: Pair<Color, Color>, tag: String, onClick: () -> Unit) {
	Row(
		modifier = Modifier.testTag(tag).heightIn(min = 44.dp)
			.background(if (selected) Slate.S900 else Color.Transparent, MaterialTheme.shapes.small)
			.clickable(onClick = onClick).padding(horizontal = 12.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(6.dp),
	) {
		Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = if (selected) Color.White else Slate.S600)
		if (selected) Badge(count.toString(), Color.White.copy(alpha = 0.2f), Color.White) else Badge(count.toString(), badge.first, badge.second)
	}
}

/** Page header shared by the three admin pages (no menu button; the tab strip carries navigation). */
@Composable
fun AdminHeader(title: String) {
	FpHeader(title)
}

// ---- /admin -----------------------------------------------------------------------------------

/** `/admin`: "Triage user feedback and parser gaps." and the two entry cards. */
@Composable
fun AdminHomeScreen(state: Load<AdminCountsDto>, onRetry: () -> Unit, onBugs: () -> Unit, onNlp: () -> Unit) {
	Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
		PageTitle(ADMIN_TITLE)
		PageLead("Triage user feedback and parser gaps.")
	}
	LoadGate(state, onRetry) { counts ->
		HomeCard(BUGS_TITLE, "${counts.openBugs} open", Color(0xFFFEE2E2) to PageTones.Rose700, "User-submitted reports, newest first. Resolve what's fixed.", "admin-card-bugs", onBugs)
		HomeCard(NLP_TITLE, "${counts.openPhrases} open", Slate.S200 to Slate.S600, "Instructions the parsers couldn't handle. Add patterns for frequent ones.", "admin-card-nlp", onNlp)
	}
}

@Composable
private fun HomeCard(title: String, open: String, badge: Pair<Color, Color>, blurb: String, tag: String, onClick: () -> Unit) {
	PageCard(modifier = Modifier.testTag(tag).clickable(onClick = onClick)) {
		Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
			Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = FpTheme.colors.textStrong)
			Badge(open, badge.first, badge.second)
		}
		Text(blurb, modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
	}
}

// ---- shared pieces ------------------------------------------------------------------------------

/** "Export for agent" toggle, then the register in a read-only box with Copy / Download .txt. */
@Composable
fun ExportPanel(exportText: String, onCopy: (String) -> Unit, onDownload: (String) -> Unit) {
	var open by remember { mutableStateOf(false) }
	Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
		Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
			ActionButton(if (open) "Hide export" else "Export for agent", { open = !open }, ButtonLooks.Outline, Modifier.testTag("export-toggle"))
			if (open) {
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					ActionButton("Copy", { onCopy(exportText) }, ButtonLooks.Outline, Modifier.testTag("export-copy"))
					ActionButton("Download .txt", { onDownload(exportText) }, ButtonLooks.Primary, Modifier.testTag("export-download"))
				}
			}
		}
		if (open) {
			PageCard(modifier = Modifier.testTag("export-text"), padding = PaddingValues(16.dp), fill = Slate.S50) {
				SelectionContainer {
					Text(exportText, style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace, fontSize = 12.sp), color = Slate.S700)
				}
			}
		}
	}
}

@Composable
private fun ResolvedList(count: Int, lines: List<String>, mono: Boolean) {
	var open by remember { mutableStateOf(false) }
	Column(modifier = Modifier.padding(top = 16.dp)) {
		Text(
			"Resolved ($count)",
			modifier = Modifier.testTag("resolved-toggle").heightIn(min = 44.dp).clickable { open = !open },
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Medium,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
		if (open) {
			lines.forEach {
				Text(it, modifier = Modifier.padding(vertical = 2.dp), style = MaterialTheme.typography.bodyMedium.copy(fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default), color = FpTheme.colors.textMuted)
			}
		}
	}
}

// ---- /admin/bugs --------------------------------------------------------------------------------

/** What the bug register can do. */
data class BugActions(
	val onRetry: () -> Unit = {},
	val onResolve: (String) -> Unit = {},
	val onCopy: (String) -> Unit = {},
	val onDownload: (String) -> Unit = {},
	val onOpenUrl: (String) -> Unit = {},
)

/** `/admin/bugs`: open reports newest first, each with Resolve; the resolved ones fold away. */
@Composable
fun AdminBugsScreen(state: Load<AdminBugsDto>, actions: BugActions) {
	Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
		PageTitle(BUGS_TITLE)
		PageLead("User-submitted bug reports, newest first.")
	}
	LoadGate(state, actions.onRetry) { data ->
		ExportPanel(data.exportText, actions.onCopy, actions.onDownload)
		if (data.open.isEmpty()) {
			EmptyCard(BUGS_EMPTY)
		} else {
			data.open.forEach { BugCard(it, actions) }
		}
		if (data.resolved.isNotEmpty()) {
			ResolvedList(data.resolved.size, data.resolved.map { "${bugAreaLabel(it.area)}: ${it.description.take(120)}" }, mono = false)
		}
	}
}

@Composable
private fun EmptyCard(text: String) {
	PageCard(borderColor = Slate.S300, dashed = true) {
		Text(text, modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textMuted, textAlign = TextAlign.Center)
	}
}

@Composable
private fun BugCard(report: BugReportDto, actions: BugActions) {
	PageCard(modifier = Modifier.testTag("bug-card"), padding = PaddingValues(16.dp)) {
		Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
				Badge(bugAreaLabel(report.area), Color(0xFFFEE2E2), Color(0xFFB91C1C))
				Text(reportedAtLabel(report.createdAt), style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
			}
			ActionButton("Resolve", { actions.onResolve(report.id) }, ButtonLooks.Outline, Modifier.testTag("bug-resolve"), shape = MaterialTheme.shapes.extraSmall)
		}
		Text(report.description, modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium, color = Slate.S800)
		Row(modifier = Modifier.padding(top = 12.dp)) {
			Text("Reported by ${reporterName(report)}", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
			report.url?.takeIf { it.isNotBlank() }?.let {
				Text(" · at ", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
				Text(it, modifier = Modifier.clickable { actions.onOpenUrl(it) }, style = MaterialTheme.typography.bodySmall, color = Primary.P600)
			}
		}
	}
}

// ---- /admin/nlp ---------------------------------------------------------------------------------

/** What the phrase register can do. */
data class NlpActions(
	val onRetry: () -> Unit = {},
	val onResolve: (String) -> Unit = {},
	val onCopy: (String) -> Unit = {},
	val onDownload: (String) -> Unit = {},
)

/** `/admin/nlp`: unmatched phrases grouped by source, each a card with Resolve (the web's table, one row per card). */
@Composable
fun AdminNlpScreen(state: Load<AdminNlpDto>, actions: NlpActions) {
	Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
		PageTitle(NLP_TITLE)
		PageLead("Instructions the NLP/regex parsers could not handle. Add patterns for the frequent ones.")
	}
	LoadGate(state, actions.onRetry) { data ->
		ExportPanel(data.exportText, actions.onCopy, actions.onDownload)
		if (data.phrases.isEmpty()) {
			Text(NLP_EMPTY, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textMuted)
		}
		data.phrases.groupBy { it.source }.forEach { (source, phrases) ->
			Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
				Text(phraseSourceLabel(source), style = MaterialTheme.typography.titleMedium, color = Slate.S700)
				Text("(${phrases.size})", style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textMuted)
			}
			phrases.forEach { PhraseCard(it, actions.onResolve) }
		}
		if (data.resolved.isNotEmpty()) {
			ResolvedList(data.resolved.size, data.resolved.map { "${it.phrase} ×${it.count}" }, mono = true)
		}
	}
}

@Composable
private fun PhraseCard(phrase: UnmatchedPhraseDto, onResolve: (String) -> Unit) {
	val summary = matchedSummary(phrase.matched)
	PageCard(modifier = Modifier.testTag("phrase-card"), padding = PaddingValues(16.dp)) {
		Text(phrase.phrase, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace), color = Slate.S800)
		if (summary != null) {
			Column(modifier = Modifier.padding(top = 8.dp)) {
				summary.forEach { (k, v) ->
					Text("$k: $v", style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), color = MaterialTheme.colorScheme.onSurfaceVariant)
				}
			}
		}
		Row(
			modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
			horizontalArrangement = Arrangement.SpaceBetween,
			verticalAlignment = Alignment.CenterVertically,
		) {
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
				Badge(phrase.count.toString(), Slate.S100, Slate.S600)
				Text(firstSeenLabel(phrase.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
			}
			ActionButton("Resolve", { onResolve(phrase.id) }, ButtonLooks.Outline, Modifier.testTag("phrase-resolve"), shape = MaterialTheme.shapes.extraSmall)
		}
	}
}
