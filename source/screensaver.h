/* Native R36S Screensaver (Protetor de Tela) — Mode 13 (v2.1.0).
 * Activates automatically after configurable idle timeout (30s / 60s / 2m / 5m)
 * while playing Music or Radio, or on-demand from Options -> Protetor de tela.
 *
 * Features (v2.1.0):
 * - 10 rich audio-reactive visualizers (WMP classics + 5 new neon/3D effects) + Auto cycle:
 *   1) Barras e Ondas   2) Alquimia        3) Bateria / Pulso  4) Plenitude        5) Ambience / Cosmos
 *   6) Túnel Neon       7) Chuva Matrix    8) Chama / Fogo     9) Prisma 3D       10) Galáxia Espiral
 * - Optional Clock (time + formatted date) & live Open-Meteo Weather badge
 * - Optional synchronized Music Lyrics (.LRC / plain) over the live visualizer background
 * - Live in-screensaver controls: L1/R1 switch visualizer, X toggle lyrics, Y toggle clock/weather
 */

static const int ss_timeout_secs[] = {0, 30, 60, 120, 300};
static const char *ss_timeout_labels[] = {
    "Desativado", "30 segundos", "60 segundos", "2 minutos", "5 minutos"
};
#define SS_TIMEOUT_COUNT 5

static const char *ss_viz_labels[] = {
    "Auto (Alternar)",
    "Barras e Ondas",
    "Alquimia",
    "Bateria / Pulso",
    "Plenitude",
    "Ambience / Cosmos",
    "Túnel Neon",
    "Chuva Matrix",
    "Chama / Fogo",
    "Prisma 3D",
    "Galáxia Espiral"
};
#define SS_VIZ_COUNT 11

static int ss_timeout_idx = 1;    /* Default: 30 segundos (v2.0.7+) */
static int ss_viz_style = 0;      /* Default: Auto (Alternar) */
static bool ss_show_clock = true; /* Default: Relogio, data e clima ON */
static bool ss_show_lyrics = true;/* Default: Letras sobre visualizador ON */

static int ss_return_mode = 4;
static uint32_t ss_last_input_tick = 0;
static uint32_t ss_entered_tick = 0;
static uint32_t ss_hint_until = 0;
static float ss_bands[32];
static float ss_peaks[32];

static void ss_touch_activity(void) {
  ss_last_input_tick = SDL_GetTicks();
}

static void ss_open(int ret_mode) {
  ss_return_mode = (ret_mode == 13) ? 4 : ret_mode;
  mode = 13;
  ss_entered_tick = SDL_GetTicks();
  ss_hint_until = ss_entered_tick + 4500;
  menu_dirty = true;
}

static void ss_check_idle(uint32_t now) {
  if (ss_timeout_idx <= 0 || ss_timeout_idx >= SS_TIMEOUT_COUNT) return;
  if (mode == 13 || mode == 1 || mode == 5 || mode == 6 || mode == 10 || mode == 12 || mode == 14) return;
  if (kp_upd_applying) return;
  if (!active || paused || (!playing_audio && !playing_radio)) return;
  if (ss_last_input_tick == 0) {
    ss_last_input_tick = now;
    return;
  }
  uint32_t limit_ms = (uint32_t)ss_timeout_secs[ss_timeout_idx] * 1000u;
  if (now - ss_last_input_tick >= limit_ms) {
    ss_open(mode);
  }
}

static SDL_Color ss_hsv_color(float h_deg, float s, float v, Uint8 a) {
  while (h_deg < 0.0f) h_deg += 360.0f;
  while (h_deg >= 360.0f) h_deg -= 360.0f;
  float c = v * s;
  float x = c * (1.0f - fabsf(fmodf(h_deg / 60.0f, 2.0f) - 1.0f));
  float m = v - c;
  float r = 0, g = 0, b = 0;
  if (h_deg < 60.0f)      { r = c; g = x; b = 0; }
  else if (h_deg < 120.0f){ r = x; g = c; b = 0; }
  else if (h_deg < 180.0f){ r = 0; g = c; b = x; }
  else if (h_deg < 240.0f){ r = 0; g = x; b = c; }
  else if (h_deg < 300.0f){ r = x; g = 0; b = c; }
  else                    { r = c; g = 0; b = x; }
  SDL_Color out = {
      (Uint8)fminf(255.0f, (r + m) * 255.0f),
      (Uint8)fminf(255.0f, (g + m) * 255.0f),
      (Uint8)fminf(255.0f, (b + m) * 255.0f),
      a
  };
  return out;
}

