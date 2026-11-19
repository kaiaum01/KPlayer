/* Two Saimo IPTV sources: Canais and Filmes e séries; downloads run off-thread. */
#define IPTV_MAX_CHANNELS 2048
#define IPTV_CANAIS_CACHE "iptv/.saimo-canais.m3u8"
#define IPTV_FILMES_CACHE "iptv/.saimo-filmes.m3u8"
#define IPTV_CANAIS_URL "https://canais-saimo.pages.dev/"
#define IPTV_FILMES_URL "https://filmes-saimo.pages.dev/"
typedef struct { char name[128]; char url[1024]; char logo[1024]; char group[128]; char id[128]; } IptvChannel;
static IptvChannel iptv_channels[IPTV_MAX_CHANNELS];
static int iptv_count, iptv_selected, iptv_offset;
static pthread_mutex_t iptv_fetch_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool iptv_fetch_busy, iptv_fetch_done, iptv_fetch_ok;
static int iptv_fetch_source, iptv_done_source;
static int iptv_source; /* 0 = Canais, 1 = Filmes e séries */

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
      const char *raw_name = comma && comma[1] ? comma + 1 : "";
      while (*raw_name == ' ' || *raw_name == '\t') raw_name++;
      snprintf(name, sizeof(name), "%s", raw_name);
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
  const char *cache = iptv_source == 0 ? IPTV_CANAIS_CACHE : IPTV_FILMES_CACHE;
  iptv_count = iptv_read_list(cache, iptv_channels, 0, IPTV_MAX_CHANNELS);
}

static void *iptv_fetch_worker(void *unused) {
  int source = (int)(intptr_t)unused;
  if (source != 0 && source != 1) return NULL;
  const char *cache = source == 0 ? IPTV_CANAIS_CACHE : IPTV_FILMES_CACHE;
  const char *mode_arg = source == 0 ? "canais" : "filmes";
  bool ok = false;
  char tmp[] = "iptv/.saimo-XXXXXX";
  int fd = mkstemp(tmp);
  if (fd >= 0) {
    close(fd);
    char *args[] = {"python3", "./iptv_fetch.py", (char *)mode_arg, tmp, NULL};
    pid_t child, result;
    int status = 0;
    if (posix_spawnp(&child, "python3", NULL, NULL, args, environ) == 0) {
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

static void iptv_open(void) {
  if (iptv_source < 0 || iptv_source > 1) iptv_source = 0;
  iptv_reload();
  if (!iptv_count) iptv_fetch_start();
  mode = 8;
}

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
  else if ((k == SDLK_SPACE || k == SDLK_LEFT || k == SDLK_RIGHT) && !radio_play_is_busy()) {
    iptv_source = iptv_source == 0 ? 1 : 0;
    iptv_reload();
    if (!iptv_count) iptv_fetch_start();
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
  if (done && completed_source == iptv_source) {
    if (ok) iptv_reload();
    else notify(tr("Lista indisponível; usando cache"));
  } else if (done && !iptv_count) {
    iptv_fetch_start();
  }
  backdrop(); draw_header(tr("IPTV"));
  label(iptv_source == 0 ? tr("Canais") : tr("Filmes e séries"), 24, 42, 22, textc, 280);
  label(iptv_source == 0 ? IPTV_CANAIS_URL : IPTV_FILMES_URL, 24, 67, 10, dim, 340);

  /* Two option pills: Canais | Filmes e séries */
  pill(372, 46, 104, 24, iptv_source == 0);
  centered(tr("Canais"), 374, 52, 100, 11, iptv_source == 0 ? bg : muted);
  pill(484, 46, 132, 24, iptv_source == 1);
  centered(tr("Filmes e séries"), 486, 52, 128, 11, iptv_source == 1 ? bg : muted);

  if (!iptv_count) {
    centered(busy ? tr("Carregando lista...") : tr("Nenhum item encontrado"), 25, 175, 590, 20, muted);
    centered(tr("Pressione Y para atualizar"), 25, 212, 590, 14, muted);
  } else {
    if (iptv_selected < iptv_offset) iptv_offset = iptv_selected;
    IptvChannel *channel = &iptv_channels[iptv_selected];
    panel_card(24, 86, 200, 310, 16);
    rounded(47, 102, 154, 120, 8, elevated);
    radio_update_art(channel->logo);
    if (radio_art_texture && !strcmp(radio_art_display_url, channel->logo)) {
      SDL_Rect dst = {52, 107, 144, 110}; SDL_RenderCopy(renderer, radio_art_texture, NULL, &dst);
    } else centered(tr("Sem imagem"), 52, 150, 144, 14, muted);
    centered(channel->name, 35, 235, 178, 15, textc);
    label(tr("Categoria"), 36, 276, 12, muted, 170);
    label(channel->group[0] ? channel->group : "--", 36, 295, 13, textc, 170);
    label(iptv_source == 0 ? "ID" : tr("Detalhes"), 36, 327, 12, muted, 170);
    label(channel->id[0] ? channel->id : "--", 36, 346, 12, accent, 170);
    if (iptv_selected >= iptv_offset + 6) iptv_offset = iptv_selected - 5;
    for (int row = 0; row < 6 && iptv_offset + row < iptv_count; row++) {
      int index = iptv_offset + row, y = 86 + row * 51;
      card(238, y, 378, 45, 10, index == iptv_selected, panel);
      char number[24]; snprintf(number, sizeof(number), "%d", index + 1);
      label(number, 249, y + 14, 13, index == iptv_selected ? accent : muted, 40);
      label(iptv_channels[index].name, 290, y + 8, 14, textc, 310);
      if (iptv_channels[index].group[0])
        label(iptv_channels[index].group, 290, y + 27, 10, muted, 310);
    }
  }
  if (radio_play_is_busy()) label(tr("Conectando canal..."), 24, 417, 13, accent, 500);
  else if (busy && fetching_source == iptv_source) label(tr("Carregando lista..."), 24, 417, 13, accent, 500);
  const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Assistir"}, {"X", "Alternar"},
                              {"Y", "Atualizar"}, {"A", "Voltar"}};
  footer_hints(hints, 5);
}
