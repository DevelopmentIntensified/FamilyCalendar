package com.familyplanz.app.ui.groceries

import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.GroceryChange
import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.GroceryListScope
import com.familyplanz.app.data.GrocerySource
import com.familyplanz.app.data.StoreColourRow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/**
 * The row ops of groceries/+page.svelte (check, uncheck, stores, move,
 * remove, colour). Each acts on the row's OWN scope, acks at once, and on
 * failure reverts and names the next step.
 */
class GroceryRowOps(
	private val scope: CoroutineScope,
	private val source: GrocerySource,
	private val state: MutableStateFlow<GroceriesUiState>,
	private val toast: (GroceryToast) -> Unit,
	private val reload: suspend () -> Unit,
) {
	private fun edit(change: GroceriesUiState.() -> GroceriesUiState) {
		state.value = state.value.change()
	}

	/** Optimistic hide; on success it lands in Checked off and the toast offers Undo. */
	fun check(item: GroceryItemDto) {
		val rowScope = item.scope
		edit { copy(hidden = hidden + item.id, error = "") }
		scope.launch {
			when (val r = source.update(item.id, GroceryChange("check", rowScope))) {
				is ApiResult.Ok -> {
					edit { copy(checked = checked + CheckedItem(item, rowScope)) }
					toast(GroceryToast("Checked off \"${item.name}\".") { uncheck(item, rowScope) })
					reload()
				}
				is ApiResult.Err -> edit { copy(hidden = hidden - item.id, error = failure("Couldn't check that off", r.error)) }
			}
		}
	}

	fun uncheck(item: GroceryItemDto, rowScope: GroceryListScope) {
		if (state.value.busyId != null) return
		edit { copy(busyId = item.id, checked = checked.filterNot { it.item.id == item.id }, hidden = hidden - item.id) }
		scope.launch {
			when (val r = source.update(item.id, GroceryChange("uncheck", rowScope))) {
				is ApiResult.Ok -> {
					toast(GroceryToast("Put \"${item.name}\" back on the list."))
					edit { copy(busyId = null) }
					reload()
				}
				is ApiResult.Err -> edit {
					copy(
						busyId = null,
						checked = checked + CheckedItem(item, rowScope),
						hidden = hidden + item.id,
						error = failure("Couldn't put that back", r.error),
					)
				}
			}
		}
	}

	fun saveStores(item: GroceryItemDto) {
		val stores = uniqueStores(state.value.editStores.split(','))
		mutate(item, GroceryChange("stores", item.scope, stores = stores), "Couldn't save stores") {
			"Stores updated for \"${item.name}\"."
		}
	}

	/** ⇄: to the row's OTHER scope, never the filter's. */
	fun move(item: GroceryItemDto) {
		val target = if (item.scope == GroceryListScope.MINE) GroceryListScope.FAMILY else GroceryListScope.MINE
		mutate(item, GroceryChange("move", item.scope, target = target), "Couldn't move that") {
			"Moved \"${item.name}\" to ${target.label}."
		}
	}

	fun remove(item: GroceryItemDto) {
		mutate(item, null, "Couldn't remove that") { "Removed \"${item.name}\" — store memory kept." }
	}

	/** [change] null = DELETE. Closes the inline editor on success. */
	private fun mutate(item: GroceryItemDto, change: GroceryChange?, what: String, done: () -> String) {
		if (state.value.busyId != null) return
		edit { copy(busyId = item.id, error = "") }
		scope.launch {
			val r = if (change == null) source.delete(item.id, item.scope) else source.update(item.id, change)
			if (r is ApiResult.Err) {
				edit { copy(busyId = null, error = failure(what, r.error)) }
				return@launch
			}
			toast(GroceryToast(done()))
			edit { copy(busyId = null, editingId = null) }
			reload()
		}
	}

	/** Repaint at once at [colourScope]; revert to what that scope had if the write fails. */
	fun setColour(store: String, color: String, colourScope: ColourScope) {
		val now = state.value
		if (now.colourBusy) return
		val key = overrideKey(colourScope, storeKey(store))
		val was: StoreColourRow? = now.colours.firstOrNull {
			it.storeKey == storeKey(store) && it.familyId == familyIdFor(colourScope, now.viewer)
		}
		edit { copy(colourBusy = true, error = "", overrides = overrides + (key to color)) }
		scope.launch {
			when (val r = source.setColour(store, color, colourScope.wire)) {
				is ApiResult.Ok -> {
					val label = STORE_COLOURS.firstOrNull { it.key == color }?.label ?: color
					val just = if (colourScope == ColourScope.PERSONAL) " (just you)" else ""
					toast(GroceryToast(if (color == AUTO_COLOUR) "$store is back to its own default colour." else "$store is now $label$just."))
					edit { copy(colourBusy = false, colourStore = null) }
					reload()
				}
				is ApiResult.Err -> edit {
					val restored = if (was != null) overrides + (key to was.color) else overrides - key
					copy(colourBusy = false, overrides = restored, error = failure("Couldn't set that colour", r.error))
				}
			}
		}
	}
}

/** Error copy naming the next step; a network failure says to check the connection. */
fun failure(what: String, error: ApiError): String =
	if (error is ApiError.Network) "$what — check your connection and try again." else "$what. Try again."