/* Musical multi-band spectrum + beat generator synchronized to playback clock */
static void ss_update_spectrum(float t, float *out_bass, float *out_mid, float *out_high) {
  bool live = active && !paused;
  float energy_scale = live ? 1.0f : 0.14f;
  unsigned seed = 37u;
  const char *src = title[0] ? title : (media_name[0] ? media_name : "kplayer");
  for (const unsigned char *p = (const unsigned char *)src; *p; p++)
    seed = seed * 31u + *p;
  float bpm_hz = 1.75f + (float)(seed % 55u) * 0.014f; /* ~105-150 BPM */
  float beat_phase = fmodf(t * bpm_hz, 1.0f);
  float kick = powf(fmaxf(0.0f, 1.0f - beat_phase * 2.8f), 2.2f);
  float snare = powf(fmaxf(0.0f, 1.0f - fabsf(beat_phase - 0.5f) * 5.0f), 2.0f);

  float bass_sum = 0.0f, mid_sum = 0.0f, high_sum = 0.0f;
  for (int i = 0; i < 32; i++) {
    float fi = (float)i / 31.0f;
    float w1 = 0.5f + 0.5f * sinf(t * (2.6f + fi * 4.5f) + fi * 9.0f + (float)(seed % 17u));
    float w2 = 0.5f + 0.5f * cosf(t * (4.1f + (1.0f - fi) * 3.8f) - fi * 6.5f);
    float w3 = 0.5f + 0.5f * sinf(t * 7.8f + (float)i * 1.37f);
    float raw = 0.16f + 0.42f * w1 * w2 + 0.20f * w3;
    if (i < 8) raw += kick * (0.58f - fi * 0.8f);
    else if (i < 20) raw += snare * 0.34f + kick * 0.14f;
    else raw += (snare * 0.26f + w3 * 0.24f);
    raw *= energy_scale;
    if (raw > 1.0f) raw = 1.0f;
    if (raw < 0.04f) raw = 0.04f;
    ss_bands[i] = ss_bands[i] * 0.48f + raw * 0.52f;
    if (ss_bands[i] > ss_peaks[i]) ss_peaks[i] = ss_bands[i];
    else {
      ss_peaks[i] -= 0.015f;
      if (ss_peaks[i] < ss_bands[i]) ss_peaks[i] = ss_bands[i];
    }
    if (i < 8) bass_sum += ss_bands[i];
    else if (i < 20) mid_sum += ss_bands[i];
    else high_sum += ss_bands[i];
  }
  *out_bass = bass_sum / 8.0f;
  *out_mid = mid_sum / 12.0f;
  *out_high = high_sum / 12.0f;
}

static void ss_draw_thick_line(int x0, int y0, int x1, int y1, SDL_Color c) {
  color(c);
  SDL_RenderDrawLine(renderer, x0, y0, x1, y1);
  SDL_RenderDrawLine(renderer, x0, y0 + 1, x1, y1 + 1);
  SDL_RenderDrawLine(renderer, x0 + 1, y0, x1 + 1, y1);
}

static void ss_clear_deep_bg(Uint8 r, Uint8 g, Uint8 b) {
  begin_full_screen_pass();
  color((SDL_Color){r, g, b, 255});
  SDL_RenderClear(renderer);
  begin_ui_pass();
}

/* 1. WMP "Barras e Ondas" (Upgraded v2.1.0: mirrored neon bars + peaks + dual oscilloscope + floating beat sparks) */
static void ss_viz_bars_waves(float t, float bass, float mid) {
  ss_clear_deep_bg(6, 9, 18);
  float hue0 = fmodf(t * 24.0f, 360.0f);

  /* Ambient beat aura behind spectrum */
  glow_circle(W / 2, H / 2, 76 + (int)(bass * 95.0f),
              ss_hsv_color(hue0 + 40.0f, 0.85f, 0.9f, (Uint8)(32 + bass * 42)), 20);
  if (bass > 0.56f) {
    ring(W / 2, H / 2, 110 + (int)(bass * 120.0f), 107 + (int)(bass * 120.0f),
         ss_hsv_color(hue0 + 180.0f, 0.9f, 1.0f, (Uint8)((bass - 0.55f) * 260.0f)));
  }

  /* Mirrored neon spectrum bars with bright floating peak caps */
  int bar_w = 13, gap = 5, total_w = 32 * (bar_w + gap) - gap;
  int start_x = (W - total_w) / 2;
  int base_y = 334;
  for (int i = 0; i < 32; i++) {
    float v = ss_bands[i];
    int h = 10 + (int)(v * 184.0f);
    int x = start_x + i * (bar_w + gap);
    SDL_Color col = ss_hsv_color(hue0 + (float)i * 7.8f, 0.92f, 0.96f, 232);
    SDL_Color refl = ss_hsv_color(hue0 + (float)i * 7.8f, 0.85f, 0.65f, 76);
    rounded(x, base_y - h, bar_w, h, 3, col);
    rect(x, base_y - h, bar_w, 3, alpha(textc, 195));
    int rh = h / 3;
    if (rh > 4) rounded(x, base_y + 4, bar_w, rh, 2, refl);
    int py = base_y - (10 + (int)(ss_peaks[i] * 184.0f)) - 6;
    rounded(x, py, bar_w, 4, 2, (SDL_Color){255, 255, 255, 225});
  }

  /* Rising audio sparks above peak caps */
  for (int i = 0; i < 24; i++) {
    float fi = (float)i;
    float cycle = fmodf(t * (0.55f + (i % 5) * 0.14f) + fi * 0.37f, 1.0f);
    int sx = (int)(fmodf(fi * 83.0f + sinf(t + fi) * 22.0f, (float)W));
    if (sx < 0) sx += W;
    int sy = base_y - (int)(cycle * (170.0f + bass * 130.0f));
    Uint8 sa = (Uint8)((1.0f - cycle) * (130.0f + mid * 110.0f));
    fill_circle(sx, sy, 2, ss_hsv_color(hue0 + fi * 14.0f, 0.9f, 1.0f, sa));
  }

  /* Dual neon WMP oscilloscope ribbons */
  int prev_x = 0, prev_y1 = 232, prev_y2 = 248;
  for (int x = 0; x <= W; x += 8) {
    float nx = (float)x / (float)W;
    int bi = (int)(nx * 31.0f);
    float amp1 = (24.0f + bass * 76.0f + ss_bands[bi] * 38.0f);
    float amp2 = (16.0f + mid * 64.0f + ss_bands[31 - bi] * 32.0f);
    int y1 = 228 + (int)(sinf(nx * 14.5f + t * 4.4f) * amp1 * sinf(nx * 3.14159f));
    int y2 = 248 + (int)(cosf(nx * 19.0f - t * 5.2f) * amp2 * sinf(nx * 3.14159f));
    if (x > 0) {
      ss_draw_thick_line(prev_x, prev_y1, x, y1, ss_hsv_color(hue0 + 145.0f + nx * 95.0f, 0.95f, 1.0f, 238));
      ss_draw_thick_line(prev_x, prev_y2, x, y2, ss_hsv_color(hue0 + 275.0f + nx * 80.0f, 0.9f, 1.0f, 185));
    }
    prev_x = x;
    prev_y1 = y1;
    prev_y2 = y2;
  }
}

