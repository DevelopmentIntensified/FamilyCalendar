package com.familyplanz.app.ui.groceries

import com.familyplanz.app.data.GroceryItemDto

/*
 * The page's two inline editors: a row's stores (behind ✎) and a store's
 * colour picker (behind the group bar's "Colour"). The card keeps its OWN
 * scope selector, so a flip from one never retargets the other (115).
 */

/** ✎: open the store editor seeded with the row's stores, comma-spaced. */
fun GroceriesViewModel.openStores(item: GroceryItemDto) =
	edit { copy(editingId = item.id, editStores = item.stores.joinToString(", "), error = "") }

fun GroceriesViewModel.typeStores(text: String) = edit { copy(editStores = text) }

fun GroceriesViewModel.closeStores() = edit { copy(editingId = null) }

/** "Colour" on a group bar: one picker per shop, scoped to everyone when there is a family. */
fun GroceriesViewModel.openColour(store: String?) = edit {
	copy(colourStore = store, colourScope = if (hasFamily) ColourScope.FAMILY else ColourScope.PERSONAL)
}

fun GroceriesViewModel.closeColour() = edit { copy(colourStore = null) }

fun GroceriesViewModel.setColourScope(scope: ColourScope) = edit { copy(colourScope = scope) }

/** The Store colours card's own scope. */
fun GroceriesViewModel.setRailScope(scope: ColourScope) = edit { copy(railScope = scope) }
