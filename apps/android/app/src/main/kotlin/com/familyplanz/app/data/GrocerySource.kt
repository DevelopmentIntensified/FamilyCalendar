package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** One open Grocery Item (`grocery_items` row as `/api/groceries` sends it). */
@Serializable
data class GroceryItemDto(
	val id: String,
	val name: String,
	val quantity: Int = 1,
	val stores: List<String> = emptyList(),
	val familyId: String? = null,
	val userId: String? = null,
)

/** A `grocery_store_colours` row: the shop's key, a swatch key, and whose it is. */
@Serializable
data class StoreColourRow(
	val storeKey: String,
	val color: String,
	val userId: String,
	val familyId: String? = null,
)

/** The two `/api/me` fields the list needs (G1: `familyId` = `hasFamily`). */
@Serializable
data class GroceryViewerDto(val id: String, val familyId: String? = null)

@Serializable
data class GroceryItemsResponse(val items: List<GroceryItemDto> = emptyList())

@Serializable
data class GrocerySuggestResponse(val store: String? = null)

@Serializable
data class StoreColoursResponse(val colours: List<StoreColourRow> = emptyList())

/** `mine` | `family`: the list a row lives on (and the API's `scope`). */
enum class GroceryListScope(val wire: String) { MINE("mine"), FAMILY("family") }

/** The groceries API (§2.5 "Data/API"); every call already exists on the server. */
interface GrocerySource {
	suspend fun viewer(): ApiResult<GroceryViewerDto>

	suspend fun items(scope: GroceryListScope): ApiResult<List<GroceryItemDto>>

	/** Store Memory: the store this name was last bought at, on [scope]'s list. */
	suspend fun suggest(scope: GroceryListScope, name: String): ApiResult<String?>

	suspend fun add(scope: GroceryListScope, input: String, stores: List<String>): ApiResult<Unit>

	/** `PATCH {op, scope, stores?, target?}`: op = check | uncheck | stores | move. */
	suspend fun update(id: String, change: GroceryChange): ApiResult<Unit>

	suspend fun delete(id: String, scope: GroceryListScope): ApiResult<Unit>

	suspend fun colours(): ApiResult<List<StoreColourRow>>

	/** [scope] `family` writes the shared row, `personal` the viewer's override; color `auto` clears. */
	suspend fun setColour(store: String, color: String, scope: String): ApiResult<Unit>
}

/** One PATCH body for `/api/groceries/{id}`. */
data class GroceryChange(
	val op: String,
	val scope: GroceryListScope,
	val stores: List<String>? = null,
	val target: GroceryListScope? = null,
) {
	fun json(): JsonElement = buildJsonObject {
		put("scope", JsonPrimitive(scope.wire))
		put("op", JsonPrimitive(op))
		stores?.let { list -> put("stores", JsonArray(list.map { JsonPrimitive(it) })) }
		target?.let { put("target", JsonPrimitive(it.wire)) }
	}
}

interface GroceryApi {
	@GET("api/me")
	suspend fun me(): GroceryViewerDto

	@GET("api/groceries")
	suspend fun items(@Query("scope") scope: String): GroceryItemsResponse

	@GET("api/groceries")
	suspend fun suggest(
		@Query("scope") scope: String,
		@Query("suggest") suggest: String,
		@Query("name") name: String,
	): GrocerySuggestResponse

	@POST("api/groceries")
	suspend fun add(@Body body: JsonElement): JsonElement

	@PATCH("api/groceries/{id}")
	suspend fun update(@Path("id") id: String, @Body body: JsonElement): JsonElement

	@DELETE("api/groceries/{id}")
	suspend fun delete(@Path("id") id: String, @Query("scope") scope: String): JsonElement

	@GET("api/groceries/colours")
	suspend fun colours(): StoreColoursResponse

	@PATCH("api/groceries/colours")
	suspend fun setColour(@Body body: JsonElement): JsonElement
}

class NetworkGrocerySource(private val api: GroceryApi) : GrocerySource {
	override suspend fun viewer() = apiCall { api.me() }

	override suspend fun items(scope: GroceryListScope) = apiCall { api.items(scope.wire).items }

	override suspend fun suggest(scope: GroceryListScope, name: String) = apiCall { api.suggest(scope.wire, "1", name).store }

	override suspend fun add(scope: GroceryListScope, input: String, stores: List<String>) = apiCall {
		api.add(
			buildJsonObject {
				put("scope", JsonPrimitive(scope.wire))
				put("input", JsonPrimitive(input))
				if (stores.isNotEmpty()) put("stores", JsonArray(stores.map { JsonPrimitive(it) }))
			},
		)
		Unit
	}

	override suspend fun update(id: String, change: GroceryChange) = apiCall {
		api.update(id, change.json())
		Unit
	}

	override suspend fun delete(id: String, scope: GroceryListScope) = apiCall {
		api.delete(id, scope.wire)
		Unit
	}

	override suspend fun colours() = apiCall { api.colours().colours }

	override suspend fun setColour(store: String, color: String, scope: String) = apiCall {
		api.setColour(
			buildJsonObject {
				put("store", JsonPrimitive(store))
				put("color", JsonPrimitive(color))
				put("scope", JsonPrimitive(scope))
			},
		)
		Unit
	}
}
