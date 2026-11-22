package io.kplayer.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream

object NetworkRepository {
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(18, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private const val UA = "KPlayer-Android/2.0.3"
    private const val CANAIS_BASE = "https://canais-saimo.pages.dev"
    private const val FILMES_BASE = "https://filmes-saimo.pages.dev"
    private const val RAMYS_CANAIS_URL = "https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Canais.m3u8"
    private val REPO_SLUG_REGEX = Regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")

    private val RADIO_MIRRORS = listOf(
        "https://de1.api.radio-browser.info",
        "https://nl1.api.radio-browser.info",
        "https://at1.api.radio-browser.info",
    )

    private val EPG_FEEDS = listOf(
        "https://epgshare01.online/epgshare01/epg_ripper_BR1.xml.gz",
        "https://epgshare01.online/epgshare01/epg_ripper_BR2.xml.gz",
    )
    private const val EPG_TTL_MS = 3L * 60L * 60L * 1000L
    private const val MAX_EPG_GZIP_BYTES = 12 * 1024 * 1024
    private const val MAX_EPG_XML_BYTES = 28 * 1024 * 1024

    private data class EpgIndex(
        val fetchedAt: Long,
        val aliasToIds: Map<String, List<String>>,
        val programsById: Map<String, List<EpgProgram>>,
    )

    @Volatile
    private var cachedEpgIndex: EpgIndex? = null

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

    private fun cleanRamysGroup(raw: String): String {
        val cleaned = raw
            .replace(Regex("^\\s*CANAIS\\s*:\\s*", RegexOption.IGNORE_CASE), "")
            .trim()
        val upper = cleaned.uppercase(Locale.ROOT)
        return when {
            upper.contains("ABERTOS") -> "TV Aberta"
            upper.contains("ESPORT") -> "Esportes"
            upper.contains("FILMES") || upper.contains("SERIES") || upper.contains("CINE SKY") -> "Filmes e Séries"
            upper.contains("INFANT") -> "Infantil"
            upper.contains("NOTIC") -> "Notícias"
            upper.contains("DOCUMENT") -> "Documentários"
            upper.contains("RELIGIO") -> "Religiosos"
            upper.contains("NOVELA") -> "Novelas"
            upper.contains("VARIEDAD") || upper.contains("GLOBO") || upper.contains("RECORD") || upper.contains("SBT") -> "Variedades"
            else -> cleaned.ifBlank { "TV Brasil" }
        }
    }

    private fun cleanRamysName(raw: String): String {
        return raw
            .replace(Regex("\\s*(?:4K|UHD|FHD|HD|SD|H\\.265|H265|HEVC|[¹²³⁴])\\b", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\s{2,}"), " ")
            .trim()
            .ifBlank { raw.trim() }
    }

    private fun loadAllLiveChannels(forceRefresh: Boolean = false): List<IptvChannel> {
        if (!forceRefresh && !cachedLiveChannels.isNullOrEmpty()) return cachedLiveChannels!!
        val combined = linkedMapOf<String, IptvChannel>()

        val catRaw = fetchText("$CANAIS_BASE/catalogo.txt", "$CANAIS_BASE/")
        if (!catRaw.isNullOrBlank()) {
            MediaScanner.parseM3uPlaylist(catRaw, "TV ao Vivo").forEach { ch ->
                combined[ch.name.lowercase(Locale.ROOT)] = ch
            }
        }
        val reserveRaw = fetchText("$CANAIS_BASE/canais.txt", "$CANAIS_BASE/")
        if (!reserveRaw.isNullOrBlank()) {
            MediaScanner.parseM3uPlaylist(reserveRaw, "Reservas").forEach { ch ->
                val key = ch.name.lowercase(Locale.ROOT)
                if (!combined.containsKey(key)) combined[key] = ch
            }
        }

        // Verified live Brazilian channels from Ramys/Iptv-Brasil-2026 (Canais.m3u8)
        val ramysRaw = fetchText(RAMYS_CANAIS_URL)
        if (!ramysRaw.isNullOrBlank()) {
            val parsed = MediaScanner.parseM3uPlaylist(ramysRaw, "TV Brasil")
            val preferred = parsed.sortedBy { ch ->
                val upper = ch.name.uppercase(Locale.ROOT)
                when {
                    upper.contains("H.265") || upper.contains("H265") || upper.contains("HEVC") -> 3
                    upper.contains("FHD") -> 0
                    upper.contains("HD") -> 1
                    else -> 2
                }
            }
            preferred.forEach { ch ->
                val cleanName = cleanRamysName(ch.name)
                val key = cleanName.lowercase(Locale.ROOT)
                if (!combined.containsKey(key)) {
                    combined[key] = ch.copy(
                        name = cleanName,
                        group = cleanRamysGroup(ch.group),
                    )
                }
            }
        }

        val list = combined.values.toList()
        if (list.isNotEmpty()) cachedLiveChannels = list
        return list
    }

    // ==================== AUTO-UPDATE CHECKER (GitHub updates/ folder) ====================

    private fun compareSemver(a: String, b: String): Int {
        val pa = a.trim().removePrefix("v").removePrefix("V").split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.trim().removePrefix("v").removePrefix("V").split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until 3) {
            val diff = (pa.getOrElse(i) { 0 }) - (pb.getOrElse(i) { 0 })
            if (diff != 0) return diff
        }
        return 0
    }

    suspend fun checkAppUpdate(
        repoSlug: String,
        currentVersion: String = "2.0.3",
        branch: String = "main",
    ): AppUpdateInfo? = withContext(Dispatchers.IO) {
        val cleanRepo = repoSlug.trim()
        if (!REPO_SLUG_REGEX.matches(cleanRepo)) return@withContext null
        val cleanBranch = branch.trim().ifBlank { "main" }.replace(Regex("[^A-Za-z0-9._/-]"), "")
        val manifestUrl = "https://raw.githubusercontent.com/$cleanRepo/$cleanBranch/updates/latest.json"
        val raw = fetchText(manifestUrl) ?: return@withContext null
        val obj = runCatching { JSONObject(raw) }.getOrNull() ?: return@withContext null
        val latest = obj.optString("version").trim().ifBlank { return@withContext null }
        val androidObj = obj.optJSONObject("android")
        val apkPath = androidObj?.optString("path").orEmpty().trimStart('/')
        val apkUrl = androidObj?.optString("downloadUrl").orEmpty().ifBlank {
            if (apkPath.isNotBlank()) "https://raw.githubusercontent.com/$cleanRepo/$cleanBranch/$apkPath" else ""
        }
        val notesArr = obj.optJSONArray("notes")
        val notes = buildList {
            if (notesArr != null) {
                for (i in 0 until notesArr.length()) {
                    val line = notesArr.optString(i).trim()
                    if (line.isNotBlank()) add(line)
                }
            }
        }
        AppUpdateInfo(
            currentVersion = currentVersion,
            latestVersion = latest,
            updateAvailable = compareSemver(latest, currentVersion) > 0,
            apkUrl = apkUrl,
            sha256 = androidObj?.optString("sha256").orEmpty(),
            notes = notes,
        )
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
                val slice = if (categoryId == "all") all
                else {
                    val target = categoryId.removePrefix("grp:")
                    all.filter { it.group.equals(target, ignoreCase = true) }
                }
                attachEpgToChannels(slice)
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
                attachEpgToChannels(userPlaylists[key].orEmpty())
            }
        }
    }

