package com.sagewiki.client.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
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

    private fun buildUrl(path: String): String {
        val url = baseUrl.trimEnd('/')
        return "$url$path"
    }

    private fun Request.Builder.addAuth(): Request.Builder {
        if (!token.isNullOrBlank()) {
            addHeader("Authorization", "Bearer $token")
        }
        return this
    }

    private suspend fun <T> get(path: String, type: Class<T>): Result<T> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(buildUrl(path))
                .addAuth()
                .get()
                .build()
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (response.isSuccessful && body.isNotBlank()) {
                Result.success(gson.fromJson(body, type))
            } else if (response.isSuccessful) {
                Result.success(type.getDeclaredConstructor().newInstance())
            } else {
                Result.failure(IOException("HTTP ${response.code}: $body"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun <T> postJson(path: String, bodyObj: Any, type: Class<T>): Result<T> = withContext(Dispatchers.IO) {
        try {
            val json = gson.toJson(bodyObj)
            val request = Request.Builder()
                .url(buildUrl(path))
                .addAuth()
                .post(json.toRequestBody(jsonMedia))
                .build()
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (response.isSuccessful && body.isNotBlank()) {
                Result.success(gson.fromJson(body, type))
            } else if (response.isSuccessful) {
                Result.success(type.getDeclaredConstructor().newInstance())
            } else {
                Result.failure(IOException("HTTP ${response.code}: $body"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun putStr(path: String, bodyObj: Any): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val json = gson.toJson(bodyObj)
            val request = Request.Builder()
                .url(buildUrl(path))
                .addAuth()
                .put(json.toRequestBody(jsonMedia))
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val responseBody = response.body?.string() ?: ""
                Result.failure(IOException("HTTP ${response.code}: $responseBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun delete(path: String, queryParams: Map<String, String> = emptyMap()): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = buildUrl(path) + if (queryParams.isNotEmpty()) {
                "?" + queryParams.entries.joinToString("&") { "${it.key}=${it.value}" }
            } else ""
            val request = Request.Builder()
                .url(url)
                .addAuth()
                .delete()
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val responseBody = response.body?.string() ?: ""
                Result.failure(IOException("HTTP ${response.code}: $responseBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun putJson(path: String, bodyObj: Any, type: Class<*>): Result<Unit> {
        return putStr(path, bodyObj)
    }

    suspend fun health(): Result<SimpleResponse> {
        return get("/api/health", SimpleResponse::class.java)
    }

    suspend fun status(): Result<StatusResponse> {
        return get("/api/status", StatusResponse::class.java)
    }

    suspend fun listSources(): Result<SourceListResponse> {
        return get("/api/sources", SourceListResponse::class.java)
    }

    suspend fun getArticle(path: String): Result<ArticleResponse> {
        val cleanPath = path.removeSuffix(".md")
        return get("/api/articles/$cleanPath", ArticleResponse::class.java)
    }

    suspend fun writeArticle(path: String, content: String, message: String? = null): Result<ArticleWriteResponse> {
        return postJson("/api/article", ArticleWriteRequest(path, content, message), ArticleWriteResponse::class.java)
    }

    suspend fun deleteArticle(path: String): Result<Unit> {
        return delete("/api/article", mapOf("id" to path))
    }

    suspend fun getConfig(): Result<ConfigResponse> {
        return get("/api/config", ConfigResponse::class.java)
    }

    suspend fun updateConfig(config: Map<String, Any>): Result<Unit> {
        return putJson("/api/config", config, Any::class.java)
    }

    suspend fun share(title: String?, text: String?, url: String?): Result<SimpleResponse> {
        return postJson("/api/share", ShareRequest(title, text, url, "android-app"), SimpleResponse::class.java)
    }

    suspend fun compile(): Result<SimpleResponse> {
        return postJson("/api/compile", emptyMap<String, Any>(), SimpleResponse::class.java)
    }
}