/* K PLAYER modern skin primitives (GPL-2.0-or-later).
 * Soft glows, gradients, vinyl artwork and a light visualizer, drawn only with
 * SDL2 calls already loaded by dynamic.h. Every color derives from the active
 * theme, so all seven themes keep working. */
static SDL_Color elevated = {36, 36, 36, 255}, dim = {117, 117, 117, 255};

static SDL_Color mix(SDL_Color a, SDL_Color b, float t) {
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return (SDL_Color){(Uint8)(a.r + (b.r - a.r) * t), (Uint8)(a.g + (b.g - a.g) * t),
                     (Uint8)(a.b + (b.b - a.b) * t), (Uint8)(a.a + (b.a - a.a) * t)};
}
static SDL_Color alpha(SDL_Color c, int a) {
  c.a = (Uint8)(a < 0 ? 0 : a > 255 ? 255 : a);
  return c;
}
/* Subtle 1px outline color for cards on the current theme. */
static SDL_Color hairline(void) { return mix(panel, textc, 0.10f); }
static SDL_Color track_color(void) { return mix(elevated, textc, 0.14f); }

static void fill_circle(int cx, int cy, int radius, SDL_Color c) {
  if (radius <= 0) return;
  color(c);
  for (int y = -radius; y <= radius; y++) {
    int dx = (int)sqrt((double)radius * radius - (double)y * y);
    SDL_RenderDrawLine(renderer, cx - dx, cy + y, cx + dx, cy + y);
  }
}
/* Annulus between inner and outer radius, row by row (no overdraw). */
static void ring(int cx, int cy, int outer, int inner, SDL_Color c) {
  if (outer <= 0) return;
  if (inner < 0) inner = 0;
  color(c);
  for (int y = -outer; y <= outer; y++) {
    int xo = (int)sqrt((double)outer * outer - (double)y * y);
    if (abs(y) >= inner) {
      SDL_RenderDrawLine(renderer, cx - xo, cy + y, cx + xo, cy + y);
      continue;
    }
    int xi = (int)sqrt((double)inner * inner - (double)y * y);
    SDL_RenderDrawLine(renderer, cx - xo, cy + y, cx - xi, cy + y);
    SDL_RenderDrawLine(renderer, cx + xi, cy + y, cx + xo, cy + y);
  }
}
/* Corner inset of a rounded rectangle at row d (0 = top edge). */
static int corner_inset(int r, int d) {
  if (d >= r) return 0;
  return r - (int)sqrt((double)r * r - (r - d - .5) * (r - d - .5));
}
/* Rounded rectangle with a smooth vertical gradient (zero pixel overdraw). */
static void rounded_gradient(int x, int y, int w, int h, int r, SDL_Color top,
                             SDL_Color bottom) {
  if (w <= 0 || h <= 0) return;
  if (r < 0) r = 0;
  if (r * 2 > w) r = w / 2;
  if (r * 2 > h) r = h / 2;
  for (int row = 0; row < h; row++) {
    int d = row < r ? row : h - 1 - row < r ? h - 1 - row : r;
    int in = corner_inset(r, d);
    int x0 = x + in;
    int x1 = x + w - 1 - in;
    if (x0 <= x1) {
      color(mix(top, bottom, h > 1 ? (float)row / (h - 1) : 0.0f));
      SDL_RenderDrawLine(renderer, x0, y + row, x1, y + row);
    }
  }
}
/* Crisp 1px rounded outline with zero pixel overdraw (safe for translucent alpha). */
static void rounded_outline(int x, int y, int w, int h, int r, SDL_Color c) {
  if (w <= 0 || h <= 0 || c.a == 0) return;
  if (r < 0) r = 0;
  if (r * 2 > w) r = w / 2;
  if (r * 2 > h) r = h / 2;
  color(c);
  if (w == 1 || h == 1) {
    SDL_RenderDrawLine(renderer, x, y, x + w - 1, y + h - 1);
    return;
  }
  if (r == 0) {
    SDL_RenderDrawLine(renderer, x, y, x + w - 1, y);
    SDL_RenderDrawLine(renderer, x, y + h - 1, x + w - 1, y + h - 1);
    if (h > 2) {
      SDL_RenderDrawLine(renderer, x, y + 1, x, y + h - 2);
      SDL_RenderDrawLine(renderer, x + w - 1, y + 1, x + w - 1, y + h - 2);
    }
    return;
  }
  int prev_in = -1;
  for (int d = 0; d < r; d++) {
    int in = corner_inset(r, d);
    int x0 = x + in;
    int x1 = x + w - 1 - in;
    int yt = y + d;
    int yb = y + h - 1 - d;
    if (d == 0) {
      if (x0 <= x1) {
        SDL_RenderDrawLine(renderer, x0, yt, x1, yt);
        if (yb != yt) SDL_RenderDrawLine(renderer, x0, yb, x1, yb);
      }
    } else {
      int span_end_l = (prev_in > in) ? (x + prev_in - 1) : x0;
      int span_start_r = (prev_in > in) ? (x + w - prev_in) : x1;
      if (span_end_l >= x1) {
        SDL_RenderDrawLine(renderer, x0, yt, x1, yt);
        if (yb != yt) SDL_RenderDrawLine(renderer, x0, yb, x1, yb);
      } else {
        SDL_RenderDrawLine(renderer, x0, yt, span_end_l, yt);
        SDL_RenderDrawLine(renderer, span_start_r, yt, x1, yt);
        if (yb != yt) {
          SDL_RenderDrawLine(renderer, x0, yb, span_end_l, yb);
          SDL_RenderDrawLine(renderer, span_start_r, yb, x1, yb);
        }
      }
    }
    prev_in = in;
  }
  int y_top = y + r;
  int y_bot = y + h - 1 - r;
  if (y_top <= y_bot) {
    SDL_RenderDrawLine(renderer, x, y_top, x, y_bot);
    SDL_RenderDrawLine(renderer, x + w - 1, y_top, x + w - 1, y_bot);
  }
}
/* Soft hollow halo around a rounded rectangle: stacked 1px translucent outlines.
 * Never fills the interior, preventing alpha washout or horizontal stripe overdraw. */
