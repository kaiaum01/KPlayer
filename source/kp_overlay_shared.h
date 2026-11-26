#ifndef KPLAYER_OVERLAY_SHARED_H
#define KPLAYER_OVERLAY_SHARED_H

/*
 * Shared memory contract + GTA Cheat Trainer-style 5x7 RGBA HUD renderer for
 * KPlayer R36S In-Game Mini-Player (v2.1.5).
 *
 * Used by:
 *   1) source/bg_miniplayer.h (headless `./kplayer --bg-audio` writer + /dev/fb0 fallback)
 *   2) source/kp_overlay.c    (`libkp_overlay.so` LD_PRELOAD GLES2/EGL/SDL2 overlay reader)
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define KP_OV_MAGIC 0x4B504D50u /* "KPMP" */
#define KP_OV_VERSION 2u
#define KP_OV_CARD_W 296
#define KP_OV_CARD_H 232
#define KP_OV_ROW_COUNT 5

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
  uint8_t ar = st->accent_r ? st->accent_r : 29;
  uint8_t ag = st->accent_g ? st->accent_g : 185;
  uint8_t ab = st->accent_b ? st->accent_b : 84;
  int lum = ((int)ar * 299 + (int)ag * 587 + (int)ab * 114) / 1000;

  uint32_t acc = kp_ov_rgba(ar, ag, ab, 255);
  uint32_t acc_dark = kp_ov_rgba((uint8_t)(ar / 3), (uint8_t)(ag / 3), (uint8_t)(ab / 3), 255);
  uint32_t hdr_fg = lum > 140 ? kp_ov_rgba(10, 12, 16, 255) : kp_ov_rgba(250, 252, 255, 255);
  uint32_t bg_panel = kp_ov_rgba(8, 10, 15, 232);
  uint32_t bg_sub = kp_ov_rgba(4, 5, 8, 246);
  uint32_t row_even = kp_ov_rgba(11, 14, 20, 224);
  uint32_t row_odd = kp_ov_rgba(16, 20, 28, 224);
  uint32_t row_sel = kp_ov_rgba(244, 247, 252, 252);
  uint32_t ink_dark = kp_ov_rgba(10, 12, 16, 255);
  uint32_t white = kp_ov_rgba(240, 244, 250, 255);
  uint32_t muted = kp_ov_rgba(168, 180, 198, 255);
  uint32_t div_col = kp_ov_rgba(44, 52, 68, 255);

  unsigned int sel = (unsigned int)st->selected_row;
  if (sel >= KP_OV_ROW_COUNT) sel = 0;

  /* Base translucent GTA Trainer panel */
  kp_ov_fill_rect(rgba_out, w, h, 0, 0, w, h, bg_panel);

  /* Header Banner (classic GTA Mod Menu solid banner) */
  kp_ov_fill_rect(rgba_out, w, h, 0, 0, w, 40, acc);
  kp_ov_fill_rect(rgba_out, w, h, 0, 40, w, 2, acc_dark);
  kp_ov_draw_text(rgba_out, w, h, 10, 12, 2, w - 52, "KPLAYER TRAINER", hdr_fg);
  char idx_badge[16];
  snprintf(idx_badge, sizeof(idx_badge), "%u/%u", sel + 1u, (unsigned int)KP_OV_ROW_COUNT);
  kp_ov_draw_text_right(rgba_out, w, h, w - 8, 16, 1, idx_badge, hdr_fg);

  /* Sub-header: Status + active track/radio title */
  kp_ov_fill_rect(rgba_out, w, h, 0, 42, w, 30, bg_sub);
  kp_ov_fill_rect(rgba_out, w, h, 0, 72, w, 2, acc);
  unsigned int tc = (unsigned int)st->track_count;
  unsigned int ti = (tc > 0) ? ((unsigned int)st->track_index + 1u) : 0u;
  char status_left[64], status_right[32];
  snprintf(status_left, sizeof(status_left), "%s",
           st->paused ? "STATUS: PAUSADO" : "STATUS: TOCANDO");
  snprintf(status_right, sizeof(status_right), "%s %u/%u",
           st->is_radio ? "RADIO" : "FAIXA", ti, tc);
  kp_ov_draw_text(rgba_out, w, h, 10, 46, 1, 160, status_left, acc);
  kp_ov_draw_text_right(rgba_out, w, h, w - 10, 46, 1, status_right, muted);

  char title_copy[160];
  memcpy(title_copy, st->title, sizeof(title_copy));
  title_copy[sizeof(title_copy) - 1] = 0;
  const char *tname = title_copy[0] ? title_copy : "Nenhuma faixa disponivel";
  kp_ov_draw_text(rgba_out, w, h, 10, 59, 1, w - 20, tname, white);

  /* 5 Selectable GTA Trainer Menu Rows */
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
      "FECHAR TRAINER",
  };
  const char *row_vals[KP_OV_ROW_COUNT] = {
      st->paused ? "[PAUSADO]" : "[TOCANDO]",
      "[R2 >>]",
      "[<< L2]",
      vol_val,
      "[L3+R3]",
  };

  for (unsigned int i = 0; i < KP_OV_ROW_COUNT; i++) {
    int ry = 74 + (int)i * 26;
    bool active = (i == sel);
    uint32_t rbg = active ? row_sel : ((i & 1u) ? row_odd : row_even);
    uint32_t fg = active ? ink_dark : white;
    uint32_t vcol = active ? ink_dark : ((i == 0 && !st->paused) ? acc : muted);

    kp_ov_fill_rect(rgba_out, w, h, 0, ry, w, 26, rbg);
    if (active) {
      kp_ov_fill_rect(rgba_out, w, h, 0, ry, 4, 26, acc);
    }
    kp_ov_draw_text(rgba_out, w, h, 10, ry + 9, 1, 180, row_labels[i], fg);
    kp_ov_draw_text_right(rgba_out, w, h, w - 10, ry + 9, 1, row_vals[i], vcol);

    /* Inline mini volume bar on Row 3 */
    if (i == 3) {
      int bar_x = 10;
      int bar_w = w - 20;
      int fill_w = (bar_w * vol) / 100;
      kp_ov_fill_rect(rgba_out, w, h, bar_x, ry + 21, bar_w, 3,
                      active ? kp_ov_rgba(180, 190, 206, 255) : kp_ov_rgba(34, 40, 54, 255));
      if (fill_w > 0) {
        kp_ov_fill_rect(rgba_out, w, h, bar_x, ry + 21, fill_w, 3, acc);
      }
    }
  }

  /* Footer Legend */
  kp_ov_fill_rect(rgba_out, w, h, 0, 204, w, 2, div_col);
  kp_ov_fill_rect(rgba_out, w, h, 0, 206, w, 26, bg_sub);
  kp_ov_draw_text(rgba_out, w, h, 10, 210, 1, w - 20, "^v MENU   <> VOL   B ATIVAR", muted);
  kp_ov_draw_text(rgba_out, w, h, 10, 221, 1, w - 20, "L2/R2 FAIXA   A/L3+R3 SAIR", acc);

  /* Crisp outer frame border */
  kp_ov_fill_rect(rgba_out, w, h, 0, 0, w, 1, acc);
  kp_ov_fill_rect(rgba_out, w, h, 0, h - 1, w, 1, acc);
  kp_ov_fill_rect(rgba_out, w, h, 0, 0, 1, h, acc);
  kp_ov_fill_rect(rgba_out, w, h, w - 1, 0, 1, h, acc);
}

#endif /* KPLAYER_OVERLAY_SHARED_H */
