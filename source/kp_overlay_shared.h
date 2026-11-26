#ifndef KPLAYER_OVERLAY_SHARED_H
#define KPLAYER_OVERLAY_SHARED_H

/*
 * Shared memory contract + KPlayer-styled 5x7 RGBA Mini-Player renderer for
 * KPlayer R36S In-Game & EmulationStation Overlay (v2.1.5).
 *
 * Used by:
 *   1) source/bg_miniplayer.h (headless `./kplayer --bg-audio` writer + /dev/fb0 fallback)
 *   2) source/kp_overlay.c    (`libkp_overlay.so` LD_PRELOAD GLES2/EGL/SDL2 overlay reader)
 */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define KP_OV_MAGIC 0x4B504D50u /* "KPMP" */
#define KP_OV_VERSION 2u
#define KP_OV_CARD_W 296
#define KP_OV_CARD_H 240
#define KP_OV_ROW_COUNT 5
#define KP_OV_DEFAULT_SHM_PATH "/tmp/kplayer_overlay.shm"

typedef struct {
  uint32_t magic;
  uint32_t version;
  volatile uint32_t seq;
  volatile uint32_t overlay_open;
  volatile uint32_t paused;
  volatile uint32_t is_radio;
  volatile uint32_t track_index;
  volatile uint32_t track_count;
  volatile uint32_t volume_pct;
  volatile uint32_t selected_row;
  volatile uint8_t accent_r;
  volatile uint8_t accent_g;
  volatile uint8_t accent_b;
  uint8_t reserved0;
  volatile int64_t last_draw_ms;
  char title[160];
} KpOverlayShared;

static inline int64_t kp_ov_now_ms(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
  return (int64_t)ts.tv_sec * 1000LL + (int64_t)(ts.tv_nsec / 1000000L);
}

static inline uint32_t kp_ov_rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  /* Packed little-endian ABGR32 = byte order [R, G, B, A] (GL_RGBA / SDL_PIXELFORMAT_ABGR8888) */
  return (uint32_t)r | ((uint32_t)g << 8) | ((uint32_t)b << 16) | ((uint32_t)a << 24);
}

static inline uint8_t kp_ov_lerp8(uint8_t a, uint8_t b, int num, int den) {
  if (den <= 0) return a;
  int v = (int)a + (((int)b - (int)a) * num) / den;
  if (v < 0) v = 0;
  if (v > 255) v = 255;
  return (uint8_t)v;
}

