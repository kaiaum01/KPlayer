/* Complete File Manager for KPlayer R36S (v2.1.2 — mode 16).
 * Strictly separate from the Music & Videos library (mode 0).
 *
 * Features:
 * - Direct access to the console root `/` and all storage paths (`/roms`,
 *   `/roms2`, `/roms/ports`, KPlayer dir, etc.), listing ALL files & folders.
 * - Multi-select (`Y`), Copy, Move/Cut, Paste, Delete (with confirmation and
 *   system-root protection), New Folder, Rename, Compress to `.zip`.
 * - Open/browse & extract `.zip`, `.7z`, `.rar`, `.tar.*`, `.cbz`, `.cbr`, `.iso`
 *   powered by official 7-Zip (`7zzs` from https://github.com/ip7z/7zip) via
 *   `./file_ops.py`, including password-protected archives (password passed via
 *   stdin pipe — never exposed in argv/ps).
 * - Live async progress modal with progress bar, percentage, transfer speed
 *   (B/s, KB/s, MB/s), remaining time (ETA), item count, current file, and cancel.
 */

#define FM_MAX_ENTRIES 4096
#define FM_MAX_CLIP 256
#define FM_MAX_ARC_ENTRIES 2000
#define FM_ED_MAX_LINES 2000
#define FM_ED_MAX_BYTES (512 * 1024)
#define FM_MAX_MEDIA_ITEMS 512

typedef struct {
  char name[256];
  char path[PATH_MAX];
  bool is_dir;
  bool is_link;
  bool is_archive;
  bool is_text;
  bool is_script;
  bool is_executable;
  bool is_playlist;
  bool is_radio;
  bool selected;
  long long size;
} FmEntry;

typedef struct {
  char path[256];
  bool is_dir;
  bool encrypted;
  long long size;
} FmArcEntry;

typedef struct {
  char title[160];
  char url[1024];
  bool is_local;
  bool is_video;
} FmMediaItem;

enum {
  FM_VIEW_BROWSE = 0,
  FM_VIEW_ARCHIVE = 1,
  FM_VIEW_EDITOR = 2,
  FM_VIEW_MEDIA_LIST = 3
};

enum {
  FM_MODAL_NONE = 0,
  FM_MODAL_ACTIONS = 1,
  FM_MODAL_DELETE_CONFIRM = 2,
  FM_MODAL_KEYBOARD = 3,
  FM_MODAL_PROGRESS = 4,
  FM_MODAL_ROOTS = 5,
  FM_MODAL_EXEC = 6,
  FM_MODAL_EDITOR_MENU = 7,
  FM_MODAL_EDITOR_EXIT = 8
};

enum {
  FM_KB_MKDIR = 0,
  FM_KB_RENAME = 1,
  FM_KB_PASSWORD_OPEN = 2,
  FM_KB_PASSWORD_EXTRACT = 3,
  FM_KB_EDIT_LINE = 4,
  FM_KB_NEW_LINE = 5
};

static bool fm_return_on_exit = false;
static char fm_exec_target_path[PATH_MAX] = "";
static bool fm_exec_is_script = false;

static char fm_cwd[PATH_MAX] = "/";
static char fm_app_dir[PATH_MAX] = ".";
static FmEntry *fm_entries = NULL;
static int fm_count = 0;
static int fm_cursor = 0;
static int fm_scroll = 0;
static bool fm_show_hidden = false;
static char fm_error[192] = "";

/* Clipboard (Copy / Move) */
static char fm_clip_paths[FM_MAX_CLIP][PATH_MAX];
static int fm_clip_count = 0;
static bool fm_clip_move = false;

/* Archive viewer state */
static int fm_view = FM_VIEW_BROWSE;
static char fm_arc_file[PATH_MAX] = "";
static char fm_arc_name[256] = "";
static char fm_arc_engine[32] = "";
static char fm_arc_password[128] = "";
static bool fm_arc_encrypted = false;
static FmArcEntry *fm_arc_entries = NULL;
static int fm_arc_count = 0;
static int fm_arc_cursor = 0;
static int fm_arc_scroll = 0;

/* Native Text Editor state (v2.1.3) */
static char fm_ed_path[PATH_MAX] = "";
static char fm_ed_name[256] = "";
static char **fm_ed_lines = NULL;
static int fm_ed_count = 0;
static int fm_ed_cap = 0;
static int fm_ed_cursor = 0;
static int fm_ed_scroll = 0;
static bool fm_ed_dirty = false;
static int fm_ed_menu_cursor = 0;
static int fm_ed_exit_cursor = 0;

/* Playlist (.m3u8/.m3u) & Radio (.pls/.tsv/.xspf) viewer state (v2.1.3) */
static char fm_ml_path[PATH_MAX] = "";
static char fm_ml_name[256] = "";
static bool fm_ml_is_radio = false;
static FmMediaItem *fm_ml_items = NULL;
static int fm_ml_count = 0;
static int fm_ml_cursor = 0;
static int fm_ml_scroll = 0;

/* Script (.sh) & EmulationStation executable launcher modal state (v2.1.3) */
static char fm_exec_modal_path[PATH_MAX] = "";
static char fm_exec_modal_name[256] = "";
static bool fm_exec_modal_is_script = false;
static int fm_exec_modal_cursor = 0;

/* Modals & keyboard state */
static int fm_modal = FM_MODAL_NONE;
static int fm_action_cursor = 0;
static int fm_root_cursor = 0;
static int fm_kb_purpose = FM_KB_MKDIR;
static char fm_kb_buf[512] = "";
static char fm_kb_title[96] = "";
static char fm_kb_sub[160] = "";
static bool fm_kb_upper = false;
static bool fm_kb_symbols = false;
static bool fm_kb_mask = false;
static int fm_kb_row = 1;
static int fm_kb_col = 0;
static char fm_pending_arc_path[PATH_MAX] = "";
static char fm_pending_extract_dest[PATH_MAX] = "";
static char fm_rename_target[PATH_MAX] = "";

/* Async file_ops worker + live progress telemetry */
static pthread_mutex_t fm_job_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool fm_job_running = false;
static bool fm_job_done_pending = false;
static pid_t fm_job_pid = 0;
static int fm_job_exit_code = 0;
static char fm_job_status[24] = "";
static float fm_job_pct = 0.0f;
static long long fm_job_bytes_done = 0;
static long long fm_job_bytes_total = 0;
static long long fm_job_speed_bps = 0;
static int fm_job_eta_sec = -1;
static int fm_job_items_done = 0;
static int fm_job_items_total = 0;
static char fm_job_op[64] = "";
static char fm_job_cur_file[192] = "";
static char fm_job_message[224] = "";
static bool fm_job_clear_clip_on_ok = false;
static bool fm_job_is_extract = false;
static uint32_t fm_last_progress_poll = 0;

static const char *fm_kb_lower_rows[4] = {
    "1234567890",
    "qwertyuiop",
    "asdfghjkl-",
    "zxcvbnm._ "
};
static const char *fm_kb_upper_rows[4] = {
    "1234567890",
    "QWERTYUIOP",
    "ASDFGHJKL-",
    "ZXCVBNM._ "
};
static const char *fm_kb_sym_rows[4] = {
    "!@#$%^&*()",
    "-_=+[]{};:",
    "'\",.<>/?\\|",
    "~`0123456 "
};

typedef struct {
  const char *label;
  const char *path;
} FmQuickRoot;

static const FmQuickRoot fm_quick_roots[] = {
    {"Raiz do console (/)", "/"},
    {"Cartão SD1 (/roms)", "/roms"},
    {"Cartão SD2 (/roms2)", "/roms2"},
    {"Ports (/roms/ports)", "/roms/ports"},
    {"Ports SD2 (/roms2/ports)", "/roms2/ports"},
    {"Pasta do usuário (/home)", "/home"},
    {"Pasta do KPlayer", ""},
};
#define FM_QUICK_ROOT_COUNT ((int)(sizeof(fm_quick_roots) / sizeof(fm_quick_roots[0])))

static bool fm_has_ext(const char *name, const char *ext) {
  if (!name || !ext) return false;
  size_t nlen = strlen(name), elen = strlen(ext);
  return nlen > elen && strcasecmp(name + nlen - elen, ext) == 0;
}

static bool fm_is_archive_name(const char *name) {
  if (!name || !name[0]) return false;
  static const char *exts[] = {
      ".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz",
      ".tar.bz2", ".tbz2", ".tar.xz", ".txz", ".gz", ".bz2",
      ".xz", ".cbz", ".cbr", ".iso"
  };
  for (size_t i = 0; i < sizeof(exts) / sizeof(exts[0]); i++) {
    if (fm_has_ext(name, exts[i])) return true;
  }
  return false;
}

static bool fm_is_script_name(const char *name) {
  return name && fm_has_ext(name, ".sh");
}

static bool fm_is_playlist_name(const char *name) {
  return name && (fm_has_ext(name, ".m3u8") || fm_has_ext(name, ".m3u"));
}

static bool fm_strcasestr_local(const char *hay, const char *needle) {
  if (!hay || !needle || !needle[0]) return false;
  size_t nlen = strlen(needle);
  for (const char *p = hay; *p; p++) {
    if (strncasecmp(p, needle, nlen) == 0) return true;
  }
  return false;
}

static bool fm_is_radio_file(const char *name, const char *full_path) {
  if (!name || !name[0]) return false;
  if (fm_has_ext(name, ".pls") || fm_has_ext(name, ".xspf"))
    return true;
  if (fm_has_ext(name, ".tsv") || fm_has_ext(name, ".m3u")) {
    if (fm_strcasestr_local(name, "radio") ||
        (full_path && (fm_strcasestr_local(full_path, "/radios") ||
                       fm_strcasestr_local(full_path, "radios_usuario"))))
      return true;
  }
  return false;
}

static bool fm_is_text_name(const char *name) {
  if (!name || !name[0]) return false;
  static const char *exts[] = {
      ".txt", ".xml", ".html", ".htm", ".sh", ".cfg", ".conf", ".ini",
      ".json", ".log", ".md", ".css", ".js", ".py", ".m3u", ".m3u8",
      ".pls", ".xspf", ".tsv", ".csv", ".yaml", ".yml", ".nfo", ".lrc"
  };
  for (size_t i = 0; i < sizeof(exts) / sizeof(exts[0]); i++) {
    if (fm_has_ext(name, exts[i])) return true;
  }
  return false;
}

static bool fm_is_executable_file(const char *full_path, mode_t mode_bits) {
  if (!full_path || !S_ISREG(mode_bits)) return false;
  FILE *f = fopen(full_path, "rb");
  if (!f) return false;
  unsigned char magic[4] = {0, 0, 0, 0};
  size_t n = fread(magic, 1, 4, f);
  fclose(f);
  if (n >= 4 && magic[0] == 0x7f && magic[1] == 'E' && magic[2] == 'L' && magic[3] == 'F')
    return true;
  if (n >= 2 && magic[0] == '#' && magic[1] == '!' &&
      (mode_bits & (S_IXUSR | S_IXGRP | S_IXOTH)) != 0)
    return true;
  return false;
}

static const char *fm_file_badge(const FmEntry *e) {
  if (!e) return "ARQ";
  if (e->is_dir) return strcmp(e->name, "..") == 0 ? "VOLTAR" : "PASTA";
  if (e->is_archive) return "7Z/ZIP";
  if (e->is_script) return "SH";
  if (e->is_executable) return "EXEC";
  if (e->is_radio) return "RÁDIO";
  if (e->is_playlist) return "M3U8";
  if (supported(e->name)) return audio_file(e->name) ? "ÁUDIO" : "VÍDEO";
  if (fm_has_ext(e->name, ".xml")) return "XML";
  if (fm_has_ext(e->name, ".html") || fm_has_ext(e->name, ".htm")) return "HTML";
  if (fm_has_ext(e->name, ".txt") || fm_has_ext(e->name, ".md")) return "TXT";
  if (e->is_text) return "CFG";
  return "ARQ";
}

static bool fm_is_protected_path(const char *path) {
  if (!path || !path[0]) return true;
  static const char *prot[] = {
      "/", "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64",
      "/proc", "/root", "/run", "/sbin", "/sys", "/usr", "/var",
      "/roms", "/roms2"
  };
  char norm[PATH_MAX];
  snprintf(norm, sizeof(norm), "%s", path);
  size_t l = strlen(norm);
  while (l > 1 && norm[l - 1] == '/') norm[--l] = 0;
  for (size_t i = 0; i < sizeof(prot) / sizeof(prot[0]); i++) {
    if (strcmp(norm, prot[i]) == 0) return true;
  }
  return false;
}

static void fm_format_bytes(long long b, char *out, size_t cap) {
  if (b < 0) b = 0;
  if (b >= 1024LL * 1024 * 1024)
    snprintf(out, cap, "%.2f GB", (double)b / (1024.0 * 1024.0 * 1024.0));
  else if (b >= 1024LL * 1024)
    snprintf(out, cap, "%.1f MB", (double)b / (1024.0 * 1024.0));
  else if (b >= 1024LL)
    snprintf(out, cap, "%.1f KB", (double)b / 1024.0);
  else
    snprintf(out, cap, "%lld B", b);
}

static void fm_format_speed(long long bps, char *out, size_t cap) {
  if (bps <= 0) {
    snprintf(out, cap, "-- MB/s");
    return;
  }
  if (bps >= 1024LL * 1024 * 1024)
    snprintf(out, cap, "%.2f GB/s", (double)bps / (1024.0 * 1024.0 * 1024.0));
  else if (bps >= 1024LL * 1024)
    snprintf(out, cap, "%.1f MB/s", (double)bps / (1024.0 * 1024.0));
  else if (bps >= 1024LL)
    snprintf(out, cap, "%.0f KB/s", (double)bps / 1024.0);
  else
    snprintf(out, cap, "%lld B/s", bps);
}

