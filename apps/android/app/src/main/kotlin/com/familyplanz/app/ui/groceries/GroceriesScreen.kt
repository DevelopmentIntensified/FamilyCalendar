package com.familyplanz.app.ui.groceries

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.GroceryListScope
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Slate

/** What the Groceries screen can ask for. */
data class GroceriesActions(
	val onFilter: (GroceryScopeFilter) -> Unit = {},
	val onSearch: (String) -> Unit = {},
	val onInput: (String) -> Unit = {},
	val onStoreInput: (String) -> Unit = {},
	val onAddScope: (GroceryListScope) -> Unit = {},
	val onUseSuggestion: () -> Unit = {},
	val onAdd: () -> Unit = {},
	val onCheck: (GroceryItemDto) -> Unit = {},
	val onUncheck: (GroceryItemDto, GroceryListScope) -> Unit = { _, _ -> },
	val onEdit: (GroceryItemDto) -> Unit = {},
	val onEditStores: (String) -> Unit = {},
	val onSaveStores: (GroceryItemDto) -> Unit = {},
	val onCancelEdit: () -> Unit = {},
	val onMove: (GroceryItemDto) -> Unit = {},
	val onRemove: (GroceryItemDto) -> Unit = {},
	val onColour: (String, String, ColourScope) -> Unit = { _, _, _ -> },
	val onOpenColours: (String?) -> Unit = {},
	val onCloseColours: () -> Unit = {},
	val onColourScope: (ColourScope) -> Unit = {},
	val onRailScope: (ColourScope) -> Unit = {},
	val onRetry: () -> Unit = {},
	val onDismissError: () -> Unit = {},
)

/**
 * `/calendar/groceries` at phone width: "Groceries", scope chips with counts,
 * search, the add form with Store Memory, then the checked-off, store-colour
 * and per-store cards (§2.5).
 */
@Composable
fun GroceriesScreen(state: GroceriesUiState, actions: GroceriesActions, modifier: Modifier = Modifier) {
	LazyColumn(
		modifier = modifier.fillMaxSize().background(Color.White).testTag("groceries-screen"),
		contentPadding = PaddingValues(horizontal = 16.dp, vertical = 24.dp),
		verticalArrangement = Arrangement.spacedBy(16.dp),
	) {
		item { Headline() }
		item { ScopeChips(state, actions.onFilter) }
		if (!state.hasFamily) item { NoFamilyNote() }
		item { AddForm(state, actions) }
		state.error.takeIf { it.isNotBlank() }?.let { text -> item { ErrorStrip(text, actions.onDismissError) } }
		when {
			state.loading -> item { com.familyplanz.app.ui.dashboard.SkeletonBlocks(listOf(56, 96, 120)) }
			state.loadError != null -> item { LoadError(state.loadError, actions.onRetry) }
			else -> items(state, actions)
		}
	}
}

@Composable
private fun Headline() {
	Text("Groceries", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Slate.S900, modifier = Modifier.testTag("groceries-title"))
}

/** `[All n][Family n][Mine n]`, the selected chip slate-900 on white text. */
@Composable
private fun ScopeChips(state: GroceriesUiState, onFilter: (GroceryScopeFilter) -> Unit) {
	FlowRow(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp),
		modifier = Modifier.testTag("scope-chips"),
	) {
		GroceryScopeFilter.entries.forEach { chip ->
			val on = state.filter == chip
			Box(
				contentAlignment = Alignment.Center,
				modifier = Modifier
					.clip(FpShape.Pill)
					.background(if (on) Slate.S900 else Color.White)
					.border(1.dp, if (on) Slate.S900 else Slate.S200, FpShape.Pill)
					.semantics { selected = on }
					.clickable(role = Role.Button) { onFilter(chip) }
					.padding(horizontal = 12.dp, vertical = 8.dp)
					.testTag("scope-${chip.name.lowercase()}"),
			) {
				Text(
					buildAnnotatedString {
						append(chip.label)
						append(" ")
						withStyle(SpanStyle(color = (if (on) Color.White else Slate.S600).copy(alpha = 0.75f))) {
							append(state.count(chip).toString())
						}
					},
					fontSize = 12.sp,
					fontWeight = FontWeight.SemiBold,
					color = if (on) Color.White else Slate.S600,
				)
			}
		}
	}
}

@Composable
private fun NoFamilyNote() {
	Text(
		"No family yet — join or create one to use the shared list.",
		fontSize = 12.sp,
		color = Slate.S500,
		modifier = Modifier.testTag("no-family-note"),
	)
}

