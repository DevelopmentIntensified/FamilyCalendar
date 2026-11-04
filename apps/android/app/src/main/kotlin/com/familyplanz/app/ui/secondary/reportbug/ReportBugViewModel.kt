package com.familyplanz.app.ui.secondary.reportbug

import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.BugReportRequest
import com.familyplanz.app.data.BugReportSource
import com.familyplanz.app.ui.secondary.PageViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** `BUG_AREAS` in the web's order; the first is the form's default. */
val BUG_AREAS: List<String> = listOf("calendar", "tasks", "account", "payments", "dashboard", "other")

/** `areaLabels` of `report-bug/+page.svelte`. */
val BUG_AREA_LABELS: Map<String, String> = mapOf(
	"calendar" to "Calendar / events",
	"tasks" to "Tasks",
	"account" to "Account / settings",
	"payments" to "Payments / subscription",
	"dashboard" to "Dashboard",
	"other" to "Something else",
)

const val BUG_MAX_LENGTH = 5000
const val BUG_REPORT_PATH = "/report-bug"
private const val MAX_PATH = 500

/**
 * `safeReportedPath`: a same-app path (+query) or "" - never the bug form
 * itself, a protocol-relative link, or another site.
 */
fun safeReportedPath(raw: String?): String {
	val value = raw?.trim().orEmpty()
	val sameApp = value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
	val isForm = value == BUG_REPORT_PATH || value.startsWith("$BUG_REPORT_PATH?") || value.startsWith("$BUG_REPORT_PATH/")
	return if (sameApp && !isForm) value.take(MAX_PATH) else ""
}

data class ReportBugUiState(
	val area: String = BUG_AREAS.first(),
	val description: String = "",
	val pending: Boolean = false,
	val error: String? = null,
	val submitted: Boolean = false,
)

/** Report a Bug: area + description to `POST /api/bug-report`, with the screen the bug was on as `url`. */
class ReportBugViewModel(private val source: BugReportSource) : PageViewModel() {
	private val _ui = MutableStateFlow(ReportBugUiState())
	val ui: StateFlow<ReportBugUiState> = _ui

	fun setArea(area: String) = _ui.update { it.copy(area = area) }

	fun setDescription(text: String) = _ui.update { it.copy(description = text.take(BUG_MAX_LENGTH), error = null) }

	/** [from] is the screen the user came from (a web path); the form itself is never reported. */
	fun submit(from: String?) {
		val state = _ui.value
		if (state.pending) return
		val description = state.description.trim()
		if (description.isEmpty()) {
			_ui.update { it.copy(error = "Please describe the bug.") }
			return
		}
		_ui.update { it.copy(pending = true, error = null) }
		val url = safeReportedPath(from).ifEmpty { BUG_REPORT_PATH }
		viewModelScope.launch {
			when (val r = source.submit(BugReportRequest(state.area, description, url))) {
				is ApiResult.Ok -> _ui.update { it.copy(pending = false, submitted = true) }
				is ApiResult.Err -> _ui.update { it.copy(pending = false, error = describe(r.error)) }
			}
		}
	}
}
