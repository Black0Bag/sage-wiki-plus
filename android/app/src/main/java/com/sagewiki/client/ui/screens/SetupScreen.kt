package com.sagewiki.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SetupScreen(
    serverUrl: String, token: String, loading: Boolean, error: String?, showPassword: Boolean,
    onUrlChange: (String) -> Unit, onTokenChange: (String) -> Unit,
    onTogglePassword: () -> Unit, onConnect: () -> Unit
) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Default.Cloud, null, Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))
        Text("SageWiki", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text("Knowledge Base Client", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(32.dp))

        OutlinedTextField(
            value = serverUrl, onValueChange = onUrlChange,
            label = { Text("Server URL") },
            placeholder = { Text("https://your-server:8082") },
            modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !loading
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = token, onValueChange = onTokenChange,
            label = { Text("Bearer Token (optional)") },
            modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !loading,
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = onTogglePassword) {
                    Icon(if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Toggle")
                }
            }
        )

        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp) }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = onConnect,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            enabled = serverUrl.isNotBlank() && !loading
        ) {
            if (loading) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                Spacer(Modifier.width(8.dp)); Text("Connecting...")
            } else { Text("Connect") }
        }
    }
}