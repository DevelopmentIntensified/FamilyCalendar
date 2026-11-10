package com.familyplanz.app.ui.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/* The Account sections' shared chrome and the first four cards (2.12). */

/** One section card: rounded 20, p24, with its title. */
@Composable
fun AccountCard(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	FpCard(modifier = modifier.fillMaxWidth()) {
		Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
		Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
	}
}

/** AuthInput look for the account forms. */
@Composable
fun AccountTextField(label: String, value: String, onValueChange: (String) -> Unit, placeholder: String? = null) {
	OutlinedTextField(
		value = value,
		onValueChange = onValueChange,
		label = { Text(label) },
		placeholder = placeholder?.let { { Text(it) } },
		singleLine = true,
		shape = FpShape.Input,
		colors = fpFieldColors(),
		keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
		modifier = Modifier.fillMaxWidth(),
	)
}

/**
 * A text setting saved on purpose, not per keystroke (#310): the field keeps
 * a local draft and "Save" shows once it differs from [value]. The server
 * refuses half-typed values (a partial time zone, a partial colour), so
 * sending every keystroke would make the field impossible to edit.
 */
@Composable
fun AccountCommitField(label: String, value: String, onCommit: (String) -> Unit, placeholder: String? = null) {
	var draft by remember(value) { mutableStateOf(value) }
	Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
		OutlinedTextField(
			value = draft,
			onValueChange = { draft = it },
			label = { Text(label) },
			placeholder = placeholder?.let { { Text(it) } },
			singleLine = true,
			shape = FpShape.Input,
			colors = fpFieldColors(),
			modifier = Modifier.weight(1f),
		)
		if (draft.trim() != value) {
			Text(
				"Save",
				style = MaterialTheme.typography.bodyMedium,
				fontWeight = FontWeight.SemiBold,
				color = MaterialTheme.colorScheme.primary,
				modifier = Modifier
					.clickable(role = Role.Button) { onCommit(draft.trim()) }
					.semantics { contentDescription = "Save $label" }
					.heightIn(min = 44.dp)
					.padding(vertical = 12.dp),
			)
		}
	}
}

/** The section's submit lives in AccountControls.kt alongside the other cross-card controls. */

/** AC-AC-3: First Name and Last Name. */
@Composable
fun ProfileSection(state: AccountState, actions: AccountActions) {
	AccountCard("Profile Information") {
		AccountTextField("First Name", state.firstName, actions.onFirstName)
		AccountTextField("Last Name", state.lastName, actions.onLastName)
		AccountSaveButton("Save profile", actions.onSaveProfile)
	}
}

/** AC-AC-13's neighbour: the families this account belongs to, with role and size. */
@Composable
fun FamiliesSection(state: AccountState, actions: AccountActions) {
	AccountCard("Your families") {
		if (state.families.isEmpty()) {
			Text(
				"You belong to no families yet. Create one to share calendars, chores and the kids' schedule.",
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
			AccountSaveButton("Create a family", actions.onCreateFamily)
		} else {
			state.families.forEach { family ->
				Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
					Column(modifier = Modifier.weight(1f)) {
						Text(family.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
						Text(
							"${family.role ?: "member"} \u00B7 ${family.memberCount} members",
							style = MaterialTheme.typography.bodySmall,
							color = FpTheme.colors.textMuted,
						)
					}
					Text(
						"Open",
						style = MaterialTheme.typography.bodySmall,
						fontWeight = FontWeight.SemiBold,
						color = MaterialTheme.colorScheme.primary,
						modifier = Modifier.padding(start = 8.dp),
					)
				}
			}
			AccountInlineLink("Open the Families tab", actions.onOpenFamily)
		}
	}
}

/** The in-card text link (keeps 44 dp of touch target). */
@Composable
fun AccountInlineLink(text: String, onClick: () -> Unit) {
	Text(
		text,
		style = MaterialTheme.typography.bodyMedium,
		fontWeight = FontWeight.SemiBold,
		color = MaterialTheme.colorScheme.primary,
		modifier = Modifier
			.clickable(onClick = onClick)
			.heightIn(min = 44.dp)
			.padding(vertical = 12.dp),
	)
}

/** AC-AC-1's Notifications section: the per-preference toggles and the alerts jump. */
@Composable
fun NotificationsSection(state: AccountState, actions: AccountActions) {
	AccountCard("Notifications") {
		val options = state.notifications.options
		if (options.isEmpty()) {
			Text(
				"Notification preferences load with your account.",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
		}
		options.forEach { option ->
			AccountSwitchRow(
				label = option.label,
				hint = option.hint,
				checked = state.notifications.preferences[option.id] ?: option.default,
				onCheckedChange = { actions.onNotification(option.id, it) },
			)
		}
		AccountInlineLink("See the alerts", actions.onOpenAlerts)
	}
}

/** AC-AC-9: the email field and its verification message. */
@Composable
fun EmailSection(state: AccountState, actions: AccountActions) {
	AccountCard("Email Address") {
		AccountTextField("Email", state.emailDraft, actions.onEmail)
		Text(
			"Changing it sends a verification link to the new address.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		AccountSaveButton("Update email", actions.onSaveEmail)
	}
}
