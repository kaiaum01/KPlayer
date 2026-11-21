/* Unlimited, category-by-category IPTV/VOD browser for KPlayer R36S:
 *  0 = Canais (https://canais-saimo.pages.dev/)
 *  1 = Filmes (https://filmes-saimo.pages.dev/)
 *  2 = Séries (https://filmes-saimo.pages.dev/ — full seasons & episodes)
 *  3 = Usuário (ports/kplayer/iptv_usuario/ + virtual keyboard URLs)
 * All network/catalog work runs off-thread via ./iptv_fetch.py (no shell). */

#define IPTV_CANAIS_URL "https://canais-saimo.pages.dev/"
#define IPTV_FILMES_URL "https://filmes-saimo.pages.dev/"
#define IPTV_USER_DIR "iptv_usuario"

#define IPTV_VIEW_CATS 0
#define IPTV_VIEW_ITEMS 1
#define IPTV_VIEW_EPISODES 2
#define IPTV_VIEW_KEYBOARD 3

#define IPTV_JOB_NONE 0
#define IPTV_JOB_CATS 1
#define IPTV_JOB_ITEMS 2
#define IPTV_JOB_EPISODES 3
#define IPTV_JOB_ADD_URL 4

typedef struct {
  char name[160];
  char url[1024];
  char logo[1024];
  char group[128];
  char id[192];
} IptvChannel;

typedef struct {
  char id[160];
  char name[160];
  int count;
} IptvCategory;

static IptvCategory *iptv_cats = NULL;
static int iptv_cat_count = 0, iptv_cat_cap = 0;
static int iptv_cat_selected = 0, iptv_cat_offset = 0;

static IptvChannel *iptv_channels = NULL;
static int iptv_count = 0, iptv_cap = 0;
static int iptv_selected = 0, iptv_offset = 0;

static IptvChannel *iptv_episodes = NULL;
static int iptv_ep_count = 0, iptv_ep_cap = 0;
static int iptv_ep_selected = 0, iptv_ep_offset = 0;

static int iptv_source = 0; /* 0=Canais, 1=Filmes, 2=Séries, 3=Usuário */
static int iptv_view = IPTV_VIEW_CATS;
static char iptv_active_cat_id[160] = "";
static char iptv_active_cat_name[160] = "";
static char iptv_active_series_title[160] = "";
static char iptv_active_series_letter[16] = "";
static char iptv_active_series_shard[32] = "";

/* Virtual keyboard state for IPTV do Usuário URL entry */
static char iptv_kb_url[512] = "https://";
static int iptv_kb_row = 2;
static int iptv_kb_col = 0;

/* Off-thread worker synchronization */
typedef struct {
  int job;
  int source;
  bool refresh;
  char arg1[512];
  char arg2[64];
  char arg3[192];
  char out_path[256];
} IptvJobSpec;

static pthread_mutex_t iptv_fetch_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool iptv_fetch_busy = false;
static bool iptv_fetch_done = false;
static bool iptv_fetch_ok = false;
static int iptv_done_job = IPTV_JOB_NONE;
static int iptv_done_source = 0;
static int iptv_fetch_source = 0;
static char iptv_done_path[256] = "";

static void iptv_copy_str(char *dst, size_t cap, const char *src) {
  if (!dst || !cap) return;
  if (!src) {
    dst[0] = 0;
    return;
  }
  size_t len = strlen(src);
  if (len >= cap) len = cap - 1;
  memcpy(dst, src, len);
  dst[len] = 0;
}

static void iptv_copy_n(char *dst, size_t cap, const char *src, size_t n) {
  if (!dst || !cap) return;
  if (!src) {
    dst[0] = 0;
    return;
  }
  if (n >= cap) n = cap - 1;
  memcpy(dst, src, n);
  dst[n] = 0;
}

static const char *iptv_source_slug(int src) {
  switch (src) {
    case 1: return "filmes";
    case 2: return "series";
    case 3: return "usuario";
    default: return "canais";
  }
}

static const char *iptv_source_label(int src) {
  switch (src) {
    case 1: return tr("Filmes");
    case 2: return tr("Séries");
    case 3: return tr("Usuário");
    default: return tr("Canais");
  }
}

static const char *iptv_source_subtitle(int src) {
  switch (src) {
    case 1: return IPTV_FILMES_URL;
    case 2: return IPTV_FILMES_URL;
    case 3: return tr("Pasta iptv_usuario/ + Teclado");
    default: return IPTV_CANAIS_URL;
  }
}

