@file:Suppress("TooManyFunctions")
package com.familyplanz.app.ui.secondary.importer

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.R
import com.familyplanz.app.data.ImportCommitDto
import com.familyplanz.app.data.ImportUndoDto
import com.familyplanz.app.ui.secondary.ActionButton
import com.familyplanz.app.ui.secondary.BackLink
import com.familyplanz.app.ui.secondary.Badge
import com.familyplanz.app.ui.secondary.ButtonLooks
import com.familyplanz.app.ui.secondary.PageCard
import com.familyplanz.app.ui.secondary.PageTitle
import com.familyplanz.app.ui.secondary.PageTones
import com.familyplanz.app.ui.secondary.SelectField
import com.familyplanz.app.ui.secondary.SelectOption
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

const val IMPORT_TITLE = "Import a calendar"
const val IMPORT_CHOOSE = "Choose .ics files"
const val IMPORT_PREVIEW_BUTTON = "Preview events"
const val IMPORT_READING = "Reading file…"
const val IMPORT_EMPTY_PREVIEW =
	"That file parsed, but every event in it was cancelled or had no title and start time — so there is nothing to preview. " +
		"Try the .ics from inside your export again."

/** What the import page can do besides show state. */
data class ImportActions(
	val onBack: () -> Unit = {},
	val onPickFiles: () -> Unit = {},
	val onCalendar: (String) -> Unit = {},
	val onRemoveChosen: (Int) -> Unit = {},
	val onPreview: () -> Unit = {},
	val onPick: (Pick) -> Unit = {},
	val onCommit: () -> Unit = {},
	val onUndo: () -> Unit = {},
	val onStartOver: () -> Unit = {},
	val onOpenDay: (String) -> Unit = {},
	val onOpenCalendar: () -> Unit = {},
	val onRetryCalendars: () -> Unit = {},
)

/** `/calendar/import` at phone width: the three-step flow (upload, preview and tick, result with undo) over the export help. */
@Composable
fun ImportScreen(state: ImportUiState, actions: ImportActions) {
	Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
		BackLink("‹ Back to settings", actions.onBack)
		PageTitle(IMPORT_TITLE)
		Text(
			"Bring events in from Google Calendar, Apple Calendar, Outlook, or any app that exports .ics files. " +
				"You'll see every event before anything is added.",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
	}
	state.error?.let { ErrorBanner(it, actions.onRetryCalendars.takeIf { state.calendars.isEmpty() }) }
	when {
		state.report != null -> ReportCard(state, state.report, state.undo, actions)
		state.preview != null -> PreviewSection(state, state.preview, actions)
		else -> UploadForm(state, actions)
	}
	ExportHelp()
}

@Composable
private fun ErrorBanner(message: String, onRetry: (() -> Unit)?) {
	Column(
		modifier = Modifier.fillMaxWidth().testTag("import-error")
			.background(MaterialTheme.colorScheme.errorContainer, MaterialTheme.shapes.small)
			.border(1.dp, Color(0xFFFECACA), MaterialTheme.shapes.small).padding(16.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
		if (onRetry != null) ActionButton("Try again", onRetry, ButtonLooks.Outline)
	}
}

// ---- step 1: upload ------------------------------------------------------------------------

@Composable
private fun UploadForm(state: ImportUiState, actions: ImportActions) {
	val busy = state.pending != null
	Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
		Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
			Text("Import into", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = Slate.S700)
			val options = state.calendars.map { SelectOption(it.id, it.name) }
			SelectField(options, state.calendarId.orEmpty(), actions.onCalendar, testTag = "import-calendar")
		}
		DropZone(state.chosen, actions.onPickFiles)
		state.chosen.forEachIndexed { index, file -> ChosenRow(file, index, actions.onRemoveChosen) }
		ActionButton(
			text = if (state.pending == ImportPending.PREVIEW) IMPORT_READING else IMPORT_PREVIEW_BUTTON,
			onClick = actions.onPreview,
			look = ButtonLooks.Primary,
			modifier = Modifier.fillMaxWidth().testTag("import-preview-button"),
			enabled = state.chosen.isNotEmpty() && !busy,
		)
		Text(
			"Nothing is added until you tick the events you want and confirm.",
			modifier = Modifier.fillMaxWidth(),
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
	}
}

