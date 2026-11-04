package com.familyplanz.app.ui.groceries

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import com.familyplanz.app.data.StoreColourRow

/*
 * Store colours (096/115), ported from src/lib/data/groceries.ts:
 * personal row, then family row, then a name-derived default; overrides
 * keyed `scope:storeKey` so a pending flip keeps the scope it was made at.
 */

/** One `STORE_COLOURS` swatch: row chip fill/ink, group bar tint, header dot. Tailwind 3.4.19 hex. */
@Immutable
data class StoreColour(val key: String, val label: String, val chip: Color, val ink: Color, val bar: Color, val dot: Color)

val STORE_COLOURS: List<StoreColour> = listOf(
	StoreColour("terracotta", "Terracotta", Color(0xFFFFEDD5), Color(0xFF7C2D12), Color(0xFFFFF7ED), Color(0xFFF97316)),
	StoreColour("sky", "Blue", Color(0xFFE0F2FE), Color(0xFF0C4A6E), Color(0xFFF0F9FF), Color(0xFF0EA5E9)),
	StoreColour("sage", "Mint", Color(0xFFD1FAE5), Color(0xFF064E3B), Color(0xFFECFDF5), Color(0xFF10B981)),
	StoreColour("lilac", "Lavender", Color(0xFFEDE9FE), Color(0xFF4C1D95), Color(0xFFF5F3FF), Color(0xFF8B5CF6)),
	StoreColour("amber", "Amber", Color(0xFFFEF3C7), Color(0xFF78350F), Color(0xFFFFFBEB), Color(0xFFF59E0B)),
	StoreColour("slate", "Slate", Color(0xFFE2E8F0), Color(0xFF1E293B), Color(0xFFF1F5F9), Color(0xFF64748B)),
)

/** The picker's "no colour of my own" choice. */
const val AUTO_COLOUR = "auto"

/** Which row a colour write targets (the colours API's `scope`). */
enum class ColourScope(val wire: String, val label: String) { FAMILY("family", "Everyone"), PERSONAL("personal", "Just me") }

/** Who is looking: colours resolve by the viewer, never by the open list. */
data class StoreViewer(val userId: String, val familyId: String?)

fun isStoreColourKey(v: String): Boolean = STORE_COLOURS.any { it.key == v }

private fun swatch(key: String): StoreColour = STORE_COLOURS.firstOrNull { it.key == key } ?: STORE_COLOURS[0]

/**
 * `hashName` (src/lib/utils/hashName.ts) with JavaScript number semantics:
 * `hash << 5` truncates to int32, the subtraction does not.
 */
fun hashName(name: String): Long {
	var hash = 0L
	name.forEach { c -> hash = c.code + ((hash.toInt() shl 5).toLong() - hash) }
	return hash
}

fun defaultStoreColourKey(name: String): String =
	STORE_COLOURS[(kotlin.math.abs(hashName(storeKey(name))) % STORE_COLOURS.size).toInt()].key

/** Personal, then family, then the default. Null = no store ("Any store" is never tinted). */
fun colourFor(name: String?, rows: List<StoreColourRow>, viewer: StoreViewer): StoreColour? {
	val label = name?.trim().orEmpty()
	if (label.isEmpty() || label == NO_STORE_LABEL) return null
	val key = storeKey(label)
	val mine = rows.filter { it.storeKey == key && isStoreColourKey(it.color) }
	val personal = mine.firstOrNull { it.familyId == null && it.userId == viewer.userId }
	val family = mine.firstOrNull { it.familyId != null && it.familyId == viewer.familyId }
	return swatch((personal ?: family)?.color ?: defaultStoreColourKey(key))
}

/** The other stores on [name]'s swatch, so a collision is named, never silent. */
fun storesSharingColour(name: String, all: List<String>, rows: List<StoreColourRow>, viewer: StoreViewer): List<String> {
	val colour = colourFor(name, rows, viewer) ?: return emptyList()
	return all.filter { storeKey(it) != storeKey(name) && colourFor(it, rows, viewer)?.key == colour.key }
}

fun overrideKey(scope: ColourScope, key: String): String = "${scope.wire}:$key"

/** The `familyId` a scope writes; with no family, "Everyone" is the personal row. */
fun familyIdFor(scope: ColourScope, viewer: StoreViewer): String? = if (scope == ColourScope.FAMILY) viewer.familyId else null

/** `withColourOverrides`: the loaded rows with each pending flip merged in at ITS OWN scope. */
fun withOverrides(rows: List<StoreColourRow>, overrides: Map<String, String>, viewer: StoreViewer): List<StoreColourRow> {
	val merged = rows.toMutableList()
	overrides.forEach { (entry, color) ->
		val scope = ColourScope.entries.firstOrNull { entry.startsWith("${it.wire}:") }
		if (color.isEmpty() || scope == null) return@forEach
		val row = StoreColourRow(entry.substringAfter(':'), color, viewer.userId, familyIdFor(scope, viewer))
		val at = merged.indexOfFirst { it.storeKey == row.storeKey && it.familyId == row.familyId && it.userId == row.userId }
		if (at >= 0) merged[at] = row else merged += row
	}
	return merged
}

/** What a picker shows for one shop at one scope: pending, else stored at that scope, else Auto. */
fun pickerValue(name: String, scope: ColourScope, rows: List<StoreColourRow>, overrides: Map<String, String>, viewer: StoreViewer): String {
	val key = storeKey(name)
	overrides[overrideKey(scope, key)]?.takeIf { it.isNotEmpty() }?.let { return it }
	val stored = rows.firstOrNull { it.storeKey == key && it.familyId == familyIdFor(scope, viewer) }
	return stored?.color?.takeIf(::isStoreColourKey) ?: AUTO_COLOUR
}
