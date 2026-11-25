#ifndef KPLAYER_BG_MINIPLAYER_H
#define KPLAYER_BG_MINIPLAYER_H

/*
 * KPlayer R36S Headless Background Audio + In-Game Mini-Player (v2.1.4)
 *
 * Runs as `./kplayer --bg-audio <handoff.json> [game_pid]` without SDL2.
 * Uses KPlayer's bundled libvlc.so.5 directly over PulseAudio/PipeWire or
 * ALSA dmix, listens to Linux evdev gamepad inputs passively, and opens a
 * compact /dev/fb0 Mini-Player overlay ONLY when SELECT + R2 is pressed.
 *
 * Controls:
 *   Closed:
 *     SELECT + R2        -> Open In-Game Mini-Player (grabs gamepad, pauses game)
 *     SELECT + L2        -> Previous track/station directly in background
 *   Open:
 *     R2                 -> Next track / station (Pular musica)
 *     L2                 -> Previous track / station (Voltar musica)
 *     B / START          -> Play / Pause
 *     UP / DOWN          -> Background volume +/- 10% (10% - 100%)
 *     A / SELECT + R2    -> Close Mini-Player (restores screen, resumes game)
 */

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/fb.h>
#include <linux/input.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#define BG_MP_MAX_TRACKS 128
#define BG_MP_MAX_EVDEV 16
#define BG_MP_MAX_JSON (256 * 1024)

typedef struct {
  char uri[1024];
  char title[160];
  bool is_radio;
} BgMpTrack;

typedef struct {
  BgMpTrack tracks[BG_MP_MAX_TRACKS];
  int track_count;
  int current_index;
  long long initial_pos_ms;
  int volume_pct;
  bool auto_play;
  bool paused;
  bool started;
  bool overlay_open;
  uint8_t accent_r;
  uint8_t accent_g;
  uint8_t accent_b;
} BgMpState;

typedef enum {
  BG_ACT_NONE = 0,
  BG_ACT_SELECT_R2,
  BG_ACT_SELECT_L2,
  BG_ACT_R2,
  BG_ACT_L2,
  BG_ACT_TOGGLE_PAUSE,
  BG_ACT_VOL_UP,
  BG_ACT_VOL_DOWN,
  BG_ACT_CLOSE
} BgMpAction;

typedef enum {
  BG_RES_NONE = 0,
  BG_RES_OPEN_OVERLAY = 1 << 0,
  BG_RES_CLOSE_OVERLAY = 1 << 1,
  BG_RES_TRACK_CHANGED = 1 << 2,
  BG_RES_PAUSE_TOGGLED = 1 << 3,
  BG_RES_VOLUME_CHANGED = 1 << 4,
  BG_RES_REDRAW = 1 << 5
} BgMpResultFlags;

/* ==================== SAFE JSON PARSER FOR .bg-launch.json ==================== */

