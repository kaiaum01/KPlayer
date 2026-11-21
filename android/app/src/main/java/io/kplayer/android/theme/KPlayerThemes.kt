package io.kplayer.android.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

data class KPlayerThemePalette(
    val id: String,
    val name: String,
    val isLight: Boolean,
    val bg: Color,
    val panel: Color,
    val elevated: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val dim: Color,
)

val KPLAYER_THEMES = listOf(
    KPlayerThemePalette(
        id = "black-green",
        name = "Preto e verde",
        isLight = false,
        bg = Color(0xFF0E1013),
        panel = Color(0xFF16191F),
        elevated = Color(0xFF20252E),
        text = Color(0xFFFFFFFF),
        muted = Color(0xFFAAB2C0),
        accent = Color(0xFF1DB954),
        dim = Color(0xFF7D8696),
    ),
    KPlayerThemePalette(
        id = "black-white",
        name = "Preto e branco",
        isLight = false,
        bg = Color(0xFF0C0C0E),
        panel = Color(0xFF18181C),
        elevated = Color(0xFF26262C),
        text = Color(0xFFFFFFFF),
        muted = Color(0xFFB8B8C0),
        accent = Color(0xFFF5F5F5),
        dim = Color(0xFF8A8A94),
    ),
    KPlayerThemePalette(
        id = "white-black",
        name = "Branco e preto",
        isLight = true,
        bg = Color(0xFFF7F7F8),
        panel = Color(0xFFECEEEF),
        elevated = Color(0xFFE0E3E7),
        text = Color(0xFF141619),
        muted = Color(0xFF4B525E),
        accent = Color(0xFF181B20),
        dim = Color(0xFF6B7280),
    ),
    KPlayerThemePalette(
        id = "green-black",
        name = "Verde e preto",
        isLight = true,
        bg = Color(0xFF85DA96),
        panel = Color(0xFFA6E7B3),
        elevated = Color(0xFFBEEFC7),
        text = Color(0xFF0C2312),
        muted = Color(0xFF204E2B),
        accent = Color(0xFF0A2D14),
        dim = Color(0xFF275B32),
    ),
    KPlayerThemePalette(
        id = "black-blue",
        name = "Preto e azul",
        isLight = false,
        bg = Color(0xFF0B111D),
        panel = Color(0xFF131D2E),
        elevated = Color(0xFF1F2D44),
        text = Color(0xFFF5F9FF),
        muted = Color(0xFFB2C1D4),
        accent = Color(0xFF66B6FF),
        dim = Color(0xFF879BB3),
    ),
    KPlayerThemePalette(
        id = "black-purple",
        name = "Preto e roxo",
        isLight = false,
        bg = Color(0xFF140D1C),
        panel = Color(0xFF21162E),
        elevated = Color(0xFF322343),
        text = Color(0xFFFCF5FF),
        muted = Color(0xFFCCBBD7),
        accent = Color(0xFFD399FF),
        dim = Color(0xFFA08CB2),
    ),
    KPlayerThemePalette(
        id = "black-red",
        name = "Preto e vermelho",
        isLight = false,
        bg = Color(0xFF160D0E),
        panel = Color(0xFF251617),
        elevated = Color(0xFF392224),
        text = Color(0xFFFFF6F6),
        muted = Color(0xFFDAB9B9),
        accent = Color(0xFFFF7A7A),
        dim = Color(0xFFB38E8E),
    ),
)

@Composable
fun KPlayerAndroidTheme(
    palette: KPlayerThemePalette,
    content: @Composable () -> Unit,
) {
    val scheme = if (palette.isLight) {
        lightColorScheme(
            primary = palette.accent,
            onPrimary = palette.bg,
            background = palette.bg,
            onBackground = palette.text,
            surface = palette.panel,
            onSurface = palette.text,
            surfaceVariant = palette.elevated,
            onSurfaceVariant = palette.muted,
        )
    } else {
        darkColorScheme(
            primary = palette.accent,
            onPrimary = palette.bg,
            background = palette.bg,
            onBackground = palette.text,
            surface = palette.panel,
            onSurface = palette.text,
            surfaceVariant = palette.elevated,
            onSurfaceVariant = palette.muted,
        )
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