/* 2. WMP "Alquimia" (Upgraded v2.1.0: counter-rotating neon kaleidoscope + inner mandala star) */
static void ss_viz_alchemy(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(8, 5, 16);
  int cx = W / 2, cy = H / 2;
  float hue0 = fmodf(t * 28.0f, 360.0f);

  glow_circle(cx, cy, 46 + (int)(bass * 62.0f), ss_hsv_color(hue0, 0.9f, 1.0f, 118), 16);

  /* Counter-rotating inner starburst mandala */
  for (int i = 0; i < 12; i++) {
    float a = -t * 1.15f + (float)i * (6.283185f / 12.0f);
    float r_in = 22.0f + bass * 24.0f;
    float r_out = 72.0f + ss_bands[(i * 2) % 32] * 92.0f;
    int x0 = cx + (int)(cosf(a) * r_in);
    int y0 = cy + (int)(sinf(a) * r_in);
    int x1 = cx + (int)(cosf(a + 0.14f) * r_out);
    int y1 = cy + (int)(sinf(a + 0.14f) * r_out);
    ss_draw_thick_line(x0, y0, x1, y1, ss_hsv_color(hue0 + 180.0f + i * 24.0f, 0.95f, 1.0f, 175));
  }

  for (int layer = 0; layer < 4; layer++) {
    float lf = (float)layer;
    float dir = (layer % 2 == 0) ? 1.0f : -1.0f;
    int petals = 6 + layer * 2;
    float base_r = 56.0f + lf * 46.0f + bass * (34.0f + lf * 11.0f);
    float rot = t * (0.58f + lf * 0.24f) * dir;
    SDL_Color col = ss_hsv_color(hue0 + lf * 68.0f, 0.92f, 1.0f, (Uint8)(220 - layer * 30));

    int px = 0, py = 0;
    const int steps = 48;
    for (int s = 0; s <= steps; s++) {
      float ang = (float)s / (float)steps * 6.283185f;
      int bi = (s * 32 / steps) % 32;
      float wave = sinf(ang * (float)petals + t * 2.8f * dir) * (18.0f + mid * 38.0f + ss_bands[bi] * 26.0f);
      float r = base_r + wave;
      int x = cx + (int)(cosf(ang + rot) * r * 1.18f);
      int y = cy + (int)(sinf(ang + rot) * r * 0.86f);
      if (s > 0) ss_draw_thick_line(px, py, x, y, col);
      px = x;
      py = y;
    }
  }

  for (int i = 0; i < 20; i++) {
    float a = t * (1.25f + (i % 3) * 0.35f) + (float)i * 0.314f;
    float rad = 70.0f + ss_bands[i] * 145.0f + sinf(t * 2.2f + (float)i) * 26.0f;
    int ox = cx + (int)(cosf(a) * rad * 1.18f);
    int oy = cy + (int)(sinf(a) * rad * 0.84f);
    SDL_Color oc = ss_hsv_color(hue0 + (float)i * 18.0f, 0.95f, 1.0f, (Uint8)(145 + high * 110));
    glow_circle(ox, oy, 3, oc, 3);
    fill_circle(ox, oy, 3, oc);
  }
}

/* 3. WMP "Bateria / Pulso" (Upgraded v2.1.0: radial sunburst + concentric beat shockwaves + orbiting comets) */
static void ss_viz_battery(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(5, 10, 14);
  int cx = W / 2, cy = H / 2;
  float hue0 = fmodf(t * 20.0f, 360.0f);

  for (int k = 0; k < 5; k++) {
    float phase = fmodf(t * 0.65f + (float)k * 0.20f, 1.0f);
    int r = 34 + (int)(phase * 240.0f + bass * 22.0f);
    Uint8 a = (Uint8)((1.0f - phase) * (1.0f - phase) * (135.0f + bass * 115.0f));
    if (a > 4)
      ring(cx, cy, r, r - 3, ss_hsv_color(hue0 + (float)k * 48.0f, 0.92f, 1.0f, a));
  }

  for (int i = 0; i < 32; i++) {
    float ang = (float)i / 32.0f * 6.283185f + t * 0.42f;
    float inner_r = 46.0f + bass * 26.0f;
    float outer_r = inner_r + 22.0f + ss_bands[i] * 150.0f;
    int x0 = cx + (int)(cosf(ang) * inner_r);
    int y0 = cy + (int)(sinf(ang) * inner_r);
    int x1 = cx + (int)(cosf(ang) * outer_r);
    int y1 = cy + (int)(sinf(ang) * outer_r);
    SDL_Color rc = ss_hsv_color(hue0 + (float)i * 11.25f, 0.95f, 1.0f, 232);
    ss_draw_thick_line(x0, y0, x1, y1, rc);
    fill_circle(x1, y1, 3 + (int)(ss_bands[i] * 3.0f), (SDL_Color){255, 255, 255, 215});
  }

  /* Orbiting plasma comets */
  for (int c = 0; c < 3; c++) {
    float a = -t * (1.6f + c * 0.4f) + c * 2.094f;
    float rad = 118.0f + c * 32.0f + mid * 28.0f;
    for (int tail = 0; tail < 6; tail++) {
      float ta = a + (float)tail * 0.085f;
      int tx = cx + (int)(cosf(ta) * rad * 1.15f);
      int ty = cy + (int)(sinf(ta) * rad * 0.85f);
      fill_circle(tx, ty, 5 - tail / 2, ss_hsv_color(hue0 + c * 110.0f, 0.9f, 1.0f, (Uint8)(210 - tail * 32)));
    }
  }

  int core_r = 34 + (int)(bass * 26.0f);
  glow_circle(cx, cy, core_r, ss_hsv_color(hue0 + 180.0f, 0.9f, 1.0f, 195), 14);
  fill_circle(cx, cy, core_r, (SDL_Color){14, 20, 32, 240});
  ring(cx, cy, core_r, core_r - 4, ss_hsv_color(hue0 + 140.0f, 0.9f, 1.0f, (Uint8)(185 + high * 70)));
  fill_circle(cx, cy, 10 + (int)(mid * 12.0f), ss_hsv_color(hue0 + 40.0f, 0.8f, 1.0f, 240));
}

