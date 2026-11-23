/* Notícias Brasil — NewsData.io live news reader for KPlayer R36S (mode 15).
 * Network fetches run off-thread via ./news_fetch.py; UI renders bounded TSV rows. */

typedef struct {
  char category[24];
  char cat_label[28];
  char title[220];
  char source[64];
  char date[32];
  char summary[440];
  char body[1400];
} NewsArticle;

#define NEWS_MAX_ITEMS 60
#define NEWS_FILTER_COUNT 6

static NewsArticle news_articles[NEWS_MAX_ITEMS];
static int news_count, news_selected, news_offset, news_filter;
static bool news_detail_open;
static int news_detail_scroll;

static pthread_mutex_t news_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool news_busy, news_done, news_ok, news_stale;
static char news_req_cat[24];

static const char *news_filter_keys[NEWS_FILTER_COUNT] = {
    "all", "breaking", "world", "crime", "entertainment", "sports"
};
static const char *news_filter_labels[NEWS_FILTER_COUNT] = {
    "Todas", "Urgente", "Mundo", "Polícia", "Entret.", "Esportes"
};

static int news_visible_indices(int *out, int cap) {
  int n = 0;
  for (int i = 0; i < news_count && n < cap; i++) {
    if (news_filter > 0 && news_filter < NEWS_FILTER_COUNT) {
      if (strcmp(news_articles[i].category, news_filter_keys[news_filter]) != 0)
        continue;
    }
    out[n++] = i;
  }
  return n;
}

static void news_read(void) {
  news_count = news_selected = news_offset = 0;
  FILE *f = fopen(".news-cache.tsv", "r");
  if (!f) return;
  char line[2400];
  while (news_count < NEWS_MAX_ITEMS && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    char *parts[7] = {0}, *p = line;
    int cols = 0;
    while (cols < 7) {
      parts[cols++] = p;
      char *tab = strchr(p, '\t');
      if (!tab) break;
      *tab = 0;
      p = tab + 1;
    }
    if (cols < 3 || !parts[2][0]) continue;
    NewsArticle *a = &news_articles[news_count++];
    memset(a, 0, sizeof(*a));
    snprintf(a->category, sizeof(a->category), "%.23s", parts[0]);
    snprintf(a->cat_label, sizeof(a->cat_label), "%.27s", parts[1][0] ? parts[1] : "Brasil");
    snprintf(a->title, sizeof(a->title), "%.219s", parts[2]);
    if (cols >= 4) snprintf(a->source, sizeof(a->source), "%.63s", parts[3]);
    if (cols >= 5) snprintf(a->date, sizeof(a->date), "%.31s", parts[4]);
    if (cols >= 6) snprintf(a->summary, sizeof(a->summary), "%.439s", parts[5]);
    if (cols >= 7) snprintf(a->body, sizeof(a->body), "%.1399s", parts[6]);
  }
  fclose(f);
}

static void *news_worker(void *arg) {
  (void)arg;
  char cat[24];
  pthread_mutex_lock(&news_mutex);
  snprintf(cat, sizeof(cat), "%s", news_req_cat[0] ? news_req_cat : "all");
  pthread_mutex_unlock(&news_mutex);

  char *args[] = {"python3", "./news_fetch.py", cat, NULL};
  pid_t child, result;
  int status = 0;
  bool ok = false;
  if (!posix_spawnp(&child, "python3", NULL, NULL, args, environ)) {
    do { result = waitpid(child, &status, 0); } while (result < 0 && errno == EINTR);
    ok = result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0;
  }
  pthread_mutex_lock(&news_mutex);
  news_busy = false;
  news_done = true;
  news_ok = ok;
  pthread_mutex_unlock(&news_mutex);
  return NULL;
}

static void news_refresh_cat(const char *cat) {
  pthread_mutex_lock(&news_mutex);
  if (news_busy) {
    pthread_mutex_unlock(&news_mutex);
    return;
  }
  snprintf(news_req_cat, sizeof(news_req_cat), "%.23s", (cat && cat[0]) ? cat : "all");
  news_busy = true;
  news_done = false;
  pthread_mutex_unlock(&news_mutex);
  pthread_t t;
  if (!pthread_create(&t, NULL, news_worker, NULL)) {
    pthread_detach(t);
  } else {
    pthread_mutex_lock(&news_mutex);
    news_busy = false;
    news_done = true;
    news_ok = false;
    pthread_mutex_unlock(&news_mutex);
  }
}