static const char *bg_json_skip_ws(const char *p) {
  while (p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')) p++;
  return p;
}

static const char *bg_json_read_string(const char *p, char *out, size_t cap) {
  if (out && cap > 0) out[0] = 0;
  p = bg_json_skip_ws(p);
  if (!p || *p != '"') return NULL;
  p++;
  size_t len = 0;
  while (*p && *p != '"') {
    char c = *p++;
    if (c == '\\' && *p) {
      char esc = *p++;
      switch (esc) {
        case '"': c = '"'; break;
        case '\\': c = '\\'; break;
        case '/': c = '/'; break;
        case 'n': c = ' '; break;
        case 'r': c = ' '; break;
        case 't': c = ' '; break;
        case 'u':
          /* Skip 4 hex digits if present */
          for (int i = 0; i < 4 && *p; i++) p++;
          c = '?';
          break;
        default: c = esc; break;
      }
    }
    if (out && cap > 1 && len + 1 < cap && (unsigned char)c >= 32) {
      out[len++] = c;
    }
  }
  if (out && cap > 0) out[len] = 0;
  if (*p == '"') p++;
  return p;
}

static const char *bg_json_skip_value(const char *p);

static const char *bg_json_skip_container(const char *p, char open_c, char close_c) {
  if (!p || *p != open_c) return p;
  int depth = 0;
  bool in_str = false;
  while (*p) {
    if (in_str) {
      if (*p == '\\' && p[1]) {
        p += 2;
        continue;
      }
      if (*p == '"') in_str = false;
      p++;
      continue;
    }
    if (*p == '"') {
      in_str = true;
    } else if (*p == open_c) {
      depth++;
    } else if (*p == close_c) {
      depth--;
      if (depth == 0) return p + 1;
    }
    p++;
  }
  return p;
}

static const char *bg_json_skip_value(const char *p) {
  p = bg_json_skip_ws(p);
  if (!p || !*p) return p;
  if (*p == '"') return bg_json_read_string(p, NULL, 0);
  if (*p == '{') return bg_json_skip_container(p, '{', '}');
  if (*p == '[') return bg_json_skip_container(p, '[', ']');
  while (*p && *p != ',' && *p != '}' && *p != ']' &&
         *p != ' ' && *p != '\t' && *p != '\r' && *p != '\n') {
    p++;
  }
  return p;
}

static void bg_mp_parse_hex_rgb(const char *hex, uint8_t *r, uint8_t *g, uint8_t *b) {
  if (!hex) return;
  if (*hex == '#') hex++;
  if (strlen(hex) < 6) return;
  unsigned int rv = 0, gv = 0, bv = 0;
  if (sscanf(hex, "%2x%2x%2x", &rv, &gv, &bv) == 3) {
    *r = (uint8_t)rv;
    *g = (uint8_t)gv;
    *b = (uint8_t)bv;
  }
}

static bool bg_mp_uri_valid(const char *uri, bool is_radio) {
  if (!uri || !uri[0]) return false;
  for (const unsigned char *p = (const unsigned char *)uri; *p; p++) {
    if (*p < 32 || *p == 127) return false;
  }
  if (is_radio) {
    return strncasecmp(uri, "http://", 7) == 0 ||
           strncasecmp(uri, "https://", 8) == 0;
  }
  return uri[0] == '/';
}

static const char *bg_json_parse_track_obj(const char *p, BgMpState *st) {
  p = bg_json_skip_ws(p);
  if (!p || *p != '{') return bg_json_skip_value(p);
  p++;
  char uri[1024] = "";
  char title[160] = "";
  char ttype[32] = "music";
  while (p && *p) {
    p = bg_json_skip_ws(p);
    if (*p == '}') { p++; break; }
    if (*p == ',') { p++; continue; }
    char key[64] = "";
    p = bg_json_read_string(p, key, sizeof(key));
    if (!p) break;
    p = bg_json_skip_ws(p);
    if (*p == ':') p++;
    p = bg_json_skip_ws(p);
    if (!strcmp(key, "uri")) {
      p = bg_json_read_string(p, uri, sizeof(uri));
    } else if (!strcmp(key, "title")) {
      p = bg_json_read_string(p, title, sizeof(title));
    } else if (!strcmp(key, "type")) {
      p = bg_json_read_string(p, ttype, sizeof(ttype));
    } else {
      p = bg_json_skip_value(p);
    }
  }
  bool is_radio = (strcasecmp(ttype, "radio") == 0);
  if (st->track_count < BG_MP_MAX_TRACKS && bg_mp_uri_valid(uri, is_radio)) {
    BgMpTrack *tr = &st->tracks[st->track_count++];
    snprintf(tr->uri, sizeof(tr->uri), "%s", uri);
    if (title[0]) {
      snprintf(tr->title, sizeof(tr->title), "%s", title);
    } else {
      const char *sl = strrchr(uri, '/');
      snprintf(tr->title, sizeof(tr->title), "%.159s", (sl && sl[1]) ? sl + 1 : uri);
    }
    tr->is_radio = is_radio;
  }
  return p;
}

static bool bg_mp_parse_json_buf(const char *buf, BgMpState *st) {
  if (!buf || !st) return false;
  memset(st, 0, sizeof(*st));
  st->volume_pct = 55;
  st->auto_play = true;
  st->accent_r = 29;
  st->accent_g = 185;
  st->accent_b = 84;

  char fallback_type[32] = "none";
  char fallback_uri[1024] = "";
  char fallback_title[160] = "";
  bool has_auto_play = false;

  const char *p = bg_json_skip_ws(buf);
  if (!p || *p != '{') return false;
  p++;
  while (p && *p) {
    p = bg_json_skip_ws(p);
    if (*p == '}') { p++; break; }
    if (*p == ',') { p++; continue; }
    char key[64] = "";
    p = bg_json_read_string(p, key, sizeof(key));
    if (!p) break;
    p = bg_json_skip_ws(p);
    if (*p == ':') p++;
    p = bg_json_skip_ws(p);

    if (!strcmp(key, "media_type")) {
      p = bg_json_read_string(p, fallback_type, sizeof(fallback_type));
    } else if (!strcmp(key, "media_uri")) {
      p = bg_json_read_string(p, fallback_uri, sizeof(fallback_uri));
    } else if (!strcmp(key, "title")) {
      p = bg_json_read_string(p, fallback_title, sizeof(fallback_title));
    } else if (!strcmp(key, "theme_accent")) {
      char hex[32] = "";
      p = bg_json_read_string(p, hex, sizeof(hex));
      bg_mp_parse_hex_rgb(hex, &st->accent_r, &st->accent_g, &st->accent_b);
    } else if (!strcmp(key, "media_pos_ms")) {
      char *endp = NULL;
      long long v = strtoll(p, &endp, 10);
      if (endp && endp != p) {
        st->initial_pos_ms = v > 0 ? v : 0;
        p = endp;
      } else {
        p = bg_json_skip_value(p);
      }
    } else if (!strcmp(key, "volume_pct")) {
      char *endp = NULL;
      long v = strtol(p, &endp, 10);
      if (endp && endp != p) {
        if (v < 10) v = 10;
        if (v > 100) v = 100;
        st->volume_pct = (int)v;
        p = endp;
      } else {
        p = bg_json_skip_value(p);
      }
    } else if (!strcmp(key, "track_index")) {
      char *endp = NULL;
      long v = strtol(p, &endp, 10);
      if (endp && endp != p) {
        st->current_index = v >= 0 ? (int)v : 0;
        p = endp;
      } else {
        p = bg_json_skip_value(p);
      }
    } else if (!strcmp(key, "auto_play")) {
      if (!strncmp(p, "true", 4)) {
        st->auto_play = true;
        has_auto_play = true;
        p += 4;
      } else if (!strncmp(p, "false", 5)) {
        st->auto_play = false;
        has_auto_play = true;
        p += 5;
      } else {
        p = bg_json_skip_value(p);
      }
    } else if (!strcmp(key, "tracks") && *p == '[') {
      p++;
      while (p && *p) {
        p = bg_json_skip_ws(p);
        if (*p == ']') { p++; break; }
        if (*p == ',') { p++; continue; }
        p = bg_json_parse_track_obj(p, st);
      }
    } else {
      p = bg_json_skip_value(p);
    }
  }

  if (st->track_count == 0 && fallback_uri[0] && strcasecmp(fallback_type, "none") != 0) {
    bool is_radio = (strcasecmp(fallback_type, "radio") == 0);
    if (bg_mp_uri_valid(fallback_uri, is_radio)) {
      BgMpTrack *tr = &st->tracks[0];
      snprintf(tr->uri, sizeof(tr->uri), "%s", fallback_uri);
      if (fallback_title[0]) {
        snprintf(tr->title, sizeof(tr->title), "%s", fallback_title);
      } else {
        const char *sl = strrchr(fallback_uri, '/');
        snprintf(tr->title, sizeof(tr->title), "%.159s", (sl && sl[1]) ? sl + 1 : fallback_uri);
      }
      tr->is_radio = is_radio;
      st->track_count = 1;
      st->current_index = 0;
    }
  }

  if (st->track_count > 0) {
    if (st->current_index < 0 || st->current_index >= st->track_count) {
      st->current_index = 0;
    }
  } else {
    st->current_index = 0;
    if (!has_auto_play) st->auto_play = false;
  }

  return st->track_count > 0;
}

static bool bg_mp_load_json_file(const char *path, BgMpState *st) {
  if (!path || !path[0] || !st) return false;
  FILE *f = fopen(path, "rb");
  if (!f) return false;
  if (fseek(f, 0, SEEK_END) != 0) {
    fclose(f);
    return false;
  }
  long sz = ftell(f);
  if (sz <= 0 || sz > BG_MP_MAX_JSON) {
    fclose(f);
    return false;
  }
  rewind(f);
  char *buf = (char *)malloc((size_t)sz + 1);
  if (!buf) {
    fclose(f);
    return false;
  }
  size_t nr = fread(buf, 1, (size_t)sz, f);
  fclose(f);
  buf[nr] = 0;
  bool ok = bg_mp_parse_json_buf(buf, st);
  free(buf);
  return ok;
}

/* ==================== STATE MACHINE (UNIT-TESTABLE) ==================== */

static unsigned int bg_mp_handle_action(BgMpState *st, BgMpAction act) {
  if (!st || act == BG_ACT_NONE) return BG_RES_NONE;
  unsigned int res = BG_RES_NONE;

  if (act == BG_ACT_SELECT_R2) {
    if (!st->overlay_open) {
      st->overlay_open = true;
      res |= BG_RES_OPEN_OVERLAY | BG_RES_REDRAW;
      if (!st->started && st->track_count > 0) {
        st->started = true;
        st->paused = false;
        res |= BG_RES_TRACK_CHANGED;
      }
    } else {
      st->overlay_open = false;
      res |= BG_RES_CLOSE_OVERLAY;
    }
    return res;
  }

  if (act == BG_ACT_SELECT_L2) {
    if (st->track_count > 0) {
      st->current_index = (st->current_index + st->track_count - 1) % st->track_count;
      st->started = true;
      st->paused = false;
      res |= BG_RES_TRACK_CHANGED;
      if (st->overlay_open) res |= BG_RES_REDRAW;
    }
    return res;
  }

  if (!st->overlay_open) {
    /* Mini-Player is closed: ignore normal game buttons R2, L2, B, A, UP, DOWN */
    return BG_RES_NONE;
  }

  switch (act) {
    case BG_ACT_R2:
      if (st->track_count > 0) {
        st->current_index = (st->current_index + 1) % st->track_count;
        st->started = true;
        st->paused = false;
        res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
      }
      break;
    case BG_ACT_L2:
      if (st->track_count > 0) {
        st->current_index = (st->current_index + st->track_count - 1) % st->track_count;
        st->started = true;
        st->paused = false;
        res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
      }
      break;
    case BG_ACT_TOGGLE_PAUSE:
      if (st->track_count > 0) {
        if (!st->started) {
          st->started = true;
          st->paused = false;
          res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
        } else {
          st->paused = !st->paused;
          res |= BG_RES_PAUSE_TOGGLED | BG_RES_REDRAW;
        }
      }
      break;
    case BG_ACT_VOL_UP:
      if (st->volume_pct < 100) {
        st->volume_pct += 10;
        if (st->volume_pct > 100) st->volume_pct = 100;
        res |= BG_RES_VOLUME_CHANGED | BG_RES_REDRAW;
      }
      break;
    case BG_ACT_VOL_DOWN:
      if (st->volume_pct > 10) {
        st->volume_pct -= 10;
        if (st->volume_pct < 10) st->volume_pct = 10;
        res |= BG_RES_VOLUME_CHANGED | BG_RES_REDRAW;
      }
      break;
    case BG_ACT_CLOSE:
      st->overlay_open = false;
      res |= BG_RES_CLOSE_OVERLAY;
      break;
    default:
      break;
  }
  return res;
}

#ifndef KPLAYER_BG_MINIPLAYER_TEST_ONLY

/* ==================== BUILT-IN 5x7 BITMAP FONT FOR /dev/fb0 ==================== */

static void bg_font_rows(unsigned char ch, uint8_t rows[7]) {
  static const struct {
    char c;
    uint8_t r[7];
  } tbl[] = {
      {' ', {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}},
      {'!', {0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04}},
      {'%', {0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13}},
      {'(', {0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02}},
      {')', {0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08}},
      {'+', {0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00}},
      {'-', {0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00}},
      {'.', {0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x06}},
      {'/', {0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10}},
      {':', {0x00, 0x06, 0x06, 0x00, 0x06, 0x06, 0x00}},
      {'[', {0x0E, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0E}},
      {']', {0x0E, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0E}},
      {'|', {0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04}},
      {'^', {0x04, 0x0A, 0x11, 0x00, 0x00, 0x00, 0x00}},
      {'v', {0x00, 0x00, 0x00, 0x00, 0x11, 0x0A, 0x04}},
      {'<', {0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02}},
      {'>', {0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08}},
      {'_', {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F}},
      {'0', {0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E}},
      {'1', {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E}},
      {'2', {0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F}},
      {'3', {0x1F, 0x02, 0x04, 0x06, 0x01, 0x11, 0x0E}},
      {'4', {0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02}},
      {'5', {0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E}},
      {'6', {0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E}},
      {'7', {0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08}},
      {'8', {0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E}},
      {'9', {0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C}},
      {'A', {0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}},
      {'B', {0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E}},
      {'C', {0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E}},
      {'D', {0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C}},
      {'E', {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F}},
      {'F', {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10}},
      {'G', {0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F}},
      {'H', {0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}},
      {'I', {0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E}},
      {'J', {0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C}},
      {'K', {0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11}},
      {'L', {0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F}},
      {'M', {0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11}},
      {'N', {0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11}},
      {'O', {0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}},
      {'P', {0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10}},
      {'Q', {0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D}},
      {'R', {0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11}},
      {'S', {0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E}},
      {'T', {0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04}},
      {'U', {0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}},
      {'V', {0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04}},
      {'W', {0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11}},
      {'X', {0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11}},
      {'Y', {0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04}},
      {'Z', {0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F}},
  };
  char up = (ch >= 'a' && ch <= 'z' && ch != 'v') ? (char)(ch - 32) : (char)ch;
  for (size_t i = 0; i < sizeof(tbl) / sizeof(tbl[0]); i++) {
    if (tbl[i].c == up) {
      memcpy(rows, tbl[i].r, 7);
      return;
    }
  }
  static const uint8_t fallback[7] = {0x0E, 0x11, 0x02, 0x04, 0x04, 0x00, 0x04};
  memcpy(rows, fallback, 7);
}

static void bg_utf8_to_ascii(const char *src, char *dst, size_t cap) {
  if (!dst || cap == 0) return;
  size_t out = 0;
  for (size_t i = 0; src && src[i] && out + 1 < cap; i++) {
    unsigned char c = (unsigned char)src[i];
    if (c < 0x80) {
      dst[out++] = (c >= 32) ? (char)c : ' ';
    } else if (c == 0xC3 && src[i + 1]) {
      unsigned char n = (unsigned char)src[++i];
      char mapped = ' ';
      if ((n >= 0x80 && n <= 0x85) || (n >= 0xA0 && n <= 0xA5)) mapped = 'A';
      else if (n == 0x87 || n == 0xA7) mapped = 'C';
      else if ((n >= 0x88 && n <= 0x8B) || (n >= 0xA8 && n <= 0xAB)) mapped = 'E';
      else if ((n >= 0x8C && n <= 0x8F) || (n >= 0xAC && n <= 0xAF)) mapped = 'I';
      else if (n == 0x91 || n == 0xB1) mapped = 'N';
      else if ((n >= 0x92 && n <= 0x96) || (n >= 0xB2 && n <= 0xB6)) mapped = 'O';
      else if ((n >= 0x99 && n <= 0x9C) || (n >= 0xB9 && n <= 0xBC)) mapped = 'U';
      else if (n == 0x9D || n == 0xBD || n == 0xBF) mapped = 'Y';
      dst[out++] = mapped;
    } else if (c == 0xE2 && src[i + 1] && src[i + 2]) {
      i += 2;
      dst[out++] = '-';
    }
  }
  dst[out] = 0;
}

/* ==================== DIRECT /dev/fb0 OVERLAY RENDERER ==================== */

typedef struct {
  int fd;
  uint8_t *map;
  size_t map_len;
  struct fb_var_screeninfo vinfo;
  struct fb_fix_screeninfo finfo;
  int box_x;
  int box_y;
  int box_w;
  int box_h;
  uint8_t *saved_pixels;
  size_t saved_row_bytes;
  bool has_saved;
} BgFbOverlay;

static void bg_fb_put_pixel(BgFbOverlay *fb, int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  if (!fb || !fb->map) return;
  if (x < 0 || y < 0 || x >= (int)fb->vinfo.xres || y >= (int)fb->vinfo.yres) return;
  size_t bpp = fb->vinfo.bits_per_pixel / 8;
  size_t off = ((size_t)(y + (int)fb->vinfo.yoffset) * fb->finfo.line_length) +
               ((size_t)(x + (int)fb->vinfo.xoffset) * bpp);
  if (off + bpp > fb->map_len) return;
  if (fb->vinfo.bits_per_pixel == 32) {
    uint32_t px = ((uint32_t)r << fb->vinfo.red.offset) |
                  ((uint32_t)g << fb->vinfo.green.offset) |
                  ((uint32_t)b << fb->vinfo.blue.offset);
    if (fb->vinfo.transp.length > 0) {
      px |= (0xFFu << fb->vinfo.transp.offset);
    }
    memcpy(fb->map + off, &px, 4);
  } else if (fb->vinfo.bits_per_pixel == 16) {
    uint16_t px = (uint16_t)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
    memcpy(fb->map + off, &px, 2);
  }
}

static void bg_fb_fill_rect(BgFbOverlay *fb, int x, int y, int w, int h,
                            uint8_t r, uint8_t g, uint8_t b) {
  for (int yy = y; yy < y + h; yy++) {
    for (int xx = x; xx < x + w; xx++) {
      bg_fb_put_pixel(fb, xx, yy, r, g, b);
    }
  }
}

static void bg_fb_draw_text(BgFbOverlay *fb, int x, int y, int scale, int max_w,
                            const char *utf8_text, uint8_t r, uint8_t g, uint8_t b) {
  char asc[192];
  bg_utf8_to_ascii(utf8_text, asc, sizeof(asc));
  int step = 6 * scale;
  int cx = x;
  for (size_t i = 0; asc[i]; i++) {
    if (max_w > 0 && (cx - x) + step > max_w) break;
    uint8_t rows[7];
    bg_font_rows((unsigned char)asc[i], rows);
    for (int ry = 0; ry < 7; ry++) {
      for (int rx = 0; rx < 5; rx++) {
        if (rows[ry] & (1u << (4 - rx))) {
          bg_fb_fill_rect(fb, cx + rx * scale, y + ry * scale, scale, scale, r, g, b);
        }
      }
    }
    cx += step;
  }
}

static bool bg_fb_open(BgFbOverlay *fb) {
  memset(fb, 0, sizeof(*fb));
  fb->fd = -1;
  fb->fd = open("/dev/fb0", O_RDWR | O_CLOEXEC);
  if (fb->fd < 0) return false;
  if (ioctl(fb->fd, FBIOGET_FSCREENINFO, &fb->finfo) < 0 ||
      ioctl(fb->fd, FBIOGET_VSCREENINFO, &fb->vinfo) < 0) {
    close(fb->fd);
    fb->fd = -1;
    return false;
  }
  if ((fb->vinfo.bits_per_pixel != 32 && fb->vinfo.bits_per_pixel != 16) ||
      fb->vinfo.xres < 240 || fb->vinfo.yres < 180) {
    close(fb->fd);
    fb->fd = -1;
    return false;
  }
  fb->map_len = (size_t)fb->finfo.smem_len;
  if (fb->map_len == 0) {
    fb->map_len = (size_t)fb->finfo.line_length * fb->vinfo.yres_virtual;
  }
  fb->map = (uint8_t *)mmap(NULL, fb->map_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb->fd, 0);
  if (fb->map == MAP_FAILED) {
    fb->map = NULL;
    close(fb->fd);
    fb->fd = -1;
    return false;
  }
  int sw = (int)fb->vinfo.xres;
  int sh = (int)fb->vinfo.yres;
  fb->box_w = sw - 32;
  if (fb->box_w > 580) fb->box_w = 580;
  if (fb->box_w < 220) fb->box_w = sw - 8;
  fb->box_h = 122;
  if (fb->box_h > sh - 16) fb->box_h = sh - 16;
  fb->box_x = (sw - fb->box_w) / 2;
  fb->box_y = sh - fb->box_h - 14;
  if (fb->box_y < 4) fb->box_y = 4;

  size_t bpp = fb->vinfo.bits_per_pixel / 8;
  fb->saved_row_bytes = (size_t)fb->box_w * bpp;
  fb->saved_pixels = (uint8_t *)malloc(fb->saved_row_bytes * (size_t)fb->box_h);
  if (fb->saved_pixels) {
    for (int row = 0; row < fb->box_h; row++) {
      size_t off = ((size_t)(fb->box_y + row + (int)fb->vinfo.yoffset) * fb->finfo.line_length) +
                   ((size_t)(fb->box_x + (int)fb->vinfo.xoffset) * bpp);
      if (off + fb->saved_row_bytes <= fb->map_len) {
        memcpy(fb->saved_pixels + (size_t)row * fb->saved_row_bytes,
               fb->map + off, fb->saved_row_bytes);
      }
    }
    fb->has_saved = true;
  }
  return true;
}

static void bg_fb_render(BgFbOverlay *fb, const BgMpState *st) {
  if (!fb || !fb->map || !st) return;
  int x = fb->box_x;
  int y = fb->box_y;
  int w = fb->box_w;
  int h = fb->box_h;
  uint8_t ar = st->accent_r, ag = st->accent_g, ab = st->accent_b;

  /* Dark opaque card with theme accent border */
  bg_fb_fill_rect(fb, x, y, w, h, 14, 17, 23);
  bg_fb_fill_rect(fb, x, y, w, 4, ar, ag, ab);
  bg_fb_fill_rect(fb, x, y + h - 2, w, 2, ar, ag, ab);
  bg_fb_fill_rect(fb, x, y, 2, h, ar, ag, ab);
  bg_fb_fill_rect(fb, x + w - 2, y, 2, h, ar, ag, ab);

  /* Header row */
  const BgMpTrack *cur = (st->track_count > 0) ? &st->tracks[st->current_index] : NULL;
  char header[128];
  snprintf(header, sizeof(header), "K PLAYER MINI  %s  %s %d/%d",
           st->paused ? "[PAUSADO]" : "[TOCANDO]",
           (cur && cur->is_radio) ? "RADIO" : "FAIXA",
           st->track_count > 0 ? st->current_index + 1 : 0,
           st->track_count);
  int title_scale = (w >= 460) ? 2 : 1;
  bg_fb_draw_text(fb, x + 14, y + 12, 1, w - 28, header, ar, ag, ab);

  /* Track / Station title */
  const char *tname = cur ? cur->title : "Nenhuma faixa disponivel";
  bg_fb_draw_text(fb, x + 14, y + 30, title_scale, w - 28, tname, 245, 248, 255);

  /* Volume bar */
  int bar_y = y + (title_scale == 2 ? 56 : 48);
  int bar_x = x + 14;
  int bar_w = w - 120;
  if (bar_w < 80) bar_w = 80;
  bg_fb_fill_rect(fb, bar_x, bar_y + 2, bar_w, 8, 38, 44, 58);
  int fill_w = (bar_w * st->volume_pct) / 100;
  if (fill_w > 0) bg_fb_fill_rect(fb, bar_x, bar_y + 2, fill_w, 8, ar, ag, ab);
  char vol_txt[32];
  snprintf(vol_txt, sizeof(vol_txt), "VOL %d%%", st->volume_pct);
  bg_fb_draw_text(fb, bar_x + bar_w + 10, bar_y + 2, 1, 96, vol_txt, 220, 228, 240);

  /* Divider & bottom control legend */
  int div_y = y + h - 34;
  bg_fb_fill_rect(fb, x + 12, div_y, w - 24, 1, 45, 52, 68);
  bg_fb_draw_text(fb, x + 14, div_y + 10, 1, w - 28,
                  "L2 VOLTAR  R2 PROXIMA  B PAUSA  ^v VOL  A FECHAR",
                  185, 196, 214);
}

static void bg_fb_close(BgFbOverlay *fb) {
  if (!fb) return;
  if (fb->map && fb->has_saved && fb->saved_pixels) {
    size_t bpp = fb->vinfo.bits_per_pixel / 8;
    for (int row = 0; row < fb->box_h; row++) {
      size_t off = ((size_t)(fb->box_y + row + (int)fb->vinfo.yoffset) * fb->finfo.line_length) +
                   ((size_t)(fb->box_x + (int)fb->vinfo.xoffset) * bpp);
      if (off + fb->saved_row_bytes <= fb->map_len) {
        memcpy(fb->map + off,
               fb->saved_pixels + (size_t)row * fb->saved_row_bytes,
               fb->saved_row_bytes);
      }
    }
  }
  free(fb->saved_pixels);
  fb->saved_pixels = NULL;
  fb->has_saved = false;
  if (fb->map) {
    munmap(fb->map, fb->map_len);
    fb->map = NULL;
  }
  if (fb->fd >= 0) {
    close(fb->fd);
    fb->fd = -1;
  }
}

/* ==================== LINUX EVDEV GAMEPAD LISTENER ==================== */

typedef struct {
  int fds[BG_MP_MAX_EVDEV];
  int count;
  bool grabbed;
  bool select_held;
  bool r2_held;
  bool l2_held;
  int hat_y;
} BgEvdevSet;

static bool bg_evdev_has_bit(const unsigned long *bits, int bit) {
  return (bits[bit / (int)(8 * sizeof(unsigned long))] &
          (1UL << (bit % (int)(8 * sizeof(unsigned long))))) != 0;
}

static void bg_evdev_open_all(BgEvdevSet *ev) {
  memset(ev, 0, sizeof(*ev));
  for (int i = 0; i < BG_MP_MAX_EVDEV; i++) ev->fds[i] = -1;
  for (int idx = 0; idx < 24 && ev->count < BG_MP_MAX_EVDEV; idx++) {
    char path[64];
    snprintf(path, sizeof(path), "/dev/input/event%d", idx);
    int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) continue;
    unsigned long evbits[4];
    memset(evbits, 0, sizeof(evbits));
    if (ioctl(fd, EVIOCGBIT(0, sizeof(evbits)), evbits) < 0 ||
        !bg_evdev_has_bit(evbits, EV_KEY)) {
      close(fd);
      continue;
    }
    /* Skip devices that don't expose gamepad or keyboard keys */
    char name[96] = "";
    if (ioctl(fd, EVIOCGNAME(sizeof(name)), name) >= 0) {
      if (strstr(name, "Power Button") || strstr(name, "pwrkey") ||
          strstr(name, "rk805")) {
        close(fd);
        continue;
      }
    }
    ev->fds[ev->count++] = fd;
  }
}