static void fm_format_eta(int sec, char *out, size_t cap) {
  if (sec < 0) {
    snprintf(out, cap, "Calculando...");
    return;
  }
  if (sec >= 3600)
    snprintf(out, cap, "%dh %02dm %02ds", sec / 3600, (sec / 60) % 60, sec % 60);
  else if (sec >= 60)
    snprintf(out, cap, "%dm %02ds", sec / 60, sec % 60);
  else
    snprintf(out, cap, "%02ds", sec);
}

static int fm_sort_entries(const void *a, const void *b) {
  const FmEntry *ea = (const FmEntry *)a;
  const FmEntry *eb = (const FmEntry *)b;
  if (strcmp(ea->name, "..") == 0) return -1;
  if (strcmp(eb->name, "..") == 0) return 1;
  if (ea->is_dir != eb->is_dir) return ea->is_dir ? -1 : 1;
  return strcasecmp(ea->name, eb->name);
}

static void fm_ed_free(void) {
  if (fm_ed_lines) {
    for (int i = 0; i < fm_ed_count; i++) free(fm_ed_lines[i]);
    free(fm_ed_lines);
  }
  fm_ed_lines = NULL;
  fm_ed_count = 0;
  fm_ed_cap = 0;
  fm_ed_cursor = 0;
  fm_ed_scroll = 0;
  fm_ed_dirty = false;
  fm_ed_path[0] = 0;
  fm_ed_name[0] = 0;
}

static void fm_ensure_buffers(void) {
  if (!fm_entries)
    fm_entries = (FmEntry *)calloc(FM_MAX_ENTRIES, sizeof(FmEntry));
  if (!fm_arc_entries)
    fm_arc_entries = (FmArcEntry *)calloc(FM_MAX_ARC_ENTRIES, sizeof(FmArcEntry));
  if (!fm_ml_items)
    fm_ml_items = (FmMediaItem *)calloc(FM_MAX_MEDIA_ITEMS, sizeof(FmMediaItem));
}

static void fm_free_buffers(void) {
  free(fm_entries);
  fm_entries = NULL;
  fm_count = 0;
  free(fm_arc_entries);
  fm_arc_entries = NULL;
  fm_arc_count = 0;
  free(fm_ml_items);
  fm_ml_items = NULL;
  fm_ml_count = 0;
  fm_ed_free();
}

static int fm_selected_count(void) {
  int c = 0;
  for (int i = 0; i < fm_count; i++)
    if (fm_entries && fm_entries[i].selected) c++;
  return c;
}

static bool fm_scan_dir(const char *path) {
  fm_ensure_buffers();
  if (!fm_entries) return false;
  char resolved[PATH_MAX];
  if (!realpath(path, resolved)) {
    snprintf(fm_error, sizeof(fm_error), "Não foi possível acessar: %.140s", path);
    return false;
  }
  DIR *d = opendir(resolved);
  if (!d) {
    snprintf(fm_error, sizeof(fm_error),
             (errno == EACCES || errno == EPERM)
                 ? "Sem permissão de leitura nesta pasta"
                 : "Não foi possível abrir esta pasta");
    return false;
  }
  snprintf(fm_cwd, sizeof(fm_cwd), "%s", resolved);
  fm_error[0] = 0;
  fm_count = 0;

  if (strcmp(fm_cwd, "/") != 0) {
    FmEntry *up = &fm_entries[fm_count++];
    memset(up, 0, sizeof(*up));
    snprintf(up->name, sizeof(up->name), "..");
    snprintf(up->path, sizeof(up->path), "%s", fm_cwd);
    char *sl = strrchr(up->path, '/');
    if (sl && sl > up->path) *sl = 0;
    else snprintf(up->path, sizeof(up->path), "/");
    up->is_dir = true;
  }

  struct dirent *de;
  while ((de = readdir(d)) != NULL && fm_count < FM_MAX_ENTRIES) {
    if (strcmp(de->d_name, ".") == 0 || strcmp(de->d_name, "..") == 0)
      continue;
    if (!fm_show_hidden && de->d_name[0] == '.')
      continue;
    char full[PATH_MAX];
    int n = strcmp(fm_cwd, "/") == 0
                ? snprintf(full, sizeof(full), "/%s", de->d_name)
                : snprintf(full, sizeof(full), "%s/%s", fm_cwd, de->d_name);
    if (n < 0 || n >= (int)sizeof(full)) continue;
    struct stat lst, st;
    if (lstat(full, &lst) != 0) continue;
    bool is_link = S_ISLNK(lst.st_mode);
    bool is_dir = false;
    long long sz = 0;
    mode_t eff_mode = lst.st_mode;
    if (stat(full, &st) == 0) {
      is_dir = S_ISDIR(st.st_mode);
      sz = is_dir ? 0 : (long long)st.st_size;
      eff_mode = st.st_mode;
    } else {
      is_dir = S_ISDIR(lst.st_mode);
      sz = (long long)lst.st_size;
    }
    FmEntry *e = &fm_entries[fm_count++];
    memset(e, 0, sizeof(*e));
    snprintf(e->name, sizeof(e->name), "%.255s", de->d_name);
    snprintf(e->path, sizeof(e->path), "%s", full);
    e->is_dir = is_dir;
    e->is_link = is_link;
    e->is_archive = !is_dir && fm_is_archive_name(de->d_name);
    e->is_script = !is_dir && fm_is_script_name(de->d_name);
    e->is_radio = !is_dir && fm_is_radio_file(de->d_name, full);
    e->is_playlist = !is_dir && !e->is_radio && fm_is_playlist_name(de->d_name);
    e->is_text = !is_dir && fm_is_text_name(de->d_name);
    e->is_executable = !is_dir && !e->is_script && !e->is_archive && !e->is_text &&
                       !supported(de->d_name) && fm_is_executable_file(full, eff_mode);
    e->size = sz;
  }
  closedir(d);

  if (fm_count > 1)
    qsort(fm_entries, (size_t)fm_count, sizeof(FmEntry), fm_sort_entries);
  if (fm_cursor >= fm_count) fm_cursor = fm_count > 0 ? fm_count - 1 : 0;
  if (fm_cursor < 0) fm_cursor = 0;
  fm_scroll = 0;
  return true;
}

static void fm_open(void) {
  fm_ensure_buffers();
  if (strcmp(fm_app_dir, ".") == 0) {
    char buf[PATH_MAX];
    if (getcwd(buf, sizeof(buf)))
      snprintf(fm_app_dir, sizeof(fm_app_dir), "%s", buf);
  }
  fm_view = FM_VIEW_BROWSE;
  fm_modal = FM_MODAL_NONE;
  fm_cursor = 0;
  fm_scroll = 0;
  if (!fm_scan_dir(fm_cwd[0] ? fm_cwd : "/"))
    fm_scan_dir("/");
  mode = 16;
  menu_dirty = true;
}

/* Helper to build path to file_ops.py inside KPlayer directory */
static void fm_script_path(char *out, size_t cap) {
  if (fm_app_dir[0] && strcmp(fm_app_dir, ".") != 0)
    snprintf(out, cap, "%.3800s/file_ops.py", fm_app_dir);
  else
    snprintf(out, cap, "./file_ops.py");
}

static void fm_progress_file_path(char *out, size_t cap) {
  snprintf(out, cap, "/tmp/kplayer_fm_progress_%d.tsv", (int)getpid());
}

static void fm_arc_tsv_path(char *out, size_t cap) {
  snprintf(out, cap, "/tmp/kplayer_fm_arc_%d.tsv", (int)getpid());
}

/* Run file_ops.py synchronously for fast archive inspection (passing password via pipe) */
static int fm_run_archive_list(const char *arc_path, const char *password) {
  fm_ensure_buffers();
  if (!fm_arc_entries) return -1;
  char script[PATH_MAX], tsv[256];
  fm_script_path(script, sizeof(script));
  fm_arc_tsv_path(tsv, sizeof(tsv));
  unlink(tsv);

  int pfd[2] = {-1, -1};
  bool send_pwd = (password && password[0] != '\0');
  if (send_pwd && pipe(pfd) != 0) return -1;

  pid_t pid = fork();
  if (pid < 0) {
    if (send_pwd) { close(pfd[0]); close(pfd[1]); }
    return -1;
  }
  if (pid == 0) {
    if (send_pwd) {
      dup2(pfd[0], STDIN_FILENO);
      close(pfd[0]);
      close(pfd[1]);
    }
    int devnull = open("/dev/null", O_WRONLY);
    if (devnull >= 0) {
      dup2(devnull, STDOUT_FILENO);
      dup2(devnull, STDERR_FILENO);
      close(devnull);
    }
    char *argv_pwd[] = {
        (char *)"python3", script, (char *)"--password-stdin",
        (char *)"list-archive-tsv", (char *)arc_path, tsv, NULL
    };
    char *argv_plain[] = {
        (char *)"python3", script,
        (char *)"list-archive-tsv", (char *)arc_path, tsv, NULL
    };
    execvp("python3", send_pwd ? argv_pwd : argv_plain);
    _exit(127);
  }
  if (send_pwd) {
    close(pfd[0]);
    size_t plen = strlen(password);
    ssize_t w1 = write(pfd[1], password, plen);
    ssize_t w2 = write(pfd[1], "\n", 1);
    (void)w1;
    (void)w2;
    close(pfd[1]);
  }
  int status = 0;
  waitpid(pid, &status, 0);
  int rc = WIFEXITED(status) ? WEXITSTATUS(status) : 1;

  fm_arc_count = 0;
  fm_arc_encrypted = false;
  fm_arc_engine[0] = 0;
  FILE *f = fopen(tsv, "r");
  if (!f) return rc;
  char line[512];
  bool need_pwd = false, bad_pwd = false;
  char err_msg[192] = "";
  while (fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    if (strncmp(line, "META\t", 5) == 0) {
      char *p = line + 5;
      char *toks[6] = {0};
      int ti = 0;
      while (ti < 6 && p) {
        toks[ti++] = p;
        char *tab = strchr(p, '\t');
        if (tab) { *tab = 0; p = tab + 1; } else break;
      }
      if (ti >= 2 && toks[1]) fm_arc_encrypted = (toks[1][0] == '1');
      if (ti >= 3 && toks[2]) need_pwd = (toks[2][0] == '1');
      if (ti >= 4 && toks[3]) bad_pwd = (toks[3][0] == '1');
      if (ti >= 5 && toks[4]) snprintf(fm_arc_engine, sizeof(fm_arc_engine), "%.31s", toks[4]);
      if (ti >= 6 && toks[5]) snprintf(err_msg, sizeof(err_msg), "%.191s", toks[5]);
    } else if (strncmp(line, "ENTRY\t", 6) == 0 && fm_arc_count < FM_MAX_ARC_ENTRIES) {
      char *p = line + 6;
      char *toks[4] = {0};
      int ti = 0;
      while (ti < 4 && p) {
        toks[ti++] = p;
        char *tab = strchr(p, '\t');
        if (tab) { *tab = 0; p = tab + 1; } else break;
      }
      if (ti >= 4 && toks[3]) {
        FmArcEntry *ae = &fm_arc_entries[fm_arc_count++];
        memset(ae, 0, sizeof(*ae));
        ae->is_dir = (toks[0][0] == '1');
        ae->size = strtoll(toks[1], NULL, 10);
        ae->encrypted = (toks[2][0] == '1');
        snprintf(ae->path, sizeof(ae->path), "%.255s", toks[3]);
      }
    }
  }
  fclose(f);
  unlink(tsv);

  if (need_pwd || bad_pwd) return 3;
  if (rc != 0 && err_msg[0]) notify(err_msg);
  return rc;
}

typedef struct {
  int argc;
  char **argv;
  char password[128];
  bool has_password;
  char progress_path[256];
} FmJobSpec;

static void fm_read_progress_file(const char *path) {
  FILE *f = fopen(path, "r");
  if (!f) return;
  char line[768];
  if (fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    char *toks[11] = {0};
    int ti = 0;
    char *p = line;
    while (ti < 11 && p) {
      toks[ti++] = p;
      char *tab = strchr(p, '\t');
      if (tab) { *tab = 0; p = tab + 1; } else break;
    }
    pthread_mutex_lock(&fm_job_mutex);
    if (ti >= 1 && toks[0]) snprintf(fm_job_status, sizeof(fm_job_status), "%.23s", toks[0]);
    if (ti >= 2 && toks[1]) fm_job_pct = (float)atof(toks[1]);
    if (ti >= 3 && toks[2]) fm_job_bytes_done = strtoll(toks[2], NULL, 10);
    if (ti >= 4 && toks[3]) fm_job_bytes_total = strtoll(toks[3], NULL, 10);
    if (ti >= 5 && toks[4]) fm_job_speed_bps = strtoll(toks[4], NULL, 10);
    if (ti >= 6 && toks[5]) fm_job_eta_sec = atoi(toks[5]);
    if (ti >= 7 && toks[6]) fm_job_items_done = atoi(toks[6]);
    if (ti >= 8 && toks[7]) fm_job_items_total = atoi(toks[7]);
    if (ti >= 9 && toks[8]) snprintf(fm_job_op, sizeof(fm_job_op), "%.63s", toks[8]);
    if (ti >= 10 && toks[9]) snprintf(fm_job_cur_file, sizeof(fm_job_cur_file), "%.191s", toks[9]);
    if (ti >= 11 && toks[10]) snprintf(fm_job_message, sizeof(fm_job_message), "%.223s", toks[10]);
    pthread_mutex_unlock(&fm_job_mutex);
  }
  fclose(f);
}

