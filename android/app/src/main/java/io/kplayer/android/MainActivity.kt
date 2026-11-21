package io.kplayer.android

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.kplayer.android.data.AndroidTab
import io.kplayer.android.data.AudioTrack
import io.kplayer.android.data.FootballMatch
import io.kplayer.android.data.IptvCategory
import io.kplayer.android.data.IptvChannel
import io.kplayer.android.data.IptvSource
import io.kplayer.android.data.MediaScanner
import io.kplayer.android.data.NetworkRepository
import io.kplayer.android.data.RadioStation
import io.kplayer.android.data.VideoItem
import io.kplayer.android.player.KPlayerEngine
import io.kplayer.android.theme.KPLAYER_THEMES
import io.kplayer.android.theme.KPlayerAndroidTheme
import io.kplayer.android.ui.AdaptiveNavRail
import io.kplayer.android.ui.BottomNavBar
import io.kplayer.android.ui.FootballPortraitScreen
import io.kplayer.android.ui.FullNowPlayingSheet
import io.kplayer.android.ui.HomePortraitScreen
import io.kplayer.android.ui.IptvPortraitScreen
import io.kplayer.android.ui.MusicLibraryPortraitScreen
import io.kplayer.android.ui.RadioPortraitScreen
import io.kplayer.android.ui.SettingsAndTermsSheet
import io.kplayer.android.ui.TransparencyNoticeScreen
import io.kplayer.android.ui.VideoAndIptvPlayerOverlay
import io.kplayer.android.ui.VinylEmblem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private lateinit var engine: KPlayerEngine
    private var onPermissionRefresh: (() -> Unit)? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        onPermissionRefresh?.invoke()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        engine = KPlayerEngine(applicationContext)

        val prefs = getSharedPreferences("kplayer_android_prefs", MODE_PRIVATE)
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        permissionLauncher.launch(permissions)

        setContent {
            val scope = rememberCoroutineScope()
            val playback by engine.state.collectAsState()

            var themeIndex by remember { mutableIntStateOf(prefs.getInt("theme_index", 0).coerceIn(0, KPLAYER_THEMES.lastIndex)) }
            var currentTab by remember { mutableStateOf(AndroidTab.HOME) }
            var showNowPlaying by remember { mutableStateOf(false) }
            var showSettings by remember { mutableStateOf(false) }
            var noticeTarget by remember { mutableStateOf<AndroidTab?>(null) }
            var noticeAccepted by remember { mutableStateOf(prefs.getBoolean("transparency_accepted", false)) }

            var audioTracks by remember { mutableStateOf<List<AudioTrack>>(emptyList()) }
            var videos by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
            var favorites by remember { mutableStateOf<Set<String>>(emptySet()) }

            var radioCategory by remember { mutableStateOf("Brasil") }
            var radioStations by remember { mutableStateOf<List<RadioStation>>(emptyList()) }
            var radioLoading by remember { mutableStateOf(false) }

            var iptvSource by remember { mutableStateOf(IptvSource.CANAIS) }
            var iptvCategories by remember { mutableStateOf<List<IptvCategory>>(emptyList()) }
            var iptvSelectedCat by remember { mutableStateOf<IptvCategory?>(null) }
            var iptvItems by remember { mutableStateOf<List<IptvChannel>>(emptyList()) }
            var iptvLoading by remember { mutableStateOf(false) }
            val userIptvPlaylists = remember { mutableStateMapOf<String, List<IptvChannel>>() }

            var footballMatches by remember { mutableStateOf<List<FootballMatch>>(emptyList()) }
            var footballLoading by remember { mutableStateOf(false) }

            fun rescanLocalMedia() {
                scope.launch {
                    val scannedAudio = withContext(Dispatchers.IO) { MediaScanner.scanAudio(applicationContext) }
                    val scannedVideos = withContext(Dispatchers.IO) { MediaScanner.scanVideos(applicationContext) }
                    audioTracks = scannedAudio
                    videos = scannedVideos
                }
            }

            fun loadRadio(cat: String) {
                radioCategory = cat
                scope.launch {
                    radioLoading = true
                    radioStations = NetworkRepository.fetchRadioStations(cat)
                    radioLoading = false
                }
            }

            fun loadIptvCats(src: IptvSource, refresh: Boolean = false) {
                iptvSource = src
                iptvSelectedCat = null
                iptvItems = emptyList()
                scope.launch {
                    iptvLoading = true
                    iptvCategories = NetworkRepository.fetchIptvCategories(src, userIptvPlaylists, refresh)
                    iptvLoading = false
                }
            }

            fun loadFootball() {
                scope.launch {
                    footballLoading = true
                    footballMatches = NetworkRepository.fetchFootballMatches()
                    footballLoading = false
                }
            }

            onPermissionRefresh = { rescanLocalMedia() }

            LaunchedEffect(Unit) {
                rescanLocalMedia()
                loadFootball()
            }

            LaunchedEffect(Unit) {
                while (true) {
                    engine.syncProgress()
                    delay(450L)
                }
            }

            fun navigateTab(tab: AndroidTab) {
                if ((tab == AndroidTab.IPTV || tab == AndroidTab.RADIO) && !noticeAccepted) {
                    noticeTarget = tab
                    return
                }
                currentTab = tab
                if (tab == AndroidTab.RADIO && radioStations.isEmpty()) loadRadio(radioCategory)
                if (tab == AndroidTab.IPTV && iptvCategories.isEmpty()) loadIptvCats(iptvSource)
                if (tab == AndroidTab.FOOTBALL && footballMatches.isEmpty()) loadFootball()
            }

            val palette = KPLAYER_THEMES[themeIndex]
            KPlayerAndroidTheme(palette = palette) {
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(palette.bg)
                        .safeDrawingPadding(),
                ) {
                    val isWide = maxWidth >= 600.dp
                    val isExpanded = maxWidth >= 840.dp
                    val gridColumns = when {
                        maxWidth >= 900.dp -> 3
                        maxWidth >= 600.dp -> 2
                        else -> 1
                    }
                    val deviceProfile = when {
                        isExpanded -> "Tablet / Tela Grande"
                        isWide -> "Paisagem / Dobrável"
                        else -> "Adaptativo"
                    }

                    when {
                        playback.activeVideo != null -> {
                            VideoAndIptvPlayerOverlay(
                                palette = palette,
                                title = playback.activeVideo?.title ?: "Vídeo",
                                exoPlayer = engine.exoPlayer,
                                onClose = { engine.clearVideoOverlay() },
                            )
                        }

                        playback.activeIptv != null -> {
                            VideoAndIptvPlayerOverlay(
                                palette = palette,
                                title = playback.activeIptv?.name ?: "IPTV",
                                exoPlayer = engine.exoPlayer,
                                onClose = { engine.clearVideoOverlay() },
                            )
                        }

                        showSettings -> {
                            SettingsAndTermsSheet(
                                palette = palette,
                                themeIndex = themeIndex,
                                isWide = isWide,
                                onSelectTheme = { idx ->
                                    themeIndex = idx
                                    prefs.edit().putInt("theme_index", idx).apply()
                                },
                                onClose = { showSettings = false },
                            )
                        }

                        noticeTarget != null -> {
                            val pending = noticeTarget!!
                            TransparencyNoticeScreen(
                                palette = palette,
                                targetLabel = if (pending == AndroidTab.IPTV) "IPTV — Fontes Abertas" else "Rádio Online — Fontes Abertas",
                                onContinue = {
                                    noticeAccepted = true
                                    prefs.edit().putBoolean("transparency_accepted", true).apply()
                                    noticeTarget = null
                                    navigateTab(pending)
                                },
                                onOpenTerms = { showSettings = true },
                                onBack = { noticeTarget = null },
                            )
                        }

                        showNowPlaying -> {
                            val activeId = playback.activeTrack?.id ?: playback.activeRadio?.id.orEmpty()
                            FullNowPlayingSheet(
                                palette = palette,
                                playback = playback,
                                isFavorite = favorites.contains(activeId),
                                isWide = isWide,
                                availableHeightDp = maxHeight.value.toInt(),
                                onClose = { showNowPlaying = false },
                                onToggleFavorite = {
                                    if (activeId.isNotBlank()) {
                                        favorites = if (favorites.contains(activeId)) favorites - activeId else favorites + activeId
                                    }
                                },
                                onTogglePlay = { engine.togglePlayPause() },
                                onPrev = { engine.stepTrack(-1) },
                                onNext = { engine.stepTrack(1) },
                                onSeek = { engine.seekTo(it) },
                                onCycleRepeat = { engine.cycleRepeat() },
                                onToggleShuffle = { engine.toggleShuffle() },
                                onSelectEq = { engine.applyEqualizer(it) },
                                onSelectSleep = { engine.setSleepMinutes(it) },
                            )
                        }

                        else -> {
                            Row(modifier = Modifier.fillMaxSize()) {
                                if (isWide) {
                                    AdaptiveNavRail(
                                        palette = palette,
                                        currentTab = currentTab,
                                        expanded = isExpanded,
                                        onSelect = ::navigateTab,
                                        onOpenSettings = { showSettings = true },
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight(),
                                ) {
                                    when (currentTab) {
                                        AndroidTab.HOME -> HomePortraitScreen(
                                            palette = palette,
                                            playback = playback,
                                            audioTracks = audioTracks,
                                            videos = videos,
                                            matches = footballMatches,
                                            isWide = isWide,
                                            deviceProfile = deviceProfile,
                                            onOpenTab = ::navigateTab,
                                            onOpenVideos = {
                                                videos.firstOrNull()?.let { engine.playVideo(it) }
                                            },
                                            onOpenSettings = { showSettings = true },
                                            onOpenNowPlaying = { showNowPlaying = true },
                                            onPlayTrack = { t ->
                                                engine.playTrack(t, audioTracks)
                                                showNowPlaying = true
                                            },
                                            onPlayVideo = { v -> engine.playVideo(v) },
                                        )

                                        AndroidTab.MUSIC -> MusicLibraryPortraitScreen(
                                            palette = palette,
                                            tracks = audioTracks,
                                            favorites = favorites,
                                            playback = playback,
                                            gridColumns = gridColumns,
                                            bottomInsetDp = if (isWide) 96 else 148,
                                            onPlayTrack = { t, q -> engine.playTrack(t, q) },
                                            onRescan = ::rescanLocalMedia,
                                            onOpenNowPlaying = { showNowPlaying = true },
                                        )

                                        AndroidTab.IPTV -> IptvPortraitScreen(
                                            palette = palette,
                                            source = iptvSource,
                                            categories = iptvCategories,
                                            items = iptvItems,
                                            selectedCategory = iptvSelectedCat,
                                            loading = iptvLoading,
                                            gridColumns = gridColumns,
                                            bottomInsetDp = if (isWide) 96 else 148,
                                            onSelectSource = { loadIptvCats(it) },
                                            onSelectCategory = { cat ->
                                                iptvSelectedCat = cat
                                                scope.launch {
                                                    iptvLoading = true
                                                    iptvItems = NetworkRepository.fetchIptvItems(iptvSource, cat.id, userIptvPlaylists)
                                                    iptvLoading = false
                                                }
                                            },
                                            onBackToCategories = {
                                                iptvSelectedCat = null
                                                iptvItems = emptyList()
                                            },
                                            onPlayChannel = { ch -> engine.playIptv(ch) },
                                            onAddUserUrl = { url ->
                                                scope.launch {
                                                    iptvLoading = true
                                                    val parsed = NetworkRepository.fetchUserPlaylistFromUrl(url)
                                                    if (parsed.isNotEmpty()) {
                                                        userIptvPlaylists["Minha Lista (${parsed.size})"] = parsed
                                                        loadIptvCats(IptvSource.USUARIO)
                                                    }
                                                    iptvLoading = false
                                                }
                                            },
                                            onRefresh = { loadIptvCats(iptvSource, refresh = true) },
                                        )

                                        AndroidTab.RADIO -> RadioPortraitScreen(
                                            palette = palette,
                                            selectedCategory = radioCategory,
                                            stations = radioStations,
                                            activeStation = playback.activeRadio,
                                            loading = radioLoading,
                                            gridColumns = gridColumns,
                                            bottomInsetDp = if (isWide) 96 else 148,
                                            onSelectCategory = ::loadRadio,
                                            onPlayStation = { st -> engine.playRadio(st) },
                                            onRefresh = { loadRadio(radioCategory) },
                                        )

                                        AndroidTab.FOOTBALL -> FootballPortraitScreen(
                                            palette = palette,
                                            matches = footballMatches,
                                            loading = footballLoading,
                                            gridColumns = gridColumns,
                                            bottomInsetDp = if (isWide) 96 else 148,
                                            onRefresh = ::loadFootball,
                                        )
                                    }

                                    // Docked Floating Mini-Player + Bottom Nav (Compact Phones) / Floating Dock (Wide Screens)
                                    Column(
                                        modifier = Modifier
                                            .align(Alignment.BottomCenter)
                                            .fillMaxWidth(),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        val miniTitle = playback.activeTrack?.title ?: playback.activeRadio?.name
                                        val miniSub = playback.activeTrack?.artist ?: playback.activeRadio?.country
                                        if (miniTitle != null) {
                                            Row(
                                                modifier = Modifier
                                                    .widthIn(max = if (isWide) 620.dp else 1000.dp)
                                                    .fillMaxWidth()
                                                    .padding(horizontal = 12.dp, vertical = if (isWide) 10.dp else 6.dp)
                                                    .clip(RoundedCornerShape(16.dp))
                                                    .background(palette.elevated)
                                                    .clickable { showNowPlaying = true }
                                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                VinylEmblem(
                                                    palette = palette,
                                                    sizeDp = 38,
                                                    artUri = playback.activeTrack?.artUri,
                                                )
                                                Spacer(Modifier.width(10.dp))
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(miniTitle, color = palette.text, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                    Text(miniSub.orEmpty(), color = palette.muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                }
                                                IconButton(onClick = { engine.togglePlayPause() }, modifier = Modifier.size(44.dp)) {
                                                    Icon(
                                                        if (playback.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                                        contentDescription = "Tocar/Pausar",
                                                        tint = palette.accent,
                                                    )
                                                }
                                            }
                                        }

                                        if (!isWide) {
                                            BottomNavBar(
                                                palette = palette,
                                                currentTab = currentTab,
                                                onSelect = ::navigateTab,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        engine.release()
        super.onDestroy()
    }
}