static inline void kp_ov_font_rows(unsigned char ch, uint8_t rows[7]) {
  static const struct {
    char c;
    uint8_t r[7];
  } tbl[] = {
      {' ', {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}},
      {'!', {0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04}},
      {'%', {0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13}},
      {'&', {0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D}},
      {'\'', {0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00}},
      {'(', {0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02}},
      {')', {0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08}},
      {'+', {0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00}},
      {',', {0x00, 0x00, 0x00, 0x00, 0x06, 0x04, 0x08}},
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

static inline void kp_ov_utf8_to_ascii(const char *src, char *dst, size_t cap) {
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

static inline void kp_ov_fill_rect(uint32_t *buf, int bw, int bh,
                                   int x, int y, int w, int h, uint32_t col) {
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > bw) w = bw - x;
  if (y + h > bh) h = bh - y;
  if (w <= 0 || h <= 0) return;
  for (int yy = y; yy < y + h; yy++) {
    uint32_t *row = buf + (size_t)yy * (size_t)bw + x;
    for (int xx = 0; xx < w; xx++) row[xx] = col;
  }
}

static inline bool kp_ov_inside_rounded(int px, int py, int x, int y, int w, int h, int r) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  if (r <= 0) return true;
  if (r * 2 > w) r = w / 2;
  if (r * 2 > h) r = h / 2;
  int lx = px - x;
  int ly = py - y;
  int dx = 0, dy = 0;
  if (lx < r && ly < r) { dx = r - lx - 1; dy = r - ly - 1; }
  else if (lx >= w - r && ly < r) { dx = lx - (w - r); dy = r - ly - 1; }
  else if (lx < r && ly >= h - r) { dx = r - lx - 1; dy = ly - (h - r); }
  else if (lx >= w - r && ly >= h - r) { dx = lx - (w - r); dy = ly - (h - r); }
  else return true;
  return (dx * dx + dy * dy) < (r * r);
}

static inline void kp_ov_fill_rounded_grad(uint32_t *buf, int bw, int bh,
                                           int x, int y, int w, int h, int r,
                                           uint8_t r0, uint8_t g0, uint8_t b0,
                                           uint8_t r1, uint8_t g1, uint8_t b1,
                                           uint8_t alpha) {
  int y0 = y < 0 ? 0 : y;
  int y1 = (y + h > bh) ? bh : (y + h);
  int x0 = x < 0 ? 0 : x;
  int x1 = (x + w > bw) ? bw : (x + w);
  int span = h > 1 ? (h - 1) : 1;
  for (int yy = y0; yy < y1; yy++) {
    int dy = yy - y;
    uint32_t col = kp_ov_rgba(
        kp_ov_lerp8(r0, r1, dy, span),
        kp_ov_lerp8(g0, g1, dy, span),
        kp_ov_lerp8(b0, b1, dy, span),
        alpha);
    uint32_t *row = buf + (size_t)yy * (size_t)bw;
    for (int xx = x0; xx < x1; xx++) {
      if (kp_ov_inside_rounded(xx, yy, x, y, w, h, r)) row[xx] = col;
    }
  }
}

static inline void kp_ov_stroke_rounded(uint32_t *buf, int bw, int bh,
                                        int x, int y, int w, int h, int r,
                                        uint32_t col) {
  int y0 = y < 0 ? 0 : y;
  int y1 = (y + h > bh) ? bh : (y + h);
  int x0 = x < 0 ? 0 : x;
  int x1 = (x + w > bw) ? bw : (x + w);
  int ir = r > 1 ? r - 1 : 0;
  for (int yy = y0; yy < y1; yy++) {
    uint32_t *row = buf + (size_t)yy * (size_t)bw;
    for (int xx = x0; xx < x1; xx++) {
      if (kp_ov_inside_rounded(xx, yy, x, y, w, h, r) &&
          !kp_ov_inside_rounded(xx, yy, x + 1, y + 1, w - 2, h - 2, ir)) {
        row[xx] = col;
      }
    }
  }
}

static inline void kp_ov_fill_circle(uint32_t *buf, int bw, int bh,
                                     int cx, int cy, int rad, uint32_t col) {
  int rr = rad * rad;
  for (int dy = -rad; dy <= rad; dy++) {
    int yy = cy + dy;
    if (yy < 0 || yy >= bh) continue;
    uint32_t *row = buf + (size_t)yy * (size_t)bw;
    for (int dx = -rad; dx <= rad; dx++) {
      int xx = cx + dx;
      if (xx < 0 || xx >= bw) continue;
      if (dx * dx + dy * dy <= rr) row[xx] = col;
    }
  }
}

static inline void kp_ov_draw_text(uint32_t *buf, int bw, int bh,
                                   int x, int y, int scale, int max_w,
                                   const char *utf8_text, uint32_t col) {
  char asc[192];
  kp_ov_utf8_to_ascii(utf8_text, asc, sizeof(asc));
  int step = 6 * scale;
  int cx = x;
  for (size_t i = 0; asc[i]; i++) {
    if (max_w > 0 && (cx - x) + step > max_w) break;
    uint8_t rows[7];
    kp_ov_font_rows((unsigned char)asc[i], rows);
    for (int ry = 0; ry < 7; ry++) {
      for (int rx = 0; rx < 5; rx++) {
        if (rows[ry] & (1u << (4 - rx))) {
          kp_ov_fill_rect(buf, bw, bh, cx + rx * scale, y + ry * scale, scale, scale, col);
        }
      }
    }
    cx += step;
  }
}

static inline void kp_ov_draw_text_right(uint32_t *buf, int bw, int bh,
                                         int right_x, int y, int scale,
                                         const char *utf8_text, uint32_t col) {
  char asc[192];
  kp_ov_utf8_to_ascii(utf8_text, asc, sizeof(asc));
  int len = (int)strlen(asc);
  int tw = len * 6 * scale;
  int x = right_x - tw;
  if (x < 4) x = 4;
  kp_ov_draw_text(buf, bw, bh, x, y, scale, right_x - x + 6 * scale, asc, col);
}

static inline void kp_ov_render_rgba(const KpOverlayShared *st, uint32_t *rgba_out) {
  if (!st || !rgba_out) return;
  const int w = KP_OV_CARD_W;
  const int h = KP_OV_CARD_H;
  /* Clear buffer fully transparent so rounded outer corners blend seamlessly */
  memset(rgba_out, 0, (size_t)w * (size_t)h * sizeof(uint32_t));

  uint8_t ar = st->accent_r ? st->accent_r : 29;
  uint8_t ag = st->accent_g ? st->accent_g : 185;
  uint8_t ab = st->accent_b ? st->accent_b : 84;

  uint32_t acc = kp_ov_rgba(ar, ag, ab, 255);
  uint32_t border_soft = kp_ov_rgba(
      kp_ov_lerp8(36, ar, 45, 100),
      kp_ov_lerp8(42, ag, 45, 100),
      kp_ov_lerp8(54, ab, 45, 100),
      255);
  uint32_t card_border = kp_ov_rgba(38, 46, 58, 255);
  uint32_t white = kp_ov_rgba(244, 247, 252, 255);
  uint32_t muted = kp_ov_rgba(154, 168, 186, 255);
  uint32_t disc_dark = kp_ov_rgba(16, 21, 28, 255);
  uint32_t disc_groove = kp_ov_rgba(40, 48, 60, 255);

  unsigned int sel = (unsigned int)st->selected_row;
  if (sel >= KP_OV_ROW_COUNT) sel = 0;

  /* 1. Outer KPlayer rounded panel with subtle theme-tinted dark vertical gradient */
  kp_ov_fill_rounded_grad(
      rgba_out, w, h, 0, 0, w, h, 12,
      kp_ov_lerp8(18, ar, 12, 100), kp_ov_lerp8(22, ag, 12, 100), kp_ov_lerp8(30, ab, 12, 100),
      10, 13, 18,
      242);
  kp_ov_stroke_rounded(rgba_out, w, h, 0, 0, w, h, 12, border_soft);
  /* Subtle KPlayer top accent line inside rounded header */
  kp_ov_fill_rect(rgba_out, w, h, 14, 1, w - 28, 2, acc);

  /* 2. KPlayer Header: Vinyl Disc Emblem + "K PLAYER" + "MINI-PLAYER" + item counter */
  kp_ov_fill_circle(rgba_out, w, h, 22, 22, 11, acc);
  kp_ov_fill_circle(rgba_out, w, h, 22, 22, 9, disc_dark);
  kp_ov_fill_circle(rgba_out, w, h, 22, 22, 7, disc_groove);
  kp_ov_fill_circle(rgba_out, w, h, 22, 22, 6, disc_dark);
  kp_ov_fill_circle(rgba_out, w, h, 22, 22, 4, acc);
  kp_ov_fill_circle(rgba_out, w, h, 22, 22, 1, disc_dark);

  kp_ov_draw_text(rgba_out, w, h, 40, 10, 2, 180, "K PLAYER", white);
  kp_ov_draw_text(rgba_out, w, h, 41, 27, 1, 160, "MINI-PLAYER", acc);
  char idx_badge[16];
  snprintf(idx_badge, sizeof(idx_badge), "%u/%u", sel + 1u, (unsigned int)KP_OV_ROW_COUNT);
  kp_ov_draw_text_right(rgba_out, w, h, w - 12, 17, 1, idx_badge, muted);

  /* 3. KPlayer Now-Playing rounded inner card */
  kp_ov_fill_rounded_grad(rgba_out, w, h, 8, 41, w - 16, 36, 7,
                          19, 24, 33, 13, 17, 24, 246);
  kp_ov_stroke_rounded(rgba_out, w, h, 8, 41, w - 16, 36, 7, card_border);

  /* Mini equalizer icon on left of Now-Playing card */
  if (!st->paused) {
    kp_ov_fill_rect(rgba_out, w, h, 15, 58, 3, 11, acc);
    kp_ov_fill_rect(rgba_out, w, h, 20, 52, 3, 17, acc);
    kp_ov_fill_rect(rgba_out, w, h, 25, 56, 3, 13, acc);
  } else {
    kp_ov_fill_rect(rgba_out, w, h, 16, 53, 4, 15, muted);
    kp_ov_fill_rect(rgba_out, w, h, 23, 53, 4, 15, muted);
  }

  unsigned int tc = (unsigned int)st->track_count;
  unsigned int ti = (tc > 0) ? ((unsigned int)st->track_index + 1u) : 0u;
  char status_left[64], status_right[32];
  snprintf(status_left, sizeof(status_left), "%s",
           st->paused ? "PAUSADO" : "TOCANDO AGORA");
  snprintf(status_right, sizeof(status_right), "%s %u/%u",
           st->is_radio ? "RADIO" : "FAIXA", ti, tc);
  kp_ov_draw_text(rgba_out, w, h, 35, 47, 1, 145, status_left, st->paused ? muted : acc);
  kp_ov_draw_text_right(rgba_out, w, h, w - 15, 47, 1, status_right, muted);

  char title_copy[160];
  memcpy(title_copy, st->title, sizeof(title_copy));
  title_copy[sizeof(title_copy) - 1] = 0;
  const char *tname = title_copy[0] ? title_copy : "Nenhuma faixa disponivel";
  kp_ov_draw_text(rgba_out, w, h, 35, 61, 1, w - 50, tname, white);

  /* 4. 5 KPlayer-style Selectable Option Cards */
  int vol = (int)st->volume_pct;
  if (vol < 0) vol = 0;
  if (vol > 100) vol = 100;

  char vol_val[24];
  snprintf(vol_val, sizeof(vol_val), "< %d%% >", vol);

  const char *row_labels[KP_OV_ROW_COUNT] = {
      "TOCAR / PAUSAR",
      st->is_radio ? "PROXIMA RADIO" : "PROXIMA MUSICA",
      st->is_radio ? "VOLTAR RADIO" : "VOLTAR MUSICA",
      "VOLUME DO AUDIO",
      "OCULTAR MENU",
  };
  const char *row_vals[KP_OV_ROW_COUNT] = {
      st->paused ? "PAUSADO" : "TOCANDO",
      "R2",
      "L2",
      vol_val,
      "L3+R3",
  };

  for (unsigned int i = 0; i < KP_OV_ROW_COUNT; i++) {
    int ry = 83 + (int)i * 25;
    int rh = 22;
    bool active = (i == sel);

    if (active) {
      /* Authentic KPlayer focused card: theme-tinted elevated fill + accent outline + left bar */
      kp_ov_fill_rounded_grad(
          rgba_out, w, h, 8, ry, w - 16, rh, 6,
          kp_ov_lerp8(24, ar, 30, 100), kp_ov_lerp8(30, ag, 30, 100), kp_ov_lerp8(40, ab, 30, 100),
          kp_ov_lerp8(16, ar, 18, 100), kp_ov_lerp8(21, ag, 18, 100), kp_ov_lerp8(29, ab, 18, 100),
          252);
      kp_ov_stroke_rounded(rgba_out, w, h, 8, ry, w - 16, rh, 6, acc);
      kp_ov_fill_rect(rgba_out, w, h, 10, ry + 4, 3, rh - 8, acc);
    } else {
      uint8_t br = (i & 1u) ? 17 : 14;
      uint8_t bg = (i & 1u) ? 21 : 18;
      uint8_t bb = (i & 1u) ? 29 : 25;
      kp_ov_fill_rounded_grad(rgba_out, w, h, 8, ry, w - 16, rh, 6,
                              br, bg, bb, br, bg, bb, 232);
    }

    uint32_t fg = active ? white : kp_ov_rgba(216, 224, 236, 255);
    uint32_t vcol = active ? acc : ((i == 0 && !st->paused) ? acc : muted);

    kp_ov_draw_text(rgba_out, w, h, 18, ry + (i == 3 ? 5 : 7), 1, 175, row_labels[i], fg);
    kp_ov_draw_text_right(rgba_out, w, h, w - 15, ry + (i == 3 ? 5 : 7), 1, row_vals[i], vcol);

    /* Inline rounded KPlayer volume progress track on Row 3 */
    if (i == 3) {
      int bar_x = 18;
      int bar_w = w - 34;
      int fill_w = (bar_w * vol) / 100;
      kp_ov_fill_rect(rgba_out, w, h, bar_x, ry + 16, bar_w, 3, kp_ov_rgba(36, 44, 58, 255));
      if (fill_w > 0) {
        kp_ov_fill_rect(rgba_out, w, h, bar_x, ry + 16, fill_w, 3, acc);
      }
    }
  }

  /* 5. Compact KPlayer Footer Legend */
  kp_ov_fill_rect(rgba_out, w, h, 12, 211, w - 24, 1, card_border);
  kp_ov_draw_text(rgba_out, w, h, 14, 216, 1, w - 28, "^v MENU   <> VOL   B OK", muted);
  kp_ov_draw_text(rgba_out, w, h, 14, 227, 1, w - 28, "L2/R2 FAIXA   A/L3+R3 SAIR", acc);
}

#endif /* KPLAYER_OVERLAY_SHARED_H */