static void glow_rect(int x, int y, int w, int h, int r, SDL_Color c, int size) {
  if (size <= 0 || c.a == 0) return;
  for (int i = size; i >= 1; i--) {
    float falloff = 1.0f - (float)(i - 1) / (float)size;
    int a = (int)(c.a * 0.28f * falloff * falloff);
    if (a > 0)
      rounded_outline(x - i, y - i, w + 2 * i, h + 2 * i, r + i, alpha(c, a));
  }
}
/* Layers accumulate toward the center; callers draw the solid shape on top. */
static void glow_circle(int cx, int cy, int radius, SDL_Color c, int size) {
  for (int i = size; i >= 1; i--)
    fill_circle(cx, cy, radius + i, alpha(c, (int)(c.a * 0.07f)));
}
/* Panel card: smooth vertical gradient fill + crisp 1px hairline border (zero overdraw). */
static void panel_card(int x, int y, int w, int h, int r) {
  rounded_gradient(x + 1, y + 1, w - 2, h - 2, r > 1 ? r - 1 : 0,
                   mix(panel, textc, 0.032f), mix(panel, bg, 0.06f));
  rounded_outline(x, y, w, h, r, hairline());
}
/* Smooth UI animation & screen-transition state (v2.1.0). */
static uint32_t ui_trans_tick = 0;
static uint32_t ui_anim_active_until = 0;
static int ui_last_mode = -1;

static void ui_anim_kick(uint32_t duration_ms) {
  if (preview_mode) return;
  uint32_t until = SDL_GetTicks() + duration_ms;
  if ((int32_t)(until - ui_anim_active_until) > 0)
    ui_anim_active_until = until;
}

static void ui_trans_start(void) {
  if (preview_mode) return;
  ui_trans_tick = SDL_GetTicks();
  ui_anim_kick(260);
}

static void ui_trans_check_mode(int cur_mode) {
  if (ui_last_mode < 0) {
    ui_last_mode = cur_mode;
    return;
  }
  if (cur_mode != ui_last_mode) {
    ui_last_mode = cur_mode;
    ui_trans_start();
  }
}

static void ui_trans_overlay(void) {
  if (preview_mode || ui_trans_tick == 0) return;
  uint32_t dt = SDL_GetTicks() - ui_trans_tick;
  if (dt >= 210u) {
    ui_trans_tick = 0;
    return;
  }
  float p = (float)dt / 210.0f;
  float ease = 1.0f - (1.0f - p) * (1.0f - p);
  int a = (int)((1.0f - ease) * 145.0f);
  if (a > 2) {
    begin_full_screen_pass();
    rect(0, 0, display_adaptive_active ? dev_w : W,
         display_adaptive_active ? dev_h : H, alpha(bg, a));
    begin_ui_pass();
  }
}