static void news_open(void) {
  news_detail_open = false;
  news_detail_scroll = 0;
  news_filter = 0;
  if (!news_count) {
    news_read();
    news_stale = true;
    news_refresh_cat("all");
  }
  mode = 15;
}

static void news_key(SDL_Keycode k) {
  int vis[NEWS_MAX_ITEMS];
  int n = news_visible_indices(vis, NEWS_MAX_ITEMS);

  if (news_detail_open) {
    if (k == SDLK_BACKSPACE) {
      news_detail_open = false;
      news_detail_scroll = 0;
      return;
    }
    if (k == SDLK_UP && news_detail_scroll > 0) {
      news_detail_scroll--;
    } else if (k == SDLK_DOWN && news_detail_scroll < 12) {
      news_detail_scroll++;
    } else if ((k == SDLK_LEFT || k == SDLK_q) && n > 1) {
      news_selected = (news_selected + n - 1) % n;
      news_detail_scroll = 0;
    } else if ((k == SDLK_RIGHT || k == SDLK_e) && n > 1) {
      news_selected = (news_selected + 1) % n;
      news_detail_scroll = 0;
    } else if (k == SDLK_m) {
      news_refresh_cat(news_filter_keys[news_filter]);
    }
    return;
  }

  if (k == SDLK_BACKSPACE) {
    mode = 3;
    return;
  }
  if (k == SDLK_m) {
    news_refresh_cat(news_filter_keys[news_filter]);
  } else if (k == SDLK_LEFT) {
    news_filter = (news_filter + NEWS_FILTER_COUNT - 1) % NEWS_FILTER_COUNT;
    news_selected = news_offset = 0;
  } else if (k == SDLK_RIGHT || k == SDLK_SPACE) {
    news_filter = (news_filter + 1) % NEWS_FILTER_COUNT;
    news_selected = news_offset = 0;
  } else if (k == SDLK_UP && n > 0) {
    news_selected = (news_selected + n - 1) % n;
  } else if (k == SDLK_DOWN && n > 0) {
    news_selected = (news_selected + 1) % n;
  } else if (k == SDLK_RETURN && n > 0) {
    news_detail_open = true;
    news_detail_scroll = 0;
  }
}

/* Draws wrapped text starting at line offset skip_lines inside a box. */
static void news_draw_wrapped_scroll(const char *text, int x, int y, int width,
                                     int size, int step, int max_visible,
                                     int skip_lines, SDL_Color c) {
  if (!text || !text[0]) return;
  char copy[2048];
  snprintf(copy, sizeof(copy), "%s", text);
  char *save = NULL, *word = strtok_r(copy, " ", &save);
  char line[2048] = "";
  int line_idx = 0, drawn = 0;
  while (word) {
    char cand[2048];
    size_t a = strlen(line), b = strlen(word), sp = a ? 1 : 0;
    if (a + b + sp >= sizeof(cand)) break;
    memcpy(cand, line, a);
    if (sp) cand[a] = ' ';
    memcpy(cand + a + sp, word, b + 1);
    if (*line && measure(cand, size) > width) {
      if (line_idx >= skip_lines && drawn < max_visible) {
        label(line, x, y + drawn * step, size, c, width);
        drawn++;
      }
      line_idx++;
      snprintf(line, sizeof(line), "%s", word);
    } else {
      snprintf(line, sizeof(line), "%s", cand);
    }
    word = strtok_r(NULL, " ", &save);
  }
  if (*line && line_idx >= skip_lines && drawn < max_visible) {
    label(line, x, y + drawn * step, size, c, width);
  }
}

