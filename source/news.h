/* Notícias Brasil — NewsData.io + RSS live news reader for KPlayer R36S (mode 15).
 * Network fetches & thumbnail caching run off-thread via ./news_fetch.py;
 * UI renders bounded TSV rows, cached SDL2 image thumbnails, and libVLC news videos. */

typedef struct {
  char category[24];
  char cat_label[28];
  char title[220];
  char source[64];
  char date[32];
  char summary[440];
  char body[1400];
  char image_path[96];
  char video_url[512];
} NewsArticle;

#define NEWS_MAX_ITEMS 60
#define NEWS_FILTER_COUNT 6
#define NEWS_TEX_SLOTS 12

typedef struct {
  char path[96];
  SDL_Texture *tex;
  int w;
  int h;
  uint32_t last_used;
  bool failed;
} NewsTexSlot;

static NewsArticle news_articles[NEWS_MAX_ITEMS];
static int news_count, news_selected, news_offset, news_filter;
static bool news_detail_open;
static int news_detail_scroll;

static NewsTexSlot news_tex_cache[NEWS_TEX_SLOTS];
static uint32_t news_tex_clock = 1;
static int news_tex_frame_budget = 1;

static pthread_mutex_t news_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool news_busy, news_done, news_ok, news_stale;
static char news_req_cat[24];

static const char *news_filter_keys[NEWS_FILTER_COUNT] = {
    "all", "breaking", "world", "crime", "entertainment", "sports"
};
static const char *news_filter_labels[NEWS_FILTER_COUNT] = {
    "Todas", "Urgente", "Mundo", "Polícia", "Entret.", "Esportes"
};

static void news_clear_textures(void) {
  for (int i = 0; i < NEWS_TEX_SLOTS; i++) {
    if (news_tex_cache[i].tex) {
      SDL_DestroyTexture(news_tex_cache[i].tex);
    }
    memset(&news_tex_cache[i], 0, sizeof(news_tex_cache[i]));
  }
}

static bool news_valid_thumb_path(const char *path) {
  if (!path || strncmp(path, ".news-thumbs/", 13) != 0) return false;
  if (strstr(path, "..") != NULL) return false;
  const char *fname = path + 13;
  if (!fname[0] || strchr(fname, '/') != NULL || strchr(fname, '\\') != NULL) return false;
  return true;
}

static bool news_valid_http_url(const char *url) {
  return url && (strncmp(url, "https://", 8) == 0 || strncmp(url, "http://", 7) == 0);
}

static NewsTexSlot *news_get_thumb(const char *path) {
  if (!renderer || !news_valid_thumb_path(path)) return NULL;

  int free_idx = -1, lru_idx = 0;
  uint32_t oldest = UINT32_MAX;
  for (int i = 0; i < NEWS_TEX_SLOTS; i++) {
    if (news_tex_cache[i].path[0] && strcmp(news_tex_cache[i].path, path) == 0) {
      news_tex_cache[i].last_used = ++news_tex_clock;
      return news_tex_cache[i].failed ? NULL : &news_tex_cache[i];
    }
    if (!news_tex_cache[i].path[0] && free_idx < 0) {
      free_idx = i;
    }
    if (news_tex_cache[i].last_used < oldest) {
      oldest = news_tex_cache[i].last_used;
      lru_idx = i;
    }
  }

  /* Decode at most 1 new thumbnail per frame so scrolling stays silky-smooth on R36S */
  if (news_tex_frame_budget <= 0) return NULL;
  news_tex_frame_budget--;

  int slot = free_idx >= 0 ? free_idx : lru_idx;
  if (news_tex_cache[slot].tex) {
    SDL_DestroyTexture(news_tex_cache[slot].tex);
  }
  memset(&news_tex_cache[slot], 0, sizeof(news_tex_cache[slot]));
  snprintf(news_tex_cache[slot].path, sizeof(news_tex_cache[slot].path), "%.95s", path);
  news_tex_cache[slot].last_used = ++news_tex_clock;

  int iw = 0, ih = 0, ch = 0;
  unsigned char *px = stbi_load(path, &iw, &ih, &ch, 4);
  if (!px || iw <= 0 || ih <= 0 || iw > 4096 || ih > 4096) {
    if (px) stbi_image_free(px);
    news_tex_cache[slot].failed = true;
    return NULL;
  }
  SDL_Texture *tex = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                       SDL_TEXTUREACCESS_STATIC, iw, ih);
  if (!tex || SDL_UpdateTexture(tex, NULL, px, iw * 4) != 0) {
    if (tex) SDL_DestroyTexture(tex);
    stbi_image_free(px);
    news_tex_cache[slot].failed = true;
    return NULL;
  }
  SDL_SetTextureBlendMode(tex, SDL_BLENDMODE_BLEND);
  stbi_image_free(px);

  news_tex_cache[slot].tex = tex;
  news_tex_cache[slot].w = iw;
  news_tex_cache[slot].h = ih;
  return &news_tex_cache[slot];
}

