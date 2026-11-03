package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.theme.FpTheme

/** EmptyState.svelte, shared by every tab (and the "Coming soon" placeholders). */
@Composable
fun FpEmptyState(title: String, hint: String) {
	Box(modifier = Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
		Surface(
			shape = MaterialTheme.shapes.large,
			color = MaterialTheme.colorScheme.primaryContainer,
			modifier = Modifier.fillMaxWidth(),
		) {
			Column(
				modifier = Modifier.padding(horizontal = 24.dp, vertical = 32.dp),
				horizontalAlignment = Alignment.CenterHorizontally,
				verticalArrangement = Arrangement.spacedBy(4.dp),
			) {
				Text(
					title,
					style = MaterialTheme.typography.titleMedium,
					fontWeight = FontWeight.Bold,
					color = FpTheme.colors.textStrong,
				)
				Text(
					hint,
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.onSurfaceVariant,
					textAlign = TextAlign.Center,
				)
			}
		}
	}
}
