/* Native R36S Screensaver (Protetor de Tela) — Mode 13.
 * Activates automatically after configurable idle timeout (30s / 60s / 2m / 5m)
 * while playing Music or Radio, or on-demand from Options -> Protetor de tela.
 *
 * Features:
 * - 5 Windows Media Player-inspired audio-reactive visualizers + Auto cycle:
 *   1) Barras e Ondas  2) Alquimia  3) Bateria / Pulso  4) Plenitude  5) Ambience / Cosmos
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
    "Auto (Alternar)", "Barras e Ondas", "Alquimia",
    "Bateria / Pulso", "Plenitude", "Ambience / Cosmos"
};
#define SS_VIZ_COUNT 6

static int ss_timeout_idx = 1;    /* Default: 30 segundos (v2.0.7) */
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
  /* Subtle tempo variation derived from track/station name hash */
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
    float norm = (float)i / 31.0f;
    float w1 = 0.5f + 0.5f * sinf(t * (2.6f + norm * 4.4f) + i * 0.55f);
    float w2 = 0.5f + 0.5f * cosf(t * (4.1f - norm * 1.9f) + i * 1.15f + (float)(seed % 17u));
    float w3 = 0.5f + 0.5f * sinf(t * 7.3f + i * 0.37f);
    float target = (0.16f + 0.36f * w1 * w2 + 0.18f * w3);
    if (i < 8) target += kick * (0.58f - norm * 0.8f);
    else if (i < 20) target += snare * 0.34f + kick * 0.16f;
    else target += (0.28f * w3 * w1);

    target *= energy_scale;
    if (target > 1.0f) target = 1.0f;
    if (target < 0.03f) target = 0.03f;

    ss_bands[i] = ss_bands[i] * 0.58f + target * 0.42f;
    if (ss_bands[i] > ss_peaks[i]) ss_peaks[i] = ss_bands[i];
    else ss_peaks[i] = fmaxf(ss_bands[i], ss_peaks[i] - 0.018f);

    if (i < 8) bass_sum += ss_bands[i];
    else if (i < 20) mid_sum += ss_bands[i];
    else high_sum += ss_bands[i];
  }
  *out_bass = bass_sum / 8.0f;
  *out_mid = mid_sum / 12.0f;
  *out_high = high_sum / 12.0f;
}

static void ss_draw_thick_line(int x1, int y1, int x2, int y2, SDL_Color c) {
  color(c);
  SDL_RenderDrawLine(renderer, x1, y1, x2, y2);
  SDL_RenderDrawLine(renderer, x1, y1 + 1, x2, y2 + 1);
}

