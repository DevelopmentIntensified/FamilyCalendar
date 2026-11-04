@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/*
 * Grocery store swatches. Split out of Color.kt to stay under the file cap;
 * the ramps they reference live there.
 */

/** One grocery store swatch (`groceries.ts` STORE_COLOURS): chip, header bar and dot. */
@Immutable
@Suppress("MatchingDeclarationName")
data class StoreTone(val key: String, val label: String, val chip: ChipTone, val bar: Color, val dot: Color)

/** `groceries.ts:156-200` STORE_COLOURS, same order and keys. */
val GroceryTones: List<StoreTone> = listOf(
	StoreTone("terracotta", "Terracotta", ChipTone(Accent.Orange100, Accent.Orange900), Accent.Orange50, Accent.Orange500),
	StoreTone("sky", "Blue", ChipTone(Accent.Sky100, Accent.Sky900), Accent.Sky50, Accent.Sky500),
	StoreTone("sage", "Mint", ChipTone(Accent.Emerald100, Accent.Emerald900), Accent.Emerald50, Accent.Emerald500),
	StoreTone("lilac", "Lavender", ChipTone(Accent.Violet100, Accent.Violet900), Accent.Violet50, Accent.Violet500),
	StoreTone("amber", "Amber", ChipTone(Accent.Amber100, Accent.Amber900), Accent.Amber50, Accent.Amber500),
	StoreTone("slate", "Slate", ChipTone(Slate.S200, Slate.S800), Slate.S100, Slate.S500),
)
