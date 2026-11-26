#ifndef KPLAYER_BG_MINIPLAYER_H
#define KPLAYER_BG_MINIPLAYER_H

/*
 * KPlayer R36S Headless Background Audio + Native KPlayer Mini-Player (v2.1.7)
 *
 * Runs as `./kplayer --bg-audio <handoff.json> [game_pid]` without SDL2.
 * Uses KPlayer's bundled libvlc.so.5 directly over PulseAudio/PipeWire or
 * ALSA dmix, polls Linux evdev hardware state via EVIOCGKEY/EVIOCGABS
 * (immune to gptokeyb's EVIOCGRAB) using exact SDL_GAMECONTROLLERCONFIG
 * button mappings, and displays the KPlayer Mini-Player via:
 *   1) Shared-memory GLES2/EGL/SDL2 overlay (`libkp_overlay.so`, KMS/DRM safe)
 *   2) Automatic `/dev/fb0` fallback if no GLES/SDL frame is presented in 260ms
 *
 * Controls:
 *   Closed:
 *     L3 + R3            -> Open KPlayer Mini-Player (click both sticks)
 *   Open:
 *     UP / DOWN          -> Move cursor (5 items)
 *     LEFT / RIGHT       -> Adjust Volume (+/- 10%) or switch track on track rows
 *     B / START          -> Confirm highlighted option
 *     R2 / L2            -> Instant Next / Previous track from any row
 *     A / L3 + R3        -> Hide Mini-Player
 */

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <linux/fb.h>
#include <linux/input.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include "kp_overlay_shared.h"

#define BG_MP_MAX_TRACKS 128
#define BG_MP_MAX_EVDEV 16
#define BG_MP_MAX_JSON (256 * 1024)
#define BG_MP_MAX_CODES 128
#define BG_MP_DEBOUNCE_MS 180

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
  int selected_row;
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
  BG_ACT_L3_R3,
  BG_ACT_NAV_UP,
  BG_ACT_NAV_DOWN,
  BG_ACT_NAV_LEFT,
  BG_ACT_NAV_RIGHT,
  BG_ACT_CONFIRM,
  BG_ACT_R2,
  BG_ACT_L2,
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

typedef struct {
  bool valid;
  int l3_btn;     /* SDL 'leftstick'  (R36S L3 click) */
  int r3_btn;     /* SDL 'rightstick' (R36S R3 click) */
  int back_btn;
  int guide_btn;
  int start_btn;
  int l2_btn;
  int l2_axis;
  int r2_btn;
  int r2_axis;
  int a_btn;      /* SDL 'a' = south button (R36S B = confirm) */
  int b_btn;      /* SDL 'b' = east button  (R36S A = close) */
  int dpup_btn;
  int dpdown_btn;
  int dpleft_btn;
  int dpright_btn;
  bool dpad_hat;
} BgSdlMap;

/* ==================== SDL_GAMECONTROLLERCONFIG PARSER ==================== */

static void bg_sdl_map_reset(BgSdlMap *m) {
  if (!m) return;
  m->valid = false;
  m->l3_btn = -1;
  m->r3_btn = -1;
  m->back_btn = -1;
  m->guide_btn = -1;
  m->start_btn = -1;
  m->l2_btn = -1;
  m->l2_axis = -1;
  m->r2_btn = -1;
  m->r2_axis = -1;
  m->a_btn = -1;
  m->b_btn = -1;
  m->dpup_btn = -1;
  m->dpdown_btn = -1;
  m->dpleft_btn = -1;
  m->dpright_btn = -1;
  m->dpad_hat = false;
}

static bool bg_str_icontains(const char *hay, const char *needle) {
  if (!hay || !needle || !needle[0]) return false;
  size_t nlen = strlen(needle);
  for (const char *p = hay; *p; p++) {
    size_t i = 0;
    while (i < nlen && p[i] &&
           tolower((unsigned char)p[i]) == tolower((unsigned char)needle[i])) {
      i++;
    }
    if (i == nlen) return true;
  }
  return false;
}

static void bg_sdl_parse_binding(const char *val, int *out_btn, int *out_axis, bool *out_hat) {
  if (!val || !val[0]) return;
  if (val[0] == 'b' && isdigit((unsigned char)val[1])) {
    if (out_btn) *out_btn = atoi(val + 1);
  } else if ((val[0] == 'a' || val[0] == '+' || val[0] == '-') && out_axis) {
    const char *p = (val[0] == '+' || val[0] == '-') ? val + 1 : val;
    if (*p == 'a' && isdigit((unsigned char)p[1])) {
      *out_axis = atoi(p + 1);
    }
  } else if (val[0] == 'h' && out_hat) {
    *out_hat = true;
  }
}