/* Style 1: WMP Bars & Waves (Ocean Mist / Neon Spectrum + Mirrored Floor + Oscilloscope) */
static void ss_viz_bars_waves(float t, float bass, float mid) {
  /* Deep midnight gradient */
  for (int y = 0; y < H; y += 8) {
    float p = (float)y / (float)H;
    SDL_Color c = {
        (Uint8)(6 + p * 12),
        (Uint8)(10 + (1.0f - p) * 20 + bass * 14),
        (Uint8)(22 + (1.0f - p) * 34 + mid * 18),
        255
    };
    rect(0, y, W, 8, c);
  }

  /* Subtle background ambient glow */
  glow_circle(W / 2, 270, 90 + (int)(bass * 45), ss_hsv_color(190.0f + sinf(t * 0.4f) * 40.0f, 0.85f, 0.9f, 52), 10);

  /* Dual WMP oscilloscope waves across center */
  int prev_x = 0, prev_y1 = 225, prev_y2 = 225;
  for (int x = 0; x <= W; x += 8) {
    float nx = (float)x / (float)W;
    int bi = (int)(nx * 31.0f);
    float env = sinf(nx * 3.14159f);
    float amp = (28.0f + ss_bands[bi] * 78.0f) * env;
    int y1 = 220 + (int)(sinf(nx * 14.0f - t * 5.2f) * amp);
    int y2 = 220 + (int)(cosf(nx * 10.0f + t * 4.1f) * amp * 0.72f);
    if (x > 0) {
      ss_draw_thick_line(prev_x, prev_y1, x, y1, ss_hsv_color(185.0f + nx * 110.0f + t * 18.0f, 0.9f, 1.0f, 185));
      ss_draw_thick_line(prev_x, prev_y2, x, y2, ss_hsv_color(280.0f + nx * 80.0f - t * 14.0f, 0.85f, 0.95f, 125));
    }
    prev_x = x;
    prev_y1 = y1;
    prev_y2 = y2;
  }

  /* 32 Glossy Spectrum Bars + Mirrored Floor Reflection */
  int base_y = 374;
  int bar_w = 14, gap = 4;
  int start_x = (W - (32 * (bar_w + gap) - gap)) / 2;
  for (int i = 0; i < 32; i++) {
    int bx = start_x + i * (bar_w + gap);
    int bh = 8 + (int)(ss_bands[i] * 172.0f);
    float hue = 155.0f + (float)i * 5.2f + sinf(t * 0.5f) * 25.0f;
    SDL_Color bar_c = ss_hsv_color(hue, 0.88f, 0.95f, 225);
    SDL_Color ref_c = ss_hsv_color(hue, 0.85f, 0.70f, 52);

    /* Main bar + inner highlight */
    rounded(bx, base_y - bh, bar_w, bh, 3, bar_c);
    rect(bx + 2, base_y - bh + 2, 3, bh > 6 ? bh - 4 : 2, alpha(textc, 65));

    /* Falling peak cap */
    int py = base_y - (8 + (int)(ss_peaks[i] * 172.0f)) - 5;
    rounded(bx, py, bar_w, 3, 1, alpha(textc, 230));

    /* Mirror reflection */
    int rh = bh / 3;
    if (rh > 58) rh = 58;
    rect(bx, base_y + 3, bar_w, rh, ref_c);
  }
  rect(24, base_y + 1, W - 48, 1, alpha(textc, 45));
}

/* Style 2: WMP Alchemy (Kaleidoscopic Swirling Energy Ribbons & Rotating Orbs) */
static void ss_viz_alchemy(float t, float bass, float mid, float high) {
  rect(0, 0, W, H, (SDL_Color){5, 4, 14, 255});
  int cx = W / 2, cy = H / 2 - 8;

  /* Layered radial aurora core */
  float base_hue = fmodf(t * 28.0f, 360.0f);
  glow_circle(cx, cy, 46 + (int)(bass * 62), ss_hsv_color(base_hue, 0.9f, 0.95f, 70), 12);
  glow_circle(cx, cy, 24 + (int)(mid * 36), ss_hsv_color(base_hue + 140.0f, 0.85f, 1.0f, 95), 8);

  /* 6 Kaleidoscopic swirling arms */
  for (int arm = 0; arm < 6; arm++) {
    float arm_ang = (float)arm * (6.283185f / 6.0f) + t * 0.65f;
    float arm_hue = base_hue + (float)arm * 52.0f;
    int px = cx, py = cy;
    for (int s = 1; s <= 18; s++) {
      float fs = (float)s / 18.0f;
      int bi = (s * 3 + arm * 5) % 32;
      float r = fs * (195.0f + bass * 68.0f) + sinf(t * 3.2f + fs * 7.0f) * (14.0f + ss_bands[bi] * 24.0f);
      float twist = arm_ang + fs * (2.6f + sinf(t * 0.9f) * 1.1f);
      int nx = cx + (int)(cosf(twist) * r * 1.18f);
      int ny = cy + (int)(sinf(twist) * r * 0.88f);
      SDL_Color lc = ss_hsv_color(arm_hue + fs * 85.0f, 0.92f, 0.98f, (Uint8)(210 - s * 7));
      ss_draw_thick_line(px, py, nx, ny, lc);
      if (s % 4 == 0) {
        int rad = 3 + (int)(ss_bands[bi] * 8.0f);
        fill_circle(nx, ny, rad, ss_hsv_color(arm_hue + 40.0f, 0.75f, 1.0f, 195));
      }
      px = nx;
      py = ny;
    }
  }

  /* Outer harmonic polygon ring */
  int prev_x = 0, prev_y = 0;
  for (int i = 0; i <= 32; i++) {
    int bi = i % 32;
    float ang = (float)i * (6.283185f / 32.0f) - t * 0.45f;
    float rad = 115.0f + ss_bands[bi] * 92.0f + high * 22.0f;
    int x = cx + (int)(cosf(ang) * rad * 1.2f);
    int y = cy + (int)(sinf(ang) * rad * 0.85f);
    if (i > 0) {
      ss_draw_thick_line(prev_x, prev_y, x, y, ss_hsv_color(base_hue + 180.0f + bi * 5.0f, 0.9f, 1.0f, 165));
    }
    prev_x = x;
    prev_y = y;
  }
}