static void *fm_job_worker(void *arg) {
  FmJobSpec *spec = (FmJobSpec *)arg;
  int pfd[2] = {-1, -1};
  if (spec->has_password && pipe(pfd) != 0) {
    pthread_mutex_lock(&fm_job_mutex);
    fm_job_running = false;
    fm_job_exit_code = 1;
    snprintf(fm_job_status, sizeof(fm_job_status), "error");
    snprintf(fm_job_message, sizeof(fm_job_message), "Falha ao abrir canal de senha");
    fm_job_done_pending = true;
    pthread_mutex_unlock(&fm_job_mutex);
    for (int i = 0; i < spec->argc; i++) free(spec->argv[i]);
    free(spec->argv);
    free(spec);
    return NULL;
  }

  pid_t pid = fork();
  if (pid < 0) {
    if (spec->has_password) { close(pfd[0]); close(pfd[1]); }
    pthread_mutex_lock(&fm_job_mutex);
    fm_job_running = false;
    fm_job_exit_code = 1;
    snprintf(fm_job_status, sizeof(fm_job_status), "error");
    snprintf(fm_job_message, sizeof(fm_job_message), "Falha ao iniciar processo");
    fm_job_done_pending = true;
    pthread_mutex_unlock(&fm_job_mutex);
    for (int i = 0; i < spec->argc; i++) free(spec->argv[i]);
    free(spec->argv);
    free(spec);
    return NULL;
  }

  if (pid == 0) {
    if (spec->has_password) {
      dup2(pfd[0], STDIN_FILENO);
      close(pfd[0]);
      close(pfd[1]);
    }
    int devnull = open("/dev/null", O_WRONLY);
    if (devnull >= 0) {
      dup2(devnull, STDOUT_FILENO);
      dup2(devnull, STDERR_FILENO);
      close(devnull);
    }
    execvp("python3", spec->argv);
    _exit(127);
  }

  pthread_mutex_lock(&fm_job_mutex);
  fm_job_pid = pid;
  pthread_mutex_unlock(&fm_job_mutex);

  if (spec->has_password) {
    close(pfd[0]);
    size_t plen = strlen(spec->password);
    ssize_t w1 = write(pfd[1], spec->password, plen);
    ssize_t w2 = write(pfd[1], "\n", 1);
    (void)w1;
    (void)w2;
    close(pfd[1]);
  }
  memset(spec->password, 0, sizeof(spec->password));

  int st = 0;
  waitpid(pid, &st, 0);
  int rc = WIFEXITED(st) ? WEXITSTATUS(st) : 1;
  fm_read_progress_file(spec->progress_path);
  unlink(spec->progress_path);

  pthread_mutex_lock(&fm_job_mutex);
  fm_job_pid = 0;
  fm_job_exit_code = rc;
  fm_job_running = false;
  fm_job_done_pending = true;
  pthread_mutex_unlock(&fm_job_mutex);

  for (int i = 0; i < spec->argc; i++) free(spec->argv[i]);
  free(spec->argv);
  free(spec);
  return NULL;
}

static bool fm_start_async_job(const char *op_title, const char *cmd,
                               const char *dest_or_out,
                               const char *const *paths, int path_count,
                               const char *password,
                               bool clear_clip_on_ok, bool is_extract) {
  pthread_mutex_lock(&fm_job_mutex);
  if (fm_job_running) {
    pthread_mutex_unlock(&fm_job_mutex);
    return false;
  }
  fm_job_running = true;
  fm_job_done_pending = false;
  fm_job_pid = 0;
  fm_job_exit_code = 0;
  snprintf(fm_job_status, sizeof(fm_job_status), "running");
  fm_job_pct = 0.0f;
  fm_job_bytes_done = 0;
  fm_job_bytes_total = 0;
  fm_job_speed_bps = 0;
  fm_job_eta_sec = -1;
  fm_job_items_done = 0;
  fm_job_items_total = 0;
  snprintf(fm_job_op, sizeof(fm_job_op), "%.63s", op_title);
  fm_job_cur_file[0] = 0;
  snprintf(fm_job_message, sizeof(fm_job_message), "Preparando operação...");
  fm_job_clear_clip_on_ok = clear_clip_on_ok;
  fm_job_is_extract = is_extract;
  pthread_mutex_unlock(&fm_job_mutex);

  char script[PATH_MAX], prog[256];
  fm_script_path(script, sizeof(script));
  fm_progress_file_path(prog, sizeof(prog));
  unlink(prog);

  bool has_pwd = (password && password[0] != '\0');
  int max_args = 8 + path_count;
  FmJobSpec *spec = (FmJobSpec *)calloc(1, sizeof(FmJobSpec));
  if (!spec) {
    pthread_mutex_lock(&fm_job_mutex);
    fm_job_running = false;
    pthread_mutex_unlock(&fm_job_mutex);
    return false;
  }
  spec->argv = (char **)calloc((size_t)max_args, sizeof(char *));
  if (!spec->argv) {
    free(spec);
    pthread_mutex_lock(&fm_job_mutex);
    fm_job_running = false;
    pthread_mutex_unlock(&fm_job_mutex);
    return false;
  }
  snprintf(spec->progress_path, sizeof(spec->progress_path), "%s", prog);
  if (has_pwd) {
    spec->has_password = true;
    snprintf(spec->password, sizeof(spec->password), "%.127s", password);
  }
  int ac = 0;
  spec->argv[ac++] = strdup("python3");
  spec->argv[ac++] = strdup(script);
  spec->argv[ac++] = strdup("--progress");
  spec->argv[ac++] = strdup(prog);
  if (has_pwd) spec->argv[ac++] = strdup("--password-stdin");
  spec->argv[ac++] = strdup(cmd);
  if (is_extract) {
    /* extract <archive> <dest_dir> */
    if (path_count > 0) spec->argv[ac++] = strdup(paths[0]);
    if (dest_or_out) spec->argv[ac++] = strdup(dest_or_out);
  } else {
    if (dest_or_out) spec->argv[ac++] = strdup(dest_or_out);
    for (int i = 0; i < path_count; i++)
      spec->argv[ac++] = strdup(paths[i]);
  }
  spec->argv[ac] = NULL;
  spec->argc = ac;

  pthread_t th;
  if (pthread_create(&th, NULL, fm_job_worker, spec) != 0) {
    for (int i = 0; i < spec->argc; i++) free(spec->argv[i]);
    free(spec->argv);
    free(spec);
    pthread_mutex_lock(&fm_job_mutex);
    fm_job_running = false;
    pthread_mutex_unlock(&fm_job_mutex);
    return false;
  }
  pthread_detach(th);
  fm_modal = FM_MODAL_PROGRESS;
  return true;
}

static void fm_cancel_job(void) {
  pthread_mutex_lock(&fm_job_mutex);
  pid_t pid = fm_job_pid;
  pthread_mutex_unlock(&fm_job_mutex);
  if (pid > 0) {
    kill(pid, SIGTERM);
    notify("Cancelando operação...");
  }
}

static void fm_open_keyboard(int purpose, const char *title_txt,
                             const char *sub_txt, const char *initial,
                             bool mask_input) {
  fm_kb_purpose = purpose;
  snprintf(fm_kb_title, sizeof(fm_kb_title), "%.95s", title_txt);
  snprintf(fm_kb_sub, sizeof(fm_kb_sub), "%.159s", sub_txt);
  snprintf(fm_kb_buf, sizeof(fm_kb_buf), "%.155s", initial ? initial : "");
  fm_kb_mask = mask_input;
  fm_kb_upper = false;
  fm_kb_symbols = false;
  fm_kb_row = 1;
  fm_kb_col = 0;
  fm_modal = FM_MODAL_KEYBOARD;
}

/* Called each frame in the main loop when mode == 16 or job active */
static void fm_poll_main_thread(void) {
  pthread_mutex_lock(&fm_job_mutex);
  bool running_now = fm_job_running;
  bool done_pending = fm_job_done_pending;
  int rc = fm_job_exit_code;
  char st[24], msg[224];
  snprintf(st, sizeof(st), "%.23s", fm_job_status);
  snprintf(msg, sizeof(msg), "%.223s", fm_job_message);
  bool clear_clip = fm_job_clear_clip_on_ok;
  bool is_ext = fm_job_is_extract;
  if (done_pending) fm_job_done_pending = false;
  pthread_mutex_unlock(&fm_job_mutex);

  if (running_now) {
    uint32_t now = SDL_GetTicks();
    if (now - fm_last_progress_poll >= 60u) {
      fm_last_progress_poll = now;
      char prog[256];
      fm_progress_file_path(prog, sizeof(prog));
      fm_read_progress_file(prog);
    }
    return;
  }

  if (!done_pending) return;

  if (fm_modal == FM_MODAL_PROGRESS)
    fm_modal = FM_MODAL_NONE;

  if (is_ext && (rc == 3 || strcmp(st, "need_password") == 0 || strcmp(st, "bad_password") == 0)) {
    bool bad = strcmp(st, "bad_password") == 0;
    fm_open_keyboard(FM_KB_PASSWORD_EXTRACT,
                     bad ? "Senha incorreta — tente novamente" : "Arquivo protegido por senha",
                     "Digite a senha do ZIP / 7Z / RAR para descompactar",
                     "", true);
    return;
  }

  if (rc == 0) {
    if (clear_clip) {
      fm_clip_count = 0;
      fm_clip_move = false;
    }
    notify(msg[0] ? msg : "Operação concluída!");
  } else if (rc == 2 || strcmp(st, "cancelled") == 0) {
    notify("Operação cancelada");
  } else {
    notify(msg[0] ? msg : "Erro ao executar operação");
  }

  if (fm_view == FM_VIEW_BROWSE)
    fm_scan_dir(fm_cwd);
  menu_dirty = true;
}

static bool fm_is_job_busy(void) {
  pthread_mutex_lock(&fm_job_mutex);
  bool b = fm_job_running;
  pthread_mutex_unlock(&fm_job_mutex);
  return b;
}

/* Collect either multi-selected entries or the single focused entry */
static int fm_gather_targets(const char **out_paths, int max_out) {
  int n = 0;
  for (int i = 0; i < fm_count && n < max_out; i++) {
    if (fm_entries[i].selected && strcmp(fm_entries[i].name, "..") != 0)
      out_paths[n++] = fm_entries[i].path;
  }
  if (n == 0 && fm_cursor >= 0 && fm_cursor < fm_count &&
      strcmp(fm_entries[fm_cursor].name, "..") != 0) {
    out_paths[n++] = fm_entries[fm_cursor].path;
  }
  return n;
}

static void fm_stage_clipboard(bool move) {
  const char *targets[FM_MAX_CLIP];
  int n = fm_gather_targets(targets, FM_MAX_CLIP);
  if (n <= 0) {
    notify("Selecione um arquivo ou pasta primeiro");
    return;
  }
  fm_clip_count = 0;
  for (int i = 0; i < n && i < FM_MAX_CLIP; i++) {
    snprintf(fm_clip_paths[fm_clip_count++], PATH_MAX, "%s", targets[i]);
  }
  fm_clip_move = move;
  for (int i = 0; i < fm_count; i++) fm_entries[i].selected = false;
  char msg[128];
  snprintf(msg, sizeof(msg), "%d item(ns) prontos para %s (vá ao destino e cole)",
           fm_clip_count, move ? "mover" : "copiar");
  notify(msg);
}

static void fm_paste_here(void) {
  if (fm_clip_count <= 0) {
    notify("Área de transferência vazia");
    return;
  }
  const char *ptrs[FM_MAX_CLIP];
  for (int i = 0; i < fm_clip_count; i++) ptrs[i] = fm_clip_paths[i];
  fm_start_async_job(fm_clip_move ? "Movendo arquivos" : "Copiando arquivos",
                     fm_clip_move ? "move" : "copy",
                     fm_cwd, ptrs, fm_clip_count, NULL,
                     fm_clip_move, false);
}

static void fm_begin_extract(const char *arc_path, const char *dest_dir,
                             const char *password) {
  snprintf(fm_pending_arc_path, sizeof(fm_pending_arc_path), "%s", arc_path);
  snprintf(fm_pending_extract_dest, sizeof(fm_pending_extract_dest), "%s", dest_dir);
  const char *arr[1] = {fm_pending_arc_path};
  fm_start_async_job("Descompactando arquivo", "extract",
                     fm_pending_extract_dest, arr, 1, password, false, true);
}

static void fm_make_extract_subdir(const char *arc_name, char *out_dir, size_t cap) {
  char base[256];
  snprintf(base, sizeof(base), "%.255s", arc_name);
  char *dot = strrchr(base, '.');
  if (dot && dot > base) *dot = 0;
  /* Strip .tar from .tar.gz/.tar.xz/.tar.bz2 */
  size_t bl = strlen(base);
  if (bl > 4 && strcasecmp(base + bl - 4, ".tar") == 0) base[bl - 4] = 0;
  if (!base[0]) snprintf(base, sizeof(base), "extraido");
  if (strcmp(fm_cwd, "/") == 0)
    snprintf(out_dir, cap, "/%.255s", base);
  else
    snprintf(out_dir, cap, "%.3800s/%.255s", fm_cwd, base);
}

static void fm_open_archive_entry(const char *arc_path, const char *arc_name,
                                  const char *password) {
  int rc = fm_run_archive_list(arc_path, password);
  if (rc == 3) {
    snprintf(fm_pending_arc_path, sizeof(fm_pending_arc_path), "%s", arc_path);
    snprintf(fm_arc_name, sizeof(fm_arc_name), "%.255s", arc_name);
    fm_open_keyboard(FM_KB_PASSWORD_OPEN,
                     (password && password[0]) ? "Senha incorreta — tente novamente" : "Arquivo com senha",
                     "Digite a senha para abrir o conteúdo compactado",
                     "", true);
    return;
  }
  if (rc != 0) return;
  snprintf(fm_arc_file, sizeof(fm_arc_file), "%s", arc_path);
  snprintf(fm_arc_name, sizeof(fm_arc_name), "%.255s", arc_name);
  snprintf(fm_arc_password, sizeof(fm_arc_password), "%.127s", password ? password : "");
  fm_arc_cursor = 0;
  fm_arc_scroll = 0;
  fm_view = FM_VIEW_ARCHIVE;
  fm_modal = FM_MODAL_NONE;
}