static void draw_news_detail(NewsArticle *a, int cur_idx, int total_n) {
  panel_card(16, 40, 608, 424, 16);

  /* Category badge + source + date + pager */
  int cw = (int)measure(a->cat_label, 11) + 22;
  if (cw < 72) cw = 72;
  if (cw > 150) cw = 150;
  rounded_gradient(30, 54, cw, 22, 10, alpha(accent, 58), alpha(accent, 26));
  rounded_outline(30, 54, cw, 22, 10, alpha(accent, 130));
  centered(a->cat_label, 30, 58, cw, 11, accent);

  char meta[120];
  snprintf(meta, sizeof(meta), "%.42s%s%.24s",
           a->source[0] ? a->source : "Notícias Brasil",
           a->date[0] ? "  •  " : "",
           a->date);
  label(meta, 38 + cw, 58, 12, muted, 470 - cw);

  char pager[32];
  snprintf(pager, sizeof(pager), "%d / %d", cur_idx + 1, total_n);
  label(pager, 546, 58, 11, dim, 64);

  /* Headline */
  int title_rows = wrapped(a->title, 30, 86, 580, 18, 23, 3, textc);
  if (title_rows < 1) title_rows = 2;
  int div_y = 92 + title_rows * 23;
  rect(30, div_y, 580, 1, hairline());

  /* Body text (prefers full body if richer than summary) */
  const char *full_txt = (a->body[0] && strlen(a->body) > strlen(a->summary))
                             ? a->body
                             : (a->summary[0] ? a->summary : tr("Sem resumo disponível para esta notícia."));
  int body_y = div_y + 12;
  int max_vis = (428 - body_y) / 21;
  if (max_vis < 3) max_vis = 3;
  news_draw_wrapped_scroll(full_txt, 30, body_y, 580, 14, 21, max_vis, news_detail_scroll, muted);

  /* Bottom reader hint strip */
  rect(30, 432, 580, 1, hairline());
  centered("A: Voltar   •   Cima/Baixo: Rolar   •   L1/R1: Próxima notícia   •   Y: Atualizar",
           30, 441, 580, 11, dim);
  footer_hints(NULL, 0);
}

static void draw_news(void) {
  pthread_mutex_lock(&news_mutex);
  bool busy = news_busy, done = news_done, ok = news_ok;
  news_done = false;
  pthread_mutex_unlock(&news_mutex);
  if (done) {
    if (ok) {
      news_read();
      news_stale = false;
    } else {
      news_stale = true;
      notify(tr("Não foi possível atualizar notícias"));
    }
  }

  backdrop();
  draw_header(tr("NOTÍCIAS"));

  int vis[NEWS_MAX_ITEMS];
  int n = news_visible_indices(vis, NEWS_MAX_ITEMS);
  if (news_detail_open && n > 0) {
    if (news_selected >= n) news_selected = n - 1;
    draw_news_detail(&news_articles[vis[news_selected]], news_selected, n);
    return;
  }

  /* Filter tabs row across the top */
  for (int i = 0; i < NEWS_FILTER_COUNT; i++) {
    int pw = 98;
    int px = 16 + i * 102;
    pill(px, 40, pw, 25, i == news_filter);
    centered(news_filter_labels[i], px + 2, 46, pw - 4, 11,
             i == news_filter ? bg : muted);
  }

  if (!n) {
    panel_card(24, 146, 592, 160, 16);
    centered(busy ? tr("Carregando notícias do Brasil...")
                  : news_stale ? tr("Sem notícias carregadas no momento")
                               : tr("Nenhuma notícia nesta categoria"),
             36, 198, 568, 19, busy ? accent : textc);
    centered("Y: Atualizar agora   •   Esq/Dir: Trocar categoria   •   A: Voltar",
             36, 240, 568, 12, muted);
  } else {
    if (news_selected >= n) news_selected = n - 1;
    if (news_selected < news_offset) news_offset = news_selected;
    if (news_selected >= news_offset + 5) news_offset = news_selected - 4;

    for (int row = 0; row < 5 && news_offset + row < n; row++) {
      int actual = news_offset + row;
      int y = 74 + row * 77;
      NewsArticle *a = &news_articles[vis[actual]];
      bool focus = actual == news_selected;

      card(16, y, 608, 71, 13, focus, panel);

      /* Category badge + source + date */
      int cw = (int)measure(a->cat_label, 10) + 18;
      if (cw < 62) cw = 62;
      if (cw > 118) cw = 118;
      rounded(28, y + 6, cw, 18, 8, focus ? accent : alpha(accent, 38));
      centered(a->cat_label, 28, y + 9, cw, 10, focus ? bg : accent);

      label(a->source[0] ? a->source : "Brasil", 36 + cw, y + 8, 11, muted, 340 - cw);
      if (a->date[0]) label(a->date, 492, y + 8, 10, dim, 120);

      /* Headline & preview */
      label(a->title, 28, y + 28, 15, textc, 584);
      label(a->summary[0] ? a->summary : "B para ler a matéria completa",
            28, y + 49, 11, muted, 584);
    }
  }

  if (busy)
    label("Atualizando notícias...", 18, 463, 11, accent, 380);
  else if (news_stale && n)
    label("Notícias em cache • pressione Y para atualizar", 18, 463, 11, accent, 460);

  footer_hints(NULL, 0);
}
