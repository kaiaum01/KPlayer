/* Radio Browser client and controller-friendly online radio screen.
 * Catalog requests run outside the SDL thread; libVLC plays station streams. */
#define RADIO_MAX_STATIONS 40
static void toggle_pause(void);
typedef struct {
  char uuid[48];
  char name[128];
  char url[1024];
  char tags[128];
  char country[48];
  char codec[24];
  char favicon[1024];
  int bitrate;
} RadioStation;

static RadioStation radio_stations[RADIO_MAX_STATIONS];
static pthread_mutex_t radio_mutex = PTHREAD_MUTEX_INITIALIZER;
static int radio_count = 0, radio_selected = 0, radio_filter = 0;
static bool radio_loading = false;
static char radio_error[128];
static const char *radio_filter_names[] = {"Brasil", "Mais ouvidas", "Pop",
                                           "Rock", "Notícias", "Rádio do Usuário"};

/* The optional curl executable downloads one logo at a time off the UI thread.
 * SDL texture creation and destruction remain on the rendering thread. */
extern char **environ;
static pthread_mutex_t radio_art_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool radio_art_busy;
static char radio_art_requested[1024], radio_art_result_url[1024];
static unsigned char *radio_art_bytes;
static size_t radio_art_size;
static SDL_Texture *radio_art_texture;
static char radio_art_display_url[1024];

static void *radio_art_worker(void *argument) {
  char *url = argument;
  char path[] = "/tmp/kplayer-radio-art-XXXXXX";
  int fd = mkstemp(path);
  unsigned char *bytes = NULL;
  size_t size = 0;
  if (fd >= 0) {
    close(fd);
    char *args[] = {"curl", "--silent", "--fail", "--location",
                    "--max-time", "10", "--connect-timeout", "4",
                    "--max-redirs", "3", "--max-filesize", "2097152",
                    "--proto", "=http,https", "--proto-redir", "=http,https",
                    "--output", path, "--", url, NULL};
    pid_t child;
    if (posix_spawnp(&child, "curl", NULL, NULL, args, environ) == 0) {
      int status = 0;
      pid_t result;
      do { result = waitpid(child, &status, 0); } while (result < 0 && errno == EINTR);
      struct stat st;
      if (result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0 &&
          stat(path, &st) == 0 && st.st_size > 0 && st.st_size <= 2097152) {
        FILE *file = fopen(path, "rb");
        if (file) {
          bytes = malloc((size_t)st.st_size);
          if (bytes) {
            size = fread(bytes, 1, (size_t)st.st_size, file);
            if (size != (size_t)st.st_size) { free(bytes); bytes = NULL; size = 0; }
          }
          fclose(file);
        }
      }
    }
    unlink(path);
  }
  pthread_mutex_lock(&radio_art_mutex);
  free(radio_art_bytes);
  radio_art_bytes = bytes;
  radio_art_size = size;
  snprintf(radio_art_result_url, sizeof(radio_art_result_url), "%s", url);
  radio_art_busy = false;
  pthread_mutex_unlock(&radio_art_mutex);
  free(url);
  return NULL;
}

