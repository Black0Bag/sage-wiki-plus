package com.sagewiki.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
fun ServerScreen(
    state: AppState,
    onLoadConfig: () -> Unit,
    onUpdateConfig: (Map<String, Any>) -> Unit,
    onBack: () -> Unit
) {
    var editLlm by remember { mutableStateOf(false) }
    var llmProvider by remember { mutableStateOf("") }
    var llmModel by remember { mutableStateOf("") }

    LaunchedEffect(state.config) {
        if (state.config != null) {
            llmProvider = state.config.llm?.provider ?: ""
            llmModel = state.config.llm?.model ?: ""
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("服务器管理") },
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
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Status section
            Text("服务器状态", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            if (state.statusLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else if (state.status != null) {
                val s = state.status
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        StatRow("项目", s.project ?: "-")
                        StatRow("知识条目", "${s.entries}")
                        StatRow("向量数", "${s.vectors}")
                        StatRow("向量维度", "${s.dimensions}")
                        StatRow("实体", "${s.entities}")
                        StatRow("关系", "${s.relations}")
                    }
                }
            } else {
                TextButton(onClick = onLoadConfig) { Text("加载服务器信息") }
            }

            Spacer(Modifier.height(24.dp))

            // LLM Config
            Text("LLM 配置", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            if (state.configLoading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else if (state.config != null) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        if (editLlm) {
                            OutlinedTextField(
                                value = llmProvider,
                                onValueChange = { llmProvider = it },
                                label = { Text("LLM Provider") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = llmModel,
                                onValueChange = { llmModel = it },
                                label = { Text("LLM Model") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { editLlm = false }) {
                                    Text("取消")
                                }
                                Button(onClick = {
                                    val cfg = mapOf<String, Any>(
                                        "llm" to mapOf(
                                            "provider" to llmProvider,
                                            "model" to llmModel
                                        )
                                    )
                                    onUpdateConfig(cfg)
                                    editLlm = false
                                }) {
                                    Text("保存")
                                }
                            }
                        } else {
                            StatRow("Provider", state.config.llm?.provider ?: "-")
                            StatRow("Model", state.config.llm?.model ?: "-")
                            TextButton(onClick = { editLlm = true }) { Text("修改") }
                        }
                    }
                }
            } else {
                TextButton(onClick = onLoadConfig) { Text("加载配置") }
            }

            Spacer(Modifier.height(24.dp))

            // Actions
            Text("操作", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            Button(
                onClick = {
                    onUpdateConfig(mapOf("compile" to true))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Build, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("触发知识库编译")
            }

            if (state.configSaved) {
                Spacer(Modifier.height(8.dp))
                Text("配置已保存 ✅", color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}
