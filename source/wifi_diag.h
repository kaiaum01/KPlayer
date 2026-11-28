#ifndef KPLAYER_WIFI_DIAG_H
#define KPLAYER_WIFI_DIAG_H

/*
 * Native R36S screens for KPlayer v2.1.7+:
 *   - mode 17: Transferir via Wi-Fi (LAN upload server + QR code + 6-digit PIN)
 *   - mode 18: Diagnóstico do Sistema & Backup/Restauração (.zip)
 *   - mode 19: Playlists Salvas (.m3u)
 *   - Modal overlay: PIN de 4 direções (D-Pad) para Seção +18
 */

#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <spawn.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

/* ==================== TINY SAFE JSON PARSERS ==================== */

static bool wd_json_get_str(const char *json, const char *key, char *out, size_t cap) {
  if (!json || !key || !out || !cap) return false;
  out[0] = 0;
  char pat[96];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return false;
  p += strlen(pat);
  while (*p == ' ' || *p == '\t' || *p == ':') p++;
  if (*p != '"') return false;
  p++;
  size_t w = 0;
  while (*p && *p != '"' && w + 1 < cap) {
    if (*p == '\\' && p[1]) {
      p++;
      if (*p == 'n' || *p == 'r' || *p == 't') out[w++] = ' ';
      else out[w++] = *p;
      p++;
    } else {
      out[w++] = *p++;
    }
  }
  out[w] = 0;
  return true;
}

static bool wd_json_get_bool(const char *json, const char *key, bool def) {
  if (!json || !key) return def;
  char pat[96];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p += strlen(pat);
  while (*p == ' ' || *p == '\t' || *p == ':') p++;
  if (!strncmp(p, "true", 4)) return true;
  if (!strncmp(p, "false", 5)) return false;
  return def;
}

static int wd_json_get_int(const char *json, const char *key, int def) {
  if (!json || !key) return def;
  char pat[96];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p += strlen(pat);
  while (*p == ' ' || *p == '\t' || *p == ':') p++;
  if (*p == '-' || (*p >= '0' && *p <= '9')) return atoi(p);
  return def;
}

static double wd_json_get_double(const char *json, const char *key, double def) {
  if (!json || !key) return def;
  char pat[96];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p += strlen(pat);
  while (*p == ' ' || *p == '\t' || *p == ':') p++;
  if (*p == '-' || (*p >= '0' && *p <= '9')) return strtod(p, NULL);
  return def;
}

/* ==================== MODE 17: WI-FI FILE TRANSFER ==================== */

#define WD_WIFI_STATUS_PATH "/tmp/kplayer-wifi-transfer.json"
#define WD_QR_MAX_DIM 40

static pid_t wd_wifi_pid = 0;
static bool wd_wifi_running = false;
static int wd_wifi_return_mode = 2;
static uint32_t wd_wifi_next_poll = 0;
static char wd_wifi_url[128] = "";
static char wd_wifi_pin[16] = "";
static char wd_wifi_last_file[160] = "";
static int wd_wifi_count = 0;
static char wd_wifi_qr[WD_QR_MAX_DIM][WD_QR_MAX_DIM + 1];
static int wd_wifi_qr_size = 0;
static char wd_wifi_err[128] = "";

static void wifi_transfer_stop(void) {
  if (wd_wifi_pid > 0) {
    kill(wd_wifi_pid, SIGTERM);
    int st = 0;
    for (int i = 0; i < 15; i++) {
      pid_t r = waitpid(wd_wifi_pid, &st, WNOHANG);
      if (r == wd_wifi_pid || r < 0) break;
      SDL_Delay(20);
    }
    if (waitpid(wd_wifi_pid, &st, WNOHANG) == 0) {
      kill(wd_wifi_pid, SIGKILL);
      (void)waitpid(wd_wifi_pid, &st, 0);
    }
    wd_wifi_pid = 0;
  }
  wd_wifi_running = false;
}