    // ==================== LIVE XMLTV EPG ENGINE (BR1 + BR2) ====================

    private fun decodeXmlEntities(raw: String): String {
        if (!raw.contains('&')) return raw
        return raw
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&#39;", "'")
    }

    private fun normalizeEpgKey(raw: String): String {
        var s = Normalizer.normalize(raw, Normalizer.Form.NFD)
            .replace(Regex("[\\u0300-\\u036f]"), "")
            .lowercase(Locale.ROOT)
        s = s
            .replace(Regex("^[a-z0-9\\s.-]+/[a-z]{2}\\s+"), "")
            .replace(Regex("^\\s*br\\s*[:|-]?\\s*"), "")
            .replace(Regex("\\.(br|pt|us|tv|hd|fhd|sd|4k)\\b"), " ")
            .replace(Regex("\\b(fhd|uhd|4k|hd|sd|h265|hevc|fullhd|720p|1080p|60fps|ao vivo|live|brasil|br|sp|rj|mg|rs|ba|pr|pe|df|ce|go|alternativo|backup|reserva|opcao\\s*\\d+|opt\\s*\\d+|canal)\\b"), " ")
            .replace(Regex("\\b(tv\\s+)?globo\\b"), "globo")
            .replace(Regex("\\btelecine\\b"), "tc")
            .replace(Regex("\\bsportv\\s*([1-4])\\b"), "sportv$1")
            .replace(Regex("\\bpremiere\\s*([1-9])\\b"), "premiere$1")
            .replace(Regex("[^a-z0-9]+"), "")
        return s.trim()
    }