static void bg_evdev_set_grab(BgEvdevSet *ev, bool grab) {
  if (!ev || ev->grabbed == grab) return;
  for (int i = 0; i < ev->count; i++) {
    if (ev->fds[i] >= 0) {
      (void)ioctl(ev->fds[i], EVIOCGRAB, grab ? 1 : 0);
    }
  }
  ev->grabbed = grab;
}

static void bg_evdev_close_all(BgEvdevSet *ev) {
  if (!ev) return;
  bg_evdev_set_grab(ev, false);
  for (int i = 0; i < ev->count; i++) {
    if (ev->fds[i] >= 0) {
      close(ev->fds[i]);
      ev->fds[i] = -1;
    }
  }
  ev->count = 0;
}

static bool bg_code_is_select(uint16_t code) {
  return code == BTN_SELECT || code == BTN_TRIGGER_HAPPY1 || code == KEY_F1;
}
static bool bg_code_is_start(uint16_t code) {
  return code == BTN_START || code == BTN_TRIGGER_HAPPY2 || code == KEY_TAB;
}
static bool bg_code_is_r2(uint16_t code) {
  return code == BTN_TR2 || code == BTN_TRIGGER_HAPPY4 || code == KEY_PAGEDOWN;
}
static bool bg_code_is_l2(uint16_t code) {
  return code == BTN_TL2 || code == BTN_TRIGGER_HAPPY3 || code == KEY_PAGEUP;
}
static bool bg_code_is_pause(uint16_t code) {
  return code == BTN_SOUTH || code == KEY_ENTER || bg_code_is_start(code);
}
static bool bg_code_is_close(uint16_t code) {
  return code == BTN_EAST || code == KEY_BACKSPACE || code == KEY_ESC;
}
static bool bg_code_is_up(uint16_t code) {
  return code == BTN_DPAD_UP || code == KEY_UP;
}
static bool bg_code_is_down(uint16_t code) {
  return code == BTN_DPAD_DOWN || code == KEY_DOWN;
}