static void iptv_attribute(const char *line, const char *key, char *out, size_t cap) {
  out[0] = 0;
  size_t n = strlen(key);
  for (const char *p = line; *p; p++) {
    if ((p == line || p[-1] == ' ' || p[-1] == '\t') && !strncasecmp(p, key, n) &&
        p[n] == '=' && p[n + 1] == '"') {
      const char *start = p + n + 2, *end = strchr(start, '"');
      if (end) snprintf(out, cap, "%.*s", (int)(end - start), start);
      return;
    }
  }
}

static bool iptv_ensure_channels_cap(IptvChannel **arr, int *cap, int needed) {
  if (needed <= *cap) return true;
  int next_cap = *cap ? *cap * 2 : 256;
  while (next_cap < needed) next_cap *= 2;
  IptvChannel *grown = realloc(*arr, (size_t)next_cap * sizeof(IptvChannel));
  if (!grown) return false;
  *arr = grown;
  *cap = next_cap;
  return true;
}

static bool iptv_ensure_cats_cap(int needed) {
  if (needed <= iptv_cat_cap) return true;
  int next_cap = iptv_cat_cap ? iptv_cat_cap * 2 : 64;
  while (next_cap < needed) next_cap *= 2;
  IptvCategory *grown = realloc(iptv_cats, (size_t)next_cap * sizeof(IptvCategory));
  if (!grown) return false;
  iptv_cats = grown;
  iptv_cat_cap = next_cap;
  return true;
}

/* Unlimited dynamic M3U/M3U8 reader (zero item limit, zero 4 MB cap). */
static int iptv_read_list_dyn(const char *path, IptvChannel **arr, int *cap) {
  struct stat st;
  if (lstat(path, &st) || !S_ISREG(st.st_mode)) return 0;
  FILE *f = fopen(path, "rb");
  if (!f) return 0;
  int count = 0;
  char line[4096];
  char name[160] = "", logo[1024] = "", group[128] = "", id[192] = "";
  while (fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    if (n && line[n - 1] != '\n' && !feof(f)) {
      int ch;
      while ((ch = fgetc(f)) != '\n' && ch != EOF) {}
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
      iptv_copy_str(name, sizeof(name), raw_name);
      iptv_attribute(p, "tvg-logo", logo, sizeof(logo));
      iptv_attribute(p, "group-title", group, sizeof(group));
      iptv_attribute(p, "tvg-id", id, sizeof(id));
    } else if (*p != '#' && *p) {
      size_t url_len = strlen(p);
      bool valid_scheme = !strncmp(p, "http://", 7) || !strncmp(p, "https://", 8) ||
                          !strncmp(p, "kplayer-series://", 17);
      if (valid_scheme && url_len < sizeof((*arr)[0].url) && !strpbrk(p, " \t")) {
        if (!iptv_ensure_channels_cap(arr, cap, count + 1)) break;
        IptvChannel *dst = &(*arr)[count];
        memset(dst, 0, sizeof(*dst));
        memcpy(dst->url, p, url_len + 1);
        if (name[0]) iptv_copy_str(dst->name, sizeof(dst->name), name);
        else snprintf(dst->name, sizeof(dst->name), "Canal %d", count + 1);
        iptv_copy_str(dst->logo, sizeof(dst->logo), logo);
        iptv_copy_str(dst->group, sizeof(dst->group), group);
        iptv_copy_str(dst->id, sizeof(dst->id), id);
        count++;
      }
      name[0] = logo[0] = group[0] = id[0] = 0;
    }
  }
  fclose(f);
  return count;
}

/* Fixed-buffer M3U reader kept for unit test compatibility (no 4 MB limit). */
static __attribute__((unused)) int iptv_read_list(const char *path, IptvChannel *out, int count, int max) {
  struct stat st;
  if (lstat(path, &st) || !S_ISREG(st.st_mode)) return count;
  FILE *f = fopen(path, "rb");
  if (!f) return count;
  char line[4096], name[160] = "", logo[1024] = "", group[128] = "", id[192] = "";
  while (count < max && fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    if (n && line[n - 1] != '\n' && !feof(f)) {
      int ch;
      while ((ch = fgetc(f)) != '\n' && ch != EOF) {}
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
      iptv_copy_str(name, sizeof(name), raw_name);
      iptv_attribute(p, "tvg-logo", logo, sizeof(logo));
      iptv_attribute(p, "group-title", group, sizeof(group));
      iptv_attribute(p, "tvg-id", id, sizeof(id));
    } else if (*p != '#' && *p) {
      size_t url_len = strlen(p);
      if ((!strncmp(p, "http://", 7) || !strncmp(p, "https://", 8)) &&
          url_len < sizeof(out[0].url) && !strpbrk(p, " \t")) {
        memcpy(out[count].url, p, url_len + 1);
        if (name[0]) iptv_copy_str(out[count].name, sizeof(out[count].name), name);
        else snprintf(out[count].name, sizeof(out[count].name), "Canal %d", count + 1);
        iptv_copy_str(out[count].logo, sizeof(out[count].logo), logo);
        iptv_copy_str(out[count].group, sizeof(out[count].group), group);
        iptv_copy_str(out[count].id, sizeof(out[count].id), id);
        count++;
      }
      name[0] = logo[0] = group[0] = id[0] = 0;
    }
  }
  fclose(f);
  return count;
}