static void wifi_transfer_poll(void) {
  uint32_t now = SDL_GetTicks();
  if (wd_wifi_next_poll != 0 && (int32_t)(now - wd_wifi_next_poll) < 0) return;
  wd_wifi_next_poll = now + 400u;

  if (wd_wifi_pid > 0) {
    int st = 0;
    pid_t r = waitpid(wd_wifi_pid, &st, WNOHANG);
    if (r == wd_wifi_pid) {
      wd_wifi_pid = 0;
      wd_wifi_running = false;
    }
  }

  FILE *f = fopen(WD_WIFI_STATUS_PATH, "rb");
  if (!f) return;
  char buf[16384];
  size_t n = fread(buf, 1, sizeof(buf) - 1, f);
  fclose(f);
  buf[n] = 0;

  wd_json_get_str(buf, "url", wd_wifi_url, sizeof(wd_wifi_url));
  wd_json_get_str(buf, "pin", wd_wifi_pin, sizeof(wd_wifi_pin));
  wd_json_get_str(buf, "last_file", wd_wifi_last_file, sizeof(wd_wifi_last_file));
  wd_wifi_count = wd_json_get_int(buf, "count", 0);

  const char *qr_key = strstr(buf, "\"qr\"");
  if (qr_key) {
    const char *p = strchr(qr_key, '[');
    int rows = 0;
    while (p && *p && *p != ']' && rows < WD_QR_MAX_DIM) {
      const char *q1 = strchr(p, '"');
      if (!q1) break;
      const char *q2 = strchr(q1 + 1, '"');
      if (!q2) break;
      size_t len = (size_t)(q2 - (q1 + 1));
      if (len > WD_QR_MAX_DIM) len = WD_QR_MAX_DIM;
      memcpy(wd_wifi_qr[rows], q1 + 1, len);
      wd_wifi_qr[rows][len] = 0;
      rows++;
      p = q2 + 1;
      while (*p == ' ' || *p == ',') p++;
    }
    if (rows >= 21) wd_wifi_qr_size = rows;
  }
}

static void wifi_transfer_start(void) {
  wifi_transfer_stop();
  wd_wifi_url[0] = 0;
  wd_wifi_pin[0] = 0;
  wd_wifi_last_file[0] = 0;
  wd_wifi_count = 0;
  wd_wifi_qr_size = 0;
  wd_wifi_err[0] = 0;
  unlink(WD_WIFI_STATUS_PATH);

  if (access("./wifi_transfer.py", R_OK) != 0) {
    snprintf(wd_wifi_err, sizeof(wd_wifi_err), "wifi_transfer.py não encontrado");
    return;
  }
  char *argv[] = {"python3", "./wifi_transfer.py", "--gamedir", ".", "--status",
                  WD_WIFI_STATUS_PATH, "--port", "8088", NULL};
  pid_t pid = 0;
  if (posix_spawnp(&pid, "python3", NULL, NULL, argv, environ) == 0) {
    wd_wifi_pid = pid;
    wd_wifi_running = true;
    wd_wifi_next_poll = 0;
  } else {
    snprintf(wd_wifi_err, sizeof(wd_wifi_err), "Falha ao iniciar servidor Wi-Fi");
  }
}

static void wifi_transfer_open(int ret_mode) {
  wd_wifi_return_mode = ret_mode;
  mode = 17;
  if (!wd_wifi_running) wifi_transfer_start();
}

