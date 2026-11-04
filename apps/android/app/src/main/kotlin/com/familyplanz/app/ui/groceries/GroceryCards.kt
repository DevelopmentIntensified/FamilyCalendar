package com.familyplanz.app.ui.groceries

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.Slate

/* The Groceries page's cards below the add form: Checked off, Store colours, then a card per store. */

/** The page's `space-y-2` gap inside a card. */
@Composable
fun Spacer8() {
	Spacer(Modifier.height(8.dp))
}

/** The cards' `text-xs font-bold uppercase tracking-wide text-slate-500` heading. */
@Composable
fun GroceryCardTitle(text: String) {
	Text(
		text,
		fontSize = 12.sp,
		fontWeight = FontWeight.Bold,
		letterSpacing = 0.5.sp,
		color = Slate.S500,
	)
}

/**
 * Everything under the add form: the checked-off card, the store colours
 * card, then either the empty line or one card per store (§2.5).
 */
fun LazyListScope.items(state: GroceriesUiState, actions: GroceriesActions) {
	if (state.checked.isNotEmpty()) item { CheckedCard(state, actions) }
	item { StoreColoursCard(state, actions) }
	if (state.items.isEmpty()) {
		item { EmptyListNote(state) }
		return
	}
	state.groups.forEach { group ->
		item(key = "group-${storeKey(group.store)}") { StoreGroupCard(group, state, actions) }
	}
}

/** "Checked off (n)": each row unchecks, which is the only UI an undo has here. */
@Composable
private fun CheckedCard(state: GroceriesUiState, actions: GroceriesActions) {
	FpCard(Modifier.testTag("checked-off")) {
		GroceryCardTitle("Checked off (${state.checked.size})")
		state.checked.forEach { rec ->
			CheckedRow(rec, state.busyId == rec.item.id) { actions.onUncheck(rec.item, rec.scope) }
		}
	}
}

@Composable
private fun CheckedRow(rec: CheckedItem, busy: Boolean, onUncheck: () -> Unit) {
	Row(
		horizontalArrangement = Arrangement.spacedBy(8.dp),
		verticalAlignment = Alignment.CenterVertically,
		modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("checked-row-${rec.item.id}"),
	) {
		Box(
			contentAlignment = Alignment.Center,
			modifier = Modifier
				.size(20.dp)
				.clip(MaterialTheme.shapes.small)
				.background(androidx.compose.ui.graphics.Color.White)
				.border(2.dp, Slate.S400, MaterialTheme.shapes.small)
				.semantics { contentDescription = "Uncheck ${rec.item.name}" }
				.clickable(enabled = !busy, role = Role.Checkbox, onClick = onUncheck),
		) {
			Text("✓", fontSize = 12.sp, color = Slate.S500)
		}
		Text(
			rec.item.name,
			fontSize = 14.sp,
			color = Slate.S400,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
			textDecoration = TextDecoration.LineThrough,
			modifier = Modifier.weight(1f),
		)
		ScopeTag(rec.scope.label)
	}
}

/** "Items by store" with nothing in it: the copy names the filter and the next step. */
@Composable
private fun EmptyListNote(state: GroceriesUiState) {
	Text(
		emptyListCopy(state.form.search, state.filter, state.hasFamily),
		fontSize = 14.sp,
		color = Slate.S500,
		modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp).testTag("grocery-empty"),
	)
}