/* 4. WMP "Plenitude" (Upgraded v2.1.0: layered aurora curtains + shimmering starlight dust) */
static void ss_viz_plenitude(float t, float bass, float mid) {
  ss_clear_deep_bg(4, 10, 18);
  float hue0 = fmodf(135.0f + t * 18.0f, 360.0f);

  /* Shimmering background stars */
  for (int i = 0; i < 36; i++) {
    int sx = (i * 97 + 19) % W;
    int sy = (i * 53 + 11) % (H - 80);
    float tw = 0.45f + 0.55f * sinf(t * (2.2f + (i % 4)) + (float)i * 1.9f);
    fill_circle(sx, sy, (i % 5 == 0) ? 2 : 1, (SDL_Color){220, 240, 255, (Uint8)(60 + tw * 155)});
  }

  for (int r = 0; r < 6; r++) {
    float rf = (float)r;
    int base_y = 112 + r * 48;
    SDL_Color col = ss_hsv_color(hue0 + rf * 34.0f, 0.88f, 0.96f, (Uint8)(140 + r * 14));
    SDL_Color fill_col = ss_hsv_color(hue0 + rf * 34.0f, 0.85f, 0.8f, 30);
    int px = 0, py = base_y;
    for (int x = 0; x <= W; x += 10) {
      float nx = (float)x / (float)W;
      int bi = (int)(nx * 31.0f);
      float amp = 24.0f + bass * 44.0f + ss_bands[bi] * 50.0f + mid * 20.0f;
      int y = base_y
              + (int)(sinf(nx * (6.0f + rf * 1.4f) + t * (1.25f + rf * 0.25f)) * amp)
              + (int)(cosf(nx * 11.0f - t * (1.8f + rf * 0.2f)) * (12.0f + mid * 22.0f));
      if (y < 24) y = 24;
      if (y > H - 24) y = H - 24;
      rect(x, y, 10, H - y, fill_col);
      if (x > 0) ss_draw_thick_line(px, py, x, y, col);
      px = x;
      py = y;
    }
  }
}

/* 5. WMP "Ambience / Cosmos" (Upgraded v2.1.0: warp starfield + orbiting cosmic rings + horizon wave) */
static void ss_viz_ambience(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(4, 6, 14);
  int cx = W / 2, cy = H / 2;
  float hue0 = fmodf(t * 22.0f, 360.0f);

  glow_circle(cx, cy, 84 + (int)(bass * 75.0f), ss_hsv_color(hue0, 0.82f, 0.95f, 52), 20);
  glow_circle(cx - 120, cy + 50, 56 + (int)(mid * 48.0f), ss_hsv_color(hue0 + 130.0f, 0.8f, 0.9f, 40), 14);
  glow_circle(cx + 135, cy - 45, 52 + (int)(high * 45.0f), ss_hsv_color(hue0 + 230.0f, 0.8f, 0.9f, 40), 14);

  /* Warp starfield */
  for (int i = 0; i < 64; i++) {
    float fi = (float)i;
    float ang = fi * 2.39996f + t * 0.09f;
    float speed = 0.26f + (i % 7) * 0.06f + bass * 0.32f;
    float z = fmodf(fi * 0.137f + t * speed, 1.0f);
    float prev_z = z - 0.055f;
    if (prev_z < 0.02f) prev_z = 0.02f;
    float r = z * z * 340.0f;
    float pr = prev_z * prev_z * 340.0f;
    int sx = cx + (int)(cosf(ang) * r * 1.15f);
    int sy = cy + (int)(sinf(ang) * r * 0.86f);
    int px = cx + (int)(cosf(ang) * pr * 1.15f);
    int py = cy + (int)(sinf(ang) * pr * 0.86f);
    Uint8 a = (Uint8)(z * (185.0f + high * 70.0f));
    SDL_Color sc = ss_hsv_color(hue0 + fi * 9.0f, 0.65f, 1.0f, a);
    color(sc);
    SDL_RenderDrawLine(renderer, px, py, sx, sy);
    fill_circle(sx, sy, z > 0.68f ? 3 : 2, sc);
  }

  /* Harmonic horizon wave */
  int px = 0, py = 320;
  for (int x = 0; x <= W; x += 8) {
    float nx = (float)x / (float)W;
    int bi = (int)(nx * 31.0f);
    int y = 322 + (int)(sinf(nx * 12.0f + t * 2.8f) * (18.0f + ss_bands[bi] * 56.0f + mid * 22.0f));
    if (x > 0)
      ss_draw_thick_line(px, py, x, y, ss_hsv_color(hue0 + 90.0f + nx * 120.0f, 0.88f, 1.0f, 185));
    px = x;
    py = y;
  }
}