/* Style 3: WMP Battery / Pulse (Radiating Star Spokes, Beat Shockwaves & Orbiting Sparks) */
static void ss_viz_battery(float t, float bass, float mid, float high) {
  rect(0, 0, W, H, (SDL_Color){4, 8, 12, 255});
  int cx = W / 2, cy = H / 2 - 4;
  float hue0 = fmodf(t * 22.0f + 120.0f, 360.0f);

  /* Expanding beat shockwave rings */
  for (int ring = 0; ring < 4; ring++) {
    float phase = fmodf(t * 0.75f + (float)ring * 0.25f, 1.0f);
    float rad = 28.0f + phase * (240.0f + bass * 45.0f);
    Uint8 a = (Uint8)((1.0f - phase) * 165.0f);
    SDL_Color rc = ss_hsv_color(hue0 + ring * 45.0f, 0.9f, 1.0f, a);
    color(rc);
    int px = 0, py = 0;
    for (int k = 0; k <= 36; k++) {
      float ang = (float)k * (6.283185f / 36.0f);
      int x = cx + (int)(cosf(ang) * rad * 1.15f);
      int y = cy + (int)(sinf(ang) * rad * 0.85f);
      if (k > 0) SDL_RenderDrawLine(renderer, px, py, x, y);
      px = x;
      py = y;
    }
  }

  /* 32 Audio-reactive radiating spokes */
  for (int i = 0; i < 32; i++) {
    float ang = (float)i * (6.283185f / 32.0f) + sinf(t * 0.4f) * 0.6f;
    float r_in = 34.0f + bass * 18.0f;
    float r_out = r_in + 36.0f + ss_bands[i] * 175.0f;
    int x1 = cx + (int)(cosf(ang) * r_in);
    int y1 = cy + (int)(sinf(ang) * r_in * 0.88f);
    int x2 = cx + (int)(cosf(ang) * r_out * 1.15f);
    int y2 = cy + (int)(sinf(ang) * r_out * 0.88f);
    SDL_Color sc = ss_hsv_color(hue0 + i * 9.0f, 0.92f, 1.0f, 215);
    ss_draw_thick_line(x1, y1, x2, y2, sc);
    fill_circle(x2, y2, 3 + (int)(ss_bands[i] * 4.0f), alpha(textc, 220));
  }

  /* Pulsing center core */
  glow_circle(cx, cy, 26 + (int)(bass * 26 + mid * 12), ss_hsv_color(hue0 + 180.0f, 0.85f, 1.0f, 120), 8);
  fill_circle(cx, cy, 18 + (int)(bass * 16), ss_hsv_color(hue0, 0.7f, 1.0f, 220));

  /* Orbiting rhythmic sparks */
  for (int p = 0; p < 14; p++) {
    float ang = t * (1.1f + (float)(p % 4) * 0.35f) + (float)p * 0.45f;
    float rr = 120.0f + (float)(p % 3) * 55.0f + high * 35.0f;
    int sx = cx + (int)(cosf(ang) * rr * 1.25f);
    int sy = cy + (int)(sinf(ang * 1.3f) * rr * 0.75f);
    fill_circle(sx, sy, 2 + (p % 3), ss_hsv_color(hue0 + p * 24.0f, 0.85f, 1.0f, 195));
  }
}