static void draw_wifi_transfer(void) {
  wifi_transfer_poll();
  backdrop();
  draw_header("WI-FI TRANSFER");
  label("Transferir arquivos via Wi-Fi", 20, 42, 22, textc, 420);
  label("Envie músicas, vídeos, PDFs ou listas .m3u direto do celular na mesma rede",
        20, 68, 12, muted, 600);

  /* Left card: Real QR code matrix */
  panel_card(20, 96, 232, 316, 16);
  if (wd_wifi_qr_size >= 21) {
    int box_s = 196;
    int bx = 20 + (232 - box_s) / 2;
    int by = 116;
    rounded(bx - 8, by - 8, box_s + 16, box_s + 16, 12, (SDL_Color){250, 250, 252, 255});
    int cell = box_s / wd_wifi_qr_size;
    if (cell < 3) cell = 3;
    int actual = cell * wd_wifi_qr_size;
    int ox = bx + (box_s - actual) / 2;
    int oy = by + (box_s - actual) / 2;
    SDL_Color dark_mod = {12, 16, 24, 255};
    for (int r = 0; r < wd_wifi_qr_size; r++) {
      for (int c = 0; wd_wifi_qr[r][c] && c < wd_wifi_qr_size; c++) {
        if (wd_wifi_qr[r][c] == '#') {
          rect(ox + c * cell, oy + r * cell, cell, cell, dark_mod);
        }
      }
    }
    centered("Aponte a câmera do celular", 28, 336, 216, 13, accent);
    centered("QR preenche URL + PIN", 28, 358, 216, 11, muted);
  } else {
    centered(wd_wifi_err[0] ? wd_wifi_err : "Iniciando servidor LAN...",
             28, 226, 216, 14, wd_wifi_err[0] ? accent : muted);
  }

  /* Right card: Connection details & Upload status */
  panel_card(266, 96, 354, 316, 16);
  rounded(282, 112, 136, 24, 10,
          wd_wifi_running ? alpha(accent, 44) : elevated);
  centered(wd_wifi_running ? "SERVIDOR ATIVO" : "SERVIDOR PARADO",
           282, 117, 136, 11, wd_wifi_running ? accent : muted);

  label("Endereço no navegador:", 282, 148, 12, muted, 320);
  rounded(282, 168, 322, 36, 10, elevated);
  label(wd_wifi_url[0] ? wd_wifi_url : "Aguardando IP local...",
        294, 177, 16, accent, 298);

  label("PIN de segurança da sessão:", 282, 216, 12, muted, 320);
  rounded(282, 236, 196, 42, 10, mix(elevated, accent, 0.14f));
  centered(wd_wifi_pin[0] ? wd_wifi_pin : "------", 286, 245, 188, 24, textc);

  char cnt_txt[96];
  snprintf(cnt_txt, sizeof(cnt_txt), "Arquivos recebidos: %d", wd_wifi_count);
  label(cnt_txt, 282, 294, 14, textc, 320);
  if (wd_wifi_last_file[0]) {
    char lf[180];
    snprintf(lf, sizeof(lf), "Último: %.120s", wd_wifi_last_file);
    label(lf, 282, 318, 12, accent, 320);
  } else {
    label("Nenhum arquivo enviado ainda.", 282, 318, 12, dim, 320);
  }
  label("Músicas, Vídeos, PDFs, .m3u e .lrc (máx. 512 MB)",
        282, 354, 11, muted, 322);
  label("O servidor é encerrado automaticamente ao sair.",
        282, 374, 11, dim, 322);

  /* Bottom bar */
  card(20, 422, 292, 42, 11, true, panel);
  centered(wd_wifi_running ? "B  •  Reiniciar / Novo PIN" : "B  •  Iniciar servidor",
           26, 434, 280, 14, accent);
  card(328, 422, 292, 42, 11, false, panel);
  centered("A  •  Parar servidor e voltar", 334, 434, 280, 14, textc);
  footer_hints(NULL, 0);
}

static void wifi_transfer_key(SDL_Keycode k) {
  if (k == SDLK_BACKSPACE) {
    wifi_transfer_stop();
    mode = wd_wifi_return_mode;
    return;
  }
  if (k == SDLK_RETURN) {
    wifi_transfer_start();
    notify("Servidor Wi-Fi reiniciado com novo PIN");
  }
}

/* ==================== MODE 18: DIAGNOSTICS & BACKUP/RESTORE ==================== */

static int wd_diag_return_mode = 2;
static int wd_diag_btn = 0; /* 0=Sound test, 1=Refresh, 2=Backup, 3=Restore */
static pthread_mutex_t wd_diag_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool wd_diag_busy = false;
static bool wd_diag_loaded = false;
static bool wd_diag_mini_inst = false;
static bool wd_diag_mini_run = false;
static int wd_diag_mini_tracks = 0;
static char wd_diag_audio[96] = "Verificando...";
static char wd_diag_ip[64] = "--";
static char wd_diag_ssid[64] = "";
static int wd_diag_bat = -1;
static double wd_diag_temp = -1.0;
static char wd_diag_disks[160] = "Verificando...";
static char wd_diag_action_msg[160] = "";
static bool wd_diag_need_reload_settings = false;