/* 6. NEW (v2.1.0): "Túnel Neon" — 3D perspective hyperspace tunnel + laser rays */
static void ss_viz_tunnel(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(5, 4, 14);
  int cx = W / 2 + (int)(sinf(t * 0.9f) * 38.0f);
  int cy = H / 2 + (int)(cosf(t * 0.7f) * 24.0f);
  float hue0 = fmodf(t * 32.0f, 360.0f);

  /* Radial laser rays shooting out from tunnel vanishing point */
  for (int r = 0; r < 16; r++) {
    float ang = (float)r / 16.0f * 6.283185f + t * 0.35f;
    int x1 = cx + (int)(cosf(ang) * 420.0f);
    int y1 = cy + (int)(sinf(ang) * 320.0f);
    color(ss_hsv_color(hue0 + r * 22.0f, 0.9f, 0.9f, (Uint8)(42 + high * 55)));
    SDL_RenderDrawLine(renderer, cx, cy, x1, y1);
  }

  /* Zooming polygonal neon tunnel rings (octagons) */
  const int rings_n = 12;
  const int sides = 8;
  for (int k = 0; k < rings_n; k++) {
    float depth = fmodf((float)k / (float)rings_n + t * (0.42f + bass * 0.35f), 1.0f);
    float scale = depth * depth * (340.0f + bass * 48.0f);
    if (scale < 8.0f) continue;
    float rot = t * 0.6f + depth * 1.8f * sinf(t * 0.5f);
    Uint8 a = (Uint8)fminf(255.0f, depth * 265.0f);
    SDL_Color rc = ss_hsv_color(hue0 + depth * 180.0f, 0.95f, 1.0f, a);
    int ox = cx + (int)(sinf(depth * 3.2f + t) * (1.0f - depth) * 30.0f);
    int oy = cy + (int)(cosf(depth * 2.6f - t) * (1.0f - depth) * 20.0f);

    int px = 0, py = 0;
    for (int s = 0; s <= sides; s++) {
      float ang = rot + (float)s / (float)sides * 6.283185f;
      int bi = (k * 2 + s) % 32;
      float wobble = 1.0f + ss_bands[bi] * 0.14f;
      int x = ox + (int)(cosf(ang) * scale * 1.18f * wobble);
      int y = oy + (int)(sinf(ang) * scale * 0.86f * wobble);
      if (s > 0) ss_draw_thick_line(px, py, x, y, rc);
      px = x;
      py = y;
    }
  }
  glow_circle(cx, cy, 18 + (int)(mid * 24.0f), ss_hsv_color(hue0 + 160.0f, 0.85f, 1.0f, 165), 10);
}

/* 7. NEW (v2.1.0): "Chuva Matrix" — cascading luminous digital neon rain columns */
static void ss_viz_matrix(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(3, 10, 8);
  float hue0 = fmodf(130.0f + sinf(t * 0.25f) * 35.0f, 360.0f);
  const int cols = 32;
  int col_w = W / cols;

  for (int c = 0; c < cols; c++) {
    float speed = 0.28f + ((c * 37) % 11) * 0.045f + ss_bands[c] * 0.28f;
    float head_y = fmodf(t * speed + ((c * 73) % 100) * 0.01f, 1.35f) * (float)H - 60.0f;
    int tail_len = 8 + (c % 6) * 2 + (int)(ss_bands[c] * 10.0f);
    int cx = c * col_w + 4;

    for (int step = 0; step < tail_len; step++) {
      int gy = (int)head_y - step * 14;
      if (gy < -12 || gy > H) continue;
      float fade = 1.0f - (float)step / (float)tail_len;
      Uint8 a = (Uint8)(fade * fade * (185.0f + mid * 70.0f));
      if (step == 0) {
        glow_circle(cx + 5, gy + 5, 5, ss_hsv_color(hue0, 0.6f, 1.0f, 165), 3);
        rounded(cx, gy, 11, 10, 3, (SDL_Color){235, 255, 240, 245});
      } else {
        /* Stylized digital glyph bar variation */
        int glyph_seed = ((c * 13 + step * 7 + (int)(t * 8.0f)) & 7);
        int gw = (glyph_seed & 1) ? 10 : 7;
        int gx = cx + ((glyph_seed & 2) ? 2 : 0);
        SDL_Color gc = ss_hsv_color(hue0 + (float)(step * 3), 0.92f, 0.92f, a);
        rounded(gx, gy, gw, 9, 2, gc);
        if (glyph_seed == 0 && step < 4)
          rect(gx + 2, gy + 3, gw > 4 ? gw - 4 : 2, 3, alpha((SDL_Color){4, 14, 10, 255}, a));
      }
    }
  }

  /* Bottom bass energy horizon glow */
  int horizon_h = 28 + (int)(bass * 52.0f + high * 18.0f);
  rect(0, H - horizon_h, W, horizon_h, ss_hsv_color(hue0, 0.9f, 0.8f, 34));
}

