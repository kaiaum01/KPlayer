/* First-run flow and readable in-app usage notices. */
static int terms_page = 0, terms_return = 5;
static int welcome_focus = 0; /* 0 = language, 1 = theme color dots */
static uint32_t welcome_start_tick = 0;
static void draw_welcome(void) {
  uint32_t now = SDL_GetTicks();
  if (!welcome_start_tick)
    welcome_start_tick = now;
  float elapsed_s = (float)(now - welcome_start_tick) / 1000.0f;
  float intro = elapsed_s / 0.45f;
  if (intro > 1.0f) intro = 1.0f;
  float ease = 1.0f - (1.0f - intro) * (1.0f - intro) * (1.0f - intro);
  int slide_y = (int)((1.0f - ease) * 14.0f);

  backdrop();

  /* Subtle top-right Terms shortcut pill */
  panel_card(456, 14, 168, 24, 12);
  centered(tr("Y  Termos de uso"), 460, 19, 160, 11, muted);

  /* Animated Boot-style centerpiece: sonar rings + halo + spinning vinyl + orbiting sparks */
  int cx = W / 2, cy = 86 + slide_y / 2;
  for (int k = 0; k < 3; k++) {
    float phase = fmodf(elapsed_s * 0.55f + (float)k * 0.333f, 1.0f);
    int r = 44 + (int)(phase * 58.0f);
    int a = (int)((1.0f - phase) * (1.0f - phase) * 115.0f * ease);
    if (a > 2)
      ring(cx, cy, r, r - 2, alpha(accent, a));
  }
  int breath = (int)(sinf(elapsed_s * 3.4f) * 3.0f);
  glow_circle(cx, cy, 41 + breath, alpha(accent, (int)(210 * ease)), 8);
  vinyl(cx, cy, 38, true);

  for (int orb = 0; orb < 3; orb++) {
    double ang = (double)elapsed_s * (1.7 + orb * 0.55) + orb * 2.094;
    int orad = 49 + orb * 8;
    int ox = cx + (int)(cos(ang) * orad);
    int oy = cy + (int)(sin(ang) * (orad * 0.62));
    int dot_r = orb == 0 ? 3 : 2;
    glow_circle(ox, oy, dot_r, alpha(accent, (int)(165 * ease)), 3);
    fill_circle(ox, oy, dot_r, mix(accent, textc, 0.35f));
  }

  /* Brand wordmark + v2.0.0 badge + live equalizer (same look as Boot screen) */
  centered("K PLAYER", 20, 144 + slide_y, 600, 28, alpha(textc, (int)(255 * ease)));
  char ver_text[36];
  snprintf(ver_text, sizeof(ver_text), "v%s  •  R36S", KPLAYER_VERSION);
  int vw = (int)measure(ver_text, 10) + 22;
  int vx = (W - vw) / 2;
  rounded(vx, 179 + slide_y, vw, 19, 9, mix(elevated, accent, 0.16f));
  centered(ver_text, vx, 183 + slide_y, vw, 10, accent);

  visualizer(210, 208 + slide_y / 2, 220, 14, 24, true);

  /* Row 0: Slim unified segmented Language capsule */
  centered(tr("Idioma"), 20, 236, 600, 11, welcome_focus == 0 ? accent : muted);
  if (welcome_focus == 0) {
    glow_rect(96, 254, 448, 38, 19, accent, 3);
    rounded(96, 254, 448, 38, 19, alpha(accent, 140));
    rounded(97, 255, 446, 36, 18, panel);
  } else {
    panel_card(96, 254, 448, 38, 19);
  }
  for (int i = 0; i < 3; i++) {
    int sx = 100 + i * 148;
    bool chosen = i == language;
    if (chosen) {
      glow_rect(sx, 258, 144, 30, 15, accent, 2);
      rounded(sx, 258, 144, 30, 15, accent);
    }
    centered(language_names[i], sx + 4, 266, 136, 13, chosen ? bg : muted);
  }

  /* Row 1: Slim Theme color selector dots ("bolinhas") */
  char theme_hdr[96];
  snprintf(theme_hdr, sizeof(theme_hdr), "%s  •  %s", tr("Tema"),
           tr(themes[theme_index].name));
  centered(theme_hdr, 20, 310, 600, 11, welcome_focus == 1 ? accent : muted);
  if (welcome_focus == 1) {
    glow_rect(146, 328, 348, 46, 23, accent, 3);
    rounded(146, 328, 348, 46, 23, alpha(accent, 140));
    rounded(147, 329, 346, 44, 22, panel);
  } else {
    panel_card(146, 328, 348, 46, 23);
  }
  for (int i = 0; i < THEME_COUNT; i++) {
    int dcx = 179 + i * 47;
    int dcy = 351;
    bool chosen = i == theme_index;
    bool is_light = (i == 2 || i == 3);
    SDL_Color outer = is_light ? themes[i].background : themes[i].highlight;
    SDL_Color inner = is_light ? themes[i].highlight : themes[i].background;
    if (chosen) {
      glow_circle(dcx, dcy, 15, alpha(accent, 210), 4);
      ring(dcx, dcy, 16, 14, textc);
    }
    fill_circle(dcx, dcy, chosen ? 12 : 11, outer);
    if (is_light || i == 1)
      fill_circle(dcx, dcy, 4, inner);
  }

  /* Minimal borderless pulsing prompt (no B button box, no bottom bar) */
  int hint_a = (int)(120.0f + 95.0f * (0.5f + 0.5f * sinf(elapsed_s * 2.6f)));
  centered(tr("Pressione B para continuar"), 20, 416, 600, 12,
           alpha(muted, hint_a));
}
static const char *terms_titles[] = {
    "Sobre o aplicativo", "Seus arquivos e preferências", "Licenças e avisos"};
