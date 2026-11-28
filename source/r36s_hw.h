#ifndef KPLAYER_R36S_HW_H
#define KPLAYER_R36S_HW_H

/*
 * R36S hardware & UX helpers for KPlayer (v2.1.7+):
 *   1) Battery % reader (/sys/class/power_supply/...)
 *   2) LCD backlight brightness control + Screen-Off Audio Mode ("Tela Apagada")
 *   3) Multi-video "Continuar Assistindo" watch history (watch_history.cfg)
 *   4) 4-button D-Pad PIN lock for Seção +18 (salted hash in settings.cfg)
 */

#include <dirent.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

/* ==================== 1. BATTERY READER ==================== */

static int kp_hw_cached_bat = -1;
static uint32_t kp_hw_bat_next_ms = 0;

static int kp_hw_read_battery_now(void) {
  static const char *const paths[] = {
      "/sys/class/power_supply/battery/capacity",
      "/sys/class/power_supply/BAT0/capacity",
      "/sys/class/power_supply/BAT1/capacity",
      "/sys/class/power_supply/rk817-battery/capacity",
      "/sys/class/power_supply/axp20x-battery/capacity",
  };
  for (size_t i = 0; i < sizeof(paths) / sizeof(paths[0]); i++) {
    FILE *f = fopen(paths[i], "r");
    if (!f) continue;
    int v = -1;
    int ok = fscanf(f, "%d", &v);
    fclose(f);
    if (ok == 1 && v >= 0 && v <= 100) return v;
  }
  return -1;
}

static __attribute__((unused)) int kp_hw_battery_pct(uint32_t now_ticks) {
  if (kp_hw_bat_next_ms == 0 || (int32_t)(now_ticks - kp_hw_bat_next_ms) >= 0) {
    kp_hw_cached_bat = kp_hw_read_battery_now();
    kp_hw_bat_next_ms = now_ticks + 10000u;
  }
  return kp_hw_cached_bat;
}

/* ==================== 2. BACKLIGHT & SCREEN-OFF MODE ==================== */

static char kp_hw_bl_dir[256] = "";
static bool kp_hw_bl_probed = false;
static int kp_hw_bl_max = 100;
static int kp_hw_brightness_pct = 100;
static int kp_hw_saved_raw_bl = -1;
static bool kp_hw_screen_off = false;

static void kp_hw_probe_backlight(void) {
  if (kp_hw_bl_probed) return;
  kp_hw_bl_probed = true;
  DIR *d = opendir("/sys/class/backlight");
  if (!d) return;
  struct dirent *de;
  while ((de = readdir(d)) != NULL) {
    if (de->d_name[0] == '.') continue;
    char max_p[320], cur_p[320];
    snprintf(max_p, sizeof(max_p), "/sys/class/backlight/%.180s/max_brightness", de->d_name);
    snprintf(cur_p, sizeof(cur_p), "/sys/class/backlight/%.180s/brightness", de->d_name);
    FILE *fm = fopen(max_p, "r");
    if (!fm) continue;
    int mx = 0;
    int okm = fscanf(fm, "%d", &mx);
    fclose(fm);
    if (okm == 1 && mx > 0) {
      snprintf(kp_hw_bl_dir, sizeof(kp_hw_bl_dir), "/sys/class/backlight/%.180s", de->d_name);
      kp_hw_bl_max = mx;
      FILE *fc = fopen(cur_p, "r");
      if (fc) {
        int cur = mx;
        if (fscanf(fc, "%d", &cur) == 1 && cur >= 0) {
          kp_hw_brightness_pct = (cur * 100) / mx;
          if (kp_hw_brightness_pct < 10) kp_hw_brightness_pct = 10;
          if (kp_hw_brightness_pct > 100) kp_hw_brightness_pct = 100;
        }
        fclose(fc);
      }
      break;
    }
  }
  closedir(d);
}

static bool kp_hw_write_sysfs_int(const char *path, int val) {
  FILE *f = fopen(path, "w");
  if (!f) return false;
  bool ok = fprintf(f, "%d\n", val) > 0;
  return fclose(f) == 0 && ok;
}