/* 8. NEW (v2.1.0): "Chama / Fogo" — layered plasma flame waves + soaring embers */
static void ss_viz_fire(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(14, 5, 4);

  /* Layered plasma flame curtains rising from bottom */
  for (int layer = 0; layer < 5; layer++) {
    float lf = (float)layer;
    float hue = 4.0f + lf * 11.0f; /* deep crimson -> orange -> bright gold */
    Uint8 a = (Uint8)(72 + layer * 30);
    SDL_Color col = ss_hsv_color(hue, 0.98f, 0.92f + lf * 0.02f, a);
    int base_h = 185 - layer * 28;

    for (int x = 0; x < W; x += 8) {
      float nx = (float)x / (float)W;
      int bi = (int)(nx * 31.0f);
      float flicker = sinf(nx * (11.0f + lf * 3.0f) + t * (4.2f + lf * 1.1f))
                    + 0.6f * cosf(nx * 23.0f - t * (6.5f + lf * 1.4f));
      int fh = (int)((float)base_h * (0.45f + ss_bands[bi] * 0.95f + bass * 0.45f) + flicker * (18.0f + mid * 22.0f));
      if (fh < 14) fh = 14;
      if (fh > H - 24) fh = H - 24;
      rounded(x, H - fh, 9, fh + 8, 4, col);
    }
  }

  /* Glowing rising embers */
  for (int i = 0; i < 36; i++) {
    float fi = (float)i;
    float speed = 0.24f + (i % 6) * 0.07f + bass * 0.2f;
    float p = fmodf(t * speed + fi * 0.29f, 1.0f);
    int ex = (int)(fmodf(fi * 67.0f + sinf(t * 2.5f + fi) * 34.0f, (float)W));
    if (ex < 0) ex += W;
    int ey = H - (int)(p * (float)(H + 20));
    Uint8 ea = (Uint8)((1.0f - p) * (180.0f + high * 75.0f));
    SDL_Color ec = ss_hsv_color(28.0f + (i % 5) * 8.0f, 0.95f, 1.0f, ea);
    glow_circle(ex, ey, 3, ec, 3);
    fill_circle(ex, ey, (i % 3 == 0) ? 3 : 2, ec);
  }
}

/* 9. NEW (v2.1.0): "Prisma 3D" — real-time 3D rotating neon wireframe cube + holographic rings */
static void ss_viz_prism3d(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(6, 7, 18);
  int cx = W / 2, cy = H / 2;
  float hue0 = fmodf(t * 26.0f + 190.0f, 360.0f);

  /* Holographic orbiting tilt rings */
  for (int r = 0; r < 3; r++) {
    float tilt = 0.35f + (float)r * 0.25f;
    float rad = 115.0f + (float)r * 36.0f + bass * 34.0f;
    float rot = t * (0.65f + r * 0.3f) * (r % 2 == 0 ? 1.0f : -1.0f);
    SDL_Color rc = ss_hsv_color(hue0 + r * 75.0f, 0.92f, 1.0f, 130);
    int px = 0, py = 0;
    for (int s = 0; s <= 36; s++) {
      float a = (float)s / 36.0f * 6.283185f;
      float x3 = cosf(a) * rad;
      float y3 = sinf(a) * rad * tilt;
      int sx = cx + (int)(x3 * cosf(rot) - y3 * sinf(rot));
      int sy = cy + (int)(x3 * sinf(rot) + y3 * cosf(rot));
      if (s > 0) ss_draw_thick_line(px, py, sx, sy, rc);
      px = sx;
      py = sy;
    }
  }

  /* 3D projected rotating cube + inner octahedron */
  static const float verts[8][3] = {
      {-1,-1,-1}, {1,-1,-1}, {1,1,-1}, {-1,1,-1},
      {-1,-1, 1}, {1,-1, 1}, {1,1, 1}, {-1,1, 1}
  };
  static const int edges[12][2] = {
      {0,1},{1,2},{2,3},{3,0},
      {4,5},{5,6},{6,7},{7,4},
      {0,4},{1,5},{2,6},{3,7}
  };
  float ax = t * 0.95f, ay = t * 1.25f, az = t * 0.55f;
  float ca = cosf(ax), sa = sinf(ax);
  float cb = cosf(ay), sb = sinf(ay);
  float cc = cosf(az), sc = sinf(az);
  float scale = 78.0f + bass * 44.0f + mid * 18.0f;
  int px[8], py[8];

  for (int i = 0; i < 8; i++) {
    float x = verts[i][0], y = verts[i][1], z = verts[i][2];
    /* Rotate X */
    float y1 = y * ca - z * sa, z1 = y * sa + z * ca;
    /* Rotate Y */
    float x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb;
    /* Rotate Z */
    float x3 = x2 * cc - y1 * sc, y3 = x2 * sc + y1 * cc;
    float persp = 3.6f / (3.6f - z2 * 0.85f);
    px[i] = cx + (int)(x3 * scale * persp);
    py[i] = cy + (int)(y3 * scale * persp);
  }

  for (int e = 0; e < 12; e++) {
    SDL_Color ec = ss_hsv_color(hue0 + (float)e * 28.0f, 0.95f, 1.0f, 240);
    ss_draw_thick_line(px[edges[e][0]], py[edges[e][0]], px[edges[e][1]], py[edges[e][1]], ec);
  }
  for (int i = 0; i < 8; i++) {
    SDL_Color vc = ss_hsv_color(hue0 + i * 42.0f, 0.7f, 1.0f, 255);
    glow_circle(px[i], py[i], 4, vc, 4);
    fill_circle(px[i], py[i], 4, (SDL_Color){255, 255, 255, 245});
  }

  /* Pulsing inner energy diamond */
  int ir = 18 + (int)(high * 28.0f + bass * 22.0f);
  glow_circle(cx, cy, ir, ss_hsv_color(hue0 + 180.0f, 0.95f, 1.0f, 155), 8);
}