/* ==================== v2.1.3 NATIVE TEXT EDITOR ==================== */

static bool fm_ed_ensure_cap(int need) {
  if (need <= fm_ed_cap) return true;
  int ncap = fm_ed_cap ? fm_ed_cap * 2 : 64;
  while (ncap < need) ncap *= 2;
  if (ncap > FM_ED_MAX_LINES) ncap = FM_ED_MAX_LINES;
  if (need > ncap) return false;
  char **nl = (char **)realloc(fm_ed_lines, (size_t)ncap * sizeof(char *));
  if (!nl) return false;
  fm_ed_lines = nl;
  fm_ed_cap = ncap;
  return true;
}

static bool fm_ed_push_line(const char *s, size_t len) {
  if (fm_ed_count >= FM_ED_MAX_LINES) return false;
  if (!fm_ed_ensure_cap(fm_ed_count + 1)) return false;
  char *copy = (char *)malloc(len + 1);
  if (!copy) return false;
  if (len > 0) memcpy(copy, s, len);
  copy[len] = 0;
  fm_ed_lines[fm_ed_count++] = copy;
  return true;
}

static bool fm_ed_open(const char *path, const char *name) {
  if (!path || !path[0]) return false;
  struct stat st;
  if (stat(path, &st) != 0 || !S_ISREG(st.st_mode)) {
    notify("Não foi possível abrir este arquivo");
    return false;
  }
  if (st.st_size > FM_ED_MAX_BYTES) {
    notify("Arquivo muito grande para o editor (máx. 512 KB)");
    return false;
  }
  FILE *f = fopen(path, "rb");
  if (!f) {
    notify("Sem permissão para ler este arquivo");
    return false;
  }
  size_t sz = (size_t)st.st_size;
  char *buf = (char *)malloc(sz + 1);
  if (!buf) { fclose(f); notify("Memória insuficiente"); return false; }
  size_t rd = sz > 0 ? fread(buf, 1, sz, f) : 0;
  fclose(f);
  buf[rd] = 0;

  /* Reject binary files containing NUL bytes */
  for (size_t i = 0; i < rd; i++) {
    if (buf[i] == '\0') {
      free(buf);
      notify("Arquivo binário não suportado no editor de texto");
      return false;
    }
  }

  fm_ed_free();
  snprintf(fm_ed_path, sizeof(fm_ed_path), "%s", path);
  snprintf(fm_ed_name, sizeof(fm_ed_name), "%.255s", name && name[0] ? name : path);

  size_t start = 0;
  for (size_t i = 0; i < rd; i++) {
    if (buf[i] == '\n') {
      size_t llen = i - start;
      if (llen > 0 && buf[start + llen - 1] == '\r') llen--;
      if (!fm_ed_push_line(buf + start, llen)) break;
      start = i + 1;
    }
  }
  if (start < rd || fm_ed_count == 0) {
    size_t llen = rd - start;
    if (llen > 0 && buf[start + llen - 1] == '\r') llen--;
    fm_ed_push_line(buf + start, llen);
  }
  free(buf);

  fm_ed_cursor = 0;
  fm_ed_scroll = 0;
  fm_ed_dirty = false;
  fm_view = FM_VIEW_EDITOR;
  fm_modal = FM_MODAL_NONE;
  return true;
}

static bool fm_ed_replace_line(int idx, const char *text) {
  if (idx < 0 || idx >= fm_ed_count || !text) return false;
  size_t len = strlen(text);
  char *copy = (char *)malloc(len + 1);
  if (!copy) return false;
  memcpy(copy, text, len + 1);
  free(fm_ed_lines[idx]);
  fm_ed_lines[idx] = copy;
  fm_ed_dirty = true;
  return true;
}

static bool fm_ed_insert_line(int after_idx, const char *text) {
  if (fm_ed_count >= FM_ED_MAX_LINES) {
    notify("Limite de linhas do editor atingido");
    return false;
  }
  if (!fm_ed_ensure_cap(fm_ed_count + 1)) return false;
  int pos = after_idx + 1;
  if (pos < 0) pos = 0;
  if (pos > fm_ed_count) pos = fm_ed_count;
  size_t len = text ? strlen(text) : 0;
  char *copy = (char *)malloc(len + 1);
  if (!copy) return false;
  if (len > 0) memcpy(copy, text, len);
  copy[len] = 0;
  for (int i = fm_ed_count; i > pos; i--)
    fm_ed_lines[i] = fm_ed_lines[i - 1];
  fm_ed_lines[pos] = copy;
  fm_ed_count++;
  fm_ed_cursor = pos;
  fm_ed_dirty = true;
  return true;
}

static void fm_ed_delete_line(int idx) {
  if (idx < 0 || idx >= fm_ed_count) return;
  if (fm_ed_count == 1) {
    fm_ed_replace_line(0, "");
    return;
  }
  free(fm_ed_lines[idx]);
  for (int i = idx; i < fm_ed_count - 1; i++)
    fm_ed_lines[i] = fm_ed_lines[i + 1];
  fm_ed_count--;
  if (fm_ed_cursor >= fm_ed_count) fm_ed_cursor = fm_ed_count - 1;
  fm_ed_dirty = true;
}

static bool fm_ed_save(void) {
  if (!fm_ed_path[0]) return false;
  struct stat st;
  bool had_stat = (stat(fm_ed_path, &st) == 0);
  char tmp[PATH_MAX];
  int tn = snprintf(tmp, sizeof(tmp), "%.4000s.kp_tmp", fm_ed_path);
  if (tn < 0 || tn >= (int)sizeof(tmp)) {
    notify("Caminho muito longo para salvar");
    return false;
  }
  FILE *f = fopen(tmp, "wb");
  if (!f) {
    notify("Sem permissão de escrita neste arquivo");
    return false;
  }
  bool ok = true;
  for (int i = 0; i < fm_ed_count; i++) {
    const char *line = fm_ed_lines[i] ? fm_ed_lines[i] : "";
    size_t len = strlen(line);
    if (len > 0 && fwrite(line, 1, len, f) != len) { ok = false; break; }
    if (fputc('\n', f) == EOF) { ok = false; break; }
  }
  if (fclose(f) != 0) ok = false;
  if (!ok) {
    unlink(tmp);
    notify("Falha ao gravar arquivo");
    return false;
  }
  if (had_stat) chmod(tmp, st.st_mode & 07777);
  if (rename(tmp, fm_ed_path) != 0) {
    unlink(tmp);
    notify("Não foi possível substituir arquivo (permissão)");
    return false;
  }
  fm_ed_dirty = false;
  notify("Arquivo salvo com sucesso");
  return true;
}

/* ==================== v2.1.3 PLAYLIST (.m3u8/.m3u) & RADIO PARSER ==================== */

static bool fm_is_http_url(const char *s) {
  return s && (strncasecmp(s, "http://", 7) == 0 || strncasecmp(s, "https://", 8) == 0);
}

static void fm_trim_crlf(char *s) {
  if (!s) return;
  size_t len = strlen(s);
  while (len > 0 && (s[len - 1] == '\n' || s[len - 1] == '\r' || s[len - 1] == ' ' || s[len - 1] == '\t'))
    s[--len] = 0;
}

static bool fm_parse_media_list(const char *path, const char *name, bool is_radio_hint) {
  fm_ensure_buffers();
  if (!fm_ml_items || !path || !path[0]) return false;
  FILE *f = fopen(path, "r");
  if (!f) {
    notify("Não foi possível ler o arquivo de mídia/lista");
    return false;
  }
  fm_ml_count = 0;
  fm_ml_is_radio = is_radio_hint;
  snprintf(fm_ml_path, sizeof(fm_ml_path), "%s", path);
  snprintf(fm_ml_name, sizeof(fm_ml_name), "%.255s", name && name[0] ? name : path);

  char base_dir[PATH_MAX];
  snprintf(base_dir, sizeof(base_dir), "%s", path);
  char *sl = strrchr(base_dir, '/');
  if (sl && sl > base_dir) *sl = 0;
  else snprintf(base_dir, sizeof(base_dir), "/");

  char line[1280];
  if (fm_has_ext(name, ".pls")) {
    char pls_urls[64][1024];
    char pls_titles[64][160];
    memset(pls_urls, 0, sizeof(pls_urls));
    memset(pls_titles, 0, sizeof(pls_titles));
    int max_idx = 0;
    while (fgets(line, sizeof(line), f)) {
      fm_trim_crlf(line);
      if (strncasecmp(line, "File", 4) == 0) {
        char *eq = strchr(line, '=');
        if (eq) {
          int idx = atoi(line + 4);
          if (idx >= 1 && idx <= 64) {
            snprintf(pls_urls[idx - 1], sizeof(pls_urls[0]), "%.1023s", eq + 1);
            if (idx > max_idx) max_idx = idx;
          }
        }
      } else if (strncasecmp(line, "Title", 5) == 0) {
        char *eq = strchr(line, '=');
        if (eq) {
          int idx = atoi(line + 5);
          if (idx >= 1 && idx <= 64) {
            snprintf(pls_titles[idx - 1], sizeof(pls_titles[0]), "%.159s", eq + 1);
            if (idx > max_idx) max_idx = idx;
          }
        }
      }
    }
    for (int i = 0; i < max_idx && fm_ml_count < FM_MAX_MEDIA_ITEMS; i++) {
      if (!pls_urls[i][0]) continue;
      FmMediaItem *it = &fm_ml_items[fm_ml_count++];
      memset(it, 0, sizeof(*it));
      snprintf(it->title, sizeof(it->title), "%.159s",
               pls_titles[i][0] ? pls_titles[i] : pls_urls[i]);
      snprintf(it->url, sizeof(it->url), "%.1023s", pls_urls[i]);
      it->is_local = !fm_is_http_url(it->url);
      it->is_video = false;
    }
  } else if (fm_has_ext(name, ".tsv")) {
    while (fgets(line, sizeof(line), f) && fm_ml_count < FM_MAX_MEDIA_ITEMS) {
      fm_trim_crlf(line);
      if (!line[0] || line[0] == '#') continue;
      char *tab = strchr(line, '\t');
      if (!tab) continue;
      *tab = 0;
      char *url = tab + 1;
      char *tab2 = strchr(url, '\t');
      if (tab2) *tab2 = 0;
      if (!url[0]) continue;
      FmMediaItem *it = &fm_ml_items[fm_ml_count++];
      memset(it, 0, sizeof(*it));
      snprintf(it->title, sizeof(it->title), "%.159s", line[0] ? line : url);
      snprintf(it->url, sizeof(it->url), "%.1023s", url);
      it->is_local = !fm_is_http_url(it->url);
      it->is_video = false;
    }
  } else if (fm_has_ext(name, ".xspf")) {
    char cur_title[160] = "";
    while (fgets(line, sizeof(line), f) && fm_ml_count < FM_MAX_MEDIA_ITEMS) {
      char *t1 = strstr(line, "<title>");
      if (t1) {
        t1 += 7;
        char *t2 = strstr(t1, "</title>");
        if (t2) {
          size_t n = (size_t)(t2 - t1);
          if (n >= sizeof(cur_title)) n = sizeof(cur_title) - 1;
          memcpy(cur_title, t1, n);
          cur_title[n] = 0;
        }
      }
      char *l1 = strstr(line, "<location>");
      if (l1) {
        l1 += 10;
        char *l2 = strstr(l1, "</location>");
        if (l2) {
          char u[1024];
          size_t n = (size_t)(l2 - l1);
          if (n >= sizeof(u)) n = sizeof(u) - 1;
          memcpy(u, l1, n);
          u[n] = 0;
          if (u[0]) {
            FmMediaItem *it = &fm_ml_items[fm_ml_count++];
            memset(it, 0, sizeof(*it));
            snprintf(it->title, sizeof(it->title), "%.159s", cur_title[0] ? cur_title : u);
            snprintf(it->url, sizeof(it->url), "%.1023s", u);
            it->is_local = !fm_is_http_url(u);
            it->is_video = !is_radio_hint;
            cur_title[0] = 0;
          }
        }
      }
    }
  } else {
    /* M3U / M3U8 playlist parser */
    char pending_title[160] = "";
    bool is_hls_manifest = false;
    while (fgets(line, sizeof(line), f) && fm_ml_count < FM_MAX_MEDIA_ITEMS) {
      fm_trim_crlf(line);
      if (!line[0]) continue;
      if (strncmp(line, "#EXT-X-STREAM-INF", 17) == 0 ||
          strncmp(line, "#EXT-X-TARGETDURATION", 21) == 0) {
        is_hls_manifest = true;
      }
      if (strncmp(line, "#EXTINF:", 8) == 0) {
        char *comma = strrchr(line, ',');
        if (comma && comma[1])
          snprintf(pending_title, sizeof(pending_title), "%.159s", comma + 1);
        continue;
      }
      if (line[0] == '#') continue;
      FmMediaItem *it = &fm_ml_items[fm_ml_count++];
      memset(it, 0, sizeof(*it));
      if (fm_is_http_url(line)) {
        snprintf(it->url, sizeof(it->url), "%.1023s", line);
        it->is_local = false;
      } else if (line[0] == '/') {
        snprintf(it->url, sizeof(it->url), "%.1023s", line);
        it->is_local = true;
      } else {
        snprintf(it->url, sizeof(it->url), "%.500s/%.500s", base_dir, line);
        it->is_local = true;
      }
      if (pending_title[0]) {
        snprintf(it->title, sizeof(it->title), "%.159s", pending_title);
      } else {
        const char *bn = strrchr(it->url, '/');
        snprintf(it->title, sizeof(it->title), "%.159s", (bn && bn[1]) ? bn + 1 : it->url);
      }
      if (it->is_local) {
        it->is_video = !audio_file(it->url);
      } else {
        it->is_video = !is_radio_hint && (fm_has_ext(it->url, ".m3u8") ||
                       fm_has_ext(it->url, ".mp4") || fm_has_ext(it->url, ".ts") ||
                       fm_has_ext(name, ".m3u8"));
      }
      pending_title[0] = 0;
    }
    /* If it's a pure HLS segment playlist (.ts chunks), play the .m3u8 file directly */
    if (is_hls_manifest && fm_ml_count > 0 && fm_ml_items[0].is_local &&
        fm_has_ext(fm_ml_items[0].url, ".ts")) {
      fclose(f);
      fm_return_on_exit = true;
      play_path(path);
      return true;
    }
  }
  fclose(f);

  if (fm_ml_count == 0) {
    notify("Lista vazia — abrindo no Editor de Texto");
    return fm_ed_open(path, name);
  }
  fm_ml_cursor = 0;
  fm_ml_scroll = 0;
  fm_view = FM_VIEW_MEDIA_LIST;
  fm_modal = FM_MODAL_NONE;
  return true;
}

