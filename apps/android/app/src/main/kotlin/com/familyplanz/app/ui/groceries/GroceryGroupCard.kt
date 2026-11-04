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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.GroceryListScope
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Slate

/*
 * One card per store: the tinted bar (name, summary, collision, colour
 * picker), then a row per item with check, scope in words, every store as its
 * own coloured chip, and the three quiet actions ✎ ⇄ ✕.
 */

/** A store's card: tinted header then its items. */
@Composable
fun StoreGroupCard(group: ColouredGroup, state: GroceriesUiState, actions: GroceriesActions) {
	FpCard(padding = PaddingValues(0.dp), modifier = Modifier.testTag("store-group-${storeKey(group.store)}")) {
		GroupBar(group, state, actions)
		group.items.forEach { item -> ItemRow(item, state, actions) }
	}
}

@Composable
private fun GroupBar(group: ColouredGroup, state: GroceriesUiState, actions: GroceriesActions) {
	val tint = group.colour
	val twins = if (tint != null) state.twinsOf(group.store) else emptyList()
	Column(
		Modifier.fillMaxWidth().background(tint?.bar ?: Slate.S50).padding(horizontal = 12.dp, vertical = 8.dp),
	) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			if (tint != null) Box(Modifier.size(10.dp).clip(FpShape.Pill).background(tint.dot))
			Text(
				group.store,
				fontSize = 14.sp,
				fontWeight = FontWeight.ExtraBold,
				color = Slate.S900,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
				modifier = Modifier.weight(1f),
			)
			if (tint != null) GroupColourControl(group.store, state, actions)
		}
		val shared = if (twins.isEmpty()) "" else " · shares ${tint?.label} with ${twins.joinToString(", ")}"
		Text(storeSummary(group.items) + shared, fontSize = 12.sp, color = Slate.S600, modifier = Modifier.padding(top = 2.dp))
	}
}

/** "Colour" opens the group's own picker; while open it owns the control, not the rail card. */
@Composable
private fun GroupColourControl(store: String, state: GroceriesUiState, actions: GroceriesActions) {
	if (state.colourStore != store) {
		PillChip("Colour", "Edit colour for $store", { actions.onOpenColours(store) }, Modifier.testTag("group-colour-${storeKey(store)}"))
		return
	}
	Column(horizontalAlignment = Alignment.End) {
		GrocerySelect(
			selected = state.picker(store, state.colourScope),
			options = colourOptions(),
			label = "Colour for $store",
			onSelect = { colour -> actions.onColour(store, colour, state.colourScope) },
			modifier = Modifier.widthIn(max = 144.dp).testTag("group-colour-picker"),
			enabled = !state.colourBusy,
		)
		Row(
			horizontalArrangement = Arrangement.spacedBy(6.dp),
			verticalAlignment = Alignment.CenterVertically,
			modifier = Modifier.padding(top = 2.dp),
		) {
			if (state.hasFamily) {
				ScopeRadio("Everyone", state.colourScope == ColourScope.FAMILY, "colour-scope-family") {
					actions.onColourScope(ColourScope.FAMILY)
				}
				ScopeRadio("Just me", state.colourScope == ColourScope.PERSONAL, "colour-scope-personal") {
					actions.onColourScope(ColourScope.PERSONAL)
				}
			}
			Text(
				"Done",
				fontSize = 12.sp,
				color = Slate.S500,
				modifier = Modifier
					.semantics { contentDescription = "Done editing colour for $store" }
					.clickable(role = Role.Button, onClick = actions.onCloseColours)
					.padding(horizontal = 4.dp, vertical = 2.dp),
			)
		}
	}
}

@Composable
private fun ScopeRadio(label: String, on: Boolean, tag: String, onClick: () -> Unit) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(4.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier
			.semantics { selected = on }
			.clickable(role = Role.RadioButton, onClick = onClick)
			.padding(2.dp)
			.testTag(tag),
	) {
		Box(
			Modifier.size(12.dp).clip(FpShape.Pill).border(1.dp, Slate.S400, FpShape.Pill)
				.then(if (on) Modifier.background(Slate.S600) else Modifier),
		)
		Text(label, fontSize = 11.sp, color = Slate.S600)
	}
}

/** One item: check, name ×qty, its list in words, its store chips, and ✎ ⇄ ✕. */
@Composable
private fun ItemRow(item: GroceryItemDto, state: GroceriesUiState, actions: GroceriesActions) {
	val busy = state.busyId == item.id
	val destination = if (item.scope == GroceryListScope.MINE) "Family" else "Mine"
	Column(
		Modifier.fillMaxWidth().rowRule().padding(horizontal = 12.dp, vertical = 8.dp).testTag("grocery-row-${item.id}"),
	) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			CheckOff(item, busy) { actions.onCheck(item) }
			Column(Modifier.weight(1f)) {
				Text(
					buildAnnotatedString {
						append(item.name)
						withStyle(SpanStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Slate.S500)) {
							append(" ×${item.quantity}")
						}
					},
					fontSize = 14.sp,
					fontWeight = FontWeight.SemiBold,
					color = Slate.S800,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
				)
				Row(
					horizontalArrangement = Arrangement.spacedBy(6.dp),
					verticalAlignment = Alignment.CenterVertically,
					modifier = Modifier.padding(top = 2.dp),
				) {
					ScopeTag(item.scope.label)
					StoreChips(item, state)
				}
			}
			IconAction("✎", "Edit stores for ${item.name}", true) { actions.onEdit(item) }
			IconAction("⇄", "Move ${item.name} to $destination", !busy) { actions.onMove(item) }
			IconAction("✕", "Delete ${item.name}", !busy) { actions.onRemove(item) }
		}
		if (state.editingId == item.id) EditStoresRow(item, state, actions)
	}
}