static BgMpAction bg_evdev_poll_action(BgEvdevSet *ev) {
  if (!ev) return BG_ACT_NONE;
  struct input_event ie;
  for (int i = 0; i < ev->count; i++) {
    int fd = ev->fds[i];
    if (fd < 0) continue;
    while (read(fd, &ie, sizeof(ie)) == (ssize_t)sizeof(ie)) {
      if (ie.type == EV_KEY) {
        bool pressed = (ie.value == 1);
        bool released = (ie.value == 0);
        if (bg_code_is_select(ie.code)) {
          if (pressed) {
            ev->select_held = true;
            if (ev->r2_held) return BG_ACT_SELECT_R2;
            if (ev->l2_held) return BG_ACT_SELECT_L2;
          } else if (released) {
            ev->select_held = false;
          }
        } else if (bg_code_is_r2(ie.code)) {
          if (pressed) {
            ev->r2_held = true;
            return ev->select_held ? BG_ACT_SELECT_R2 : BG_ACT_R2;
          } else if (released) {
            ev->r2_held = false;
          }
        } else if (bg_code_is_l2(ie.code)) {
          if (pressed) {
            ev->l2_held = true;
            return ev->select_held ? BG_ACT_SELECT_L2 : BG_ACT_L2;
          } else if (released) {
            ev->l2_held = false;
          }
        } else if (pressed) {
          if (bg_code_is_pause(ie.code)) return BG_ACT_TOGGLE_PAUSE;
          if (bg_code_is_close(ie.code)) return BG_ACT_CLOSE;
          if (bg_code_is_up(ie.code)) return BG_ACT_VOL_UP;
          if (bg_code_is_down(ie.code)) return BG_ACT_VOL_DOWN;
        }
      } else if (ie.type == EV_ABS) {
        if (ie.code == ABS_HAT0Y) {
          int prev = ev->hat_y;
          ev->hat_y = ie.value;
          if (ie.value < 0 && prev >= 0) return BG_ACT_VOL_UP;
          if (ie.value > 0 && prev <= 0) return BG_ACT_VOL_DOWN;
        } else if (ie.code == ABS_RZ) {
          bool active_r2 = (ie.value > 64);
          if (active_r2 && !ev->r2_held) {
            ev->r2_held = true;
            return ev->select_held ? BG_ACT_SELECT_R2 : BG_ACT_R2;
          } else if (!active_r2) {
            ev->r2_held = false;
          }
        } else if (ie.code == ABS_Z) {
          bool active_l2 = (ie.value > 64);
          if (active_l2 && !ev->l2_held) {
            ev->l2_held = true;
            return ev->select_held ? BG_ACT_SELECT_L2 : BG_ACT_L2;
          } else if (!active_l2) {
            ev->l2_held = false;
          }
        }
      }
    }
  }
  return BG_ACT_NONE;
}

