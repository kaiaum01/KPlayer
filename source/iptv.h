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
/* Categorias (group-title) e lista filtrada por categoria. */
#define IPTV_MAX_GROUPS 256
typedef struct { char name[128]; int count; } IptvGroup;
static IptvGroup iptv_groups[IPTV_MAX_GROUPS];
static int iptv_group_count, iptv_group_selected, iptv_group_offset;
static int iptv_view_idx[IPTV_MAX_CHANNELS], iptv_view_count;
static int iptv_active_group = -1; /* -1 = todos */
static bool iptv_showing_categories = true;

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

static int iptv_group_compare(const void *a, const void *b) {
  return strcasecmp(((const IptvGroup *)a)->name, ((const IptvGroup *)b)->name);
}

static void iptv_build_groups(void) {
  iptv_group_count = 0;
  for (int i = 0; i < iptv_count; i++) {
    const char *g = iptv_channels[i].group;
    if (!g[0])
      continue;
    int j = 0;
    for (; j < iptv_group_count; j++)
      if (!strcmp(iptv_groups[j].name, g))
        break;
    if (j == iptv_group_count) {
      if (iptv_group_count >= IPTV_MAX_GROUPS)
        continue;
      snprintf(iptv_groups[iptv_group_count].name,
               sizeof(iptv_groups[0].name), "%s", g);
      iptv_groups[iptv_group_count].count = 0;
      iptv_group_count++;
    }
    iptv_groups[j].count++;
  }
  qsort(iptv_groups, iptv_group_count, sizeof(iptv_groups[0]),
        iptv_group_compare);
}

static int iptv_category_total(void) { return iptv_group_count + 1; }

static const char *iptv_category_name(int pos) {
  return pos == 0 ? tr("Todos os canais") : iptv_groups[pos - 1].name;
}

static int iptv_category_count(int pos) {
  return pos == 0 ? iptv_count : iptv_groups[pos - 1].count;
}

static void iptv_apply_group(int group) {
  iptv_active_group = group;
  iptv_view_count = 0;
  for (int i = 0; i < iptv_count && iptv_view_count < IPTV_MAX_CHANNELS; i++) {
    if (group >= 0 && strcmp(iptv_channels[i].group, iptv_groups[group].name))
      continue;
    iptv_view_idx[iptv_view_count++] = i;
  }
  iptv_selected = iptv_offset = 0;
  iptv_showing_categories = false;
}

