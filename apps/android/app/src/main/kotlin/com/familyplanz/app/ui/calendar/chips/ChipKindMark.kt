package com.familyplanz.app.ui.calendar.chips

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.theme.Slate

/**
 * ChipKindMark.svelte: the leading mark for a chip. One composable so month,
 * week, day and list cannot drift — same 10 dp box, same 2 dp gap, per-view
 * word only. [color] is the calendar colour (`--chip-color`); a task's mark
 * is slate-400 whatever it is given. The glyph view's hidden phrase is the
 * content description; the word view shows the word (9 sp semibold caps).
 */
@Composable
fun ChipKindMark(kind: ChipKind, color: Color, density: ChipDensity = ChipDensity.GLYPH, modifier: Modifier = Modifier) {
	val treatment = chipTreatment(kind)
	val word = chipWord(kind, density)
	val a11y = chipA11y(kind, density)
	Row(
		modifier = modifier
			.testTag("chip-mark-${kind.name}")
			.semantics { if (a11y.isNotEmpty()) contentDescription = a11y },
		horizontalArrangement = Arrangement.spacedBy(CHIP_GAP_DP.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Box(Modifier.size(CHIP_GLYPH_DP.dp), contentAlignment = Alignment.Center) {
			Glyph(treatment.glyph, if (kind == ChipKind.TASK) Slate.S400 else color)
		}
		if (word.isNotEmpty()) Text(word.uppercase(), style = wordStyle(kind))
	}
}

@Composable
private fun Glyph(glyph: ChipGlyph, color: Color) {
	val size = Modifier.size(glyph.width.dp, glyph.height.dp)
	when (glyph.shape) {
		GlyphShape.DOT -> Box(size.clip(CircleShape).background(color))
		GlyphShape.BAR -> Box(size.clip(RoundedCornerShape(1.dp)).background(color))
		GlyphShape.RING -> Box(size.border(glyph.stroke.dp, color, CircleShape))
		GlyphShape.BAG -> Canvas(size) {
			// The web's 20-unit "shopping bag" path, reduced to its three blocks.
			val u = this.size.width / 20f
			drawRect(color, Offset(3 * u, 3 * u), Size(14 * u, 4 * u))
			drawRect(color, Offset(3 * u, 9 * u), Size(8 * u, 8 * u))
			drawRect(color, Offset(13 * u, 9 * u), Size(4 * u, 8 * u))
		}
	}
}

private fun wordStyle(kind: ChipKind) = TextStyle(
	fontSize = 9.sp,
	lineHeight = 9.sp,
	fontWeight = FontWeight.SemiBold,
	letterSpacing = 0.025.em,
	color = when (kind) {
		ChipKind.TASK -> Slate.S500
		ChipKind.SPONSORED -> Slate.S600
		else -> Slate.S600.copy(alpha = 0.7f)
	},
)