/** `border-2 border-dashed rounded-xl bg-slate-50` target; tapping it opens the system file picker. */
@Composable
private fun DropZone(chosen: List<ChosenFile>, onPick: () -> Unit) {
	val label = when (chosen.size) {
		0 -> IMPORT_CHOOSE
		1 -> chosen.first().name
		else -> "${chosen.size} files chosen"
	}
	val shape = MaterialTheme.shapes.medium
	Column(
		modifier = Modifier.fillMaxWidth().testTag("import-drop-zone")
			.background(Slate.S50, shape)
			.drawBehind {
				val dash = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 6.dp.toPx()))
				drawRoundRect(Slate.S300, cornerRadius = CornerRadius(12.dp.toPx()), style = Stroke(2.dp.toPx(), pathEffect = dash))
			}
			.clickable(onClick = onPick).padding(horizontal = 24.dp, vertical = 40.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
		verticalArrangement = Arrangement.spacedBy(8.dp),
	) {
		Text(
			label,
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Medium,
			color = Slate.S700,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
		)
		Hint(if (chosen.isEmpty()) "Up to 500 events · max 5 MB each · 10 files" else "Ready to preview")
		Hint("Files are read on your phone and sent as text — nothing is uploaded to a third party.")
	}
}

@Composable
private fun Hint(text: String) {
	Text(text, style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted, textAlign = TextAlign.Center)
}