static void radio_update_art(const char *url) {
  if (!url) url = "";
  pthread_mutex_lock(&radio_art_mutex);
  if (radio_art_result_url[0]) {
    if (!strcmp(radio_art_result_url, url) && radio_art_bytes && radio_art_size) {
      int w = 0, h = 0, n = 0;
      if (stbi_info_from_memory(radio_art_bytes, (int)radio_art_size, &w, &h, &n) &&
          w > 0 && h > 0 && w <= 2048 && h <= 2048) {
        unsigned char *pixels = stbi_load_from_memory(radio_art_bytes,
            (int)radio_art_size, &w, &h, &n, 4);
        if (pixels) {
          SDL_Texture *texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                                    SDL_TEXTUREACCESS_STATIC, w, h);
          if (texture) {
            SDL_UpdateTexture(texture, NULL, pixels, w * 4);
            SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
            if (radio_art_texture) SDL_DestroyTexture(radio_art_texture);
            radio_art_texture = texture;
            snprintf(radio_art_display_url, sizeof(radio_art_display_url), "%s", url);
          }
          stbi_image_free(pixels);
        }
      }
    }
    free(radio_art_bytes); radio_art_bytes = NULL; radio_art_size = 0;
    radio_art_result_url[0] = 0;
  }
  if (strcmp(url, radio_art_display_url)) {
    if (radio_art_texture) SDL_DestroyTexture(radio_art_texture);
    radio_art_texture = NULL; radio_art_display_url[0] = 0;
  }
  if (!radio_art_busy && strcmp(url, radio_art_requested)) {
    snprintf(radio_art_requested, sizeof(radio_art_requested), "%s", url);
    if (!strncmp(url, "http://", 7) || !strncmp(url, "https://", 8)) {
      char *copy = strdup(url);
      pthread_t worker;
      if (copy) {
        radio_art_busy = true;
        if (pthread_create(&worker, NULL, radio_art_worker, copy) == 0)
          pthread_detach(worker);
        else { radio_art_busy = false; free(copy); }
      }
    }
  }
  pthread_mutex_unlock(&radio_art_mutex);
}

static const char *radio_json_value(const char *json, const char *key) {
  char pattern[64];
  if (snprintf(pattern, sizeof(pattern), "\"%s\"", key) >=
      (int)sizeof(pattern))
    return NULL;
  const char *p = strstr(json, pattern);
  if (!p)
    return NULL;
  p += strlen(pattern);
  while (*p == ' ' || *p == '\t')
    p++;
  if (*p++ != ':')
    return NULL;
  while (*p == ' ' || *p == '\t')
    p++;
  return p;
}

static bool radio_json_string(const char *json, const char *key, char *out,
                              size_t size) {
  const char *p = radio_json_value(json, key);
  if (!p || *p++ != '"' || !size)
    return false;
  size_t used = 0;
  while (*p && *p != '"') {
    unsigned char c = (unsigned char)*p++;
    if (c == '\\' && *p) {
      c = (unsigned char)*p++;
      if (c == 'n' || c == 'r' || c == 't')
        c = ' ';
      else if (c == 'u') {
        /* Preserve layout for rare escaped code points. Literal UTF-8 passes
         * through unchanged, which is what the API normally returns. */
        for (int i = 0; i < 4 && *p; i++, p++)
          ;
        c = '?';
      }
    }
    if (used + 1 < size)
      out[used++] = (char)c;
  }
  out[used] = 0;
  return *p == '"';
}

static int radio_json_number(const char *json, const char *key) {
  const char *p = radio_json_value(json, key);
  return p ? atoi(p) : 0;
}

static int radio_parse_stations(const char *json, RadioStation *stations,
                                int capacity) {
  int count = 0;
  const char *p = json;
  while (count < capacity && (p = strchr(p, '{')) != NULL) {
    const char *start = p++;
    bool quoted = false, escaped = false;
    int depth = 1;
    while (*p && depth) {
      if (escaped)
        escaped = false;
      else if (*p == '\\' && quoted)
        escaped = true;
      else if (*p == '"')
        quoted = !quoted;
      else if (!quoted && *p == '{')
        depth++;
      else if (!quoted && *p == '}')
        depth--;
      p++;
    }
    size_t length = (size_t)(p - start);
    if (depth || length >= 32768)
      break;
    char *object = malloc(length + 1);
    if (!object)
      break;
    memcpy(object, start, length);
    object[length] = 0;
    RadioStation station = {0};
    radio_json_string(object, "stationuuid", station.uuid,
                      sizeof(station.uuid));
    radio_json_string(object, "name", station.name, sizeof(station.name));
    if (!radio_json_string(object, "url_resolved", station.url,
                           sizeof(station.url)) ||
        !station.url[0])
      radio_json_string(object, "url", station.url, sizeof(station.url));
    radio_json_string(object, "tags", station.tags, sizeof(station.tags));
    radio_json_string(object, "country", station.country,
                      sizeof(station.country));
    radio_json_string(object, "codec", station.codec, sizeof(station.codec));
    radio_json_string(object, "favicon", station.favicon, sizeof(station.favicon));
    station.bitrate = radio_json_number(object, "bitrate");
    free(object);
    if (station.name[0] && station.url[0])
      stations[count++] = station;
  }
  return count;
}

