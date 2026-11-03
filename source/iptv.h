/* Separate local, Brazil and world lists; downloads never block rendering. */
#define IPTV_MAX_CHANNELS 2048
#define IPTV_BR_CACHE "iptv/.iptvcom-br.m3u8"
#define IPTV_WORLD_CACHE "iptv/.iptvcom-world.m3u8"
#define IPTV_BR_URL "https://raw.githubusercontent.com/iptv-com/iptv/main/lists/brazil.m3u"
#define IPTV_WORLD_URL "https://raw.githubusercontent.com/iptv-com/iptv/main/lists/world.m3u"
typedef struct { char name[128]; char url[1024]; char logo[1024]; char group[128]; char id[128]; } IptvChannel;
static IptvChannel iptv_channels[IPTV_MAX_CHANNELS];
static int iptv_count, iptv_selected, iptv_offset;
static pthread_mutex_t iptv_fetch_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool iptv_fetch_busy, iptv_fetch_done, iptv_fetch_ok;
static int iptv_fetch_source, iptv_done_source;
static int iptv_source;

static void iptv_attribute(const char *line, const char *key, char *out, size_t cap) {
  out[0] = 0;
  size_t n = strlen(key);
  for (const char *p = line; *p; p++) {
    if ((p == line || p[-1] == ' ' || p[-1] == '\t') && !strncasecmp(p, key, n) && p[n] == '=' && p[n+1] == '"') {
      const char *start = p + n + 2, *end = strchr(start, '"');
      if (end) snprintf(out, cap, "%.*s", (int)(end - start), start);
      return;
    }
  }
}

static int iptv_read_list(const char *path, IptvChannel *out, int count, int max) {
  struct stat st;
  if (lstat(path, &st) || !S_ISREG(st.st_mode) || st.st_size > 4 * 1024 * 1024) return count;
  FILE *f = fopen(path, "rb");
  if (!f) return count;
  char line[4096], name[128] = "", logo[1024] = "", group[128] = "", id[128] = "";
  while (count < max && fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    if (n && line[n - 1] != '\n' && !feof(f)) {
      int ch; while ((ch = fgetc(f)) != '\n' && ch != EOF) {}
      name[0] = logo[0] = group[0] = id[0] = 0;
      continue;
    }
    while (n && (line[n - 1] == '\r' || line[n - 1] == '\n')) line[--n] = 0;
    char *p = line;
    if (n >= 3 && !memcmp(p, "\xef\xbb\xbf", 3)) p += 3;
    while (*p == ' ' || *p == '\t') p++;
    if (!strncasecmp(p, "#EXTINF:", 8)) {
      const char *comma = strchr(p, ',');
      snprintf(name, sizeof(name), "%s", comma && comma[1] ? comma + 1 : "");
      iptv_attribute(p, "tvg-logo", logo, sizeof(logo));
      iptv_attribute(p, "group-title", group, sizeof(group));
      iptv_attribute(p, "tvg-id", id, sizeof(id));
    } else if (*p != '#' && *p) {
      size_t url_len = strlen(p);
      if ((!strncmp(p, "http://", 7) || !strncmp(p, "https://", 8)) &&
          url_len < sizeof(out[0].url) && !strpbrk(p, " \t")) {
        memcpy(out[count].url, p, url_len + 1);
        if (name[0]) snprintf(out[count].name, sizeof(out[count].name), "%s", name);
        else snprintf(out[count].name, sizeof(out[count].name), "Canal %d", count + 1);
        snprintf(out[count].logo, sizeof(out[count].logo), "%s", logo);
        snprintf(out[count].group, sizeof(out[count].group), "%s", group);
        snprintf(out[count].id, sizeof(out[count].id), "%s", id);
        count++;
      }
      name[0] = logo[0] = group[0] = id[0] = 0;
    }
  }
  fclose(f);
  return count;
}

