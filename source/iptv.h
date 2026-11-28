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
#define IPTV_VIEW_SEARCH_KB 4

#define IPTV_JOB_NONE 0
#define IPTV_JOB_CATS 1
#define IPTV_JOB_ITEMS 2
#define IPTV_JOB_EPISODES 3
#define IPTV_JOB_ADD_URL 4
#define IPTV_JOB_RESOLVE_ADULT 5

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

static int iptv_source = 0; /* 0=Canais, 1=Filmes, 2=Séries, 3=Usuário, 4=+18 (quando desbloqueado) */
static int iptv_adult_provider = 0; /* 0=escolher provedor, 1=PornHub, 2=XVideos */
static int iptv_adult_prov_sel = 0; /* 0=PornHub, 1=XVideos */
static int iptv_view = IPTV_VIEW_CATS;
static char iptv_active_cat_id[160] = "";
static char iptv_active_cat_name[160] = "";
static char iptv_active_series_title[160] = "";
static char iptv_active_series_letter[16] = "";
static char iptv_active_series_shard[32] = "";
static char iptv_adult_pending_name[160] = "";

/* Virtual keyboard state for IPTV do Usuário URL entry */
static char iptv_kb_url[512] = "https://";
static int iptv_kb_row = 2;
static int iptv_kb_col = 0;

/* Typing search state for Canais de TV, Filmes e Séries (v2.0.6) */
static char iptv_search_query[64] = "";
static int iptv_search_return_view = IPTV_VIEW_CATS;
static int iptv_skb_row = 1;
static int iptv_skb_col = 0;

/* IPTV Favorites persistence (iptv_favorites.cfg) & top pinning (v2.1.7+) */
#define IPTV_FAV_MAX 128
static char iptv_fav_urls[IPTV_FAV_MAX][1024];
static int iptv_fav_count = 0;
static bool iptv_fav_loaded = false;

static void iptv_fav_load(void) {
  if (iptv_fav_loaded) return;
  iptv_fav_loaded = true;
  iptv_fav_count = 0;
  FILE *f = fopen("iptv_favorites.cfg", "r");
  if (!f) return;
  char line[1080];
  while (iptv_fav_count < IPTV_FAV_MAX && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    if (!line[0]) continue;
    snprintf(iptv_fav_urls[iptv_fav_count++], sizeof(iptv_fav_urls[0]), "%.1023s", line);
  }
  fclose(f);
}

static void iptv_fav_save(void) {
  FILE *f = fopen("iptv_favorites.tmp", "w");
  if (!f) return;
  bool ok = true;
  for (int i = 0; i < iptv_fav_count; i++) {
    if (fprintf(f, "%s\n", iptv_fav_urls[i]) < 0) ok = false;
  }
  if (fclose(f) == 0 && ok) rename("iptv_favorites.tmp", "iptv_favorites.cfg");
}

static bool iptv_fav_is(const char *url) {
  if (!url || !url[0]) return false;
  iptv_fav_load();
  for (int i = 0; i < iptv_fav_count; i++) {
    if (!strcmp(iptv_fav_urls[i], url)) return true;
  }
  return false;
}

static void iptv_pin_favorites_first(IptvChannel *list, int count) {
  if (!list || count <= 1) return;
  iptv_fav_load();
  if (iptv_fav_count == 0) return;
  IptvChannel *tmp = malloc((size_t)count * sizeof(IptvChannel));
  if (!tmp) return;
  int w = 0;
  for (int i = 0; i < count; i++) {
    if (iptv_fav_is(list[i].url)) tmp[w++] = list[i];
  }
  for (int i = 0; i < count; i++) {
    if (!iptv_fav_is(list[i].url)) tmp[w++] = list[i];
  }
  memcpy(list, tmp, (size_t)count * sizeof(IptvChannel));
  free(tmp);
}

static bool iptv_fav_toggle_url(const char *url) {
  if (!url || !url[0] || strpbrk(url, "\r\n")) return false;
  iptv_fav_load();
  int found = -1;
  for (int i = 0; i < iptv_fav_count; i++) {
    if (!strcmp(iptv_fav_urls[i], url)) { found = i; break; }
  }
  bool added = false;
  if (found >= 0) {
    memmove(&iptv_fav_urls[found], &iptv_fav_urls[found + 1],
            (size_t)(iptv_fav_count - found - 1) * sizeof(iptv_fav_urls[0]));
    iptv_fav_count--;
  } else if (iptv_fav_count < IPTV_FAV_MAX) {
    snprintf(iptv_fav_urls[iptv_fav_count++], sizeof(iptv_fav_urls[0]), "%s", url);
    added = true;
  }
  iptv_fav_save();
  if (iptv_count > 1) iptv_pin_favorites_first(iptv_channels, iptv_count);
  return added;
}

