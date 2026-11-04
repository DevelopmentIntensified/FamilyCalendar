package com.familyplanz.app.ui.groceries

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Slate

/*
 * The STORE COLOURS card (groceries.html, approved): one place to see and
 * change every shop, built from BOTH scopes, carrying the same collision
 * disclosure the group header carries. Its own scope selector never retargets
 * the group picker's (115).
 */

/** Store colours: heading, its own scope, a row per shop, and the swatch footer. */
@Composable
fun StoreColoursCard(state: GroceriesUiState, actions: GroceriesActions) {
	FpCard(Modifier.testTag("store-colours")) {
		Row(
			horizontalArrangement = Arrangement.SpaceBetween,
			verticalAlignment = Alignment.CenterVertically,
			modifier = Modifier.fillMaxWidth(),
		) {
			GroceryCardTitle("Store colours")
			if (state.hasFamily) {
				GrocerySelect(
					selected = state.railScope.wire,
					options = ColourScope.entries.map { it.wire to it.label },
					label = "Colour scope for the card",
					onSelect = { wire -> actions.onRailScope(colourScopeOf(wire)) },
					modifier = Modifier.width(112.dp).testTag("rail-scope"),
				)
			}
		}
		val stores = state.colourStores
		if (stores.isEmpty()) {
			Text(
				"No shops yet. Type one on an item and it turns up here with a colour of its own.",
				fontSize = 14.sp,
				color = Slate.S500,
				modifier = Modifier.padding(top = 4.dp).testTag("store-colours-empty"),
			)
			return@FpCard
		}
		stores.forEachIndexed { index, store -> StoreColourRow(store, index > 0, state, actions) }
		ColourFooter(stores.size, state.sharedStores)
	}
}

/** One shop: its dot, its name, its picker (or "editing →" while its group owns the control). */
@Composable
private fun StoreColourRow(store: String, divided: Boolean, state: GroceriesUiState, actions: GroceriesActions) {
	val tint = state.colourOf(store)
	val twins = if (tint != null) state.twinsOf(store, state.colourStores) else emptyList()
	Column(
		modifier = Modifier
			.fillMaxWidth()
			.then(if (divided) Modifier.topRule() else Modifier)
			.padding(vertical = 6.dp)
			.testTag("store-colour-row"),
	) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			Box(Modifier.size(12.dp).clip(FpShape.Pill).background(tint?.dot ?: Slate.S400))
			Text(
				store,
				fontSize = 14.sp,
				fontWeight = FontWeight.SemiBold,
				color = Slate.S800,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis,
				modifier = Modifier.weight(1f),
			)
			if (state.colourStore == store) {
				Text("editing →", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Slate.S400)
			} else {
				GrocerySelect(
					selected = state.picker(store, state.railScope),
					options = colourOptions(),
					label = "Colour for $store",
					onSelect = { colour -> actions.onColour(store, colour, state.railScope) },
					modifier = Modifier.widthIn(max = 120.dp).testTag("store-colour-picker-${storeKey(store)}"),
					enabled = !state.colourBusy,
				)
			}
		}
		if (twins.isNotEmpty() && tint != null) {
			Text(
				"shares ${tint.label} with ${twins.joinToString(", ")}",
				fontSize = 11.sp,
				color = Slate.S400,
				modifier = Modifier.padding(top = 2.dp).testTag("store-colour-twins"),
			)
		}
	}
}

/** "{n} stores, 6 swatches. …" — a collision is permitted, and always named here and on the group. */
@Composable
private fun ColourFooter(count: Int, shared: List<String>) {
	val text = buildAnnotatedString {
		append("$count ${if (count == 1) "store" else "stores"}, ${STORE_COLOURS.size} swatches.")
		if (shared.isEmpty()) {
			append(" No two stores land on the same swatch.")
		} else {
			withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
				append(" ${shared.size} of them land on the same swatch")
			}
			append(" — ${shared.joinToString(", ")}. A collision is permitted and always named here and on the group.")
		}
	}
	Text(text, fontSize = 11.sp, color = Slate.S400, modifier = Modifier.padding(top = 8.dp).testTag("store-colours-footer"))
}

/** The picker's options: the six swatches, then Auto. */
fun colourOptions(): List<Pair<String, String>> = STORE_COLOURS.map { it.key to it.label } + (AUTO_COLOUR to "Auto")

/** The wire value back to its [ColourScope]. */
fun colourScopeOf(wire: String): ColourScope =
	ColourScope.entries.firstOrNull { it.wire == wire } ?: ColourScope.FAMILY

/** `border-t border-slate-100` between rows of a list. */
private fun Modifier.topRule(): Modifier = drawBehind {
	val stroke = 1.dp.toPx()
	drawLine(Slate.S100, Offset(0f, stroke / 2f), Offset(size.width, stroke / 2f), stroke)
}

/** Kept for the group header: `tint.chip` fill with the swatch's ink. */
internal fun chipFill(tint: StoreColour?): Color = tint?.chip ?: Slate.S100

internal fun chipInk(tint: StoreColour?): Color = tint?.ink ?: Slate.S700
