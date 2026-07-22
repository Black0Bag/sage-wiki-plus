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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sagewiki.client.data.ArticleResponse
import com.sagewiki.client.viewmodel.AppState
import java.net.URLDecoder

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileDetailScreen(
    state: AppState,
    onBack: () -> Unit,
    onSave: (String, String) -> Unit,
    onDelete: (String) -> Unit
) {
    var editMode by remember { mutableStateOf(false) }
    var editedContent by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }

    val article = state.currentArticle
    val path = article?.path ?: ""
    val decodedPath = try { URLDecoder.decode(path, "UTF-8") } catch (e: Exception) { path }

    // Initialize editor content when article loads
    LaunchedEffect(article) {
        if (article != null) {
            editedContent = article.body ?: ""
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = decodedPath.split("/").lastOrNull() ?: "详情",
                        maxLines = 1,
                        fontSize = 16.sp
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (editMode) editMode = false else onBack()
                    }) {
                        Icon(if (editMode) Icons.Default.Close else Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    if (state.articleLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp))
                    } else if (editMode) {
                        IconButton(onClick = { onSave(decodedPath.removeSuffix(".md"), editedContent) }) {
                            Icon(Icons.Default.Save, contentDescription = "保存")
                        }
                    } else {
                        IconButton(onClick = {
                            editMode = true
                        }) {
                            Icon(Icons.Default.Edit, contentDescription = "编辑")
                        }
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, contentDescription = "删除")
                        }
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
        ) {
            // Frontmatter chips
            val fm = article?.frontmatter
            if (fm != null && fm.isNotEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    tonalElevation = 2.dp
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("元数据", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Spacer(Modifier.height(4.dp))
                        // Show keywords/concepts as chips
                        for ((key, value) in fm) {
                            if (key == "concept" || key == "aliases" || key == "tags") {
                                Row(
                                    modifier = Modifier.padding(vertical = 2.dp),
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text("$key:", fontSize = 12.sp, fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.primary)
                                    val strVal = value.toString()
                                    Text(strVal, fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        // Path
                        Text(
                            text = "📁 $decodedPath",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Content area
            if (state.articleLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (state.articleError != null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("加载失败: ${state.articleError}", color = MaterialTheme.colorScheme.error)
                }
            } else if (article == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("选择一篇文章查看")
                }
            } else {
                val scrollState = rememberScrollState()
                if (editMode) {
                    OutlinedTextField(
                        value = editedContent,
                        onValueChange = { editedContent = it },
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(8.dp),
                        textStyle = LocalTextStyle.current.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp
                        ),
                        maxLines = Int.MAX_VALUE
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(12.dp)
                    ) {
                        Text(
                            text = article.body ?: "(空内容)",
                            fontSize = 14.sp,
                            lineHeight = 22.sp
                        )
                    }
                }
            }

            // Save feedback
            if (state.articleSaved) {
                Snackbar(
                    modifier = Modifier.padding(8.dp),
                    action = {
                        TextButton(onClick = { onBack() }) { Text("返回") }
                    }
                ) {
                    Text("已保存 ✅")
                }
            }
        }
    }

    // Delete confirmation dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("确认删除") },
            text = { Text("确定要删除「$decodedPath」吗？此操作不可恢复。") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    onDelete(decodedPath)
                }) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("取消")
                }
            }
        )
    }

    // Auto-navigate back after delete
    LaunchedEffect(state.articleDeleted) {
        if (state.articleDeleted) onBack()
    }
}