static int iptv_read_categories_tsv(const char *path) {
  FILE *f = fopen(path, "rb");
  if (!f) return 0;
  int count = 0;
  char line[1024];
  while (fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    while (n && (line[n - 1] == '\r' || line[n - 1] == '\n')) line[--n] = 0;
    if (!n) continue;
    char *tab1 = strchr(line, '\t');
    if (!tab1) continue;
    *tab1 = 0;
    char *tab2 = strchr(tab1 + 1, '\t');
    if (!tab2) continue;
    *tab2 = 0;
    if (!iptv_ensure_cats_cap(count + 1)) break;
    iptv_copy_str(iptv_cats[count].id, sizeof(iptv_cats[count].id), line);
    iptv_copy_str(iptv_cats[count].name, sizeof(iptv_cats[count].name), tab1 + 1);
    iptv_cats[count].count = atoi(tab2 + 1);
    count++;
  }
  fclose(f);
  return count;
}

static void iptv_cats_cache_path(int src, char *out, size_t cap) {
  snprintf(out, cap, "iptv/.cats-%s.tsv", iptv_source_slug(src));
}

static void iptv_reload_cats_cache(void) {
  mkdir("iptv", 0755);
  mkdir(IPTV_USER_DIR, 0755);
  char path[256];
  iptv_cats_cache_path(iptv_source, path, sizeof(path));
  iptv_cat_count = iptv_read_categories_tsv(path);
  iptv_cat_selected = iptv_cat_offset = 0;
}

static void *iptv_job_worker(void *raw) {
  IptvJobSpec *spec = (IptvJobSpec *)raw;
  bool ok = false;
  mkdir("iptv", 0755);
  mkdir(IPTV_USER_DIR, 0755);

  char *argv[9] = {0};
  int ac = 0;
  argv[ac++] = "python3";
  argv[ac++] = "./iptv_fetch.py";

  if (spec->job == IPTV_JOB_CATS) {
    argv[ac++] = "categories";
    argv[ac++] = (char *)iptv_source_slug(spec->source);
    argv[ac++] = spec->out_path;
    if (spec->refresh) argv[ac++] = "--refresh";
  } else if (spec->job == IPTV_JOB_ITEMS) {
    argv[ac++] = "list";
    argv[ac++] = (char *)iptv_source_slug(spec->source);
    argv[ac++] = spec->arg1;
    argv[ac++] = spec->out_path;
    if (spec->refresh) argv[ac++] = "--refresh";
  } else if (spec->job == IPTV_JOB_EPISODES) {
    argv[ac++] = "episodes";
    argv[ac++] = spec->arg1;
    argv[ac++] = spec->arg2;
    argv[ac++] = spec->arg3;
    argv[ac++] = spec->out_path;
    if (spec->refresh) argv[ac++] = "--refresh";
  } else if (spec->job == IPTV_JOB_ADD_URL) {
    argv[ac++] = "user-add-url";
    argv[ac++] = spec->arg1;
  }
  argv[ac] = NULL;

  pid_t child = 0, result = 0;
  int status = 0;
  if (posix_spawnp(&child, "python3", NULL, NULL, argv, environ) == 0) {
    do {
      result = waitpid(child, &status, 0);
    } while (result < 0 && errno == EINTR);
    if (result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0) ok = true;
  }

  pthread_mutex_lock(&iptv_fetch_mutex);
  iptv_fetch_ok = ok;
  iptv_fetch_done = true;
  iptv_fetch_busy = false;
  iptv_done_job = spec->job;
  iptv_done_source = spec->source;
  snprintf(iptv_done_path, sizeof(iptv_done_path), "%s", spec->out_path);
  pthread_mutex_unlock(&iptv_fetch_mutex);
  free(spec);
  return NULL;
}

static bool iptv_start_job(const IptvJobSpec *in) {
  pthread_mutex_lock(&iptv_fetch_mutex);
  if (iptv_fetch_busy) {
    pthread_mutex_unlock(&iptv_fetch_mutex);
    return false;
  }
  IptvJobSpec *spec = malloc(sizeof(*spec));
  if (!spec) {
    pthread_mutex_unlock(&iptv_fetch_mutex);
    return false;
  }
  *spec = *in;
  iptv_fetch_busy = true;
  iptv_fetch_done = false;
  iptv_fetch_source = spec->source;
  pthread_mutex_unlock(&iptv_fetch_mutex);

  pthread_t th;
  if (pthread_create(&th, NULL, iptv_job_worker, spec) == 0) {
    pthread_detach(th);
    return true;
  }
  free(spec);
  pthread_mutex_lock(&iptv_fetch_mutex);
  iptv_fetch_busy = false;
  iptv_fetch_done = true;
  iptv_fetch_ok = false;
  iptv_done_job = in->job;
  iptv_done_source = in->source;
  pthread_mutex_unlock(&iptv_fetch_mutex);
  return false;
}

