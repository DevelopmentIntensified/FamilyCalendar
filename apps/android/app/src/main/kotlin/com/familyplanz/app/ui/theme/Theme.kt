package com.familyplanz.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

/** Extended web roles; defaults to the light set so a bare MaterialTheme still renders correctly. */
val LocalFpColors = staticCompositionLocalOf { FpColors() }

/**
 * The FamilyPlanz theme (issue 291): the website's palette, type and radii.
 * Never dynamic colour, never dark — the site has neither, and the app is
 * meant to look like the site.
 */
@Composable
fun FamilyPlanzTheme(content: @Composable () -> Unit) {
	CompositionLocalProvider(LocalFpColors provides FpColors()) {
		MaterialTheme(
			colorScheme = FpLightColorScheme,
			typography = FpTypography,
			shapes = FpShapes,
			content = content,
		)
	}
}

/** Accessor for the non-Material web roles: `FpTheme.colors.category`. */
object FpTheme {
	val colors: FpColors
		@Composable
		@ReadOnlyComposable
		get() = LocalFpColors.current
}