    private fun parseXmltvDate(raw: String): Long {
        val clean = raw.trim().replace(Regex("\\s+"), " ")
        val patterns = listOf("yyyyMMddHHmmss Z", "yyyyMMddHHmmss")
        for (pattern in patterns) {
            val sdf = SimpleDateFormat(pattern, Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            val parsed = runCatching { sdf.parse(clean) }.getOrNull()
            if (parsed != null) return parsed.time
        }
        return 0L
    }

    private fun formatBrClock(ms: Long): String {
        val sdf = SimpleDateFormat("HH:mm", Locale("pt", "BR"))
        sdf.timeZone = TimeZone.getTimeZone("America/Sao_Paulo")
        return sdf.format(Date(ms))
    }

    private fun fetchXmltvTextBounded(url: String): String? {
        if (!url.startsWith("https://")) return null
        return runCatching {
            val req = Request.Builder().url(url).header("User-Agent", UA).build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body ?: return null
                val rawStream = body.byteStream()
                val gzBuffer = ByteArrayOutputStream()
                val chunk = ByteArray(16 * 1024)
                var totalGz = 0
                while (true) {
                    val read = rawStream.read(chunk)
                    if (read <= 0) break
                    totalGz += read
                    if (totalGz > MAX_EPG_GZIP_BYTES) return null
                    gzBuffer.write(chunk, 0, read)
                }
                val bytes = gzBuffer.toByteArray()
                val isGzip = url.endsWith(".gz", ignoreCase = true) ||
                    (bytes.size >= 2 && bytes[0] == 0x1f.toByte() && bytes[1] == 0x8b.toByte())
                if (!isGzip) {
                    if (bytes.size > MAX_EPG_XML_BYTES) return null
                    return@use String(bytes, Charsets.UTF_8)
                }
                GZIPInputStream(bytes.inputStream()).use { gis ->
                    val xmlOut = ByteArrayOutputStream()
                    var totalXml = 0
                    while (true) {
                        val read = gis.read(chunk)
                        if (read <= 0) break
                        totalXml += read
                        if (totalXml > MAX_EPG_XML_BYTES) return null
                        xmlOut.write(chunk, 0, read)
                    }
                    String(xmlOut.toByteArray(), Charsets.UTF_8)
                }
            }
        }.getOrNull()
    }

