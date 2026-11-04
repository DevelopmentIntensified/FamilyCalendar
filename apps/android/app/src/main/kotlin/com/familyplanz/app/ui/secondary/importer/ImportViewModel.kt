package com.familyplanz.app.ui.secondary.importer

import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ImportCalendarDto
import com.familyplanz.app.data.ImportCommitDto
import com.familyplanz.app.data.ImportCommitRequest
import com.familyplanz.app.data.ImportFileDto
import com.familyplanz.app.data.ImportPreviewRequest
import com.familyplanz.app.data.ImportSource
import com.familyplanz.app.data.ImportUndoDto
import com.familyplanz.app.data.ImportUndoRequest
import com.familyplanz.app.ui.secondary.PageViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Base64

/** A file waiting in the drop zone's list. The bytes stay local until "Preview events". */
class ChosenFile(val name: String, val bytes: ByteArray)

/** Which request is in flight (buttons show their busy label and everything is disabled). */
enum class ImportPending { CALENDARS, PREVIEW, COMMIT, UNDO }

data class ImportUiState(
	val calendars: List<ImportCalendarDto> = emptyList(),
	val calendarId: String? = null,
	val chosen: List<ChosenFile> = emptyList(),
	val pending: ImportPending? = ImportPending.CALENDARS,
	val error: String? = null,
	val preview: ImportPreview? = null,
	/** The user's own tick set; null = still following the server's suggestion. */
	val override: Set<String>? = null,
	val report: ImportCommitDto? = null,
	val undo: ImportUndoDto? = null,
) {
	val picked: Set<String> get() = override ?: preview?.defaultSelection.orEmpty()
	val atDefault: Boolean get() = override == null
}

/**
 * The .ics import page as one state machine: choose files, preview (writes
 * nothing), tick, commit, then optionally undo that batch. Server messages
 * show inline; the web's toasts go to the shell as snacks.
 */
class ImportViewModel(private val source: ImportSource) : PageViewModel() {
	private val _ui = MutableStateFlow(ImportUiState())
	val ui: StateFlow<ImportUiState> = _ui

	init {
		loadCalendars()
	}

	fun loadCalendars() {
		_ui.update { it.copy(pending = ImportPending.CALENDARS, error = null) }
		viewModelScope.launch {
			when (val r = source.calendars()) {
				is ApiResult.Ok -> _ui.update { it.copy(calendars = r.value, calendarId = r.value.firstOrNull()?.id, pending = null) }
				is ApiResult.Err -> _ui.update { it.copy(pending = null, error = describe(r.error)) }
			}
		}
	}

	fun selectCalendar(id: String) = _ui.update { it.copy(calendarId = id) }

	/** Replaces the list, as the web's file input does. */
	fun addFiles(files: List<PickedFile>) {
		val problem = if (files.isEmpty()) null else fileProblem(files)
		_ui.update { it.copy(chosen = if (problem == null) files.map { f -> ChosenFile(f.name, f.bytes) } else it.chosen, error = problem) }
	}

	fun removeChosen(index: Int) = _ui.update { it.copy(chosen = it.chosen.filterIndexed { i, _ -> i != index }) }

	fun select(change: Pick) = _ui.update { state ->
		val preview = state.preview ?: return@update state
		state.copy(override = applyPick(change, state.override, preview))
	}

	fun preview() {
		val state = _ui.value
		val calendarId = state.calendarId
		if (state.pending != null || calendarId == null) return
		if (state.chosen.isEmpty()) {
			_ui.update { it.copy(error = fileProblem(emptyList())) }
			return
		}
		_ui.update { it.copy(pending = ImportPending.PREVIEW, error = null) }
		viewModelScope.launch {
			val files = withContext(Dispatchers.Default) {
				state.chosen.map { ImportFileDto(it.name, Base64.getEncoder().encodeToString(it.bytes)) }
			}
			when (val r = source.preview(ImportPreviewRequest(calendarId, files))) {
				is ApiResult.Ok -> _ui.update { it.copy(pending = null, preview = importPreviewOf(r.value), override = null) }
				is ApiResult.Err -> failed(r.error, "Nothing was added — read the note above.")
			}
		}
	}

	fun commit() {
		val state = _ui.value
		val preview = state.preview ?: return
		if (state.pending != null || state.picked.isEmpty()) return
		_ui.update { it.copy(pending = ImportPending.COMMIT, error = null) }
		val picked = preview.items.filter { it.key in state.picked }.map { it.raw }
		viewModelScope.launch {
			when (val r = source.commit(ImportCommitRequest(preview.calendarId, picked))) {
				is ApiResult.Ok -> {
					_ui.update { it.copy(pending = null, report = r.value, undo = null) }
					showSnack("Added ${plural(r.value.imported, "event")} to your ${r.value.calendarName}.")
				}
				is ApiResult.Err -> failed(r.error, "Nothing was added — read the note above.")
			}
		}
	}

	fun undo() {
		val state = _ui.value
		val report = state.report ?: return
		if (state.pending != null || report.importedEvents.isEmpty()) return
		_ui.update { it.copy(pending = ImportPending.UNDO, error = null) }
		viewModelScope.launch {
			when (val r = source.undo(ImportUndoRequest(report.calendarId, report.importedEvents))) {
				is ApiResult.Ok -> {
					_ui.update { it.copy(pending = null, undo = r.value) }
					showSnack("Removed ${plural(r.value.removed, "event")} from your ${r.value.calendarName}.")
				}
				is ApiResult.Err -> failed(r.error, "Couldn't undo that import — try again, or delete from the calendar.")
			}
		}
	}

	/** Back to the upload form after a finished (or abandoned) flow. */
	fun startOver() = _ui.update {
		it.copy(chosen = emptyList(), preview = null, override = null, report = null, undo = null, error = null)
	}

	private fun failed(error: ApiError, toast: String) {
		val text = describe(error)
		_ui.update { it.copy(pending = null, error = text) }
		showSnack(toast)
	}
}