static void iptv_fetch_categories_start(bool refresh) {
  IptvJobSpec spec;
  memset(&spec, 0, sizeof(spec));
  spec.job = IPTV_JOB_CATS;
  spec.source = iptv_source;
  spec.refresh = refresh;
  iptv_cats_cache_path(iptv_source, spec.out_path, sizeof(spec.out_path));
  iptv_start_job(&spec);
}

static void iptv_fetch_items_start(const char *cat_id, const char *cat_name, bool refresh) {
  iptv_copy_str(iptv_active_cat_id, sizeof(iptv_active_cat_id), cat_id);
  iptv_copy_str(iptv_active_cat_name, sizeof(iptv_active_cat_name), cat_name);
  iptv_count = iptv_selected = iptv_offset = 0;
  iptv_view = IPTV_VIEW_ITEMS;
  IptvJobSpec spec;
  memset(&spec, 0, sizeof(spec));
  spec.job = IPTV_JOB_ITEMS;
  spec.source = iptv_source;
  spec.refresh = refresh;
  iptv_copy_str(spec.arg1, sizeof(spec.arg1), cat_id);
  iptv_copy_str(spec.out_path, sizeof(spec.out_path), "iptv/.items-current.m3u8");
  iptv_start_job(&spec);
}

static void iptv_fetch_episodes_start(const char *letter, const char *shard, const char *title,
                                      bool refresh) {
  iptv_copy_str(iptv_active_series_letter, sizeof(iptv_active_series_letter), letter);
  iptv_copy_str(iptv_active_series_shard, sizeof(iptv_active_series_shard), shard);
  iptv_copy_str(iptv_active_series_title, sizeof(iptv_active_series_title), title);
  iptv_ep_count = iptv_ep_selected = iptv_ep_offset = 0;
  iptv_view = IPTV_VIEW_EPISODES;
  IptvJobSpec spec;
  memset(&spec, 0, sizeof(spec));
  spec.job = IPTV_JOB_EPISODES;
  spec.source = 2;
  spec.refresh = refresh;
  iptv_copy_str(spec.arg1, sizeof(spec.arg1), letter);
  iptv_copy_str(spec.arg2, sizeof(spec.arg2), shard);
  iptv_copy_str(spec.arg3, sizeof(spec.arg3), title);
  iptv_copy_str(spec.out_path, sizeof(spec.out_path), "iptv/.episodes-current.m3u8");
  iptv_start_job(&spec);
}

static void iptv_reload(void) {
  iptv_view = IPTV_VIEW_CATS;
  iptv_count = iptv_selected = iptv_offset = 0;
  iptv_ep_count = iptv_ep_selected = iptv_ep_offset = 0;
  iptv_reload_cats_cache();
}

static void iptv_open(void) {
  if (iptv_source < 0 || iptv_source > 3) iptv_source = 0;
  iptv_reload();
  if (!iptv_cat_count || iptv_source == 3) iptv_fetch_categories_start(false);
  mode = 8;
}

static void iptv_switch_source(int delta) {
  iptv_source = (iptv_source + delta + 4) % 4;
  iptv_reload();
  iptv_fetch_categories_start(false);
}

