package com.familyplanz.app.ui.secondary

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.Slate

/** How an [ActionButton] is dressed. */
internal data class ButtonLook(val container: Color, val content: Color, val border: Color?, val bold: Boolean = false)

internal object ButtonLooks {
	/** `rounded-lg bg-primary-600 font-semibold text-white`. */
	val Primary @Composable get() = ButtonLook(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary, null, bold = true)

	/** `border border-slate-300 bg-white font-medium text-slate-700`. */
	val Outline = ButtonLook(Color.White, Slate.S700, Slate.S300)

	/** `border-green-300 bg-white font-medium text-green-700`. */
	val GreenOutline = ButtonLook(Color.White, PageTones.Green700, PageTones.Green300)

	/** `border-amber-300 bg-amber-50 font-medium text-amber-800`. */
	val Amber = ButtonLook(Color(0xFFFFFBEB), Color(0xFF92400E), PageTones.Amber300)
}

/** The web's small rectangular buttons (`rounded-lg`/`rounded-md`, 44dp tall); disabled is 50% opacity, as `disabled:opacity-50`. */
@Composable
@Suppress("LongParameterList")
internal fun ActionButton(
	text: String,
	onClick: () -> Unit,
	look: ButtonLook,
	modifier: Modifier = Modifier,
	enabled: Boolean = true,
	shape: Shape = MaterialTheme.shapes.small,
) {
	Box(
		modifier = modifier
			.heightIn(min = 44.dp)
			.alpha(if (enabled) 1f else 0.5f)
			.clip(shape)
			.background(look.container)
			.then(if (look.border != null) Modifier.border(1.dp, look.border, shape) else Modifier)
			.clickable(enabled = enabled, role = Role.Button, onClick = onClick)
			.padding(horizontal = 16.dp, vertical = 10.dp),
		contentAlignment = Alignment.Center,
	) {
		Text(
			text,
			style = MaterialTheme.typography.bodyMedium,
			fontWeight = if (look.bold) FontWeight.SemiBold else FontWeight.Medium,
			color = look.content,
		)
	}
}
