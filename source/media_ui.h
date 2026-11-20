/* Real media data used by the simulator-inspired UI. No demo data in normal
 * use. */
static void play_path(const char *path);
static bool active = false, playing_audio = false, playing_radio = false,
            preview_mode = false;
static int dash_focus = 0, return_mode = 3, queue_count = 0, queue_index = 0;
static bool shuffle_seen[MAX_FILES];
static int shuffle_seen_count;
static char *queue_paths[MAX_FILES];
static char current_path[PATH_MAX], title[512], artist[512], album[512];
static SDL_Texture *cover_texture;
static int cover_w = 0, cover_h = 0;
static uint64_t media_size_bytes = 0;
static bool media_size_known = false;
static char media_format[16] = "AUDIO";
static unsigned media_sample_rate = 0, media_channels = 0,
                media_bitrate_kbps = 0;
static void media_ui_read_file_info(const char *path) {
  struct stat st;
  media_size_known =
      stat(path, &st) == 0 && S_ISREG(st.st_mode) && st.st_size >= 0;
  media_size_bytes = media_size_known ? (uint64_t)st.st_size : 0;
  const char *dot = strrchr(path, '.'), *slash = strrchr(path, '/');
  snprintf(media_format, sizeof(media_format), "AUDIO");
  if (dot && dot[1] && (!slash || dot > slash)) {
    size_t i = 0;
    for (; dot[i + 1] && i + 1 < sizeof(media_format); i++)
      media_format[i] = (char)toupper((unsigned char)dot[i + 1]);
    media_format[i] = 0;
  }
}
static bool local_title = false, local_artist = false, local_album = false,
            embedded_lyrics = false;