static bool bg_sdl_parse_line(const char *line, size_t len,
                              char *name_out, size_t name_cap, BgSdlMap *m) {
  bg_sdl_map_reset(m);
  if (name_out && name_cap > 0) name_out[0] = 0;
  if (!line || len < 16) return false;

  const char *end = line + len;
  const char *c1 = (const char *)memchr(line, ',', (size_t)(end - line));
  if (!c1 || c1 + 1 >= end) return false;
  const char *c2 = (const char *)memchr(c1 + 1, ',', (size_t)(end - (c1 + 1)));
  if (!c2) return false;

  if (name_out && name_cap > 1) {
    size_t nlen = (size_t)(c2 - (c1 + 1));
    if (nlen >= name_cap) nlen = name_cap - 1;
    memcpy(name_out, c1 + 1, nlen);
    name_out[nlen] = 0;
  }

  const char *p = c2 + 1;
  while (p < end) {
    const char *comma = (const char *)memchr(p, ',', (size_t)(end - p));
    const char *tok_end = comma ? comma : end;
    const char *colon = (const char *)memchr(p, ':', (size_t)(tok_end - p));
    if (colon && colon > p && colon + 1 < tok_end) {
      char key[32], val[32];
      size_t klen = (size_t)(colon - p);
      size_t vlen = (size_t)(tok_end - (colon + 1));
      if (klen < sizeof(key) && vlen < sizeof(val)) {
        memcpy(key, p, klen);
        key[klen] = 0;
        memcpy(val, colon + 1, vlen);
        val[vlen] = 0;
        if (!strcmp(key, "leftstick")) {
          bg_sdl_parse_binding(val, &m->l3_btn, NULL, NULL);
        } else if (!strcmp(key, "rightstick")) {
          bg_sdl_parse_binding(val, &m->r3_btn, NULL, NULL);
        } else if (!strcmp(key, "back")) {
          bg_sdl_parse_binding(val, &m->back_btn, NULL, NULL);
        } else if (!strcmp(key, "guide")) {
          bg_sdl_parse_binding(val, &m->guide_btn, NULL, NULL);
        } else if (!strcmp(key, "start")) {
          bg_sdl_parse_binding(val, &m->start_btn, NULL, NULL);
        } else if (!strcmp(key, "lefttrigger")) {
          bg_sdl_parse_binding(val, &m->l2_btn, &m->l2_axis, NULL);
        } else if (!strcmp(key, "righttrigger")) {
          bg_sdl_parse_binding(val, &m->r2_btn, &m->r2_axis, NULL);
        } else if (!strcmp(key, "a")) {
          bg_sdl_parse_binding(val, &m->a_btn, NULL, NULL);
        } else if (!strcmp(key, "b")) {
          bg_sdl_parse_binding(val, &m->b_btn, NULL, NULL);
        } else if (!strcmp(key, "dpup")) {
          bg_sdl_parse_binding(val, &m->dpup_btn, NULL, &m->dpad_hat);
        } else if (!strcmp(key, "dpdown")) {
          bg_sdl_parse_binding(val, &m->dpdown_btn, NULL, &m->dpad_hat);
        } else if (!strcmp(key, "dpleft")) {
          bg_sdl_parse_binding(val, &m->dpleft_btn, NULL, &m->dpad_hat);
        } else if (!strcmp(key, "dpright")) {
          bg_sdl_parse_binding(val, &m->dpright_btn, NULL, &m->dpad_hat);
        }
      }
    }
    if (!comma) break;
    p = comma + 1;
  }

  m->valid = (m->l3_btn >= 0 || m->r3_btn >= 0 || m->back_btn >= 0 ||
              m->l2_btn >= 0 || m->r2_btn >= 0 || m->l2_axis >= 0 ||
              m->r2_axis >= 0 || m->a_btn >= 0);
  return m->valid;
}

