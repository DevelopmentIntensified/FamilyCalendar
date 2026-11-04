package com.familyplanz.app.ui.groceries

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.GroceryListScope
import com.familyplanz.app.data.GrocerySource
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/** A toast the screen shows; [undo] adds the Undo action. */
data class GroceryToast(val text: String, val undo: (() -> Unit)? = null)

/** Store Memory lookup waits this long after the last keystroke (`groceries/+page.svelte` onInput). */
const val SUGGEST_DEBOUNCE_MS = 300L

/**
 * The Groceries page over [source]: load both lists + colours, the scope
 * filter, the add form with Store Memory, and (via [rows]) every row op.
 * Every mutation acks at once and reloads from the server after.
 */
class GroceriesViewModel(
	private val source: GrocerySource,
	private val debounceMs: Long = SUGGEST_DEBOUNCE_MS,
) : ViewModel() {
	private val state = MutableStateFlow(GroceriesUiState())
	val ui: StateFlow<GroceriesUiState> = state.asStateFlow()

	private val toastQueue = Channel<GroceryToast>(Channel.UNLIMITED)
	val toasts: Flow<GroceryToast> = toastQueue.receiveAsFlow()

	/** Check off / undo / stores / move / delete / colour. */
	val rows = GroceryRowOps(viewModelScope, source, state, toastQueue::trySend) { load() }

	private var suggestJob: Job? = null
	private var firstLoad = true

	init {
		reload()
	}

	fun reload() {
		viewModelScope.launch { load() }
	}

	private suspend fun load() {
		val viewer = when (val me = source.viewer()) {
			is ApiResult.Ok -> me.value
			is ApiResult.Err -> {
				edit { copy(loading = false, loadError = me.error.message, unauthorized = me.error == ApiError.Unauthorized) }
				return
			}
		}
		val mine = viewModelScope.async { source.items(GroceryListScope.MINE).orEmpty() }
		val family = viewModelScope.async { if (viewer.familyId != null) source.items(GroceryListScope.FAMILY).orEmpty() else emptyList() }
		val colours = viewModelScope.async { source.colours().orEmpty() }
		val result = Triple(mine.await(), family.await(), colours.await())
		val defaultScope = if (viewer.familyId != null) GroceryListScope.FAMILY else GroceryListScope.MINE
		edit {
			copy(
				loading = false,
				loadError = null,
				viewer = StoreViewer(viewer.id, viewer.familyId),
				mine = result.first,
				family = result.second,
				colours = result.third,
				hidden = emptySet(),
				form = if (firstLoad) form.copy(addScope = defaultScope) else form,
				railScope = if (viewer.familyId != null) railScope else ColourScope.PERSONAL,
			)
		}
		firstLoad = false
	}

	/** The scope filter; naming one scope points the add form at it too. */
	fun setFilter(filter: GroceryScopeFilter) = edit {
		val follow = when (filter) {
			GroceryScopeFilter.FAMILY -> GroceryListScope.FAMILY.takeIf { hasFamily }
			GroceryScopeFilter.MINE -> GroceryListScope.MINE
			GroceryScopeFilter.ALL -> null
		}
		copy(filter = filter, form = form.copy(addScope = follow ?: form.addScope))
	}

	/** Any plain field change (search, store field, scope pickers, inline editors). */
	fun edit(change: GroceriesUiState.() -> GroceriesUiState) {
		state.value = state.value.change()
	}

	/** The quick-add field; asks Store Memory after [debounceMs] of quiet. */
	fun typeItem(text: String) {
		edit { copy(form = form.copy(input = text)) }
		suggestJob?.cancel()
		suggestJob = viewModelScope.launch {
			delay(debounceMs)
			val name = text.trim()
			val store = if (name.isEmpty()) null else (source.suggest(state.value.form.addScope, name) as? ApiResult.Ok)?.value
			edit { copy(form = form.copy(suggested = store)) }
		}
	}

	fun add() {
		val form = state.value.form
		if (form.input.isBlank() || form.adding) return
		val target = form.addScope
		val guessed = form.suggested?.takeIf { form.storeInput.isEmpty() }
		edit { copy(error = "", form = form.copy(adding = true)) }
		viewModelScope.launch {
			when (val result = source.add(target, form.input, uniqueStores(form.storeInput.split(',')))) {
				is ApiResult.Ok -> {
					toastQueue.trySend(GroceryToast("Added \"${form.input.trim()}\" to ${target.label}${guessed?.let { " — $it" }.orEmpty()}."))
					edit { copy(form = this.form.copy(input = "", storeInput = "", suggested = null, adding = false)) }
					load()
				}
				is ApiResult.Err -> edit {
					val text = if (result.error is ApiError.Network) "Network problem. Try again." else result.error.message
					copy(error = text.ifBlank { "That didn't work. Try again." }, form = this.form.copy(adding = false))
				}
			}
		}
	}
}

private fun <T> ApiResult<List<T>>.orEmpty(): List<T> = (this as? ApiResult.Ok)?.value ?: emptyList()