static bool radio_http_get(const char *path, char **body_out) {
  const char *hosts[] = {"all.api.radio-browser.info",
                         "de1.api.radio-browser.info",
                         "de2.api.radio-browser.info",
                         "at1.api.radio-browser.info"};
  *body_out = NULL;
  for (size_t host_i = 0; host_i < sizeof(hosts) / sizeof(hosts[0]); host_i++) {
    struct addrinfo hints = {0}, *addresses = NULL;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(hosts[host_i], "80", &hints, &addresses))
      continue;
    int fd = -1;
    for (struct addrinfo *it = addresses; it; it = it->ai_next) {
      fd = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
      if (fd < 0)
        continue;
      struct timeval timeout = {.tv_sec = 7, .tv_usec = 0};
      setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
      setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
      if (!connect(fd, it->ai_addr, it->ai_addrlen))
        break;
      close(fd);
      fd = -1;
    }
    freeaddrinfo(addresses);
    if (fd < 0)
      continue;
    char request[1024];
    int request_size = snprintf(
        request, sizeof(request),
        "GET %s HTTP/1.0\r\nHost: %s\r\nUser-Agent: KPlayer/1.0.0 "
        "(PortMaster; R36S)\r\nAccept: application/json\r\nConnection: close\r\n\r\n",
        path, hosts[host_i]);
    if (request_size <= 0 || request_size >= (int)sizeof(request)) {
      close(fd);
      continue;
    }
    size_t sent = 0;
    while (sent < (size_t)request_size) {
      ssize_t n = send(fd, request + sent, (size_t)request_size - sent,
                       MSG_NOSIGNAL);
      if (n <= 0)
        break;
      sent += (size_t)n;
    }
    size_t capacity = 65536, used = 0;
    char *response = malloc(capacity);
    if (!response) {
      close(fd);
      return false;
    }
    while (sent == (size_t)request_size && used + 1 < 524288) {
      if (used + 8192 + 1 > capacity) {
        size_t next = capacity * 2;
        char *grown = realloc(response, next);
        if (!grown)
          break;
        response = grown;
        capacity = next;
      }
      ssize_t n = recv(fd, response + used, capacity - used - 1, 0);
      if (n <= 0)
        break;
      used += (size_t)n;
    }
    close(fd);
    response[used] = 0;
    bool ok = (!strncmp(response, "HTTP/1.0 200", 12) ||
               !strncmp(response, "HTTP/1.1 200", 12));
    char *body = ok ? strstr(response, "\r\n\r\n") : NULL;
    if (body) {
      body += 4;
      char *copy = strdup(body);
      free(response);
      if (copy) {
        *body_out = copy;
        return true;
      }
      return false;
    }
    free(response);
  }
  return false;
}

/* One entry is created for each HTTP(S) address in a supported playlist.
 * Files are capped to avoid blocking on huge or non-regular inputs. */
