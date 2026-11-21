package io.kplayer.android.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import java.io.File

object MediaScanner {
    private val LRC_TAG_REGEX = Regex("""\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?]""")

    fun parseLrc(raw: String): List<LrcLine> {
        val result = mutableListOf<LrcLine>()
        raw.lineSequence().forEach { line ->
            val matches = LRC_TAG_REGEX.findAll(line).toList()
            if (matches.isEmpty()) return@forEach
            val text = line.replace(LRC_TAG_REGEX, "").trim()
            if (text.isEmpty()) return@forEach
            matches.forEach { m ->
                val min = m.groupValues[1].toLongOrNull() ?: 0L
                val sec = m.groupValues[2].toLongOrNull() ?: 0L
                val fracRaw = m.groupValues[3]
                val ms = when (fracRaw.length) {
                    1 -> (fracRaw.toLongOrNull() ?: 0L) * 100L
                    2 -> (fracRaw.toLongOrNull() ?: 0L) * 10L
                    3 -> fracRaw.toLongOrNull() ?: 0L
                    else -> 0L
                }
                result.add(LrcLine(min * 60_000L + sec * 1_000L + ms, text))
            }
        }
        return result.sortedBy { it.timeMs }
    }

    fun scanAudio(context: Context): List<AudioTrack> {
        val list = mutableListOf<AudioTrack>()
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.RELATIVE_PATH,
            MediaStore.Audio.Media.DATA,
        )
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.SIZE} >= 51200"
        val sortOrder = "${MediaStore.Audio.Media.TITLE} ASC"

        try {
            context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder,
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
                val durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val relCol = cursor.getColumnIndex(MediaStore.Audio.Media.RELATIVE_PATH)
                val dataCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATA)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
                    val albumId = cursor.getLong(albumIdCol)
                    val artUri = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"),
                        albumId,
                    )
                    val displayName = cursor.getString(nameCol) ?: ""
                    val ext = displayName.substringAfterLast('.', "MP3").uppercase().take(6)
                    val folder = (if (relCol >= 0) cursor.getString(relCol) else null)
                        ?.trim('/')
                        ?.substringAfterLast('/')
                        ?.ifBlank { "Músicas" } ?: "Músicas"

                    // Attempt sibling .lrc lookup when file path is readable
                    val lrcLines = if (dataCol >= 0) {
                        val filePath = cursor.getString(dataCol)
                        if (!filePath.isNullOrBlank()) {
                            val lrcFile = File(filePath.substringBeforeLast('.') + ".lrc")
                            if (lrcFile.isFile && lrcFile.canRead()) {
                                runCatching { parseLrc(lrcFile.readText(Charsets.UTF_8)) }.getOrDefault(emptyList())
                            } else emptyList()
                        } else emptyList()
                    } else emptyList()

                    list.add(
                        AudioTrack(
                            id = "audio-$id",
                            title = cursor.getString(titleCol)?.ifBlank { displayName } ?: "Faixa",
                            artist = cursor.getString(artistCol)?.takeIf { it != "<unknown>" } ?: "Artista desconhecido",
                            album = cursor.getString(albumCol)?.takeIf { it != "<unknown>" } ?: folder,
                            durationMs = cursor.getLong(durCol).coerceAtLeast(0L),
                            uri = uri,
                            artUri = artUri,
                            format = ext,
                            sizeBytes = cursor.getLong(sizeCol).coerceAtLeast(0L),
                            folderName = folder,
                            lrcLines = lrcLines,
                        ),
                    )
                }
            }
        } catch (_: SecurityException) {
            // Permission not granted yet
        }
        return list
    }

    fun scanVideos(context: Context): List<VideoItem> {
        val list = mutableListOf<VideoItem>()
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.TITLE,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.RELATIVE_PATH,
        )
        val sortOrder = "${MediaStore.Video.Media.DATE_MODIFIED} DESC"

        try {
            context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder,
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.TITLE)
                val durCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val relCol = cursor.getColumnIndex(MediaStore.Video.Media.RELATIVE_PATH)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                    val displayName = cursor.getString(nameCol) ?: "Vídeo"
                    val folder = (if (relCol >= 0) cursor.getString(relCol) else null)
                        ?.trim('/')
                        ?.substringAfterLast('/')
                        ?.ifBlank { "Vídeos" } ?: "Vídeos"

                    list.add(
                        VideoItem(
                            id = "video-$id",
                            title = cursor.getString(titleCol)?.ifBlank { displayName } ?: displayName,
                            durationMs = cursor.getLong(durCol).coerceAtLeast(0L),
                            uri = uri,
                            sizeBytes = cursor.getLong(sizeCol).coerceAtLeast(0L),
                            folderName = folder,
                        ),
                    )
                }
            }
        } catch (_: SecurityException) {
            // Permission not granted yet
        }
        return list
    }

    fun parseM3uPlaylist(raw: String, defaultGroup: String = "IPTV do Usuário"): List<IptvChannel> {
        val out = mutableListOf<IptvChannel>()
        var pendingName = ""
        var pendingGroup = defaultGroup
        var pendingLogo = ""
        var idx = 0

        raw.lineSequence().forEach { rawLine ->
            val line = rawLine.trim().removePrefix("\uFEFF")
            if (line.isEmpty()) return@forEach
            if (line.startsWith("#EXTINF", ignoreCase = true)) {
                pendingName = line.substringAfter(',', "").trim()
                pendingGroup = extractAttr(line, "group-title").ifBlank { defaultGroup }
                pendingLogo = extractAttr(line, "tvg-logo")
            } else if (!line.startsWith("#") && (line.startsWith("http://") || line.startsWith("https://"))) {
                idx++
                out.add(
                    IptvChannel(
                        id = "user-$idx-${line.hashCode()}",
                        name = pendingName.ifBlank { "Canal $idx" },
                        url = line,
                        group = pendingGroup,
                        logo = pendingLogo,
                        mediaType = "live",
                    ),
                )
                pendingName = ""
                pendingGroup = defaultGroup
                pendingLogo = ""
            }
        }
        return out
    }

    private fun extractAttr(line: String, key: String): String {
        val pattern = Regex("""$key="([^"]*)"""", RegexOption.IGNORE_CASE)
        return pattern.find(line)?.groupValues?.getOrNull(1)?.trim() ?: ""
    }
}