/* Focusable row/tile: smooth vertical gradient + living hollow accent ring + beacon bar. */
static void card(int x, int y, int w, int h, int r, bool focus, SDL_Color base) {
  if (focus) {
    float pulse_f = preview_mode ? 0.5f : (0.5f + 0.5f * sinf((float)SDL_GetTicks() * 0.0055f));
    int glow_sz = 4 + (int)(pulse_f * 2.5f);
    glow_rect(x, y, w, h, r, alpha(accent, (int)(205.0f + pulse_f * 50.0f)), glow_sz);
    rounded_gradient(x + 2, y + 2, w - 4, h - 4, r > 2 ? r - 2 : r,
                     mix(elevated, accent, 0.14f + pulse_f * 0.06f),
                     mix(panel, accent, 0.04f));
    SDL_Color border_c = mix(accent, textc, pulse_f * 0.14f);
    rounded_outline(x, y, w, h, r, border_c);
    rounded_outline(x + 1, y + 1, w - 2, h - 2, r > 1 ? r - 1 : r, border_c);
    /* Subtle animated accent beacon bar on the left edge */
    if (h >= 28 && w >= 80) {
      int bh = h - 14;
      if (bh > 8)
        rounded(x + 5, y + (h - bh) / 2, 3, bh, 1, alpha(accent, (int)(175.0f + pulse_f * 80.0f)));
    }
  } else {
    rounded_gradient(x + 1, y + 1, w - 2, h - 2, r > 1 ? r - 1 : r,
                     mix(base, textc, 0.025f), base);
    rounded_outline(x, y, w, h, r, mix(base, textc, 0.08f));
  }
}
/* Pill tab: accent fill with subtle pulse when active. */
static void pill(int x, int y, int w, int h, bool on) {
  if (on) {
    float p = preview_mode ? 0.5f : (0.5f + 0.5f * sinf((float)SDL_GetTicks() * 0.0045f));
    glow_rect(x, y, w, h, h / 2, alpha(accent, (int)(185.0f + p * 65.0f)), 3);
  }
  rounded(x, y, w, h, h / 2, on ? accent : elevated);
}

/* Background: theme color plus living breathing accent glow and soft drifting ambient bokeh. */
static SDL_Texture *glow_texture;
static void backdrop(void) {
  begin_full_screen_pass();
  color(bg);
  SDL_RenderClear(renderer);
  if (!glow_texture) {
    enum { GW = 64, GH = 48 };
    static Uint8 px[GW * GH * 4];
    for (int y = 0; y < GH; y++)
      for (int x = 0; x < GW; x++) {
        double dx = x / (double)GW, dy = y / (double)GH;
        double a = 1.0 - sqrt(dx * dx * 1.1 + dy * dy * 1.9);
        double b = 1.0 - sqrt((1 - dx) * (1 - dx) * 2.4 + (1 - dy) * (1 - dy) * 3.2);
        double v = fmax(0, a) * fmax(0, a) * 1.0 + fmax(0, b) * fmax(0, b) * 0.45;
        Uint8 *p = &px[(y * GW + x) * 4];
        p[0] = p[1] = p[2] = 255;
        p[3] = (Uint8)fmin(255, v * 255);
      }
    glow_texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                     SDL_TEXTUREACCESS_STATIC, GW, GH);
    if (glow_texture) {
      SDL_UpdateTexture(glow_texture, NULL, px, GW * 4);
      SDL_SetTextureBlendMode(glow_texture, SDL_BLENDMODE_BLEND);
    }
  }
  if (glow_texture) {
    float t = preview_mode ? 0.0f : (float)SDL_GetTicks() / 1000.0f;
    Uint8 glow_a = (Uint8)(42.0f + 12.0f * (0.5f + 0.5f * sinf(t * 0.85f)));
    SDL_SetTextureColorMod(glow_texture, accent.r, accent.g, accent.b);
    SDL_SetTextureAlphaMod(glow_texture, glow_a);
    SDL_RenderCopy(renderer, glow_texture, NULL, NULL);
  }
  begin_ui_pass();
  if (!preview_mode) {
    /* Subtle drifting ambient light orbs for living UI atmosphere */
    float t = (float)SDL_GetTicks() / 1000.0f;
    for (int i = 0; i < 4; i++) {
      float fi = (float)i;
      int ox = (int)(110.0f + fi * 145.0f + sinf(t * (0.38f + fi * 0.11f) + fi * 1.7f) * 38.0f);
      int oy = (int)(95.0f + (i % 2) * 230.0f + cosf(t * (0.31f + fi * 0.09f) + fi * 2.1f) * 24.0f);
      int orad = 26 + (i % 3) * 10;
      fill_circle(ox, oy, orad, alpha(accent, 7));
      fill_circle(ox, oy, orad / 2, alpha(accent, 6));
    }
  }
}

