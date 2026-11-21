package io.kplayer.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Equalizer
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Lyrics
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.SportsSoccer
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import io.kplayer.android.data.AndroidTab
import io.kplayer.android.data.AudioTrack
import io.kplayer.android.data.EqPreset
import io.kplayer.android.data.FootballMatch
import io.kplayer.android.data.IptvCategory
import io.kplayer.android.data.IptvChannel
import io.kplayer.android.data.IptvSource
import io.kplayer.android.data.KPLAYER_TERMS_PAGES
import io.kplayer.android.data.RadioStation
import io.kplayer.android.data.RepeatMode
import io.kplayer.android.data.VideoItem
import io.kplayer.android.player.PlaybackUiState
import io.kplayer.android.theme.KPLAYER_THEMES
import io.kplayer.android.theme.KPlayerThemePalette

fun formatDuration(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val min = totalSec / 60L
    val sec = totalSec % 60L
    return "%d:%02d".format(min, sec)
}

@Composable
fun VinylEmblem(
    palette: KPlayerThemePalette,
    sizeDp: Int,
    artUri: Any? = null,
) {
    Box(
        modifier = Modifier
            .size(sizeDp.dp)
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF1F232A), Color(0xFF0A0C0F)),
                ),
            )
            .border(1.5.dp, palette.text.copy(alpha = 0.14f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (artUri != null) {
            AsyncImage(
                model = artUri,
                contentDescription = "Capa",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
            )
        } else {
            Box(
                modifier = Modifier
                    .size((sizeDp * 0.42f).dp)
                    .clip(CircleShape)
                    .background(palette.accent),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "K",
                    color = palette.bg,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = (sizeDp * 0.24f).sp,
                )
            }
        }
    }
}

@Composable
fun TransparencyNoticeScreen(
    palette: KPlayerThemePalette,
    targetLabel: String,
    onContinue: () -> Unit,
    onOpenTerms: () -> Unit,
    onBack: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            VinylEmblem(palette = palette, sizeDp = 76)
        Spacer(Modifier.height(18.dp))
        Text(
            text = "Aviso de Transparência",
            color = palette.text,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = targetLabel,
            color = palette.accent,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(18.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(palette.panel)
                .border(1.dp, palette.text.copy(alpha = 0.08f), RoundedCornerShape(20.dp))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "Todos os dados de IPTV e Rádio Online exibidos no KPlayer são obtidos de agregadores públicos da internet ou fontes abertas.",
                color = palette.text,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            Text(
                text = "O KPlayer atua apenas como reprodutor e não hospeda nenhum canal, filme, série ou estação própria.",
                color = palette.muted,
                fontSize = 13.sp,
                lineHeight = 19.sp,
            )
            Text(
                text = "Você tem total direito e liberdade para inserir seu próprio link (.m3u / .m3u8) ou importar arquivos locais a qualquer momento.",
                color = palette.accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = 19.sp,
            )
        }
        Spacer(Modifier.height(22.dp))
        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = palette.accent,
                contentColor = palette.bg,
            ),
        ) {
            Text("Entendi, continuar", fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedButton(
                onClick = onOpenTerms,
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Termos de uso", color = palette.text, fontSize = 13.sp)
            }
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Voltar", color = palette.muted, fontSize = 13.sp)
            }
        }
        }
    }
}