/* Style 4: WMP Plenitude (Flowing Layered Aurora Ribbons & Lissajous Curtains) */
static void ss_viz_plenitude(float t, float bass, float mid) {
  for (int y = 0; y < H; y += 10) {
    float p = (float)y / (float)H;
    rect(0, y, W, 10, (SDL_Color){
        (Uint8)(6 + p * 16),
        (Uint8)(6 + sinf(p * 3.14f) * 14),
        (Uint8)(18 + (1.0f - p) * 28),
        255
    });
  }

  float base_hue = fmodf(t * 20.0f + 210.0f, 360.0f);
  for (int ribbon = 0; ribbon < 6; ribbon++) {
    float rf = (float)ribbon / 5.0f;
    float y_mid = 125.0f + rf * 235.0f;
    float hue = base_hue + (float)ribbon * 38.0f;
    int px = 0, py = (int)y_mid;
    for (int x = 0; x <= W; x += 10) {
      float nx = (float)x / (float)W;
      int bi = (int)(nx * 31.0f);
      float wave = sinf(nx * (6.0f + rf * 5.0f) + t * (1.8f + rf * 0.9f) + ribbon * 0.9f)
                       * (26.0f + ss_bands[bi] * 62.0f + bass * 22.0f) +
                   cosf(nx * 11.0f - t * 2.4f + ribbon) * (10.0f + mid * 24.0f);
      int y = (int)(y_mid + wave);
      if (x > 0) {
        SDL_Color c_main = ss_hsv_color(hue + nx * 70.0f, 0.88f, 0.98f, 200);
        SDL_Color c_glow = ss_hsv_color(hue + nx * 70.0f, 0.80f, 0.95f, 60);
        ss_draw_thick_line(px, py, x, y, c_main);
        color(c_glow);
        SDL_RenderDrawLine(renderer, px, py - 5, x, y - 5);
        SDL_RenderDrawLine(renderer, px, py + 6, x, y + 6);
      }
      px = x;
      py = y;
    }
  }
}