static void iptv_play_channel(const IptvChannel *channel) {
  if (!channel || !channel->url[0]) {
    notify(tr("Canal sem fluxo direto compatível"));
    return;
  }
  RadioStation station = {0};
  iptv_copy_str(station.name, sizeof(station.name), channel->name);
  iptv_copy_str(station.url, sizeof(station.url), channel->url);
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

static void iptv_step_channel(int delta) {
  if (iptv_view == IPTV_VIEW_EPISODES && iptv_ep_count > 0) {
    iptv_ep_selected = (iptv_ep_selected + (delta < 0 ? iptv_ep_count - 1 : 1)) % iptv_ep_count;
    iptv_play_channel(&iptv_episodes[iptv_ep_selected]);
  } else if (iptv_count > 0) {
    iptv_selected = (iptv_selected + (delta < 0 ? iptv_count - 1 : 1)) % iptv_count;
    iptv_play_channel(&iptv_channels[iptv_selected]);
  }
}

/* Parse series metadata from tvg-id="series:<letter>:<shard>:<details>" */
static bool iptv_parse_series_id(const IptvChannel *ch, char *letter_out, size_t lcap,
                                 char *shard_out, size_t scap) {
  if (strncmp(ch->id, "series:", 7) != 0) return false;
  const char *p1 = ch->id + 7;
  const char *c1 = strchr(p1, ':');
  if (!c1 || c1 == p1) return false;
  const char *p2 = c1 + 1;
  const char *c2 = strchr(p2, ':');
  if (!c2 || c2 == p2) return false;
  iptv_copy_n(letter_out, lcap, p1, (size_t)(c1 - p1));
  iptv_copy_n(shard_out, scap, p2, (size_t)(c2 - p2));
  return true;
}

/* On-screen virtual keyboard layout for IPTV do Usuário URL entry */
static const char *iptv_kb_rows[6][10] = {
    {"https://", "http://", ".m3u8", ".m3u", ".txt", "/", ":", ".", "-", "_"},
    {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
    {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
    {"a", "s", "d", "f", "g", "h", "j", "k", "l", "?"},
    {"z", "x", "c", "v", "b", "n", "m", "&", "=", "%"},
    {"APAGAR", "LIMPAR", "SALVAR", "VOLTAR", NULL, NULL, NULL, NULL, NULL, NULL},
};

static int iptv_kb_row_len(int row) {
  if (row < 0 || row >= 6) return 0;
  int n = 0;
  while (n < 10 && iptv_kb_rows[row][n]) n++;
  return n;
}

static void iptv_kb_backspace(void) {
  size_t len = strlen(iptv_kb_url);
  if (len > 0) iptv_kb_url[len - 1] = 0;
}

static void iptv_kb_append(const char *s) {
  size_t len = strlen(iptv_kb_url);
  size_t add = strlen(s);
  if (len + add + 1 < sizeof(iptv_kb_url)) memcpy(iptv_kb_url + len, s, add + 1);
}

static void iptv_kb_submit(void) {
  if (strncmp(iptv_kb_url, "http://", 7) != 0 && strncmp(iptv_kb_url, "https://", 8) != 0) {
    notify(tr("URL inválida (use http:// ou https://)"));
    return;
  }
  if (strlen(iptv_kb_url) < 12) {
    notify(tr("URL inválida (use http:// ou https://)"));
    return;
  }
  IptvJobSpec spec;
  memset(&spec, 0, sizeof(spec));
  spec.job = IPTV_JOB_ADD_URL;
  spec.source = 3;
  snprintf(spec.arg1, sizeof(spec.arg1), "%s", iptv_kb_url);
  if (iptv_start_job(&spec)) {
    iptv_view = IPTV_VIEW_CATS;
  }
}

static int iptv_cat_total_rows(void) {
  return iptv_cat_count + (iptv_source == 3 ? 1 : 0);
}

static void iptv_key(SDL_Keycode k) {
  if (iptv_view == IPTV_VIEW_KEYBOARD) {
    int rlen = iptv_kb_row_len(iptv_kb_row);
    if (k == SDLK_UP) {
      iptv_kb_row = (iptv_kb_row + 5) % 6;
      int nl = iptv_kb_row_len(iptv_kb_row);
      if (iptv_kb_col >= nl) iptv_kb_col = nl - 1;
    } else if (k == SDLK_DOWN) {
      iptv_kb_row = (iptv_kb_row + 1) % 6;
      int nl = iptv_kb_row_len(iptv_kb_row);
      if (iptv_kb_col >= nl) iptv_kb_col = nl - 1;
    } else if (k == SDLK_LEFT && rlen > 0) {
      iptv_kb_col = (iptv_kb_col + rlen - 1) % rlen;
    } else if (k == SDLK_RIGHT && rlen > 0) {
      iptv_kb_col = (iptv_kb_col + 1) % rlen;
    } else if (k == SDLK_SPACE) {
      iptv_kb_backspace();
    } else if (k == SDLK_BACKSPACE) {
      iptv_view = IPTV_VIEW_CATS;
    } else if (k == SDLK_RETURN) {
      const char *tok = iptv_kb_rows[iptv_kb_row][iptv_kb_col];
      if (!tok) return;
      if (!strcmp(tok, "APAGAR")) iptv_kb_backspace();
      else if (!strcmp(tok, "LIMPAR")) snprintf(iptv_kb_url, sizeof(iptv_kb_url), "https://");
      else if (!strcmp(tok, "SALVAR")) iptv_kb_submit();
      else if (!strcmp(tok, "VOLTAR")) iptv_view = IPTV_VIEW_CATS;
      else iptv_kb_append(tok);
    }
    return;
  }

  if (iptv_view == IPTV_VIEW_CATS) {
    int total = iptv_cat_total_rows();
    if (k == SDLK_UP && total > 0)
      iptv_cat_selected = (iptv_cat_selected + total - 1) % total;
    else if (k == SDLK_DOWN && total > 0)
      iptv_cat_selected = (iptv_cat_selected + 1) % total;
    else if (k == SDLK_RETURN) {
      if (iptv_source == 3 && iptv_cat_selected == 0) {
        snprintf(iptv_kb_url, sizeof(iptv_kb_url), "https://");
        iptv_kb_row = 2;
        iptv_kb_col = 0;
        iptv_view = IPTV_VIEW_KEYBOARD;
      } else {
        int idx = iptv_source == 3 ? iptv_cat_selected - 1 : iptv_cat_selected;
        if (idx >= 0 && idx < iptv_cat_count)
          iptv_fetch_items_start(iptv_cats[idx].id, iptv_cats[idx].name, false);
      }
    } else if (k == SDLK_LEFT && !radio_play_is_busy()) {
      iptv_switch_source(-1);
    } else if ((k == SDLK_RIGHT || k == SDLK_SPACE) && !radio_play_is_busy()) {
      iptv_switch_source(1);
    } else if (k == SDLK_m && !radio_play_is_busy()) {
      iptv_fetch_categories_start(true);
    } else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
      mode = 3;
    }
    return;
  }

  if (iptv_view == IPTV_VIEW_ITEMS) {
    if (k == SDLK_UP && iptv_count > 0)
      iptv_selected = (iptv_selected + iptv_count - 1) % iptv_count;
    else if (k == SDLK_DOWN && iptv_count > 0)
      iptv_selected = (iptv_selected + 1) % iptv_count;
    else if (k == SDLK_RETURN && iptv_count > 0 && iptv_selected < iptv_count) {
      IptvChannel *ch = &iptv_channels[iptv_selected];
      char ltr[16] = "", sh[32] = "";
      if (iptv_parse_series_id(ch, ltr, sizeof(ltr), sh, sizeof(sh))) {
        iptv_fetch_episodes_start(ltr, sh, ch->name, false);
      } else {
        iptv_play_channel(ch);
      }
    } else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
      iptv_view = IPTV_VIEW_CATS;
    } else if (k == SDLK_LEFT && !radio_play_is_busy()) {
      iptv_switch_source(-1);
    } else if ((k == SDLK_RIGHT || k == SDLK_SPACE) && !radio_play_is_busy()) {
      iptv_switch_source(1);
    } else if (k == SDLK_m && !radio_play_is_busy() && iptv_active_cat_id[0]) {
      iptv_fetch_items_start(iptv_active_cat_id, iptv_active_cat_name, true);
    }
    return;
  }

  /* IPTV_VIEW_EPISODES */
  if (k == SDLK_UP && iptv_ep_count > 0)
    iptv_ep_selected = (iptv_ep_selected + iptv_ep_count - 1) % iptv_ep_count;
  else if (k == SDLK_DOWN && iptv_ep_count > 0)
    iptv_ep_selected = (iptv_ep_selected + 1) % iptv_ep_count;
  else if (k == SDLK_RETURN && iptv_ep_count > 0 && iptv_ep_selected < iptv_ep_count)
    iptv_play_channel(&iptv_episodes[iptv_ep_selected]);
  else if (k == SDLK_BACKSPACE && !radio_play_is_busy())
    iptv_view = IPTV_VIEW_ITEMS;
  else if (k == SDLK_m && !radio_play_is_busy() && iptv_active_series_title[0])
    iptv_fetch_episodes_start(iptv_active_series_letter, iptv_active_series_shard,
                              iptv_active_series_title, true);
}

static void iptv_poll_worker_result(void) {
  pthread_mutex_lock(&iptv_fetch_mutex);
  bool done = iptv_fetch_done, ok = iptv_fetch_ok;
  int job = iptv_done_job, src = iptv_done_source;
  char done_path[256];
  snprintf(done_path, sizeof(done_path), "%s", iptv_done_path);
  iptv_fetch_done = false;
  pthread_mutex_unlock(&iptv_fetch_mutex);

  if (!done) return;
  if (job == IPTV_JOB_CATS && src == iptv_source) {
    if (ok) iptv_reload_cats_cache();
    else notify(tr("Lista indisponível; usando cache"));
  } else if (job == IPTV_JOB_ITEMS && src == iptv_source && iptv_view == IPTV_VIEW_ITEMS) {
    if (ok) {
      iptv_count = iptv_read_list_dyn(done_path, &iptv_channels, &iptv_cap);
      iptv_selected = iptv_offset = 0;
    } else {
      notify(tr("Lista indisponível; usando cache"));
    }
  } else if (job == IPTV_JOB_EPISODES && iptv_view == IPTV_VIEW_EPISODES) {
    if (ok) {
      iptv_ep_count = iptv_read_list_dyn(done_path, &iptv_episodes, &iptv_ep_cap);
      iptv_ep_selected = iptv_ep_offset = 0;
    } else {
      notify(tr("Nenhum episódio encontrado"));
    }
  } else if (job == IPTV_JOB_ADD_URL) {
    if (ok) {
      notify(tr("Lista salva com sucesso"));
      iptv_fetch_categories_start(true);
    } else {
      notify(tr("URL inválida (use http:// ou https://)"));
    }
  }
}

static void draw_iptv_keyboard(void) {
  backdrop();
  draw_header(tr("IPTV"));
  label(tr("Teclado IPTV"), 24, 42, 20, textc, 320);
  label(tr("Digite o link da playlist (.m3u / .m3u8)"), 24, 66, 11, muted, 520);

  /* URL input box */
  card(24, 88, 592, 38, 10, true, elevated);
  char shown[520];
  snprintf(shown, sizeof(shown), "%s_", iptv_kb_url);
  label(shown, 36, 98, 14, accent, 568);

  /* 6 rows of virtual keys */
  for (int r = 0; r < 6; r++) {
    int cols = iptv_kb_row_len(r);
    int y = 138 + r * 44;
    if (r == 5) {
      int w = 142;
      for (int c = 0; c < cols; c++) {
        int x = 24 + c * 150;
        bool focus = (r == iptv_kb_row && c == iptv_kb_col);
        card(x, y, w, 36, 9, focus, panel);
        centered(iptv_kb_rows[r][c], x + 4, y + 10, w - 8, 12, focus ? accent : textc);
      }
    } else {
      int w = 55;
      for (int c = 0; c < cols; c++) {
        int x = 24 + c * 59;
        bool focus = (r == iptv_kb_row && c == iptv_kb_col);
        card(x, y, w, 36, 8, focus, panel);
        int sz = strlen(iptv_kb_rows[r][c]) > 3 ? 10 : 14;
        centered(iptv_kb_rows[r][c], x + 2, y + (sz == 10 ? 12 : 9), w - 4, sz,
                 focus ? accent : textc);
      }
    }
  }

  const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Inserir"}, {"X", "Apagar"},
                              {"A", "Voltar"}};
  footer_hints(hints, 4);
}