/* 10. NEW (v2.1.0): "Galáxia Espiral" — 4-arm cosmic logarithmic spiral with star clusters */
static void ss_viz_galaxy(float t, float bass, float mid, float high) {
  ss_clear_deep_bg(4, 4, 14);
  int cx = W / 2, cy = H / 2;
  float hue0 = fmodf(t * 16.0f + 220.0f, 360.0f);

  glow_circle(cx, cy, 42 + (int)(bass * 48.0f), ss_hsv_color(hue0 + 35.0f, 0.75f, 1.0f, 135), 18);

  const int arms = 4;
  const int stars_per_arm = 28;
  for (int arm = 0; arm < arms; arm++) {
    float arm_off = (float)arm * (6.283185f / (float)arms);
    for (int s = 1; s <= stars_per_arm; s++) {
      float u = (float)s / (float)stars_per_arm;
      int bi = (s + arm * 5) % 32;
      float spiral_ang = arm_off + u * 4.4f - t * (0.65f + (1.0f - u) * 0.55f);
      float rad = u * (245.0f + bass * 42.0f) + ss_bands[bi] * 24.0f;
      float scatter = sinf((float)(s * 17 + arm * 31)) * (10.0f + u * 22.0f);
      int sx = cx + (int)(cosf(spiral_ang) * (rad + scatter) * 1.18f);
      int sy = cy + (int)(sinf(spiral_ang) * (rad + scatter) * 0.78f);
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
      Uint8 a = (Uint8)fminf(255.0f, (1.15f - u * 0.65f) * (175.0f + high * 80.0f));
      SDL_Color sc = ss_hsv_color(hue0 + u * 130.0f + arm * 24.0f, 0.85f, 1.0f, a);
      int sr = (s % 5 == 0) ? 4 : (u < 0.4f ? 3 : 2);
      if (sr >= 3) glow_circle(sx, sy, sr, sc, 3);
      fill_circle(sx, sy, sr, sc);
    }
  }

  /* Bright galactic core */
  fill_circle(cx, cy, 12 + (int)(mid * 10.0f + bass * 10.0f), (SDL_Color){255, 250, 240, 235});
}

static void ss_format_date_pt(char *out, size_t cap) {
  static const char *wdays[] = {
      "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"
  };
  static const char *months[] = {
      "jan", "fev", "mar", "abr", "mai", "jun",
      "jul", "ago", "set", "out", "nov", "dez"
  };
  time_t now = time(NULL);
  struct tm tmv;
  if (!localtime_r(&now, &tmv)) {
    snprintf(out, cap, "K PLAYER");
    return;
  }
  int wd = (tmv.tm_wday >= 0 && tmv.tm_wday < 7) ? tmv.tm_wday : 0;
  int mo = (tmv.tm_mon >= 0 && tmv.tm_mon < 12) ? tmv.tm_mon : 0;
  snprintf(out, cap, "%s, %02d de %s", wdays[wd], tmv.tm_mday, months[mo]);
}

static void ss_draw_clock_and_weather(float t) {
  /* Gentle anti-burn-in drift */
  int dx = (int)(sinf(t * 0.17f) * 10.0f);
  int dy = (int)(cosf(t * 0.13f) * 5.0f);

  time_t now = time(NULL);
  struct tm tmv;
  char hm[16] = "00:00";
  char sec[8] = ":00";
  if (localtime_r(&now, &tmv)) {
    snprintf(hm, sizeof(hm), "%02d:%02d", tmv.tm_hour, tmv.tm_min);
    snprintf(sec, sizeof(sec), ":%02d", tmv.tm_sec);
  }
  char date_str[64];
  ss_format_date_pt(date_str, sizeof(date_str));

  WeatherState w;
  pthread_mutex_lock(&weather_mutex);
  w = weather_data;
  pthread_mutex_unlock(&weather_mutex);

  int bx = 24 + dx, by = 18 + dy, bw = 592, bh = 96;
  glow_rect(bx, by, bw, bh, 16, alpha(accent, 115), 3);
  rounded_gradient(bx, by, bw, bh, 16,
                   alpha(mix(elevated, accent, 0.10f), 198),
                   alpha(mix(bg, panel, 0.72f), 184));
  rounded_outline(bx, by, bw, bh, 16, alpha(mix(accent, textc, 0.25f), 115));

  label(hm, bx + 20, by + 10, 44, textc, 165);
  label(sec, bx + 156, by + 30, 18, accent, 52);
  label(date_str, bx + 22, by + 64, 15, muted, 240);

  rect(bx + 292, by + 16, 1, bh - 32, alpha(textc, 35));

  if (w.valid) {
    char tline[32];
    snprintf(tline, sizeof(tline), "%.12s°C", w.temp[0] ? w.temp : "--");
    label(tline, bx + 312, by + 12, 34, accent, 140);
    label(w.desc[0] ? w.desc : "Clima ao vivo", bx + 444, by + 18, 15, textc, 138);
    char meta[128];
    snprintf(meta, sizeof(meta), "%.28s • Min %.6s° / Máx %.6s°",
             w.city.name[0] ? w.city.name : "Local", w.tmin, w.tmax);
    label(meta, bx + 312, by + 62, 13, muted, 268);
  } else {
    label("Clima Open-Meteo", bx + 312, by + 20, 17, textc, 260);
    label("Configure cidade em Clima (botão X)", bx + 312, by + 48, 13, muted, 264);
  }
}