static void fm_play_media_item(const FmMediaItem *it) {
  if (!it || !it->url[0]) return;
  if (it->is_local) {
    fm_return_on_exit = true;
    play_path(it->url);
    return;
  }
  if (!fm_is_http_url(it->url)) {
    notify("Endereço de mídia não suportado");
    return;
  }
  RadioStation st;
  memset(&st, 0, sizeof(st));
  snprintf(st.name, sizeof(st.name), "%.127s", it->title[0] ? it->title : "Stream");
  snprintf(st.url, sizeof(st.url), "%.511s", it->url);
  snprintf(st.country, sizeof(st.country), "%s", fm_ml_is_radio ? "Rádio" : "Playlist M3U8");
  snprintf(st.codec, sizeof(st.codec), "%s", it->is_video ? "HLS/M3U8" : "STREAM");
  st.is_iptv = it->is_video;
  fm_return_on_exit = true;
  radio_start_async(st);
  notify(it->is_video ? "Conectando canal da playlist..." : "Sintonizando rádio...");
}

static void fm_open_exec_modal(const char *path, const char *name, bool is_script) {
  snprintf(fm_exec_modal_path, sizeof(fm_exec_modal_path), "%s", path);
  snprintf(fm_exec_modal_name, sizeof(fm_exec_modal_name), "%.255s", name);
  fm_exec_modal_is_script = is_script;
  fm_exec_modal_cursor = 0;
  fm_modal = FM_MODAL_EXEC;
}

/* Action menu list builder */
enum {
  FM_ACT_OPEN = 0,
  FM_ACT_EXTRACT_HERE = 1,
  FM_ACT_EXTRACT_FOLDER = 2,
  FM_ACT_COPY = 3,
  FM_ACT_MOVE = 4,
  FM_ACT_PASTE = 5,
  FM_ACT_COMPRESS = 6,
  FM_ACT_MKDIR = 7,
  FM_ACT_RENAME = 8,
  FM_ACT_DELETE = 9,
  FM_ACT_ROOTS = 10,
  FM_ACT_HIDDEN = 11,
  FM_ACT_EDIT_TEXT = 12,
  FM_ACT_EXEC_RUN = 13,
  FM_ACT_PLAY_MEDIA = 14,
  FM_ACT_OPEN_PLAYLIST = 15
};

static int fm_build_actions(int *out_ids, int max_n) {
  int n = 0;
  FmEntry *cur = (fm_cursor >= 0 && fm_cursor < fm_count) ? &fm_entries[fm_cursor] : NULL;
  bool valid_item = cur && strcmp(cur->name, "..") != 0;
  if (valid_item && !cur->is_dir) {
    if (cur->is_script || cur->is_executable) {
      if (n < max_n) out_ids[n++] = FM_ACT_EXEC_RUN;
    }
    if (cur->is_playlist || cur->is_radio) {
      if (n < max_n) out_ids[n++] = FM_ACT_OPEN_PLAYLIST;
    }
    if (supported(cur->name)) {
      if (n < max_n) out_ids[n++] = FM_ACT_PLAY_MEDIA;
    }
    if (!cur->is_archive && !cur->is_executable && !supported(cur->name)) {
      if (n < max_n) out_ids[n++] = FM_ACT_EDIT_TEXT;
    }
    if (cur->is_archive && n < max_n) {
      out_ids[n++] = FM_ACT_OPEN;
      if (n < max_n) out_ids[n++] = FM_ACT_EXTRACT_HERE;
      if (n < max_n) out_ids[n++] = FM_ACT_EXTRACT_FOLDER;
    }
  }
  if (fm_clip_count > 0 && n < max_n)
    out_ids[n++] = FM_ACT_PASTE;
  if ((valid_item || fm_selected_count() > 0) && n < max_n) {
    out_ids[n++] = FM_ACT_COPY;
    if (n < max_n) out_ids[n++] = FM_ACT_MOVE;
    if (n < max_n) out_ids[n++] = FM_ACT_COMPRESS;
  }
  if (n < max_n) out_ids[n++] = FM_ACT_MKDIR;
  if (valid_item && n < max_n) out_ids[n++] = FM_ACT_RENAME;
  if ((valid_item || fm_selected_count() > 0) && n < max_n)
    out_ids[n++] = FM_ACT_DELETE;
  if (n < max_n) out_ids[n++] = FM_ACT_ROOTS;
  if (n < max_n) out_ids[n++] = FM_ACT_HIDDEN;
  return n;
}

static const char *fm_action_label(int id) {
  switch (id) {
  case FM_ACT_EXEC_RUN: return "Executar script (.sh) / EmulationStation";
  case FM_ACT_EDIT_TEXT: return "Editar no Editor de Texto";
  case FM_ACT_PLAY_MEDIA: return "Reproduzir mídia (Vídeo / Música)";
  case FM_ACT_OPEN_PLAYLIST: return "Abrir playlist (.m3u8) / Rádio";
  case FM_ACT_OPEN: return "Abrir conteúdo compactado";
  case FM_ACT_EXTRACT_HERE: return "Descompactar aqui (7-Zip / ZIP)";
  case FM_ACT_EXTRACT_FOLDER: return "Descompactar em subpasta";
  case FM_ACT_COPY: return "Copiar selecionado(s)";
  case FM_ACT_MOVE: return "Mover / Recortar selecionado(s)";
  case FM_ACT_PASTE: return fm_clip_move ? "Colar aqui (Mover)" : "Colar aqui (Copiar)";
  case FM_ACT_COMPRESS: return "Compactar em .ZIP";
  case FM_ACT_MKDIR: return "Criar nova pasta";
  case FM_ACT_RENAME: return "Renomear item";
  case FM_ACT_DELETE: return "Apagar selecionado(s)";
  case FM_ACT_ROOTS: return "Atalhos de pastas (/ , SD1, SD2)";
  case FM_ACT_HIDDEN: return fm_show_hidden ? "Ocultar arquivos ocultos (.*)" : "Mostrar arquivos ocultos (.*)";
  default: return "";
  }
}

static void fm_exec_action(int id) {
  FmEntry *cur = (fm_cursor >= 0 && fm_cursor < fm_count) ? &fm_entries[fm_cursor] : NULL;
  fm_modal = FM_MODAL_NONE;
  if (id == FM_ACT_EXEC_RUN && cur && !cur->is_dir) {
    fm_open_exec_modal(cur->path, cur->name, cur->is_script);
  } else if (id == FM_ACT_EDIT_TEXT && cur && !cur->is_dir) {
    fm_ed_open(cur->path, cur->name);
  } else if (id == FM_ACT_PLAY_MEDIA && cur && !cur->is_dir) {
    fm_return_on_exit = true;
    play_path(cur->path);
  } else if (id == FM_ACT_OPEN_PLAYLIST && cur && !cur->is_dir) {
    fm_parse_media_list(cur->path, cur->name, cur->is_radio);
  } else if (id == FM_ACT_OPEN && cur && cur->is_archive) {
    fm_open_archive_entry(cur->path, cur->name, "");
  } else if (id == FM_ACT_EXTRACT_HERE && cur && cur->is_archive) {
    fm_begin_extract(cur->path, fm_cwd, "");
  } else if (id == FM_ACT_EXTRACT_FOLDER && cur && cur->is_archive) {
    char sub[PATH_MAX];
    fm_make_extract_subdir(cur->name, sub, sizeof(sub));
    fm_begin_extract(cur->path, sub, "");
  } else if (id == FM_ACT_COPY) {
    fm_stage_clipboard(false);
  } else if (id == FM_ACT_MOVE) {
    fm_stage_clipboard(true);
  } else if (id == FM_ACT_PASTE) {
    fm_paste_here();
  } else if (id == FM_ACT_COMPRESS) {
    const char *targets[FM_MAX_CLIP];
    int n = fm_gather_targets(targets, FM_MAX_CLIP);
    if (n <= 0) { notify("Selecione ao menos um item"); return; }
    char zip_out[PATH_MAX];
    const char *base_nm = (n == 1 && cur) ? cur->name : "arquivo_kplayer";
    if (strcmp(fm_cwd, "/") == 0)
      snprintf(zip_out, sizeof(zip_out), "/%.200s.zip", base_nm);
    else
      snprintf(zip_out, sizeof(zip_out), "%.3800s/%.200s.zip", fm_cwd, base_nm);
    fm_start_async_job("Compactando ZIP", "compress", zip_out, targets, n, NULL, false, false);
  } else if (id == FM_ACT_MKDIR) {
    fm_open_keyboard(FM_KB_MKDIR, "Nova pasta", "Digite o nome da nova pasta", "", false);
  } else if (id == FM_ACT_RENAME && cur && strcmp(cur->name, "..") != 0) {
    if (fm_is_protected_path(cur->path)) {
      notify("Pasta protegida do sistema não pode ser renomeada");
      return;
    }
    snprintf(fm_rename_target, sizeof(fm_rename_target), "%s", cur->path);
    fm_open_keyboard(FM_KB_RENAME, "Renomear", "Edite o novo nome do arquivo ou pasta", cur->name, false);
  } else if (id == FM_ACT_DELETE) {
    const char *targets[FM_MAX_CLIP];
    int n = fm_gather_targets(targets, FM_MAX_CLIP);
    if (n <= 0) { notify("Nada selecionado para apagar"); return; }
    for (int i = 0; i < n; i++) {
      if (fm_is_protected_path(targets[i])) {
        notify("Bloqueado: pasta crítica do sistema não pode ser apagada");
        return;
      }
    }
    fm_modal = FM_MODAL_DELETE_CONFIRM;
  } else if (id == FM_ACT_ROOTS) {
    fm_root_cursor = 0;
    fm_modal = FM_MODAL_ROOTS;
  } else if (id == FM_ACT_HIDDEN) {
    fm_show_hidden = !fm_show_hidden;
    fm_scan_dir(fm_cwd);
    notify(fm_show_hidden ? "Mostrando arquivos ocultos" : "Arquivos ocultos escondidos");
  }
}

static void fm_kb_submit(void) {
  if (fm_kb_purpose == FM_KB_MKDIR) {
    if (!fm_kb_buf[0] || strchr(fm_kb_buf, '/') || strcmp(fm_kb_buf, ".") == 0 ||
        strcmp(fm_kb_buf, "..") == 0) {
      notify("Nome de pasta inválido");
      return;
    }
    char full[PATH_MAX];
    int n = strcmp(fm_cwd, "/") == 0
                ? snprintf(full, sizeof(full), "/%s", fm_kb_buf)
                : snprintf(full, sizeof(full), "%s/%s", fm_cwd, fm_kb_buf);
    if (n < 0 || n >= (int)sizeof(full)) { notify("Caminho muito longo"); return; }
    if (mkdir(full, 0755) == 0) {
      fm_modal = FM_MODAL_NONE;
      fm_scan_dir(fm_cwd);
      notify("Pasta criada com sucesso");
    } else {
      notify(errno == EEXIST ? "Já existe uma pasta com este nome" : "Falha ao criar pasta");
    }
  } else if (fm_kb_purpose == FM_KB_RENAME) {
    if (!fm_kb_buf[0] || strchr(fm_kb_buf, '/') || strcmp(fm_kb_buf, ".") == 0 ||
        strcmp(fm_kb_buf, "..") == 0) {
      notify("Novo nome inválido");
      return;
    }
    char full[PATH_MAX];
    int n = strcmp(fm_cwd, "/") == 0
                ? snprintf(full, sizeof(full), "/%s", fm_kb_buf)
                : snprintf(full, sizeof(full), "%s/%s", fm_cwd, fm_kb_buf);
    if (n < 0 || n >= (int)sizeof(full)) { notify("Caminho muito longo"); return; }
    if (rename(fm_rename_target, full) == 0) {
      fm_modal = FM_MODAL_NONE;
      fm_scan_dir(fm_cwd);
      notify("Renomeado com sucesso");
    } else {
      notify("Não foi possível renomear (verifique permissões)");
    }
  } else if (fm_kb_purpose == FM_KB_PASSWORD_OPEN) {
    char pwd[128];
    snprintf(pwd, sizeof(pwd), "%.127s", fm_kb_buf);
    memset(fm_kb_buf, 0, sizeof(fm_kb_buf));
    fm_modal = FM_MODAL_NONE;
    fm_open_archive_entry(fm_pending_arc_path, fm_arc_name, pwd);
    memset(pwd, 0, sizeof(pwd));
  } else if (fm_kb_purpose == FM_KB_PASSWORD_EXTRACT) {
    char pwd[128];
    snprintf(pwd, sizeof(pwd), "%.127s", fm_kb_buf);
    memset(fm_kb_buf, 0, sizeof(fm_kb_buf));
    fm_modal = FM_MODAL_NONE;
    fm_begin_extract(fm_pending_arc_path, fm_pending_extract_dest, pwd);
    memset(pwd, 0, sizeof(pwd));
  } else if (fm_kb_purpose == FM_KB_EDIT_LINE) {
    fm_ed_replace_line(fm_ed_cursor, fm_kb_buf);
    memset(fm_kb_buf, 0, sizeof(fm_kb_buf));
    fm_modal = FM_MODAL_NONE;
  } else if (fm_kb_purpose == FM_KB_NEW_LINE) {
    fm_ed_insert_line(fm_ed_cursor, fm_kb_buf);
    memset(fm_kb_buf, 0, sizeof(fm_kb_buf));
    fm_modal = FM_MODAL_NONE;
  }
}