static const char *terms_text[] = {
    "K PLAYER é um reprodutor independente para suas músicas e vídeos. Não "
    "inclui conteúdo de terceiros. Use mídias que você tenha direito de "
    "acessar. A compatibilidade e o desempenho dependem do arquivo, dos codecs "
    "e do aparelho.",
    "O explorador permite ler mídias nas pastas acessíveis do aparelho. "
    "Idioma, opções e favoritos são salvos na pasta do K PLAYER. Preserve seus "
    "arquivos e configurações ao atualizar. Você pode mudar o idioma e "
    "consultar estes avisos em Opções.",
    "Este software é fornecido sem garantia, nos limites das licenças "
    "aplicáveis. O K PLAYER utiliza VLC, SDL2, stb e Inter. As licenças estão "
    "na pasta licencas e o código-fonte acompanha o pacote. Estes avisos não "
    "limitam os direitos concedidos pelas licenças de software livre. Sem "
    "afiliação com a VideoLAN."};
static void draw_terms(void) {
  backdrop();
  draw_header(tr("Termos de uso"));
  label(tr("Termos de uso"), 28, 59, 28, textc, 570);
  panel_card(20, 108, 600, 300, 16);
  label(tr(terms_titles[terms_page]), 38, 126, 20, accent, 560);
  wrapped(tr(terms_text[terms_page]), 38, 169, 560, 16, 26, 8, textc);
  char count[24];
  snprintf(count, sizeof(count), "%d / 3", terms_page + 1);
  centered(count, 270, 416, 100, 12, muted);
  const FooterHint hints[] = {{"A", "Voltar"}, {"DIR", "Páginas"}};
  footer_hints(hints, 2);
}
static void open_terms(int from) {
  terms_return = from;
  terms_page = 0;
  mode = 6;
}
static void finish_onboarding(void) {
  save_settings();
  if (!save_preferences(true)) {
    notify(tr("Não foi possível salvar. Verifique o cartão."));
    return;
  }
  onboarding_done = true;
  mode = 3;
  status_next = 0;
}
