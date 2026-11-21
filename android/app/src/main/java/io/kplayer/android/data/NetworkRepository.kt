package io.kplayer.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object NetworkRepository {
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(18, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private const val UA = "KPlayer-Android/2.0.2"
    private const val CANAIS_BASE = "https://canais-saimo.pages.dev"
    private const val FILMES_BASE = "https://filmes-saimo.pages.dev"

    private val RADIO_MIRRORS = listOf(
        "https://de1.api.radio-browser.info",
        "https://nl1.api.radio-browser.info",
        "https://at1.api.radio-browser.info",
    )

    private var cachedLiveChannels: List<IptvChannel>? = null

    private fun fetchText(url: String, referer: String? = null): String? {
        val builder = Request.Builder()
            .url(url)
            .header("User-Agent", UA)
        if (!referer.isNullOrBlank()) {
            builder.header("Referer", referer)
        }
        return runCatching {
            client.newCall(builder.build()).execute().use { resp ->
                if (!resp.isSuccessful) return null
                resp.body?.string()
            }
        }.getOrNull()
    }

    // ==================== ONLINE RADIO (Radio-Browser Open Directory) ====================

    suspend fun fetchRadioStations(category: String): List<RadioStation> = withContext(Dispatchers.IO) {
        val path = when (category) {
            "Brasil" -> "/json/stations/bycountrycodeexact/BR?limit=60&order=clickcount&reverse=true&hidebroken=true"
            "Mais ouvidas" -> "/json/stations/topclick/60?hidebroken=true"
            "Pop" -> "/json/stations/bytag/pop?limit=60&order=clickcount&reverse=true&hidebroken=true"
            "Rock" -> "/json/stations/bytag/rock?limit=60&order=clickcount&reverse=true&hidebroken=true"
            "Notícias" -> "/json/stations/bytag/news?limit=60&order=clickcount&reverse=true&hidebroken=true"
            else -> "/json/stations/bycountrycodeexact/BR?limit=60&order=clickcount&reverse=true&hidebroken=true"
        }

        for (mirror in RADIO_MIRRORS) {
            val body = fetchText("$mirror$path") ?: continue
            val arr = runCatching { JSONArray(body) }.getOrNull() ?: continue
            val stations = mutableListOf<RadioStation>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val streamUrl = o.optString("url_resolved").ifBlank { o.optString("url") }.trim()
                if (!streamUrl.startsWith("http://") && !streamUrl.startsWith("https://")) continue
                stations.add(
                    RadioStation(
                        id = o.optString("stationuuid").ifBlank { "radio-$i" },
                        name = o.optString("name").trim().ifBlank { "Rádio ${i + 1}" },
                        url = streamUrl,
                        country = o.optString("country").ifBlank { "Internacional" },
                        tags = o.optString("tags"),
                        codec = o.optString("codec").ifBlank { "STREAM" },
                        bitrate = o.optInt("bitrate", 128),
                        favicon = o.optString("favicon"),
                    ),
                )
            }
            if (stations.isNotEmpty()) return@withContext stations
        }
        emptyList()
    }

    // ==================== IPTV (UNLOCKED & CATEGORY-BY-CATEGORY) ====================

    private fun loadAllLiveChannels(forceRefresh: Boolean = false): List<IptvChannel> {
        if (!forceRefresh && !cachedLiveChannels.isNullOrEmpty()) return cachedLiveChannels!!
        val combined = linkedMapOf<String, IptvChannel>()

        val catRaw = fetchText("$CANAIS_BASE/catalogo.txt", "$CANAIS_BASE/")
        if (!catRaw.isNullOrBlank()) {
            MediaScanner.parseM3uPlaylist(catRaw, "TV ao Vivo").forEach { ch ->
                combined[ch.name.lowercase()] = ch
            }
        }
        val reserveRaw = fetchText("$CANAIS_BASE/canais.txt", "$CANAIS_BASE/")
        if (!reserveRaw.isNullOrBlank()) {
            MediaScanner.parseM3uPlaylist(reserveRaw, "Reservas").forEach { ch ->
                val key = ch.name.lowercase()
                if (!combined.containsKey(key)) combined[key] = ch
            }
        }

        val list = combined.values.toList()
        if (list.isNotEmpty()) cachedLiveChannels = list
        return list
    }

    suspend fun fetchIptvCategories(
        source: IptvSource,
        userPlaylists: Map<String, List<IptvChannel>>,
        forceRefresh: Boolean = false,
    ): List<IptvCategory> = withContext(Dispatchers.IO) {
        when (source) {
            IptvSource.CANAIS -> {
                val all = loadAllLiveChannels(forceRefresh)
                val grouped = all.groupBy { it.group.ifBlank { "Geral" } }
                val cats = mutableListOf(IptvCategory("all", "Todos os Canais", all.size))
                grouped.entries.sortedByDescending { it.value.size }.forEach { (grp, items) ->
                    cats.add(IptvCategory("grp:$grp", grp, items.size))
                }
                cats
            }

            IptvSource.FILMES -> {
                val idxJson = fetchText("$FILMES_BASE/dados/filmes/index.json", "$FILMES_BASE/")
                    ?: return@withContext emptyList()
                val obj = runCatching { JSONObject(idxJson) }.getOrNull() ?: return@withContext emptyList()
                val cats = mutableListOf<IptvCategory>()
                val genres = obj.optJSONObject("generos") ?: obj.optJSONObject("categorias")
                if (genres != null) {
                    val keys = genres.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        val cnt = genres.optInt(k, 0)
                        cats.add(IptvCategory("genre:$k", k, cnt))
                    }
                }
                if (cats.isEmpty()) {
                    ('A'..'Z').forEach { ch ->
                        cats.add(IptvCategory("letter:$ch", "Filmes — Letra $ch", 0))
                    }
                }
                cats.sortedBy { it.name }
            }

            IptvSource.SERIES -> {
                val letters = listOf("#") + ('A'..'Z').map { it.toString() }
                letters.map { l -> IptvCategory("series:$l", "Séries — $l", 0) }
            }

            IptvSource.USUARIO -> {
                userPlaylists.map { (name, items) ->
                    IptvCategory("user:$name", name, items.size)
                }
            }
        }
    }

    suspend fun fetchIptvItems(
        source: IptvSource,
        categoryId: String,
        userPlaylists: Map<String, List<IptvChannel>>,
    ): List<IptvChannel> = withContext(Dispatchers.IO) {
        when (source) {
            IptvSource.CANAIS -> {
                val all = loadAllLiveChannels(false)
                if (categoryId == "all") all
                else {
                    val target = categoryId.removePrefix("grp:")
                    all.filter { it.group.equals(target, ignoreCase = true) }
                }
            }

            IptvSource.FILMES -> {
                val key = categoryId.substringAfter(':')
                val enc = URLEncoder.encode(key, "UTF-8")
                val url = if (categoryId.startsWith("letter:")) {
                    "$FILMES_BASE/dados/filmes/${key.lowercase()}.json"
                } else {
                    "$FILMES_BASE/dados/filmes/generos/$enc.json"
                }
                val raw = fetchText(url, "$FILMES_BASE/") ?: return@withContext emptyList()
                parseVodArray(raw, "movie", key)
            }

            IptvSource.SERIES -> {
                val letter = categoryId.removePrefix("series:").lowercase()
                val raw = fetchText("$FILMES_BASE/dados/series/$letter.json", "$FILMES_BASE/")
                    ?: return@withContext emptyList()
                parseVodArray(raw, "series", letter.uppercase())
            }

            IptvSource.USUARIO -> {
                val key = categoryId.removePrefix("user:")
                userPlaylists[key].orEmpty()
            }
        }
    }

    suspend fun fetchUserPlaylistFromUrl(url: String): List<IptvChannel> = withContext(Dispatchers.IO) {
        val raw = fetchText(url) ?: return@withContext emptyList()
        MediaScanner.parseM3uPlaylist(raw, "Lista do Usuário")
    }

    private fun parseVodArray(raw: String, mediaType: String, group: String): List<IptvChannel> {
        val arr = runCatching { JSONArray(raw) }.getOrNull()
            ?: runCatching { JSONObject(raw).optJSONArray("items") ?: JSONObject(raw).optJSONArray("filmes") ?: JSONObject(raw).optJSONArray("series") }.getOrNull()
            ?: return emptyList()
        val out = mutableListOf<IptvChannel>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val name = o.optString("titulo").ifBlank { o.optString("nome").ifBlank { o.optString("name") } }
            val url = o.optString("url").ifBlank { o.optString("stream").ifBlank { o.optString("link") } }
            if (name.isBlank()) continue
            out.add(
                IptvChannel(
                    id = "$mediaType-$i-${name.hashCode()}",
                    name = name,
                    url = url,
                    group = group,
                    logo = o.optString("capa").ifBlank { o.optString("poster").ifBlank { o.optString("logo") } },
                    mediaType = mediaType,
                    year = o.optString("ano"),
                    rating = o.optString("nota"),
                    synopsis = o.optString("sinopse"),
                ),
            )
        }
        return out
    }

    // ==================== PLACAR DA BOLA (LIVE FOOTBALL SCORES) ====================

    suspend fun fetchFootballMatches(): List<FootballMatch> = withContext(Dispatchers.IO) {
        val leagues = listOf(
            Triple("bra.1", "Brasileirão Série A", "br"),
            Triple("conmebol.libertadores", "Libertadores", "br"),
            Triple("uefa.champions", "Champions League", "eu"),
            Triple("eng.1", "Premier League", "eu"),
            Triple("esp.1", "La Liga", "eu"),
        )
        val out = mutableListOf<FootballMatch>()
        for ((slug, leagueName, region) in leagues) {
            val raw = fetchText("https://site.api.espn.com/apis/site/v2/sports/soccer/$slug/scoreboard")
                ?: continue
            val root = runCatching { JSONObject(raw) }.getOrNull() ?: continue
            val events = root.optJSONArray("events") ?: continue
            for (i in 0 until events.length()) {
                val ev = events.optJSONObject(i) ?: continue
                val comp = ev.optJSONArray("competitions")?.optJSONObject(0) ?: continue
                val competitors = comp.optJSONArray("competitors") ?: continue
                if (competitors.length() < 2) continue
                val homeObj = (0 until competitors.length()).mapNotNull { competitors.optJSONObject(it) }
                    .firstOrNull { it.optString("homeAway") == "home" } ?: competitors.optJSONObject(0)
                val awayObj = (0 until competitors.length()).mapNotNull { competitors.optJSONObject(it) }
                    .firstOrNull { it.optString("homeAway") == "away" } ?: competitors.optJSONObject(1)
                val statusObj = comp.optJSONObject("status")
                val typeObj = statusObj?.optJSONObject("type")
                val stateRaw = typeObj?.optString("state") ?: "pre"
                val state = when (stateRaw) {
                    "in" -> "live"
                    "post" -> "post"
                    else -> "pre"
                }
                val detail = typeObj?.optString("shortDetail").orEmpty()
                out.add(
                    FootballMatch(
                        id = "$slug:${ev.optString("id")}",
                        league = leagueName,
                        region = region,
                        home = homeObj.optJSONObject("team")?.optString("shortDisplayName") ?: "Casa",
                        away = awayObj.optJSONObject("team")?.optString("shortDisplayName") ?: "Visitante",
                        homeScore = if (state == "pre") "-" else homeObj.optString("score", "0"),
                        awayScore = if (state == "pre") "-" else awayObj.optString("score", "0"),
                        status = detail.ifBlank { if (state == "live") "AO VIVO" else "Agendado" },
                        state = state,
                        timeLabel = statusObj?.optString("displayClock").orEmpty(),
                    ),
                )
            }
        }
        out.sortedBy {
            when (it.state) {
                "live" -> 0
                "pre" -> 1
                else -> 2
            }
        }
    }
}