/** The round `h-5 w-5 border-2 border-slate-300` checkbox in a 32 dp target. */
@Composable
private fun CheckOff(item: GroceryItemDto, busy: Boolean, onClick: () -> Unit) {
	Box(
		contentAlignment = Alignment.Center,
		modifier = Modifier
			.size(32.dp)
			.semantics { contentDescription = "Check off ${item.name}" }
			.clickable(enabled = !busy, role = Role.Checkbox, onClick = onClick),
	) {
		Box(Modifier.size(20.dp).clip(MaterialTheme.shapes.small).border(2.dp, Slate.S300, MaterialTheme.shapes.small))
	}
}

/**
 * EVERY store on the row as its own coloured chip, "or" before the
 * alternates. Colour says "which shop"; the filled dot and the heavier ring on
 * `stores[0]` say "the one I file it under" (a second channel, so colouring
 * every chip costs the primary/alternate distinction nothing).
 */
@Composable
private fun StoreChips(item: GroceryItemDto, state: GroceriesUiState) {
	val stores = uniqueStores(item.stores)
	if (stores.isEmpty()) return
	FlowRow(
		horizontalArrangement = Arrangement.spacedBy(4.dp),
		verticalArrangement = Arrangement.spacedBy(4.dp),
	) {
		stores.forEachIndexed { index, store ->
			if (index == 1) Text("or", fontSize = 11.sp, color = Slate.S400, modifier = Modifier.testTag("store-alternate-join"))
			val tint = state.colourOf(store)
			val ink = chipInk(tint)
			Row(
				horizontalArrangement = Arrangement.spacedBy(4.dp),
				verticalAlignment = Alignment.CenterVertically,
				modifier = Modifier
					.clip(FpShape.Pill)
					.background(chipFill(tint))
					.border(if (index == 0) 2.dp else 1.dp, ink, FpShape.Pill)
					.padding(horizontal = 8.dp, vertical = 3.dp)
					.testTag(if (index == 0) "store-chip-primary" else "store-chip-alt"),
			) {
				if (index == 0) Box(Modifier.size(6.dp).clip(FpShape.Pill).background(ink))
				Text(
					store,
					fontSize = 11.sp,
					fontWeight = if (index == 0) FontWeight.Bold else FontWeight.SemiBold,
					color = ink,
					maxLines = 1,
				)
			}
		}
	}
}

/** The inline store editor behind ✎: one field, Save, Cancel. */
@Composable
private fun EditStoresRow(item: GroceryItemDto, state: GroceriesUiState, actions: GroceriesActions) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier.fillMaxWidth().rowRule().padding(top = 8.dp).testTag("store-editor"),
	) {
		GroceryField(
			value = state.editStores,
			onValueChange = actions.onEditStores,
			look = FieldLook(placeholder = "stores, comma-separated", label = "Stores for ${item.name}", vertical = 6.dp, textSize = 12),
			modifier = Modifier.weight(1f).testTag("store-editor-input"),
		)
		Text(
			"Save",
			fontSize = 12.sp,
			fontWeight = FontWeight.SemiBold,
			color = Slate.S700,
			modifier = Modifier
				.semantics { contentDescription = "Save stores for ${item.name}" }
				.clickable(role = Role.Button) { actions.onSaveStores(item) }
				.padding(4.dp),
		)
		Text(
			"Cancel",
			fontSize = 12.sp,
			color = Slate.S500,
			modifier = Modifier
				.semantics { contentDescription = "Cancel editing ${item.name}" }
				.clickable(role = Role.Button, onClick = actions.onCancelEdit)
				.padding(4.dp),
		)
	}
}

/** A quiet 28 dp icon button (`✎ ⇄ ✕`). */
@Composable
private fun IconAction(glyph: String, label: String, enabled: Boolean, onClick: () -> Unit) {
	Box(
		contentAlignment = Alignment.Center,
		modifier = Modifier
			.size(28.dp)
			.semantics { contentDescription = label }
			.clickable(enabled = enabled, role = Role.Button, onClick = onClick),
	) {
		Text(glyph, fontSize = 14.sp, color = if (enabled) Slate.S400 else Slate.S200)
	}
}

/** `divide-y divide-slate-100`: the hairline between item rows. */
private fun Modifier.rowRule(): Modifier = drawBehind {
	val stroke = 1.dp.toPx()
	drawLine(Slate.S100, Offset(0f, stroke / 2f), Offset(size.width, stroke / 2f), stroke)
}