/* ==================== HEADLESS LIBVLC DAEMON ENTRY POINT ==================== */

static volatile sig_atomic_t bg_mp_running = 1;

static void bg_mp_on_signal(int sig) {
  (void)sig;
  bg_mp_running = 0;
}

static void bg_mp_signal_game(pid_t game_pid, int sig) {
  if (game_pid <= 1) return;
  if (kill(-game_pid, sig) != 0) {
    (void)kill(game_pid, sig);
  }
}

static bool bg_mp_game_alive(pid_t game_pid) {
  if (game_pid <= 1) return true;
  if (kill(game_pid, 0) == 0) return true;
  return errno != ESRCH;
}

static void bg_mp_apply_volume(libvlc_media_player_t *mp, int volume_pct) {
  if (!mp || !p_libvlc_audio_set_volume) return;
  if (volume_pct < 10) volume_pct = 10;
  if (volume_pct > 100) volume_pct = 100;
  (void)libvlc_audio_set_volume(mp, volume_pct);
}

static void bg_mp_play_current(libvlc_instance_t *inst, libvlc_media_player_t *mp,
                               const BgMpState *st, long long seek_ms) {
  if (!inst || !mp || !st || st->track_count <= 0) return;
  const BgMpTrack *tr = &st->tracks[st->current_index];
  libvlc_media_player_stop(mp);
  libvlc_media_t *m = tr->is_radio
                          ? libvlc_media_new_location(inst, tr->uri)
                          : libvlc_media_new_path(inst, tr->uri);
  if (!m) {
    fprintf(stderr, "bg_miniplayer: falha ao abrir midia: %s\n", tr->uri);
    return;
  }
  libvlc_media_player_set_media(mp, m);
  libvlc_media_release(m);
  if (libvlc_media_player_play(mp) != 0) {
    fprintf(stderr, "bg_miniplayer: libvlc_media_player_play falhou (%s)\n",
            libvlc_errmsg() ? libvlc_errmsg() : "erro");
    return;
  }
  if (!tr->is_radio && seek_ms > 0) {
    libvlc_media_player_set_time(mp, (libvlc_time_t)seek_ms);
  }
  bg_mp_apply_volume(mp, st->volume_pct);
}