static void iptv_reload(void) {
  mkdir("iptv", 0755);
  iptv_count = iptv_selected = iptv_offset = 0;
  if (iptv_source) {
    const char *cache = iptv_source == 1 ? IPTV_BR_CACHE : IPTV_WORLD_CACHE;
    iptv_count = iptv_read_list(cache, iptv_channels, 0, IPTV_MAX_CHANNELS);
    return;
  }
  DIR *dir = opendir("iptv");
  if (!dir) return;
  struct dirent *e;
  while (iptv_count < IPTV_MAX_CHANNELS && (e = readdir(dir))) {
    if (e->d_name[0] == '.' || !playlist_file(e->d_name)) continue;
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "iptv/%s", e->d_name) >= (int)sizeof(path)) continue;
    iptv_count = iptv_read_list(path, iptv_channels, iptv_count, IPTV_MAX_CHANNELS);
  }
  closedir(dir);
}

static void *iptv_fetch_worker(void *unused) {
  int source = (int)(intptr_t)unused;
  if (source != 1 && source != 2) return NULL;
  const char *cache = source == 1 ? IPTV_BR_CACHE : IPTV_WORLD_CACHE;
  const char *url = source == 1 ? IPTV_BR_URL : IPTV_WORLD_URL;
  bool ok = false;
  char tmp[] = "iptv/.iptvcom-XXXXXX";
  int fd = mkstemp(tmp);
  if (fd >= 0) {
    close(fd);
    char *args[] = {"curl", "--silent", "--show-error", "--fail", "--location",
      "--max-time", "30", "--connect-timeout", "8", "--max-redirs", "3",
      "--max-filesize", "4194304", "--proto", "=https", "--proto-redir", "=https",
      "--output", tmp, "--", (char *)url, NULL};
    pid_t child, result;
    int status = 0;
    if (posix_spawnp(&child, "curl", NULL, NULL, args, environ) == 0) {
      do { result = waitpid(child, &status, 0); } while (result < 0 && errno == EINTR);
      IptvChannel *sample = malloc(sizeof(*sample));
      if (sample && result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0 &&
          iptv_read_list(tmp, sample, 0, 1) == 1 && rename(tmp, cache) == 0)
        ok = true;
      free(sample);
    }
    unlink(tmp);
  }
  pthread_mutex_lock(&iptv_fetch_mutex);
  iptv_fetch_ok = ok; iptv_fetch_done = true; iptv_fetch_busy = false; iptv_done_source = source;
  pthread_mutex_unlock(&iptv_fetch_mutex);
  return NULL;
}

static void iptv_fetch_start(void) {
  if (iptv_source == 0) return;
  pthread_mutex_lock(&iptv_fetch_mutex);
  if (iptv_fetch_busy) { pthread_mutex_unlock(&iptv_fetch_mutex); return; }
  iptv_fetch_busy = true; iptv_fetch_done = false; iptv_fetch_source = iptv_source;
  int source = iptv_fetch_source;
  pthread_mutex_unlock(&iptv_fetch_mutex);
  pthread_t thread;
  if (pthread_create(&thread, NULL, iptv_fetch_worker, (void *)(intptr_t)source) == 0) pthread_detach(thread);
  else {
    pthread_mutex_lock(&iptv_fetch_mutex);
    iptv_fetch_busy = false; iptv_fetch_done = true; iptv_fetch_ok = false; iptv_done_source = source;
    pthread_mutex_unlock(&iptv_fetch_mutex);
  }
}

