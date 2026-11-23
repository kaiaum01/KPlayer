/* Animated boot splash screen that runs every time K PLAYER starts up.
 * Preloads the media library, storage locations, radio catalog, IPTV list and
 * Placar da Bola scores upfront so entering screens inside the player is
 * instant with no blocking loading screens. */

static uint32_t splash_start_tick = 0;
static uint32_t splash_last_frame = 0;
static float splash_visual_progress = 0.0f;

static void draw_boot_splash_frame(float target_progress, const char *step_label,
                                   int media_found, float fade_out) {
  if (!renderer || !fontdata || !bolddata || !p_SDL_GetTicks)
    return;
  uint32_t now = SDL_GetTicks();
  if (!splash_start_tick)
    splash_start_tick = now;
  float elapsed_s = (float)(now - splash_start_tick) / 1000.0f;

  /* Smoothly ease visual progress toward target_progress. */
  if (target_progress > splash_visual_progress) {
    splash_visual_progress += (target_progress - splash_visual_progress) * 0.18f;
    if (target_progress - splash_visual_progress < 0.004f)
      splash_visual_progress = target_progress;
  } else if (target_progress < splash_visual_progress) {
    splash_visual_progress = target_progress;
  }
  if (splash_visual_progress > 1.0f)
    splash_visual_progress = 1.0f;

  /* Entry slide/fade easing over the first 0.45s. */
  float intro = elapsed_s / 0.45f;
  if (intro > 1.0f) intro = 1.0f;
  float ease = 1.0f - (1.0f - intro) * (1.0f - intro) * (1.0f - intro);
  int slide_y = (int)((1.0f - ease) * 18.0f);

  backdrop();

  /* Subtle ambient concentric radar/sonar rings around the center emblem. */
  int cx = W / 2, cy = 166 + slide_y / 2;
  for (int k = 0; k < 3; k++) {
    float phase = fmodf(elapsed_s * 0.55f + (float)k * 0.333f, 1.0f);
    int r = 56 + (int)(phase * 76.0f);
    int a = (int)((1.0f - phase) * (1.0f - phase) * 115.0f * ease);
    if (a > 2)
      ring(cx, cy, r, r - 2, alpha(accent, a));
  }

  /* Breathing halo behind vinyl emblem. */
  int breath = (int)(sinf(elapsed_s * 3.4f) * 4.0f);
  glow_circle(cx, cy, 50 + breath, alpha(accent, (int)(220 * ease)), 10);

  /* Spinning vinyl disc centerpiece. */
  vinyl(cx, cy, 46, true);

  /* Orbiting glowing sparks revolving around the emblem. */
  for (int orb = 0; orb < 3; orb++) {
    double ang = (double)elapsed_s * (1.7 + orb * 0.55) + orb * 2.094;
    int orad = 60 + orb * 10;
    int ox = cx + (int)(cos(ang) * orad);
    int oy = cy + (int)(sin(ang) * (orad * 0.62));
    int dot_r = orb == 0 ? 4 : 3;
    glow_circle(ox, oy, dot_r, alpha(accent, (int)(170 * ease)), 3);
    fill_circle(ox, oy, dot_r, mix(accent, textc, 0.35f));
  }

  /* K PLAYER brand wordmark + version pill. */
  const char *brand = "K PLAYER";
  int bw = (int)measure(brand, 34);
  label(brand, (W - bw) / 2, 230 + slide_y, 34, alpha(textc, (int)(255 * ease)), 420);

  char ver_badge[48];
  snprintf(ver_badge, sizeof(ver_badge), "v%s  •  R36S", KPLAYER_VERSION);
  int vw = (int)measure(ver_badge, 11) + 22;
  int vx = (W - vw) / 2;
  rounded(vx, 270 + slide_y, vw, 20, 10, mix(elevated, accent, 0.16f));
  label(ver_badge, vx + 11, 274 + slide_y, 11, accent, vw);

  const char *tagline = tr("Central de Mídia Portátil");
  centered(tagline, 60, 298 + slide_y, W - 120, 12, muted);

  /* Animated 28-bar soundwave equalizer. */
  visualizer(176, 322 + slide_y / 2, 288, 22, 28, true);

  /* Glowing progress bar container. */
  int bar_x = 112, bar_y = 362, bar_w = 416, bar_h = 10;
  rounded(bar_x, bar_y, bar_w, bar_h, 5, track_color());
  int fill_w = (int)((float)bar_w * splash_visual_progress);
  if (fill_w < 10 && splash_visual_progress > 0.01f)
    fill_w = 10;
  if (fill_w > bar_w)
    fill_w = bar_w;
  if (fill_w > 0) {
    glow_rect(bar_x, bar_y, fill_w, bar_h, 5, accent, 4);
    rounded(bar_x, bar_y, fill_w, bar_h, 5, accent);
    /* Gliding shimmer highlight inside the filled progress bar. */
    if (fill_w > 28) {
      int span = fill_w - 22;
      int sx = bar_x + (int)(fmodf(elapsed_s * 180.0f, (float)(span + 36))) - 18;
      int s0 = sx < bar_x + 2 ? bar_x + 2 : sx;
      int s1 = sx + 22 > bar_x + fill_w - 2 ? bar_x + fill_w - 2 : sx + 22;
      if (s1 > s0 + 3)
        rounded(s0, bar_y + 2, s1 - s0, bar_h - 4, 3, alpha(textc, 130));
    }
  }

  /* Animated step label, percentage, and discovered media count. */
  int pct = (int)(splash_visual_progress * 100.0f + 0.5f);
  if (pct > 100) pct = 100;
  char status_line[140];
  int dots = ((int)(elapsed_s * 3.0f)) % 4;
  const char *dot_str = dots == 0 ? "" : dots == 1 ? "." : dots == 2 ? ".." : "...";
  if (pct >= 100)
    snprintf(status_line, sizeof(status_line), "%s", tr(step_label));
  else if (media_found > 0)
    snprintf(status_line, sizeof(status_line), "%s%s  (%d %s)", tr(step_label),
             dot_str, media_found, tr("arquivos"));
  else
    snprintf(status_line, sizeof(status_line), "%s%s", tr(step_label), dot_str);

  label(status_line, bar_x, bar_y + 18, 12, muted, bar_w - 48);

  char pct_str[16];
  snprintf(pct_str, sizeof(pct_str), "%d%%", pct);
  int pw = (int)measure(pct_str, 12);
  label(pct_str, bar_x + bar_w - pw, bar_y + 18, 12, accent, 52);

  /* Status chips at bottom showing preloaded modules. */
  const char *chips[] = {tr("Biblioteca"), tr("Rádio Online"), "IPTV", tr("Placar da Bola")};
  float thresholds[] = {0.30f, 0.58f, 0.76f, 0.90f};
  int chip_x = 112;
  for (int i = 0; i < 4; i++) {
    bool ready = splash_visual_progress >= thresholds[i];
    int cw = (int)measure(chips[i], 10) + 22;
    rounded(chip_x, 412, cw, 22, 11, ready ? mix(elevated, accent, 0.22f) : panel);
    fill_circle(chip_x + 9, 423, 3, ready ? accent : dim);
    label(chips[i], chip_x + 16, 417, 10, ready ? textc : muted, cw - 18);
    chip_x += cw + 8;
  }

  /* Smooth fade-out curtain into Home/Welcome. */
  if (fade_out > 0.001f) {
    if (fade_out > 1.0f) fade_out = 1.0f;
    color(alpha(bg, (int)(fade_out * 255.0f)));
    SDL_Rect full = {0, 0, W, H};
    SDL_RenderFillRect(renderer, &full);
  }

  SDL_RenderPresent(renderer);
}

