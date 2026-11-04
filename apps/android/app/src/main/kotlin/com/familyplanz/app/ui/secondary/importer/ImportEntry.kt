package com.familyplanz.app.ui.secondary.importer

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.secondary.PageEffects
import com.familyplanz.app.ui.secondary.PageScaffold
import com.familyplanz.app.ui.shell.LocalAppModules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.InputStream

private val CALENDAR_MIME_TYPES = arrayOf("text/calendar", "application/ics", "text/plain", "application/octet-stream")

/** The menu's Import page (§2.14, G17): the system file picker feeds the preview, tick and commit flow. */
@Composable
fun ImportEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.secondary.importViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	val resolver = LocalContext.current.contentResolver
	val scope = rememberCoroutineScope()
	val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
		if (uris.isNotEmpty()) scope.launch { vm.addFiles(withContext(Dispatchers.IO) { uris.mapNotNull { resolver.readPicked(it) } }) }
	}
	PageEffects(vm)
	PageScaffold("Import", nav) {
		ImportScreen(
			state,
			ImportActions(
				onBack = { nav.open(AppRoute.ACCOUNT) },
				onPickFiles = { picker.launch(CALENDAR_MIME_TYPES) },
				onCalendar = vm::selectCalendar,
				onRemoveChosen = vm::removeChosen,
				onPreview = vm::preview,
				onPick = vm::select,
				onCommit = vm::commit,
				onUndo = vm::undo,
				onStartOver = vm::startOver,
				onOpenDay = { day -> nav.open(AppRoute.CALENDAR, day) },
				onOpenCalendar = { nav.open(AppRoute.CALENDAR) },
				onRetryCalendars = vm::loadCalendars,
			),
		)
	}
}

/** The picked document's name and bytes; null when it cannot be opened (the file is skipped). */
private fun ContentResolver.readPicked(uri: Uri): PickedFile? {
	val name = query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
		if (cursor.moveToFirst()) cursor.getString(0) else null
	} ?: uri.lastPathSegment ?: "calendar.ics"
	val bytes = runCatching { openInputStream(uri)?.use { it.readAtMost(IMPORT_MAX_FILE_BYTES) } }.getOrNull() ?: return null
	return PickedFile(name, bytes)
}

/** Reads until the end or just past [limit] bytes, so an oversized file is caught without filling memory. */
private fun InputStream.readAtMost(limit: Int): ByteArray {
	val out = ByteArrayOutputStream()
	val buffer = ByteArray(BUFFER)
	var total = 0
	while (total <= limit) {
		val n = read(buffer)
		if (n < 0) break
		out.write(buffer, 0, n)
		total += n
	}
	return out.toByteArray()
}

private const val BUFFER = 8192
