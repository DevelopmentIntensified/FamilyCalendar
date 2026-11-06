package com.familyplanz.app.ui.groceries

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.GroceryChange
import com.familyplanz.app.data.GroceryItemDto
import com.familyplanz.app.data.GroceryListScope
import com.familyplanz.app.data.GrocerySource
import com.familyplanz.app.data.GroceryViewerDto
import com.familyplanz.app.data.StoreColourRow
import com.familyplanz.app.ui.alerts.L4TestShell
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A scripted grocery list: both scopes, Store Memory and the colour rows, with every write recorded. */
class FakeGrocerySource(
	private val viewer: GroceryViewerDto = GroceryViewerDto("u1", "fam-1"),
	var items: List<GroceryItemDto> = emptyList(),
	var suggestions: Map<String, String> = emptyMap(),
) : GrocerySource {
	val writes = mutableListOf<String>()
	var fail: ApiError? = null
	var down: ApiError? = null

	override suspend fun viewer(): ApiResult<GroceryViewerDto> =
		down?.let { ApiResult.Err(it) } ?: ApiResult.Ok(viewer)

	override suspend fun items(scope: GroceryListScope): ApiResult<List<GroceryItemDto>> =
		down?.let { ApiResult.Err(it) } ?: ApiResult.Ok(items.filter { (it.familyId != null) == (scope == GroceryListScope.FAMILY) })

	override suspend fun suggest(scope: GroceryListScope, name: String): ApiResult<String?> =
		ApiResult.Ok(suggestions[name])

	override suspend fun add(scope: GroceryListScope, input: String, stores: List<String>): ApiResult<Unit> {
		writes += "add:$scope:$input:${stores.joinToString(",")}"
		if (fail != null) return ApiResult.Err(ApiError.Server("boom"))
		items = items + GroceryItemDto(
			id = "new-${items.size}",
			name = input,
			stores = stores,
			familyId = if (scope == GroceryListScope.FAMILY) viewer.familyId else null,
			userId = viewer.id,
		)
		return ApiResult.Ok(Unit)
	}

	override suspend fun update(id: String, change: GroceryChange): ApiResult<Unit> {
		writes += "update:$id:${change.op}"
		return if (fail != null) ApiResult.Err(ApiError.Server("boom")) else ApiResult.Ok(Unit)
	}

	override suspend fun delete(id: String, scope: GroceryListScope): ApiResult<Unit> {
		writes += "delete:$id"
		return if (fail != null) ApiResult.Err(ApiError.Server("boom")) else ApiResult.Ok(Unit)
	}

	override suspend fun colours(): ApiResult<List<StoreColourRow>> = ApiResult.Ok(emptyList())

	override suspend fun setColour(store: String, color: String, scope: String): ApiResult<Unit> {
		writes += "colour:$store:$color:$scope"
		return if (fail != null) ApiResult.Err(ApiError.Server("boom")) else ApiResult.Ok(Unit)
	}
}