/* Style 5: WMP Ambience / Cosmos (Pulsing Nebula Blooms & Starlight Field) */
static void ss_viz_ambience(float t, float bass, float mid, float high) {
  rect(0, 0, W, H, (SDL_Color){4, 5, 13, 255});
  float hue0 = fmodf(t * 16.0f + 260.0f, 360.0f);

  /* Soft pulsing nebula clouds */
  for (int i = 0; i < 5; i++) {
    float a = t * (0.35f + i * 0.08f) + i * 1.25f;
    int cx = W / 2 + (int)(cosf(a) * (110.0f + i * 32.0f));
    int cy = H / 2 + (int)(sinf(a * 0.8f) * (72.0f + i * 20.0f));
    int rad = 52 + (int)(ss_bands[(i * 6) % 32] * 58.0f + bass * 28.0f);
    glow_circle(cx, cy, rad, ss_hsv_color(hue0 + i * 48.0f, 0.88f, 0.92f, 52), 14);
  }

  /* Drifting cosmic stars reacting to treble */
  for (int s = 0; s < 42; s++) {
    float speed = 0.08f + (float)(s % 5) * 0.045f;
    float fx = fmodf((float)((s * 97) % 640) + t * speed * 140.0f, (float)W);
    float fy = (float)((s * 61 + (s % 7) * 23) % H) + sinf(t * 1.4f + s) * 8.0f;
    int r = (s % 4 == 0) ? (2 + (int)(high * 3.0f)) : 1;
    Uint8 a = (Uint8)(115 + (int)(sinf(t * 3.5f + s * 1.7f) * 65.0f + high * 65.0f));
    fill_circle((int)fx, (int)fy, r, ss_hsv_color(hue0 + s * 9.0f, 0.45f, 1.0f, a));
  }

  /* Harmonic horizon wave */
  int px = 0, py = 320;
  for (int x = 0; x <= W; x += 8) {
    float nx = (float)x / (float)W;
    int bi = (int)(nx * 31.0f);
    int y = 322 + (int)(sinf(nx * 12.0f + t * 2.8f) * (18.0f + ss_bands[bi] * 54.0f + mid * 20.0f));
    if (x > 0)
      ss_draw_thick_line(px, py, x, y, ss_hsv_color(hue0 + 90.0f + nx * 120.0f, 0.85f, 1.0f, 175));
    px = x;
    py = y;
  }
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

  /* Snapshot Open-Meteo weather safely */
  WeatherState w;
  pthread_mutex_lock(&weather_mutex);
  w = weather_data;
  pthread_mutex_unlock(&weather_mutex);

  /* Translucent glass top card */
  int bx = 24 + dx, by = 18 + dy, bw = 592, bh = 96;
  rounded(bx, by, bw, bh, 16, (SDL_Color){8, 12, 22, 165});
  glow_rect(bx, by, bw, bh, 16, alpha(accent, 90), 2);

  /* Left: Large Clock + Date */
  label(hm, bx + 20, by + 10, 44, textc, 165);
  label(sec, bx + 156, by + 30, 18, accent, 52);
  label(date_str, bx + 22, by + 64, 15, muted, 240);

  /* Vertical divider */
  rect(bx + 292, by + 16, 1, bh - 32, alpha(textc, 35));

  /* Right: Live Open-Meteo Weather */
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
  rounded(28, ly, W - 56, lh, 18, (SDL_Color){6, 9, 18, 148});
  glow_rect(28, ly, W - 56, lh, 18, alpha(textc, 38), 1);

  if (lyric_count > 0) {
    int cur = current_lyric();
    int mid_y = ly + lh / 2 - 22;
    if (cur < 0) {
      centered(tr("Aguardando a letra..."), 44, mid_y + 4, W - 88, 18, muted);
    } else {
      if (cur > 0) {
        centered(lyrics[cur - 1].text, 44, mid_y - 46, W - 88, 15, alpha(muted, 210));
      }
      /* Active lyric line: bold, large, accented glow */
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
  if (active_viz == 0) {
    /* Auto cycle every 18 seconds through WMP styles 1..5 */
    active_viz = 1 + (int)((ticks / 18000u) % 5u);
  }

  switch (active_viz) {
  case 1: ss_viz_bars_waves(t, bass, mid); break;
  case 2: ss_viz_alchemy(t, bass, mid, high); break;
  case 3: ss_viz_battery(t, bass, mid, high); break;
  case 4: ss_viz_plenitude(t, bass, mid); break;
  default: ss_viz_ambience(t, bass, mid, high); break;
  }

  if (ss_show_clock)
    ss_draw_clock_and_weather(t);

  if (ss_show_lyrics)
    ss_draw_lyrics_overlay();

  /* Bottom Now-Playing & Visualizer Badge Strip */
  int ny = 408;
  rounded(24, ny, 592, 54, 14, (SDL_Color){8, 12, 22, 185});
  glow_rect(24, ny, 592, 54, 14, alpha(accent, 80), 2);

  /* Mini live equalizer bars inside Now-Playing capsule */
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

  /* Right: Current WMP visualizer tag */
  char vtag[48];
  snprintf(vtag, sizeof(vtag), "WMP • %.24s", ss_viz_labels[active_viz]);
  rounded(444, ny + 14, 160, 26, 10, alpha(accent, 38));
  centered(vtag, 444, ny + 20, 160, 11, accent);

  if (ticks < ss_hint_until) {
    rounded(60, 376, 520, 24, 10, (SDL_Color){10, 14, 24, 210});
    centered("L1/R1 Visualizador  •  X Letras  •  Y Relógio/Clima  •  Qualquer botão: Sair",
             60, 382, 520, 11, muted);
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
  if (k == SDLK_x) {
    ss_show_lyrics = !ss_show_lyrics;
    ss_hint_until = SDL_GetTicks() + 3500;
    save_settings();
    return;
  }
  if (k == SDLK_y) {
    ss_show_clock = !ss_show_clock;
    ss_hint_until = SDL_GetTicks() + 3500;
    save_settings();
    return;
  }
  if (k == SDLK_TAB) {
    toggle_pause();
    return;
  }
  /* Any other button wakes immediately back to previous screen */
  mode = ss_return_mode;
  menu_dirty = true;
}