/* Aspect-ratio-preserving center crop blit (CSS object-cover equivalent) */
static void news_draw_thumb(NewsTexSlot *slot, int x, int y, int w, int h, bool has_video) {
  if (!slot || !slot->tex || slot->w <= 0 || slot->h <= 0) return;

  SDL_Rect src = {0, 0, slot->w, slot->h};
  double dst_ar = (double)w / (double)h;
  double src_ar = (double)slot->w / (double)slot->h;
  if (src_ar > dst_ar) {
    int nw = (int)(slot->h * dst_ar);
    if (nw < 1) nw = 1;
    src.x = (slot->w - nw) / 2;
    src.w = nw;
  } else if (src_ar < dst_ar) {
    int nh = (int)(slot->w / dst_ar);
    if (nh < 1) nh = 1;
    src.y = (slot->h - nh) / 2;
    src.h = nh;
  }

  SDL_Rect dst = {x, y, w, h};
  SDL_RenderCopy(renderer, slot->tex, &src, &dst);

  /* Crisp 1px border frame around the image */
  SDL_Color brd = alpha(textc, 65);
  rect(x, y, w, 1, brd);
  rect(x, y + h - 1, w, 1, brd);
  rect(x, y, 1, h, brd);
  rect(x + w - 1, y, 1, h, brd);

  if (has_video) {
    int bw = w >= 160 ? 78 : 54;
    int bh = w >= 160 ? 20 : 16;
    int bx = x + 6;
    int by = y + h - bh - 5;
    rounded(bx, by, bw, bh, 6, (SDL_Color){10, 14, 20, 225});
    rounded_outline(bx, by, bw, bh, 6, alpha(accent, 190));
    centered(w >= 160 ? "▶ VÍDEO" : "▶ VID", bx, by + (w >= 160 ? 3 : 2), bw, w >= 160 ? 10 : 9, accent);
  }
}

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
  news_clear_textures();
  FILE *f = fopen(".news-cache.tsv", "r");
  if (!f) return;
  char line[3200];
  while (news_count < NEWS_MAX_ITEMS && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    char *parts[9] = {0}, *p = line;
    int cols = 0;
    while (cols < 9) {
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
    if (cols >= 8 && news_valid_thumb_path(parts[7]))
      snprintf(a->image_path, sizeof(a->image_path), "%.95s", parts[7]);
    if (cols >= 9 && news_valid_http_url(parts[8]))
      snprintf(a->video_url, sizeof(a->video_url), "%.511s", parts[8]);
  }
  fclose(f);
}

