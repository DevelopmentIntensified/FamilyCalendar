package com.familyplanz.app.ui.groceries

import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.GroceryListScope
import com.familyplanz.app.data.StoreColourRow

/** The add form: search box, quick-add field, store field, Store Memory and the "Add to" scope. */
data class GroceryForm(
	val search: String = "",
	val input: String = "",
	val storeInput: String = "",
	val suggested: String? = null,
	val adding: Boolean = false,
	val addScope: GroceryListScope = GroceryListScope.MINE,
)

/** A row checked off this session: the only place an uncheck has a UI. */
data class CheckedItem(val item: GroceryItemDto, val scope: GroceryListScope)

/** One store group as the page draws it, with its resolved colour. */
data class ColouredGroup(val store: String, val items: List<GroceryItemDto>, val colour: StoreColour?)

/** groceries/+page.svelte's state; derived values are read off it, never stored twice. */
data class GroceriesUiState(
	val loading: Boolean = true,
	val loadError: String? = null,
	val unauthorized: Boolean = false,
	val viewer: StoreViewer = StoreViewer("", null),
	val mine: List<GroceryItemDto> = emptyList(),
	val family: List<GroceryItemDto> = emptyList(),
	val colours: List<StoreColourRow> = emptyList(),
	val overrides: Map<String, String> = emptyMap(),
	val filter: GroceryScopeFilter = GroceryScopeFilter.ALL,
	val form: GroceryForm = GroceryForm(),
	val hidden: Set<String> = emptySet(),
	val checked: List<CheckedItem> = emptyList(),
	val busyId: String? = null,
	val editingId: String? = null,
	val editStores: String = "",
	val error: String = "",
	/** The store whose group colour picker is open. */
	val colourStore: String? = null,
	val colourScope: ColourScope = ColourScope.FAMILY,
	/** The Store colours card's own scope (115: never shared with the group picker). */
	val railScope: ColourScope = ColourScope.FAMILY,
	val colourBusy: Boolean = false,
) {
	val hasFamily: Boolean get() = viewer.familyId != null

	val allItems: List<GroceryItemDto> get() = family + mine

	/** What the list shows: scope filter, then search, then the optimistic hides. */
	val items: List<GroceryItemDto>
		get() = allItems.inScope(filter).filter { matchesSearch(it, form.search) && it.id !in hidden }

	val effectiveRows: List<StoreColourRow> get() = withOverrides(colours, overrides, viewer)

	val groups: List<ColouredGroup>
		get() = groupByStore(items).map { ColouredGroup(it.store, it.items, colourFor(it.store, effectiveRows, viewer)) }

	/** Every store a chip shows, so a collision on the page is disclosed. */
	val chipNames: List<String> get() = items.flatMap { it.stores }.filter { it.isNotBlank() }.distinct()

	/** Every shop the page knows, from both scopes, first-seen order; "Any store" is not a shop. */
	val colourStores: List<String>
		get() = allItems.flatMap { it.stores }.distinct().filter { it.trim().isNotEmpty() && it.trim() != NO_STORE_LABEL }

	/** Shops on a swatch another shop also wears. */
	val sharedStores: List<String>
		get() = colourStores.groupBy { colourFor(it, effectiveRows, viewer)?.key }
			.filterKeys { it != null }.values.filter { it.size > 1 }.flatten()

	fun count(filter: GroceryScopeFilter): Int = allItems.inScope(filter).size

	fun colourOf(name: String?): StoreColour? = colourFor(name, effectiveRows, viewer)

	fun twinsOf(name: String, names: List<String> = chipNames): List<String> =
		storesSharingColour(name, names, effectiveRows, viewer)

	fun picker(name: String, scope: ColourScope): String = pickerValue(name, scope, colours, overrides, viewer)
}