static bool wd_run_python_capture(char *const argv[], char *out, size_t cap) {
  if (!out || !cap) return false;
  out[0] = 0;
  int pfd[2];
  if (pipe(pfd) != 0) return false;
  posix_spawn_file_actions_t fa;
  posix_spawn_file_actions_init(&fa);
  posix_spawn_file_actions_addclose(&fa, pfd[0]);
  posix_spawn_file_actions_adddup2(&fa, pfd[1], STDOUT_FILENO);
  posix_spawn_file_actions_addclose(&fa, pfd[1]);
  pid_t pid = 0;
  int rc = posix_spawnp(&pid, "python3", &fa, NULL, argv, environ);
  posix_spawn_file_actions_destroy(&fa);
  close(pfd[1]);
  if (rc != 0) {
    close(pfd[0]);
    return false;
  }
  size_t used = 0;
  while (used + 1 < cap) {
    ssize_t r = read(pfd[0], out + used, cap - 1 - used);
    if (r < 0) {
      if (errno == EINTR) continue;
      break;
    }
    if (r == 0) break;
    used += (size_t)r;
  }
  out[used] = 0;
  close(pfd[0]);
  int st = 0;
  while (waitpid(pid, &st, 0) < 0 && errno == EINTR) {}
  return WIFEXITED(st) && WEXITSTATUS(st) == 0;
}

typedef struct {
  int job; /* 0=diagnostics, 1=backup, 2=restore */
} WdDiagJob;

static void *wd_diag_worker(void *raw) {
  WdDiagJob *j = (WdDiagJob *)raw;
  int job = j->job;
  free(j);

  char out[8192];
  if (job == 0) {
    char *argv[] = {"python3", "./system_tools.py", "diagnostics", "--gamedir", ".", NULL};
    bool ok = wd_run_python_capture(argv, out, sizeof(out));
    pthread_mutex_lock(&wd_diag_mutex);
    if (ok && out[0]) {
      wd_diag_loaded = true;
      wd_diag_mini_inst = wd_json_get_bool(out, "miniplayer_installed", false);
      wd_diag_mini_run = wd_json_get_bool(out, "miniplayer_running", false);
      wd_diag_mini_tracks = wd_json_get_int(out, "miniplayer_tracks", 0);
      wd_json_get_str(out, "audio", wd_diag_audio, sizeof(wd_diag_audio));
      wd_json_get_str(out, "ip", wd_diag_ip, sizeof(wd_diag_ip));
      wd_json_get_str(out, "ssid", wd_diag_ssid, sizeof(wd_diag_ssid));
      wd_diag_bat = wd_json_get_int(out, "percent", -1);
      wd_diag_temp = wd_json_get_double(out, "cpu_temp_c", -1.0);
      /* Format compact disk summary from "disks" array */
      wd_diag_disks[0] = 0;
      const char *dp = strstr(out, "\"disks\"");
      if (dp) {
        size_t pos = 0;
        const char *scan = dp;
        int dcnt = 0;
        while ((scan = strstr(scan, "\"path\"")) != NULL && dcnt < 3) {
          char pth[48] = "";
          wd_json_get_str(scan, "path", pth, sizeof(pth));
          double fg = wd_json_get_double(scan, "free_gb", 0.0);
          double tg = wd_json_get_double(scan, "total_gb", 0.0);
          if (pth[0] && pos + 32 < sizeof(wd_diag_disks)) {
            int wn = snprintf(wd_diag_disks + pos, sizeof(wd_diag_disks) - pos,
                              "%s%s: %.1f/%.0f GB", dcnt ? "  •  " : "", pth, fg, tg);
            if (wn > 0) pos += (size_t)wn;
            dcnt++;
          }
          scan += 6;
        }
      }
      if (!wd_diag_disks[0]) snprintf(wd_diag_disks, sizeof(wd_diag_disks), "Não detectado");
    } else {
      snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg),
               "Não foi possível coletar diagnóstico.");
    }
    wd_diag_busy = false;
    pthread_mutex_unlock(&wd_diag_mutex);
  } else if (job == 1) {
    char *argv[] = {"python3", "./system_tools.py", "backup", "--gamedir", ".", NULL};
    bool ok = wd_run_python_capture(argv, out, sizeof(out));
    pthread_mutex_lock(&wd_diag_mutex);
    if (ok && wd_json_get_bool(out, "ok", false)) {
      int fc = wd_json_get_int(out, "files_count", 0);
      snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg),
               "Backup criado em backups/ (%d arquivo%s).", fc, fc == 1 ? "" : "s");
    } else {
      snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg),
               "Falha ao criar backup .zip.");
    }
    wd_diag_busy = false;
    pthread_mutex_unlock(&wd_diag_mutex);
  } else if (job == 2) {
    char *argv[] = {"python3", "./system_tools.py", "restore", "--gamedir", ".", NULL};
    bool ok = wd_run_python_capture(argv, out, sizeof(out));
    pthread_mutex_lock(&wd_diag_mutex);
    if (ok && wd_json_get_bool(out, "ok", false)) {
      int rc = wd_json_get_int(out, "restored_count", 0);
      snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg),
               "Backup restaurado (%d arquivo%s). Configurações recarregadas!",
               rc, rc == 1 ? "" : "s");
      wd_diag_need_reload_settings = true;
    } else {
      char err[96] = "";
      wd_json_get_str(out, "error", err, sizeof(err));
      snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg), "%s",
               err[0] ? err : "Nenhum backup encontrado em backups/.");
    }
    wd_diag_busy = false;
    pthread_mutex_unlock(&wd_diag_mutex);
  }
  return NULL;
}