static const char *iptv_skb_rows[5][10] = {
    {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
    {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
    {"a", "s", "d", "f", "g", "h", "j", "k", "l", "-"},
    {"z", "x", "c", "v", "b", "n", "m", " ", NULL, NULL},
    {"BUSCAR", "APAGAR", "LIMPAR", "VOLTAR", NULL, NULL, NULL, NULL, NULL, NULL},
};

static bool iptv_contains_ci(const char *hay, const char *needle) {
  if (!needle || !needle[0]) return true;
  if (!hay || !hay[0]) return false;
  size_t nlen = strlen(needle);
  for (const char *p = hay; *p; p++) {
    size_t j = 0;
    while (j < nlen && p[j] &&
           tolower((unsigned char)p[j]) == tolower((unsigned char)needle[j]))
      j++;
    if (j == nlen) return true;
  }
  return false;
}

static int iptv_skb_row_len(int row) {
  if (row < 0 || row >= 5) return 0;
  int n = 0;
  while (n < 10 && iptv_skb_rows[row][n]) n++;
  return n;
}

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

/* Live EPG off-thread lookup state for Canais ao vivo */
static pthread_mutex_t iptv_epg_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool iptv_epg_busy = false;
static char iptv_epg_key[192] = "";
static char iptv_epg_now_time[24] = "";
static char iptv_epg_now_title[128] = "";
static char iptv_epg_next_time[24] = "";
static char iptv_epg_next_title[128] = "";
static uint32_t iptv_epg_last_req = 0;

typedef struct {
  char name[160];
  char id[192];
  char key[192];
} IptvEpgJob;

static void *iptv_epg_worker(void *arg) {
  IptvEpgJob *job = (IptvEpgJob *)arg;
  const char *out_path = "iptv/.cache/epg-current.tsv";
  char *argv[] = {"python3", "./iptv_fetch.py", "epg", job->name, job->id,
                  (char *)out_path, NULL};
  extern char **environ;
  pid_t pid = 0;
  int rc = -1;
  if (posix_spawnp(&pid, "python3", NULL, NULL, argv, environ) == 0) {
    int st = 0;
    while (waitpid(pid, &st, 0) < 0 && errno == EINTR) {}
    if (WIFEXITED(st)) rc = WEXITSTATUS(st);
  }
  char nt[24] = "", np[128] = "", xt[24] = "", xp[128] = "";
  if (rc == 0) {
    FILE *f = fopen(out_path, "r");
    if (f) {
      char line[320];
      while (fgets(line, sizeof(line), f)) {
        size_t n = strlen(line);
        while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
        if (!strncmp(line, "NOW\t", 4)) {
          char *t = line + 4;
          char *tab = strchr(t, '\t');
          if (tab) {
            *tab = 0;
            snprintf(nt, sizeof(nt), "%.23s", t);
            snprintf(np, sizeof(np), "%.127s", tab + 1);
          }
        } else if (!strncmp(line, "NEXT\t", 5)) {
          char *t = line + 5;
          char *tab = strchr(t, '\t');
          if (tab) {
            *tab = 0;
            snprintf(xt, sizeof(xt), "%.23s", t);
            snprintf(xp, sizeof(xp), "%.127s", tab + 1);
          }
        }
      }
      fclose(f);
    }
  }
  pthread_mutex_lock(&iptv_epg_mutex);
  if (!strcmp(iptv_epg_key, job->key)) {
    snprintf(iptv_epg_now_time, sizeof(iptv_epg_now_time), "%s", nt);
    snprintf(iptv_epg_now_title, sizeof(iptv_epg_now_title), "%s", np);
    snprintf(iptv_epg_next_time, sizeof(iptv_epg_next_time), "%s", xt);
    snprintf(iptv_epg_next_title, sizeof(iptv_epg_next_title), "%s", xp);
  }
  iptv_epg_busy = false;
  pthread_mutex_unlock(&iptv_epg_mutex);
  free(job);
  return NULL;
}

static void iptv_epg_maybe_fetch(const IptvChannel *ch) {
  if (!ch || !ch->name[0] || preview_mode) return;
  char keybuf[192];
  snprintf(keybuf, sizeof(keybuf), "%.95s|%.94s", ch->name, ch->id);
  uint32_t now = SDL_GetTicks();
  pthread_mutex_lock(&iptv_epg_mutex);
  if (!strcmp(iptv_epg_key, keybuf) || iptv_epg_busy || (now - iptv_epg_last_req) < 350) {
    pthread_mutex_unlock(&iptv_epg_mutex);
    return;
  }
  snprintf(iptv_epg_key, sizeof(iptv_epg_key), "%s", keybuf);
  iptv_epg_now_time[0] = iptv_epg_now_title[0] = 0;
  iptv_epg_next_time[0] = iptv_epg_next_title[0] = 0;
  iptv_epg_busy = true;
  iptv_epg_last_req = now;
  pthread_mutex_unlock(&iptv_epg_mutex);

  IptvEpgJob *job = calloc(1, sizeof(*job));
  if (!job) return;
  snprintf(job->name, sizeof(job->name), "%s", ch->name);
  snprintf(job->id, sizeof(job->id), "%s", ch->id);
  snprintf(job->key, sizeof(job->key), "%s", keybuf);
  pthread_t t;
  if (pthread_create(&t, NULL, iptv_epg_worker, job) == 0) pthread_detach(t);
  else { free(job); pthread_mutex_lock(&iptv_epg_mutex); iptv_epg_busy = false; pthread_mutex_unlock(&iptv_epg_mutex); }
}

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

static int iptv_source_count(void) {
  return adult_section_unlocked ? 5 : 4;
}

static const char *iptv_source_slug(int src) {
  switch (src) {
    case 1: return "filmes";
    case 2: return "series";
    case 3: return "usuario";
    case 4: return iptv_adult_provider == 2 ? "xvideos" : "adult18";
    default: return "canais";
  }
}

static const char *iptv_source_label(int src) {
  switch (src) {
    case 1: return tr("Filmes");
    case 2: return tr("Séries");
    case 3: return tr("Usuário");
    case 4: return "+18";
    default: return tr("Canais");
  }
}

static const char *iptv_source_subtitle(int src) {
  switch (src) {
    case 1: return IPTV_FILMES_URL;
    case 2: return IPTV_FILMES_URL;
    case 3: return tr("Pasta iptv_usuario/ + Teclado");
    case 4:
      if (iptv_adult_provider == 1) return "PornHub • Derfirm/pornhub-api";
      if (iptv_adult_provider == 2) return "XVideos • xvideos_api";
      return "Escolha: PornHub ou XVideos (+18)";
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
                          !strncmp(p, "kplayer-series://", 17) ||
                          !strncmp(p, "kplayer-adult://", 16);
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
  } else if (spec->job == IPTV_JOB_RESOLVE_ADULT) {
    argv[ac++] = "resolve-adult";
    argv[ac++] = spec->arg1;
    argv[ac++] = spec->out_path;
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

static void iptv_resolve_adult_start(const IptvChannel *ch) {
  if (!ch || strncmp(ch->url, "kplayer-adult://", 16) != 0) return;
  const char *vid = ch->url + 16;
  if (!vid[0]) return;
  iptv_copy_str(iptv_adult_pending_name, sizeof(iptv_adult_pending_name), ch->name);
  IptvJobSpec spec;
  memset(&spec, 0, sizeof(spec));
  spec.job = IPTV_JOB_RESOLVE_ADULT;
  spec.source = 4;
  iptv_copy_str(spec.arg1, sizeof(spec.arg1), vid);
  iptv_copy_str(spec.out_path, sizeof(spec.out_path), "iptv/.adult-stream.txt");
  if (iptv_start_job(&spec)) {
    notify("Carregando vídeo +18...");
  }
}

static void iptv_reload(void) {
  iptv_view = IPTV_VIEW_CATS;
  iptv_count = iptv_selected = iptv_offset = 0;
  iptv_ep_count = iptv_ep_selected = iptv_ep_offset = 0;
  iptv_reload_cats_cache();
}

static void iptv_open(void) {
  int max_src = iptv_source_count() - 1;
  if (iptv_source < 0 || iptv_source > max_src) iptv_source = 0;
  if (iptv_source == 4) iptv_adult_provider = 0;
  iptv_reload();
  if (iptv_source != 4 && (!iptv_cat_count || iptv_source == 3))
    iptv_fetch_categories_start(false);
  mode = 8;
}

static void iptv_switch_source(int delta) {
  int n = iptv_source_count();
  iptv_source = (iptv_source + delta + n) % n;
  if (iptv_source == 4) {
    iptv_adult_provider = 0;
    iptv_view = IPTV_VIEW_CATS;
    iptv_count = iptv_selected = iptv_offset = 0;
    iptv_cat_count = iptv_cat_selected = iptv_cat_offset = 0;
    return;
  }
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
    if (!strncmp(iptv_channels[iptv_selected].url, "kplayer-adult://", 16))
      iptv_resolve_adult_start(&iptv_channels[iptv_selected]);
    else
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

static int iptv_filtered_count(const IptvChannel *list, int total_n) {
  if (!iptv_search_query[0]) return total_n;
  int cnt = 0;
  for (int i = 0; i < total_n; i++) {
    if (iptv_contains_ci(list[i].name, iptv_search_query) ||
        iptv_contains_ci(list[i].group, iptv_search_query))
      cnt++;
  }
  return cnt;
}

static int iptv_filtered_index(const IptvChannel *list, int total_n, int pos) {
  if (!iptv_search_query[0]) return (pos >= 0 && pos < total_n) ? pos : -1;
  int cur = 0;
  for (int i = 0; i < total_n; i++) {
    if (iptv_contains_ci(list[i].name, iptv_search_query) ||
        iptv_contains_ci(list[i].group, iptv_search_query)) {
      if (cur == pos) return i;
      cur++;
    }
  }
  return -1;
}

static void iptv_open_search_kb(void) {
  if (iptv_view != IPTV_VIEW_SEARCH_KB && iptv_view != IPTV_VIEW_KEYBOARD)
    iptv_search_return_view = iptv_view;
  iptv_skb_row = 1;
  iptv_skb_col = 0;
  iptv_view = IPTV_VIEW_SEARCH_KB;
}

static void iptv_clear_search(void) {
  iptv_search_query[0] = 0;
  iptv_selected = iptv_offset = 0;
  iptv_ep_selected = iptv_ep_offset = 0;
}

static void iptv_open_add_url_kb(void) {
  iptv_source = 3;
  snprintf(iptv_kb_url, sizeof(iptv_kb_url), "https://");
  iptv_kb_row = 2;
  iptv_kb_col = 0;
  iptv_view = IPTV_VIEW_KEYBOARD;
}

static void iptv_refresh_current(void) {
  if (iptv_view == IPTV_VIEW_EPISODES && iptv_active_series_title[0]) {
    iptv_fetch_episodes_start(iptv_active_series_letter, iptv_active_series_shard,
                              iptv_active_series_title, true);
  } else if (iptv_view == IPTV_VIEW_ITEMS && iptv_active_cat_id[0]) {
    iptv_fetch_items_start(iptv_active_cat_id, iptv_active_cat_name, true);
  } else {
    iptv_fetch_categories_start(true);
  }
}

static void iptv_apply_search_submit(void) {
  iptv_selected = iptv_offset = 0;
  iptv_ep_selected = iptv_ep_offset = 0;
  if (iptv_source == 4 && iptv_search_query[0]) {
    if (iptv_adult_provider == 0) iptv_adult_provider = iptv_adult_prov_sel + 1;
    char qid[128], qlabel[128];
    snprintf(qid, sizeof(qid), "search:%.63s", iptv_search_query);
    snprintf(qlabel, sizeof(qlabel), "%s: %.63s",
             iptv_adult_provider == 2 ? "XVideos" : "PornHub", iptv_search_query);
    iptv_fetch_items_start(qid, qlabel, true);
    return;
  }
  if (iptv_search_return_view == IPTV_VIEW_CATS && iptv_search_query[0] && iptv_cat_count > 0) {
    /* Prefer opening "all" / first category so user immediately sees matching channels/series */
    int pick = 0;
    for (int i = 0; i < iptv_cat_count; i++) {
      if (!strcmp(iptv_cats[i].id, "all")) { pick = i; break; }
    }
    iptv_fetch_items_start(iptv_cats[pick].id, iptv_cats[pick].name, false);
    return;
  }
  iptv_view = iptv_search_return_view;
}

static void iptv_key(SDL_Keycode k) {
  if (iptv_view == IPTV_VIEW_SEARCH_KB) {
    int rlen = iptv_skb_row_len(iptv_skb_row);
    if (k == SDLK_UP) {
      iptv_skb_row = (iptv_skb_row + 4) % 5;
      int nl = iptv_skb_row_len(iptv_skb_row);
      if (iptv_skb_col >= nl) iptv_skb_col = nl - 1;
    } else if (k == SDLK_DOWN) {
      iptv_skb_row = (iptv_skb_row + 1) % 5;
      int nl = iptv_skb_row_len(iptv_skb_row);
      if (iptv_skb_col >= nl) iptv_skb_col = nl - 1;
    } else if (k == SDLK_LEFT && rlen > 0) {
      iptv_skb_col = (iptv_skb_col + rlen - 1) % rlen;
    } else if (k == SDLK_RIGHT && rlen > 0) {
      iptv_skb_col = (iptv_skb_col + 1) % rlen;
    } else if (k == SDLK_SPACE) {
      size_t len = strlen(iptv_search_query);
      if (len > 0) iptv_search_query[len - 1] = 0;
    } else if (k == SDLK_BACKSPACE) {
      iptv_view = iptv_search_return_view;
    } else if (k == SDLK_RETURN) {
      const char *tok = iptv_skb_rows[iptv_skb_row][iptv_skb_col];
      if (!tok) return;
      if (!strcmp(tok, "APAGAR")) {
        size_t len = strlen(iptv_search_query);
        if (len > 0) iptv_search_query[len - 1] = 0;
      } else if (!strcmp(tok, "LIMPAR")) {
        iptv_search_query[0] = 0;
      } else if (!strcmp(tok, "BUSCAR")) {
        iptv_apply_search_submit();
      } else if (!strcmp(tok, "VOLTAR")) {
        iptv_view = iptv_search_return_view;
      } else {
        size_t len = strlen(iptv_search_query);
        size_t add = strlen(tok);
        if (len + add + 1 < sizeof(iptv_search_query))
          memcpy(iptv_search_query + len, tok, add + 1);
      }
    }
    return;
  }

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
    if (iptv_source == 4 && iptv_adult_provider == 0) {
      if (k == SDLK_UP || k == SDLK_DOWN) {
        iptv_adult_prov_sel = (iptv_adult_prov_sel + 1) % 2;
      } else if (k == SDLK_RETURN) {
        iptv_adult_provider = iptv_adult_prov_sel + 1;
        iptv_reload();
        iptv_fetch_categories_start(false);
      } else if (k == SDLK_q) {
        iptv_open_search_kb();
      } else if (k == SDLK_LEFT && !radio_play_is_busy()) {
        iptv_clear_search();
        iptv_switch_source(-1);
      } else if ((k == SDLK_RIGHT || k == SDLK_SPACE) && !radio_play_is_busy()) {
        iptv_clear_search();
        iptv_switch_source(1);
      } else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
        mode = 3;
      }
      return;
    }
    int total = iptv_cat_total_rows();
    if (k == SDLK_UP && total > 0)
      iptv_cat_selected = (iptv_cat_selected + total - 1) % total;
    else if (k == SDLK_DOWN && total > 0)
      iptv_cat_selected = (iptv_cat_selected + 1) % total;
    else if (k == SDLK_RETURN) {
      if (iptv_source == 3 && iptv_cat_selected == 0) {
        iptv_open_add_url_kb();
      } else {
        int idx = iptv_source == 3 ? iptv_cat_selected - 1 : iptv_cat_selected;
        if (idx >= 0 && idx < iptv_cat_count)
          iptv_fetch_items_start(iptv_cats[idx].id, iptv_cats[idx].name, false);
      }
    } else if (k == SDLK_q) {
      iptv_open_search_kb();
    } else if (k == SDLK_e && iptv_search_query[0]) {
      iptv_clear_search();
      notify("Pesquisa limpa");
    } else if (k == SDLK_LEFT && !radio_play_is_busy()) {
      iptv_clear_search();
      iptv_switch_source(-1);
    } else if ((k == SDLK_RIGHT || k == SDLK_SPACE) && !radio_play_is_busy()) {
      iptv_clear_search();
      iptv_switch_source(1);
    } else if (k == SDLK_m && !radio_play_is_busy()) {
      iptv_fetch_categories_start(true);
    } else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
      if (iptv_source == 4 && iptv_adult_provider > 0) {
        iptv_adult_provider = 0;
        iptv_cat_count = iptv_cat_selected = iptv_cat_offset = 0;
      } else {
        mode = 3;
      }
    }
    return;
  }

  if (iptv_view == IPTV_VIEW_ITEMS) {
    int vis_n = iptv_filtered_count(iptv_channels, iptv_count);
    if (k == SDLK_UP && vis_n > 0)
      iptv_selected = (iptv_selected + vis_n - 1) % vis_n;
    else if (k == SDLK_DOWN && vis_n > 0)
      iptv_selected = (iptv_selected + 1) % vis_n;
    else if (k == SDLK_RETURN && vis_n > 0) {
      int real_idx = iptv_filtered_index(iptv_channels, iptv_count, iptv_selected);
      if (real_idx >= 0 && real_idx < iptv_count) {
        IptvChannel *ch = &iptv_channels[real_idx];
        char ltr[16] = "", sh[32] = "";
        if (iptv_parse_series_id(ch, ltr, sizeof(ltr), sh, sizeof(sh))) {
          iptv_clear_search();
          iptv_fetch_episodes_start(ltr, sh, ch->name, false);
        } else if (!strncmp(ch->url, "kplayer-adult://", 16)) {
          iptv_resolve_adult_start(ch);
        } else {
          iptv_play_channel(ch);
        }
      }
    } else if (k == SDLK_q) {
      iptv_open_search_kb();
    } else if (k == SDLK_e && iptv_search_query[0]) {
      iptv_clear_search();
      notify("Pesquisa limpa");
    } else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
      if (iptv_search_query[0]) {
        iptv_clear_search();
      } else {
        iptv_view = IPTV_VIEW_CATS;
      }
    } else if (k == SDLK_SPACE && vis_n > 0) {
      int real_idx = iptv_filtered_index(iptv_channels, iptv_count, iptv_selected);
      if (real_idx >= 0 && real_idx < iptv_count) {
        bool added = iptv_fav_toggle_url(iptv_channels[real_idx].url);
        iptv_selected = iptv_offset = 0;
        notify(added ? "★ Canal fixado no topo dos favoritos!" : "Removido dos favoritos de IPTV");
      }
    } else if (k == SDLK_LEFT && !radio_play_is_busy()) {
      iptv_clear_search();
      iptv_switch_source(-1);
    } else if (k == SDLK_RIGHT && !radio_play_is_busy()) {
      iptv_clear_search();
      iptv_switch_source(1);
    } else if (k == SDLK_m && !radio_play_is_busy() && iptv_active_cat_id[0]) {
      iptv_fetch_items_start(iptv_active_cat_id, iptv_active_cat_name, true);
    }
    return;
  }

  /* IPTV_VIEW_EPISODES */
  int vis_ep = iptv_filtered_count(iptv_episodes, iptv_ep_count);
  if (k == SDLK_UP && vis_ep > 0)
    iptv_ep_selected = (iptv_ep_selected + vis_ep - 1) % vis_ep;
  else if (k == SDLK_DOWN && vis_ep > 0)
    iptv_ep_selected = (iptv_ep_selected + 1) % vis_ep;
  else if (k == SDLK_RETURN && vis_ep > 0) {
    int real_idx = iptv_filtered_index(iptv_episodes, iptv_ep_count, iptv_ep_selected);
    if (real_idx >= 0 && real_idx < iptv_ep_count)
      iptv_play_channel(&iptv_episodes[real_idx]);
  } else if (k == SDLK_q) {
    iptv_open_search_kb();
  } else if (k == SDLK_e && iptv_search_query[0]) {
    iptv_clear_search();
    notify("Pesquisa limpa");
  } else if (k == SDLK_BACKSPACE && !radio_play_is_busy()) {
    if (iptv_search_query[0]) iptv_clear_search();
    else iptv_view = IPTV_VIEW_ITEMS;
  } else if (k == SDLK_m && !radio_play_is_busy() && iptv_active_series_title[0])
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
      iptv_pin_favorites_first(iptv_channels, iptv_count);
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
  } else if (job == IPTV_JOB_RESOLVE_ADULT) {
    char stream_url[1024] = "";
    if (ok) {
      FILE *f = fopen(done_path, "r");
      if (f) {
        if (fgets(stream_url, sizeof(stream_url), f)) {
          size_t n = strlen(stream_url);
          while (n > 0 && (stream_url[n - 1] == '\n' || stream_url[n - 1] == '\r')) stream_url[--n] = 0;
        }
        fclose(f);
      }
    }
    if (stream_url[0] && (!strncmp(stream_url, "http://", 7) || !strncmp(stream_url, "https://", 8))) {
      IptvChannel resolved;
      memset(&resolved, 0, sizeof(resolved));
      iptv_copy_str(resolved.name, sizeof(resolved.name),
                    iptv_adult_pending_name[0] ? iptv_adult_pending_name : "Vídeo +18");
      iptv_copy_str(resolved.url, sizeof(resolved.url), stream_url);
      iptv_play_channel(&resolved);
    } else {
      notify("Não foi possível obter o fluxo direto deste vídeo +18");
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

static void draw_iptv_search_keyboard(void) {
  backdrop();
  draw_header(tr("PESQUISAR IPTV"));
  char ttl[96];
  snprintf(ttl, sizeof(ttl), "Pesquisar em %s", iptv_source_label(iptv_source));
  label(ttl, 24, 42, 22, textc, 420);
  label("Digite o nome do canal, filme ou série e selecione BUSCAR", 24, 70, 12, muted, 580);

  card(24, 94, 592, 42, 10, true, elevated);
  char shown[96];
  snprintf(shown, sizeof(shown), "Busca: %.63s_", iptv_search_query);
  label(shown, 38, 105, 16, accent, 560);

  for (int r = 0; r < 5; r++) {
    int cols = iptv_skb_row_len(r);
    int y = 152 + r * 54;
    if (r == 4) {
      int w = 142;
      for (int c = 0; c < cols; c++) {
        int x = 24 + c * 150;
        bool focus = (r == iptv_skb_row && c == iptv_skb_col);
        card(x, y, w, 42, 10, focus, panel);
        centered(iptv_skb_rows[r][c], x + 4, y + 12, w - 8, 14, focus ? accent : textc);
      }
    } else {
      int w = 55;
      for (int c = 0; c < cols; c++) {
        int x = 24 + c * 59;
        bool focus = (r == iptv_skb_row && c == iptv_skb_col);
        card(x, y, w, 42, 9, focus, panel);
        const char *lbl = !strcmp(iptv_skb_rows[r][c], " ") ? "ESP" : iptv_skb_rows[r][c];
        centered(lbl, x + 2, y + 11, w - 4, strlen(lbl) > 2 ? 12 : 16, focus ? accent : textc);
      }
    }
  }
  footer_hints(NULL, 0);
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
  if (iptv_view == IPTV_VIEW_SEARCH_KB) {
    draw_iptv_search_keyboard();
    return;
  }

  backdrop();
  draw_header(tr("IPTV"));
  label(iptv_source_label(iptv_source), 18, 40, 22, textc, 220);
  label(iptv_source_subtitle(iptv_source), 18, 66, 11, dim, 250);

  /* Four or five source tabs: Canais | Filmes | Séries | Usuário [| +18 when unlocked] */
  int n_tabs = iptv_source_count();
  if (iptv_source >= n_tabs) iptv_source = 0;
  int tab_w = (n_tabs == 5) ? 66 : 82;
  int tab_step = (n_tabs == 5) ? 70 : 86;
  int tab_start_x = (n_tabs == 5) ? 272 : 276;
  for (int s = 0; s < n_tabs; s++) {
    int tx = tab_start_x + s * tab_step;
    pill(tx, 44, tab_w, 26, iptv_source == s);
    centered(iptv_source_label(s), tx + 2, 50, tab_w - 4, 12,
             iptv_source == s ? bg : muted);
  }

  if (iptv_view == IPTV_VIEW_CATS) {
    if (iptv_source == 4 && iptv_adult_provider == 0) {
      label("Escolha o catálogo +18 (B para entrar)", 18, 86, 14, muted, 460);
      static const char *prov_names[2] = {"PornHub", "XVideos"};
      static const char *prov_subs[2] = {
          "API Derfirm/pornhub-api • Categorias, Destaques e Busca",
          "API xvideos_api • Destaques, Melhores, Tags e Busca",
      };
      static const char *prov_badges[2] = {"PORNHUB", "XVIDEOS"};
      for (int p = 0; p < 2; p++) {
        int cy = 128 + p * 116;
        bool focus = (iptv_adult_prov_sel == p);
        card(24, cy, 592, 98, 14, focus, panel);
        rounded(44, cy + 20, 96, 26, 10, focus ? accent : elevated);
        centered(prov_badges[p], 44, cy + 26, 96, 11, focus ? bg : muted);
        label(prov_names[p], 156, cy + 18, 22, focus ? accent : textc, 360);
        label(prov_subs[p], 156, cy + 50, 12, muted, 440);
        label(focus ? "B  Entrar >" : "Selecionar", 500, cy + 38, 12, focus ? accent : dim, 100);
      }
      label("Você pode bloquear a Seção +18 a qualquer momento em SELECT → Opções do IPTV.",
            24, 384, 11, dim, 592);
      footer_hints(NULL, 0);
      return;
    }
    label(iptv_source == 3 ? tr("Coloque .m3u/.m3u8 em iptv_usuario/")
                           : (iptv_source == 4 ? (iptv_adult_provider == 2 ? "XVideos • Escolha a categoria (A volta)"
                                                                           : "PornHub • Escolha a categoria (A volta)")
                                               : tr("Escolha a categoria")),
          18, 84, 14, muted, 340);
    rounded(366, 80, 254, 24, 10, iptv_search_query[0] ? alpha(accent, 42) : elevated);
    char sbtn[88];
    if (iptv_search_query[0]) snprintf(sbtn, sizeof(sbtn), "Busca: %.18s (L1/R1)", iptv_search_query);
    else snprintf(sbtn, sizeof(sbtn), "L1 • Pesquisar digitando");
    centered(sbtn, 370, 86, 246, 11, iptv_search_query[0] ? accent : muted);

    int total = iptv_cat_total_rows();
    if (iptv_cat_selected >= total && total > 0) iptv_cat_selected = total - 1;
    if (iptv_cat_selected < iptv_cat_offset) iptv_cat_offset = iptv_cat_selected;
    if (iptv_cat_selected >= iptv_cat_offset + 7) iptv_cat_offset = iptv_cat_selected - 6;

    if (total == 0) {
      centered(busy ? tr("Carregando categorias...") : tr("Nenhum item encontrado"),
               25, 220, 590, 21, muted);
      centered(tr("Pressione Y para atualizar"), 25, 258, 590, 15, muted);
    } else {
      for (int row = 0; row < 7 && iptv_cat_offset + row < total; row++) {
        int pos = iptv_cat_offset + row, y = 112 + row * 51;
        bool focus = pos == iptv_cat_selected;
        card(18, y, 604, 46, 10, focus, panel);
        if (iptv_source == 3 && pos == 0) {
          label(tr("+ Adicionar URL pelo teclado"), 36, y + 12, 17, accent, 470);
          label(tr("Teclado"), 520, y + 14, 13, focus ? accent : muted, 88);
        } else {
          int ci = iptv_source == 3 ? pos - 1 : pos;
          label(iptv_cats[ci].name, 36, y + 12, 17, focus ? accent : textc, 476);
          char n[32];
          snprintf(n, sizeof(n), "%d", iptv_cats[ci].count);
          label(n, 530, y + 13, 14, muted, 78);
        }
      }
    }
    if (radio_play_is_busy()) label(tr("Conectando canal..."), 18, 463, 12, accent, 500);
    else if (busy && fetching_source == iptv_source)
      label(tr("Carregando categorias..."), 18, 463, 12, accent, 500);
    footer_hints(NULL, 0);
    return;
  }

  /* Shared list renderer for IPTV_VIEW_ITEMS and IPTV_VIEW_EPISODES */
  bool is_ep_view = (iptv_view == IPTV_VIEW_EPISODES);
  IptvChannel *list = is_ep_view ? iptv_episodes : iptv_channels;
  int raw_count = is_ep_view ? iptv_ep_count : iptv_count;
  int list_count = iptv_filtered_count(list, raw_count);
  int *sel = is_ep_view ? &iptv_ep_selected : &iptv_selected;
  int *off = is_ep_view ? &iptv_ep_offset : &iptv_offset;

  char subhdr[220];
  snprintf(subhdr, sizeof(subhdr), "%.140s (%d)",
           is_ep_view ? iptv_active_series_title : iptv_active_cat_name, list_count);
  label(subhdr, 18, 84, 15, accent, 340);

  rounded(366, 80, 254, 24, 10, iptv_search_query[0] ? alpha(accent, 42) : elevated);
  char sbtn[88];
  if (iptv_search_query[0]) snprintf(sbtn, sizeof(sbtn), "Busca: %.18s (R1 limpa)", iptv_search_query);
  else snprintf(sbtn, sizeof(sbtn), "L1 • Pesquisar digitando");
  centered(sbtn, 370, 86, 246, 11, iptv_search_query[0] ? accent : muted);

  if (list_count == 0) {
    centered(busy ? (is_ep_view ? tr("Carregando episódios...") : tr("Carregando lista..."))
                  : (iptv_search_query[0] ? "Nenhum resultado encontrado na busca"
                                          : (is_ep_view ? tr("Nenhum episódio encontrado") : tr("Nenhum canal nesta categoria"))),
             25, 220, 590, 20, muted);
    centered(iptv_search_query[0] ? "Pressione R1 para limpar a busca ou L1 para editar"
                                  : tr("Pressione Y para atualizar"),
             25, 258, 590, 14, muted);
  } else {
    if (*sel >= list_count) *sel = list_count - 1;
    if (*sel < *off) *off = *sel;
    if (*sel >= *off + 7) *off = *sel - 6;
    int real_sel = iptv_filtered_index(list, raw_count, *sel);
    IptvChannel *channel = &list[real_sel >= 0 ? real_sel : 0];
    if (!is_ep_view && iptv_source == 0) iptv_epg_maybe_fetch(channel);
    panel_card(18, 112, 206, 354, 16);
    rounded(40, 124, 162, 104, 8, elevated);
    radio_update_art(channel->logo);
    if (radio_art_texture && channel->logo[0] && !strcmp(radio_art_display_url, channel->logo)) {
      SDL_Rect dst = {45, 129, 152, 94};
      SDL_RenderCopy(renderer, radio_art_texture, NULL, &dst);
    } else {
      centered(tr("Sem imagem"), 45, 166, 152, 14, muted);
    }
    centered(channel->name, 28, 236, 186, 15, textc);
    label(is_ep_view ? tr("Temporada") : tr("Categoria"), 30, 266, 11, muted, 180);
    label(channel->group[0] ? channel->group : "--", 30, 283, 13, textc, 180);
    if (!is_ep_view && iptv_source == 0) {
      pthread_mutex_lock(&iptv_epg_mutex);
      char e_nt[24], e_np[128], e_xt[24], e_xp[128];
      bool e_busy = iptv_epg_busy;
      snprintf(e_nt, sizeof(e_nt), "%.23s", iptv_epg_now_time);
      snprintf(e_np, sizeof(e_np), "%.127s", iptv_epg_now_title);
      snprintf(e_xt, sizeof(e_xt), "%.23s", iptv_epg_next_time);
      snprintf(e_xp, sizeof(e_xp), "%.127s", iptv_epg_next_title);
      pthread_mutex_unlock(&iptv_epg_mutex);
      label("EPG • AGORA", 30, 312, 11, accent, 180);
      if (e_np[0]) {
        label(e_np, 30, 329, 13, textc, 182);
        if (e_nt[0]) label(e_nt, 30, 348, 11, muted, 182);
      } else {
        label(e_busy ? "Carregando guia..." : "Guia indisponível", 30, 329, 12, muted, 182);
      }
      if (e_xp[0]) {
        label("A SEGUIR", 30, 376, 11, dim, 180);
        label(e_xp, 30, 393, 12, muted, 182);
        if (e_xt[0]) label(e_xt, 30, 411, 11, dim, 182);
      }
    } else {
      label(tr("Detalhes"), 30, 316, 12, muted, 180);
      const char *detail = channel->id;
      if (!strncmp(detail, "series:", 7)) {
        const char *c1 = strchr(detail + 7, ':');
        const char *c2 = c1 ? strchr(c1 + 1, ':') : NULL;
        if (c2 && c2[1]) detail = c2 + 1;
      }
      label(detail[0] ? detail : "--", 30, 336, 13, accent, 182);
    }

    for (int row = 0; row < 7 && *off + row < list_count; row++) {
      int pos = *off + row, y = 112 + row * 51;
      int idx = iptv_filtered_index(list, raw_count, pos);
      if (idx < 0) continue;
      bool focus = pos == *sel;
      bool is_fav = !is_ep_view && iptv_fav_is(list[idx].url);
      card(236, y, 386, 46, 10, focus, panel);
      char number[24];
      snprintf(number, sizeof(number), is_fav ? "★" : "%d", pos + 1);
      label(number, 248, y + 13, 14, (focus || is_fav) ? accent : muted, 44);
      label(list[idx].name, 294, y + 6, 16, textc, 318);
      if (list[idx].group[0]) {
        char meta_line[160];
        snprintf(meta_line, sizeof(meta_line), is_fav ? "★ Favorito  •  %.120s" : "%.120s",
                 list[idx].group);
        label(meta_line, 294, y + 27, 11, is_fav ? accent : muted, 318);
      } else if (is_fav) {
        label("★ Favorito fixado (X remove)", 294, y + 27, 11, accent, 318);
      }
    }
  }

  if (radio_play_is_busy()) label(tr("Conectando canal..."), 18, 464, 12, accent, 500);
  else if (busy) label(is_ep_view ? tr("Carregando episódios...") : tr("Carregando lista..."),
                       18, 464, 12, accent, 500);
  footer_hints(NULL, 0);
}
