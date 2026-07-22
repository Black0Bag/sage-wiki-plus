package com.sagewiki.client

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.sagewiki.client.data.*
import com.sagewiki.client.ui.screens.*
import com.sagewiki.client.ui.theme.SageWikiTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { SageWikiTheme { SageWikiApp() } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SageWikiApp() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("sage_wiki", Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf(prefs.getString("url", "") ?: "") }
    var token by remember { mutableStateOf(prefs.getString("token", "") ?: "") }
    var isConfigured by remember { mutableStateOf(prefs.getBoolean("configured", false)) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<StatusResponse?>(null) }
    var sources by remember { mutableStateOf<List<SourceInfo>>(emptyList()) }
    var currentArticle by remember { mutableStateOf<ArticleResponse?>(null) }
    var articleLoading by remember { mutableStateOf(false) }
    var config by remember { mutableStateOf<ConfigResponse?>(null) }
    var configLoaded by remember { mutableStateOf(false) }
    var showDetail by remember { mutableStateOf(false) }
    var showPassword by remember { mutableStateOf(false) }
    var refreshTrigger by remember { mutableStateOf(0) }
    var tab by remember { mutableStateOf(0) }

    val api = remember(serverUrl.trim(), token) {
        SageWikiApi(serverUrl.trim(), token.ifBlank { null })
    }

    LaunchedEffect(isConfigured, refreshTrigger) {
        if (isConfigured) {
            loading = true; error = null
            api.status().onSuccess { status = it }
            api.listSources().onSuccess { resp -> sources = resp.sources }
            loading = false
        }
    }

    if (!isConfigured) {
        SetupScreen(serverUrl, token, loading, error, showPassword,
            onUrlChange = { serverUrl = it },
            onTokenChange = { token = it },
            onTogglePassword = { showPassword = !showPassword },
            onConnect = {
                loading = true; error = null
                scope.launch {
                    api.health().onSuccess { resp ->
                        if (resp.status == "ok") {
                            prefs.edit().putString("url", serverUrl.trim()).putString("token", token).putBoolean("configured", true).apply()
                            isConfigured = true
                        } else error = "Server: ${resp.message}"
                    }.onFailure { e -> error = e.localizedMessage ?: "Connection failed" }
                    loading = false
                }
            }
        )
        return
    }

    if (showDetail && currentArticle != null) {
        FileDetailView(article = currentArticle!!, loading = articleLoading,
            onBack = { showDetail = false; currentArticle = null; refreshTrigger++ },
            onDelete = { path ->
                scope.launch {
                    api.deleteArticle(path).onSuccess { showDetail = false; currentArticle = null; refreshTrigger++ }
                        .onFailure { e -> error = e.message }
                }
            }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("SageWiki") },
                actions = { IconButton(onClick = { refreshTrigger++ }) { Icon(Icons.Default.Refresh, "Refresh") } }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(icon = { Icon(Icons.Default.Description, null) }, label = { Text("Files") }, selected = tab == 0, onClick = { tab = 0 })
                NavigationBarItem(icon = { Icon(Icons.Default.Info, null) }, label = { Text("Status") }, selected = tab == 1, onClick = { tab = 1 })
                NavigationBarItem(icon = { Icon(Icons.Default.Settings, null) }, label = { Text("Settings") }, selected = tab == 2, onClick = { tab = 2 })
            }
        }
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when (tab) {
                0 -> FilesTab(sources, loading, error, status,
                    onFileClick = { source ->
                        articleLoading = true; showDetail = true; currentArticle = null
                        scope.launch { api.getArticle(source.name).onSuccess { a -> currentArticle = a }.onFailure { e -> error = e.message }; articleLoading = false }
                    },
                    onRefresh = { refreshTrigger++ }
                )
                1 -> StatusTab(status, loading)
                2 -> SettingsTab(config, false, serverUrl, token,
                    onLoadConfig = {
                        if (!configLoaded) { configLoaded = true
                            scope.launch { api.getConfig().onSuccess { config = it } }
                        }
                    },
                    onDisconnect = {
                        prefs.edit().clear().apply()
                        isConfigured = false; serverUrl = ""; token = ""
                        status = null; sources = emptyList(); config = null; error = null; configLoaded = false
                    }
                )
            }
        }
    }
}