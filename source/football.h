/* Golazo runs off-thread; the UI reads only bounded, locally converted rows. */
typedef struct { char league[100], home[100], score[32], away[100], status[64]; } FootballMatch;
static FootballMatch football_matches[150];
static int football_count, football_selected, football_offset;
static pthread_mutex_t football_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool football_busy, football_done, football_ok, football_stale;
static void football_read(void) {
  football_count = football_selected = football_offset = 0;
  FILE *f = fopen(".football-cache.tsv", "r");
  if (!f) return;
  char line[1024];
  while (football_count < 150 && fgets(line, sizeof(line), f)) {
    char *parts[5], *p = line; int valid = 1;
    for (int i = 0; i < 5; i++) { parts[i] = p; if (i < 4) { p = strchr(p, '\t'); if (!p) { valid = 0; break; } *p++ = 0; } }
    if (!valid) continue;
    parts[4][strcspn(parts[4], "\r\n")] = 0;
    FootballMatch *m = &football_matches[football_count++];
    snprintf(m->league, sizeof(m->league), "%.99s", parts[0]);
    snprintf(m->home, sizeof(m->home), "%.99s", parts[1]);
    snprintf(m->score, sizeof(m->score), "%.31s", parts[2]);
    snprintf(m->away, sizeof(m->away), "%.99s", parts[3]);
    snprintf(m->status, sizeof(m->status), "%.63s", parts[4]);
  }
  fclose(f);
}
static void *football_worker(void *arg) {
  (void)arg; char *args[] = {"python3", "./football_fetch.py", NULL}; pid_t child, result; int status = 0; bool ok = false;
  if (!posix_spawnp(&child, "python3", NULL, NULL, args, environ)) {
    do { result = waitpid(child, &status, 0); } while (result < 0 && errno == EINTR);
    ok = result == child && WIFEXITED(status) && WEXITSTATUS(status) == 0;
  }
  pthread_mutex_lock(&football_mutex); football_busy = false; football_done = true; football_ok = ok; pthread_mutex_unlock(&football_mutex);
  return NULL;
}
static void football_refresh(void) {
  pthread_mutex_lock(&football_mutex);
  if (football_busy) { pthread_mutex_unlock(&football_mutex); return; }
  football_busy = true; football_done = false; pthread_mutex_unlock(&football_mutex);
  pthread_t t;
  if (!pthread_create(&t, NULL, football_worker, NULL)) pthread_detach(t);
  else { pthread_mutex_lock(&football_mutex); football_busy = false; football_done = true; football_ok = false; pthread_mutex_unlock(&football_mutex); }
}
static void football_open(void) { football_read(); football_stale = true; mode = 9; football_refresh(); }
static void football_key(SDL_Keycode k) {
  if (k == SDLK_BACKSPACE) mode = 3;
  else if (k == SDLK_m) football_refresh();
  else if (k == SDLK_UP && football_count) football_selected = (football_selected + football_count - 1) % football_count;
  else if (k == SDLK_DOWN && football_count) football_selected = (football_selected + 1) % football_count;
}
static void draw_football(void) {
  pthread_mutex_lock(&football_mutex); bool busy = football_busy, done = football_done, ok = football_ok; football_done = false; pthread_mutex_unlock(&football_mutex);
  if (done) { if (ok) { football_read(); football_stale = false; } else { football_stale = true; notify(tr("Não foi possível atualizar placares")); } }
  color(bg); SDL_RenderClear(renderer); draw_header(tr("FUTEBOL"));
  label(tr("Jogos ao vivo"), 24, 52, 24, textc, 420);
  if (!football_count) centered(busy ? tr("Carregando placares...") : football_stale ? tr("Sem dados atualizados") : tr("Nenhum jogo ao vivo"), 24, 190, 592, 18, muted);
  if (football_selected < football_offset) football_offset = football_selected;
  if (football_selected >= football_offset + 6) football_offset = football_selected - 5;
  for (int row = 0; row < 6 && football_offset + row < football_count; row++) {
    int i = football_offset + row, y = 86 + row * 52; FootballMatch *m = &football_matches[i];
    rounded(24, y, 592, 47, 7, i == football_selected ? elevated : panel);
    label(m->league, 35, y + 4, 10, accent, 420);
    label(m->home, 35, y + 21, 14, textc, 190);
    centered(m->score, 225, y + 20, 85, 14, textc);
    label(m->away, 322, y + 21, 14, textc, 170);
    label(m->status, 508, y + 21, 11, muted, 95);
  }
  if (busy) label(tr("Carregando placares..."), 24, 413, 12, accent, 400);
  else if (football_stale && football_count) label(tr("Dados salvos; podem estar desatualizados"), 24, 413, 12, accent, 500);
  const FooterHint hints[] = {{"DIR", "Navegar"}, {"Y", "Atualizar"}, {"A", "Voltar"}}; footer_hints(hints, 3);
}
