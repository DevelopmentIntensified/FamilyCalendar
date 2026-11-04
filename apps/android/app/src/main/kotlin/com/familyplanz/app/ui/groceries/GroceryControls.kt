package com.familyplanz.app.ui.groceries

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate

/** Visual spec of a [GroceryField]: placeholder, accessible name, padding and type size. */
data class FieldLook(val placeholder: String, val label: String, val vertical: Dp = 8.dp, val textSize: Int = 14)

/**
 * The page's `rounded-lg border-slate-300 bg-white` input with a
 * `focus:border-primary-500` ring and slate-400 placeholder; [label] is its aria-label.
 */
@Composable
fun GroceryField(
	value: String,
	onValueChange: (String) -> Unit,
	look: FieldLook,
	modifier: Modifier = Modifier,
	onDone: (() -> Unit)? = null,
	adornments: @Composable (inner: @Composable () -> Unit) -> Unit = { it() },
) {
	var focused by remember { mutableStateOf(false) }
	BasicTextField(
		value = value,
		onValueChange = onValueChange,
		singleLine = true,
		textStyle = TextStyle(fontSize = look.textSize.sp, color = Slate.S700),
		cursorBrush = SolidColor(Primary.P600),
		keyboardOptions = KeyboardOptions(imeAction = if (onDone != null) ImeAction.Done else ImeAction.Default),
		keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
		modifier = modifier
			.semantics { contentDescription = look.label }
			.onFocus { focused = it },
		decorationBox = { inner ->
			Box(
				Modifier
					.clip(MaterialTheme.shapes.small)
					.background(Color.White)
					.border(1.dp, if (focused) Primary.P500 else Slate.S300, MaterialTheme.shapes.small)
					.padding(horizontal = 12.dp, vertical = look.vertical),
				contentAlignment = Alignment.CenterStart,
			) {
				if (value.isEmpty()) Text(look.placeholder, fontSize = look.textSize.sp, color = Slate.S400)
				adornments(inner)
			}
		},
	)
}

private fun Modifier.onFocus(changed: (Boolean) -> Unit): Modifier =
	onFocusChanged { changed(it.isFocused) }

/** A native `<select>`: a bordered button that opens the option list. */
@Composable
fun GrocerySelect(
	selected: String,
	options: List<Pair<String, String>>,
	label: String,
	onSelect: (String) -> Unit,
	modifier: Modifier = Modifier,
	enabled: Boolean = true,
) {
	var open by remember { mutableStateOf(false) }
	Box(modifier) {
		Text(
			(options.firstOrNull { it.first == selected }?.second ?: selected) + "  ▾",
			fontSize = 12.sp,
			fontWeight = FontWeight.SemiBold,
			color = Slate.S700,
			modifier = Modifier
				.heightIn(min = 32.dp)
				.clip(MaterialTheme.shapes.small)
				.background(Color.White)
				.border(1.dp, Slate.S300, MaterialTheme.shapes.small)
				.semantics { contentDescription = label }
				.clickable(enabled = enabled, role = Role.DropdownList) { open = true }
				.padding(horizontal = 8.dp, vertical = 6.dp),
		)
		DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
			options.forEach { (key, text) ->
				DropdownMenuItem(text = { Text(text) }, onClick = {
					open = false
					onSelect(key)
				})
			}
		}
	}
}

/** A quiet pill button: `rounded-full border-slate-300 bg-white px-2.5 py-1 font-semibold`. */
@Composable
fun PillChip(text: String, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
	Text(
		text,
		fontSize = 12.sp,
		fontWeight = FontWeight.SemiBold,
		color = Slate.S700,
		modifier = modifier
			.clip(FpShape.Pill)
			.background(Color.White)
			.border(1.dp, Slate.S300, FpShape.Pill)
			.semantics { contentDescription = label }
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 10.dp, vertical = 4.dp),
	)
}

/** The row's MINE / FAMILY tag: `rounded bg-slate-100 px-1.5 text-[0.625rem] font-bold uppercase`. */
@Composable
fun ScopeTag(text: String) {
	Text(
		text.uppercase(),
		fontSize = 10.sp,
		fontWeight = FontWeight.Bold,
		letterSpacing = 0.25.sp,
		color = Slate.S500,
		modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp)).background(Slate.S100)
			.padding(horizontal = 6.dp, vertical = 2.dp),
	)
}

/** A row of [content] with the web's `gap-2`. */
@Composable
fun Gap2Row(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { content() }
}
