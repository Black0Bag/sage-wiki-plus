package com.sagewiki.client.data

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class SageWikiApi(
    private val baseUrl: String,
    private val token: String? = null
) {
    private val gson = Gson()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun buildUrl(path: String): String = "${baseUrl.trimEnd('/')}$path"
    private fun Request.Builder.addAuth(): Request.Builder {
        if (!token.isNullOrBlank()) addHeader("Authorization", "Bearer $token")
        return this
    }

    private suspend fun <T> get(path: String, type: Class<T>): Result<T> = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(buildUrl(path)).addAuth().get().build()
            val resp = client.newCall(req).execute()
            val body = resp.body?.string() ?: ""
            if (resp.isSuccessful && body.isNotBlank()) {
                Result.success(gson.fromJson(body, type))
            } else if (resp.isSuccessful) {
                @Suppress("UNCHECKED_CAST")
                Result.success(type.getDeclaredConstructor().newInstance() as T)
            } else {
                Result.failure(Exception("HTTP ${resp.code}: ${body.take(200)}"))
            }
        } catch (e: Exception) { Result.failure(e) }
    }

    suspend fun health(): Result<SimpleResponse> = get("/api/health", SimpleResponse::class.java)
    suspend fun status(): Result<StatusResponse> = get("/api/status", StatusResponse::class.java)
    suspend fun listSources(): Result<SourceListResponse> = get("/api/sources", SourceListResponse::class.java)
    suspend fun getArticle(path: String): Result<ArticleResponse> = get("/api/articles/${path.removeSuffix(".md")}", ArticleResponse::class.java)
    suspend fun getConfig(): Result<ConfigResponse> = get("/api/config", ConfigResponse::class.java)

    suspend fun deleteArticle(path: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = buildUrl("/api/article?id=${java.net.URLEncoder.encode(path, "UTF-8")}")
            val req = Request.Builder().url(url).addAuth().delete().build()
            val resp = client.newCall(req).execute()
            if (resp.isSuccessful) Result.success(Unit)
            else Result.failure(Exception("HTTP ${resp.code}"))
        } catch (e: Exception) { Result.failure(e) }
    }
}