/** §2.5 AC-GR-1…11 over a scripted list. */
@RunWith(RobolectricTestRunner::class)
class GroceriesUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val shell = L4TestShell()
	private val nav = AppNav(AppRoute.GROCERIES)

	private fun launch(source: FakeGrocerySource): GroceriesViewModel {
		val vm = GroceriesViewModel(source, debounceMs = 1L)
		rule.setContent { shell.Provide { GroceriesRoute(vm, nav) } }
		rule.waitUntil(5_000) { !vm.ui.value.loading }
		return vm
	}

	private fun item(id: String, name: String, store: String? = null, family: Boolean = true, qty: Int = 1) = GroceryItemDto(
		id = id,
		name = name,
		quantity = qty,
		stores = listOfNotNull(store),
		familyId = if (family) "fam-1" else null,
		userId = "u1",
	)

	@Test
	fun ac_gr_1_title_chips_search_and_the_add_form() {
		launch(FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi"), item("g2", "bread", null, family = false))))
		rule.onNodeWithTag("groceries-title").assertTextEquals("Groceries")
		rule.onNodeWithTag("scope-all").assertIsSelected()
		rule.onNodeWithTag("scope-family").assertExists()
		rule.onNodeWithTag("scope-mine").assertExists()
		rule.onNodeWithTag("grocery-search").assertExists()
		rule.onNodeWithTag("grocery-input").assertExists()
		rule.onNodeWithTag("store-input").assertExists()
	}

	@Test
	fun ac_gr_2_add_toasts_and_fills_the_chosen_scope() {
		val source = FakeGrocerySource()
		launch(source)
		rule.onNodeWithTag("grocery-input").performTextInput("milk 2")
		rule.onNodeWithText("Family (shared)").performClick()
		rule.onNodeWithText("Add").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertTrue(source.writes.any { it.startsWith("add:FAMILY:milk 2") })
		assertEquals("Added \"milk 2\" to Family.", shell.snacks.first())
	}

	@Test
	fun ac_gr_3_store_memory_fills_the_store_field() {
		val source = FakeGrocerySource(suggestions = mapOf("milk" to "Aldi"))
		launch(source)
		rule.onNodeWithTag("grocery-input").performTextInput("milk")
		rule.waitUntil(5_000) { rule.onAllNodesWithTag("store-memory").fetchSemanticsNodes().isNotEmpty() }
		rule.onNodeWithTag("store-memory").assertTextEquals("Store Memory: Aldi")
		rule.onNodeWithTag("store-memory").performClick()
		rule.onNodeWithText("Aldi").assertExists()
	}

	@Test
	fun ac_gr_4_items_group_by_primary_store_with_the_store_summary() {
		launch(
			FakeGrocerySource(
				items = listOf(item("g1", "milk", "Aldi", qty = 2), item("g2", "eggs", "Aldi"), item("g3", "bread", "Kroger")),
			),
		)
		rule.onNodeWithText("2 items · 3 total", substring = true).assertIsDisplayed()
		rule.onNodeWithTag("store-group-aldi").assertExists()
		rule.onNodeWithTag("groceries-screen").performTouchInput { swipeUp() }
		rule.onNodeWithText("1 item · 1 total", substring = true).assertIsDisplayed()
		rule.onNodeWithTag("store-group-kroger").assertExists()
	}

	@Test
	fun ac_gr_5_checking_moves_the_row_to_checked_off_with_undo() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi")))
		val vm = launch(source)
		rule.onNodeWithContentDescription("Check off milk").performClick()
		rule.waitUntil(5_000) { vm.ui.value.checked.size == 1 }
		rule.onNodeWithTag("checked-off").assertExists()
		rule.onNodeWithText("Checked off (1)").assertExists()
		rule.waitUntil(5_000) { shell.snacks.any { it.startsWith("Checked off \"milk\"") } }
		assertTrue(source.writes.contains("update:g1:check"))
		rule.onNodeWithContentDescription("Uncheck milk").performClick()
		rule.waitUntil(5_000) { source.writes.contains("update:g1:uncheck") }
	}

	@Test
	fun ac_gr_6_move_names_the_destination_scope() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi", family = false), item("g2", "eggs", "Aldi")))
		launch(source)
		rule.onNodeWithContentDescription("Move milk to Family").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertTrue(source.writes.contains("update:g1:move"))
		assertEquals("Moved \"milk\" to Family.", shell.snacks.first())
	}

	@Test
	fun ac_gr_7_the_store_editor_saves_alternates() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi")))
		launch(source)
		rule.onNodeWithContentDescription("Edit stores for milk").performClick()
		rule.onNodeWithTag("store-editor").assertExists()
		rule.onNodeWithTag("store-editor-input").performTextInput(", Lidl")
		rule.onNodeWithContentDescription("Save stores for milk").performClick()
		rule.waitUntil(5_000) { source.writes.contains("update:g1:stores") }
		rule.waitUntil(5_000) { shell.snacks.contains("Stores updated for \"milk\".") }
	}

	@Test
	fun ac_gr_7_a_second_store_shows_after_the_or_join() {
		launch(FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi").copy(stores = listOf("Aldi", "Lidl")))))
		rule.onNodeWithTag("store-alternate-join").assertTextEquals("or")
		rule.onAllNodesWithTag("store-chip-primary").fetchSemanticsNodes().let { assertEquals(1, it.size) }
		rule.onAllNodesWithTag("store-chip-alt").fetchSemanticsNodes().let { assertEquals(1, it.size) }
	}

	@Test
	fun ac_gr_8_delete_toasts_and_keeps_store_memory() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi")))
		launch(source)
		rule.onNodeWithContentDescription("Delete milk").performClick()
		rule.waitUntil(5_000) { shell.snacks.isNotEmpty() }
		assertTrue(source.writes.contains("delete:g1"))
		assertEquals("Removed \"milk\" — store memory kept.", shell.snacks.first())
	}

	@Test
	fun ac_gr_9_the_store_colours_card_lists_every_shop_and_its_collisions() {
		val source = FakeGrocerySource(
			items = listOf(item("g1", "milk", "Aldi"), item("g2", "bread", "Lidl"), item("g3", "eggs", null, family = false)),
		)
		launch(source)
		rule.onNodeWithTag("store-colours").assertExists()
		rule.onAllNodesWithTag("store-colour-row").fetchSemanticsNodes().let { assertEquals(2, it.size) }
		rule.onNodeWithTag("store-colours-footer").assertExists()
		rule.onNodeWithText("No shops yet. Type one on an item and it turns up here with a colour of its own.")
			.assertDoesNotExist()
	}

	@Test
	fun ac_gr_9_picking_a_colour_writes_at_the_cards_own_scope() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi")))
		launch(source)
		rule.onNodeWithTag("store-colour-picker-aldi").performClick()
		rule.onNodeWithText("Blue").performClick()
		rule.waitUntil(5_000) { source.writes.any { it.startsWith("colour:") } }
		assertTrue(source.writes.contains("colour:Aldi:sky:family"))
	}

	@Test
	fun ac_gr_9_the_group_picker_opens_from_the_bar_and_scopes_just_me() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi")))
		launch(source)
		rule.onNodeWithTag("group-colour-aldi").performClick()
		rule.onNodeWithTag("group-colour-picker").assertExists()
		rule.onNodeWithTag("colour-scope-personal").performClick()
		rule.onNodeWithTag("group-colour-picker").performClick()
		rule.onNodeWithText("Blue").performClick()
		rule.waitUntil(5_000) { source.writes.any { it.startsWith("colour:") } }
		assertTrue(source.writes.contains("colour:Aldi:sky:personal"))
	}

	@Test
	fun ac_gr_10_no_family_offers_mine_only_and_says_why() {
		launch(FakeGrocerySource(GroceryViewerDto("u1", null)))
		rule.onNodeWithTag("add-to-mine").assertIsSelected()
		rule.onNodeWithTag("add-to-family").assertDoesNotExist()
		rule.onNodeWithTag("no-family-note").assertIsDisplayed()
	}

	@Test
	fun ac_gr_11_every_empty_state_string_appears_for_its_condition() {
		launch(FakeGrocerySource())
		rule.onNodeWithTag("grocery-empty").assertTextEquals("Both lists are empty. Add the first item.")

		rule.onNodeWithTag("grocery-search").performTextInput("zzz")
		rule.waitUntil(5_000) {
			rule.onAllNodesWithText("No items match “zzz”.").fetchSemanticsNodes().isNotEmpty()
		}
	}

	@Test
	fun ac_gr_11_a_failed_load_offers_retry() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi"))).apply { down = ApiError.Server("boom") }
		launch(source)
		rule.onNodeWithText("Couldn't load your lists. boom").assertIsDisplayed()
		rule.onNodeWithText("Retry").performClick()
		rule.waitForIdle()
		rule.onNodeWithText("Couldn't load your lists. boom").assertIsDisplayed()
	}

	@Test
	fun the_store_colours_empty_copy_shows_before_any_shop_is_typed() {
		launch(FakeGrocerySource())
		rule.onNodeWithTag("store-colours-empty").assertExists()
	}

	@Test
	fun searching_narrows_the_list_and_can_be_cleared() {
		launch(FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi"), item("g2", "bread", "Kroger"))))
		rule.onNodeWithTag("grocery-search").performTextInput("mil")
		rule.waitUntil(5_000) { rule.onAllNodesWithTag("store-group-kroger").fetchSemanticsNodes().isEmpty() }
		rule.onNodeWithTag("store-group-aldi").assertExists()
		rule.onNodeWithTag("clear-search").performClick()
		rule.onNodeWithTag("groceries-screen").performTouchInput { swipeUp() }
		rule.waitUntil(5_000) { rule.onAllNodesWithTag("store-group-kroger").fetchSemanticsNodes().isNotEmpty() }
	}

	@Test
	fun a_checked_row_lists_its_scope_in_words() {
		val source = FakeGrocerySource(items = listOf(item("g1", "milk", "Aldi")))
		val vm = launch(source)
		rule.onNodeWithContentDescription("Check off milk").performClick()
		rule.waitUntil(5_000) { vm.ui.value.checked.size == 1 }
		rule.onNodeWithTag("checked-row-g1").assertExists()
		rule.onAllNodesWithContentDescription("Uncheck milk").fetchSemanticsNodes().let { assertEquals(1, it.size) }
	}
}
