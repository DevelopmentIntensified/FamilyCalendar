package com.familyplanz.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Slate

/* GroceriesCard: "{n} open", store chips, and the first NAMED = 3 names per scope. */

@Composable
fun GroceriesCard(state: DashboardUiState, onOpenGroceries: (String?) -> Unit, modifier: Modifier = Modifier) {
	val scopes = state.groceryScopes
	FpCard(modifier) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
			Text("Groceries", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Slate.S900, modifier = Modifier.weight(1f))
			if (state.groceryOpenTotal > 0) {
				Text(
					"${state.groceryOpenTotal} open",
					fontSize = 12.sp,
					color = Slate.S500,
					modifier = Modifier.testTag("groceries-open-total"),
				)
			}
		}
		Spacer(Modifier.height(8.dp))
		if (scopes.isEmpty()) {
			Text("Nothing on the list yet.", fontSize = 14.sp, color = Slate.S500)
			LinkText("Open the list →", { onOpenGroceries(null) }, "groceries-link")
			return@FpCard
		}
		scopes.forEach { scope -> GroceryScopeBlock(scope, onOpenGroceries) }
	}
}

/** One scope: "{LABEL} →", "{n} open", the store chips and the first three names. */
@Composable
private fun GroceryScopeBlock(scope: GroceryScopeCard, onOpenGroceries: (String?) -> Unit) {
	Column(Modifier.padding(bottom = 8.dp).testTag("groceries-scope-${scope.key}")) {
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
			LinkText("${scope.label.uppercase()} →", { onOpenGroceries(scope.key) }, "groceries-link-${scope.key}")
			Spacer(Modifier.weight(1f))
			Text("${scope.items.size} open", fontSize = 12.sp, color = Slate.S500)
		}
		FlowRow(
			horizontalArrangement = Arrangement.spacedBy(4.dp),
			verticalArrangement = Arrangement.spacedBy(4.dp),
			modifier = Modifier.padding(vertical = 2.dp).testTag("groceries-stores-${scope.key}"),
		) {
			groceryStoreNames(scope.items).forEach { store -> StoreChip(store) }
		}
		Text(
			groceryNames(scope.items),
			fontSize = 14.sp,
			color = Slate.S700,
			modifier = Modifier.testTag("groceries-names-${scope.key}"),
		)
	}
}

/** `rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600`. */
@Composable
private fun StoreChip(store: String) {
	Text(
		store,
		fontSize = 10.sp,
		fontWeight = FontWeight.SemiBold,
		color = Slate.S600,
		modifier = Modifier.clip(FpShape.Pill).background(Slate.S100).padding(horizontal = 6.dp, vertical = 2.dp),
	)
}