static void iptv_open(void) { iptv_source = 1; iptv_reload(); mode = 8; iptv_fetch_start(); }
static void iptv_play_selected(void) {
  if (!iptv_count) return;
  if (!iptv_channels[iptv_selected].url[0]) { notify(tr("Canal sem fluxo direto compatível")); return; }
  RadioStation station = {0};
  snprintf(station.name, sizeof(station.name), "%s", iptv_channels[iptv_selected].name);
  snprintf(station.url, sizeof(station.url), "%s", iptv_channels[iptv_selected].url);
  station.is_iptv = true;
  radio_cancel_retries();
  pthread_mutex_lock(&radio_play_mutex);
  if (radio_play_busy || radio_play_finished) {
    radio_play_next = station;
    radio_play_queued = true;
    pthread_mutex_unlock(&radio_play_mutex);
  } else {
    pthread_mutex_unlock(&radio_play_mutex);
    radio_start_async(station);
  }
  mode = 8;
}
static void iptv_key(SDL_Keycode k) {
  if (k == SDLK_UP && iptv_count) iptv_selected = (iptv_selected + iptv_count - 1) % iptv_count;
  else if (k == SDLK_DOWN && iptv_count) iptv_selected = (iptv_selected + 1) % iptv_count;
  else if (k == SDLK_RETURN) iptv_play_selected();
  else if (k == SDLK_SPACE && !radio_play_is_busy()) {
    iptv_source = (iptv_source + 1) % 3;
    iptv_reload();
    if (iptv_source && !iptv_count) iptv_fetch_start();
  }
  else if (k == SDLK_m && !radio_play_is_busy()) {
    iptv_reload(); iptv_fetch_start();
  }
  else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) mode = 3;
}
static void draw_iptv(void) {
  pthread_mutex_lock(&iptv_fetch_mutex);
  bool busy = iptv_fetch_busy, done = iptv_fetch_done, ok = iptv_fetch_ok;
  int completed_source = iptv_done_source, fetching_source = iptv_fetch_source;
  iptv_fetch_done = false;
  pthread_mutex_unlock(&iptv_fetch_mutex);
  if (done && completed_source == iptv_source) { if (ok) iptv_reload(); else notify(tr("Lista indisponível; usando cache")); }
  else if (done && iptv_source && !iptv_count) iptv_fetch_start();
  color(bg); SDL_RenderClear(renderer); draw_header(tr("IPTV"));
  label(iptv_source == 1 ? tr("IPTV Brasil") : iptv_source == 2 ? tr("IPTV Mundo") : tr("Listas próprias"), 24, 52, 24, textc, 430);
  if (!iptv_count) {
    centered(tr("Nenhum canal encontrado"), 25, 170, 590, 20, muted);
    centered(iptv_source ? tr("Pressione Y para atualizar") : tr("Coloque listas M3U/M3U8 em ports/kplayer/iptv"), 25, 210, 590, 14, muted);
  } else {
    if (iptv_selected < iptv_offset) iptv_offset = iptv_selected;
    IptvChannel *channel = &iptv_channels[iptv_selected];
    rounded(24, 86, 200, 310, 9, panel);
    rounded(47, 102, 154, 120, 8, elevated);
    radio_update_art(channel->logo);
    if (radio_art_texture && !strcmp(radio_art_display_url, channel->logo)) {
      SDL_Rect dst = {52, 107, 144, 110}; SDL_RenderCopy(renderer, radio_art_texture, NULL, &dst);
    } else centered(tr("Sem imagem"), 52, 150, 144, 14, muted);
    centered(channel->name, 35, 235, 178, 16, textc);
    label(tr("Categoria"), 36, 276, 12, muted, 170);
    label(channel->group[0] ? channel->group : "--", 36, 295, 14, textc, 170);
    label("ID", 36, 327, 12, muted, 170);
    label(channel->id[0] ? channel->id : "--", 36, 346, 12, muted, 170);
    if (iptv_selected >= iptv_offset + 6) iptv_offset = iptv_selected - 5;
    for (int row = 0; row < 6 && iptv_offset + row < iptv_count; row++) {
      int index = iptv_offset + row, y = 86 + row * 51;
      rounded(238, y, 378, 45, 7, index == iptv_selected ? accent : panel);
      if (index == iptv_selected) rounded(240, y + 2, 374, 41, 6, elevated);
      char number[24]; snprintf(number, sizeof(number), "%d", index + 1);
      label(number, 249, y + 14, 13, muted, 40);
      label(iptv_channels[index].name, 290, y + 13, 15, textc, 310);
    }
  }
  if (radio_play_is_busy()) label(tr("Conectando canal..."), 24, 417, 13, accent, 500);
  else if (busy && fetching_source == iptv_source) label(tr("Atualizando canais..."), 24, 417, 13, accent, 500);
  footer(tr("Cima/Baixo Navegar   B Assistir   X Fonte   Y Atualizar   A Voltar"));
}