static bool bg_mp_parse_sdl_mapping(const char *cfg, const char *dev_name, BgSdlMap *out) {
  bg_sdl_map_reset(out);
  if (!cfg || !cfg[0] || !out) return false;

  BgSdlMap first_valid;
  bg_sdl_map_reset(&first_valid);
  const char *p = cfg;
  while (*p) {
    while (*p == '\r' || *p == '\n' || *p == ' ' || *p == '\t') p++;
    if (!*p) break;
    const char *nl = strpbrk(p, "\r\n");
    size_t len = nl ? (size_t)(nl - p) : strlen(p);
    if (p[0] != '#') {
      char line_name[96];
      BgSdlMap cur;
      if (bg_sdl_parse_line(p, len, line_name, sizeof(line_name), &cur)) {
        if (!first_valid.valid) first_valid = cur;
        if (dev_name && dev_name[0] && line_name[0] &&
            (bg_str_icontains(dev_name, line_name) || bg_str_icontains(line_name, dev_name))) {
          *out = cur;
          return true;
        }
      }
    }
    if (!nl) break;
    p = nl + 1;
  }

  if (first_valid.valid) {
    *out = first_valid;
    return true;
  }
  return false;
}

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

  if (act == BG_ACT_L3_R3) {
    if (!st->overlay_open) {
      st->overlay_open = true;
      if (st->selected_row < 0 || st->selected_row >= KP_OV_ROW_COUNT) {
        st->selected_row = 0;
      }
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

  /* While Mini-Player is closed, ignore all normal gameplay controls */
  if (!st->overlay_open) {
    return BG_RES_NONE;
  }

  switch (act) {
    case BG_ACT_NAV_UP:
      st->selected_row = (st->selected_row + KP_OV_ROW_COUNT - 1) % KP_OV_ROW_COUNT;
      res |= BG_RES_REDRAW;
      break;
    case BG_ACT_NAV_DOWN:
      st->selected_row = (st->selected_row + 1) % KP_OV_ROW_COUNT;
      res |= BG_RES_REDRAW;
      break;
    case BG_ACT_NAV_LEFT:
      if (st->selected_row == 3) {
        if (st->volume_pct > 10) {
          st->volume_pct -= 10;
          if (st->volume_pct < 10) st->volume_pct = 10;
          res |= BG_RES_VOLUME_CHANGED | BG_RES_REDRAW;
        }
      } else if (st->selected_row == 1 || st->selected_row == 2) {
        if (st->track_count > 0) {
          st->current_index = (st->current_index + st->track_count - 1) % st->track_count;
          st->started = true;
          st->paused = false;
          res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
        }
      } else if (st->selected_row == 0 && st->track_count > 0) {
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
    case BG_ACT_NAV_RIGHT:
      if (st->selected_row == 3) {
        if (st->volume_pct < 100) {
          st->volume_pct += 10;
          if (st->volume_pct > 100) st->volume_pct = 100;
          res |= BG_RES_VOLUME_CHANGED | BG_RES_REDRAW;
        }
      } else if (st->selected_row == 1 || st->selected_row == 2) {
        if (st->track_count > 0) {
          st->current_index = (st->current_index + 1) % st->track_count;
          st->started = true;
          st->paused = false;
          res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
        }
      } else if (st->selected_row == 0 && st->track_count > 0) {
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
    case BG_ACT_CONFIRM:
      if (st->selected_row == 0) {
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
      } else if (st->selected_row == 1) {
        if (st->track_count > 0) {
          st->current_index = (st->current_index + 1) % st->track_count;
          st->started = true;
          st->paused = false;
          res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
        }
      } else if (st->selected_row == 2) {
        if (st->track_count > 0) {
          st->current_index = (st->current_index + st->track_count - 1) % st->track_count;
          st->started = true;
          st->paused = false;
          res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
        }
      } else if (st->selected_row == 3) {
        st->volume_pct = (st->volume_pct >= 100) ? 20 : (st->volume_pct + 10);
        if (st->volume_pct > 100) st->volume_pct = 100;
        res |= BG_RES_VOLUME_CHANGED | BG_RES_REDRAW;
      } else if (st->selected_row == 4) {
        st->overlay_open = false;
        res |= BG_RES_CLOSE_OVERLAY;
      }
      break;
    case BG_ACT_R2:
      if (st->track_count > 0) {
        st->selected_row = 1;
        st->current_index = (st->current_index + 1) % st->track_count;
        st->started = true;
        st->paused = false;
        res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
      }
      break;
    case BG_ACT_L2:
      if (st->track_count > 0) {
        st->selected_row = 2;
        st->current_index = (st->current_index + st->track_count - 1) % st->track_count;
        st->started = true;
        st->paused = false;
        res |= BG_RES_TRACK_CHANGED | BG_RES_REDRAW;
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

/* ==================== SHARED MEMORY OVERLAY BRIDGE ==================== */

static void bg_mp_fill_shared(KpOverlayShared *dst, const BgMpState *st) {
  if (!dst || !st) return;
  const BgMpTrack *cur = (st->track_count > 0) ? &st->tracks[st->current_index] : NULL;
  dst->overlay_open = st->overlay_open ? 1u : 0u;
  dst->paused = st->paused ? 1u : 0u;
  dst->is_radio = (cur && cur->is_radio) ? 1u : 0u;
  dst->track_index = (uint32_t)(st->current_index >= 0 ? st->current_index : 0);
  dst->track_count = (uint32_t)(st->track_count >= 0 ? st->track_count : 0);
  dst->volume_pct = (uint32_t)st->volume_pct;
  dst->selected_row = (uint32_t)(st->selected_row >= 0 && st->selected_row < KP_OV_ROW_COUNT
                                     ? st->selected_row
                                     : 0);
  dst->accent_r = st->accent_r;
  dst->accent_g = st->accent_g;
  dst->accent_b = st->accent_b;
  snprintf(dst->title, sizeof(dst->title), "%.159s",
           cur ? cur->title : "Nenhuma faixa disponivel");
  __atomic_add_fetch(&dst->seq, 1u, __ATOMIC_RELEASE);
}

static KpOverlayShared *bg_mp_shm_open(const BgMpState *st) {
  const char *path = getenv("KPLAYER_OVERLAY_SHM");
  if (!path || !path[0]) return NULL;
  int fd = open(path, O_RDWR | O_CREAT | O_CLOEXEC, 0600);
  if (fd < 0) return NULL;
  if (ftruncate(fd, (off_t)sizeof(KpOverlayShared)) != 0) {
    close(fd);
    return NULL;
  }
  void *m = mmap(NULL, sizeof(KpOverlayShared), PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  close(fd);
  if (m == MAP_FAILED) return NULL;
  KpOverlayShared *shm = (KpOverlayShared *)m;
  memset(shm, 0, sizeof(*shm));
  shm->magic = KP_OV_MAGIC;
  shm->version = KP_OV_VERSION;
  bg_mp_fill_shared(shm, st);
  return shm;
}

static void bg_mp_shm_close(KpOverlayShared *shm) {
  if (!shm) return;
  shm->overlay_open = 0;
  __atomic_add_fetch(&shm->seq, 1u, __ATOMIC_RELEASE);
  munmap(shm, sizeof(KpOverlayShared));
}

/* ==================== /dev/fb0 FALLBACK RENDERER ==================== */

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
    if (fb->vinfo.transp.length > 0) px |= (0xFFu << fb->vinfo.transp.offset);
    memcpy(fb->map + off, &px, 4);
  } else if (fb->vinfo.bits_per_pixel == 16) {
    uint16_t px = (uint16_t)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
    memcpy(fb->map + off, &px, 2);
  }
}

static bool bg_fb_open(BgFbOverlay *fb) {
  memset(fb, 0, sizeof(*fb));
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
  int margin_x = sw >= 480 ? 16 : 8;
  int margin_y = sh >= 360 ? 16 : 8;
  fb->box_w = (sw * 46) / 100;
  if (fb->box_w > 304) fb->box_w = 304;
  if (fb->box_w < 200) fb->box_w = sw - margin_x * 2;
  fb->box_h = (fb->box_w * KP_OV_CARD_H) / KP_OV_CARD_W;
  int max_h = (sh * 64) / 100;
  if (fb->box_h > max_h) {
    fb->box_h = max_h;
    fb->box_w = (fb->box_h * KP_OV_CARD_W) / KP_OV_CARD_H;
  }
  if (fb->box_w > sw - margin_x * 2) fb->box_w = sw - margin_x * 2;
  if (fb->box_h > sh - margin_y * 2) fb->box_h = sh - margin_y * 2;
  fb->box_x = margin_x;
  fb->box_y = margin_y;

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
  uint32_t *rgba = (uint32_t *)malloc((size_t)KP_OV_CARD_W * KP_OV_CARD_H * sizeof(uint32_t));
  if (!rgba) return;
  KpOverlayShared tmp;
  memset(&tmp, 0, sizeof(tmp));
  bg_mp_fill_shared(&tmp, st);
  kp_ov_render_rgba(&tmp, rgba);
  for (int yy = 0; yy < fb->box_h; yy++) {
    int sy = (yy * KP_OV_CARD_H) / fb->box_h;
    for (int xx = 0; xx < fb->box_w; xx++) {
      int sx = (xx * KP_OV_CARD_W) / fb->box_w;
      uint32_t px = rgba[(size_t)sy * KP_OV_CARD_W + (size_t)sx];
      bg_fb_put_pixel(fb, fb->box_x + xx, fb->box_y + yy,
                      (uint8_t)(px & 0xFFu),
                      (uint8_t)((px >> 8) & 0xFFu),
                      (uint8_t)((px >> 16) & 0xFFu));
    }
  }
  free(rgba);
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

/* ==================== EVIOCGKEY / EVIOCGABS R36S INPUT POLLING ==================== */

typedef struct {
  int fd;
  int event_idx;
  bool is_gamepad;
  char name[96];
  int l3_code;
  int r3_code;
  int trainer_key_code;
  int start_code;
  int l2_code;
  int r2_code;
  int l2_axis;
  int r2_axis;
  int l2_axis_thresh;
  int r2_axis_thresh;
  int confirm_code;
  int close_code;
  int up_code;
  int down_code;
  int left_code;
  int right_code;
  bool has_hat0x;
  bool has_hat0y;
} BgEvdevDev;

typedef struct {
  BgEvdevDev devs[BG_MP_MAX_EVDEV];
  int count;
  bool grabbed;
  bool prev_l3_r3;
  bool prev_r2;
  bool prev_l2;
  bool prev_confirm;
  bool prev_close;
  bool prev_up;
  bool prev_down;
  bool prev_left;
  bool prev_right;
  int64_t last_action_ms;
  int64_t last_scan_ms;
} BgEvdevSet;

static bool bg_evdev_test_bit(const unsigned long *bits, int bit) {
  if (bit < 0) return false;
  const int bpl = (int)(8 * sizeof(unsigned long));
  return (bits[bit / bpl] & (1UL << (bit % bpl))) != 0;
}

static bool bg_evdev_has_event_idx(const BgEvdevSet *ev, int idx) {
  for (int i = 0; i < ev->count; i++) {
    if (ev->devs[i].fd >= 0 && ev->devs[i].event_idx == idx) return true;
  }
  return false;
}

static void bg_evdev_configure_device(BgEvdevDev *d) {
  d->l3_code = -1;
  d->r3_code = -1;
  d->trainer_key_code = -1;
  d->start_code = -1;
  d->l2_code = -1;
  d->r2_code = -1;
  d->l2_axis = -1;
  d->r2_axis = -1;
  d->l2_axis_thresh = 64;
  d->r2_axis_thresh = 64;
  d->confirm_code = -1;
  d->close_code = -1;
  d->up_code = -1;
  d->down_code = -1;
  d->left_code = -1;
  d->right_code = -1;
  d->has_hat0x = false;
  d->has_hat0y = false;

  unsigned long keybits[(KEY_MAX / (8 * sizeof(unsigned long))) + 2];
  unsigned long absbits[(ABS_MAX / (8 * sizeof(unsigned long))) + 2];
  memset(keybits, 0, sizeof(keybits));
  memset(absbits, 0, sizeof(absbits));
  (void)ioctl(d->fd, EVIOCGBIT(EV_KEY, sizeof(keybits)), keybits);
  (void)ioctl(d->fd, EVIOCGBIT(EV_ABS, sizeof(absbits)), absbits);

  /* Build exact SDL2 Linux button & axis index tables */
  int btn_codes[BG_MP_MAX_CODES];
  int nbtns = 0;
  for (int c = BTN_JOYSTICK; c < KEY_MAX && nbtns < BG_MP_MAX_CODES; c++) {
    if (bg_evdev_test_bit(keybits, c)) btn_codes[nbtns++] = c;
  }
  for (int c = BTN_MISC; c < BTN_JOYSTICK && nbtns < BG_MP_MAX_CODES; c++) {
    if (bg_evdev_test_bit(keybits, c)) btn_codes[nbtns++] = c;
  }

  int abs_codes[BG_MP_MAX_CODES];
  int nabs = 0;
  for (int a = 0; a < ABS_MAX && nabs < BG_MP_MAX_CODES; a++) {
    if (a >= ABS_HAT0X && a <= ABS_HAT3Y) continue;
    if (bg_evdev_test_bit(absbits, a)) abs_codes[nabs++] = a;
  }

  d->has_hat0x = bg_evdev_test_bit(absbits, ABS_HAT0X);
  d->has_hat0y = bg_evdev_test_bit(absbits, ABS_HAT0Y);
  d->is_gamepad = (nbtns >= 6);

  if (d->is_gamepad) {
    const char *sdl_cfg = getenv("SDL_GAMECONTROLLERCONFIG");
    BgSdlMap sm;
    if (bg_mp_parse_sdl_mapping(sdl_cfg, d->name, &sm) && sm.valid) {
      if (sm.l3_btn >= 0 && sm.l3_btn < nbtns) d->l3_code = btn_codes[sm.l3_btn];
      if (sm.r3_btn >= 0 && sm.r3_btn < nbtns) d->r3_code = btn_codes[sm.r3_btn];
      if (sm.start_btn >= 0 && sm.start_btn < nbtns) d->start_code = btn_codes[sm.start_btn];
      if (sm.l2_btn >= 0 && sm.l2_btn < nbtns) d->l2_code = btn_codes[sm.l2_btn];
      if (sm.r2_btn >= 0 && sm.r2_btn < nbtns) d->r2_code = btn_codes[sm.r2_btn];
      if (sm.l2_axis >= 0 && sm.l2_axis < nabs) d->l2_axis = abs_codes[sm.l2_axis];
      if (sm.r2_axis >= 0 && sm.r2_axis < nabs) d->r2_axis = abs_codes[sm.r2_axis];
      if (sm.a_btn >= 0 && sm.a_btn < nbtns) d->confirm_code = btn_codes[sm.a_btn];
      if (sm.b_btn >= 0 && sm.b_btn < nbtns) d->close_code = btn_codes[sm.b_btn];
      if (sm.dpup_btn >= 0 && sm.dpup_btn < nbtns) d->up_code = btn_codes[sm.dpup_btn];
      if (sm.dpdown_btn >= 0 && sm.dpdown_btn < nbtns) d->down_code = btn_codes[sm.dpdown_btn];
      if (sm.dpleft_btn >= 0 && sm.dpleft_btn < nbtns) d->left_code = btn_codes[sm.dpleft_btn];
      if (sm.dpright_btn >= 0 && sm.dpright_btn < nbtns) d->right_code = btn_codes[sm.dpright_btn];
    }

    /* Hardware-safe fallbacks for R36S / standard Linux gamepads */
    if (d->l3_code < 0) {
      if (bg_evdev_test_bit(keybits, BTN_THUMBL)) d->l3_code = BTN_THUMBL;
      else if (bg_evdev_test_bit(keybits, BTN_TRIGGER_HAPPY3)) d->l3_code = BTN_TRIGGER_HAPPY3;
    }
    if (d->r3_code < 0) {
      if (bg_evdev_test_bit(keybits, BTN_THUMBR)) d->r3_code = BTN_THUMBR;
      else if (bg_evdev_test_bit(keybits, BTN_TRIGGER_HAPPY4)) d->r3_code = BTN_TRIGGER_HAPPY4;
    }
    if (d->start_code < 0) {
      if (bg_evdev_test_bit(keybits, BTN_START)) d->start_code = BTN_START;
      else if (bg_evdev_test_bit(keybits, BTN_TRIGGER_HAPPY2)) d->start_code = BTN_TRIGGER_HAPPY2;
    }
    if (d->l2_code < 0 && bg_evdev_test_bit(keybits, BTN_TL2)) d->l2_code = BTN_TL2;
    if (d->r2_code < 0 && bg_evdev_test_bit(keybits, BTN_TR2)) d->r2_code = BTN_TR2;
    if (d->l2_code < 0 && d->l2_axis < 0 && bg_evdev_test_bit(absbits, ABS_Z)) d->l2_axis = ABS_Z;
    if (d->r2_code < 0 && d->r2_axis < 0 && bg_evdev_test_bit(absbits, ABS_RZ)) d->r2_axis = ABS_RZ;
    if (d->confirm_code < 0 && bg_evdev_test_bit(keybits, BTN_SOUTH)) d->confirm_code = BTN_SOUTH;
    if (d->close_code < 0 && bg_evdev_test_bit(keybits, BTN_EAST)) d->close_code = BTN_EAST;
    if (d->up_code < 0 && bg_evdev_test_bit(keybits, BTN_DPAD_UP)) d->up_code = BTN_DPAD_UP;
    if (d->down_code < 0 && bg_evdev_test_bit(keybits, BTN_DPAD_DOWN)) d->down_code = BTN_DPAD_DOWN;
    if (d->left_code < 0 && bg_evdev_test_bit(keybits, BTN_DPAD_LEFT)) d->left_code = BTN_DPAD_LEFT;
    if (d->right_code < 0 && bg_evdev_test_bit(keybits, BTN_DPAD_RIGHT)) d->right_code = BTN_DPAD_RIGHT;

    struct input_absinfo ai;
    if (d->l2_axis >= 0 && ioctl(d->fd, EVIOCGABS(d->l2_axis), &ai) == 0) {
      d->l2_axis_thresh = ai.minimum + ((ai.maximum - ai.minimum) / 2);
    }
    if (d->r2_axis >= 0 && ioctl(d->fd, EVIOCGABS(d->r2_axis), &ai) == 0) {
      d->r2_axis_thresh = ai.minimum + ((ai.maximum - ai.minimum) / 2);
    }

    fprintf(stderr,
            "bg_miniplayer: gamepad event%d '%s' (btns=%d, l3=%d, r3=%d, l2=%d/a%d, r2=%d/a%d, ok=%d, close=%d, dpad=%d/%d/%d/%d, hat=%d/%d)\n",
            d->event_idx, d->name, nbtns, d->l3_code, d->r3_code,
            d->l2_code, d->l2_axis, d->r2_code, d->r2_axis,
            d->confirm_code, d->close_code, d->up_code, d->down_code,
            d->left_code, d->right_code, d->has_hat0x ? 1 : 0, d->has_hat0y ? 1 : 0);
  } else {
    /* Keyboard / virtual uinput keyboard fallback */
    d->trainer_key_code = KEY_F8;
    d->start_code = KEY_TAB;
    d->l2_code = KEY_PAGEUP;
    d->r2_code = KEY_PAGEDOWN;
    d->confirm_code = KEY_ENTER;
    d->close_code = KEY_BACKSPACE;
    d->up_code = KEY_UP;
    d->down_code = KEY_DOWN;
    d->left_code = KEY_LEFT;
    d->right_code = KEY_RIGHT;
  }
}

static void bg_evdev_scan_devices(BgEvdevSet *ev) {
  if (!ev) return;
  for (int idx = 0; idx < 24 && ev->count < BG_MP_MAX_EVDEV; idx++) {
    if (bg_evdev_has_event_idx(ev, idx)) continue;
    char path[64];
    snprintf(path, sizeof(path), "/dev/input/event%d", idx);
    int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) continue;
    unsigned long evbits[4];
    memset(evbits, 0, sizeof(evbits));
    if (ioctl(fd, EVIOCGBIT(0, sizeof(evbits)), evbits) < 0 ||
        !bg_evdev_test_bit(evbits, EV_KEY)) {
      close(fd);
      continue;
    }
    char name[96] = "";
    if (ioctl(fd, EVIOCGNAME(sizeof(name)), name) >= 0) {
      if (strstr(name, "Power Button") || strstr(name, "pwrkey") ||
          strstr(name, "rk805") || strstr(name, "Headset")) {
        close(fd);
        continue;
      }
    }
    BgEvdevDev *d = &ev->devs[ev->count++];
    memset(d, 0, sizeof(*d));
    d->fd = fd;
    d->event_idx = idx;
    snprintf(d->name, sizeof(d->name), "%.95s", name[0] ? name : path);
    bg_evdev_configure_device(d);
    if (ev->grabbed) {
      (void)ioctl(d->fd, EVIOCGRAB, 1);
    }
  }
  ev->last_scan_ms = kp_ov_now_ms();
}

static void bg_evdev_open_all(BgEvdevSet *ev) {
  memset(ev, 0, sizeof(*ev));
  for (int i = 0; i < BG_MP_MAX_EVDEV; i++) ev->devs[i].fd = -1;
  bg_evdev_scan_devices(ev);
}

static void bg_evdev_set_grab(BgEvdevSet *ev, bool grab) {
  if (!ev || ev->grabbed == grab) return;
  for (int i = 0; i < ev->count; i++) {
    if (ev->devs[i].fd >= 0) {
      (void)ioctl(ev->devs[i].fd, EVIOCGRAB, grab ? 1 : 0);
    }
  }
  ev->grabbed = grab;
}

static void bg_evdev_close_all(BgEvdevSet *ev) {
  if (!ev) return;
  bg_evdev_set_grab(ev, false);
  for (int i = 0; i < ev->count; i++) {
    if (ev->devs[i].fd >= 0) {
      close(ev->devs[i].fd);
      ev->devs[i].fd = -1;
    }
  }
  ev->count = 0;
}

static bool bg_evdev_key_down(const unsigned long *state, int code) {
  return code >= 0 && code < KEY_MAX && bg_evdev_test_bit(state, code);
}

static BgMpAction bg_evdev_poll_action(BgEvdevSet *ev) {
  if (!ev) return BG_ACT_NONE;
  int64_t now = kp_ov_now_ms();
  if (now - ev->last_scan_ms >= 2000) {
    bg_evdev_scan_devices(ev);
  }

  bool cur_l3 = false;
  bool cur_r3 = false;
  bool cur_trainer_key = false;
  bool cur_r2 = false;
  bool cur_l2 = false;
  bool cur_confirm = false;
  bool cur_close = false;
  bool cur_up = false;
  bool cur_down = false;
  bool cur_left = false;
  bool cur_right = false;

  unsigned long kstate[(KEY_MAX / (8 * sizeof(unsigned long))) + 2];
  struct input_event drain[16];

  for (int i = 0; i < ev->count; i++) {
    BgEvdevDev *d = &ev->devs[i];
    if (d->fd < 0) continue;

    /* Drain any non-grabbed unread events to keep kernel queue empty */
    while (read(d->fd, drain, sizeof(drain)) > 0) {
    }

    /* Live kernel hardware key bitmap: bypasses EVIOCGRAB from gptokeyb! */
    memset(kstate, 0, sizeof(kstate));
    if (ioctl(d->fd, EVIOCGKEY(sizeof(kstate)), kstate) < 0) {
      if (errno == ENODEV) {
        close(d->fd);
        d->fd = -1;
      }
      continue;
    }

    if (bg_evdev_key_down(kstate, d->l3_code)) cur_l3 = true;
    if (bg_evdev_key_down(kstate, d->r3_code)) cur_r3 = true;
    if (bg_evdev_key_down(kstate, d->trainer_key_code)) cur_trainer_key = true;
    if (bg_evdev_key_down(kstate, d->r2_code)) cur_r2 = true;
    if (bg_evdev_key_down(kstate, d->l2_code)) cur_l2 = true;
    if (bg_evdev_key_down(kstate, d->confirm_code) ||
        bg_evdev_key_down(kstate, d->start_code)) {
      cur_confirm = true;
    }
    if (bg_evdev_key_down(kstate, d->close_code) ||
        (!d->is_gamepad && bg_evdev_key_down(kstate, KEY_ESC))) {
      cur_close = true;
    }
    if (bg_evdev_key_down(kstate, d->up_code)) cur_up = true;
    if (bg_evdev_key_down(kstate, d->down_code)) cur_down = true;
    if (bg_evdev_key_down(kstate, d->left_code)) cur_left = true;
    if (bg_evdev_key_down(kstate, d->right_code)) cur_right = true;

    struct input_absinfo ai;
    if (d->r2_axis >= 0 && ioctl(d->fd, EVIOCGABS(d->r2_axis), &ai) == 0) {
      if (ai.value > d->r2_axis_thresh) cur_r2 = true;
    }
    if (d->l2_axis >= 0 && ioctl(d->fd, EVIOCGABS(d->l2_axis), &ai) == 0) {
      if (ai.value > d->l2_axis_thresh) cur_l2 = true;
    }
    if (d->has_hat0y && ioctl(d->fd, EVIOCGABS(ABS_HAT0Y), &ai) == 0) {
      if (ai.value < 0) cur_up = true;
      else if (ai.value > 0) cur_down = true;
    }
    if (d->has_hat0x && ioctl(d->fd, EVIOCGABS(ABS_HAT0X), &ai) == 0) {
      if (ai.value < 0) cur_left = true;
      else if (ai.value > 0) cur_right = true;
    }
  }

  bool cur_l3_r3 = (cur_l3 && cur_r3) || cur_trainer_key;

  BgMpAction act = BG_ACT_NONE;
  if (cur_l3_r3 && !ev->prev_l3_r3) {
    act = BG_ACT_L3_R3;
  } else if (cur_r2 && !ev->prev_r2) {
    act = BG_ACT_R2;
  } else if (cur_l2 && !ev->prev_l2) {
    act = BG_ACT_L2;
  } else if (cur_confirm && !ev->prev_confirm) {
    act = BG_ACT_CONFIRM;
  } else if (cur_close && !ev->prev_close) {
    act = BG_ACT_CLOSE;
  } else if (cur_up && !ev->prev_up) {
    act = BG_ACT_NAV_UP;
  } else if (cur_down && !ev->prev_down) {
    act = BG_ACT_NAV_DOWN;
  } else if (cur_left && !ev->prev_left) {
    act = BG_ACT_NAV_LEFT;
  } else if (cur_right && !ev->prev_right) {
    act = BG_ACT_NAV_RIGHT;
  }

  ev->prev_l3_r3 = cur_l3_r3;
  ev->prev_r2 = cur_r2;
  ev->prev_l2 = cur_l2;
  ev->prev_confirm = cur_confirm;
  ev->prev_close = cur_close;
  ev->prev_up = cur_up;
  ev->prev_down = cur_down;
  ev->prev_left = cur_left;
  ev->prev_right = cur_right;

  if (act != BG_ACT_NONE) {
    if ((act == BG_ACT_L3_R3 || act == BG_ACT_R2 || act == BG_ACT_L2 ||
         act == BG_ACT_CONFIRM) &&
        (now - ev->last_action_ms) < BG_MP_DEBOUNCE_MS) {
      return BG_ACT_NONE;
    }
    ev->last_action_ms = now;
  }
  return act;
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

static bool bg_mp_main_lock_active(void) {
  FILE *f = fopen(KP_OV_MAIN_LOCK_PATH, "r");
  if (!f) return false;
  long pid_val = 0;
  int ok = fscanf(f, "%ld", &pid_val);
  fclose(f);
  if (ok != 1 || pid_val <= 1) return false;
  pid_t p = (pid_t)pid_val;
  if (p == getpid()) return false;
  if (kill(p, 0) == 0) return true;
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
  fprintf(stderr, "bg_miniplayer: tocando [%d/%d] %s\n",
          st->current_index + 1, st->track_count, tr->title);
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
  libvlc_set_user_agent(inst, "KPlayer/2.1.7 (R36S Background)", "KPlayer/2.1.7");
  libvlc_media_player_t *mp = libvlc_media_player_new(inst);
  if (!mp) {
    libvlc_release(inst);
    return 1;
  }

  KpOverlayShared *shm = bg_mp_shm_open(&st);
  BgEvdevSet ev;
  bg_evdev_open_all(&ev);
  BgFbOverlay fb;
  memset(&fb, 0, sizeof(fb));
  fb.fd = -1;
  bool game_stopped = false;
  bool fb_fallback_pending = false;
  bool system_mode = (game_pid <= 0);
  bool yielded_to_kplayer = false;
  int64_t fb_open_start_ms = 0;
  int64_t fb_open_prev_draw_ms = 0;
  int64_t fb_last_blit_ms = 0;
  int vol_sync_ticks = 0;

  if (st.auto_play && st.track_count > 0 && !(system_mode && bg_mp_main_lock_active())) {
    st.started = true;
    st.paused = false;
    bg_mp_play_current(inst, mp, &st, st.initial_pos_ms);
    vol_sync_ticks = 20;
    if (shm) bg_mp_fill_shared(shm, &st);
  }

  fprintf(stderr,
          "bg_miniplayer: pronto (%d faixa(s), vol=%d%%, evdev=%d, shm=%d, game_pid=%ld, sys=%d, auto=%d)\n",
          st.track_count, st.volume_pct, ev.count, shm ? 1 : 0, (long)game_pid,
          system_mode ? 1 : 0, st.auto_play ? 1 : 0);

  struct timespec ts = {0, 20000000L}; /* 20ms = 50Hz responsive polling */
  while (bg_mp_running) {
    if (!bg_mp_game_alive(game_pid)) break;
    int64_t loop_now = kp_ov_now_ms();

    /* In system-wide mode, pause cleanly while KPlayer UI or a port handoff owns the lock */
    if (system_mode) {
      bool lock_now = bg_mp_main_lock_active();
      if (lock_now && !yielded_to_kplayer) {
        yielded_to_kplayer = true;
        if (st.overlay_open) {
          st.overlay_open = false;
          fb_fallback_pending = false;
          bg_fb_close(&fb);
          bg_evdev_set_grab(&ev, false);
          if (shm) bg_mp_fill_shared(shm, &st);
        }
        if (st.started && !st.paused) {
          libvlc_media_player_stop(mp);
          st.started = false;
        }
        fprintf(stderr, "bg_miniplayer: pausado enquanto o app KPlayer esta aberto\n");
      } else if (!lock_now && yielded_to_kplayer) {
        yielded_to_kplayer = false;
        /* Reload latest playlist/theme saved by KPlayer on exit */
        BgMpState reloaded;
        if (bg_mp_load_json_file(json_path, &reloaded)) {
          reloaded.overlay_open = false;
          st = reloaded;
        }
        if (shm) bg_mp_fill_shared(shm, &st);
        if (st.auto_play && st.track_count > 0) {
          st.started = true;
          st.paused = false;
          bg_mp_play_current(inst, mp, &st, st.initial_pos_ms);
          vol_sync_ticks = 20;
          if (shm) bg_mp_fill_shared(shm, &st);
        }
        fprintf(stderr, "bg_miniplayer: retomado no sistema (%d faixa(s))\n", st.track_count);
      }
      if (yielded_to_kplayer) {
        nanosleep(&ts, NULL);
        continue;
      }
    }

    if (vol_sync_ticks > 0) {
      vol_sync_ticks--;
      if (vol_sync_ticks == 0 || vol_sync_ticks == 10) {
        bg_mp_apply_volume(mp, st.volume_pct);
      }
    }

    /* Fallback to /dev/fb0 only if GLES/SDL overlay has not rendered a frame within 260ms */
    if (st.overlay_open && fb_fallback_pending) {
      if (shm && shm->last_draw_ms > fb_open_prev_draw_ms) {
        fb_fallback_pending = false;
        fprintf(stderr, "bg_miniplayer: overlay GLES/SDL ativo\n");
      } else if (loop_now - fb_open_start_ms >= 260) {
        fb_fallback_pending = false;
        if (game_pid > 1 && !game_stopped) {
          bg_mp_signal_game(game_pid, SIGSTOP);
          game_stopped = true;
        }
        if (bg_fb_open(&fb)) {
          bg_fb_render(&fb, &st);
          fb_last_blit_ms = loop_now;
          fprintf(stderr, "bg_miniplayer: overlay fallback /dev/fb0 ativo\n");
        }
      }
    } else if (st.overlay_open && fb.map && system_mode && (loop_now - fb_last_blit_ms) >= 160) {
      bg_fb_render(&fb, &st);
      fb_last_blit_ms = loop_now;
    }

    /* Auto-advance when a local track finishes */
    if (st.started && !st.paused && st.track_count > 0) {
      libvlc_state_t vstate = libvlc_media_player_get_state(mp);
      if (vstate == libvlc_Ended) {
        st.current_index = (st.current_index + 1) % st.track_count;
        bg_mp_play_current(inst, mp, &st, 0);
        vol_sync_ticks = 16;
        if (shm) bg_mp_fill_shared(shm, &st);
        if (st.overlay_open && fb.map) {
          bg_fb_render(&fb, &st);
          fb_last_blit_ms = loop_now;
        }
      }
    }

    BgMpAction act = bg_evdev_poll_action(&ev);
    if (act != BG_ACT_NONE) {
      unsigned int flags = bg_mp_handle_action(&st, act);
      if (flags != BG_RES_NONE) {
        if (flags & BG_RES_OPEN_OVERLAY) {
          fprintf(stderr, "bg_miniplayer: abrindo Mini-Player KPlayer (L3+R3)\n");
          bg_evdev_set_grab(&ev, true);
          fb_fallback_pending = true;
          fb_open_start_ms = loop_now;
          fb_open_prev_draw_ms = shm ? shm->last_draw_ms : 0;
          if (!shm) {
            /* No SHM available -> open /dev/fb0 immediately */
            fb_fallback_pending = false;
            if (game_pid > 1 && !game_stopped) {
              bg_mp_signal_game(game_pid, SIGSTOP);
              game_stopped = true;
            }
            if (bg_fb_open(&fb)) {
              bg_fb_render(&fb, &st);
              fb_last_blit_ms = loop_now;
            }
          }
        }
        if (flags & BG_RES_TRACK_CHANGED) {
          bg_mp_play_current(inst, mp, &st, 0);
          vol_sync_ticks = 16;
        }
        if (flags & BG_RES_PAUSE_TOGGLED) {
          libvlc_media_player_set_pause(mp, st.paused ? 1 : 0);
        }
        if (flags & BG_RES_VOLUME_CHANGED) {
          bg_mp_apply_volume(mp, st.volume_pct);
        }
        if (shm) {
          bg_mp_fill_shared(shm, &st);
        }
        if ((flags & BG_RES_REDRAW) && st.overlay_open && fb.map) {
          bg_fb_render(&fb, &st);
          fb_last_blit_ms = loop_now;
        }
        if (flags & BG_RES_CLOSE_OVERLAY) {
          fprintf(stderr, "bg_miniplayer: ocultando Mini-Player KPlayer\n");
          fb_fallback_pending = false;
          bg_fb_close(&fb);
          bg_evdev_set_grab(&ev, false);
          if (game_stopped) {
            bg_mp_signal_game(game_pid, SIGCONT);
            game_stopped = false;
          }
        }
      }
    }

    nanosleep(&ts, NULL);
  }

  /* Guaranteed safe teardown: never leave game frozen, overlay stuck, or gamepad grabbed */
  bg_mp_shm_close(shm);
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