static int radio_read_user_folder(const char *folder_path, RadioStation *out,
                                  int capacity) {
  mkdir(folder_path, 0755);
  DIR *dir = opendir(folder_path);
  if (!dir) return 0;
  int count = 0;
  struct dirent *entry;
  while (count < capacity && (entry = readdir(dir))) {
    const char *ext = strrchr(entry->d_name, '.');
    if (!ext || (strcasecmp(ext, ".pls") && strcasecmp(ext, ".asx") &&
                 strcasecmp(ext, ".m3u") && strcasecmp(ext, ".m3u8"))) continue;
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "%s/%s", folder_path, entry->d_name) >= (int)sizeof(path)) continue;
    struct stat st;
    if (lstat(path, &st) || !S_ISREG(st.st_mode) || st.st_size > 65536 || st.st_size <= 0) continue;
    FILE *f = fopen(path, "rb");
    if (!f) continue;
    char line[4096];
    int number = 0;
    while (count < capacity && fgets(line, sizeof(line), f)) {
      char *start = line;
      while (*start && isspace((unsigned char)*start)) start++;
      if (*start == '#' || *start == ';') continue;
      char *http = strstr(start, "http://");
      char *https = strstr(start, "https://");
      if (!http || (https && https < http)) http = https;
      if (!http) continue;
      RadioStation station = {0};
      size_t n = 0;
      while (http[n] && !isspace((unsigned char)http[n]) && http[n] != '\"' &&
             http[n] != '\'' && http[n] != '<' && n + 1 < sizeof(station.url)) {
        station.url[n] = http[n]; n++;
      }
      if (n == 0 || (http[n] && !isspace((unsigned char)http[n]) &&
                     http[n] != '\"' && http[n] != '\'' && http[n] != '<')) continue;
      station.url[n] = 0;
      /* XML escaping is common in ASX query strings. */
      char *amp;
      while ((amp = strstr(station.url, "&amp;"))) memmove(amp + 1, amp + 5, strlen(amp + 5) + 1);
      int name_len = (int)(ext - entry->d_name);
      if (name_len > 100) name_len = 100;
      number++;
      if (number == 1) snprintf(station.name, sizeof(station.name), "%.*s", name_len, entry->d_name);
      else snprintf(station.name, sizeof(station.name), "%.*s (%d)", name_len, entry->d_name, number);
      snprintf(station.tags, sizeof(station.tags), "Rádio do Usuário");
      snprintf(station.codec, sizeof(station.codec), "STREAM");
      out[count++] = station;
    }
    fclose(f);
  }
  closedir(dir);
  return count;
}

static const char *radio_path_for_filter(int filter) {
  static const char *paths[] = {
      "/json/stations/bycountrycodeexact/BR?hidebroken=true&order=clickcount&reverse=true&limit=40",
      "/json/stations/topclick/40?hidebroken=true",
      "/json/stations/bytagexact/pop?hidebroken=true&order=clickcount&reverse=true&limit=40",
      "/json/stations/bytagexact/rock?hidebroken=true&order=clickcount&reverse=true&limit=40",
      "/json/stations/bytagexact/news?hidebroken=true&order=clickcount&reverse=true&limit=40"};
  return paths[filter >= 0 && filter < 5 ? filter : 0];
}

static void *radio_catalog_worker(void *argument) {
  int filter = *(int *)argument;
  free(argument);
  for (;;) {
  char *body = NULL;
  RadioStation found[RADIO_MAX_STATIONS];
  int count = 0;
  if (filter == 5) {
    count = radio_read_user_folder("radios_usuario", found, RADIO_MAX_STATIONS);
  } else if (radio_http_get(radio_path_for_filter(filter), &body)) {
    count = radio_parse_stations(body, found, RADIO_MAX_STATIONS);
    free(body);
  }
  pthread_mutex_lock(&radio_mutex);
  if (filter == radio_filter) {
    radio_count = count;
    radio_selected = 0;
    if (count)
      memcpy(radio_stations, found, (size_t)count * sizeof(*found));
    snprintf(radio_error, sizeof(radio_error), "%s",
             count ? "" : filter == 5 ? "Nenhuma rádio do usuário" : "Sem conexão ou nenhuma estação encontrada");
    radio_loading = false;
    pthread_mutex_unlock(&radio_mutex);
    return NULL;
  }
  /* A categoria mudou enquanto a consulta estava em andamento. Não deixe
   * radio_loading preso nem apresente os resultados da categoria antiga. */
  filter = radio_filter;
  pthread_mutex_unlock(&radio_mutex);
  }
  return NULL;
}

