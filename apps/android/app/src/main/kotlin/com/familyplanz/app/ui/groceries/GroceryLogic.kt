package com.familyplanz.app.ui.groceries

import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.GroceryListScope

/*
 * Grocery pure helpers, ported from src/lib/data/groceries.ts (grouping,
 * scope, search) — the colour half lives in GroceryColours.kt.
 */

const val NO_STORE_LABEL = "Any store"

/** `SCOPE_FILTERS`: one list, a single-select scope filter. */
enum class GroceryScopeFilter(val label: String) { ALL("All"), FAMILY("Family"), MINE("Mine") }

/** `scopeOf`: a row's scope is a property of the row (familyId set = Family). */
val GroceryItemDto.scope: GroceryListScope get() = if (familyId != null) GroceryListScope.FAMILY else GroceryListScope.MINE

/** The scope's word on the page ("Mine" / "Family"). */
val GroceryListScope.label: String get() = if (this == GroceryListScope.MINE) "Mine" else "Family"

/** The store's own key: trim + lowercase, exactly what the group keys on. */
fun storeKey(name: String): String = name.trim().lowercase()

/** A store list with blanks and case-insensitive repeats removed, first spelling kept. */
fun uniqueStores(stores: List<String>): List<String> {
	val seen = mutableSetOf<String>()
	return stores.map { it.trim() }.filter { it.isNotEmpty() && seen.add(storeKey(it)) }
}

/** One store group: the label the first item gave it, and its rows in load order. */
data class StoreGroup(val store: String, val items: List<GroceryItemDto>)

/** `groupGroceriesByStore`: grouped by primary store (`stores[0]` or "Any store"), sorted by label, case-blind. */
fun groupByStore(items: List<GroceryItemDto>): List<StoreGroup> {
	val groups = linkedMapOf<String, Pair<String, MutableList<GroceryItemDto>>>()
	items.forEach { item ->
		val label = item.stores.firstOrNull() ?: NO_STORE_LABEL
		groups.getOrPut(storeKey(label)) { label to mutableListOf() }.second += item
	}
	return groups.values
		.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.first })
		.map { StoreGroup(it.first, it.second) }
}

/** `matchesGrocerySearch`: name or any store contains the trimmed, lowercased query. */
fun matchesSearch(item: GroceryItemDto, query: String): Boolean {
	val q = query.trim().lowercase()
	if (q.isEmpty()) return true
	return item.name.lowercase().contains(q) || item.stores.any { it.lowercase().contains(q) }
}

/** The store bar line: "2 items · 5 total". */
fun storeSummary(items: List<GroceryItemDto>): String {
	val total = items.sumOf { it.quantity }
	return "${items.size} ${if (items.size == 1) "item" else "items"} · $total total"
}

/** Rows the filter keeps: All, or the rows of one scope. */
fun List<GroceryItemDto>.inScope(filter: GroceryScopeFilter): List<GroceryItemDto> = when (filter) {
	GroceryScopeFilter.ALL -> this
	GroceryScopeFilter.FAMILY -> filter { it.scope == GroceryListScope.FAMILY }
	GroceryScopeFilter.MINE -> filter { it.scope == GroceryListScope.MINE }
}

/** The list's empty-state line (`groceries/+page.svelte` "Items by store"). */
fun emptyListCopy(query: String, filter: GroceryScopeFilter, hasFamily: Boolean): String = when {
	query.isNotBlank() -> "No items match “${query.trim()}”."
	filter == GroceryScopeFilter.MINE -> "Your list is empty. Add the first item."
	filter == GroceryScopeFilter.FAMILY && hasFamily -> "The family list is empty. Add the first item."
	filter == GroceryScopeFilter.FAMILY -> "No family list yet — join or create a family to use the shared list."
	else -> "Both lists are empty. Add the first item."
}
