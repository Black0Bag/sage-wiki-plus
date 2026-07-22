package com.sagewiki.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sagewiki.client.viewmodel.AppState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: AppState,
    onServerUrlChange: (String) -> Unit,
    onTokenChange: (String) -> Unit,
    onReconnect: () -> Unit,
    onLogout: () -> Unit,
    onBack: () -> Unit
) {
    var editUrl by remember { mutableStateOf(state.serverUrl) }
    var editToken by remember { mutableStateOf(state.token) }

    LaunchedEffect(state.serverUrl) { editUrl = state.serverUrl }
    LaunchedEffect(state.token) { editToken = state.token }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("App 设置") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Server connection
            Text("服务器连接", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = editUrl,
                        onValueChange = { editUrl = it; onServerUrlChange(it) },
                        label = { Text("服务器地址") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = editToken,
                        onValueChange = { editToken = it; onTokenChange(it) },
                        label = { Text("Bearer Token") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onReconnect,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = editUrl.isNotBlank() && !state.connecting
                    ) {
                        if (state.connecting) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("重新连接")
                        }
                    }

                    if (state.isConnected) {
                        Spacer(Modifier.height(8.dp))
                        Surface(color = MaterialTheme.colorScheme.tertiaryContainer,
                            shape = MaterialTheme.shapes.small) {
                            Text(
                                "✅ 已连接到服务器",
                                modifier = Modifier.padding(8.dp),
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // App info
            Text("关于", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    SettingsRow("应用版本", state.appVersion)
                    SettingsRow("API", "REST (8082)")
                }
            }

            Spacer(Modifier.height(32.dp))

            // Logout
            OutlinedButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.error
                )
            ) {
                Icon(Icons.Default.Logout, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("退出登录（清除配置）")
            }
        }
    }
}

@Composable
private fun SettingsRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}