static void radio_refresh(void) {
  pthread_mutex_lock(&radio_mutex);
  if (radio_loading) {
    pthread_mutex_unlock(&radio_mutex);
    return;
  }
  radio_loading = true;
  radio_error[0] = 0;
  int *filter = malloc(sizeof(*filter));
  if (filter)
    *filter = radio_filter;
  pthread_mutex_unlock(&radio_mutex);
  if (!filter) {
    pthread_mutex_lock(&radio_mutex);
    radio_loading = false;
    pthread_mutex_unlock(&radio_mutex);
    return;
  }
  pthread_t worker;
  if (!pthread_create(&worker, NULL, radio_catalog_worker, filter))
    pthread_detach(worker);
  else {
    free(filter);
    pthread_mutex_lock(&radio_mutex);
    radio_loading = false;
    snprintf(radio_error, sizeof(radio_error), "Falha ao iniciar a consulta");
    pthread_mutex_unlock(&radio_mutex);
  }
}

static void radio_open(void) {
  mode = 7;
  mkdir("radios_usuario", 0755);
  if (!radio_count)
    radio_refresh();
}

static void *radio_click_worker(void *argument) {
  char *uuid = argument, path[96], *body = NULL;
  snprintf(path, sizeof(path), "/json/url/%.47s", uuid);
  radio_http_get(path, &body);
  free(body);
  free(uuid);
  return NULL;
}

static void radio_register_click(const char *uuid) {
  if (!uuid || !uuid[0])
    return;
  char *copy = strdup(uuid);
  if (!copy)
    return;
  pthread_t worker;
  if (!pthread_create(&worker, NULL, radio_click_worker, copy))
    pthread_detach(worker);
  else
    free(copy);
}

static pthread_mutex_t radio_play_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool radio_play_busy, radio_play_finished, radio_play_success;
static bool radio_play_queued;
static RadioStation radio_play_target, radio_play_result, radio_play_next;
static RadioStation radio_current_station;
static bool radio_retry_waiting;
static int radio_retry_count;
static uint32_t radio_retry_at, radio_nowplaying_next, radio_stable_since;
static char radio_nowplaying[256];
static bool radio_play_is_busy(void);
static void radio_cancel_retries(void) {
  radio_retry_waiting = false;
  radio_retry_count = 0;
  radio_stable_since = 0;
}

static void radio_schedule_retry(void) {
  radio_stable_since = 0;
  if (!radio_current_station.url[0] || radio_retry_count >= 3) {
    radio_retry_waiting = false;
    notify(tr("Rádio indisponível"));
    return;
  }
  radio_retry_waiting = true;
  radio_retry_at = SDL_GetTicks() + (uint32_t)(3000u << radio_retry_count);
  radio_retry_count++;
  notify(tr("Tentando reconectar rádio..."));
}
static void radio_note_playing(void) {
  uint32_t now = SDL_GetTicks();
  if (!radio_retry_count) return;
  if (!radio_stable_since) radio_stable_since = now ? now : 1;
  else if ((uint32_t)(now - radio_stable_since) >= 30000u) {
    radio_retry_count = 0;
    radio_stable_since = 0;
  }
}

static void radio_update_nowplaying(void) {
  if (!active || !playing_radio || radio_play_is_busy() ||
      (int32_t)(SDL_GetTicks() - radio_nowplaying_next) < 0) return;
  radio_nowplaying_next = SDL_GetTicks() + 5000;
  libvlc_media_t *media = libvlc_media_player_get_media(player);
  if (!media) return;
  char *value = libvlc_media_get_meta(media, libvlc_meta_NowPlaying);
  snprintf(radio_nowplaying, sizeof(radio_nowplaying), "%s", value ? value : "");
  if (value) libvlc_free(value);
  libvlc_media_release(media);
}

static bool radio_play_is_busy(void) {
  pthread_mutex_lock(&radio_play_mutex);
  bool busy = radio_play_busy || radio_play_finished || radio_play_queued;
  pthread_mutex_unlock(&radio_play_mutex);
  return busy;
}

