/* Native R36S Auto-Updater bridge with real-time loading progress bar.
 * Runs ./updater.py off-thread via posix_spawn (never shell) to check GitHub
 * updates/latest.json at boot and on-demand inside Options -> Verificar atualizacoes,
 * polls iptv/.cache/update-progress.tsv for live download/install progress (0-100%),
 * supports same-version reinstall with an explicit warning (`--force`),
 * and applies verified updates atomically while preserving all user data.
 * Exit code 42 signals KPlayer.sh to restart immediately with the new version. */

static pthread_mutex_t kp_upd_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool kp_upd_checking = false;
static bool kp_upd_applying = false;
static bool kp_upd_available = false;
static bool kp_upd_checked_once = false;
static bool kp_upd_reinstall_armed = false;
static int kp_upd_exit_code = 0;
static int kp_upd_progress = 0;
static char kp_upd_stage[96] = "";
static char kp_upd_detail[128] = "";
static char kp_upd_current[32] = KPLAYER_VERSION;
static char kp_upd_latest[32] = KPLAYER_VERSION;
static char kp_upd_next[32] = "2.1.2";
static char kp_upd_source[32] = "local";
static char kp_upd_repo[128] = "";
static char kp_upd_message[192] = "";
static char kp_upd_notes[4][160];
static int kp_upd_note_count = 0;
static bool kp_upd_restart_requested = false;
static bool kp_upd_toast_pending = false;
static char kp_upd_toast_text[192] = "";
static uint32_t kp_upd_progress_next_poll = 0;

static int kp_upd_run_python(char *const argv[]) {
  extern char **environ;
  pid_t pid = 0;
  if (posix_spawnp(&pid, "python3", NULL, NULL, argv, environ) != 0)
    return -1;
  int status = 0;
  while (waitpid(pid, &status, 0) < 0) {
    if (errno != EINTR) return -1;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  return -1;
}

static void kp_upd_poll_progress_file(void) {
  FILE *f = fopen("iptv/.cache/update-progress.tsv", "r");
  if (!f) return;
  char line[320];
  if (fgets(line, sizeof(line), f)) {
    size_t len = strlen(line);
    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r'))
      line[--len] = 0;
    if (!strncmp(line, "PROG\t", 5)) {
      char *p = line + 5;
      char *fields[4] = {0};
      int nf = 0;
      while (nf < 4) {
        fields[nf++] = p;
        char *tab = strchr(p, '\t');
        if (!tab) break;
        *tab = 0;
        p = tab + 1;
      }
      int pct = nf >= 1 ? atoi(fields[0]) : 0;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      pthread_mutex_lock(&kp_upd_mutex);
      kp_upd_progress = pct;
      if (nf >= 2 && fields[1][0]) snprintf(kp_upd_stage, sizeof(kp_upd_stage), "%.95s", fields[1]);
      if (nf >= 3) snprintf(kp_upd_detail, sizeof(kp_upd_detail), "%.127s", fields[2]);
      pthread_mutex_unlock(&kp_upd_mutex);
    }
  }
  fclose(f);
}

static void kp_upd_parse_tsv(const char *path, bool notify_user) {
  FILE *f = fopen(path, "r");
  if (!f) {
    pthread_mutex_lock(&kp_upd_mutex);
    kp_upd_checking = false;
    kp_upd_checked_once = true;
    kp_upd_reinstall_armed = false;
    kp_upd_progress = 0;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Falha na verificação");
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Manifesto indisponível");
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             "Não foi possível ler o manifesto de atualização.");
    if (notify_user) {
      snprintf(kp_upd_toast_text, sizeof(kp_upd_toast_text), "%s", kp_upd_message);
      kp_upd_toast_pending = true;
    }
    pthread_mutex_unlock(&kp_upd_mutex);
    return;
  }

  char line[512];
  char cur[32] = KPLAYER_VERSION, lat[32] = KPLAYER_VERSION, nxt[32] = "2.1.2";
  char src[32] = "local", repo[128] = "", err[160] = "";
  bool avail = false;
  char notes[4][160];
  int ncnt = 0;

  while (fgets(line, sizeof(line), f)) {
    size_t len = strlen(line);
    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r'))
      line[--len] = 0;
    if (!strncmp(line, "META\t", 5)) {
      char *p = line + 5;
      char *fields[8] = {0};
      int nf = 0;
      while (nf < 8) {
        fields[nf++] = p;
        char *tab = strchr(p, '\t');
        if (!tab) break;
        *tab = 0;
        p = tab + 1;
      }
      if (nf >= 1 && fields[0][0]) snprintf(cur, sizeof(cur), "%s", fields[0]);
      if (nf >= 2 && fields[1][0]) snprintf(lat, sizeof(lat), "%s", fields[1]);
      if (nf >= 3 && fields[2][0]) snprintf(nxt, sizeof(nxt), "%s", fields[2]);
      if (nf >= 4 && fields[3][0] == '1') avail = true;
      if (nf >= 5 && fields[4][0]) snprintf(src, sizeof(src), "%s", fields[4]);
      if (nf >= 6 && fields[5][0]) snprintf(repo, sizeof(repo), "%s", fields[5]);
      if (nf >= 7 && fields[6][0]) snprintf(err, sizeof(err), "%s", fields[6]);
    } else if (!strncmp(line, "NOTE\t", 5) && ncnt < 4) {
      snprintf(notes[ncnt++], sizeof(notes[0]), "%.159s", line + 5);
    }
  }
  fclose(f);

  pthread_mutex_lock(&kp_upd_mutex);
  snprintf(kp_upd_current, sizeof(kp_upd_current), "%.31s", cur);
  snprintf(kp_upd_latest, sizeof(kp_upd_latest), "%.31s", lat);
  snprintf(kp_upd_next, sizeof(kp_upd_next), "%.31s", nxt);
  snprintf(kp_upd_source, sizeof(kp_upd_source), "%.31s", src);
  snprintf(kp_upd_repo, sizeof(kp_upd_repo), "%.127s", repo);
  kp_upd_available = avail;
  kp_upd_reinstall_armed = false;
  if (ncnt < 0) ncnt = 0;
  if (ncnt > 4) ncnt = 4;
  kp_upd_note_count = ncnt;
  for (int i = 0; i < ncnt; i++)
    snprintf(kp_upd_notes[i], sizeof(kp_upd_notes[i]), "%.159s", notes[i]);
  if (avail) {
    kp_upd_progress = 100;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Atualização v%.31s pronta", lat);
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Pressione B em Baixar e atualizar");
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             "Nova versão v%.31s pronta na pasta updates/!", lat);
  } else if (err[0]) {
    kp_upd_progress = 0;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Canal aguardando configuração");
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "%.127s", err);
    snprintf(kp_upd_message, sizeof(kp_upd_message), "%.159s", err);
  } else {
    kp_upd_progress = 100;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Mesma versão instalada (v%.31s)", cur);
    snprintf(kp_upd_detail, sizeof(kp_upd_detail),
             "AVISO: Você já está na v%.31s — ainda é possível reinstalar abaixo.", cur);
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             "KPlayer v%.31s em dia. Você pode reinstalar a mesma versão se quiser.", cur);
  }
  if (notify_user || avail) {
    snprintf(kp_upd_toast_text, sizeof(kp_upd_toast_text), "%.191s",
             avail ? "Nova atualização disponível — abra Opções (SELECT)" : kp_upd_message);
    kp_upd_toast_pending = true;
  }
  kp_upd_checking = false;
  kp_upd_checked_once = true;
  pthread_mutex_unlock(&kp_upd_mutex);
}