static libvlc_instance_t *bg_mp_create_vlc(void) {
  const char *aout = getenv("KPLAYER_BG_AOUT");
  const char *alsa_dev = getenv("KPLAYER_BG_ALSA_DEV");
  if (!alsa_dev || !alsa_dev[0]) alsa_dev = "default";

  libvlc_instance_t *inst = NULL;
  if (aout && !strcmp(aout, "pulse")) {
    const char *args[] = {
        "--no-video",
        "--quiet",
        "--no-xlib",
        "--aout=pulse",
        "--network-caching=1500",
        "--file-caching=500",
    };
    inst = libvlc_new((int)(sizeof(args) / sizeof(args[0])), args);
  } else if (aout && !strcmp(aout, "alsa")) {
    char dev_arg[128];
    snprintf(dev_arg, sizeof(dev_arg), "--alsa-audio-device=%.96s", alsa_dev);
    const char *args[] = {
        "--no-video",
        "--quiet",
        "--no-xlib",
        "--aout=alsa",
        dev_arg,
        "--network-caching=1500",
        "--file-caching=500",
    };
    inst = libvlc_new((int)(sizeof(args) / sizeof(args[0])), args);
  }

  if (!inst) {
    const char *fallback_args[] = {
        "--no-video",
        "--quiet",
        "--no-xlib",
        "--network-caching=1500",
        "--file-caching=500",
    };
    inst = libvlc_new((int)(sizeof(fallback_args) / sizeof(fallback_args[0])),
                      fallback_args);
  }
  return inst;
}