/** Search + quick-add + Add + "Add to" + Store Memory + store field. */
@Composable
private fun AddForm(state: GroceriesUiState, actions: GroceriesActions) {
	FpCard(Modifier.testTag("grocery-add-form")) {
		SearchRow(state, actions)
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			GroceryField(
				value = state.form.input,
				onValueChange = actions.onInput,
				look = FieldLook(placeholder = "Quick-add, e.g. “milk 2”", label = "Quick-add item"),
				modifier = Modifier.weight(1f).testTag("grocery-input"),
				onDone = actions.onAdd,
			)
			FpPrimaryButton(onClick = actions.onAdd, enabled = state.form.input.isNotBlank() && !state.form.adding) {
				Text(if (state.form.adding) "Adding…" else "Add", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
			}
		}
		Spacer8()
		AddToRow(state, actions)
		state.form.suggested?.takeIf { it.isNotBlank() }?.let { store ->
			Spacer8()
			PillChip("Store Memory: $store", "Use store $store", actions.onUseSuggestion, Modifier.testTag("store-memory"))
		}
		Spacer8()
		GroceryField(
			value = state.form.storeInput,
			onValueChange = actions.onStoreInput,
			look = FieldLook(placeholder = "Store (optional, comma = alternates)", label = "Store", vertical = 6.dp, textSize = 13),
			modifier = Modifier.fillMaxWidth().testTag("store-input"),
		)
	}
}

@Composable
private fun SearchRow(state: GroceriesUiState, actions: GroceriesActions) {
	Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
		GroceryField(
			value = state.form.search,
			onValueChange = actions.onSearch,
			look = FieldLook(placeholder = "Search items or stores…", label = "Search groceries", vertical = 6.dp, textSize = 13),
			modifier = Modifier.weight(1f).testTag("grocery-search"),
		)
		if (state.form.search.isNotEmpty()) {
			PillChip("✕", "Clear search", { actions.onSearch("") }, Modifier.testTag("clear-search"))
		}
	}
	if (state.form.search.isNotBlank()) {
		Text("Searching “${state.form.search.trim()}”", fontSize = 12.sp, color = Slate.S500, modifier = Modifier.padding(top = 4.dp))
	}
}

/** "Add to" [Family (shared)|Mine (private)] — Mine only when there is no family. */
@Composable
private fun AddToRow(state: GroceriesUiState, actions: GroceriesActions) {
	Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
		Text("Add to", fontSize = 12.sp, color = Slate.S500)
		ScopeOption("Mine (private)", state.form.addScope == GroceryListScope.MINE, "add-to-mine") {
			actions.onAddScope(GroceryListScope.MINE)
		}
		if (state.hasFamily) {
			ScopeOption("Family (shared)", state.form.addScope == GroceryListScope.FAMILY, "add-to-family") {
				actions.onAddScope(GroceryListScope.FAMILY)
			}
		}
	}
}

@Composable
private fun ScopeOption(label: String, on: Boolean, tag: String, onClick: () -> Unit) {
	Text(
		label,
		fontSize = 12.sp,
		fontWeight = FontWeight.SemiBold,
		color = if (on) Color.White else Slate.S600,
		modifier = Modifier
			.clip(FpShape.Pill)
			.background(if (on) Slate.S900 else Color.White)
			.border(1.dp, if (on) Slate.S900 else Slate.S200, FpShape.Pill)
			.semantics { selected = on }
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 10.dp, vertical = 6.dp)
			.testTag(tag),
	)
}

@Composable
private fun ErrorStrip(text: String, onDismiss: () -> Unit) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(Accent.Red50).padding(10.dp).testTag("grocery-error"),
	) {
		Text(text, fontSize = 13.sp, color = Accent.Red700, modifier = Modifier.weight(1f))
		Text("✕", fontSize = 13.sp, color = Accent.Red700, modifier = Modifier.clickable(role = Role.Button, onClick = onDismiss).padding(6.dp))
	}
}

@Composable
internal fun LoadError(message: String, onRetry: () -> Unit) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(Accent.Red50).padding(12.dp).testTag("groceries-error"),
	) {
		Text("Couldn't load your lists. $message", fontSize = 13.sp, color = Accent.Red700, modifier = Modifier.weight(1f))
		Text("Retry", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Accent.Red700, modifier = Modifier.clickable(role = Role.Button, onClick = onRetry).padding(8.dp))
	}
}