static void kp_hw_set_brightness_pct(int pct) {
  kp_hw_probe_backlight();
  if (pct < 10) pct = 10;
  if (pct > 100) pct = 100;
  kp_hw_brightness_pct = pct;
  if (kp_hw_bl_dir[0] && !kp_hw_screen_off) {
    char p[320];
    snprintf(p, sizeof(p), "%.255s/brightness", kp_hw_bl_dir);
    int raw = (kp_hw_bl_max * pct + 50) / 100;
    if (raw < 1) raw = 1;
    (void)kp_hw_write_sysfs_int(p, raw);
  }
}

static int kp_hw_step_brightness(int delta) {
  kp_hw_probe_backlight();
  int nxt = kp_hw_brightness_pct + delta;
  if (nxt < 10) nxt = 10;
  if (nxt > 100) nxt = 100;
  kp_hw_set_brightness_pct(nxt);
  return kp_hw_brightness_pct;
}

static void kp_hw_set_screen_off(bool off) {
  kp_hw_probe_backlight();
  if (kp_hw_screen_off == off) return;
  kp_hw_screen_off = off;
  if (!kp_hw_bl_dir[0]) return;
  char bl_pow[320], bl_val[320];
  snprintf(bl_pow, sizeof(bl_pow), "%.255s/bl_power", kp_hw_bl_dir);
  snprintf(bl_val, sizeof(bl_val), "%.255s/brightness", kp_hw_bl_dir);
  if (off) {
    FILE *fc = fopen(bl_val, "r");
    if (fc) {
      int cur = -1;
      if (fscanf(fc, "%d", &cur) == 1 && cur > 0) kp_hw_saved_raw_bl = cur;
      fclose(fc);
    }
    if (!kp_hw_write_sysfs_int(bl_pow, 1)) {
      (void)kp_hw_write_sysfs_int(bl_val, 0);
    }
  } else {
    (void)kp_hw_write_sysfs_int(bl_pow, 0);
    int restore = kp_hw_saved_raw_bl > 0
                      ? kp_hw_saved_raw_bl
                      : ((kp_hw_bl_max * kp_hw_brightness_pct + 50) / 100);
    if (restore < 1) restore = 1;
    (void)kp_hw_write_sysfs_int(bl_val, restore);
  }
}

/* ==================== 3. MULTI-VIDEO WATCH HISTORY ==================== */

#define KP_WH_MAX 32

typedef struct {
  char path[PATH_MAX];
  long long pos_ms;
  long long dur_ms;
  long long updated_ts;
} KpWatchEntry;

static KpWatchEntry kp_wh_entries[KP_WH_MAX];
static int kp_wh_count = 0;
static bool kp_wh_loaded = false;

static void kp_wh_load(void) {
  if (kp_wh_loaded) return;
  kp_wh_loaded = true;
  kp_wh_count = 0;
  FILE *f = fopen("watch_history.cfg", "r");
  if (!f) return;
  char line[PATH_MAX + 96];
  while (kp_wh_count < KP_WH_MAX && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\r\n")] = 0;
    long long pos = 0, dur = 0, ts = 0;
    char *t1 = strchr(line, '\t');
    if (!t1) continue;
    *t1++ = 0;
    char *t2 = strchr(t1, '\t');
    if (!t2) continue;
    *t2++ = 0;
    char *t3 = strchr(t2, '\t');
    if (!t3) continue;
    *t3++ = 0;
    pos = strtoll(line, NULL, 10);
    dur = strtoll(t1, NULL, 10);
    ts = strtoll(t2, NULL, 10);
    if (t3[0] != '/' || pos < 0 || dur < 0) continue;
    KpWatchEntry *e = &kp_wh_entries[kp_wh_count++];
    snprintf(e->path, sizeof(e->path), "%s", t3);
    e->pos_ms = pos;
    e->dur_ms = dur;
    e->updated_ts = ts;
  }
  fclose(f);
}

static void kp_wh_save(void) {
  FILE *f = fopen("watch_history.tmp", "w");
  if (!f) return;
  bool ok = true;
  for (int i = 0; i < kp_wh_count; i++) {
    if (fprintf(f, "%lld\t%lld\t%lld\t%s\n", kp_wh_entries[i].pos_ms,
                kp_wh_entries[i].dur_ms, kp_wh_entries[i].updated_ts,
                kp_wh_entries[i].path) < 0) {
      ok = false;
    }
  }
  if (fclose(f) == 0 && ok) rename("watch_history.tmp", "watch_history.cfg");
}