@Composable
fun HomePortraitScreen(
    palette: KPlayerThemePalette,
    playback: PlaybackUiState,
    audioTracks: List<AudioTrack>,
    videos: List<VideoItem>,
    matches: List<FootballMatch>,
    isWide: Boolean = false,
    deviceProfile: String = "Adaptativo",
    onOpenTab: (AndroidTab) -> Unit,
    onOpenVideos: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onPlayTrack: (AudioTrack) -> Unit,
    onPlayVideo: (VideoItem) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        contentPadding = PaddingValues(
            start = if (isWide) 24.dp else 18.dp,
            end = if (isWide) 24.dp else 18.dp,
            top = 14.dp,
            bottom = if (isWide) 96.dp else 148.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "KPlayer",
                        color = palette.text,
                        fontSize = if (isWide) 28.sp else 26.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Text(
                        text = "Android $deviceProfile · v2.0.3",
                        color = palette.muted,
                        fontSize = 12.sp,
                    )
                }
                if (!isWide) {
                    IconButton(
                        onClick = onOpenSettings,
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(palette.panel),
                    ) {
                        Icon(Icons.Rounded.Settings, contentDescription = "Opções", tint = palette.text)
                    }
                }
            }
        }

        // Featured Hero Now-Playing / Quick Start Card
        item {
            val activeTitle = playback.activeTrack?.title
                ?: playback.activeRadio?.name
                ?: playback.activeIptv?.name
                ?: "Pronto para dar o play"
            val activeSub = playback.activeTrack?.let { "${it.artist} · ${it.format}" }
                ?: playback.activeRadio?.let { "${it.country} · Ao vivo" }
                ?: playback.activeIptv?.let { "${it.group} · IPTV" }
                ?: "${audioTracks.size} músicas · ${videos.size} vídeos locais"

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(palette.elevated, palette.panel),
                        ),
                    )
                    .border(1.dp, palette.accent.copy(alpha = 0.25f), RoundedCornerShape(22.dp))
                    .clickable {
                        if (playback.activeTrack != null || playback.activeRadio != null) onOpenNowPlaying()
                        else onOpenTab(AndroidTab.MUSIC)
                    }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                VinylEmblem(
                    palette = palette,
                    sizeDp = 64,
                    artUri = playback.activeTrack?.artUri,
                )
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (playback.isPlaying) "Tocando agora" else "Central de mídia",
                        color = palette.accent,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = activeTitle,
                        color = palette.text,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = activeSub,
                        color = palette.muted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        // Adaptive Quick Access Grid (2x2+1 on compact phones, 5-column or 3+2 strip on wide screens)
        item {
            if (isWide) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    HomeModuleCard(
                        palette = palette,
                        title = "Músicas",
                        subtitle = "${audioTracks.size} faixas · LRC",
                        icon = { Icon(Icons.Rounded.LibraryMusic, null, tint = palette.accent) },
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenTab(AndroidTab.MUSIC) },
                    )
                    HomeModuleCard(
                        palette = palette,
                        title = "Vídeos",
                        subtitle = "${videos.size} arquivos",
                        icon = { Icon(Icons.Rounded.Movie, null, tint = palette.accent) },
                        modifier = Modifier.weight(1f),
                        onClick = onOpenVideos,
                    )
                    HomeModuleCard(
                        palette = palette,
                        title = "IPTV",
                        subtitle = "Canais · Filmes · Séries",
                        icon = { Icon(Icons.Rounded.Tv, null, tint = palette.accent) },
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenTab(AndroidTab.IPTV) },
                    )
                    HomeModuleCard(
                        palette = palette,
                        title = "Rádio",
                        subtitle = "Brasil e Mundo",
                        icon = { Icon(Icons.Rounded.Radio, null, tint = palette.accent) },
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenTab(AndroidTab.RADIO) },
                    )
                    HomeModuleCard(
                        palette = palette,
                        title = "Placar",
                        subtitle = "${matches.count { it.state == "live" }} ao vivo",
                        icon = { Icon(Icons.Rounded.SportsSoccer, null, tint = palette.accent) },
                        modifier = Modifier.weight(1f),
                        onClick = { onOpenTab(AndroidTab.FOOTBALL) },
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        HomeModuleCard(
                            palette = palette,
                            title = "Músicas",
                            subtitle = "${audioTracks.size} faixas · LRC",
                            icon = { Icon(Icons.Rounded.LibraryMusic, null, tint = palette.accent) },
                            modifier = Modifier.weight(1f),
                            onClick = { onOpenTab(AndroidTab.MUSIC) },
                        )
                        HomeModuleCard(
                            palette = palette,
                            title = "Vídeos",
                            subtitle = "${videos.size} arquivos",
                            icon = { Icon(Icons.Rounded.Movie, null, tint = palette.accent) },
                            modifier = Modifier.weight(1f),
                            onClick = onOpenVideos,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        HomeModuleCard(
                            palette = palette,
                            title = "IPTV",
                            subtitle = "Canais · Filmes · Séries",
                            icon = { Icon(Icons.Rounded.Tv, null, tint = palette.accent) },
                            modifier = Modifier.weight(1f),
                            onClick = { onOpenTab(AndroidTab.IPTV) },
                        )
                        HomeModuleCard(
                            palette = palette,
                            title = "Rádio Online",
                            subtitle = "Brasil e Mundo",
                            icon = { Icon(Icons.Rounded.Radio, null, tint = palette.accent) },
                            modifier = Modifier.weight(1f),
                            onClick = { onOpenTab(AndroidTab.RADIO) },
                        )
                    }
                    HomeModuleCard(
                        palette = palette,
                        title = "Placar da Bola",
                        subtitle = "${matches.count { it.state == "live" }} ao vivo · ${matches.size} jogos",
                        icon = { Icon(Icons.Rounded.SportsSoccer, null, tint = palette.accent) },
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onOpenTab(AndroidTab.FOOTBALL) },
                    )
                }
            }
        }

        if (audioTracks.isNotEmpty()) {
            item {
                Text(
                    text = "Suas músicas",
                    color = palette.text,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            items(audioTracks.take(6), key = { it.id }) { track ->
                TrackListRow(
                    palette = palette,
                    track = track,
                    isActive = playback.activeTrack?.id == track.id,
                    onClick = { onPlayTrack(track) },
                )
            }
        }

        if (videos.isNotEmpty()) {
            item {
                Text(
                    text = "Vídeos recentes",
                    color = palette.text,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            items(videos.take(4), key = { it.id }) { vid ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(palette.panel)
                        .clickable { onPlayVideo(vid) }
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Movie, contentDescription = null, tint = palette.accent)
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(vid.title, color = palette.text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${vid.folderName} · ${formatDuration(vid.durationMs)}", color = palette.muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeModuleCard(
    palette: KPlayerThemePalette,
    title: String,
    subtitle: String,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(palette.panel)
            .border(1.dp, palette.text.copy(alpha = 0.06f), RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        icon()
        Column {
            Text(title, color = palette.text, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
            Text(subtitle, color = palette.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun TrackListRow(
    palette: KPlayerThemePalette,
    track: AudioTrack,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (isActive) palette.elevated else palette.panel)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        VinylEmblem(palette = palette, sizeDp = 44, artUri = track.artUri)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = track.title,
                color = if (isActive) palette.accent else palette.text,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${track.artist} · ${track.format}" + if (track.lrcLines.isNotEmpty()) " · LRC" else "",
                color = palette.muted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = formatDuration(track.durationMs),
            color = palette.dim,
            fontSize = 12.sp,
        )
    }
}

@Composable
fun MusicLibraryPortraitScreen(
    palette: KPlayerThemePalette,
    tracks: List<AudioTrack>,
    favorites: Set<String>,
    playback: PlaybackUiState,
    gridColumns: Int = 1,
    bottomInsetDp: Int = 148,
    onPlayTrack: (AudioTrack, List<AudioTrack>) -> Unit,
    onRescan: () -> Unit,
    onOpenNowPlaying: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var onlyFavorites by remember { mutableStateOf(false) }

    val filtered = remember(tracks, query, onlyFavorites, favorites) {
        tracks.filter { t ->
            (!onlyFavorites || favorites.contains(t.id)) &&
                (query.isBlank() || t.title.contains(query, true) || t.artist.contains(query, true))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg)
            .padding(horizontal = if (gridColumns > 1) 24.dp else 16.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Músicas", color = palette.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("${filtered.size} faixas disponíveis", color = palette.muted, fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                IconButton(onClick = { onlyFavorites = !onlyFavorites }) {
                    Icon(
                        if (onlyFavorites) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = "Favoritas",
                        tint = if (onlyFavorites) palette.accent else palette.muted,
                    )
                }
                IconButton(onClick = onRescan) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Reescanear", tint = palette.text)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Buscar música ou artista", color = palette.muted) },
            leadingIcon = { Icon(Icons.Rounded.Search, null, tint = palette.muted) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        if (filtered.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "Nenhuma música encontrada.\nConceda permissão de mídia ou toque em atualizar.",
                    color = palette.muted,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns.coerceAtLeast(1)),
                contentPadding = PaddingValues(bottom = bottomInsetDp.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { track ->
                    TrackListRow(
                        palette = palette,
                        track = track,
                        isActive = playback.activeTrack?.id == track.id,
                        onClick = {
                            onPlayTrack(track, filtered)
                            onOpenNowPlaying()
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun FullNowPlayingSheet(
    palette: KPlayerThemePalette,
    playback: PlaybackUiState,
    isFavorite: Boolean,
    isWide: Boolean = false,
    availableHeightDp: Int = 720,
    onClose: () -> Unit,
    onToggleFavorite: () -> Unit,
    onTogglePlay: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onSeek: (Long) -> Unit,
    onCycleRepeat: () -> Unit,
    onToggleShuffle: () -> Unit,
    onSelectEq: (EqPreset) -> Unit,
    onSelectSleep: (Int) -> Unit,
) {
    var subPanel by remember { mutableStateOf("art") } // art | lyrics | queue | eq
    var wideSidePanel by remember { mutableStateOf("lyrics") } // lyrics | queue | eq
    val track = playback.activeTrack
    val radio = playback.activeRadio
    val title = track?.title ?: radio?.name ?: "Sem mídia"
    val subtitle = track?.let { "${it.artist} · ${it.format}" } ?: radio?.let { "${it.country} · ${it.codec}" } ?: ""
    val vinylSize = when {
        isWide && availableHeightDp < 480 -> 136
        isWide -> 212
        availableHeightDp < 640 -> 184
        else -> 248
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(palette.elevated, palette.bg, palette.bg),
                ),
            )
            .padding(horizontal = if (isWide) 24.dp else 20.dp, vertical = 14.dp),
    ) {
        // Top Bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose, modifier = Modifier.size(44.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = palette.text)
            }
            Text(
                text = if (radio != null) "Rádio ao vivo" else "Tocando agora",
                color = palette.muted,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            IconButton(onClick = onToggleFavorite, modifier = Modifier.size(44.dp)) {
                Icon(
                    if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    contentDescription = "Favorita",
                    tint = if (isFavorite) palette.accent else palette.text,
                )
            }
        }

        if (isWide) {
            // Adaptive 2-Pane Layout for Landscape Phones, Foldables & Tablets
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    VinylEmblem(
                        palette = palette,
                        sizeDp = vinylSize,
                        artUri = track?.artUri ?: radio?.favicon?.takeIf { it.isNotBlank() },
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = title,
                        color = palette.text,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = subtitle,
                        color = palette.muted,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                    )
                    if (radio == null) {
                        val dur = playback.durationMs.coerceAtLeast(1L)
                        Slider(
                            value = (playback.positionMs.toFloat() / dur.toFloat()).coerceIn(0f, 1f),
                            onValueChange = { frac -> onSeek((frac * dur).toLong()) },
                            colors = SliderDefaults.colors(
                                thumbColor = palette.accent,
                                activeTrackColor = palette.accent,
                                inactiveTrackColor = palette.elevated,
                            ),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(formatDuration(playback.positionMs), color = palette.dim, fontSize = 11.sp)
                            Text(formatDuration(playback.durationMs), color = palette.dim, fontSize = 11.sp)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onToggleShuffle, modifier = Modifier.size(44.dp)) {
                            Icon(Icons.Rounded.Shuffle, contentDescription = "Aleatório", tint = if (playback.shuffle) palette.accent else palette.muted)
                        }
                        IconButton(onClick = onPrev, modifier = Modifier.size(48.dp)) {
                            Icon(Icons.Rounded.SkipPrevious, contentDescription = "Anterior", tint = palette.text, modifier = Modifier.size(30.dp))
                        }
                        Box(
                            modifier = Modifier
                                .size(58.dp)
                                .clip(CircleShape)
                                .background(palette.accent)
                                .clickable(onClick = onTogglePlay),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (playback.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                contentDescription = "Tocar/Pausar",
                                tint = palette.bg,
                                modifier = Modifier.size(32.dp),
                            )
                        }
                        IconButton(onClick = onNext, modifier = Modifier.size(48.dp)) {
                            Icon(Icons.Rounded.SkipNext, contentDescription = "Próxima", tint = palette.text, modifier = Modifier.size(30.dp))
                        }
                        IconButton(onClick = onCycleRepeat, modifier = Modifier.size(44.dp)) {
                            Icon(
                                if (playback.repeatMode == RepeatMode.ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                                contentDescription = "Repetição",
                                tint = if (playback.repeatMode != RepeatMode.OFF) palette.accent else palette.muted,
                            )
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(22.dp))
                        .background(palette.panel)
                        .border(1.dp, palette.text.copy(alpha = 0.08f), RoundedCornerShape(22.dp))
                        .padding(16.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf("lyrics" to "Letras", "queue" to "Fila", "eq" to "EQ & Sono").forEach { (key, label) ->
                            val active = wideSidePanel == key
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (active) palette.accent else palette.elevated,
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { wideSidePanel = key },
                            ) {
                                Text(
                                    text = label,
                                    color = if (active) palette.bg else palette.text,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(vertical = 8.dp),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        when (wideSidePanel) {
                            "queue" -> {
                                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                                    items(playback.queue, key = { it.id }) { qTrack ->
                                        TrackListRow(palette = palette, track = qTrack, isActive = qTrack.id == track?.id, onClick = {})
                                    }
                                }
                            }
                            "eq" -> {
                                Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("Equalizador", color = palette.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        items(EqPreset.entries) { preset ->
                                            val selected = playback.eqPreset == preset
                                            Surface(
                                                shape = RoundedCornerShape(12.dp),
                                                color = if (selected) palette.accent else palette.elevated,
                                                modifier = Modifier.clickable { onSelectEq(preset) },
                                            ) {
                                                Text(
                                                    text = preset.label,
                                                    color = if (selected) palette.bg else palette.text,
                                                    fontWeight = FontWeight.SemiBold,
                                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                                )
                                            }
                                        }
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text("Timer de sono", color = palette.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        items(listOf(0, 15, 30, 60, 90)) { mins ->
                                            val selected = playback.sleepMinutes == mins
                                            Surface(
                                                shape = RoundedCornerShape(12.dp),
                                                color = if (selected) palette.accent else palette.elevated,
                                                modifier = Modifier.clickable { onSelectSleep(mins) },
                                            ) {
                                                Text(
                                                    text = if (mins == 0) "Desligado" else "${mins} min",
                                                    color = if (selected) palette.bg else palette.text,
                                                    fontWeight = FontWeight.SemiBold,
                                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                            else -> {
                                val lines = track?.lrcLines.orEmpty()
                                if (lines.isEmpty()) {
                                    Text(
                                        text = "Nenhuma letra .LRC sincronizada encontrada para esta faixa.",
                                        color = palette.muted,
                                        textAlign = TextAlign.Center,
                                    )
                                } else {
                                    val activeIdx = lines.indexOfLast { it.timeMs <= playback.positionMs }
                                    LazyColumn(
                                        contentPadding = PaddingValues(vertical = 12.dp),
                                        verticalArrangement = Arrangement.spacedBy(12.dp),
                                    ) {
                                        items(lines.indices.toList()) { i ->
                                            val active = i == activeIdx
                                            Text(
                                                text = lines[i].text,
                                                color = if (active) palette.accent else palette.muted.copy(alpha = 0.65f),
                                                fontSize = if (active) 19.sp else 14.sp,
                                                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                                                textAlign = TextAlign.Center,
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clickable { onSeek(lines[i].timeMs) }
                                                    .padding(vertical = 4.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Compact Portrait Phone Layout (Thumb-Zone Ergonomics)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                when (subPanel) {
                    "lyrics" -> {
                        val lines = track?.lrcLines.orEmpty()
                        if (lines.isEmpty()) {
                            Text(
                                text = "Nenhuma letra .LRC sincronizada encontrada para esta faixa.",
                                color = palette.muted,
                                textAlign = TextAlign.Center,
                            )
                        } else {
                            val activeIdx = lines.indexOfLast { it.timeMs <= playback.positionMs }
                            LazyColumn(
                                contentPadding = PaddingValues(vertical = 24.dp),
                                verticalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                items(lines.indices.toList()) { i ->
                                    val active = i == activeIdx
                                    Text(
                                        text = lines[i].text,
                                        color = if (active) palette.accent else palette.muted.copy(alpha = 0.65f),
                                        fontSize = if (active) 20.sp else 15.sp,
                                        fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onSeek(lines[i].timeMs) }
                                            .padding(vertical = 4.dp),
                                    )
                                }
                            }
                        }
                    }

                    "queue" -> {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            items(playback.queue, key = { it.id }) { qTrack ->
                                TrackListRow(
                                    palette = palette,
                                    track = qTrack,
                                    isActive = qTrack.id == track?.id,
                                    onClick = {},
                                )
                            }
                        }
                    }

                    "eq" -> {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text("Equalizador", color = palette.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(EqPreset.entries) { preset ->
                                    val selected = playback.eqPreset == preset
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (selected) palette.accent else palette.panel,
                                        modifier = Modifier.clickable { onSelectEq(preset) },
                                    ) {
                                        Text(
                                            text = preset.label,
                                            color = if (selected) palette.bg else palette.text,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            Text("Timer de sono", color = palette.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(listOf(0, 15, 30, 60, 90)) { mins ->
                                    val selected = playback.sleepMinutes == mins
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (selected) palette.accent else palette.panel,
                                        modifier = Modifier.clickable { onSelectSleep(mins) },
                                    ) {
                                        Text(
                                            text = if (mins == 0) "Desligado" else "${mins} min",
                                            color = if (selected) palette.bg else palette.text,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    else -> {
                        VinylEmblem(
                            palette = palette,
                            sizeDp = vinylSize,
                            artUri = track?.artUri ?: radio?.favicon?.takeIf { it.isNotBlank() },
                        )
                    }
                }
            }

            // Title & Metadata
            Text(
                text = title,
                color = palette.text,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                color = palette.muted,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(Modifier.height(12.dp))

            // Seek Scrubber
            if (radio == null) {
                val dur = playback.durationMs.coerceAtLeast(1L)
                Slider(
                    value = (playback.positionMs.toFloat() / dur.toFloat()).coerceIn(0f, 1f),
                    onValueChange = { frac -> onSeek((frac * dur).toLong()) },
                    colors = SliderDefaults.colors(
                        thumbColor = palette.accent,
                        activeTrackColor = palette.accent,
                        inactiveTrackColor = palette.elevated,
                    ),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(formatDuration(playback.positionMs), color = palette.dim, fontSize = 11.sp)
                    Text(formatDuration(playback.durationMs), color = palette.dim, fontSize = 11.sp)
                }
            }

            Spacer(Modifier.height(10.dp))

            // Primary Transport Controls (Ergonomic Thumb Zone)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onToggleShuffle, modifier = Modifier.size(46.dp)) {
                    Icon(
                        Icons.Rounded.Shuffle,
                        contentDescription = "Aleatório",
                        tint = if (playback.shuffle) palette.accent else palette.muted,
                    )
                }
                IconButton(onClick = onPrev, modifier = Modifier.size(50.dp)) {
                    Icon(Icons.Rounded.SkipPrevious, contentDescription = "Anterior", tint = palette.text, modifier = Modifier.size(32.dp))
                }
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(palette.accent)
                        .clickable(onClick = onTogglePlay),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (playback.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = "Tocar/Pausar",
                        tint = palette.bg,
                        modifier = Modifier.size(34.dp),
                    )
                }
                IconButton(onClick = onNext, modifier = Modifier.size(50.dp)) {
                    Icon(Icons.Rounded.SkipNext, contentDescription = "Próxima", tint = palette.text, modifier = Modifier.size(32.dp))
                }
                IconButton(onClick = onCycleRepeat, modifier = Modifier.size(46.dp)) {
                    Icon(
                        if (playback.repeatMode == RepeatMode.ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                        contentDescription = "Repetição",
                        tint = if (playback.repeatMode != RepeatMode.OFF) palette.accent else palette.muted,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Sub-panel Switches: Lyrics · Queue · EQ/Timer
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                IconButton(onClick = { subPanel = if (subPanel == "lyrics") "art" else "lyrics" }) {
                    Icon(Icons.Rounded.Lyrics, contentDescription = "Letras", tint = if (subPanel == "lyrics") palette.accent else palette.muted)
                }
                IconButton(onClick = { subPanel = if (subPanel == "queue") "art" else "queue" }) {
                    Icon(Icons.AutoMirrored.Rounded.QueueMusic, contentDescription = "Fila", tint = if (subPanel == "queue") palette.accent else palette.muted)
                }
                IconButton(onClick = { subPanel = if (subPanel == "eq") "art" else "eq" }) {
                    Icon(Icons.Rounded.Equalizer, contentDescription = "EQ", tint = if (subPanel == "eq") palette.accent else palette.muted)
                }
                IconButton(onClick = { subPanel = if (subPanel == "eq") "art" else "eq" }) {
                    Icon(Icons.Rounded.Timer, contentDescription = "Sono", tint = if (playback.sleepMinutes > 0) palette.accent else palette.muted)
                }
            }
        }
    }
}

@Composable
fun VideoAndIptvPlayerOverlay(
    palette: KPlayerThemePalette,
    title: String,
    exoPlayer: ExoPlayer,
    onClose: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.panel)
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose, modifier = Modifier.size(44.dp)) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = palette.text)
            }
            Text(
                text = title,
                color = palette.text,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = true
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )
    }
}

@Composable
fun IptvPortraitScreen(
    palette: KPlayerThemePalette,
    source: IptvSource,
    categories: List<IptvCategory>,
    items: List<IptvChannel>,
    selectedCategory: IptvCategory?,
    loading: Boolean,
    gridColumns: Int = 1,
    bottomInsetDp: Int = 148,
    onSelectSource: (IptvSource) -> Unit,
    onSelectCategory: (IptvCategory) -> Unit,
    onBackToCategories: () -> Unit,
    onPlayChannel: (IptvChannel) -> Unit,
    onAddUserUrl: (String) -> Unit,
    onRefresh: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var userUrlInput by remember { mutableStateOf("https://") }
    var showAddUrl by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg)
            .padding(horizontal = if (gridColumns > 1) 24.dp else 16.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (selectedCategory != null) {
                    IconButton(onClick = onBackToCategories) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, null, tint = palette.text)
                    }
                }
                Column {
                    Text(
                        text = selectedCategory?.name ?: "IPTV",
                        color = palette.text,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = if (selectedCategory != null) "${items.size} itens" else "Fontes abertas · Sem limite",
                        color = palette.muted,
                        fontSize = 12.sp,
                    )
                }
            }
            Row {
                if (source == IptvSource.USUARIO) {
                    IconButton(onClick = { showAddUrl = !showAddUrl }) {
                        Icon(Icons.Rounded.Add, contentDescription = "Adicionar link", tint = palette.accent)
                    }
                }
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = palette.text)
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(IptvSource.entries) { src ->
                val active = src == source
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (active) palette.accent else palette.panel,
                    modifier = Modifier.clickable { onSelectSource(src) },
                ) {
                    Text(
                        text = src.label,
                        color = if (active) palette.bg else palette.text,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
        }

        if (showAddUrl && source == IptvSource.USUARIO) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = userUrlInput,
                    onValueChange = { userUrlInput = it },
                    placeholder = { Text("https://sua-playlist.m3u8", color = palette.muted) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                )
                Button(
                    onClick = {
                        if (userUrlInput.startsWith("http")) {
                            onAddUserUrl(userUrlInput.trim())
                            showAddUrl = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent, contentColor = palette.bg),
                ) {
                    Text("Salvar")
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Filtrar lista...", color = palette.muted) },
            leadingIcon = { Icon(Icons.Rounded.Search, null, tint = palette.muted) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))

        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
        } else if (selectedCategory == null) {
            val filteredCats = categories.filter { query.isBlank() || it.name.contains(query, true) }
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns.coerceAtLeast(1)),
                contentPadding = PaddingValues(bottom = bottomInsetDp.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filteredCats, key = { it.id }) { cat ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.panel)
                            .clickable { onSelectCategory(cat) }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(cat.name, color = palette.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        if (cat.count > 0) {
                            Spacer(Modifier.width(8.dp))
                            Text("${cat.count}", color = palette.accent, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }
            }
        } else {
            val filteredItems = items.filter { query.isBlank() || it.name.contains(query, true) }
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns.coerceAtLeast(1)),
                contentPadding = PaddingValues(bottom = bottomInsetDp.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filteredItems, key = { it.id }) { ch ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.panel)
                            .clickable { onPlayChannel(ch) }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        VinylEmblem(palette = palette, sizeDp = 42, artUri = ch.logo.takeIf { it.isNotBlank() })
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(ch.name, color = palette.text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                text = listOfNotNull(ch.group.takeIf { it.isNotBlank() }, ch.year.takeIf { it.isNotBlank() }).joinToString(" · "),
                                color = palette.muted,
                                fontSize = 12.sp,
                                maxLines = 1,
                            )
                        }
                        Icon(Icons.Rounded.PlayArrow, contentDescription = "Assistir", tint = palette.accent)
                    }
                }
            }
        }
    }
}

@Composable
fun RadioPortraitScreen(
    palette: KPlayerThemePalette,
    selectedCategory: String,
    stations: List<RadioStation>,
    activeStation: RadioStation?,
    loading: Boolean,
    gridColumns: Int = 1,
    bottomInsetDp: Int = 148,
    onSelectCategory: (String) -> Unit,
    onPlayStation: (RadioStation) -> Unit,
    onRefresh: () -> Unit,
) {
    val categories = listOf("Brasil", "Mais ouvidas", "Pop", "Rock", "Notícias")
    var query by remember { mutableStateOf("") }
    val filtered = stations.filter { query.isBlank() || it.name.contains(query, true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg)
            .padding(horizontal = if (gridColumns > 1) 24.dp else 16.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Rádio Online", color = palette.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("Diretório aberto Radio-Browser", color = palette.muted, fontSize = 12.sp)
            }
            IconButton(onClick = onRefresh) {
                Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = palette.text)
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(categories) { cat ->
                val active = cat == selectedCategory
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (active) palette.accent else palette.panel,
                    modifier = Modifier.clickable { onSelectCategory(cat) },
                ) {
                    Text(
                        text = cat,
                        color = if (active) palette.bg else palette.text,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Buscar estação...", color = palette.muted) },
            leadingIcon = { Icon(Icons.Rounded.Search, null, tint = palette.muted) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns.coerceAtLeast(1)),
                contentPadding = PaddingValues(bottom = bottomInsetDp.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { st ->
                    val playing = activeStation?.id == st.id
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (playing) palette.elevated else palette.panel)
                            .clickable { onPlayStation(st) }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        VinylEmblem(palette = palette, sizeDp = 42, artUri = st.favicon.takeIf { it.isNotBlank() })
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                st.name,
                                color = if (playing) palette.accent else palette.text,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text("${st.country} · ${st.codec} · ${st.bitrate} kbps", color = palette.muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FootballPortraitScreen(
    palette: KPlayerThemePalette,
    matches: List<FootballMatch>,
    loading: Boolean,
    gridColumns: Int = 1,
    bottomInsetDp: Int = 148,
    onRefresh: () -> Unit,
) {
    var filter by remember { mutableStateOf("Todos") }
    val filters = listOf("Todos", "Ao vivo", "Brasil", "Europa")
    val filtered = matches.filter { m ->
        when (filter) {
            "Ao vivo" -> m.state == "live"
            "Brasil" -> m.region == "br"
            "Europa" -> m.region == "eu"
            else -> true
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg)
            .padding(horizontal = if (gridColumns > 1) 24.dp else 16.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Placar da Bola", color = palette.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("${matches.count { it.state == "live" }} ao vivo agora", color = palette.accent, fontSize = 12.sp)
            }
            IconButton(onClick = onRefresh) {
                Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = palette.text)
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filters) { f ->
                val active = f == filter
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (active) palette.accent else palette.panel,
                    modifier = Modifier.clickable { filter = f },
                ) {
                    Text(
                        text = f,
                        color = if (active) palette.bg else palette.text,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.accent)
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(gridColumns.coerceAtLeast(1)),
                contentPadding = PaddingValues(bottom = bottomInsetDp.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { m ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(palette.panel)
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(m.league, color = palette.muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                text = m.status,
                                color = if (m.state == "live") palette.accent else palette.dim,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(m.home, color = palette.text, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                            Text(
                                text = "${m.homeScore}  ×  ${m.awayScore}",
                                color = palette.accent,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp,
                                modifier = Modifier.padding(horizontal = 12.dp),
                            )
                            Text(
                                m.away,
                                color = palette.text,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                textAlign = TextAlign.End,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsAndTermsSheet(
    palette: KPlayerThemePalette,
    themeIndex: Int,
    isWide: Boolean = false,
    onSelectTheme: (Int) -> Unit,
    onClose: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        contentAlignment = Alignment.TopCenter,
    ) {
        LazyColumn(
            modifier = Modifier
                .widthIn(max = if (isWide) 760.dp else 1000.dp)
                .fillMaxSize()
                .padding(horizontal = if (isWide) 24.dp else 18.dp),
            contentPadding = PaddingValues(top = 14.dp, bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = palette.text)
                    }
                    Text("Opções & Termos", color = palette.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                }
            }
            item {
                Text("7 Temas de Cores", color = palette.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    KPLAYER_THEMES.forEachIndexed { idx, th ->
                        val chosen = idx == themeIndex
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .border(
                                    width = if (chosen) 2.5.dp else 1.dp,
                                    color = if (chosen) palette.text else palette.muted.copy(alpha = 0.35f),
                                    shape = CircleShape,
                                )
                                .clickable { onSelectTheme(idx) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(if (th.isLight) th.bg else th.accent),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text("Ativo: ${palette.name}", color = palette.muted, fontSize = 12.sp)
            }

            item {
                HorizontalDivider(color = palette.text.copy(alpha = 0.08f))
                Spacer(Modifier.height(6.dp))
                Text("Termos de Uso & Transparência", color = palette.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }

            items(KPLAYER_TERMS_PAGES) { page ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(palette.panel)
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(page.title, color = palette.accent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(page.body, color = palette.muted, fontSize = 13.sp, lineHeight = 19.sp)
                }
            }
        }
    }
}

@Composable
fun AdaptiveNavRail(
    palette: KPlayerThemePalette,
    currentTab: AndroidTab,
    expanded: Boolean,
    onSelect: (AndroidTab) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val entries = listOf(
        Triple(AndroidTab.HOME, "Início", Icons.Rounded.Home),
        Triple(AndroidTab.MUSIC, "Música", Icons.Rounded.LibraryMusic),
        Triple(AndroidTab.IPTV, "IPTV", Icons.Rounded.Tv),
        Triple(AndroidTab.RADIO, "Rádio", Icons.Rounded.Radio),
        Triple(AndroidTab.FOOTBALL, "Placar", Icons.Rounded.SportsSoccer),
    )
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .width(if (expanded) 196.dp else 80.dp)
            .background(palette.panel)
            .border(0.5.dp, palette.text.copy(alpha = 0.08f))
            .padding(vertical = 14.dp, horizontal = 10.dp),
        horizontalAlignment = if (expanded) Alignment.Start else Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = if (expanded) 8.dp else 0.dp, vertical = 6.dp),
        ) {
            VinylEmblem(palette = palette, sizeDp = 34)
            if (expanded) {
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("KPlayer", color = palette.text, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                    Text("v2.0.3", color = palette.accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        entries.forEach { (tab, label, icon) ->
            val active = tab == currentTab
            if (expanded) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) palette.accent.copy(alpha = 0.16f) else Color.Transparent)
                        .clickable { onSelect(tab) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(icon, contentDescription = label, tint = if (active) palette.accent else palette.muted, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = label,
                        color = if (active) palette.accent else palette.text,
                        fontSize = 14.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) palette.accent.copy(alpha = 0.16f) else Color.Transparent)
                        .clickable { onSelect(tab) }
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(icon, contentDescription = label, tint = if (active) palette.accent else palette.muted, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(label, color = if (active) palette.accent else palette.muted, fontSize = 10.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium)
                }
            }
        }
        Spacer(Modifier.weight(1f))
        if (expanded) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onOpenSettings)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.Settings, contentDescription = "Opções", tint = palette.muted, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text("Opções", color = palette.muted, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        } else {
            IconButton(onClick = onOpenSettings, modifier = Modifier.size(44.dp)) {
                Icon(Icons.Rounded.Settings, contentDescription = "Opções", tint = palette.muted)
            }
        }
    }
}

@Composable
fun BottomNavBar(
    palette: KPlayerThemePalette,
    currentTab: AndroidTab,
    onSelect: (AndroidTab) -> Unit,
) {
    val entries = listOf(
        Triple(AndroidTab.HOME, "Início", Icons.Rounded.Home),
        Triple(AndroidTab.MUSIC, "Música", Icons.Rounded.LibraryMusic),
        Triple(AndroidTab.IPTV, "IPTV", Icons.Rounded.Tv),
        Triple(AndroidTab.RADIO, "Rádio", Icons.Rounded.Radio),
        Triple(AndroidTab.FOOTBALL, "Placar", Icons.Rounded.SportsSoccer),
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(palette.panel)
            .border(0.5.dp, palette.text.copy(alpha = 0.08f))
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        entries.forEach { (tab, label, icon) ->
            val active = tab == currentTab
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onSelect(tab) }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (active) palette.accent else palette.muted,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = label,
                    color = if (active) palette.accent else palette.muted,
                    fontSize = 10.sp,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                )
            }
        }
    }
}