static void draw_iptv(void) {
  iptv_poll_worker_result();
  pthread_mutex_lock(&iptv_fetch_mutex);
  bool busy = iptv_fetch_busy;
  int fetching_source = iptv_fetch_source;
  pthread_mutex_unlock(&iptv_fetch_mutex);

  if (iptv_view == IPTV_VIEW_KEYBOARD) {
    draw_iptv_keyboard();
    return;
  }

  backdrop();
  draw_header(tr("IPTV"));
  label(iptv_source_label(iptv_source), 24, 42, 20, textc, 220);
  label(iptv_source_subtitle(iptv_source), 24, 66, 10, dim, 250);

  /* Four source tabs: Canais | Filmes | Séries | Usuário */
  const int tab_x[4] = {276, 360, 444, 528};
  const int tab_w = 80;
  for (int s = 0; s < 4; s++) {
    pill(tab_x[s], 46, tab_w, 24, iptv_source == s);
    centered(iptv_source_label(s), tab_x[s] + 2, 52, tab_w - 4, 11,
             iptv_source == s ? bg : muted);
  }

  if (iptv_view == IPTV_VIEW_CATS) {
    label(iptv_source == 3 ? tr("Coloque arquivos .m3u/.m3u8 em iptv_usuario/")
                           : tr("Escolha a categoria"),
          24, 88, 13, muted, 560);
    int total = iptv_cat_total_rows();
    if (iptv_cat_selected >= total && total > 0) iptv_cat_selected = total - 1;
    if (iptv_cat_selected < iptv_cat_offset) iptv_cat_offset = iptv_cat_selected;
    if (iptv_cat_selected >= iptv_cat_offset + 6) iptv_cat_offset = iptv_cat_selected - 5;

    if (total == 0) {
      centered(busy ? tr("Carregando categorias...") : tr("Nenhum item encontrado"),
               25, 210, 590, 20, muted);
      centered(tr("Pressione Y para atualizar"), 25, 247, 590, 14, muted);
    } else {
      for (int row = 0; row < 6 && iptv_cat_offset + row < total; row++) {
        int pos = iptv_cat_offset + row, y = 114 + row * 48;
        bool focus = pos == iptv_cat_selected;
        card(24, y, 592, 42, 9, focus, panel);
        if (iptv_source == 3 && pos == 0) {
          label(tr("+ Adicionar URL pelo teclado"), 42, y + 10, 15, accent, 480);
          label(tr("Teclado"), 520, y + 12, 12, focus ? accent : muted, 84);
        } else {
          int ci = iptv_source == 3 ? pos - 1 : pos;
          label(iptv_cats[ci].name, 42, y + 10, 15, focus ? accent : textc, 468);
          char n[32];
          snprintf(n, sizeof(n), "%d", iptv_cats[ci].count);
          label(n, 526, y + 11, 13, muted, 78);
        }
      }
    }
    if (radio_play_is_busy()) label(tr("Conectando canal..."), 24, 417, 13, accent, 500);
    else if (busy && fetching_source == iptv_source)
      label(tr("Carregando categorias..."), 24, 417, 13, accent, 500);
    const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Abrir"}, {"X", "Alternar"},
                                {"Y", "Atualizar"}, {"A", "Voltar"}};
    footer_hints(hints, 5);
    return;
  }

  /* Shared list renderer for IPTV_VIEW_ITEMS and IPTV_VIEW_EPISODES */
  bool is_ep_view = (iptv_view == IPTV_VIEW_EPISODES);
  IptvChannel *list = is_ep_view ? iptv_episodes : iptv_channels;
  int list_count = is_ep_view ? iptv_ep_count : iptv_count;
  int *sel = is_ep_view ? &iptv_ep_selected : &iptv_selected;
  int *off = is_ep_view ? &iptv_ep_offset : &iptv_offset;

  char subhdr[200];
  snprintf(subhdr, sizeof(subhdr), "%s (%d)",
           is_ep_view ? iptv_active_series_title : iptv_active_cat_name, list_count);
  label(subhdr, 24, 88, 14, accent, 580);

  if (list_count == 0) {
    centered(busy ? (is_ep_view ? tr("Carregando episódios...") : tr("Carregando lista..."))
                  : (is_ep_view ? tr("Nenhum episódio encontrado") : tr("Nenhum canal nesta categoria")),
             25, 210, 590, 19, muted);
    centered(tr("Pressione Y para atualizar"), 25, 247, 590, 14, muted);
  } else {
    if (*sel >= list_count) *sel = list_count - 1;
    if (*sel < *off) *off = *sel;
    if (*sel >= *off + 6) *off = *sel - 5;
    IptvChannel *channel = &list[*sel];
    panel_card(24, 114, 200, 276, 16);
    rounded(47, 130, 154, 110, 8, elevated);
    radio_update_art(channel->logo);
    if (radio_art_texture && channel->logo[0] && !strcmp(radio_art_display_url, channel->logo)) {
      SDL_Rect dst = {52, 135, 144, 100};
      SDL_RenderCopy(renderer, radio_art_texture, NULL, &dst);
    } else {
      centered(tr("Sem imagem"), 52, 174, 144, 14, muted);
    }
    centered(channel->name, 35, 250, 178, 14, textc);
    label(is_ep_view ? tr("Temporada") : tr("Categoria"), 36, 290, 12, muted, 170);
    label(channel->group[0] ? channel->group : "--", 36, 309, 13, textc, 170);
    label(tr("Detalhes"), 36, 338, 12, muted, 170);
    /* Display clean details (strip internal series:<L>:<shard>: prefix if present) */
    const char *detail = channel->id;
    if (!strncmp(detail, "series:", 7)) {
      const char *c1 = strchr(detail + 7, ':');
      const char *c2 = c1 ? strchr(c1 + 1, ':') : NULL;
      if (c2 && c2[1]) detail = c2 + 1;
    }
    label(detail[0] ? detail : "--", 36, 357, 12, accent, 170);

    for (int row = 0; row < 6 && *off + row < list_count; row++) {
      int idx = *off + row, y = 114 + row * 46;
      bool focus = idx == *sel;
      card(238, y, 378, 41, 10, focus, panel);
      char number[24];
      snprintf(number, sizeof(number), "%d", idx + 1);
      label(number, 249, y + 12, 13, focus ? accent : muted, 44);
      label(list[idx].name, 296, y + 6, 14, textc, 308);
      if (list[idx].group[0]) label(list[idx].group, 296, y + 25, 10, muted, 308);
    }
  }

  if (radio_play_is_busy()) label(tr("Conectando canal..."), 24, 417, 13, accent, 500);
  else if (busy) label(is_ep_view ? tr("Carregando episódios...") : tr("Carregando lista..."),
                       24, 417, 13, accent, 500);
  const FooterHint hints[] = {
      {"DIR", "Navegar"},
      {"B", (!is_ep_view && iptv_source == 2) ? "Episódios" : "Assistir"},
      {"X", "Alternar"},
      {"Y", "Atualizar"},
      {"A", is_ep_view ? "Séries" : "Categorias"},
  };
  footer_hints(hints, 5);
}