static void kp_wh_record(const char *path, long long pos_ms, long long dur_ms) {
  if (!path || path[0] != '/' || strpbrk(path, "\r\n\t")) return;
  kp_wh_load();
  char full[PATH_MAX];
  const char *key = realpath(path, full) ? full : path;

  /* If finished (>95% of duration), reset saved timestamp so next watch starts fresh */
  if (dur_ms > 30000 && pos_ms >= (dur_ms * 95) / 100) {
    pos_ms = 0;
  }

  int found = -1;
  for (int i = 0; i < kp_wh_count; i++) {
    if (!strcmp(kp_wh_entries[i].path, key)) {
      found = i;
      break;
    }
  }

  KpWatchEntry entry;
  snprintf(entry.path, sizeof(entry.path), "%s", key);
  entry.pos_ms = pos_ms > 0 ? pos_ms : 0;
  entry.dur_ms = dur_ms > 0 ? dur_ms : 0;
  entry.updated_ts = (long long)time(NULL);

  if (found >= 0) {
    memmove(&kp_wh_entries[1], &kp_wh_entries[0], (size_t)found * sizeof(KpWatchEntry));
    kp_wh_entries[0] = entry;
  } else {
    int move_n = (kp_wh_count < KP_WH_MAX) ? kp_wh_count : (KP_WH_MAX - 1);
    if (move_n > 0) {
      memmove(&kp_wh_entries[1], &kp_wh_entries[0], (size_t)move_n * sizeof(KpWatchEntry));
    }
    kp_wh_entries[0] = entry;
    if (kp_wh_count < KP_WH_MAX) kp_wh_count++;
  }
  kp_wh_save();
}

static long long kp_wh_find_ms(const char *path, long long *out_dur_ms) {
  if (out_dur_ms) *out_dur_ms = 0;
  if (!path || !path[0]) return 0;
  kp_wh_load();
  char full[PATH_MAX];
  const char *key = realpath(path, full) ? full : path;
  for (int i = 0; i < kp_wh_count; i++) {
    if (!strcmp(kp_wh_entries[i].path, key)) {
      if (out_dur_ms) *out_dur_ms = kp_wh_entries[i].dur_ms;
      return kp_wh_entries[i].pos_ms;
    }
  }
  return 0;
}

/* ==================== 4. GAMEPAD 4-DIRECTION PIN FOR +18 ==================== */

/* Direction codes: 1=UP, 2=DOWN, 3=LEFT, 4=RIGHT */
static uint64_t kp_pin_hash_seq(const int seq[4]) {
  /* Salted 64-bit FNV-1a hash (never stored plaintext) */
  uint64_t h = 0x9E3779B97F4A7C15ULL;
  const unsigned char salt[] = "KP_R36S_ADULT_PIN_V217";
  for (size_t i = 0; i < sizeof(salt) - 1; i++) {
    h ^= salt[i];
    h *= 1099511628211ULL;
  }
  for (int i = 0; i < 4; i++) {
    h ^= (uint64_t)(seq[i] & 0xFF);
    h *= 1099511628211ULL;
  }
  return h;
}

static uint64_t kp_pin_default_hash(void) {
  const int def[4] = {1, 1, 2, 2}; /* UP, UP, DOWN, DOWN */
  return kp_pin_hash_seq(def);
}

static bool adult_pin_enabled = false;
static uint64_t adult_pin_hash = 0;

/* Interactive PIN modal state */
enum {
  KP_PIN_MODE_NONE = 0,
  KP_PIN_MODE_UNLOCK = 1,
  KP_PIN_MODE_SET_NEW = 2
};

static int kp_pin_modal_mode = KP_PIN_MODE_NONE;
static int kp_pin_buf[4] = {0, 0, 0, 0};
static int kp_pin_len = 0;
static char kp_pin_err[96] = "";

static const char *kp_pin_dir_arrow(int d) {
  switch (d) {
    case 1: return "↑";
    case 2: return "↓";
    case 3: return "←";
    case 4: return "→";
    default: return "○";
  }
}

#endif /* KPLAYER_R36S_HW_H */
