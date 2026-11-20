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
/* Rounded rectangle with a vertical gradient from top to bottom color. */
static void rounded_gradient(int x, int y, int w, int h, int r, SDL_Color top,
                             SDL_Color bottom) {
  if (r * 2 > h) r = h / 2;
  for (int row = 0; row < h; row++) {
    int d = row < r ? row : h - 1 - row < r ? h - 1 - row : r;
    int in = corner_inset(r, d);
    color(mix(top, bottom, h > 1 ? (float)row / (h - 1) : 0));
    SDL_RenderDrawLine(renderer, x + in, y + row, x + w - 1 - in, y + row);
  }
}
/* Soft halo around a rounded rectangle: stacked translucent outlines. */
static void glow_rect(int x, int y, int w, int h, int r, SDL_Color c, int size) {
  for (int i = size; i >= 1; i--) {
    int a = (int)(c.a * 0.18f * (1.0f - (float)(i - 1) / size));
    rounded(x - i, y - i, w + 2 * i, h + 2 * i, r + i, alpha(c, a));
  }
}
/* Layers accumulate toward the center; callers draw the solid shape on top. */
static void glow_circle(int cx, int cy, int radius, SDL_Color c, int size) {
  for (int i = size; i >= 1; i--)
    fill_circle(cx, cy, radius + i, alpha(c, (int)(c.a * 0.07f)));
}
/* Panel card: hairline border, faint top highlight. */
static void panel_card(int x, int y, int w, int h, int r) {
  rounded(x, y, w, h, r, hairline());
  rounded_gradient(x + 1, y + 1, w - 2, h - 2, r - 1, mix(panel, textc, 0.025f), panel);
}
/* Focusable row/tile: accent ring + halo when focused, quiet card otherwise.
 * Inner fill keeps the original 2px inset geometry used by each screen. */
static void card(int x, int y, int w, int h, int r, bool focus, SDL_Color base) {
  if (focus) {
    glow_rect(x, y, w, h, r, accent, 5);
    rounded(x, y, w, h, r, accent);
    rounded(x + 2, y + 2, w - 4, h - 4, r > 2 ? r - 2 : r, mix(elevated, accent, 0.08f));
  } else {
    rounded(x, y, w, h, r, mix(base, textc, 0.06f));
    rounded(x + 1, y + 1, w - 2, h - 2, r > 1 ? r - 1 : r, base);
  }
}
/* Pill tab: accent fill when active. */
static void pill(int x, int y, int w, int h, bool on) {
  if (on) glow_rect(x, y, w, h, h / 2, accent, 3);
  rounded(x, y, w, h, h / 2, on ? accent : elevated);
}

/* Background: theme color plus two cached soft accent glows. */
static SDL_Texture *glow_texture;
static void backdrop(void) {
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
    SDL_SetTextureColorMod(glow_texture, accent.r, accent.g, accent.b);
    SDL_SetTextureAlphaMod(glow_texture, 46);
    SDL_RenderCopy(renderer, glow_texture, NULL, NULL);
  }
}

/* Vinyl disc artwork. spin animates a light sweep across the grooves. */
static void vinyl(int cx, int cy, int radius, bool spin) {
  glow_circle(cx, cy, radius, alpha(accent, 255), 6);
  fill_circle(cx, cy, radius, mix(bg, panel, 0.6f));
  SDL_Color groove = mix(bg, textc, 0.09f);
  for (int r = radius - 3; r > radius * 34 / 100; r -= 4)
    ring(cx, cy, r, r - 1, groove);
  /* Light reflection: two opposite wedges of faint lines. */
  double base = spin ? SDL_GetTicks() / 900.0 : 0.6;
  color(alpha(textc, 14));
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
  for (int k = 0; k < 2; k++) {
    float t = (float)((SDL_GetTicks() + k * 900) % 1800) / 1800.0f;
    int r = radius + 2 + (int)(t * 16);
    ring(cx, cy, r, r - 2, alpha(accent, (int)(150 * (1 - t))));
  }
}
/* Synthetic spectrum bars; libVLC exposes no spectrum, so this follows
 * playback state only. */
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
