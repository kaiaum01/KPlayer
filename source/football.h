/* Placar da Bola — SofaScore-style live scoreboard and match center for R36S.
 * Network fetches run off-thread via football_fetch.py; UI renders bounded TSV rows. */
typedef struct {
  char league[80], home[72], score[28], away[72], status[48], venue[72];
  char event_id[28], league_code[40], state[16], region[8], preview[160];
} FootballMatch;

typedef struct { char label[48], home[24], away[24]; } FootballStat;
typedef struct { char minute[16], kind[8], team[44], desc[128]; } FootballEvent;
typedef struct { char jersey[10], name[52], pos[14]; } FootballPlayer;

static FootballMatch football_matches[150];
static int football_count, football_selected, football_offset, football_filter;
static bool football_detail_open;
static int football_detail_tab, football_detail_scroll;
static char fb_venue[80], fb_attendance[24], fb_referee[64];
static char fb_home_form[24], fb_away_form[24], fb_home_tact[24], fb_away_tact[24];
static FootballStat fb_stats[16];
static int fb_stat_count;
static FootballEvent fb_events[40];
static int fb_event_count;
static FootballPlayer fb_home_xi[11], fb_away_xi[11];
static int fb_home_xi_count, fb_away_xi_count;

static pthread_mutex_t football_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool football_busy, football_done, football_ok, football_stale;
static int football_job; /* 0 = list, 1 = detail */
static char football_req_league[40], football_req_id[28];

static int football_visible_indices(int *out, int cap) {
  int n = 0;
  for (int i = 0; i < football_count && n < cap; i++) {
    FootballMatch *m = &football_matches[i];
    if (football_filter == 1 && strcmp(m->state, "in") != 0) continue;
    if (football_filter == 2 && strcmp(m->region, "BR") != 0) continue;
    if (football_filter == 3 && strcmp(m->region, "EU") != 0) continue;
    out[n++] = i;
  }
  return n;
}

static void football_read(void) {
  football_count = football_selected = football_offset = 0;
  FILE *f = fopen(".football-cache.tsv", "r");
  if (!f) return;
  char line[1024];
  while (football_count < 150 && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    char *parts[10] = {0}, *p = line;
    int cols = 0;
    while (cols < 10) {
      parts[cols++] = p;
      char *tab = strchr(p, '\t');
      if (!tab) break;
      *tab = 0;
      p = tab + 1;
    }
    if (cols < 5) continue;
    FootballMatch *m = &football_matches[football_count++];
    memset(m, 0, sizeof(*m));
    snprintf(m->league, sizeof(m->league), "%.79s", parts[0]);
    snprintf(m->home, sizeof(m->home), "%.71s", parts[1]);
    snprintf(m->score, sizeof(m->score), "%.27s", parts[2]);
    snprintf(m->away, sizeof(m->away), "%.71s", parts[3]);
    snprintf(m->status, sizeof(m->status), "%.47s", parts[4]);
    if (cols >= 6) snprintf(m->venue, sizeof(m->venue), "%.71s", parts[5]);
    if (cols >= 7) snprintf(m->event_id, sizeof(m->event_id), "%.27s", parts[6]);
    if (cols >= 8) snprintf(m->league_code, sizeof(m->league_code), "%.39s", parts[7]);
    if (cols >= 9 && parts[8][0]) {
      char *bar = strchr(parts[8], '|');
      if (bar) {
        *bar = 0;
        snprintf(m->state, sizeof(m->state), "%.15s", parts[8]);
        snprintf(m->region, sizeof(m->region), "%.7s", bar + 1);
      } else {
        snprintf(m->state, sizeof(m->state), "%.15s", parts[8]);
      }
    }
    if (cols >= 10) snprintf(m->preview, sizeof(m->preview), "%.159s", parts[9]);
  }
  fclose(f);
}

