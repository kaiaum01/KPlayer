package io.kplayer.android.player

import android.content.Context
import android.media.audiofx.Equalizer
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import io.kplayer.android.data.AudioTrack
import io.kplayer.android.data.EqPreset
import io.kplayer.android.data.IptvChannel
import io.kplayer.android.data.RadioStation
import io.kplayer.android.data.RepeatMode
import io.kplayer.android.data.VideoItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

data class PlaybackUiState(
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val activeTrack: AudioTrack? = null,
    val activeRadio: RadioStation? = null,
    val activeVideo: VideoItem? = null,
    val activeIptv: IptvChannel? = null,
    val queue: List<AudioTrack> = emptyList(),
    val queueIndex: Int = -1,
    val repeatMode: RepeatMode = RepeatMode.OFF,
    val shuffle: Boolean = false,
    val eqPreset: EqPreset = EqPreset.OFF,
    val playbackSpeed: Float = 1.0f,
    val sleepMinutes: Int = 0,
    val errorMessage: String? = null,
)

@OptIn(UnstableApi::class)
class KPlayerEngine(context: Context) {
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val dataSourceFactory = OkHttpDataSource.Factory(httpClient)
        .setUserAgent("Mozilla/5.0 (Linux; Android 14) KPlayer/2.0.3")

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
        .build()

    private var equalizer: Equalizer? = null

    private val _state = MutableStateFlow(PlaybackUiState())
    val state: StateFlow<PlaybackUiState> = _state.asStateFlow()

    init {
        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _state.value = _state.value.copy(isPlaying = isPlaying)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                _state.value = _state.value.copy(
                    isBuffering = playbackState == Player.STATE_BUFFERING,
                    durationMs = exoPlayer.duration.coerceAtLeast(0L),
                )
                if (playbackState == Player.STATE_ENDED) {
                    handleEnded()
                }
            }
        })
    }

    fun syncProgress() {
        _state.value = _state.value.copy(
            positionMs = exoPlayer.currentPosition.coerceAtLeast(0L),
            durationMs = exoPlayer.duration.coerceAtLeast(_state.value.activeTrack?.durationMs ?: 0L),
        )
    }

    fun playTrack(track: AudioTrack, queue: List<AudioTrack>) {
        val idx = queue.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        exoPlayer.setMediaItem(MediaItem.fromUri(track.uri))
        exoPlayer.prepare()
        exoPlayer.play()
        _state.value = _state.value.copy(
            activeTrack = track,
            activeRadio = null,
            activeVideo = null,
            activeIptv = null,
            queue = queue,
            queueIndex = idx,
            errorMessage = null,
        )
        applyEqualizer(_state.value.eqPreset)
    }

    fun playRadio(station: RadioStation) {
        exoPlayer.setMediaItem(MediaItem.fromUri(Uri.parse(station.url)))
        exoPlayer.prepare()
        exoPlayer.play()
        _state.value = _state.value.copy(
            activeRadio = station,
            activeTrack = null,
            activeVideo = null,
            activeIptv = null,
            errorMessage = null,
        )
    }

    fun playVideo(video: VideoItem) {
        exoPlayer.setMediaItem(MediaItem.fromUri(video.uri))
        exoPlayer.prepare()
        exoPlayer.play()
        _state.value = _state.value.copy(
            activeVideo = video,
            activeIptv = null,
            activeRadio = null,
            activeTrack = null,
            errorMessage = null,
        )
    }

    fun playIptv(channel: IptvChannel) {
        if (channel.url.isBlank()) return
        exoPlayer.setMediaItem(MediaItem.fromUri(Uri.parse(channel.url)))
        exoPlayer.prepare()
        exoPlayer.play()
        _state.value = _state.value.copy(
            activeIptv = channel,
            activeVideo = null,
            activeRadio = null,
            activeTrack = null,
            errorMessage = null,
        )
    }

    fun clearVideoOverlay() {
        exoPlayer.stop()
        _state.value = _state.value.copy(
            activeVideo = null,
            activeIptv = null,
            isPlaying = false,
        )
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
    }

    fun seekTo(ms: Long) {
        exoPlayer.seekTo(ms.coerceAtLeast(0L))
        syncProgress()
    }

    fun stepTrack(delta: Int) {
        val st = _state.value
        if (st.queue.isEmpty()) return
        val nextIdx = if (st.shuffle && st.queue.size > 1) {
            (st.queue.indices - st.queueIndex).random()
        } else {
            (st.queueIndex + delta + st.queue.size) % st.queue.size
        }
        playTrack(st.queue[nextIdx], st.queue)
    }

    fun cycleRepeat() {
        val next = when (_state.value.repeatMode) {
            RepeatMode.OFF -> RepeatMode.ALL
            RepeatMode.ALL -> RepeatMode.ONE
            RepeatMode.ONE -> RepeatMode.OFF
        }
        _state.value = _state.value.copy(repeatMode = next)
    }

    fun toggleShuffle() {
        _state.value = _state.value.copy(shuffle = !_state.value.shuffle)
    }

    fun setSpeed(speed: Float) {
        exoPlayer.playbackParameters = PlaybackParameters(speed)
        _state.value = _state.value.copy(playbackSpeed = speed)
    }

    fun setSleepMinutes(minutes: Int) {
        _state.value = _state.value.copy(sleepMinutes = minutes)
    }

    fun applyEqualizer(preset: EqPreset) {
        _state.value = _state.value.copy(eqPreset = preset)
        runCatching {
            val sessionId = exoPlayer.audioSessionId
            if (sessionId <= 0) return
            if (equalizer == null) {
                equalizer = Equalizer(0, sessionId)
            }
            val eq = equalizer ?: return
            eq.enabled = preset != EqPreset.OFF
            val bands = eq.numberOfBands.toInt()
            for (b in 0 until minOf(bands, preset.gainsMb.size)) {
                eq.setBandLevel(b.toShort(), preset.gainsMb[b].toShort())
            }
        }
    }

    private fun handleEnded() {
        val st = _state.value
        if (st.activeTrack == null) return
        when (st.repeatMode) {
            RepeatMode.ONE -> {
                exoPlayer.seekTo(0)
                exoPlayer.play()
            }
            RepeatMode.ALL -> stepTrack(1)
            RepeatMode.OFF -> {
                if (st.queueIndex + 1 < st.queue.size) stepTrack(1)
            }
        }
    }

    fun release() {
        runCatching { equalizer?.release() }
        exoPlayer.release()
    }
}