static void *radio_play_worker(void *unused) {
  (void)unused;
  pthread_mutex_lock(&radio_play_mutex);
  RadioStation station = radio_play_target;
  pthread_mutex_unlock(&radio_play_mutex);
  libvlc_media_t *media = libvlc_media_new_location(engine, station.url);
  bool success = false;
  if (media) {
    libvlc_media_player_stop(player);
    libvlc_media_player_set_media(player, media);
    libvlc_media_release(media);
    success = libvlc_media_player_play(player) == 0;
  }
  pthread_mutex_lock(&radio_play_mutex);
  radio_play_result = station;
  radio_play_success = success;
  radio_play_busy = false;
  radio_play_finished = true;
  pthread_mutex_unlock(&radio_play_mutex);
  return NULL;
}

/* Called only on the SDL thread. The worker exclusively owns the player
 * while busy; the event loop skips player APIs until it has finished. */
static void radio_start_async(RadioStation station) {
  active = false;
  playing_radio = false;
  paused = false;
  pthread_mutex_lock(&video.mutex);
  video.ready = false;
  pthread_mutex_unlock(&video.mutex);
  if (video_texture) { SDL_DestroyTexture(video_texture); video_texture = NULL; }
  texture_w = texture_h = 0;
  pthread_mutex_lock(&radio_play_mutex);
  radio_play_target = station;
  radio_play_busy = true;
  pthread_mutex_unlock(&radio_play_mutex);
  pthread_t worker;
  if (pthread_create(&worker, NULL, radio_play_worker, NULL) == 0)
    pthread_detach(worker);
  else {
    pthread_mutex_lock(&radio_play_mutex);
    radio_play_busy = false;
    radio_play_finished = true;
    radio_play_success = false;
    radio_play_result = station;
    pthread_mutex_unlock(&radio_play_mutex);
  }
}

static void radio_poll_play(void) {
  pthread_mutex_lock(&radio_play_mutex);
  if (!radio_play_finished) { pthread_mutex_unlock(&radio_play_mutex); return; }
  RadioStation station = radio_play_result;
  bool success = radio_play_success;
  bool queued = radio_play_queued;
  RadioStation next = radio_play_next;
  radio_play_finished = false;
  radio_play_queued = false;
  pthread_mutex_unlock(&radio_play_mutex);
  if (queued) { radio_start_async(next); return; }
  if (!success) { radio_current_station = station; radio_schedule_retry(); return; }
  radio_current_station = station;
  radio_nowplaying[0] = 0;
  radio_nowplaying_next = 0;
  snprintf(current_path, sizeof(current_path), "%s", station.url);
  snprintf(media_name, sizeof(media_name), "%s", station.name);
  snprintf(title, sizeof(title), "%s", station.name);
  snprintf(artist, sizeof(artist), "%s", station.tags[0] ? station.tags : station.country);
  snprintf(album, sizeof(album), "%s", tr("Rádio Online"));
  snprintf(media_format, sizeof(media_format), "%.15s", station.codec[0] ? station.codec : "STREAM");
  media_size_known = false; media_size_bytes = 0;
  media_sample_rate = media_channels = 0;
  media_bitrate_kbps = station.bitrate > 0 ? (unsigned)station.bitrate : 0;
  lyric_count = plain_count = 0;
  active = playing_audio = playing_radio = true;
  paused = false;
  radio_register_click(station.uuid);
}

static void radio_play_selected(void) {
  RadioStation station;
  pthread_mutex_lock(&radio_mutex);
  if (!radio_count) {
    pthread_mutex_unlock(&radio_mutex);
    return;
  }
  station = radio_stations[radio_selected];
  pthread_mutex_unlock(&radio_mutex);
  radio_cancel_retries();
  pthread_mutex_lock(&radio_play_mutex);
  if (radio_play_busy || radio_play_finished) {
    radio_play_next = station;
    radio_play_queued = true;
    pthread_mutex_unlock(&radio_play_mutex);
    return;
  }
  pthread_mutex_unlock(&radio_play_mutex);
  if (playing_radio && !strcmp(current_path, station.url)) {
    toggle_pause();
    return;
  }
  radio_start_async(station);
  mode = 7;
}

