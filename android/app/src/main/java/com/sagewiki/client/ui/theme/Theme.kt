package com.sagewiki.client.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF1976D2),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFBBDEFB),
    secondary = Color(0xFF388E3C),
    onSecondary = Color.White,
    background = Color(0xFFF5F5F5),
    surface = Color.White,
    error = Color(0xFFD32F2F)
)

@Composable
fun SageWikiTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LightColors, content = content)
}