static void football_read_detail(void) {
  fb_venue[0] = fb_attendance[0] = fb_referee[0] = 0;
  fb_home_form[0] = fb_away_form[0] = fb_home_tact[0] = fb_away_tact[0] = 0;
  fb_stat_count = fb_event_count = fb_home_xi_count = fb_away_xi_count = 0;
  football_detail_scroll = 0;
  FILE *f = fopen(".football-detail.tsv", "r");
  if (!f) return;
  char line[512];
  while (fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    char *parts[8] = {0}, *p = line;
    int cols = 0;
    while (cols < 8) {
      parts[cols++] = p;
      char *tab = strchr(p, '\t');
      if (!tab) break;
      *tab = 0;
      p = tab + 1;
    }
    if (cols < 2) continue;
    if (!strcmp(parts[0], "INFO") && cols >= 8) {
      snprintf(fb_venue, sizeof(fb_venue), "%.79s", parts[1]);
      snprintf(fb_attendance, sizeof(fb_attendance), "%.23s", parts[2]);
      snprintf(fb_referee, sizeof(fb_referee), "%.63s", parts[3]);
      snprintf(fb_home_form, sizeof(fb_home_form), "%.23s", parts[4]);
      snprintf(fb_away_form, sizeof(fb_away_form), "%.23s", parts[5]);
      snprintf(fb_home_tact, sizeof(fb_home_tact), "%.23s", parts[6]);
      snprintf(fb_away_tact, sizeof(fb_away_tact), "%.23s", parts[7]);
    } else if (!strcmp(parts[0], "STAT") && cols >= 4 && fb_stat_count < 16) {
      FootballStat *s = &fb_stats[fb_stat_count++];
      snprintf(s->label, sizeof(s->label), "%.47s", parts[1]);
      snprintf(s->home, sizeof(s->home), "%.23s", parts[2]);
      snprintf(s->away, sizeof(s->away), "%.23s", parts[3]);
    } else if (!strcmp(parts[0], "EVENT") && cols >= 5 && fb_event_count < 40) {
      FootballEvent *e = &fb_events[fb_event_count++];
      snprintf(e->minute, sizeof(e->minute), "%.15s", parts[1]);
      snprintf(e->kind, sizeof(e->kind), "%.7s", parts[2]);
      snprintf(e->team, sizeof(e->team), "%.43s", parts[3]);
      snprintf(e->desc, sizeof(e->desc), "%.127s", parts[4]);
    } else if (!strcmp(parts[0], "LINEUP") && cols >= 5) {
      if (!strcmp(parts[1], "H") && fb_home_xi_count < 11) {
        FootballPlayer *pl = &fb_home_xi[fb_home_xi_count++];
        snprintf(pl->jersey, sizeof(pl->jersey), "%.9s", parts[2]);
        snprintf(pl->name, sizeof(pl->name), "%.51s", parts[3]);
        snprintf(pl->pos, sizeof(pl->pos), "%.13s", parts[4]);
      } else if (!strcmp(parts[1], "A") && fb_away_xi_count < 11) {
        FootballPlayer *pl = &fb_away_xi[fb_away_xi_count++];
        snprintf(pl->jersey, sizeof(pl->jersey), "%.9s", parts[2]);
        snprintf(pl->name, sizeof(pl->name), "%.51s", parts[3]);
        snprintf(pl->pos, sizeof(pl->pos), "%.13s", parts[4]);
      }
    }
  }
  fclose(f);
}

static void *football_worker(void *arg) {
  (void)arg;
  int job;
  char lg[40], eid[28];
  pthread_mutex_lock(&football_mutex);
  job = football_job;
  snprintf(lg, sizeof(lg), "%s", football_req_league);
  snprintf(eid, sizeof(eid), "%s", football_req_id);
  pthread_mutex_unlock(&football_mutex);

  char *args_list[] = {"python3", "./football_fetch.py", NULL};
  char *args_detail[] = {"python3", "./football_fetch.py", "detail", lg, eid, NULL};
  pid_t child, result;
  int status = 0;
  bool ok = false;
  if (!posix_spawnp(&child, "python3", NULL, NULL, job ? args_detail : args_list, environ)) {
    do { result = waitpid(child, &status, 0); } while (result < 0 && errno == EINTR);
    ok = result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0;
  }
  pthread_mutex_lock(&football_mutex);
  football_busy = false;
  football_done = true;
  football_ok = ok;
  pthread_mutex_unlock(&football_mutex);
  return NULL;
}

