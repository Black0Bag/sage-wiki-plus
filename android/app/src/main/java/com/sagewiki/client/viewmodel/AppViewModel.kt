package com.sagewiki.client.viewmodel

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.sagewiki.client.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AppState(
    val serverUrl: String = "",
    val token: String = "",
    val isConfigured: Boolean = false,
    val isConnected: Boolean = false,
    val connecting: Boolean = false,
    val connectionError: String? = null,

    // Server data
    val sources: List<SourceInfo> = emptyList(),
    val sourcesLoading: Boolean = false,
    val sourcesError: String? = null,

    // Article detail
    val currentArticle: ArticleResponse? = null,
    val articleLoading: Boolean = false,
    val articleError: String? = null,
    val articleSaving: Boolean = false,
    val articleSaved: Boolean = false,
    val articleDeleted: Boolean = false,

    // Server config
    val config: ConfigResponse? = null,
    val configLoading: Boolean = false,
    val configSaving: Boolean = false,
    val configSaved: Boolean = false,

    // Server status
    val status: StatusResponse? = null,
    val statusLoading: Boolean = false,

    // Share
    val shareProcessing: Boolean = false,
    val shareResult: String? = null,

    // App
    val api: SageWikiApi? = null,
    val appVersion: String = "1.0.0"
)

class AppViewModel : ViewModel() {
    private val _state = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = _state.asStateFlow()

    private lateinit var prefs: SharedPreferences
    private val gson = Gson()

    fun init(context: Context) {
        prefs = context.getSharedPreferences("sagewiki_prefs", Context.MODE_PRIVATE)
        // Load saved config
        val savedUrl = prefs.getString("server_url", "") ?: ""
        val savedToken = prefs.getString("bearer_token", "") ?: ""
        if (savedUrl.isNotBlank()) {
            val api = SageWikiApi(savedUrl, savedToken.ifBlank { null })
            _state.value = _state.value.copy(
                serverUrl = savedUrl,
                token = savedToken,
                isConfigured = true,
                api = api
            )
            connect()
        }
    }

    private fun savePrefs() {
        prefs.edit().apply {
            putString("server_url", _state.value.serverUrl)
            putString("bearer_token", _state.value.token)
            apply()
        }
    }

    fun setServerUrl(url: String) {
        _state.value = _state.value.copy(serverUrl = url.trim())
    }

    fun setToken(token: String) {
        _state.value = _state.value.copy(token = token.trim())
    }

    fun connect() {
        val url = _state.value.serverUrl
        if (url.isBlank()) {
            _state.value = _state.value.copy(connectionError = "请输入服务器地址")
            return
        }
        val api = SageWikiApi(url, _state.value.token.ifBlank { null })
        _state.value = _state.value.copy(api = api, connecting = true, connectionError = null)

        viewModelScope.launch {
            val result = api.health()
            result.onSuccess {
                _state.value = _state.value.copy(
                    isConfigured = true,
                    isConnected = true,
                    connecting = false,
                    connectionError = null
                )
                savePrefs()
                loadSources()
                loadStatus()
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    connecting = false,
                    connectionError = "连接失败: ${e.message}"
                )
            }
        }
    }

    fun loadSources() {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(sourcesLoading = true, sourcesError = null)

        viewModelScope.launch {
            api.listSources().onSuccess { resp ->
                _state.value = _state.value.copy(
                    sources = resp.sources,
                    sourcesLoading = false
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    sourcesLoading = false,
                    sourcesError = e.message
                )
            }
        }
    }

    fun loadArticle(path: String) {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(
            articleLoading = true, articleError = null,
            articleSaved = false, articleDeleted = false,
            currentArticle = null
        )

        viewModelScope.launch {
            api.getArticle(path).onSuccess { article ->
                _state.value = _state.value.copy(
                    currentArticle = article,
                    articleLoading = false
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    articleLoading = false,
                    articleError = e.message
                )
            }
        }
    }

    fun saveArticle(path: String, content: String) {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(articleSaving = true, articleSaved = false)

        viewModelScope.launch {
            api.writeArticle(path, content).onSuccess {
                _state.value = _state.value.copy(articleSaving = false, articleSaved = true)
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    articleSaving = false,
                    articleError = "保存失败: ${e.message}"
                )
            }
        }
    }

    fun deleteArticle(path: String) {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(articleSaving = true)

        viewModelScope.launch {
            api.deleteArticle(path.removeSuffix(".md")).onSuccess {
                _state.value = _state.value.copy(
                    articleSaving = false,
                    articleDeleted = true,
                    currentArticle = null
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    articleSaving = false,
                    articleError = "删除失败: ${e.message}"
                )
            }
        }
    }

    fun loadConfig() {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(configLoading = true)

        viewModelScope.launch {
            api.getConfig().onSuccess { cfg ->
                _state.value = _state.value.copy(
                    config = cfg, configLoading = false
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    configLoading = false,
                    connectionError = "获取配置失败: ${e.message}"
                )
            }
        }
    }

    fun updateConfig(config: Map<String, Any>) {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(configSaving = true, configSaved = false)

        viewModelScope.launch {
            api.updateConfig(config).onSuccess {
                _state.value = _state.value.copy(configSaving = false, configSaved = true)
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    configSaving = false,
                    connectionError = "保存配置失败: ${e.message}"
                )
            }
        }
    }

    fun loadStatus() {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(statusLoading = true)

        viewModelScope.launch {
            api.status().onSuccess { s ->
                _state.value = _state.value.copy(status = s, statusLoading = false)
            }.onFailure {
                _state.value = _state.value.copy(statusLoading = false)
            }
        }
    }

    fun shareContent(title: String?, text: String?, url: String?) {
        val api = _state.value.api ?: return
        _state.value = _state.value.copy(shareProcessing = true, shareResult = null)

        viewModelScope.launch {
            api.share(title, text, url).onSuccess {
                _state.value = _state.value.copy(
                    shareProcessing = false,
                    shareResult = "已分享到知识库 ✅"
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    shareProcessing = false,
                    shareResult = "分享失败: ${e.message}"
                )
            }
        }
    }

    fun clearShareResult() {
        _state.value = _state.value.copy(shareResult = null)
    }

    fun resetArticleStates() {
        _state.value = _state.value.copy(
            articleSaved = false,
            articleDeleted = false,
            articleError = null
        )
    }

    fun logout() {
        prefs.edit().clear().apply()
        _state.value = AppState()
    }
}