static void news_play_video(const NewsArticle *a) {
  if (!a || !news_valid_http_url(a->video_url)) {
    notify(tr("Esta notícia não possui vídeo direto"));
    return;
  }
  RadioStation st = {0};
  snprintf(st.name, sizeof(st.name), "%.127s", a->title[0] ? a->title : "Notícias");
  snprintf(st.url, sizeof(st.url), "%.1023s", a->video_url);
  snprintf(st.tags, sizeof(st.tags), "%.127s", a->source[0] ? a->source : "Notícias Brasil");
  st.is_news_video = true;
  radio_cancel_retries();
  notify(tr("Abrindo vídeo da notícia..."));
  pthread_mutex_lock(&radio_play_mutex);
  if (radio_play_busy || radio_play_finished) {
    radio_play_next = st;
    radio_play_queued = true;
    pthread_mutex_unlock(&radio_play_mutex);
  } else {
    pthread_mutex_unlock(&radio_play_mutex);
    radio_start_async(st);
  }
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
    if (k == SDLK_SPACE && n > 0) {
      if (news_selected >= n) news_selected = n - 1;
      news_play_video(&news_articles[vis[news_selected]]);
      return;
    }
    if (k == SDLK_UP && news_detail_scroll > 0) {
      news_detail_scroll--;
    } else if (k == SDLK_DOWN && news_detail_scroll < 14) {
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
  } else if (k == SDLK_TAB && n > 0) {
    if (news_selected >= n) news_selected = n - 1;
    if (news_articles[vis[news_selected]].video_url[0]) {
      news_play_video(&news_articles[vis[news_selected]]);
    }
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
  if (cw > 140) cw = 140;
  rounded_gradient(30, 52, cw, 22, 10, alpha(accent, 58), alpha(accent, 26));
  rounded_outline(30, 52, cw, 22, 10, alpha(accent, 130));
  centered(a->cat_label, 30, 56, cw, 11, accent);

  bool has_video = news_valid_http_url(a->video_url);
  int meta_x = 38 + cw;
  if (has_video) {
    int vw = 122;
    rounded_gradient(meta_x, 52, vw, 22, 10, accent, mix(accent, bg, 0.25));
    centered("▶ X: Assistir vídeo", meta_x, 56, vw, 10, bg);
    meta_x += vw + 8;
  }

  char meta[120];
  snprintf(meta, sizeof(meta), "%.42s%s%.24s",
           a->source[0] ? a->source : "Notícias Brasil",
           a->date[0] ? "  •  " : "",
           a->date);
  int meta_w = 540 - meta_x;
  if (meta_w > 40) label(meta, meta_x, 56, 12, muted, meta_w);

  char pager[32];
  snprintf(pager, sizeof(pager), "%d / %d", cur_idx + 1, total_n);
  label(pager, 546, 56, 11, dim, 64);

  NewsTexSlot *thumb = news_get_thumb(a->image_path);
  int div_y;
  if (thumb) {
    /* Side-by-side hero photo (216x124) + wrapped headline */
    news_draw_thumb(thumb, 30, 84, 216, 124, has_video);
    int title_rows = wrapped(a->title, 258, 84, 352, 17, 22, 5, textc);
    int text_end = 90 + (title_rows > 0 ? title_rows : 2) * 22;
    div_y = text_end > 214 ? text_end : 214;
  } else {
    int title_rows = wrapped(a->title, 30, 84, 580, 18, 23, 3, textc);
    if (title_rows < 1) title_rows = 2;
    div_y = 90 + title_rows * 23;
  }
  rect(30, div_y, 580, 1, hairline());

  /* Body text (prefers full body if richer than summary) */
  const char *full_txt = (a->body[0] && strlen(a->body) > strlen(a->summary))
                             ? a->body
                             : (a->summary[0] ? a->summary : tr("Sem resumo disponível para esta notícia."));
  int body_y = div_y + 10;
  int max_vis = (428 - body_y) / 21;
  if (max_vis < 3) max_vis = 3;
  news_draw_wrapped_scroll(full_txt, 30, body_y, 580, 14, 21, max_vis, news_detail_scroll, muted);

  /* Bottom reader hint strip */
  rect(30, 432, 580, 1, hairline());
  centered(has_video
               ? "A: Voltar   •   X: Assistir vídeo   •   Cima/Baixo: Rolar   •   L1/R1: Próxima"
               : "A: Voltar   •   Cima/Baixo: Rolar   •   L1/R1: Próxima notícia   •   Y: Atualizar",
           30, 441, 580, 11, has_video ? accent : dim);
  footer_hints(NULL, 0);
}

static void draw_news(void) {
  news_tex_frame_budget = 1;

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
    centered(busy ? tr("Carregando notícias e imagens do Brasil...")
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
      bool has_video = news_valid_http_url(a->video_url);

      card(16, y, 608, 71, 13, focus, panel);

      NewsTexSlot *thumb = news_get_thumb(a->image_path);
      int tx = 28, tw = 584;
      if (thumb) {
        news_draw_thumb(thumb, 24, y + 7, 94, 57, has_video);
        tx = 128;
        tw = 484;
      }

      /* Category badge + optional video badge (if no thumb) + source + date */
      int cw = (int)measure(a->cat_label, 10) + 18;
      if (cw < 62) cw = 62;
      if (cw > 112) cw = 112;
      rounded(tx, y + 6, cw, 18, 8, focus ? accent : alpha(accent, 38));
      centered(a->cat_label, tx, y + 9, cw, 10, focus ? bg : accent);

      int sx = tx + cw + 8;
      if (has_video && !thumb) {
        rounded(sx, y + 6, 56, 18, 8, alpha(accent, 52));
        centered("▶ VÍDEO", sx, y + 9, 56, 9, accent);
        sx += 62;
      }

      int src_w = 486 - sx;
      if (src_w > 30) label(a->source[0] ? a->source : "Brasil", sx, y + 8, 11, muted, src_w);
      if (a->date[0]) label(a->date, 494, y + 8, 10, dim, 118);

      /* Headline & preview */
      label(a->title, tx, y + 28, 15, textc, tw);
      label(a->summary[0] ? a->summary : "B para ler a matéria completa",
            tx, y + 49, 11, muted, tw);
    }
  }

  if (busy)
    label("Atualizando notícias e fotos...", 18, 463, 11, accent, 380);
  else if (news_stale && n)
    label("Notícias em cache • pressione Y para atualizar", 18, 463, 11, accent, 460);

  footer_hints(NULL, 0);
}
