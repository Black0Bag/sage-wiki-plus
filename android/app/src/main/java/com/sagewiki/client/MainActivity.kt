package com.sagewiki.client

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.sagewiki.client.ui.theme.SageWikiTheme
import com.sagewiki.client.ui.screens.*
import com.sagewiki.client.viewmodel.AppViewModel
import kotlinx.coroutines.launch
import java.net.URLEncoder

class MainActivity : ComponentActivity() {
    private lateinit var viewModel: AppViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        viewModel = ViewModelProvider(this)[AppViewModel::class.java]
        viewModel.init(applicationContext)

        // Handle incoming share intent
        handleShareIntent(intent)

        setContent {
            SageWikiTheme {
                MainContent(viewModel = viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShareIntent(intent)
    }

    private fun handleShareIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND) {
            val type = intent.type
            when {
                type?.startsWith("text/plain") == true -> {
                    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                    val sharedTitle = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: "来自分享"
                    if (sharedText != null) {
                        viewModel.shareContent(sharedTitle, sharedText, null)
                    }
                }
                type?.startsWith("image/") == true -> {
                    // Image sharing - we'll handle this in future updates
                    Toast.makeText(this, "图片分享正在开发中", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainContent(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    // Share result notification
    LaunchedEffect(state.shareResult) {
        state.shareResult?.let {
            if (it.startsWith("✅")) {
                viewModel.clearShareResult()
            }
        }
    }

    if (!state.isConfigured) {
        // First launch - setup screen
        SetupScreen(
            state = state,
            onServerUrlChange = { viewModel.setServerUrl(it) },
            onTokenChange = { viewModel.setToken(it) },
            onConnect = { viewModel.connect() }
        )
    } else {
        // Main app with navigation
        ModalNavigationDrawer(
            drawerState = drawerState,
            drawerContent = {
                ModalDrawerSheet {
                    Spacer(Modifier.height(NavigationDrawerItemDefaults.ItemPadding.calculateTopPadding()))
                    Text(
                        "SageWiki",
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        modifier = Modifier.padding(16.dp)
                    )
                    Divider()

                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Folder, contentDescription = null) },
                        label = { Text("源文件列表") },
                        selected = true,
                        onClick = {
                            navController.navigate("files") {
                                popUpTo("files") { inclusive = true }
                            }
                            scope.launch { drawerState.close() }
                        }
                    )
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                        label = { Text("服务器管理") },
                        selected = false,
                        onClick = {
                            navController.navigate("server")
                            scope.launch { drawerState.close() }
                        }
                    )
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Default.Tune, contentDescription = null) },
                        label = { Text("App 设置") },
                        selected = false,
                        onClick = {
                            navController.navigate("settings")
                            scope.launch { drawerState.close() }
                        }
                    )
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    Text(
                        "v${state.appVersion}",
                        fontSize = 12.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        ) {
            NavHost(
                navController = navController,
                startDestination = "files"
            ) {
                composable("files") {
                    FileListScreen(
                        state = state,
                        onFileClick = { name ->
                            val encoded = URLEncoder.encode(name, "UTF-8")
                            navController.navigate("article/$encoded")
                        },
                        onRefresh = { viewModel.loadSources(); viewModel.loadStatus() },
                        onOpenDrawer = { scope.launch { drawerState.open() } }
                    )
                }
                composable(
                    "article/{name}",
                    arguments = listOf(navArgument("name") { type = NavType.StringType })
                ) { backStackEntry ->
                    val name = backStackEntry.arguments?.getString("name") ?: ""
                    LaunchedEffect(name) {
                        viewModel.loadArticle(name)
                    }
                    FileDetailScreen(
                        state = state,
                        onBack = { navController.popBackStack() },
                        onSave = { path, content -> viewModel.saveArticle(path, content) },
                        onDelete = { path -> viewModel.deleteArticle(path) }
                    )
                }
                composable("server") {
                    ServerScreen(
                        state = state,
                        onLoadConfig = { viewModel.loadConfig() },
                        onUpdateConfig = { viewModel.updateConfig(it) },
                        onBack = { navController.popBackStack() }
                    )
                }
                composable("settings") {
                    SettingsScreen(
                        state = state,
                        onServerUrlChange = { viewModel.setServerUrl(it) },
                        onTokenChange = { viewModel.setToken(it) },
                        onReconnect = { viewModel.connect() },
                        onLogout = {
                            viewModel.logout()
                            navController.navigate("files") { popUpTo(0) { inclusive = true } }
                        },
                        onBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}
