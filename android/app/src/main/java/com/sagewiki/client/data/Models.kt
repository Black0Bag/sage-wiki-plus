package com.sagewiki.client.data

import com.google.gson.annotations.SerializedName

data class StatusResponse(
    val project: String? = null,
    val entries: Int = 0,
    val vectors: Int = 0,
    val dimensions: Int = 0,
    val entities: Int = 0,
    val relations: Int = 0
)

data class SourceListResponse(
    val sources: List<SourceInfo> = emptyList(),
    val total: Int = 0
)

data class SourceInfo(
    val name: String,
    val size: Long,
    @SerializedName("mod_time") val modTime: String
)

data class ArticleResponse(
    val path: String? = null,
    val frontmatter: Map<String, Any>? = null,
    val body: String? = null
)

data class ArticleWriteRequest(
    val path: String,
    val content: String,
    val message: String? = null
)

data class ArticleWriteResponse(
    val status: String? = null,
    val path: String? = null
)

data class ShareRequest(
    val title: String? = null,
    val text: String? = null,
    val url: String? = null,
    val source: String? = null
)

data class ConfigResponse(
    val project: String? = null,
    val output: String? = null,
    val llm: LlmConfig? = null,
    val embed: EmbedConfig? = null,
    val extras: Map<String, Any>? = null
)

data class LlmConfig(
    val provider: String? = null,
    val model: String? = null,
    val key: String? = null
)

data class EmbedConfig(
    val provider: String? = null,
    val model: String? = null
)

data class SimpleResponse(
    val status: String? = null,
    val message: String? = null
)