static void fm_kb_key(SDL_Keycode k) {
  size_t len = strlen(fm_kb_buf);
  if (k == SDLK_UP) {
    fm_kb_row = (fm_kb_row + 4) % 5;
    if (fm_kb_row == 0 && fm_kb_col > 3) fm_kb_col = 3;
  } else if (k == SDLK_DOWN) {
    fm_kb_row = (fm_kb_row + 1) % 5;
    if (fm_kb_row == 0 && fm_kb_col > 3) fm_kb_col = 3;
  } else if (k == SDLK_LEFT) {
    int cols = (fm_kb_row == 0) ? 4 : 10;
    fm_kb_col = (fm_kb_col + cols - 1) % cols;
  } else if (k == SDLK_RIGHT) {
    int cols = (fm_kb_row == 0) ? 4 : 10;
    fm_kb_col = (fm_kb_col + 1) % cols;
  } else if (k == SDLK_BACKSPACE) {
    if (len > 0) fm_kb_buf[len - 1] = 0;
    else { memset(fm_kb_buf, 0, sizeof(fm_kb_buf)); fm_modal = FM_MODAL_NONE; }
  } else if (k == SDLK_SPACE) {
    if (len + 1 < sizeof(fm_kb_buf)) { fm_kb_buf[len] = ' '; fm_kb_buf[len + 1] = 0; }
  } else if (k == SDLK_q) {
    fm_kb_upper = !fm_kb_upper;
    fm_kb_symbols = false;
  } else if (k == SDLK_e) {
    fm_kb_symbols = !fm_kb_symbols;
  } else if (k == SDLK_m && (fm_kb_purpose == FM_KB_PASSWORD_OPEN || fm_kb_purpose == FM_KB_PASSWORD_EXTRACT)) {
    fm_kb_mask = !fm_kb_mask;
  } else if (k == SDLK_RETURN) {
    if (fm_kb_row == 0) {
      if (fm_kb_col == 0) fm_kb_submit();
      else if (fm_kb_col == 1) { fm_kb_upper = !fm_kb_upper; fm_kb_symbols = false; }
      else if (fm_kb_col == 2) { fm_kb_symbols = !fm_kb_symbols; }
      else { memset(fm_kb_buf, 0, sizeof(fm_kb_buf)); fm_modal = FM_MODAL_NONE; }
    } else {
      const char **rows = fm_kb_symbols ? fm_kb_sym_rows : (fm_kb_upper ? fm_kb_upper_rows : fm_kb_lower_rows);
      char ch = rows[fm_kb_row - 1][fm_kb_col];
      if (len + 1 < sizeof(fm_kb_buf)) {
        fm_kb_buf[len] = ch;
        fm_kb_buf[len + 1] = 0;
      }
    }
  }
}

static void fm_key(SDL_Keycode k, bool repeat) {
  if (fm_modal == FM_MODAL_PROGRESS) {
    if (k == SDLK_BACKSPACE && !repeat) fm_cancel_job();
    return;
  }
  if (fm_modal == FM_MODAL_KEYBOARD) {
    fm_kb_key(k);
    return;
  }
  if (fm_modal == FM_MODAL_EXEC) {
    int opts = fm_exec_modal_is_script ? 3 : 2;
    if (k == SDLK_UP)
      fm_exec_modal_cursor = (fm_exec_modal_cursor + opts - 1) % opts;
    else if (k == SDLK_DOWN)
      fm_exec_modal_cursor = (fm_exec_modal_cursor + 1) % opts;
    else if (k == SDLK_BACKSPACE && !repeat)
      fm_modal = FM_MODAL_NONE;
    else if (k == SDLK_RETURN && !repeat) {
      if (fm_exec_modal_cursor == 0) {
        snprintf(fm_exec_target_path, sizeof(fm_exec_target_path), "%s", fm_exec_modal_path);
        fm_exec_is_script = fm_exec_modal_is_script;
        fm_modal = FM_MODAL_NONE;
        running = 0;
      } else if (fm_exec_modal_is_script && fm_exec_modal_cursor == 1) {
        fm_modal = FM_MODAL_NONE;
        fm_ed_open(fm_exec_modal_path, fm_exec_modal_name);
      } else {
        fm_modal = FM_MODAL_NONE;
      }
    }
    return;
  }
  if (fm_modal == FM_MODAL_EDITOR_MENU) {
    bool is_sh = fm_is_script_name(fm_ed_name);
    int opts = is_sh ? 7 : 6;
    if (k == SDLK_UP) fm_ed_menu_cursor = (fm_ed_menu_cursor + opts - 1) % opts;
    else if (k == SDLK_DOWN) fm_ed_menu_cursor = (fm_ed_menu_cursor + 1) % opts;
    else if ((k == SDLK_BACKSPACE || k == SDLK_SPACE) && !repeat) fm_modal = FM_MODAL_NONE;
    else if (k == SDLK_RETURN && !repeat) {
      int pick = fm_ed_menu_cursor;
      fm_modal = FM_MODAL_NONE;
      if (pick == 0 && fm_ed_count > 0) {
        fm_open_keyboard(FM_KB_EDIT_LINE, "Editar linha", fm_ed_name,
                         fm_ed_lines[fm_ed_cursor], false);
      } else if (pick == 1) {
        fm_open_keyboard(FM_KB_NEW_LINE, "Nova linha abaixo", fm_ed_name, "", false);
      } else if (pick == 2) {
        fm_ed_delete_line(fm_ed_cursor);
        notify("Linha removida");
      } else if (pick == 3) {
        fm_ed_save();
      } else if (pick == 4) {
        if (fm_ed_save()) {
          fm_view = FM_VIEW_BROWSE;
          fm_scan_dir(fm_cwd);
        }
      } else if (is_sh && pick == 5) {
        if (fm_ed_dirty) fm_ed_save();
        fm_open_exec_modal(fm_ed_path, fm_ed_name, true);
      } else {
        fm_ed_dirty = false;
        fm_view = FM_VIEW_BROWSE;
      }
    }
    return;
  }
  if (fm_modal == FM_MODAL_EDITOR_EXIT) {
    if (k == SDLK_UP) fm_ed_exit_cursor = (fm_ed_exit_cursor + 2) % 3;
    else if (k == SDLK_DOWN) fm_ed_exit_cursor = (fm_ed_exit_cursor + 1) % 3;
    else if (k == SDLK_BACKSPACE && !repeat) fm_modal = FM_MODAL_NONE;
    else if (k == SDLK_RETURN && !repeat) {
      int pick = fm_ed_exit_cursor;
      fm_modal = FM_MODAL_NONE;
      if (pick == 0) {
        if (fm_ed_save()) {
          fm_view = FM_VIEW_BROWSE;
          fm_scan_dir(fm_cwd);
        }
      } else if (pick == 1) {
        fm_ed_dirty = false;
        fm_view = FM_VIEW_BROWSE;
      }
    }
    return;
  }
  if (fm_modal == FM_MODAL_DELETE_CONFIRM) {
    if (k == SDLK_BACKSPACE && !repeat) {
      fm_modal = FM_MODAL_NONE;
    } else if (k == SDLK_RETURN && !repeat) {
      const char *targets[FM_MAX_CLIP];
      int n = fm_gather_targets(targets, FM_MAX_CLIP);
      fm_modal = FM_MODAL_NONE;
      if (n > 0) {
        fm_start_async_job("Apagando itens", "delete", NULL, targets, n, NULL, false, false);
        for (int i = 0; i < fm_count; i++) fm_entries[i].selected = false;
      }
    }
    return;
  }
  if (fm_modal == FM_MODAL_ROOTS) {
    if (k == SDLK_UP)
      fm_root_cursor = (fm_root_cursor + FM_QUICK_ROOT_COUNT - 1) % FM_QUICK_ROOT_COUNT;
    else if (k == SDLK_DOWN)
      fm_root_cursor = (fm_root_cursor + 1) % FM_QUICK_ROOT_COUNT;
    else if (k == SDLK_BACKSPACE && !repeat)
      fm_modal = FM_MODAL_NONE;
    else if (k == SDLK_RETURN && !repeat) {
      const char *target = fm_quick_roots[fm_root_cursor].path;
      if (!target[0]) target = fm_app_dir;
      fm_modal = FM_MODAL_NONE;
      fm_view = FM_VIEW_BROWSE;
      fm_cursor = 0;
      if (!fm_scan_dir(target)) notify("Pasta não encontrada neste console");
    }
    return;
  }
  if (fm_modal == FM_MODAL_ACTIONS) {
    int ids[18];
    int cnt = fm_build_actions(ids, 18);
    if (cnt <= 0) { fm_modal = FM_MODAL_NONE; return; }
    if (k == SDLK_UP) fm_action_cursor = (fm_action_cursor + cnt - 1) % cnt;
    else if (k == SDLK_DOWN) fm_action_cursor = (fm_action_cursor + 1) % cnt;
    else if ((k == SDLK_BACKSPACE || k == SDLK_SPACE) && !repeat) fm_modal = FM_MODAL_NONE;
    else if (k == SDLK_RETURN && !repeat) {
      if (fm_action_cursor >= 0 && fm_action_cursor < cnt)
        fm_exec_action(ids[fm_action_cursor]);
    }
    return;
  }

  /* Inside Text Editor (v2.1.3) */
  if (fm_view == FM_VIEW_EDITOR) {
    if (k == SDLK_UP && fm_ed_count > 0)
      fm_ed_cursor = fm_ed_cursor > 0 ? fm_ed_cursor - 1 : fm_ed_count - 1;
    else if (k == SDLK_DOWN && fm_ed_count > 0)
      fm_ed_cursor = (fm_ed_cursor + 1) % fm_ed_count;
    else if ((k == SDLK_q || k == SDLK_PAGEUP) && fm_ed_count > 0)
      fm_ed_cursor = fm_ed_cursor > 10 ? fm_ed_cursor - 10 : 0;
    else if ((k == SDLK_e || k == SDLK_PAGEDOWN) && fm_ed_count > 0)
      fm_ed_cursor = fm_ed_cursor + 10 < fm_ed_count ? fm_ed_cursor + 10 : fm_ed_count - 1;
    else if (k == SDLK_RETURN && !repeat && fm_ed_count > 0) {
      fm_open_keyboard(FM_KB_EDIT_LINE, "Editar linha", fm_ed_name,
                       fm_ed_lines[fm_ed_cursor], false);
    } else if (k == SDLK_m && !repeat) {
      fm_open_keyboard(FM_KB_NEW_LINE, "Nova linha abaixo", fm_ed_name, "", false);
    } else if (k == SDLK_SPACE && !repeat) {
      fm_ed_menu_cursor = 0;
      fm_modal = FM_MODAL_EDITOR_MENU;
    } else if (k == SDLK_BACKSPACE && !repeat) {
      if (fm_ed_dirty) {
        fm_ed_exit_cursor = 0;
        fm_modal = FM_MODAL_EDITOR_EXIT;
      } else {
        fm_view = FM_VIEW_BROWSE;
      }
    }
    return;
  }

  /* Inside Playlist (.m3u8/.m3u) / Radio (.pls/.tsv/.xspf) Viewer (v2.1.3) */
  if (fm_view == FM_VIEW_MEDIA_LIST) {
    if (k == SDLK_UP && fm_ml_count > 0)
      fm_ml_cursor = (fm_ml_cursor + fm_ml_count - 1) % fm_ml_count;
    else if (k == SDLK_DOWN && fm_ml_count > 0)
      fm_ml_cursor = (fm_ml_cursor + 1) % fm_ml_count;
    else if ((k == SDLK_q || k == SDLK_PAGEUP) && fm_ml_count > 0)
      fm_ml_cursor = fm_ml_cursor > 7 ? fm_ml_cursor - 7 : 0;
    else if ((k == SDLK_e || k == SDLK_PAGEDOWN) && fm_ml_count > 0)
      fm_ml_cursor = fm_ml_cursor + 7 < fm_ml_count ? fm_ml_cursor + 7 : fm_ml_count - 1;
    else if (k == SDLK_BACKSPACE && !repeat) {
      fm_view = FM_VIEW_BROWSE;
    } else if (k == SDLK_SPACE && !repeat) {
      fm_ed_open(fm_ml_path, fm_ml_name);
    } else if (k == SDLK_RETURN && !repeat && fm_ml_count > 0 && fm_ml_cursor < fm_ml_count) {
      fm_play_media_item(&fm_ml_items[fm_ml_cursor]);
    }
    return;
  }

  /* Inside Archive Viewer */
  if (fm_view == FM_VIEW_ARCHIVE) {
    if (k == SDLK_UP && fm_arc_count > 0)
      fm_arc_cursor = (fm_arc_cursor + fm_arc_count - 1) % fm_arc_count;
    else if (k == SDLK_DOWN && fm_arc_count > 0)
      fm_arc_cursor = (fm_arc_cursor + 1) % fm_arc_count;
    else if (k == SDLK_PAGEUP && fm_arc_count > 0)
      fm_arc_cursor = fm_arc_cursor > 7 ? fm_arc_cursor - 7 : 0;
    else if (k == SDLK_PAGEDOWN && fm_arc_count > 0)
      fm_arc_cursor = fm_arc_cursor + 7 < fm_arc_count ? fm_arc_cursor + 7 : fm_arc_count - 1;
    else if (k == SDLK_BACKSPACE && !repeat) {
      fm_view = FM_VIEW_BROWSE;
      memset(fm_arc_password, 0, sizeof(fm_arc_password));
    } else if ((k == SDLK_RETURN || k == SDLK_SPACE) && !repeat) {
      /* Extract archive into a dedicated folder inside current dir */
      char sub[PATH_MAX];
      fm_make_extract_subdir(fm_arc_name, sub, sizeof(sub));
      fm_view = FM_VIEW_BROWSE;
      fm_begin_extract(fm_arc_file, sub, fm_arc_password);
      memset(fm_arc_password, 0, sizeof(fm_arc_password));
    } else if (k == SDLK_m && !repeat) {
      /* Extract directly here */
      fm_view = FM_VIEW_BROWSE;
      fm_begin_extract(fm_arc_file, fm_cwd, fm_arc_password);
      memset(fm_arc_password, 0, sizeof(fm_arc_password));
    }
    return;
  }

  /* Normal Directory Browsing */
  if (k == SDLK_UP && fm_count > 0)
    fm_cursor = (fm_cursor + fm_count - 1) % fm_count;
  else if (k == SDLK_DOWN && fm_count > 0)
    fm_cursor = (fm_cursor + 1) % fm_count;
  else if (k == SDLK_PAGEUP && fm_count > 0)
    fm_cursor = fm_cursor > 8 ? fm_cursor - 8 : 0;
  else if (k == SDLK_PAGEDOWN && fm_count > 0)
    fm_cursor = fm_cursor + 8 < fm_count ? fm_cursor + 8 : fm_count - 1;
  else if (k == SDLK_BACKSPACE && !repeat) {
    if (strcmp(fm_cwd, "/") == 0) {
      mode = 3;
    } else {
      char parent[PATH_MAX];
      snprintf(parent, sizeof(parent), "%s", fm_cwd);
      char *sl = strrchr(parent, '/');
      if (sl && sl > parent) *sl = 0;
      else snprintf(parent, sizeof(parent), "/");
      fm_cursor = 0;
      fm_scan_dir(parent);
    }
  } else if (k == SDLK_RETURN && !repeat) {
    if (fm_count > 0 && fm_cursor >= 0 && fm_cursor < fm_count) {
      FmEntry *e = &fm_entries[fm_cursor];
      if (e->is_dir) {
        char next_path[PATH_MAX];
        snprintf(next_path, sizeof(next_path), "%s", e->path);
        fm_cursor = 0;
        fm_scan_dir(next_path);
      } else if (e->is_archive) {
        fm_open_archive_entry(e->path, e->name, "");
      } else if (e->is_script || e->is_executable) {
        fm_open_exec_modal(e->path, e->name, e->is_script);
      } else if (e->is_radio || e->is_playlist) {
        fm_parse_media_list(e->path, e->name, e->is_radio);
      } else if (supported(e->name)) {
        fm_return_on_exit = true;
        play_path(e->path);
      } else if (e->is_text) {
        fm_ed_open(e->path, e->name);
      } else {
        fm_action_cursor = 0;
        fm_modal = FM_MODAL_ACTIONS;
      }
    }
  } else if (k == SDLK_SPACE && !repeat) {
    fm_action_cursor = 0;
    fm_modal = FM_MODAL_ACTIONS;
  } else if (k == SDLK_m && !repeat) {
    if (fm_count > 0 && fm_cursor >= 0 && fm_cursor < fm_count &&
        strcmp(fm_entries[fm_cursor].name, "..") != 0) {
      fm_entries[fm_cursor].selected = !fm_entries[fm_cursor].selected;
      if (fm_cursor + 1 < fm_count) fm_cursor++;
    }
  } else if (k == SDLK_q && !repeat) {
    fm_root_cursor = 0;
    fm_modal = FM_MODAL_ROOTS;
  } else if (k == SDLK_e && !repeat) {
    if (fm_clip_count > 0) fm_paste_here();
    else if (active) mode = playing_audio ? 4 : 1;
    else notify("Use X para copiar/mover e R1 para colar");
  }
}