static char plain_lyrics[512][512];
static int plain_count = 0;
static bool meta_pending = false;
static uint32_t meta_deadline = 0, meta_next = 0;
typedef struct {
  long long time;
  char text[512];
} Lyric;
static Lyric lyrics[2048];
static int lyric_count = 0;
static long long lyric_offset = 0;
static uint64_t favorites[2048];
static int favorite_count = 0;
static long long preview_now = 35000, preview_duration = 195000;
static long long now_ms(void) {
  return preview_mode ? preview_now
         : active     ? libvlc_media_player_get_time(player)
                      : 0;
}
static long long duration_ms(void) {
  return preview_mode ? preview_duration
         : active     ? libvlc_media_player_get_length(player)
                      : 0;
}
static uint64_t media_hash_path(const char *path) {
  uint64_t h = 14695981039346656037ULL;
  for (const unsigned char *p = (const unsigned char *)path; *p; p++) {
    h ^= *p;
    h *= 1099511628211ULL;
  }
  return h;
}
static int favorite_index_for_path(const char *path) {
  char canonical[PATH_MAX], cwd[PATH_MAX];
  const char *resolved = realpath(path, canonical);
  uint64_t raw = media_hash_path(path);
  uint64_t absolute = resolved ? media_hash_path(resolved) : raw;
  uint64_t relative = absolute;
  if (resolved && getcwd(cwd, sizeof(cwd))) {
    size_t n = strlen(cwd);
    if (!strncmp(resolved, cwd, n) && resolved[n] == '/')
      relative = media_hash_path(resolved + n + 1);
  }
  for (int i = 0; i < favorite_count; i++)
    if (favorites[i] == raw || favorites[i] == absolute || favorites[i] == relative) return i;
  return -1;
}
static bool is_favorite_path(const char *path) { return favorite_index_for_path(path) >= 0; }
static bool is_favorite(void) {
  return is_favorite_path(current_path);
}
static void load_favorites(void) {
  FILE *f = fopen("favorites.cfg", "r");
  if (!f)
    return;
  unsigned long long h;
  while (favorite_count < 2048 && fscanf(f, "%llx", &h) == 1)
    favorites[favorite_count++] = h;
  fclose(f);
}
static void toggle_favorite(void) {
  if (!current_path[0])
    return;
  char canonical[PATH_MAX];
  const char *resolved = realpath(current_path, canonical);
  uint64_t h = media_hash_path(resolved ? resolved : current_path);
  int i = favorite_index_for_path(current_path);
  if (i >= 0) {
    memmove(favorites + i, favorites + i + 1,
            (favorite_count - i - 1) * sizeof(*favorites));
    favorite_count--;
  } else if (favorite_count < 2048)
    favorites[favorite_count++] = h;
  FILE *f = fopen("favorites.tmp", "w");
  if (f) {
    for (i = 0; i < favorite_count; i++)
      fprintf(f, "%016llx\n", (unsigned long long)favorites[i]);
    if (!fclose(f))
      rename("favorites.tmp", "favorites.cfg");
  }
}
static int lyric_compare(const void *a, const void *b) {
  long long x = ((const Lyric *)a)->time, y = ((const Lyric *)b)->time;
  return (x > y) - (x < y);
}
static void parse_lyric_line(char *line) {
  long long times[32];
  int count = 0;
  char *p = line;
  if (strlen(p) >= 3 && (unsigned char)p[0] == 0xef &&
      (unsigned char)p[1] == 0xbb && (unsigned char)p[2] == 0xbf)
    p += 3;
  if (!strncmp(p, "[offset:", 8)) {
    lyric_offset = strtoll(p + 8, NULL, 10);
    return;
  }
  while (*p == '[') {
    char *end = strchr(p, ']');
    if (!end)
      break;
    int mm;
    double ss;
    if (sscanf(p, "[%d:%lf]", &mm, &ss) == 2 && mm >= 0 && mm < 10000 &&
        ss >= 0 && ss < 60 && count < 32)
      times[count++] = (long long)(mm * 60000 + ss * 1000 + .5);
    p = end + 1;
  }
  p[strcspn(p, "\r\n")] = 0;
  while (*p == ' ' || *p == '\t')
    p++;
  if (!*p)
    return;
  for (int j = 0; j < count && lyric_count < 2048; j++) {
    lyrics[lyric_count].time = times[j];
    snprintf(lyrics[lyric_count++].text, 512, "%.511s", p);
  }
}
static void load_lyrics(const char *media_path) {
  lyric_count = 0;
  lyric_offset = 0;
  plain_count = 0;
  embedded_lyrics = false;
  char path[PATH_MAX];
  snprintf(path, sizeof(path), "%s", media_path);
  char *dot = strrchr(path, '.');
  if (!dot || strlen(path) + 4 >= sizeof(path))
    return;
  strcpy(dot, ".lrc");
  FILE *f = fopen(path, "r");
  if (!f) {
    strcpy(dot, ".LRC");
    f = fopen(path, "r");
  }
  if (!f)
    return;
  char line[4096];
  while (fgets(line, sizeof(line), f) && lyric_count < 2048)
    parse_lyric_line(line);
  fclose(f);
  qsort(lyrics, lyric_count, sizeof(*lyrics), lyric_compare);
}
static void load_embedded_lyrics(const char *text) {
  if (lyric_count || !text || !*text)
    return;
  char *copy = strdup(text);
  if (!copy)
    return;
  char *save = NULL;
  for (char *line = strtok_r(copy, "\r\n", &save); line;
       line = strtok_r(NULL, "\r\n", &save)) {
    if (plain_count < 512)
      snprintf(plain_lyrics[plain_count++], 512, "%.511s", line);
    parse_lyric_line(line);
  }
  free(copy);
  qsort(lyrics, lyric_count, sizeof(*lyrics), lyric_compare);
  embedded_lyrics = lyric_count > 0 || plain_count > 0;
  if (lyric_count)
    plain_count = 0;
}
static int current_lyric(void) {
  long long t = now_ms() + lyric_offset;
  int idx = -1;
  for (int i = 0; i < lyric_count; i++) {
    if (lyrics[i].time > t)
      break;
    idx = i;
  }
  return idx;
}
static bool image_at(const char *path) {
  int w, h, n;
  if (!stbi_info(path, &w, &h, &n) || w < 1 || h < 1 || w > 2048 || h > 2048)
    return false;
  unsigned char *p = stbi_load(path, &w, &h, &n, 4);
  if (!p)
    return false;
  SDL_Texture *t = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                     SDL_TEXTUREACCESS_STATIC, w, h);
  if (t) {
    SDL_UpdateTexture(t, NULL, p, w * 4);
    SDL_SetTextureBlendMode(t, SDL_BLENDMODE_BLEND);
    if (cover_texture)
      SDL_DestroyTexture(cover_texture);
    cover_texture = t;
    cover_w = w;
    cover_h = h;
  }
  stbi_image_free(p);
  return t != NULL;
}
static void load_cover(const char *media_path) {
  if (cover_texture) {
    SDL_DestroyTexture(cover_texture);
    cover_texture = NULL;
  }
  char path[PATH_MAX];
  snprintf(path, sizeof(path), "%s", media_path);
  char *dot = strrchr(path, '.');
  if (dot) {
    *dot = 0;
    size_t n = strlen(path);
    if (n + 5 < sizeof(path)) {
      strcpy(path + n, ".jpg");
      if (image_at(path))
        return;
      strcpy(path + n, ".png");
      if (image_at(path))
        return;
    }
  }
  snprintf(path, sizeof(path), "%s", media_path);
  char *slash = strrchr(path, '/');
  if (!slash)
    return;
  slash[1] = 0;
  size_t n = strlen(path);
  const char *names[] = {"cover.jpg",  "cover.png", "folder.jpg",
                         "folder.png", "front.jpg", "front.png"};
  for (size_t i = 0; i < sizeof(names) / sizeof(*names); i++) {
    if (n + strlen(names[i]) >= sizeof(path))
      continue;
    strcpy(path + n, names[i]);
    if (image_at(path))
      return;
  }
}
#include "tags.h"
static void apply_local_metadata(const char *path) {
  LocalTags t;
  read_local_tags(path, &t);
  local_title = *t.title;
  local_artist = *t.artist;
  local_album = *t.album;
  if (local_title)
    snprintf(title, sizeof(title), "%s", t.title);
  if (local_artist)
    snprintf(artist, sizeof(artist), "%s", t.artist);
  if (local_album)
    snprintf(album, sizeof(album), "%s", t.album);
  if (!cover_texture && t.picture && t.picture_size <= INT_MAX) {
    int w, h, n;
    if (stbi_info_from_memory(t.picture, (int)t.picture_size, &w, &h, &n) &&
        w > 0 && h > 0 && w <= 2048 && h <= 2048) {
      unsigned char *pixels =
          stbi_load_from_memory(t.picture, (int)t.picture_size, &w, &h, &n, 4);
      if (pixels) {
        SDL_Texture *texture = SDL_CreateTexture(
            renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, w, h);
        if (texture) {
          SDL_UpdateTexture(texture, NULL, pixels, w * 4);
          SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
          cover_texture = texture;
          cover_w = w;
          cover_h = h;
        }
        stbi_image_free(pixels);
      }
    }
  }
  load_embedded_lyrics(t.lyrics);
  free_local_tags(&t);
}
static void update_metadata(void) {
  if (!active || !meta_pending || SDL_GetTicks() < meta_next)
    return;
  meta_next = SDL_GetTicks() + 1000;
  if (SDL_GetTicks() > meta_deadline)
    meta_pending = false;
  libvlc_media_t *m = libvlc_media_player_get_media(player);
  if (!m)
    return;
  char *v = libvlc_media_get_meta(m, libvlc_meta_Title);
  if (v && *v && !local_title)
    snprintf(title, sizeof(title), "%s", v);
  libvlc_free(v);
  v = libvlc_media_get_meta(m, libvlc_meta_Artist);
  if (v && *v && !local_artist)
    snprintf(artist, sizeof(artist), "%s", v);
  libvlc_free(v);
  v = libvlc_media_get_meta(m, libvlc_meta_Album);
  if (v && *v && !local_album)
    snprintf(album, sizeof(album), "%s", v);
  libvlc_free(v);
  libvlc_media_track_t **tracks = NULL;
  unsigned track_count = libvlc_media_tracks_get(m, &tracks);
  for (unsigned i = 0; i < track_count; i++) {
    libvlc_media_track_t *track = tracks[i];
    if (!track || track->i_type != libvlc_track_audio || !track->audio)
      continue;
    media_sample_rate = track->audio->i_rate;
    media_channels = track->audio->i_channels;
    if (track->i_bitrate)
      media_bitrate_kbps = track->i_bitrate / 1000;
    break;
  }
  if (tracks)
    libvlc_media_tracks_release(tracks, track_count);
  long long length = duration_ms();
  if (!media_bitrate_kbps && media_size_known && length > 0)
    media_bitrate_kbps =
        (unsigned)((media_size_bytes * 8u) / (uint64_t)length);
  libvlc_media_release(m);
}
static void clear_queue(void) {
  for (int i = 0; i < queue_count; i++)
    free(queue_paths[i]);
  queue_count = 0;
  queue_index = 0;
  memset(shuffle_seen, 0, sizeof(shuffle_seen));
  shuffle_seen_count = 0;
}
static void build_queue(void) {
  clear_queue();
  bool music = audio_file(items[selected].name);
  for (int i = 0; i < total; i++) {
    if (items[i].dir || audio_file(items[i].name) != music)
      continue;
    const char *p = items[i].path;
    if (!p)
      continue;
    if (i == selected)
      queue_index = queue_count;
    queue_paths[queue_count] = strdup(p);
    if (queue_paths[queue_count])
      queue_count++;
  }
}
static bool queue_advance(int direction, bool natural) {
  if (queue_count <= 0 || queue_index < 0 || queue_index >= queue_count) return false;
  if (natural && repeat_mode == 1) return true;
  if (shuffle_enabled && playing_audio && direction > 0) {
    if (!shuffle_seen[queue_index]) {
      shuffle_seen[queue_index] = true;
      shuffle_seen_count++;
    }
    int left = queue_count - shuffle_seen_count;
    if (!left) {
      if (repeat_mode != 2) return false;
      memset(shuffle_seen, 0, sizeof(shuffle_seen));
      shuffle_seen_count = 0;
      if (queue_count > 1) { shuffle_seen[queue_index] = true; shuffle_seen_count = 1; }
      left = queue_count - shuffle_seen_count;
    }
    int chosen = rand() % left;
    for (int i = 0; i < queue_count; i++) {
      if (!shuffle_seen[i] && chosen-- == 0) { queue_index = i; return true; }
    }
    return false;
  }
  int next = queue_index + direction;
  if (next < 0 || next >= queue_count) {
    if (repeat_mode != 2) return false;
    next = next < 0 ? queue_count - 1 : 0;
  }
  queue_index = next;
  return true;
}
static void next_media(int direction) {
  if (queue_advance(direction, false)) play_path(queue_paths[queue_index]);
}
static int battery_percent = -1;
static char clock_text[16] = "--:--", disk_text[64] = "",
            top_location[96] = "dArkOS / ARM64";