/* Vinyl disc artwork. spin animates a light sweep across the grooves. */
static void vinyl(int cx, int cy, int radius, bool spin) {
  float glow_p = (spin && !preview_mode)
                     ? (0.75f + 0.25f * sinf((float)SDL_GetTicks() * 0.005f))
                     : 1.0f;
  glow_circle(cx, cy, radius, alpha(accent, (int)(255.0f * glow_p)), 6);
  fill_circle(cx, cy, radius, mix(bg, panel, 0.6f));
  SDL_Color groove = mix(bg, textc, 0.09f);
  for (int r = radius - 3; r > radius * 34 / 100; r -= 4)
    ring(cx, cy, r, r - 1, groove);
  /* Light reflection: two opposite wedges of faint lines. */
  double base = spin ? SDL_GetTicks() / 900.0 : 0.6;
  color(alpha(textc, 16));
  for (int k = 0; k < 2; k++)
    for (int i = 0; i < 18; i++) {
      double a = base + k * M_PI + i * 0.022;
      int r0 = radius * 36 / 100, r1 = radius - 2;
      SDL_RenderDrawLine(renderer, cx + (int)(cos(a) * r0), cy + (int)(sin(a) * r0),
                         cx + (int)(cos(a) * r1), cy + (int)(sin(a) * r1));
    }
  int label_r = radius * 32 / 100;
  fill_circle(cx, cy, label_r, accent);
  ring(cx, cy, label_r, label_r - 2, mix(accent, textc, 0.25f));
  fill_circle(cx, cy, label_r / 4 > 2 ? label_r / 4 : 2, bg);
}
/* Expanding rings for live radio. */
static void pulse(int cx, int cy, int radius, bool on) {
  if (!on) return;
  for (int k = 0; k < 3; k++) {
    float t = (float)((SDL_GetTicks() + k * 600) % 1800) / 1800.0f;
    int r = radius + 2 + (int)(t * 18);
    ring(cx, cy, r, r - 2, alpha(accent, (int)(155 * (1 - t))));
  }
}
/* Synthetic spectrum bars with glowing tips; follows playback state smoothly. */
static void visualizer(int x, int y, int w, int h, int bars, bool on) {
  int gap = 2, bw = (w - gap * (bars - 1)) / bars;
  if (bw < 2) bw = 2;
  double t = SDL_GetTicks() / 1000.0;
  for (int i = 0; i < bars; i++) {
    double v = 0.08;
    if (on) {
      v = 0.22 + 0.5 * fabs(sin(t * 2.4 + i * 0.55)) * (0.6 + 0.4 * sin(t * 1.1 + i * 0.13));
      v += 0.18 * fabs(sin(t * 5.3 + i * 1.7));
      if (v > 1) v = 1;
    }
    int bh = (int)(v * h);
    if (bh < 2) bh = 2;
    int bx = x + i * (bw + gap);
    rounded(bx, y + h - bh, bw, bh, bw >= 4 ? 2 : 0,
            alpha(accent, (int)(90 + v * 165)));
    if (on && bh >= 5)
      rect(bx, y + h - bh, bw, 2, alpha(textc, (int)(85 + v * 140)));
  }
}
/* Accent play/pause button with halo, icon drawn in background color. */
static void play_disc(int cx, int cy, int radius, bool pause_icon) {
  int halo = radius >= 18 ? 6 : 4;
  glow_circle(cx, cy, radius, alpha(accent, 255), halo);
  fill_circle(cx, cy, radius, accent);
  if (pause_icon) {
    int h = (radius * 9) / 10;
    if (h < 8) h = 8;
    int bw = (radius * 26) / 100;
    if (bw < 2) bw = 2;
    int gap = bw;
    int top = cy - h / 2;
    int left_x = cx - (gap / 2) - bw;
    int right_x = cx + ((gap + 1) / 2);
    rounded(left_x, top, bw, h, bw / 2, bg);
    rounded(right_x, top, bw, h, bw / 2, bg);
  } else {
    int s = ((radius * 9) / 10) | 1;
    if (s < 9) s = 9;
    triangle(cx - s / 3, cy - s / 2, s, bg);
  }
}