    private fun loadEpgIndex(): EpgIndex? {
        val now = System.currentTimeMillis()
        val existing = cachedEpgIndex
        if (existing != null && now - existing.fetchedAt < EPG_TTL_MS && existing.programsById.isNotEmpty()) {
            return existing
        }

        val aliasToIds = mutableMapOf<String, MutableList<String>>()
        val programsById = mutableMapOf<String, MutableList<EpgProgram>>()
        val minKeep = now - 6L * 60L * 60L * 1000L
        val maxKeep = now + 30L * 60L * 60L * 1000L

        val chRegex = Regex("<channel\\s+id=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</channel>")
        val nameRegex = Regex("<display-name[^>]*>([\\s\\S]*?)</display-name>")
        val progRegex = Regex("<programme\\s+start=\"([^\"]+)\"\\s+stop=\"([^\"]+)\"\\s+channel=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</programme>")
        val titleRegex = Regex("<title[^>]*>([\\s\\S]*?)</title>")
        val descRegex = Regex("<desc[^>]*>([\\s\\S]*?)</desc>")
        val catRegex = Regex("<category[^>]*>([\\s\\S]*?)</category>")

        fun addAlias(key: String, id: String) {
            if (key.length < 2) return
            val bucket = aliasToIds.getOrPut(key) { mutableListOf() }
            if (!bucket.contains(id)) bucket.add(id)
        }

        for (feed in EPG_FEEDS) {
            val xml = fetchXmltvTextBounded(feed) ?: continue
            chRegex.findAll(xml).forEach { m ->
                val id = decodeXmlEntities(m.groupValues[1]).trim()
                if (id.isBlank()) return@forEach
                addAlias(normalizeEpgKey(id), id)
                nameRegex.findAll(m.groupValues[2]).forEach { nm ->
                    val dn = decodeXmlEntities(nm.groupValues[1]).trim()
                    addAlias(normalizeEpgKey(dn), id)
                }
            }
            progRegex.findAll(xml).forEach { m ->
                val startMs = parseXmltvDate(m.groupValues[1])
                val stopMs = parseXmltvDate(m.groupValues[2])
                if (startMs <= 0L || stopMs <= startMs || stopMs < minKeep || startMs > maxKeep) return@forEach
                val chId = decodeXmlEntities(m.groupValues[3]).trim()
                val body = m.groupValues[4]
                val title = titleRegex.find(body)?.groupValues?.get(1)?.let { decodeXmlEntities(it).trim() }.orEmpty()
                if (title.isBlank()) return@forEach
                val desc = descRegex.find(body)?.groupValues?.get(1)?.let { decodeXmlEntities(it).trim() }.orEmpty()
                val cat = catRegex.find(body)?.groupValues?.get(1)?.let { decodeXmlEntities(it).trim() }.orEmpty()
                val list = programsById.getOrPut(chId) { mutableListOf() }
                list.add(
                    EpgProgram(
                        title = title,
                        desc = desc.take(280),
                        category = cat,
                        startMs = startMs,
                        stopMs = stopMs,
                        startLabel = formatBrClock(startMs),
                        stopLabel = formatBrClock(stopMs),
                    ),
                )
            }
        }

        if (programsById.isEmpty()) return existing
        programsById.values.forEach { it.sortBy { p -> p.startMs } }
        val built = EpgIndex(now, aliasToIds, programsById)
        cachedEpgIndex = built
        return built
    }

    private fun pickBestAndroidEpgId(idx: EpgIndex, ids: List<String>?, now: Long): String? {
        if (ids.isNullOrEmpty()) return null
        var bestId: String? = null
        var bestScore = -1
        for (id in ids) {
            val list = idx.programsById[id] ?: continue
            if (list.isEmpty()) continue
            val hasLive = list.any { now in it.startMs until it.stopMs }
            val score = (if (hasLive) 10000 else 0) + list.size
            if (score > bestScore) {
                bestScore = score
                bestId = id
            }
        }
        return bestId
    }

    private fun attachEpgToChannels(channels: List<IptvChannel>): List<IptvChannel> {
        if (channels.isEmpty()) return channels
        val idx = loadEpgIndex() ?: return channels
        val now = System.currentTimeMillis()
        return channels.map { ch ->
            val key = normalizeEpgKey(ch.name)
            val idKey = normalizeEpgKey(ch.id)
            val epgId = pickBestAndroidEpgId(idx, idx.aliasToIds[idKey], now)
                ?: pickBestAndroidEpgId(idx, idx.aliasToIds[key], now)
                ?: if (key.length >= 4) idx.aliasToIds.entries.firstNotNullOfOrNull { (k, ids) ->
                    if (k.length >= 4 && (k.contains(key) || key.contains(k))) pickBestAndroidEpgId(idx, ids, now) else null
                } else null
            val list = epgId?.let { idx.programsById[it] } ?: return@map ch
            val currentIdx = list.indexOfFirst { now in it.startMs until it.stopMs }
            val current = if (currentIdx >= 0) {
                val p = list[currentIdx]
                val pct = (((now - p.startMs).toDouble() / (p.stopMs - p.startMs).coerceAtLeast(1L).toDouble()) * 100.0)
                    .toInt().coerceIn(0, 100)
                p.copy(progressPct = pct)
            } else null
            val next = when {
                currentIdx >= 0 && currentIdx + 1 < list.size -> list[currentIdx + 1]
                else -> list.firstOrNull { it.startMs >= now }
            }
            if (current == null && next == null) ch else ch.copy(epgNow = current, epgNext = next)
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