static void *kp_upd_check_worker(void *arg) {
  bool notify_user = arg != NULL;
  const char *out_path = "iptv/.cache/update-check.tsv";
  char *argv[] = {"python3", "./updater.py", "check-tsv", (char *)out_path, NULL};
  int rc = kp_upd_run_python(argv);
  if (rc == 0) {
    kp_upd_parse_tsv(out_path, notify_user);
  } else {
    pthread_mutex_lock(&kp_upd_mutex);
    kp_upd_checking = false;
    kp_upd_checked_once = true;
    kp_upd_reinstall_armed = false;
    kp_upd_progress = 0;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Sem conexão");
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Verifique o Wi-Fi do R36S");
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             "Sem conexão com o canal updates/ do GitHub.");
    if (notify_user) {
      snprintf(kp_upd_toast_text, sizeof(kp_upd_toast_text), "%s", kp_upd_message);
      kp_upd_toast_pending = true;
    }
    pthread_mutex_unlock(&kp_upd_mutex);
  }
  return NULL;
}

static void *kp_upd_apply_worker(void *arg) {
  bool force_reinstall = arg != NULL;
  char *argv_force[] = {"python3", "./updater.py", "apply", "--force", NULL};
  char *argv_normal[] = {"python3", "./updater.py", "apply", NULL};
  int rc = kp_upd_run_python(force_reinstall ? argv_force : argv_normal);
  kp_upd_poll_progress_file();
  pthread_mutex_lock(&kp_upd_mutex);
  kp_upd_applying = false;
  kp_upd_reinstall_armed = false;
  if (rc == 42) {
    kp_upd_progress = 100;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage),
             force_reinstall ? "Reinstalação concluída!" : "Atualização concluída!");
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Reiniciando KPlayer sem perda de dados...");
    kp_upd_exit_code = 42;
    kp_upd_restart_requested = true;
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             force_reinstall
                 ? "Mesma versão reinstalada preservando dados! Reiniciando..."
                 : "Atualizado preservando dados! Reiniciando KPlayer...");
    snprintf(kp_upd_toast_text, sizeof(kp_upd_toast_text), "%s", kp_upd_message);
    kp_upd_toast_pending = true;
  } else if (rc == 0) {
    kp_upd_progress = 100;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Sistema em dia");
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "v%.31s já é a versão mais recente", kp_upd_current);
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             "KPlayer já está na versão mais recente (v%s).", kp_upd_current);
    snprintf(kp_upd_toast_text, sizeof(kp_upd_toast_text), "%s", kp_upd_message);
    kp_upd_toast_pending = true;
  } else {
    kp_upd_progress = 0;
    snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Falha na atualização");
    snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Seus dados e histórico seguem intactos");
    snprintf(kp_upd_message, sizeof(kp_upd_message),
             "Falha ao baixar/verificar pacote. Seus dados seguem intactos.");
    snprintf(kp_upd_toast_text, sizeof(kp_upd_toast_text), "%s", kp_upd_message);
    kp_upd_toast_pending = true;
  }
  pthread_mutex_unlock(&kp_upd_mutex);
  return NULL;
}