static void football_start_job(int job, const char *lg, const char *eid) {
  pthread_mutex_lock(&football_mutex);
  if (football_busy) { pthread_mutex_unlock(&football_mutex); return; }
  football_job = job;
  snprintf(football_req_league, sizeof(football_req_league), "%s", lg ? lg : "");
  snprintf(football_req_id, sizeof(football_req_id), "%s", eid ? eid : "");
  football_busy = true;
  football_done = false;
  pthread_mutex_unlock(&football_mutex);
  pthread_t t;
  if (!pthread_create(&t, NULL, football_worker, NULL)) pthread_detach(t);
  else {
    pthread_mutex_lock(&football_mutex);
    football_busy = false; football_done = true; football_ok = false;
    pthread_mutex_unlock(&football_mutex);
  }
}

static void football_refresh(void) { football_start_job(0, "", ""); }

static void football_open(void) {
  football_detail_open = false;
  football_filter = 0;
  if (!football_count) {
    football_read();
    football_stale = true;
    football_refresh();
  }
  mode = 9;
}

static void football_open_selected_detail(void) {
  int vis[150];
  int n = football_visible_indices(vis, 150);
  if (!n) return;
  if (football_selected >= n) football_selected = n - 1;
  FootballMatch *m = &football_matches[vis[football_selected]];
  football_detail_open = true;
  football_detail_tab = 0;
  football_detail_scroll = 0;
  fb_stat_count = fb_event_count = fb_home_xi_count = fb_away_xi_count = 0;
  snprintf(fb_venue, sizeof(fb_venue), "%s", m->venue);
  if (m->league_code[0] && m->event_id[0]) {
    football_start_job(1, m->league_code, m->event_id);
  }
}

static void football_key(SDL_Keycode k) {
  if (football_detail_open) {
    if (k == SDLK_BACKSPACE) {
      football_detail_open = false;
      return;
    }
    if (k == SDLK_LEFT) { football_detail_tab = (football_detail_tab + 2) % 3; football_detail_scroll = 0; }
    else if (k == SDLK_RIGHT || k == SDLK_SPACE) { football_detail_tab = (football_detail_tab + 1) % 3; football_detail_scroll = 0; }
    else if (k == SDLK_UP && football_detail_scroll > 0) football_detail_scroll--;
    else if (k == SDLK_DOWN) {
      int max_items = football_detail_tab == 0 ? fb_stat_count
                    : football_detail_tab == 1 ? fb_event_count
                    : (fb_home_xi_count > fb_away_xi_count ? fb_home_xi_count : fb_away_xi_count);
      if (football_detail_scroll + 5 < max_items) football_detail_scroll++;
    } else if (k == SDLK_m) {
      int vis[150], n = football_visible_indices(vis, 150);
      if (n && football_selected < n) {
        FootballMatch *m = &football_matches[vis[football_selected]];
        if (m->league_code[0] && m->event_id[0]) football_start_job(1, m->league_code, m->event_id);
      }
    }
    return;
  }

  int vis[150];
  int n = football_visible_indices(vis, 150);
  if (k == SDLK_BACKSPACE) mode = 3;
  else if (k == SDLK_m) football_refresh();
  else if (k == SDLK_LEFT) { football_filter = (football_filter + 3) % 4; football_selected = football_offset = 0; }
  else if (k == SDLK_RIGHT || k == SDLK_SPACE) { football_filter = (football_filter + 1) % 4; football_selected = football_offset = 0; }
  else if (k == SDLK_UP && n) football_selected = (football_selected + n - 1) % n;
  else if (k == SDLK_DOWN && n) football_selected = (football_selected + 1) % n;
  else if (k == SDLK_RETURN && n) football_open_selected_detail();
}

