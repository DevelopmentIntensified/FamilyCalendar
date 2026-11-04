package com.familyplanz.app.ui.calendar

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.BulkItem
import com.familyplanz.app.data.BulkRequest
import com.familyplanz.app.data.CalendarSource
import com.familyplanz.app.data.CalendarTaskCreate
import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.data.EventSource
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.domain.EventMapper
import com.familyplanz.app.ui.calendar.model.BulkOps
import com.familyplanz.app.ui.calendar.model.CalendarForm
import com.familyplanz.app.ui.calendar.model.events
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.ZoneId

/**
 * The Calendar's server writes (#292 L2): RSVP, create/edit/delete, duplicate,
 * the checklist, the Task tab and the bulk/smart-plan ops. Every write acks
 * immediately (optimistic row + a toast naming what happened), then reloads
 * what the change touched.
 */
internal class CalendarWrites(
	private val state: MutableStateFlow<CalendarUiState>,
	private val scope: CoroutineScope,
	private val repository: EventSource,
	private val source: CalendarSource,
	private val reload: suspend () -> Unit,
	private val zone: ZoneId,
	private val today: () -> LocalDate,
) {
	fun rsvp(event: CalendarEvent, status: String) {
		val target = if (event.rsvpStatus == status) null else status
		applyRsvp(event, target)
		scope.launch {
			val result = if (target == null) source.rsvp(event.serverId) else source.setRsvp(event.serverId, target)
			when (result) {
				is ApiResult.Ok -> Unit
				is ApiResult.Err -> {
					applyRsvp(event, event.rsvpStatus)
					toast("Couldn't update your RSVP - try again.")
				}
			}
		}
	}

	/** "tap again to clear" - the same status twice means undecided. */
	private fun applyRsvp(event: CalendarEvent, status: String?) {
		val delta = deltaOf(event.rsvpStatus, status)
		state.update { ui ->
			ui.copy(
				sheet = (ui.sheet as? CalendarSheet.Event)?.takeIf { it.event.id == event.id }?.copy(event = event.copy(rsvpStatus = status)),
				data = ui.data.copy(
					events = ui.data.events.map {
						if (it.id != event.id) {
							it
						} else {
							val going = (it.attendance?.going ?: 0) + delta
							it.copy(rsvpStatus = status, attendance = it.attendance?.copy(going = maxOf(0, going)))
						}
					},
				),
			)
		}
	}

	private fun deltaOf(from: String?, to: String?): Int = (if (to == "going") 1 else 0) - (if (from == "going") 1 else 0)

	fun delete(event: CalendarEvent, scopeOfDelete: String = "all") {
		scope.launch {
			val result = source.deleteEvent(event.serverId, scopeOfDelete, event.occurrenceDate)
			state.update { it.copy(sheet = null) }
			if (result is ApiResult.Err) {
				toast(result.error.messageOrDefault("Couldn't delete the event - try again."))
				return@launch
			}
			toast("Event deleted.")
			reload()
		}
	}

	fun duplicate(request: com.familyplanz.app.data.CreateEventRequest) {
		scope.launch {
			when (val result = repository.createEvent(request)) {
				is ApiResult.Ok -> {
					state.update { it.copy(sheet = null) }
					toast("Event duplicated.")
					reload()
				}

				is ApiResult.Err -> toast(result.error.messageOrDefault("Couldn't duplicate the event - try again."))
			}
		}
	}

	fun createEvent(request: CreateEventRequest) {
		scope.launch {
			when (val result = repository.createEvent(request)) {
				is ApiResult.Ok -> {
					state.update { it.copy(sheet = null) }
					toast("Event created.")
					reload()
				}

				is ApiResult.Err -> toast(result.error.messageOrDefault("Couldn't create the event - try again."))
			}
		}
	}

	fun updateEvent(id: String, body: JsonObject) {
		scope.launch {
			when (val result = source.updateEvent(id, body)) {
				is ApiResult.Ok -> {
					state.update { it.copy(sheet = null) }
					toast("Event updated.")
					reload()
				}

				is ApiResult.Err -> toast(result.error.messageOrDefault("Couldn't save the event - try again."))
			}
		}
	}

	fun createTask(request: CalendarTaskCreate) {
		scope.launch {
			when (val result = source.addTask(request)) {
				is ApiResult.Ok -> {
					state.update { it.copy(sheet = null) }
					toast("Task added.")
					reload()
				}

				is ApiResult.Err -> toast(result.error.messageOrDefault("Couldn't add the task - try again."))
			}
		}
	}

	/** EventModal's checklist: one POST /api/tasks carrying the event id. */
	fun addChecklist(eventId: String, title: String) {
		if (title.isBlank()) return
		scope.launch {
			when (val result = source.addTask(CalendarTaskCreate(title = title.trim(), eventId = eventId))) {
				is ApiResult.Ok -> loadChecklist(eventId)
				is ApiResult.Err -> toast("Couldn't add that task - try again.")
			}
		}
	}

	fun loadChecklist(eventId: String) {
		scope.launch {
			val rows = (source.checklist(eventId) as? ApiResult.Ok)?.value.orEmpty()
			state.update { it.copy(checklist = rows.mapNotNull { dto -> EventMapper.taskFromDto(dto, zone, null) }) }
		}
	}

	fun completeChecklistTask(task: CalendarTask) {
		scope.launch {
			val body = kotlinx.serialization.json.buildJsonObject {
				put("completed", true)
			}
			if (source.taskAction(task.id, body) is ApiResult.Err) toast("Couldn't complete that task - try again.")
		}
	}

	/** Bulk delete asks first in the bar; this is the "Yes, delete" half. */
	fun deleteSelected(ids: Set<String>) {
		if (ids.isEmpty()) return
		scope.launch {
			val body = BulkRequest(ids = ids.map { BulkItem(it) }, op = BulkOps.delete())
			when (val result = source.bulk(body)) {
				is ApiResult.Ok -> {
					state.update { it.copy(selectionMode = false, selectedIds = emptySet()) }
					toast("Deleted ${events(ids.size)}.")
					reload()
				}

				is ApiResult.Err -> toast(result.error.messageOrDefault("Couldn't delete those events - try again."))
			}
		}
	}

	fun applyOp(ids: Set<String>, op: JsonObject, toastText: String) {
		if (ids.isEmpty()) return
		scope.launch {
			val body = BulkRequest(ids = ids.map { BulkItem(it) }, op = op)
			when (val result = source.bulk(body)) {
				is ApiResult.Ok -> {
					toast(toastText)
					reload()
				}

				is ApiResult.Err -> toast(result.error.messageOrDefault("Couldn't apply that change - try again."))
			}
		}
	}

	/** A dry run first: the bar shows the plan, the user reviews it (AC-CAL-34). */
	fun planSmart(instruction: String, ids: Set<String>) {
		if (instruction.isBlank() || ids.isEmpty()) return
		scope.launch {
			val body = BulkRequest(
				ids = ids.map { BulkItem(it) },
				op = BulkOps.smart(instruction),
				dryRun = true,
			)
			when (val result = source.bulk(body)) {
				is ApiResult.Ok -> {
					val ops = result.value.plan.orEmpty()
					val rows = state.value.data.events
					val calendars = state.value.data.calendarRefs
					val plan = SmartPlan(
						descriptions = ops.map { com.familyplanz.app.ui.calendar.model.describePlanOp(it, rows, calendars, today()) },
						ops = ops,
						movesToPast = com.familyplanz.app.ui.calendar.model.planMovesToPast(ops, today()),
						instruction = instruction,
						ids = ids.toList(),
					)
					state.update { it.copy(plan = plan) }
				}

				is ApiResult.Err -> toast("Couldn't plan those changes - try again.")
			}
		}
	}

	fun applyPlan(plan: SmartPlan) {
		scope.launch {
			val body = BulkRequest(
				ids = plan.ids.map { BulkItem(it) },
				op = BulkOps.smart(plan.instruction),
				plan = plan.ops,
			)
			when (val result = source.bulk(body)) {
				is ApiResult.Ok -> {
					state.update { it.copy(plan = null, selectionMode = false, selectedIds = emptySet()) }
					toast(if (plan.ops.size == 1) "Applied 1 change to your events." else "Applied ${plan.ops.size} changes to your events.")
					reload()
				}

				is ApiResult.Err -> toast("Couldn't apply the plan - try again.")
			}
		}
	}

	fun discardPlan() {
		state.update { it.copy(plan = null) }
	}

	fun toast(text: String) {
		state.update { it.copy(toast = text) }
	}

	private fun ApiError.messageOrDefault(fallback: String): String =
		if (this is ApiError.Network || this is ApiError.Server) fallback else message
}