static void radio_retry_tick(void) {
  if (radio_retry_waiting && !radio_play_is_busy() &&
      (int32_t)(SDL_GetTicks() - radio_retry_at) >= 0) {
    radio_retry_waiting = false;
    radio_start_async(radio_current_station);
  }
}

static void draw_radio(void) {
  color(bg);
  SDL_RenderClear(renderer);
  draw_header(tr("RÁDIO ONLINE"));
  pthread_mutex_lock(&radio_mutex);
  bool loading = radio_loading;
  int count = radio_count, selected_station = radio_selected;
  char error[128];
  snprintf(error, sizeof(error), "%s", radio_error);
  RadioStation visible[6];
  int offset_station = selected_station >= 5 ? selected_station - 4 : 0;
  int visible_count = 0;
  for (int i = offset_station; i < count && visible_count < 6; i++)
    visible[visible_count++] = radio_stations[i];
  RadioStation featured = {0};
  if (count) {
    featured = radio_stations[selected_station];
    if (playing_radio)
      for (int i = 0; i < count; i++)
        if (!strcmp(current_path, radio_stations[i].url)) {
          featured = radio_stations[i];
          break;
        }
  }
  pthread_mutex_unlock(&radio_mutex);

  /* Player on the left, station browser on the right. */
  radio_update_art(featured.favicon);
  rounded(16, 46, 224, 384, 10, panel);
  rounded(48, 62, 160, 150, 10, elevated);
  if (radio_art_texture) {
  SDL_Rect art = {48, 62, 160, 150};
  SDL_RenderCopy(renderer, radio_art_texture, NULL, &art);
  } else {
  media_ui_circle(128, 132, 48, bg);
  media_ui_circle(128, 132, 9, accent);
  rect(125, 88, 6, 35, accent);
  color(accent);
  SDL_RenderDrawLine(renderer, 108, 99, 122, 116);
  SDL_RenderDrawLine(renderer, 148, 99, 134, 116);
  SDL_RenderDrawLine(renderer, 99, 91, 118, 113);
  SDL_RenderDrawLine(renderer, 157, 91, 138, 113);
  }
  centered(playing_radio ? tr("AO VIVO") : tr("RÁDIO ONLINE"), 58, 185,
           140, 10, playing_radio ? accent : muted);
  if (featured.name[0]) {
    centered(featured.name, 28, 226, 200, 17, textc);
    centered(playing_radio && radio_nowplaying[0] ? radio_nowplaying :
             (featured.tags[0] ? featured.tags : tr("Estação online")), 28,
             252, 200, 11, muted);
    centered(featured.country[0] ? featured.country : tr("Internet"), 28, 272,
             200, 11, muted);
    char technical[96];
    snprintf(technical, sizeof(technical), "%s  •  %d kbps",
             featured.codec[0] ? featured.codec : "STREAM", featured.bitrate);
    rounded(48, 296, 160, 23, 6, elevated);
    centered(technical, 52, 302, 152, 11, accent);
  } else
    centered(loading ? tr("Buscando estações...")
                     : tr("Nenhuma estação encontrada"),
             28, 246, 200, 13, muted);
  int control_y = 352;
  media_ui_skip(86, control_y, false);
  media_ui_circle(128, control_y, 20, textc);
  if (playing_radio && active && !paused) {
    rect(121, control_y - 7, 4, 14, bg);
    rect(131, control_y - 7, 4, 14, bg);
  } else
    triangle(122, control_y - 8, 16, bg);
  media_ui_skip(170, control_y, true);
  rounded(48, 390, 160, 22, 6, elevated);
  const char *play_status = tr("B  Ouvir estação");
  if (radio_retry_waiting) play_status = tr("Reconectando...");
  if (radio_play_is_busy()) play_status = "Conectando...";
  else if (playing_radio && active) {
    libvlc_state_t state = libvlc_media_player_get_state(player);
    play_status = state == libvlc_Playing ? tr("Transmitindo agora") : "Conectando...";
  }
  centered(play_status, 52, 396, 152, 10, playing_radio ? accent : muted);

  rounded(252, 46, 372, 384, 10, panel);
  label(tr(radio_filter == 5 ? "Rádio do Usuário" : "Estações"), 264, 57, 16, textc, 235);
  char station_count[48];
  snprintf(station_count, sizeof(station_count), "%d %s", count,
           tr("estações"));
  label(station_count, 516, 62, 11, muted, 96);
  for (int i = 0; i < 6; i++) {
    int x = 264 + i * 58;
    rounded(x, 82, 55, 23, 5, i == radio_filter ? accent : elevated);
    centered(tr(radio_filter_names[i]), x + 1, 88, 53, i == 5 ? 7 : 9,
             i == radio_filter ? bg : muted);
  }
  if (loading) {
    centered(tr("Buscando estações..."), 264, 240, 348, 17, accent);
  } else if (!count) {
    centered(tr(error[0] ? error : "Nenhuma estação encontrada"), 264,
             220, 348, 14, textc);
    centered(tr("Pressione Y para tentar novamente"), 264, 250, 348, 11,
             muted);
    if (radio_filter == 5)
      centered("ports/kplayer/radios_usuario", 264, 275, 348, 11, muted);
  } else {
    for (int row = 0; row < visible_count && row < 5; row++) {
      int actual = offset_station + row, y = 115 + row * 56;
      bool focus = actual == selected_station;
      rounded(264, y, 348, 49, 7, focus ? accent : elevated);
      if (focus)
        rounded(266, y + 2, 344, 45, 5, elevated);
      rounded(274, y + 13, 22, 22, 11,
              (playing_radio && !strcmp(current_path, visible[row].url))
                  ? accent
                  : elevated);
      label((playing_radio && !strcmp(current_path, visible[row].url)) ? ">"
                                                                       : "~",
            281, y + 16, 12, focus ? accent : muted, 12);
      label(visible[row].name, 305, y + 5, 14, textc, 190);
      label(visible[row].tags[0] ? visible[row].tags : visible[row].country,
            305, y + 27, 10, muted, 190);
      label(visible[row].codec[0] ? visible[row].codec : "STREAM", 526, y + 7,
            10, focus ? accent : muted, 76);
      char bitrate[32];
      snprintf(bitrate, sizeof(bitrate), "%d kbps", visible[row].bitrate);
      label(bitrate, 526, y + 27, 10, muted, 76);
    }
  }
  footer(tr("Cima/Baixo Estação   Esq/Dir Categoria   B Ouvir/Pausar   A "
            "Início   Y Atualizar   SELECT Opções"));
}