static void draw_football_detail(FootballMatch *m, bool busy) {
  panel_card(16, 40, 608, 106, 14);
  label(m->league, 30, 48, 12, accent, 370);
  bool live = !strcmp(m->state, "in");
  pill(496, 46, 114, 22, live);
  centered(m->status[0] ? m->status : tr("AO VIVO"), 498, 51, 110, 11, live ? bg : muted);

  label(m->home, 30, 76, 18, textc, 224);
  rounded(262, 72, 116, 36, 10, live ? accent : elevated);
  centered(m->score, 264, 79, 112, 21, live ? bg : textc);
  label(m->away, 388, 76, 18, textc, 224);

  char sub[192];
  snprintf(sub, sizeof(sub), "%.80s%s%.32s%s%.32s",
           fb_venue[0] ? fb_venue : (m->venue[0] ? m->venue : "Placar da Bola"),
           fb_home_tact[0] ? "  •  " : "", fb_home_tact,
           fb_away_tact[0] ? " vs " : "", fb_away_tact);
  label(sub, 30, 120, 12, muted, 580);

  const char *tabs[] = {tr("Estatísticas"), tr("Eventos"), tr("Escalações")};
  for (int i = 0; i < 3; i++) {
    int x = 16 + i * 206;
    pill(x, 154, 196, 28, i == football_detail_tab);
    centered(tabs[i], x + 4, 160, 188, 14, i == football_detail_tab ? bg : muted);
  }

  panel_card(16, 190, 608, 280, 14);
  if (busy) {
    centered(tr("Carregando estatísticas..."), 24, 314, 592, 18, accent);
  } else if (football_detail_tab == 0) {
    if (!fb_stat_count) {
      centered(tr("Estatísticas disponíveis quando a partida iniciar"), 30, 314, 580, 16, muted);
    } else {
      for (int row = 0; row < 7 && football_detail_scroll + row < fb_stat_count; row++) {
        FootballStat *s = &fb_stats[football_detail_scroll + row];
        int y = 202 + row * 37;
        label(s->home, 32, y, 14, accent, 84);
        centered(s->label, 120, y, 400, 14, textc);
        label(s->away, 540, y, 14, muted, 68);
        double hv = atof(s->home), av = atof(s->away), tot = hv + av;
        double ratio = tot > 0.01 ? hv / tot : 0.5;
        int bar_w = 572, left_w = (int)(bar_w * ratio);
        rounded(34, y + 22, bar_w, 7, 3, track_color());
        if (left_w > 3) rounded(34, y + 22, left_w, 7, 3, accent);
      }
    }
  } else if (football_detail_tab == 1) {
    if (!fb_event_count) {
      centered(tr("Nenhum evento registrado ainda"), 30, 314, 580, 16, muted);
    } else {
      for (int row = 0; row < 7 && football_detail_scroll + row < fb_event_count; row++) {
        FootballEvent *e = &fb_events[football_detail_scroll + row];
        int y = 200 + row * 37;
        rounded(28, y + 3, 50, 24, 8, !strcmp(e->kind, "GOL") ? accent : elevated);
        centered(e->minute, 30, y + 8, 46, 11, !strcmp(e->kind, "GOL") ? bg : textc);
        rounded(84, y + 3, 44, 24, 8, elevated);
        centered(e->kind, 86, y + 8, 40, 11, !strcmp(e->kind, "GOL") ? accent : muted);
        label(e->desc, 136, y + 1, 14, textc, 476);
        label(e->team, 136, y + 19, 11, muted, 476);
      }
    }
  } else {
    int max_xi = fb_home_xi_count > fb_away_xi_count ? fb_home_xi_count : fb_away_xi_count;
    if (!max_xi) {
      centered(tr("Escalações ainda não divulgadas"), 30, 314, 580, 16, muted);
    } else {
      for (int row = 0; row < 7 && football_detail_scroll + row < max_xi; row++) {
        int idx = football_detail_scroll + row, y = 202 + row * 37;
        if (idx < fb_home_xi_count) {
          char line[96];
          snprintf(line, sizeof(line), "#%.7s %.47s (%.15s)", fb_home_xi[idx].jersey, fb_home_xi[idx].name, fb_home_xi[idx].pos);
          label(line, 30, y + 6, 14, textc, 284);
        }
        if (idx < fb_away_xi_count) {
          char line[96];
          snprintf(line, sizeof(line), "#%.7s %.47s (%.15s)", fb_away_xi[idx].jersey, fb_away_xi[idx].name, fb_away_xi[idx].pos);
          label(line, 326, y + 6, 14, muted, 284);
        }
      }
    }
  }
  footer_hints(NULL, 0);
}