static void updater_start_check(bool notify_user) {
  pthread_mutex_lock(&kp_upd_mutex);
  if (kp_upd_checking || kp_upd_applying) {
    pthread_mutex_unlock(&kp_upd_mutex);
    return;
  }
  kp_upd_checking = true;
  kp_upd_reinstall_armed = false;
  kp_upd_progress = 18;
  snprintf(kp_upd_stage, sizeof(kp_upd_stage), "Verificando atualizações...");
  snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Consultando pasta updates/ no GitHub");
  snprintf(kp_upd_message, sizeof(kp_upd_message),
           "Verificando pasta updates/ no GitHub...");
  pthread_mutex_unlock(&kp_upd_mutex);
  pthread_t t;
  if (pthread_create(&t, NULL, kp_upd_check_worker,
                     notify_user ? (void *)1 : NULL) == 0) {
    pthread_detach(t);
  } else {
    pthread_mutex_lock(&kp_upd_mutex);
    kp_upd_checking = false;
    kp_upd_progress = 0;
    pthread_mutex_unlock(&kp_upd_mutex);
  }
}

static void updater_start_apply(bool force_reinstall) {
  pthread_mutex_lock(&kp_upd_mutex);
  if (kp_upd_applying || kp_upd_checking) {
    pthread_mutex_unlock(&kp_upd_mutex);
    return;
  }
  kp_upd_applying = true;
  kp_upd_reinstall_armed = false;
  kp_upd_progress = 4;
  snprintf(kp_upd_stage, sizeof(kp_upd_stage),
           force_reinstall ? "Reinstalando mesma versão..." : "Preparando atualização...");
  snprintf(kp_upd_detail, sizeof(kp_upd_detail), "Conectando ao canal updates/ do GitHub");
  snprintf(kp_upd_message, sizeof(kp_upd_message),
           force_reinstall
               ? "Reinstalando pacote verificado SHA-256 (mantendo dados)..."
               : "Baixando e verificando pacote SHA-256 (mantendo dados)...");
  pthread_mutex_unlock(&kp_upd_mutex);
  remove("iptv/.cache/update-progress.tsv");
  pthread_t t;
  if (pthread_create(&t, NULL, kp_upd_apply_worker,
                     force_reinstall ? (void *)1 : NULL) == 0) {
    pthread_detach(t);
  } else {
    pthread_mutex_lock(&kp_upd_mutex);
    kp_upd_applying = false;
    kp_upd_progress = 0;
    pthread_mutex_unlock(&kp_upd_mutex);
  }
}

static void updater_disarm_reinstall(void) {
  pthread_mutex_lock(&kp_upd_mutex);
  kp_upd_reinstall_armed = false;
  pthread_mutex_unlock(&kp_upd_mutex);
}

static bool updater_is_available(char *latest_out, size_t latest_cap) {
  pthread_mutex_lock(&kp_upd_mutex);
  bool avail = kp_upd_available;
  if (latest_out && latest_cap)
    snprintf(latest_out, latest_cap, "%s", kp_upd_latest);
  pthread_mutex_unlock(&kp_upd_mutex);
  return avail;
}

static void updater_poll_main_thread(void) {
  bool need_toast = false;
  bool need_restart = false;
  bool is_busy = false;
  bool is_checking = false;
  char toast_buf[192] = "";
  uint32_t now = SDL_GetTicks();

  pthread_mutex_lock(&kp_upd_mutex);
  is_busy = kp_upd_applying;
  is_checking = kp_upd_checking;
  if (is_checking && kp_upd_progress < 85 && (int32_t)(now - kp_upd_progress_next_poll) >= 0) {
    kp_upd_progress += 5;
    if (kp_upd_progress > 85) kp_upd_progress = 85;
  }
  if (kp_upd_toast_pending) {
    snprintf(toast_buf, sizeof(toast_buf), "%s", kp_upd_toast_text);
    kp_upd_toast_pending = false;
    need_toast = true;
  }
  if (kp_upd_restart_requested) {
    kp_upd_restart_requested = false;
    need_restart = true;
  }
  pthread_mutex_unlock(&kp_upd_mutex);

  if ((is_busy || is_checking) && (int32_t)(now - kp_upd_progress_next_poll) >= 0) {
    kp_upd_progress_next_poll = now + 140;
    if (is_busy) kp_upd_poll_progress_file();
  }

  if (need_toast && toast_buf[0]) notify(toast_buf);
  if (need_restart) running = 0;
}