static void wd_diag_start_job(int job) {
  pthread_mutex_lock(&wd_diag_mutex);
  if (wd_diag_busy) {
    pthread_mutex_unlock(&wd_diag_mutex);
    return;
  }
  wd_diag_busy = true;
  if (job == 1) snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg), "Gerando backup .zip...");
  else if (job == 2) snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg), "Restaurando último backup...");
  pthread_mutex_unlock(&wd_diag_mutex);

  WdDiagJob *j = malloc(sizeof(*j));
  if (!j) return;
  j->job = job;
  pthread_t th;
  if (pthread_create(&th, NULL, wd_diag_worker, j) == 0) pthread_detach(th);
  else {
    free(j);
    pthread_mutex_lock(&wd_diag_mutex);
    wd_diag_busy = false;
    pthread_mutex_unlock(&wd_diag_mutex);
  }
}

static void diag_open(int ret_mode, int focus_btn) {
  wd_diag_return_mode = ret_mode;
  wd_diag_btn = (focus_btn >= 0 && focus_btn < 4) ? focus_btn : 0;
  mode = 18;
  wd_diag_start_job(0);
}

static void load_settings(void);
static void load_favorites(void);
static void save_settings(void);

static void draw_diagnostics(void) {
  bool do_reload = false;
  pthread_mutex_lock(&wd_diag_mutex);
  bool busy = wd_diag_busy;
  bool mini_i = wd_diag_mini_inst;
  bool mini_r = wd_diag_mini_run;
  int mini_t = wd_diag_mini_tracks;
  char audio[96], ip[64], ssid[64], disks[160], msg[160];
  snprintf(audio, sizeof(audio), "%s", wd_diag_audio);
  snprintf(ip, sizeof(ip), "%s", wd_diag_ip);
  snprintf(ssid, sizeof(ssid), "%s", wd_diag_ssid);
  snprintf(disks, sizeof(disks), "%s", wd_diag_disks);
  snprintf(msg, sizeof(msg), "%s", wd_diag_action_msg);
  int bat = wd_diag_bat;
  double temp = wd_diag_temp;
  if (wd_diag_need_reload_settings) {
    wd_diag_need_reload_settings = false;
    do_reload = true;
  }
  pthread_mutex_unlock(&wd_diag_mutex);

  if (do_reload) {
    load_settings();
    load_favorites();
    kp_wh_loaded = false;
    kp_wh_load();
  }

  backdrop();
  draw_header("DIAGNÓSTICO & BACKUP");
  label("Diagnóstico do Sistema & Backup", 20, 42, 22, textc, 500);
  label("Status do áudio, Mini-Player, armazenamento e cópia de segurança em .zip",
        20, 68, 12, muted, 600);

  /* Left telemetry card */
  panel_card(20, 96, 372, 316, 16);
  label("STATUS DO CONSOLE", 36, 110, 11, accent, 200);

  char line1[128], line2[192], line3[128], line4[192];
  snprintf(line1, sizeof(line1), "%s • %s (%d faixas)",
           mini_i ? "Injetado" : "Desativado",
           mini_r ? "Daemon ativo" : "Parado", mini_t);
  if (ssid[0]) snprintf(line2, sizeof(line2), "%.63s  (%.63s)", ip, ssid);
  else snprintf(line2, sizeof(line2), "%.63s", ip);

  if (bat >= 0 && temp > 0.0)
    snprintf(line3, sizeof(line3), "Bateria %d%%  •  CPU %.1f °C  •  Brilho %d%%",
             bat, temp, kp_hw_brightness_pct);
  else if (bat >= 0)
    snprintf(line3, sizeof(line3), "Bateria %d%%  •  Brilho %d%%", bat, kp_hw_brightness_pct);
  else
    snprintf(line3, sizeof(line3), "Brilho LCD %d%%  •  Modo desktop/teste", kp_hw_brightness_pct);

  snprintf(line4, sizeof(line4), "%.159s", disks);

  const char *keys[5] = {"Mini-Player (L3+R3)", "Backend de Áudio", "Rede Wi-Fi / IP",
                         "Energia & Tela", "Espaço Livre"};
  const char *vals[5] = {line1, audio, line2, line3, line4};
  for (int i = 0; i < 5; i++) {
    int ry = 134 + i * 52;
    if (i > 0) rect(36, ry - 4, 340, 1, hairline());
    label(keys[i], 36, ry + 2, 11, muted, 340);
    label(vals[i], 36, ry + 20, 14, i == 0 && mini_r ? accent : textc, 340);
  }

  /* Right interactive action panel */
  panel_card(406, 96, 214, 316, 16);
  label("AÇÕES RÁPIDAS", 422, 110, 11, accent, 180);
  const char *btn_lbls[4] = {
      "Teste de som rápido",
      "Atualizar status",
      "Criar backup (.zip)",
      "Restaurar backup",
  };
  const char *btn_subs[4] = {
      "Emite sinal sonoro",
      "Releitura do hardware",
      "Salva em backups/",
      "Aplica último .zip",
  };
  for (int i = 0; i < 4; i++) {
    int by = 136 + i * 64;
    bool focus = (wd_diag_btn == i);
    card(420, by, 186, 54, 11, focus, elevated);
    label(btn_lbls[i], 432, by + 9, 14, focus ? accent : textc, 164);
    label(btn_subs[i], 432, by + 30, 11, muted, 164);
  }

  /* Status message bar */
  panel_card(20, 422, 600, 42, 11);
  if (busy)
    label("Executando operação do sistema...", 36, 434, 14, accent, 560);
  else if (msg[0])
    label(msg, 36, 434, 13, accent, 560);
  else
    label("B  Executar ação selecionada  •  A  Voltar às Opções", 36, 434, 13, muted, 560);
  footer_hints(NULL, 0);
}

