package io.kplayer.android.data

import android.net.Uri

enum class AndroidTab { HOME, MUSIC, IPTV, RADIO, FOOTBALL }

enum class RepeatMode { OFF, ONE, ALL }

enum class VideoFit(val label: String) {
    CONTAIN("Conter"),
    COVER("Preencher"),
    ORIGINAL("Original"),
}

enum class EqPreset(val label: String, val gainsMb: IntArray) {
    OFF("Desligado", intArrayOf(0, 0, 0, 0, 0)),
    BASS("Grave", intArrayOf(600, 400, 0, -100, -100)),
    VOICE("Voz", intArrayOf(-200, 100, 450, 350, -100)),
    ROCK("Rock", intArrayOf(450, 200, -100, 250, 450)),
    SOFT("Suave", intArrayOf(200, 100, 0, 100, 200)),
}

enum class IptvSource(val slug: String, val label: String) {
    CANAIS("canais", "Canais"),
    FILMES("filmes", "Filmes"),
    SERIES("series", "Séries"),
    USUARIO("usuario", "Usuário"),
}

data class LrcLine(
    val timeMs: Long,
    val text: String,
)

data class AudioTrack(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val durationMs: Long,
    val uri: Uri,
    val artUri: Uri? = null,
    val format: String = "MP3",
    val sizeBytes: Long = 0L,
    val folderName: String = "Músicas",
    val lrcLines: List<LrcLine> = emptyList(),
)

data class VideoItem(
    val id: String,
    val title: String,
    val durationMs: Long,
    val uri: Uri,
    val sizeBytes: Long = 0L,
    val folderName: String = "Vídeos",
)

data class RadioStation(
    val id: String,
    val name: String,
    val url: String,
    val country: String = "Brasil",
    val tags: String = "",
    val codec: String = "MP3",
    val bitrate: Int = 128,
    val favicon: String = "",
    val isUser: Boolean = false,
)

data class IptvCategory(
    val id: String,
    val name: String,
    val count: Int,
)

data class IptvChannel(
    val id: String,
    val name: String,
    val url: String,
    val group: String = "",
    val logo: String = "",
    val mediaType: String = "live", // live | movie | series | episode
    val year: String = "",
    val rating: String = "",
    val synopsis: String = "",
    val seriesLetter: String = "",
    val seriesShard: String = "",
    val season: Int = 0,
    val episode: Int = 0,
)

data class FootballMatch(
    val id: String,
    val league: String,
    val region: String, // br | eu | intl
    val home: String,
    val away: String,
    val homeScore: String,
    val awayScore: String,
    val status: String,
    val state: String, // live | pre | post
    val timeLabel: String = "",
)

data class MatchStatRow(
    val label: String,
    val home: String,
    val away: String,
)

data class MatchEventRow(
    val minute: String,
    val team: String,
    val player: String,
    val detail: String,
)

data class MatchDetail(
    val venue: String = "",
    val stats: List<MatchStatRow> = emptyList(),
    val events: List<MatchEventRow> = emptyList(),
    val homeLineup: List<String> = emptyList(),
    val awayLineup: List<String> = emptyList(),
)

data class TermsPage(
    val title: String,
    val body: String,
)

val KPLAYER_TERMS_PAGES = listOf(
    TermsPage(
        title = "1. Sobre o KPlayer e Reprodução Local",
        body = "O KPlayer v2.0.3 (edições R36S e Android) é um reprodutor independente de mídia local e streams de rede. Ele reproduz seus arquivos de áudio e vídeo diretamente do dispositivo com letras sincronizadas (.LRC), equalizador e fila sem envio de arquivos pessoais para servidores externos.",
    ),
    TermsPage(
        title = "2. Fontes Abertas e Agregadores (IPTV e Rádio)",
        body = "Todos os dados, listas e metadados de IPTV e Rádio Online exibidos no KPlayer são retirados de agregadores públicos da internet ou de fontes abertas (como o diretório Radio-Browser e catálogos web públicos). O KPlayer atua exclusivamente como reprodutor e não hospeda, armazena nem transmite conteúdo próprio.",
    ),
    TermsPage(
        title = "3. Direito de Usar Seu Próprio Link",
        body = "Com total transparência ao usuário, você tem o direito e a liberdade de inserir seus próprios links e playlists a qualquer momento — adicionando URLs .m3u/.m3u8 diretamente na aba IPTV do Usuário ou importando arquivos locais de rádio e IPTV.",
    ),
    TermsPage(
        title = "4. Licenças e Privacidade",
        body = "Código original distribuído sob GPL-2.0-or-later. O aplicativo não exige conta, não coleta telemetria comercial e não exibe anúncios. Rádio Online, IPTV e Placar da Bola requerem conexão com a internet e dependem da disponibilidade das fontes públicas externas.",
    ),
)