static uint32_t status_next = 0;
static void update_status(void) {
  if (preview_mode) {
    snprintf(clock_text, sizeof(clock_text), "12:00");
    snprintf(disk_text, sizeof(disk_text), "%s", tr("Mídias locais"));
    snprintf(top_location, sizeof(top_location), "Umuarama, PR");
    return;
  }
  network_location_start();
  if (SDL_GetTicks() < status_next)
    return;
  status_next = SDL_GetTicks() + 10000;
  time_t t = time(NULL);
  struct tm tm;
  bool location_valid;
  int utc_offset;
  network_location_snapshot(top_location, sizeof(top_location), &location_valid,
                            &utc_offset);
  if (location_valid) {
    t += utc_offset;
    if (gmtime_r(&t, &tm))
      strftime(clock_text, sizeof(clock_text), "%H:%M", &tm);
  } else if (localtime_r(&t, &tm))
    strftime(clock_text, sizeof(clock_text), "%H:%M", &tm);
  snprintf(disk_text, sizeof(disk_text), "%s", tr("Armazenamento local"));
  struct statvfs fs;
  if (!statvfs(root, &fs))
    snprintf(disk_text, sizeof(disk_text), tr("%.1f GB livres"),
             (double)fs.f_bavail * fs.f_frsize / (1024. * 1024. * 1024.));
  glob_t g = {0};
  if (!glob("/sys/class/power_supply/*/capacity", 0, NULL, &g)) {
    for (size_t i = 0; i < g.gl_pathc; i++) {
      FILE *f = fopen(g.gl_pathv[i], "r");
      int b;
      if (f) {
        if (fscanf(f, "%d", &b) == 1 && b >= 0 && b <= 100)
          battery_percent = b;
        fclose(f);
        if (battery_percent >= 0)
          break;
      }
    }
  }
  globfree(&g);
}