static void diagnostics_key(SDL_Keycode k) {
  if (k == SDLK_BACKSPACE) {
    mode = wd_diag_return_mode;
    return;
  }
  if (k == SDLK_UP) {
    wd_diag_btn = (wd_diag_btn + 3) % 4;
  } else if (k == SDLK_DOWN) {
    wd_diag_btn = (wd_diag_btn + 1) % 4;
  } else if (k == SDLK_RETURN) {
    if (wd_diag_btn == 0) {
      bool prev_sfx = ui_sfx_enabled;
      ui_sfx_enabled = true;
      sfx_play(SFX_CONFIRM);
      ui_sfx_enabled = prev_sfx;
      pthread_mutex_lock(&wd_diag_mutex);
      snprintf(wd_diag_action_msg, sizeof(wd_diag_action_msg),
               "Teste de som reproduzido! Se não ouviu, verifique volume físico.");
      pthread_mutex_unlock(&wd_diag_mutex);
      notify("Teste de som reproduzido!");
    } else if (wd_diag_btn == 1) {
      wd_diag_start_job(0);
    } else if (wd_diag_btn == 2) {
      save_settings();
      wd_diag_start_job(1);
    } else if (wd_diag_btn == 3) {
      wd_diag_start_job(2);
    }
  }
}