static void boot_pump_events(void) {
  SDL_Event e;
  while (SDL_PollEvent(&e)) {
    if (e.type == SDL_QUIT)
      running = 0;
  }
}

static void boot_animate_to(float target, const char *step_label,
                            uint32_t duration_ms) {
  uint32_t t0 = SDL_GetTicks();
  while (running) {
    boot_pump_events();
    uint32_t elapsed = SDL_GetTicks() - t0;
    float frac = duration_ms ? (float)elapsed / (float)duration_ms : 1.0f;
    if (frac > 1.0f) frac = 1.0f;
    float cur = splash_visual_progress + (target - splash_visual_progress) * frac;
    if (cur < splash_visual_progress) cur = target;
    draw_boot_splash_frame(cur, step_label, media_library_found_count(), 0.0f);
    if (elapsed >= duration_ms)
      break;
    SDL_Delay(16);
  }
}

static void run_boot_splash(void) {
  splash_start_tick = SDL_GetTicks();
  splash_last_frame = 0;
  splash_visual_progress = 0.02f;

  /* Phase 1: Boot animation intro + core folders & IP location (no SDL audio open). */
  draw_boot_splash_frame(0.08f, "Iniciando K PLAYER", 0, 0.0f);
  network_location_start();
  mkdir(root, 0755);
  mkdir("radios_usuario", 0755);
  mkdir("iptv_usuario", 0755);
  snprintf(folder, sizeof(folder), "%s", root);
  refresh_locations();
  boot_animate_to(0.26f, "Iniciando K PLAYER", 340);
  if (!running) return;

  /* Phase 2: Start asynchronous lazy-loading indexer for /roms(2)/bgmusic and /roms(2)/videos
   * so startup never stalls on large SD cards and ALSA/libVLC audio stays completely unblocked. */
  media_library_start_async(false);
  scan();
  boot_animate_to(0.64f, "Carregando biblioteca em segundo plano", 360);
  if (!running) return;

  /* Phase 3: Kick off background preloads for Radio, IPTV and Placar da Bola. */
  radio_refresh();
  iptv_source = 0;
  iptv_reload();
  iptv_fetch_categories_start(false);
  football_read();
  football_refresh();
  boot_animate_to(0.92f, "Preparando rádios, IPTV e Placar da Bola", 420);
  if (!running) return;

  /* Phase 4: Ready pulse + smooth fade transition into the player. */
  boot_animate_to(1.0f, "Tudo pronto!", 300);
  if (!running) return;
  uint32_t fade_start = SDL_GetTicks();
  while (running) {
    boot_pump_events();
    uint32_t dt = SDL_GetTicks() - fade_start;
    float fade = (float)dt / 210.0f;
    draw_boot_splash_frame(1.0f, "Tudo pronto!", media_library_found_count(), fade);
    if (dt >= 210) break;
    SDL_Delay(16);
  }
}