static void draw_file_manager_keyboard(void) {
  backdrop();
  draw_header("ARQUIVOS • TECLADO");
  label(fm_kb_title, 24, 42, 21, textc, 592);
  label(fm_kb_sub, 24, 68, 12, muted, 592);

  panel_card(24, 92, 592, 44, 12);
  char shown[180];
  if (fm_kb_mask && fm_kb_buf[0]) {
    size_t n = strlen(fm_kb_buf);
    if (n > 48) n = 48;
    for (size_t i = 0; i < n; i++) shown[i] = '*';
    shown[n] = '_';
    shown[n + 1] = 0;
  } else if (fm_kb_buf[0]) {
    snprintf(shown, sizeof(shown), "%.140s_", fm_kb_buf);
  } else {
    snprintf(shown, sizeof(shown), "Digite aqui..._");
  }
  label(shown, 40, 104, 17, fm_kb_buf[0] ? textc : muted, 560);

  const char *acts[4] = {
      "Confirmar",
      fm_kb_upper ? "minusc." : "MAIUSC.",
      fm_kb_symbols ? "ABC" : "!@#",
      "Cancelar"
  };
  for (int i = 0; i < 4; i++) {
    bool focus = (fm_kb_row == 0 && fm_kb_col == i);
    card(24 + i * 150, 146, 142, 36, 10, focus, panel);
    centered(acts[i], 24 + i * 150, 155, 142, 13, focus ? accent : textc);
  }

  const char **rows = fm_kb_symbols ? fm_kb_sym_rows : (fm_kb_upper ? fm_kb_upper_rows : fm_kb_lower_rows);
  for (int r = 0; r < 4; r++) {
    int y = 194 + r * 54;
    for (int c = 0; c < 10; c++) {
      int x = 24 + c * 60;
      bool focus = (fm_kb_row == r + 1 && fm_kb_col == c);
      card(x, y, 54, 46, 10, focus, panel);
      char ch[4];
      char raw = rows[r][c];
      if (raw == ' ') snprintf(ch, sizeof(ch), "ESP");
      else { ch[0] = raw; ch[1] = 0; }
      centered(ch, x, y + 13, 54, raw == ' ' ? 11 : 17, focus ? accent : textc);
    }
  }
  char tip[128];
  snprintf(tip, sizeof(tip),
           "B digita • A apaga/fecha • L1 MAIUSC • R1 Símbolos%s",
           (fm_kb_purpose == FM_KB_PASSWORD_OPEN || fm_kb_purpose == FM_KB_PASSWORD_EXTRACT)
               ? " • Y mostrar senha" : "");
  centered(tip, 20, 424, W - 40, 11, muted);
}

