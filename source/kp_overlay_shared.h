#ifndef KPLAYER_OVERLAY_SHARED_H
#define KPLAYER_OVERLAY_SHARED_H

/*
 * Shared memory contract + crisp 5x7 RGBA card renderer for KPlayer R36S
 * In-Game Mini-Player.
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
#define KP_OV_VERSION 1u
#define KP_OV_CARD_W 540
#define KP_OV_CARD_H 108

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

static inline void kp_ov_render_rgba(const KpOverlayShared *st, uint32_t *rgba_out) {
  if (!st || !rgba_out) return;
  const int w = KP_OV_CARD_W;
  const int h = KP_OV_CARD_H;
  uint8_t ar = st->accent_r ? st->accent_r : 29;
  uint8_t ag = st->accent_g ? st->accent_g : 185;
  uint8_t ab = st->accent_b ? st->accent_b : 84;

  uint32_t bg = kp_ov_rgba(14, 17, 24, 238);
  uint32_t acc = kp_ov_rgba(ar, ag, ab, 255);
  uint32_t white = kp_ov_rgba(246, 249, 255, 255);
  uint32_t muted = kp_ov_rgba(194, 206, 224, 255);
  uint32_t track_bg = kp_ov_rgba(38, 44, 58, 255);
  uint32_t div_col = kp_ov_rgba(52, 60, 78, 255);

  kp_ov_fill_rect(rgba_out, w, h, 0, 0, w, h, bg);
  kp_ov_fill_rect(rgba_out, w, h, 0, 0, w, 4, acc);
  kp_ov_fill_rect(rgba_out, w, h, 0, h - 2, w, 2, acc);
  kp_ov_fill_rect(rgba_out, w, h, 0, 0, 2, h, acc);
  kp_ov_fill_rect(rgba_out, w, h, w - 2, 0, 2, h, acc);

  char header[128];
  unsigned int tc = (unsigned int)st->track_count;
  unsigned int ti = (tc > 0) ? ((unsigned int)st->track_index + 1u) : 0u;
  snprintf(header, sizeof(header), "K PLAYER MINI  %s  %s %u/%u",
           st->paused ? "[PAUSADO]" : "[TOCANDO]",
           st->is_radio ? "RADIO" : "FAIXA",
           ti, tc);
  kp_ov_draw_text(rgba_out, w, h, 14, 10, 1, w - 28, header, acc);

  char title_copy[160];
  memcpy(title_copy, st->title, sizeof(title_copy));
  title_copy[sizeof(title_copy) - 1] = 0;
  const char *tname = title_copy[0] ? title_copy : "Nenhuma faixa disponivel";
  kp_ov_draw_text(rgba_out, w, h, 14, 25, 2, w - 28, tname, white);

  int bar_x = 14;
  int bar_y = 52;
  int bar_w = w - 122;
  int vol = (int)st->volume_pct;
  if (vol < 0) vol = 0;
  if (vol > 100) vol = 100;
  kp_ov_fill_rect(rgba_out, w, h, bar_x, bar_y + 1, bar_w, 8, track_bg);
  int fill_w = (bar_w * vol) / 100;
  if (fill_w > 0) kp_ov_fill_rect(rgba_out, w, h, bar_x, bar_y + 1, fill_w, 8, acc);
  char vol_txt[32];
  snprintf(vol_txt, sizeof(vol_txt), "VOL %d%%", vol);
  kp_ov_draw_text(rgba_out, w, h, bar_x + bar_w + 10, bar_y + 1, 1, 96, vol_txt, white);

  kp_ov_fill_rect(rgba_out, w, h, 12, 72, w - 24, 1, div_col);
  kp_ov_draw_text(rgba_out, w, h, 14, 83, 1, w - 28,
                  "L2 VOLTAR  R2 PROXIMA  B PAUSA  ^v VOL  A FECHAR",
                  muted);
}

#endif /* KPLAYER_OVERLAY_SHARED_H */
