package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

/**
 * Token entry (mint in web app: Settings > API tokens, fp_ shown once).
 * List state holds tokens; launch from Settings clears the stored token.
 */
@Composable
fun SettingsScreen(
	note: String?,
	onSave: (String) -> Unit,
	onCancel: () -> Unit,
) {
	var token by rememberSaveable { mutableStateOf("") }

	Column(
		modifier = Modifier.fillMaxSize().padding(24.dp),
		verticalArrangement = Arrangement.Center,
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		Text("Family Planz", style = MaterialTheme.typography.headlineMedium)
		Text(
			"Mint a personal API token in the web app (Settings > API tokens). It is shown once; paste it here.",
			style = MaterialTheme.typography.bodyMedium,
			modifier = Modifier.padding(vertical = 16.dp),
		)
		note?.let {
			Text(
				it,
				color = MaterialTheme.colorScheme.error,
				style = MaterialTheme.typography.bodySmall,
			)
		}
		OutlinedTextField(
			value = token,
			onValueChange = { token = it },
			label = { Text("API token (fp_...)") },
			modifier = Modifier.fillMaxWidth(),
			singleLine = true,
			visualTransformation = PasswordVisualTransformation(),
			keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
		)
		Button(
			onClick = { if (token.isNotBlank()) onSave(token) },
			modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
		) {
			Text("Save and sync")
		}
		OutlinedButton(
			onClick = onCancel,
			modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
		) {
			Text("Cancel")
		}
	}
}