static int bg_miniplayer_main(const char *json_path, pid_t game_pid) {
  bg_mp_running = 1;
  signal(SIGINT, bg_mp_on_signal);
  signal(SIGTERM, bg_mp_on_signal);
  signal(SIGPIPE, SIG_IGN);

  BgMpState st;
  if (!bg_mp_load_json_file(json_path, &st)) {
    fprintf(stderr, "bg_miniplayer: nenhuma faixa valida em %s\n",
            json_path ? json_path : "(nulo)");
    return 1;
  }

  if (!load_vlc()) {
    fprintf(stderr, "bg_miniplayer: falha ao carregar libvlc.so.5\n");
    return 1;
  }

  libvlc_instance_t *inst = bg_mp_create_vlc();
  if (!inst) {
    fprintf(stderr, "bg_miniplayer: libvlc_new falhou: %s\n",
            libvlc_errmsg() ? libvlc_errmsg() : "erro desconhecido");
    return 1;
  }
  libvlc_set_user_agent(inst, "KPlayer/2.1.4 (R36S Background)", "KPlayer/2.1.4");
  libvlc_media_player_t *mp = libvlc_media_player_new(inst);
  if (!mp) {
    libvlc_release(inst);
    return 1;
  }

  BgEvdevSet ev;
  bg_evdev_open_all(&ev);
  BgFbOverlay fb;
  memset(&fb, 0, sizeof(fb));
  fb.fd = -1;
  bool game_stopped = false;
  int vol_sync_ticks = 0;

  if (st.auto_play && st.track_count > 0) {
    st.started = true;
    st.paused = false;
    bg_mp_play_current(inst, mp, &st, st.initial_pos_ms);
    vol_sync_ticks = 18; /* Re-apply volume after VLC opens audio sink */
  }

  fprintf(stderr,
          "bg_miniplayer: pronto (%d faixa(s), vol=%d%%, evdev=%d, game_pid=%ld, auto=%d)\n",
          st.track_count, st.volume_pct, ev.count, (long)game_pid, st.auto_play ? 1 : 0);

  struct timespec ts = {0, 25000000L}; /* 25ms loop = 40Hz responsive hotkeys */
  while (bg_mp_running) {
    if (!bg_mp_game_alive(game_pid)) break;

    if (vol_sync_ticks > 0) {
      vol_sync_ticks--;
      if (vol_sync_ticks == 0 || vol_sync_ticks == 9) {
        bg_mp_apply_volume(mp, st.volume_pct);
      }
    }

    /* Auto-advance when a local track finishes */
    if (st.started && !st.paused && st.track_count > 0) {
      libvlc_state_t vstate = libvlc_media_player_get_state(mp);
      if (vstate == libvlc_Ended) {
        st.current_index = (st.current_index + 1) % st.track_count;
        bg_mp_play_current(inst, mp, &st, 0);
        vol_sync_ticks = 14;
        if (st.overlay_open && fb.map) {
          bg_fb_render(&fb, &st);
        }
      }
    }

    BgMpAction act = bg_evdev_poll_action(&ev);
    if (act != BG_ACT_NONE) {
      unsigned int flags = bg_mp_handle_action(&st, act);
      if (flags & BG_RES_OPEN_OVERLAY) {
        bg_evdev_set_grab(&ev, true);
        if (game_pid > 1 && !game_stopped) {
          bg_mp_signal_game(game_pid, SIGSTOP);
          game_stopped = true;
        }
        (void)bg_fb_open(&fb);
      }
      if (flags & BG_RES_TRACK_CHANGED) {
        bg_mp_play_current(inst, mp, &st, 0);
        vol_sync_ticks = 14;
      }
      if (flags & BG_RES_PAUSE_TOGGLED) {
        libvlc_media_player_set_pause(mp, st.paused ? 1 : 0);
      }
      if (flags & BG_RES_VOLUME_CHANGED) {
        bg_mp_apply_volume(mp, st.volume_pct);
      }
      if ((flags & BG_RES_REDRAW) && st.overlay_open && fb.map) {
        bg_fb_render(&fb, &st);
      }
      if (flags & BG_RES_CLOSE_OVERLAY) {
        bg_fb_close(&fb);
        bg_evdev_set_grab(&ev, false);
        if (game_stopped) {
          bg_mp_signal_game(game_pid, SIGCONT);
          game_stopped = false;
        }
      }
    }

    nanosleep(&ts, NULL);
  }

  /* Guaranteed safe teardown: never leave game frozen or gamepad grabbed */
  bg_fb_close(&fb);
  bg_evdev_close_all(&ev);
  if (game_stopped) {
    bg_mp_signal_game(game_pid, SIGCONT);
    game_stopped = false;
  }
  libvlc_media_player_stop(mp);
  libvlc_media_player_release(mp);
  libvlc_release(inst);
  return 0;
}

#endif /* KPLAYER_BG_MINIPLAYER_TEST_ONLY */
#endif /* KPLAYER_BG_MINIPLAYER_H */