/* ==================== MODE 19: SAVED PLAYLISTS PICKER (.m3u) ==================== */

static int wd_pl_return_mode = 4;

static void playlists_picker_open(int ret_mode) {
  wd_pl_return_mode = ret_mode;
  kp_playlists_scan();
  mode = 19;
}

static bool load_local_playlist(const char *filename);
static void play_path(const char *path);

static void draw_playlists_picker(void) {
  backdrop();
  draw_header("PLAYLISTS SALVAS");
  label("Playlists (.m3u)", 20, 42, 22, textc, 360);
  label("B  Carregar e tocar  •  Y  Apagar playlist  •  A  Voltar", 20, 68, 12, muted, 580);

  if (kp_saved_playlist_count <= 0) {
    panel_card(20, 108, 600, 300, 16);
    centered("Nenhuma playlist salva ainda", 30, 210, 580, 20, textc);
    centered("No player de Músicas, abra SELECT → Salvar fila como playlist (.m3u)",
             30, 248, 580, 13, muted);
  } else {
    int scroll = kp_saved_playlist_cursor >= 6 ? kp_saved_playlist_cursor - 5 : 0;
    for (int row = 0; row < 6 && scroll + row < kp_saved_playlist_count; row++) {
      int idx = scroll + row;
      int y = 104 + row * 56;
      bool focus = (idx == kp_saved_playlist_cursor);
      card(20, y, 600, 48, 11, focus, panel);
      label(kp_saved_playlists[idx].name, 38, y + 10, 17, focus ? accent : textc, 420);
      char cnt[48];
      snprintf(cnt, sizeof(cnt), "%d faixa%s", kp_saved_playlists[idx].tracks,
               kp_saved_playlists[idx].tracks == 1 ? "" : "s");
      label(cnt, 490, y + 14, 13, muted, 116);
    }
  }
  footer_hints(NULL, 0);
}

static void playlists_picker_key(SDL_Keycode k) {
  if (k == SDLK_BACKSPACE) {
    mode = wd_pl_return_mode;
    return;
  }
  if (kp_saved_playlist_count <= 0) return;
  if (k == SDLK_UP) {
    kp_saved_playlist_cursor =
        (kp_saved_playlist_cursor + kp_saved_playlist_count - 1) % kp_saved_playlist_count;
  } else if (k == SDLK_DOWN) {
    kp_saved_playlist_cursor = (kp_saved_playlist_cursor + 1) % kp_saved_playlist_count;
  } else if (k == SDLK_RETURN) {
    const char *p = kp_saved_playlists[kp_saved_playlist_cursor].path;
    if (load_local_playlist(p) && queue_count > 0) {
      play_path(queue_paths[0]);
      notify("Playlist carregada!");
    } else {
      notify("Playlist vazia ou arquivos indisponíveis");
    }
  } else if (k == SDLK_m) {
    const char *p = kp_saved_playlists[kp_saved_playlist_cursor].path;
    if (remove(p) == 0) {
      notify("Playlist removida");
      kp_playlists_scan();
    } else {
      notify("Não foi possível apagar a playlist");
    }
  }
}

/* ==================== 4-DIRECTION GAMEPAD PIN MODAL (+18) ==================== */

static int kp_pin_return_mode = 2;

static void kp_pin_open_unlock(int ret_mode) {
  kp_pin_return_mode = ret_mode;
  kp_pin_modal_mode = KP_PIN_MODE_UNLOCK;
  kp_pin_len = 0;
  kp_pin_err[0] = 0;
}

static void kp_pin_open_set(int ret_mode) {
  kp_pin_return_mode = ret_mode;
  kp_pin_modal_mode = KP_PIN_MODE_SET_NEW;
  kp_pin_len = 0;
  kp_pin_err[0] = 0;
}