static void iptv_reload(void) {
  mkdir("iptv", 0755);
  iptv_count = iptv_selected = iptv_offset = 0;
  iptv_view_count = 0;
  const char *cache = iptv_source == 0 ? IPTV_CANAIS_CACHE : IPTV_FILMES_CACHE;
  iptv_count = iptv_read_list(cache, iptv_channels, 0, IPTV_MAX_CHANNELS);
  iptv_build_groups();
  iptv_showing_categories = true;
  iptv_active_group = -1;
  iptv_group_selected = iptv_group_offset = 0;
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
  if (!iptv_view_count || iptv_selected < 0 || iptv_selected >= iptv_view_count)
    return;
  IptvChannel *channel = &iptv_channels[iptv_view_idx[iptv_selected]];
  if (!channel->url[0]) { notify(tr("Canal sem fluxo direto compatível")); return; }
  RadioStation station = {0};
  snprintf(station.name, sizeof(station.name), "%s", channel->name);
  snprintf(station.url, sizeof(station.url), "%s", channel->url);
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
  if (iptv_showing_categories) {
    if (k == SDLK_UP && iptv_group_count)
      iptv_group_selected = (iptv_group_selected + iptv_category_total() - 1) % iptv_category_total();
    else if (k == SDLK_DOWN && iptv_group_count)
      iptv_group_selected = (iptv_group_selected + 1) % iptv_category_total();
    else if (k == SDLK_RETURN)
      iptv_apply_group(iptv_group_selected - 1);
    else if ((k == SDLK_SPACE || k == SDLK_LEFT || k == SDLK_RIGHT) && !radio_play_is_busy()) {
      iptv_source = iptv_source == 0 ? 1 : 0;
      iptv_reload();
      if (!iptv_count) iptv_fetch_start();
    }
    else if (k == SDLK_m && !radio_play_is_busy()) {
      iptv_reload(); iptv_fetch_start();
    }
    else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) mode = 3;
  } else {
    if (k == SDLK_UP && iptv_view_count)
      iptv_selected = (iptv_selected + iptv_view_count - 1) % iptv_view_count;
    else if (k == SDLK_DOWN && iptv_view_count)
      iptv_selected = (iptv_selected + 1) % iptv_view_count;
    else if (k == SDLK_RETURN) iptv_play_selected();
    else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
      iptv_showing_categories = true;
      iptv_group_selected = iptv_active_group >= 0 ? iptv_active_group + 1 : 0;
    }
    else if ((k == SDLK_SPACE || k == SDLK_LEFT || k == SDLK_RIGHT) && !radio_play_is_busy()) {
      iptv_source = iptv_source == 0 ? 1 : 0;
      iptv_reload();
      if (!iptv_count) iptv_fetch_start();
    }
    else if (k == SDLK_m && !radio_play_is_busy()) {
      iptv_reload(); iptv_fetch_start();
    }
  }
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

  if (iptv_showing_categories) {
    /* Menu de categorias antes da lista de canais. */
    label(tr("Escolha a categoria"), 24, 88, 15, muted, 400);
    if (iptv_group_selected < iptv_group_offset) iptv_group_offset = iptv_group_selected;
    if (iptv_group_selected >= iptv_group_offset + 6) iptv_group_offset = iptv_group_selected - 5;
    int cat_total = iptv_category_total();
    if (!iptv_count) {
      centered(busy ? tr("Carregando lista...") : tr("Nenhum item encontrado"), 25, 210, 590, 20, muted);
      centered(tr("Pressione Y para atualizar"), 25, 247, 590, 14, muted);
    } else {
      for (int row = 0; row < 6 && iptv_group_offset + row < cat_total; row++) {
        int pos = iptv_group_offset + row, y = 118 + row * 48;
        bool focus = pos == iptv_group_selected;
        card(24, y, 592, 42, 9, focus, panel);
        label(iptv_category_name(pos), 42, y + 8, 16, focus ? accent : textc, 470);
        char n[32];
        snprintf(n, sizeof(n), "%d", iptv_category_count(pos));
        label(n, 530, y + 11, 13, muted, 70);
      }
    }
    if (radio_play_is_busy()) label(tr("Conectando canal..."), 24, 417, 13, accent, 500);
    else if (busy && fetching_source == iptv_source) label(tr("Carregando lista..."), 24, 417, 13, accent, 500);
    const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Abrir"}, {"X", "Alternar"},
                                {"Y", "Atualizar"}, {"A", "Voltar"}};
    footer_hints(hints, 5);
    return;
  }

  /* Lista de canais filtrada pela categoria escolhida. */
  label(iptv_active_group >= 0 ? iptv_groups[iptv_active_group].name : tr("Todos os canais"),
        24, 88, 15, accent, 560);
  if (!iptv_view_count) {
    centered(tr("Nenhum canal nesta categoria"), 25, 210, 590, 20, muted);
    centered(tr("Pressione Y para atualizar"), 25, 247, 590, 14, muted);
  } else {
    if (iptv_selected < iptv_offset) iptv_offset = iptv_selected;
    IptvChannel *channel = &iptv_channels[iptv_view_idx[iptv_selected]];
    panel_card(24, 118, 200, 270, 16);
    rounded(47, 134, 154, 110, 8, elevated);
    radio_update_art(channel->logo);
    if (radio_art_texture && !strcmp(radio_art_display_url, channel->logo)) {
      SDL_Rect dst = {52, 139, 144, 100}; SDL_RenderCopy(renderer, radio_art_texture, NULL, &dst);
    } else centered(tr("Sem imagem"), 52, 178, 144, 14, muted);
    centered(channel->name, 35, 254, 178, 15, textc);
    label(tr("Categoria"), 36, 292, 12, muted, 170);
    label(channel->group[0] ? channel->group : "--", 36, 311, 13, textc, 170);
    label(iptv_source == 0 ? "ID" : tr("Detalhes"), 36, 342, 12, muted, 170);
    label(channel->id[0] ? channel->id : "--", 36, 361, 12, accent, 170);
    if (iptv_selected >= iptv_offset + 6) iptv_offset = iptv_selected - 5;
    for (int row = 0; row < 6 && iptv_offset + row < iptv_view_count; row++) {
      int idx = iptv_view_idx[iptv_offset + row], y = 118 + row * 46;
      bool focus = iptv_offset + row == iptv_selected;
      card(238, y, 378, 41, 10, focus, panel);
      char number[24]; snprintf(number, sizeof(number), "%d", iptv_offset + row + 1);
      label(number, 249, y + 12, 13, focus ? accent : muted, 40);
      label(iptv_channels[idx].name, 290, y + 6, 14, textc, 310);
      if (iptv_channels[idx].group[0])
        label(iptv_channels[idx].group, 290, y + 26, 10, muted, 310);
    }
  }
  if (radio_play_is_busy()) label(tr("Conectando canal..."), 24, 417, 13, accent, 500);
  else if (busy && fetching_source == iptv_source) label(tr("Carregando lista..."), 24, 417, 13, accent, 500);
  const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Assistir"}, {"X", "Alternar"},
                              {"Y", "Atualizar"}, {"A", "Categorias"}};
  footer_hints(hints, 5);
}