static void draw_file_manager(void) {
  if (fm_modal == FM_MODAL_KEYBOARD) {
    draw_file_manager_keyboard();
    return;
  }

  backdrop();
  draw_header(fm_view == FM_VIEW_ARCHIVE ? "ARQUIVO COMPACTADO (7-ZIP)"
              : fm_view == FM_VIEW_EDITOR ? "EDITOR DE TEXTO"
              : fm_view == FM_VIEW_MEDIA_LIST ? (fm_ml_is_radio ? "ARQUIVO DE RÁDIO" : "PLAYLIST M3U8")
                                              : "GERENCIADOR DE ARQUIVOS");

  if (fm_view == FM_VIEW_EDITOR) {
    char title_buf[160];
    snprintf(title_buf, sizeof(title_buf), "%.90s%s", fm_ed_name, fm_ed_dirty ? " *" : "");
    label(title_buf, 24, 42, 19, textc, 456);
    char meta[128];
    snprintf(meta, sizeof(meta), "Linha %d/%d • %s",
             fm_ed_count > 0 ? fm_ed_cursor + 1 : 0, fm_ed_count,
             fm_ed_dirty ? "Alterações não salvas" : "Salvo");
    label(meta, 24, 68, 12, fm_ed_dirty ? (SDL_Color){251, 191, 36, 255} : muted, 592);

    panel_card(24, 92, 592, 328, 12);
    int visible = 10;
    if (fm_ed_cursor < fm_ed_scroll) fm_ed_scroll = fm_ed_cursor;
    if (fm_ed_cursor >= fm_ed_scroll + visible) fm_ed_scroll = fm_ed_cursor - visible + 1;
    if (fm_ed_scroll < 0) fm_ed_scroll = 0;

    for (int i = 0; i < visible && fm_ed_scroll + i < fm_ed_count; i++) {
      int idx = fm_ed_scroll + i;
      int ry = 100 + i * 31;
      bool focus = (idx == fm_ed_cursor);
      if (focus) {
        rounded_gradient(32, ry, 576, 28, 7, mix(elevated, accent, 0.24f), panel);
        rounded_outline(32, ry, 576, 28, 7, accent);
      }
      char ln[16];
      snprintf(ln, sizeof(ln), "%4d", idx + 1);
      label(ln, 40, ry + 7, 11, focus ? accent : muted, 42);
      const char *txt = fm_ed_lines[idx] ? fm_ed_lines[idx] : "";
      label(txt[0] ? txt : " ", 86, ry + 6, 13, focus ? textc : mix(textc, muted, 0.14f), 514);
    }
    centered("B Editar linha • Y Nova linha • X Salvar/Menu • L1/R1 Página • A Sair",
             20, 434, W - 40, 11, muted);
  } else if (fm_view == FM_VIEW_MEDIA_LIST) {
    char title_buf[140];
    snprintf(title_buf, sizeof(title_buf), "%.90s", fm_ml_name);
    label(title_buf, 24, 42, 20, textc, 456);
    char meta[96];
    snprintf(meta, sizeof(meta), "%d itens • %s",
             fm_ml_count, fm_ml_is_radio ? "Estações de Rádio" : "Playlist de Mídia / M3U8");
    label(meta, 24, 68, 12, accent, 592);

    panel_card(24, 92, 592, 326, 12);
    int visible = 8;
    if (fm_ml_cursor < fm_ml_scroll) fm_ml_scroll = fm_ml_cursor;
    if (fm_ml_cursor >= fm_ml_scroll + visible) fm_ml_scroll = fm_ml_cursor - visible + 1;
    if (fm_ml_scroll < 0) fm_ml_scroll = 0;

    for (int i = 0; i < visible && fm_ml_scroll + i < fm_ml_count; i++) {
      int idx = fm_ml_scroll + i;
      FmMediaItem *it = &fm_ml_items[idx];
      int ry = 102 + i * 38;
      bool focus = (idx == fm_ml_cursor);
      if (focus) {
        rounded_gradient(32, ry, 576, 34, 9, mix(elevated, accent, 0.24f), panel);
        rounded_outline(32, ry, 576, 34, 9, accent);
      }
      label(it->is_local ? (it->is_video ? "VÍDEO" : "ÁUDIO")
                         : (it->is_video ? "M3U8" : "RÁDIO"),
            42, ry + 10, 10, accent, 54);
      label(it->title, 100, ry + 9, 13, focus ? textc : mix(textc, muted, 0.14f), 496);
    }
    centered("B Reproduzir selecionado • X Abrir no Editor de Texto • A Voltar",
             20, 434, W - 40, 12, muted);
  } else if (fm_view == FM_VIEW_ARCHIVE) {
    char title_buf[140];
    snprintf(title_buf, sizeof(title_buf), "%.80s", fm_arc_name);
    label(title_buf, 24, 42, 20, textc, 430);
    char meta[96];
    snprintf(meta, sizeof(meta), "%d itens • %s%s",
             fm_arc_count,
             fm_arc_engine[0] ? fm_arc_engine : "7-Zip",
             fm_arc_encrypted ? " • Protegido por senha" : "");
    label(meta, 24, 68, 12, fm_arc_encrypted ? (SDL_Color){251, 191, 36, 255} : muted, 592);

    panel_card(24, 92, 592, 326, 12);
    int visible = 8;
    if (fm_arc_cursor < fm_arc_scroll) fm_arc_scroll = fm_arc_cursor;
    if (fm_arc_cursor >= fm_arc_scroll + visible) fm_arc_scroll = fm_arc_cursor - visible + 1;
    if (fm_arc_count == 0) {
      centered("Nenhum item encontrado neste arquivo.", 40, 232, 560, 14, muted);
    } else {
      for (int i = 0; i < visible && fm_arc_scroll + i < fm_arc_count; i++) {
        int idx = fm_arc_scroll + i;
        FmArcEntry *ae = &fm_arc_entries[idx];
        int ry = 102 + i * 38;
        bool focus = (idx == fm_arc_cursor);
        if (focus) {
          rounded_gradient(32, ry, 576, 34, 9, mix(elevated, accent, 0.24f), panel);
          rounded_outline(32, ry, 576, 34, 9, accent);
        }
        label(ae->is_dir ? "[DIR]" : (ae->encrypted ? "[KEY]" : "[ARQ]"),
              42, ry + 10, 11,
              ae->is_dir ? accent : (ae->encrypted ? (SDL_Color){251, 191, 36, 255} : muted), 50);
        label(ae->path, 96, ry + 9, 13, focus ? textc : mix(textc, muted, 0.15f), 400);
        if (!ae->is_dir) {
          char sz[32];
          fm_format_bytes(ae->size, sz, sizeof(sz));
          int sw = (int)measure(sz, 11);
          label(sz, 598 - sw, ry + 10, 11, muted, 96);
        }
      }
    }
    centered("B/X Extrair em subpasta • Y Extrair aqui • A Voltar", 20, 434, W - 40, 12, muted);
  } else {
    /* Top path bar + clipboard status */
    label(fm_cwd, 24, 42, 18, textc, 456);
    int sel_n = fm_selected_count();
    char sub[160];
    if (fm_clip_count > 0)
      snprintf(sub, sizeof(sub), "%d itens • Área de transf.: %d (%s) • R1 Colar",
               fm_count, fm_clip_count, fm_clip_move ? "Mover" : "Copiar");
    else if (sel_n > 0)
      snprintf(sub, sizeof(sub), "%d itens • %d marcado(s) • X Ações • L1 Raízes",
               fm_count, sel_n);
    else
      snprintf(sub, sizeof(sub), "%d itens • B Abrir/Editar/Tocar • X Ações • Y Marcar",
               fm_count);
    label(sub, 24, 67, 12, fm_clip_count > 0 ? accent : muted, 592);

    panel_card(24, 90, 592, 336, 12);
    int visible = 8;
    if (fm_cursor < fm_scroll) fm_scroll = fm_cursor;
    if (fm_cursor >= fm_scroll + visible) fm_scroll = fm_cursor - visible + 1;
    if (fm_scroll < 0) fm_scroll = 0;

    if (fm_error[0]) {
      centered(fm_error, 40, 236, 560, 14, muted);
    } else if (fm_count == 0) {
      centered("Pasta vazia — pressione X para criar pasta ou colar", 40, 236, 560, 14, muted);
    } else {
      for (int i = 0; i < visible && fm_scroll + i < fm_count; i++) {
        int idx = fm_scroll + i;
        FmEntry *e = &fm_entries[idx];
        int ry = 98 + i * 40;
        bool focus = (idx == fm_cursor);
        if (focus) {
          rounded_gradient(32, ry, 576, 36, 9, mix(elevated, accent, 0.24f), panel);
          rounded_outline(32, ry, 576, 36, 9, accent);
        } else if (e->selected) {
          rounded(32, ry, 576, 36, 9, mix(panel, accent, 0.14f));
        }

        const char *tag = fm_file_badge(e);
        SDL_Color tag_c = e->selected ? accent
                         : (e->is_dir ? accent
                         : (e->is_archive ? (SDL_Color){251, 191, 36, 255}
                         : ((e->is_script || e->is_executable) ? (SDL_Color){74, 222, 128, 255}
                         : ((e->is_playlist || e->is_radio) ? accent : muted))));
        if (e->selected) {
          label("[✓]", 40, ry + 10, 12, accent, 30);
          label(tag, 70, ry + 11, 10, tag_c, 52);
          label(e->name, 126, ry + 10, 14, textc, 376);
        } else {
          label(tag, 42, ry + 11, 10, tag_c, 56);
          label(e->name, 102, ry + 10, 14, focus ? textc : mix(textc, muted, 0.12f), 400);
        }
        if (!e->is_dir) {
          char sz[32];
          fm_format_bytes(e->size, sz, sizeof(sz));
          int sw = (int)measure(sz, 11);
          label(sz, 598 - sw, ry + 11, 11, muted, 96);
        }
      }
    }
    centered("B Abrir/Editor/.sh/Mídia • X Ações • Y Selecionar • L1 Raiz/SD • A Voltar",
             20, 438, W - 40, 11, muted);
  }

  /* Overlay modals */
  if (fm_modal == FM_MODAL_ACTIONS) {
    int ids[18];
    int cnt = fm_build_actions(ids, 18);
    SDL_Color scrim = {0, 0, 0, 175};
    rect(0, 0, W, H, scrim);
    int mh = 58 + cnt * 32;
    if (mh > 410) mh = 410;
    int my = (H - mh) / 2;
    rounded_gradient(110, my, 420, mh, 14, elevated, panel);
    rounded_outline(110, my, 420, mh, 14, accent);
    label("Ações do Gerenciador de Arquivos", 128, my + 14, 15, textc, 384);
    int max_vis = (mh - 56) / 32;
    int a_off = 0;
    if (fm_action_cursor >= max_vis) a_off = fm_action_cursor - max_vis + 1;
    for (int i = 0; i < max_vis && a_off + i < cnt; i++) {
      int idx = a_off + i;
      bool foc = (idx == fm_action_cursor);
      int iy = my + 44 + i * 32;
      if (foc) {
        rounded_gradient(122, iy, 396, 28, 8, mix(elevated, accent, 0.28f), panel);
        rounded_outline(122, iy, 396, 28, 8, accent);
      }
      bool danger = (ids[idx] == FM_ACT_DELETE);
      SDL_Color tc = danger ? (SDL_Color){255, 130, 130, 255} : (foc ? textc : muted);
      label(fm_action_label(ids[idx]), 134, iy + 6, 13, tc, 372);
    }
  } else if (fm_modal == FM_MODAL_EXEC) {
    SDL_Color scrim = {0, 0, 0, 185};
    rect(0, 0, W, H, scrim);
    int opts = fm_exec_modal_is_script ? 3 : 2;
    int mh = 114 + opts * 38;
    int my = (H - mh) / 2;
    rounded_gradient(86, my, 468, mh, 14, elevated, panel);
    rounded_outline(86, my, 468, mh, 14, accent);
    label(fm_exec_modal_is_script ? "Script de Jogo / R36S (.sh)" : "Executável / EmulationStation",
          106, my + 16, 16, accent, 428);
    char ename[140];
    snprintf(ename, sizeof(ename), "%.96s", fm_exec_modal_name);
    label(ename, 106, my + 42, 13, textc, 428);
    label("Fecha o KPlayer com segurança para liberar tela e áudio no R36S.",
          106, my + 64, 11, muted, 428);
    const char *sh_labels[3] = {
        "Executar script (.sh) no console",
        "Abrir no Editor de Texto",
        "Cancelar"
    };
    const char *bin_labels[2] = {
        "Executar programa / EmulationStation",
        "Cancelar"
    };
    for (int i = 0; i < opts; i++) {
      bool foc = (i == fm_exec_modal_cursor);
      int iy = my + 92 + i * 38;
      if (foc) {
        rounded_gradient(104, iy, 432, 32, 8, mix(elevated, accent, 0.28f), panel);
        rounded_outline(104, iy, 432, 32, 8, accent);
      }
      label(fm_exec_modal_is_script ? sh_labels[i] : bin_labels[i],
            118, iy + 8, 13, foc ? textc : muted, 404);
    }
  } else if (fm_modal == FM_MODAL_EDITOR_MENU) {
    SDL_Color scrim = {0, 0, 0, 175};
    rect(0, 0, W, H, scrim);
    bool is_sh = fm_is_script_name(fm_ed_name);
    int opts = is_sh ? 7 : 6;
    const char *labels_sh[7] = {
        "Editar linha atual",
        "Inserir nova linha abaixo",
        "Apagar linha atual",
        "Salvar arquivo",
        "Salvar e sair",
        "Executar script (.sh) no console",
        "Sair sem salvar"
    };
    const char *labels_txt[6] = {
        "Editar linha atual",
        "Inserir nova linha abaixo",
        "Apagar linha atual",
        "Salvar arquivo",
        "Salvar e sair",
        "Sair sem salvar"
    };
    int mh = 58 + opts * 32;
    int my = (H - mh) / 2;
    rounded_gradient(110, my, 420, mh, 14, elevated, panel);
    rounded_outline(110, my, 420, mh, 14, accent);
    label("Menu do Editor de Texto", 128, my + 14, 15, textc, 384);
    for (int i = 0; i < opts; i++) {
      bool foc = (i == fm_ed_menu_cursor);
      int iy = my + 44 + i * 32;
      if (foc) {
        rounded_gradient(122, iy, 396, 28, 8, mix(elevated, accent, 0.28f), panel);
        rounded_outline(122, iy, 396, 28, 8, accent);
      }
      label(is_sh ? labels_sh[i] : labels_txt[i], 134, iy + 6, 13, foc ? textc : muted, 372);
    }
  } else if (fm_modal == FM_MODAL_EDITOR_EXIT) {
    SDL_Color scrim = {0, 0, 0, 185};
    rect(0, 0, W, H, scrim);
    int mh = 196;
    int my = (H - mh) / 2;
    rounded_gradient(104, my, 432, mh, 14, elevated, panel);
    rounded_outline(104, my, 432, mh, 14, accent);
    label("Alterações não salvas", 124, my + 18, 16, textc, 392);
    label("Deseja salvar antes de fechar o editor?", 124, my + 44, 12, muted, 392);
    const char *elabels[3] = {"Salvar e sair", "Sair sem salvar", "Continuar editando"};
    for (int i = 0; i < 3; i++) {
      bool foc = (i == fm_ed_exit_cursor);
      int iy = my + 74 + i * 36;
      if (foc) {
        rounded_gradient(120, iy, 400, 30, 8, mix(elevated, accent, 0.28f), panel);
        rounded_outline(120, iy, 400, 30, 8, accent);
      }
      label(elabels[i], 134, iy + 7, 13, foc ? textc : muted, 372);
    }
  } else if (fm_modal == FM_MODAL_ROOTS) {
    SDL_Color scrim = {0, 0, 0, 175};
    rect(0, 0, W, H, scrim);
    int mh = 64 + FM_QUICK_ROOT_COUNT * 34;
    int my = (H - mh) / 2;
    rounded_gradient(110, my, 420, mh, 14, elevated, panel);
    rounded_outline(110, my, 420, mh, 14, accent);
    label("Ir para pasta do console", 128, my + 14, 15, textc, 384);
    for (int i = 0; i < FM_QUICK_ROOT_COUNT; i++) {
      bool foc = (i == fm_root_cursor);
      int iy = my + 46 + i * 34;
      if (foc) {
        rounded_gradient(122, iy, 396, 30, 8, mix(elevated, accent, 0.28f), panel);
        rounded_outline(122, iy, 396, 30, 8, accent);
      }
      label(fm_quick_roots[i].label, 134, iy + 7, 13, foc ? textc : muted, 372);
    }
  } else if (fm_modal == FM_MODAL_DELETE_CONFIRM) {
    SDL_Color scrim = {0, 0, 0, 185};
    rect(0, 0, W, H, scrim);
    rounded_gradient(96, 140, 448, 196, 14, elevated, panel);
    rounded_outline(96, 140, 448, 196, 14, (SDL_Color){248, 113, 113, 255});
    label("Confirmar exclusão permanente", 118, 160, 17, (SDL_Color){252, 165, 165, 255}, 404);
    int sel_n = fm_selected_count();
    char desc[160];
    if (sel_n > 0)
      snprintf(desc, sizeof(desc), "Apagar %d item(ns) marcado(s)? Esta ação não pode ser desfeita.", sel_n);
    else if (fm_cursor >= 0 && fm_cursor < fm_count)
      snprintf(desc, sizeof(desc), "Apagar \"%.90s\"? Esta ação não pode ser desfeita.", fm_entries[fm_cursor].name);
    else
      snprintf(desc, sizeof(desc), "Apagar item selecionado?");
    label(desc, 118, 198, 13, textc, 404);
    centered("B Confirmar exclusão   •   A Cancelar", 118, 286, 404, 14, accent);
  } else if (fm_modal == FM_MODAL_PROGRESS) {
    pthread_mutex_lock(&fm_job_mutex);
    float pct = fm_job_pct;
    long long bdone = fm_job_bytes_done, btot = fm_job_bytes_total, spd = fm_job_speed_bps;
    int eta = fm_job_eta_sec, idone = fm_job_items_done, itot = fm_job_items_total;
    char op[64], curf[192], msg[224];
    snprintf(op, sizeof(op), "%.63s", fm_job_op);
    snprintf(curf, sizeof(curf), "%.191s", fm_job_cur_file);
    snprintf(msg, sizeof(msg), "%.223s", fm_job_message);
    pthread_mutex_unlock(&fm_job_mutex);

    SDL_Color scrim = {0, 0, 0, 185};
    rect(0, 0, W, H, scrim);
    rounded_gradient(64, 118, 512, 240, 16, elevated, panel);
    rounded_outline(64, 118, 512, 240, 16, accent);

    label(op[0] ? op : "Processando...", 88, 138, 18, textc, 360);
    char pct_txt[20];
    snprintf(pct_txt, sizeof(pct_txt), "%.1f%%", pct);
    int pw = (int)measure(pct_txt, 18);
    label(pct_txt, 552 - pw, 138, 18, accent, 84);

    label(curf[0] ? curf : msg, 88, 170, 13, muted, 464);

    /* Smooth progress bar */
    int bx = 88, by = 202, bw = 464, bh = 16;
    rounded(bx, by, bw, bh, 8, track_color());
    int fw = (int)((float)bw * (pct / 100.0f));
    if (fw < 14 && pct > 0.5f) fw = 14;
    if (fw > bw) fw = bw;
    if (fw > 0) rounded(bx, by, fw, bh, 8, accent);

    char s_done[32], s_tot[32], s_spd[32], s_eta[32];
    fm_format_bytes(bdone, s_done, sizeof(s_done));
    fm_format_bytes(btot, s_tot, sizeof(s_tot));
    fm_format_speed(spd, s_spd, sizeof(s_spd));
    fm_format_eta(eta, s_eta, sizeof(s_eta));

    char metrics1[140], metrics2[140];
    snprintf(metrics1, sizeof(metrics1), "Velocidade: %s    •    Tempo restante: %s", s_spd, s_eta);
    snprintf(metrics2, sizeof(metrics2), "Transferido: %s / %s    •    Itens: %d/%d",
             s_done, s_tot, idone, itot > 0 ? itot : 1);
    label(metrics1, 88, 236, 13, textc, 464);
    label(metrics2, 88, 262, 12, muted, 464);

    centered("Pressione A para cancelar", 88, 316, 464, 13, (SDL_Color){251, 191, 36, 255});
  }
}