static void ss_draw_lyrics_overlay(void) {
  if (!playing_audio) return;
  if (lyric_count <= 0 && plain_count <= 0) return;

  int ly = ss_show_clock ? 156 : 108;
  int lh = ss_show_clock ? 210 : 258;
  glow_rect(28, ly, W - 56, lh, 18, alpha(accent, 65), 2);
  rounded_gradient(28, ly, W - 56, lh, 18,
                   alpha(mix(panel, accent, 0.07f), 174),
                   alpha(bg, 158));
  rounded_outline(28, ly, W - 56, lh, 18, alpha(textc, 48));

  if (lyric_count > 0) {
    int cur = current_lyric();
    int mid_y = ly + lh / 2 - 22;
    if (cur < 0) {
      centered(tr("Aguardando a letra..."), 44, mid_y + 4, W - 88, 18, muted);
    } else {
      if (cur > 0) {
        centered(lyrics[cur - 1].text, 44, mid_y - 46, W - 88, 15, alpha(muted, 210));
      }
      rounded(40, mid_y - 8, W - 80, 44, 12, alpha(accent, 42));
      centered(lyrics[cur].text, 44, mid_y + 2, W - 88, 21, textc);
      if (cur + 1 < lyric_count) {
        centered(lyrics[cur + 1].text, 44, mid_y + 52, W - 88, 15, alpha(muted, 210));
      }
    }
  } else if (plain_count > 0) {
    int start = plain_scroll;
    if (start < 0) start = 0;
    for (int row = 0; row < 4 && start + row < plain_count; row++) {
      centered(plain_lyrics[start + row], 44, ly + 28 + row * 42, W - 88,
               row == 1 ? 19 : 14, row == 1 ? textc : muted);
    }
  }
}

static void draw_screensaver(void) {
  uint32_t ticks = SDL_GetTicks();
  float t = (float)ticks / 1000.0f;
  float bass = 0.0f, mid = 0.0f, high = 0.0f;
  ss_update_spectrum(t, &bass, &mid, &high);

  int active_viz = ss_viz_style;
  if (active_viz <= 0 || active_viz >= SS_VIZ_COUNT) {
    /* Auto cycle every 18 seconds through all 10 visualizers (1..10) */
    active_viz = 1 + (int)((ticks / 18000u) % 10u);
  }

  switch (active_viz) {
  case 1: ss_viz_bars_waves(t, bass, mid); break;
  case 2: ss_viz_alchemy(t, bass, mid, high); break;
  case 3: ss_viz_battery(t, bass, mid, high); break;
  case 4: ss_viz_plenitude(t, bass, mid); break;
  case 5: ss_viz_ambience(t, bass, mid, high); break;
  case 6: ss_viz_tunnel(t, bass, mid, high); break;
  case 7: ss_viz_matrix(t, bass, mid, high); break;
  case 8: ss_viz_fire(t, bass, mid, high); break;
  case 9: ss_viz_prism3d(t, bass, mid, high); break;
  default: ss_viz_galaxy(t, bass, mid, high); break;
  }

  if (ss_show_clock)
    ss_draw_clock_and_weather(t);

  if (ss_show_lyrics)
    ss_draw_lyrics_overlay();

  /* Bottom Now-Playing & Visualizer Badge Strip */
  int ny = 408;
  glow_rect(24, ny, 592, 54, 14, alpha(accent, 105), 3);
  rounded_gradient(24, ny, 592, 54, 14,
                   alpha(mix(elevated, accent, 0.10f), 208),
                   alpha(mix(bg, panel, 0.76f), 194));
  rounded_outline(24, ny, 592, 54, 14, alpha(mix(accent, textc, 0.25f), 108));

  for (int i = 0; i < 4; i++) {
    int bh = 6 + (int)(ss_bands[i * 5] * 22.0f);
    rounded(40 + i * 7, ny + 38 - bh, 4, bh, 2, accent);
  }

  const char *main_t = title[0] ? title : (media_name[0] ? media_name : "Protetor de tela K PLAYER");
  const char *sub_t = playing_radio
                          ? "Rádio Online • Ao vivo"
                          : (artist[0] ? artist : (active ? "Tocando música" : "Modo visualização WMP"));
  label(main_t, 76, ny + 9, 16, textc, 360);
  label(sub_t, 76, ny + 30, 12, muted, 360);

  char vtag[56];
  snprintf(vtag, sizeof(vtag), "%d/10 • %.24s", active_viz, ss_viz_labels[active_viz]);
  rounded_gradient(440, ny + 14, 164, 26, 10, alpha(accent, 52), alpha(accent, 22));
  rounded_outline(440, ny + 14, 164, 26, 10, alpha(accent, 118));
  centered(vtag, 440, ny + 20, 164, 11, accent);

  if (ticks < ss_hint_until) {
    rounded_gradient(50, 376, 540, 24, 10, alpha(elevated, 220), alpha(panel, 206));
    rounded_outline(50, 376, 540, 24, 10, alpha(textc, 42));
    centered("L1/R1 Trocar efeito (10+)  •  X Letras  •  Y Relógio/Clima  •  Qualquer botão: Sair",
             50, 382, 540, 11, muted);
  }
}

static void screensaver_key(SDL_Keycode k) {
  ss_touch_activity();
  if (k == SDLK_q) {
    ss_viz_style = (ss_viz_style + SS_VIZ_COUNT - 1) % SS_VIZ_COUNT;
    ss_hint_until = SDL_GetTicks() + 3500;
    save_settings();
    return;
  }
  if (k == SDLK_e) {
    ss_viz_style = (ss_viz_style + 1) % SS_VIZ_COUNT;
    ss_hint_until = SDL_GetTicks() + 3500;
    save_settings();
    return;
  }
  if (k == SDLK_x || k == SDLK_SPACE) {
    ss_show_lyrics = !ss_show_lyrics;
    ss_hint_until = SDL_GetTicks() + 3500;
    save_settings();
    return;
  }
  if (k == SDLK_y || k == SDLK_m) {
    ss_show_clock = !ss_show_clock;
    ss_hint_until = SDL_GetTicks() + 3500;
    save_settings();
    return;
  }
  if (k == SDLK_TAB) {
    toggle_pause();
    return;
  }
  mode = ss_return_mode;
  menu_dirty = true;
}