static void radio_key(SDL_Keycode key, bool repeat) {
  if (key == SDLK_BACKSPACE && !repeat) {
    radio_cancel_retries();
    mode = 3;
    return;
  }
  pthread_mutex_lock(&radio_mutex);
  int count = radio_count;
  if (key == SDLK_UP && count)
    radio_selected = (radio_selected + count - 1) % count;
  else if (key == SDLK_DOWN && count)
    radio_selected = (radio_selected + 1) % count;
  pthread_mutex_unlock(&radio_mutex);
  if ((key == SDLK_LEFT || key == SDLK_RIGHT) && !repeat) {
    pthread_mutex_lock(&radio_mutex);
    radio_filter = (radio_filter + (key == SDLK_LEFT ? 5 : 1)) % 6;
    radio_count = radio_selected = 0;
    pthread_mutex_unlock(&radio_mutex);
    radio_refresh();
  } else if (key == SDLK_RETURN && !repeat)
    radio_play_selected();
  else if (key == SDLK_m && !repeat)
    radio_refresh();
  else if ((key == SDLK_q || key == SDLK_e) && !repeat && count) {
    pthread_mutex_lock(&radio_mutex);
    radio_selected = (radio_selected + (key == SDLK_q ? count - 1 : 1)) % count;
    pthread_mutex_unlock(&radio_mutex);
    radio_play_selected();
  }
}