@Composable
private fun ChosenRow(file: ChosenFile, index: Int, onRemove: (Int) -> Unit) {
	Row(
		modifier = Modifier.fillMaxWidth().testTag("chosen-file").heightIn(min = 44.dp).padding(horizontal = 12.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp),
	) {
		IcsTag(Slate.S100, Slate.S500)
		Text(
			file.name,
			modifier = Modifier.weight(1f),
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Medium,
			color = Slate.S800,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
		)
		Text(sizeLabel(file.bytes.size), style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		RemoveCross("Remove ${file.name}") { onRemove(index) }
	}
	HorizontalDivider(color = Slate.S100)
}

@Composable
private fun IcsTag(container: Color, content: Color) {
	Text(
		"ICS",
		modifier = Modifier.background(container, MaterialTheme.shapes.extraSmall).padding(horizontal = 6.dp, vertical = 2.dp),
		style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
		fontWeight = FontWeight.Bold,
		color = content,
	)
}

@Composable
private fun RemoveCross(description: String, onClick: () -> Unit) {
	Box(
		modifier = Modifier.size(44.dp).clickable(onClick = onClick).semantics { contentDescription = description },
		contentAlignment = Alignment.Center,
	) {
		Icon(painterResource(R.drawable.ic_fp_close), contentDescription = null, tint = FpTheme.colors.textMuted, modifier = Modifier.size(16.dp))
	}
}

// ---- step 2: preview and tick -----------------------------------------------------------------

@Composable
private fun PreviewSection(state: ImportUiState, preview: ImportPreview, actions: ImportActions) {
	PageCard(modifier = Modifier.testTag("import-preview")) {
		Text(
			"${plural(preview.items.size, "event")} in ${preview.fileName}",
			style = MaterialTheme.typography.titleSmall,
			color = FpTheme.colors.textStrong,
		)
		Text(
			"Nothing has been added to ${preview.calendarName} yet.",
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
		if (preview.items.isEmpty()) {
			Text(
				IMPORT_EMPTY_PREVIEW,
				modifier = Modifier.padding(top = 12.dp).fillMaxWidth().background(Slate.S50, MaterialTheme.shapes.small).padding(16.dp),
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
		} else {
			PreviewBody(state, preview, actions)
		}
	}
	CommitBar(state, preview, actions)
}

@Composable
private fun PreviewBody(state: ImportUiState, preview: ImportPreview, actions: ImportActions) {
	Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
		FilesCard(preview, actions.onPick)
		if (preview.duplicates > 0) DuplicateNote(preview)
		SelectionBar(state, preview, actions.onPick)
		Column(modifier = Modifier.fillMaxWidth().border(1.dp, Slate.S200, MaterialTheme.shapes.small)) {
			preview.items.forEachIndexed { index, item ->
				if (index > 0) HorizontalDivider(color = Slate.S100)
				ItemRow(item, preview.calendarName, item.key in state.picked) { actions.onPick(Pick.Toggle(item.key, it)) }
			}
		}
	}
}

/** "What is in them": one row per export with its own count, dupes and remove cross. */
@Composable
private fun FilesCard(preview: ImportPreview, onPick: (Pick) -> Unit) {
	val totals = remember(preview) { preview.files.sumOf { it.events } to preview.files.sumOf { it.duplicates } }
	Column(
		modifier = Modifier.fillMaxWidth().background(Slate.S50, MaterialTheme.shapes.small)
			.border(1.dp, Slate.S200, MaterialTheme.shapes.small).padding(12.dp),
	) {
		Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
			Text("What is in them", style = MaterialTheme.typography.titleSmall, color = Slate.S800)
			Text(
				"${plural(totals.first, "event")} · ${totals.second} likely duplicate${if (totals.second == 1) "" else "s"}",
				modifier = Modifier.testTag("import-totals"),
				style = MaterialTheme.typography.bodySmall,
				color = MaterialTheme.colorScheme.onSurfaceVariant,
			)
		}
		preview.files.forEach { file ->
			Row(
				modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
				verticalAlignment = Alignment.CenterVertically,
				horizontalArrangement = Arrangement.spacedBy(8.dp),
			) {
				IcsTag(Slate.S200, Slate.S600)
				Text(
					file.fileName,
					modifier = Modifier.weight(1f),
					style = MaterialTheme.typography.bodyMedium,
					fontWeight = FontWeight.Medium,
					color = Slate.S800,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
				)
				Text(plural(file.events, "event"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
				if (file.duplicates > 0) {
					Badge(plural(file.duplicates, "dupe"), PageTones.Rose100, PageTones.Rose700)
				} else {
					Badge("no dupes", PageTones.Emerald100, PageTones.Emerald700)
				}
				RemoveCross("Remove ${file.fileName} from this import") { onPick(Pick.DropFile(file.fileName)) }
			}
		}
		Text(
			"Nothing is written until you confirm.",
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
	}
}

@Composable
private fun DuplicateNote(preview: ImportPreview) {
	val n = preview.duplicates
	val looks = if (n == 1) "looks" else "look"
	val subject = if (n == 1) "it is" else "they are"
	val them = if (n == 1) "it" else "them"
	Text(
		"$n $looks like $subject already on ${preview.calendarName} — same title, same start. " +
			"Left unticked; tick $them only if you want a second copy.",
		modifier = Modifier.fillMaxWidth().background(FpTheme.colors.warnSurface, MaterialTheme.shapes.small)
			.border(1.dp, FpTheme.colors.warnBorder, MaterialTheme.shapes.small).padding(horizontal = 12.dp, vertical = 8.dp),
		style = MaterialTheme.typography.bodySmall,
		color = FpTheme.colors.warnContent,
	)
}

@Composable
private fun SelectionBar(state: ImportUiState, preview: ImportPreview, onPick: (Pick) -> Unit) {
	FlowRow(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp),
		itemVerticalAlignment = Alignment.CenterVertically,
	) {
		ActionButton("Select all", { onPick(Pick.All) }, ButtonLooks.Outline)
		ActionButton("Select none", { onPick(Pick.None) }, ButtonLooks.Outline)
		if (!state.atDefault) ActionButton("Back to suggested", { onPick(Pick.Suggested) }, ButtonLooks.Amber)
		Text(
			"${state.picked.size} of ${preview.items.size} selected",
			modifier = Modifier.testTag("import-selected"),
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
	}
}

@Composable
private fun ItemRow(item: ImportItem, calendarName: String, ticked: Boolean, onToggle: (Boolean) -> Unit) {
	Row(
		modifier = Modifier.fillMaxWidth().testTag("import-item")
			.background(if (item.duplicate) Color(0xFFFFFBEB).copy(alpha = 0.6f) else Color.Transparent)
			.padding(horizontal = 12.dp, vertical = 10.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Checkbox(
			checked = ticked,
			onCheckedChange = onToggle,
			modifier = Modifier.semantics { contentDescription = "Import ${item.title}" },
		)
		Column(modifier = Modifier.weight(1f)) {
			Text(
				item.title,
				style = MaterialTheme.typography.bodyMedium,
				fontWeight = FontWeight.Medium,
				color = if (item.duplicate) Slate.S600 else FpTheme.colors.textStrong,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
			)
			Text(item.whenText, style = MaterialTheme.typography.bodySmall, color = Slate.S600)
			item.location?.let {
				Text(
					it,
					style = MaterialTheme.typography.bodySmall,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
				)
			}
			item.reason?.let {
				Text(it.note.format(calendarName), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = Accent.Amber700)
			}
		}
		if (item.duplicate) {
			Badge("already there", PageTones.Rose100, PageTones.Rose700)
		} else {
			Badge("new", PageTones.Emerald100, PageTones.Emerald700)
		}
	}
}

@Composable
private fun CommitBar(state: ImportUiState, preview: ImportPreview, actions: ImportActions) {
	if (preview.items.isEmpty()) {
		ActionButton("Start over", actions.onStartOver, ButtonLooks.Outline, Modifier.fillMaxWidth())
		return
	}
	val picked = state.picked.size
	val label = when {
		state.pending == ImportPending.COMMIT -> "Adding…"
		picked == 0 -> "Tick the events you want"
		else -> "Add ${plural(picked, "event")}"
	}
	Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
		ActionButton(
			label,
			actions.onCommit,
			ButtonLooks.Primary,
			Modifier.fillMaxWidth().testTag("import-commit"),
			enabled = picked > 0 && state.pending == null,
		)
		ActionButton("Start over", actions.onStartOver, ButtonLooks.Outline, Modifier.fillMaxWidth())
	}
}

// ---- step 3: result ---------------------------------------------------------------------------

@Composable
private fun ReportCard(state: ImportUiState, report: ImportCommitDto, undo: ImportUndoDto?, actions: ImportActions) {
	PageCard(
		modifier = Modifier.testTag("import-success"),
		padding = PaddingValues(20.dp),
		borderColor = PageTones.Green200,
		fill = PageTones.Green50,
	) {
		if (undo != null) Undone(undo) else Added(state, report, actions)
		FlowRow(
			modifier = Modifier.padding(top = 16.dp),
			horizontalArrangement = Arrangement.spacedBy(8.dp),
			verticalArrangement = Arrangement.spacedBy(8.dp),
		) {
			ActionButton("View your calendar", actions.onOpenCalendar, ButtonLooks.Primary)
			ActionButton("Import another file", actions.onStartOver, ButtonLooks.GreenOutline)
		}
	}
}

@Composable
private fun Undone(undo: ImportUndoDto) {
	Column(modifier = Modifier.testTag("import-undone"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
		Text(
			"Removed ${plural(undo.removed, "event")} from your ${undo.calendarName}",
			style = MaterialTheme.typography.titleMedium,
			color = PageTones.Green800,
		)
		if (undo.kept.isNotEmpty()) {
			val keptTitles = undo.kept.joinToString(", ") { it.title }
			GreenLine("Kept ${undo.kept.size} you changed since the import: $keptTitles. Open it to undo that yourself.")
		}
		if (undo.alreadyGone > 0) GreenLine("${undo.alreadyGone} were already off the calendar — nothing to remove.")
		GreenLine("Your calendar is back to how it was before this import.")
	}
}

@Composable
private fun GreenLine(text: String) {
	Text(text, style = MaterialTheme.typography.bodyMedium, color = PageTones.Green700)
}

@Composable
private fun Added(state: ImportUiState, report: ImportCommitDto, actions: ImportActions) {
	val landed = remember(report) { firstLandedLabel(report.importedEvents.map { it.startIso }) }
	Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
		Text(
			"Added ${plural(report.imported, "event")} to your ${report.calendarName}",
			style = MaterialTheme.typography.titleMedium,
			color = PageTones.Green800,
		)
		GreenLine("You ticked ${report.selected}.")
		landed?.let { (day, label) ->
			Row {
				GreenLine("First one landed on ")
				Text(
					label,
					modifier = Modifier.clickable { actions.onOpenDay(day) }.testTag("import-first-landed"),
					style = MaterialTheme.typography.bodyMedium,
					color = PageTones.Green700,
					textDecoration = TextDecoration.Underline,
				)
				GreenLine(".")
			}
		}
		if (report.skippedDuplicates > 0) GreenLine("Skipped ${report.skippedDuplicates} already on the calendar when we checked again.")
		if (report.failed.isNotEmpty()) GreenLine("Couldn't save: ${report.failed.joinToString(", ")}.")
		if (report.importedEvents.isNotEmpty()) {
			ActionButton(
				text = if (state.pending == ImportPending.UNDO) "Undoing…" else "Undo this import (${plural(report.importedEvents.size, "event")})",
				onClick = actions.onUndo,
				look = ButtonLooks.GreenOutline,
				modifier = Modifier.fillMaxWidth().testTag("import-undo"),
				enabled = state.pending == null,
			)
			Text(
				"Removes what this import added. Anything you have edited since stays.",
				style = MaterialTheme.typography.bodySmall,
				color = PageTones.Green700,
			)
		}
		PickAndChoose(actions.onOpenCalendar)
	}
}

@Composable
private fun PickAndChoose(onOpenCalendar: () -> Unit) {
	Column(
		modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
			.background(FpTheme.colors.warnSurface, MaterialTheme.shapes.small)
			.border(1.dp, FpTheme.colors.warnBorder, MaterialTheme.shapes.small).padding(12.dp),
	) {
		Text(
			"Need to pick and choose instead?",
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = FontWeight.Bold,
			color = FpTheme.colors.warnContent,
		)
		Text(
			"Open the calendar, tap Select in the toolbar, tick the events and delete them in bulk.",
			modifier = Modifier.clickable(onClick = onOpenCalendar),
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.warnContent,
		)
	}
}

// ---- help --------------------------------------------------------------------------------------

@Composable
private fun ExportHelp() {
	PageCard {
		Text(
			"HOW TO EXPORT FROM",
			style = MaterialTheme.typography.titleSmall.copy(letterSpacing = 0.4.sp),
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
		Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			Source("Google:", "Settings → Import & Export → Export → download .zip → unzip → use the .ics inside.")
			Source("Apple:", "Calendar app → File → Export → Export…")
			Source("Outlook:", "File → Save Calendar → choose iCalendar format.")
		}
		Text(
			"Recurring rules import as daily / weekly / monthly / yearly repeats, including specific weekdays (e.g. Mon/Wed/Fri) and " +
				"occurrence-count limits. Exotic rules (monthly BYDAY, timezone definitions outside common US zones) are simplified.",
			modifier = Modifier.padding(top = 12.dp),
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
	}
}

@Composable
private fun Source(name: String, steps: String) {
	Text(
		buildAnnotatedString {
			withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Slate.S800)) { append("$name ") }
			append(steps)
		},
		style = MaterialTheme.typography.bodyMedium,
		color = Slate.S600,
	)
}
