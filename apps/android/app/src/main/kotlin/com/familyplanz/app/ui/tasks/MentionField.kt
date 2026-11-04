package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.familyplanz.app.domain.tasks.QuickAddMember
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * Public quick-add input with `@name` suggestions (the web's MentionInput).
 * Shared with L4's Dashboard quick-add; the Tasks tab uses it inside
 * [AddTaskCard].
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongParameterList")
fun MentionField(
	value: String,
	onValueChange: (String) -> Unit,
	members: List<QuickAddMember>,
	modifier: Modifier = Modifier,
	placeholder: String = "Buy milk tomorrow @maya  \u00b7  or paste a list",
	singleLine: Boolean = true,
	onDone: () -> Unit = {},
) {
	val suggestion = mentionQuery(value)
	val matches = if (suggestion.isNullOrBlank()) {
		emptyList()
	} else {
		members.filter { it.firstName.startsWith(suggestion, ignoreCase = true) }
			.ifEmpty { members.filter { it.firstName.contains(suggestion, ignoreCase = true) } }
	}
	Column(modifier = modifier.fillMaxWidth()) {
		OutlinedTextField(
			value = value,
			onValueChange = onValueChange,
			modifier = Modifier.fillMaxWidth().testTag("mention-field"),
			singleLine = singleLine,
			shape = FpShape.Input,
			colors = fpFieldColors(),
			placeholder = { Text(placeholder) },
			keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
			keyboardActions = KeyboardActions(onDone = { onDone() }),
		)
		if (matches.isNotEmpty()) {
			FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
				matches.take(MAX_SUGGESTIONS).forEach { member ->
					FilterChip(
						selected = false,
						onClick = { onValueChange(applyMention(value, member)) },
						label = { Text("@${member.firstName}") },
						modifier = Modifier.testTag("mention-suggestion"),
						shape = FpShape.Pill,
						colors = fpFilterChipColors(),
						border = fpFilterChipBorder(false),
					)
				}
			}
		}
	}
}

/** The `@token` being typed at the end of the field, or null. */
internal fun mentionQuery(value: String): String? {
	val tail = value.takeLastWhile { !it.isWhitespace() }
	return tail.takeIf { it.startsWith("@") && it.length > 1 }?.drop(1)
}

/** Replace the half-typed `@token` with the picked member's first name. */
internal fun applyMention(value: String, member: QuickAddMember): String {
	val cut = value.length - value.takeLastWhile { !it.isWhitespace() }.length
	return value.take(cut) + "@${member.firstName} "
}

private const val MAX_SUGGESTIONS = 4

/** The red line under the field when an `@name` matches nobody (AC-TK-5). */
@Composable
fun UnknownMemberLine(member: String) {
	Text(
		text = "Unknown member $member \u2014 check the spelling or pick someone from your family.",
		color = FpTheme.colors.late.content,
		style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
		modifier = Modifier.padding(top = 4.dp).testTag("unknown-member"),
	)
}
