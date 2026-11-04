package com.familyplanz.app.ui.groceries

import com.familyplanz.app.data.GroceryListScope

/**
 * The add form's plain fields (search, store line, "Add to" scope), Store
 * Memory's one tap, and the scope a deep link / dashboard card asked for.
 */
fun GroceriesViewModel.setSearch(text: String) = edit { copy(form = form.copy(search = text)) }

fun GroceriesViewModel.setStoreInput(text: String) = edit { copy(form = form.copy(storeInput = text)) }

fun GroceriesViewModel.setAddScope(scope: GroceryListScope) = edit { copy(form = form.copy(addScope = scope)) }

/** Store Memory: fill the store line from the guess and drop the chip. */
fun GroceriesViewModel.useSuggestion() = edit { copy(form = form.copy(storeInput = form.suggested.orEmpty(), suggested = null)) }

fun GroceriesViewModel.dismissError() = edit { copy(error = "") }

/** "Open Groceries" from the dashboard: point both the filter and the add form at that list. */
fun GroceriesViewModel.applyScope(wire: String?) {
	val scope = wire?.let { wire -> GroceryListScope.entries.firstOrNull { it.wire == wire } } ?: return
	edit { copy(form = form.copy(addScope = scope)) }
	setFilter(if (scope == GroceryListScope.FAMILY) GroceryScopeFilter.FAMILY else GroceryScopeFilter.MINE)
}