static void draw_football(void) {
  pthread_mutex_lock(&football_mutex);
  bool busy = football_busy, done = football_done, ok = football_ok;
  int last_job = football_job;
  football_done = false;
  pthread_mutex_unlock(&football_mutex);
  if (done) {
    if (ok) {
      if (last_job == 1) football_read_detail();
      else { football_read(); football_stale = false; }
    } else {
      if (last_job == 0) football_stale = true;
      notify(tr("Não foi possível atualizar placares"));
    }
  }

  backdrop();
  draw_header(tr("PLACAR DA BOLA"));

  int vis[150];
  int n = football_visible_indices(vis, 150);
  if (football_detail_open && n > 0) {
    if (football_selected >= n) football_selected = n - 1;
    draw_football_detail(&football_matches[vis[football_selected]], busy);
    return;
  }

  label("Placar da Bola", 18, 40, 23, textc, 250);
  const char *fnames[] = {tr("Todos"), tr("Ao vivo"), "Brasil", "Europa"};
  for (int i = 0; i < 4; i++) {
    int x = 280 + i * 86;
    pill(x, 42, 80, 25, i == football_filter);
    centered(fnames[i], x + 2, 48, 76, 12, i == football_filter ? bg : muted);
  }

  if (!n) {
    centered(busy ? tr("Carregando placares...") : football_stale ? tr("Sem dados atualizados") : tr("Nenhum jogo ao vivo"),
             24, 220, 592, 20, muted);
  } else {
    if (football_selected >= n) football_selected = n - 1;
    if (football_selected < football_offset) football_offset = football_selected;
    if (football_selected >= football_offset + 5) football_offset = football_selected - 4;
    for (int row = 0; row < 5 && football_offset + row < n; row++) {
      int actual = football_offset + row;
      int y = 76 + row * 77;
      FootballMatch *m = &football_matches[vis[actual]];
      bool focus = actual == football_selected;
      bool live = !strcmp(m->state, "in");
      card(16, y, 608, 71, 13, focus, panel);
      label(m->league, 30, y + 6, 12, accent, 270);
      if (m->venue[0]) label(m->venue, 306, y + 6, 11, dim, 182);
      rounded(498, y + 5, 114, 20, 9, live ? accent : elevated);
      centered(m->status, 500, y + 9, 110, 11, live ? bg : muted);

      label(m->home, 30, y + 27, 16, textc, 212);
      rounded(248, y + 23, 102, 26, 9, live ? mix(elevated, accent, 0.25f) : elevated);
      centered(m->score, 250, y + 27, 98, 17, live ? accent : textc);
      label(m->away, 358, y + 27, 16, textc, 254);

      label(m->preview[0] ? m->preview : tr("B para estatísticas, eventos e escalações"),
            30, y + 52, 11, muted, 580);
    }
  }

  if (busy) label(tr("Atualizando placares..."), 18, 463, 11, accent, 380);
  else if (football_stale && n) label(tr("Dados salvos; pressione Y para atualizar"), 18, 463, 11, accent, 460);

  footer_hints(NULL, 0);
}
