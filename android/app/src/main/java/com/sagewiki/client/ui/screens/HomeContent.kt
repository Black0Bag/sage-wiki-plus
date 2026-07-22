package com.sagewiki.client.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sagewiki.client.data.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileDetailView(article: ArticleResponse, loading: Boolean, onBack: () -> Unit, onDelete: (String) -> Unit) {
    var showDeleteDialog by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(article.path?.split("/")?.lastOrNull() ?: "Article", maxLines = 1) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back") } },
                actions = { IconButton(onClick = { showDeleteDialog = true }) { Icon(Icons.Default.Delete, "Delete") } }
            )
        }
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            if (loading) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            else {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                    article.frontmatter?.let { fm ->
                        if (fm.isNotEmpty()) {
                            Surface(Modifier.fillMaxWidth().padding(bottom = 16.dp), tonalElevation = 2.dp) {
                                Column(Modifier.padding(12.dp)) {
                                    Text("Metadata", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    fm.forEach { (k, v) -> Text("$k: $v", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                }
                            }
                        }
                    }
                    Text(article.body ?: "(empty)", lineHeight = 22.sp)
                }
            }
        }
    }
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete") }, text = { Text("Delete this article?") },
            confirmButton = { TextButton(onClick = { showDeleteDialog = false; onDelete(article.path ?: "") }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") } }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilesTab(sources: List<SourceInfo>, loading: Boolean, error: String?, status: StatusResponse?, onFileClick: (SourceInfo) -> Unit, onRefresh: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        status?.let { s ->
            FlowRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatChip("Entries ${s.entities}")
                StatChip("Vectors ${s.vectors}")
                StatChip("Relations ${s.relations}")
            }
            Divider()
        }
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.ErrorOutline, null, Modifier.size(48.dp))
                    Spacer(Modifier.height(8.dp)); Text(error, color = MaterialTheme.colorScheme.error)
                }
            }
            sources.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.FolderOpen, null, Modifier.size(48.dp))
                    Spacer(Modifier.height(8.dp)); Text("No files")
                }
            }
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(sources) { source ->
                    Surface(Modifier.fillMaxWidth().clickable { onFileClick(source) }) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Description, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(source.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(formatSize(source.size), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Divider(Modifier.padding(start = 52.dp))
                }
            }
        }
    }
}

@Composable
private fun StatChip(text: String) {
    Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.secondaryContainer, tonalElevation = 1.dp) {
        Text(text, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}

@Composable
fun StatusTab(status: StatusResponse?, loading: Boolean) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Server Status", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        if (loading) { CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally)) }
        else if (status != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    StatRow("Project", status.project ?: "-"); StatRow("Entries", "${status.entries}")
                    StatRow("Vectors", "${status.vectors}"); StatRow("Dimensions", "${status.dimensions}")
                    StatRow("Entities", "${status.entities}"); StatRow("Relations", "${status.relations}")
                }
            }
        } else { Text("No data", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
fun SettingsTab(config: ConfigResponse?, configLoading: Boolean, serverUrl: String, token: String, onLoadConfig: () -> Unit, onDisconnect: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Server Config", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Text("LLM", fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        if (configLoading) { CircularProgressIndicator() }
        else if (config != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    StatRow("Provider", config.llm?.provider ?: "-")
                    StatRow("Model", config.llm?.model ?: "-")
                }
            }
        } else { Text("No config", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Spacer(Modifier.height(16.dp))
        Text("Connection", fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                StatRow("URL", serverUrl)
                if (token.isNotBlank()) StatRow("Token", "${token.take(8)}...")
            }
        }
        Spacer(Modifier.height(32.dp))
        Button(onClick = onDisconnect, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error), modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Logout, null); Spacer(Modifier.width(8.dp)); Text("Disconnect")
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

private fun formatSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> "${"%.1f".format(bytes.toDouble() / (1024 * 1024))} MB"
}