static void kp_pin_draw_modal(void) {
  if (kp_pin_modal_mode == KP_PIN_MODE_NONE) return;
  rect(0, 0, 640, 480, (SDL_Color){4, 6, 11, 215});
  panel_card(110, 108, 420, 264, 18);
  rounded_outline(110, 108, 420, 264, 18, accent);
  centered(kp_pin_modal_mode == KP_PIN_MODE_SET_NEW
               ? "DEFINIR NOVO PIN (+18)"
               : "PIN DE PROTEÇÃO (+18)",
           126, 128, 388, 20, textc);
  centered("Use 4 direções do D-Pad (↑ ↓ ← →)", 126, 158, 388, 13, muted);

  for (int i = 0; i < 4; i++) {
    int bx = 172 + i * 78;
    bool filled = i < kp_pin_len;
    bool active_slot = i == kp_pin_len;
    card(bx, 198, 62, 62, 12, active_slot, elevated);
    const char *sym = filled
                          ? (kp_pin_modal_mode == KP_PIN_MODE_SET_NEW
                                 ? kp_pin_dir_arrow(kp_pin_buf[i])
                                 : "●")
                          : "○";
    centered(sym, bx, 212, 62, 26, filled ? accent : dim);
  }

  if (kp_pin_err[0]) {
    centered(kp_pin_err, 126, 282, 388, 13, (SDL_Color){248, 113, 113, 255});
  } else if (kp_pin_modal_mode == KP_PIN_MODE_UNLOCK && adult_pin_hash == 0) {
    centered("PIN padrão inicial: ↑ ↑ ↓ ↓", 126, 282, 388, 12, muted);
  } else {
    centered("A  Cancelar  •  X  Apagar dígito", 126, 282, 388, 12, muted);
  }
  centered("Os botões direcionais confirmam automaticamente no 4º toque",
           126, 330, 388, 11, dim);
}

static bool kp_pin_handle_key(SDL_Keycode k) {
  if (kp_pin_modal_mode == KP_PIN_MODE_NONE) return false;
  if (k == SDLK_BACKSPACE || k == SDLK_ESCAPE) {
    kp_pin_modal_mode = KP_PIN_MODE_NONE;
    kp_pin_len = 0;
    kp_pin_err[0] = 0;
    return true;
  }
  if (k == SDLK_SPACE) {
    if (kp_pin_len > 0) kp_pin_len--;
    kp_pin_err[0] = 0;
    return true;
  }
  int dir = 0;
  if (k == SDLK_UP) dir = 1;
  else if (k == SDLK_DOWN) dir = 2;
  else if (k == SDLK_LEFT) dir = 3;
  else if (k == SDLK_RIGHT) dir = 4;
  else return true; /* Swallow non-directional keys while modal is open */

  kp_pin_err[0] = 0;
  if (kp_pin_len < 4) {
    kp_pin_buf[kp_pin_len++] = dir;
  }
  if (kp_pin_len == 4) {
    uint64_t h = kp_pin_hash_seq(kp_pin_buf);
    if (kp_pin_modal_mode == KP_PIN_MODE_SET_NEW) {
      adult_pin_hash = h;
      adult_pin_enabled = true;
      save_settings();
      kp_pin_modal_mode = KP_PIN_MODE_NONE;
      kp_pin_len = 0;
      notify("Novo PIN de 4 direções salvo para a Seção +18!");
    } else {
      uint64_t expected = adult_pin_hash ? adult_pin_hash : kp_pin_default_hash();
      if (h == expected) {
        adult_section_unlocked = true;
        save_settings();
        kp_pin_modal_mode = KP_PIN_MODE_NONE;
        kp_pin_len = 0;
        mode = kp_pin_return_mode;
        notify("Seção +18 desbloqueada no serviço de IPTV");
      } else {
        kp_pin_len = 0;
        snprintf(kp_pin_err, sizeof(kp_pin_err), "PIN incorreto! Tente novamente.");
      }
    }
  }
  return true;
}

#endif /* KPLAYER_WIFI_DIAG_H */
