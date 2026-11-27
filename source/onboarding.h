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
  int cx = W / 2, cy = 90 + slide_y / 2;
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

  /* Brand wordmark + version badge + live equalizer (same look as Boot screen) */
  centered("K PLAYER", 20, 148 + slide_y, 600, 28, alpha(textc, (int)(255 * ease)));
  char ver_text[36];
  snprintf(ver_text, sizeof(ver_text), "v%s  •  R36S", KPLAYER_VERSION);
  int vw = (int)measure(ver_text, 10) + 22;
  int vx = (W - vw) / 2;
  rounded(vx, 183 + slide_y, vw, 19, 9, mix(elevated, accent, 0.16f));
  centered(ver_text, vx, 187 + slide_y, vw, 10, accent);

  visualizer(210, 212 + slide_y / 2, 220, 14, 24, true);

  /* Row 0: Slim unified segmented Language capsule */
  centered(tr("Idioma"), 20, 240, 600, 11, welcome_focus == 0 ? accent : muted);
  if (welcome_focus == 0) {
    glow_rect(96, 258, 448, 38, 19, accent, 3);
    rounded_gradient(97, 259, 446, 36, 18, mix(panel, textc, 0.03f), panel);
    rounded_outline(96, 258, 448, 38, 19, alpha(accent, 185));
  } else {
    panel_card(96, 258, 448, 38, 19);
  }
  for (int i = 0; i < 3; i++) {
    int sx = 100 + i * 148;
    bool chosen = i == language;
    if (chosen) {
      glow_rect(sx, 262, 144, 30, 15, accent, 2);
      rounded(sx, 262, 144, 30, 15, accent);
    }
    centered(language_names[i], sx + 4, 270, 136, 13, chosen ? bg : muted);
  }

  /* Row 1: Slim Theme color selector dots ("bolinhas" — 14 R36S themes) */
  char theme_hdr[96];
  snprintf(theme_hdr, sizeof(theme_hdr), "%s (%d/%d)  •  %s", tr("Tema"),
           theme_index + 1, THEME_COUNT, tr(themes[theme_index].name));
  centered(theme_hdr, 20, 314, 600, 11, welcome_focus == 1 ? accent : muted);
  if (welcome_focus == 1) {
    glow_rect(54, 332, 532, 46, 23, accent, 3);
    rounded_gradient(55, 333, 530, 44, 22, mix(panel, textc, 0.03f), panel);
    rounded_outline(54, 332, 532, 46, 23, alpha(accent, 185));
  } else {
    panel_card(54, 332, 532, 46, 23);
  }
  int dot_step = THEME_COUNT > 1 ? 468 / (THEME_COUNT - 1) : 44;
  int dot_start = (W - dot_step * (THEME_COUNT - 1)) / 2;
  for (int i = 0; i < THEME_COUNT; i++) {
    int dcx = dot_start + i * dot_step;
    int dcy = 355;
    bool chosen = i == theme_index;
    bool is_light = (i == 2 || i == 3 || i == 12);
    SDL_Color outer = is_light ? themes[i].background : themes[i].highlight;
    SDL_Color inner = is_light ? themes[i].highlight : themes[i].background;
    if (chosen) {
      glow_circle(dcx, dcy, 13, alpha(accent, 210), 4);
      ring(dcx, dcy, 14, 12, textc);
    }
    fill_circle(dcx, dcy, chosen ? 11 : 9, outer);
    if (is_light || i == 1)
      fill_circle(dcx, dcy, 3, inner);
  }

  /* Minimal borderless pulsing prompt (R36S physical button only — no touch) */
  int hint_a = (int)(120.0f + 95.0f * (0.5f + 0.5f * sinf(elapsed_s * 2.6f)));
  centered(tr("Pressione B para continuar"), 20, 418, 600, 12,
           alpha(muted, hint_a));
}
#define TERMS_COUNT 5
static bool stream_notice_accepted = false;
static int stream_notice_target = 8; /* 7 = radio, 8 = iptv, 18 = adult +18 unlock */
static int stream_notice_return = 3;
static const char *terms_titles[TERMS_COUNT] = {
    "Sobre o aplicativo",
    "Transparência: IPTV e Rádio",
    "Seus arquivos e preferências",
    "Licenças e avisos",
    "Seção +18 (Opcional — API Externa)"};
static const char *terms_text[TERMS_COUNT] = {
    "K PLAYER é um reprodutor independente para suas músicas, vídeos, rádios e "
    "listas IPTV. O aplicativo não hospeda, armazena nem distribui conteúdo "
    "próprio. Use mídias que você tenha direito de acessar. A compatibilidade "
    "e o desempenho dependem do arquivo, dos codecs e do aparelho.",
    "Todos os dados de IPTV e Rádio são retirados de agregadores públicos da "
    "internet ou de fontes abertas (como Radio-Browser e catálogos web "
    "públicos). Você tem total direito de colocar seu próprio link ou arquivo "
    "(.m3u/.m3u8 pelo teclado na tela ou em iptv_usuario/, e .pls/.m3u em "
    "radios_usuario/), sempre com transparência.",
    "O explorador lê apenas as pastas dedicadas (/roms(2)/bgmusic e "
    "/roms(2)/videos) e suas pastas de playlists (iptv_usuario/ e "
    "radios_usuario/). Idioma, tema, opções e favoritos são salvos localmente. "
    "Preserve seus arquivos ao atualizar.",
    "Este software é fornecido sem garantia, nos limites das licenças "
    "aplicáveis (GPL-2.0-or-later). O K PLAYER utiliza VLC/libVLC, SDL2, stb e "
    "fontes livres. As licenças estão na pasta licencas e o código-fonte "
    "acompanha o pacote. Sem afiliação com VideoLAN, PortMaster ou SofaScore.",
    "A Seção +18 vem BLOQUEADA por padrão e só pode ser desbloqueada nas "
    "Opções Gerais ou nas Opções do IPTV por maiores de 18 anos após aceitar "
    "o aviso prévio. Quando desbloqueada, exibe a aba +18 no IPTV com escolha "
    "entre PornHub (Derfirm/pornhub-api) e XVideos (xvideos_api). O K PLAYER "
    "não hospeda, modera nem se responsabiliza por conteúdo de terceiros; "
    "você pode bloquear novamente a qualquer momento."};
static void draw_terms(void) {
  backdrop();
  draw_header(tr("Termos de uso"));
  label(tr("Termos de uso"), 28, 59, 28, textc, 570);
  panel_card(20, 108, 600, 300, 16);
  label(tr(terms_titles[terms_page % TERMS_COUNT]), 38, 126, 20, accent, 560);
  wrapped(tr(terms_text[terms_page % TERMS_COUNT]), 38, 169, 560, 15, 25, 9, textc);
  char count[24];
  snprintf(count, sizeof(count), "%d / %d", (terms_page % TERMS_COUNT) + 1, TERMS_COUNT);
  centered(count, 270, 416, 100, 12, muted);
  const FooterHint hints[] = {{"A", "Voltar"}, {"DIR", "Páginas"}};
  footer_hints(hints, 2);
}
static void draw_stream_notice(void) {
  backdrop();
  if (stream_notice_target == 18) {
    draw_header("AVISO PRÉVIO +18");
    label("Desbloquear Seção +18", 24, 56, 24, textc, 460);
    const char *badge = "+18 RESTRITO";
    int bw = (int)measure(badge, 11) + 22;
    rounded(W - 24 - bw, 60, bw, 22, 11, alpha(accent, 42));
    centered(badge, W - 24 - bw, 65, bw, 11, accent);
    label("Leia atentamente antes de desbloquear no IPTV", 24, 86, 12, muted, 560);

    panel_card(20, 108, 600, 316, 16);
    label("1. Conteúdo adulto exclusivo para maiores de 18 anos", 36, 124, 14, accent, 568);
    wrapped("Ao desbloquear, você declara ter 18 anos ou mais e concorda em exibir a aba +18 junto ao serviço de IPTV. Esta seção vem bloqueada por padrão e pode ser bloqueada novamente a qualquer momento em Opções.",
            36, 148, 568, 13, 20, 4, textc);

    rect(36, 240, 568, 1, alpha(textc, 24));
    label("2. APIs externas (PornHub e XVideos) e Termos", 36, 252, 14, accent, 568);
    wrapped("Ao entrar na aba +18 você escolhe entre PornHub (Derfirm/pornhub-api) ou XVideos (xvideos_api). O K PLAYER é apenas um reprodutor, não hospeda conteúdo próprio e não tem afiliação com terceiros.",
            36, 276, 568, 13, 20, 4, textc);

    rounded(36, 372, 272, 36, 12, accent);
    centered("B  Tenho +18 e aceito", 36, 383, 272, 13, bg);
    rounded(320, 372, 164, 36, 12, elevated);
    centered("Y  Ler Termos", 320, 383, 164, 13, textc);
    rounded(494, 372, 110, 36, 12, elevated);
    centered("A  Cancelar", 494, 383, 110, 13, muted);

    const FooterHint hints[] = {
        {"B", "Tenho +18 e desbloquear"},
        {"Y", "Termos +18"},
        {"A", "Manter bloqueado"}};
    footer_hints(hints, 3);
    return;
  }

  draw_header(tr("TRANSPARÊNCIA"));
  label(tr("Aviso de Transparência"), 24, 56, 24, textc, 460);
  const char *badge = stream_notice_target == 8 ? "IPTV" : tr("Rádio Online");
  int bw = (int)measure(badge, 11) + 22;
  rounded(W - 24 - bw, 60, bw, 22, 11, mix(elevated, accent, 0.2f));
  centered(badge, W - 24 - bw, 65, bw, 11, accent);
  label(tr("Antes de acessar Rádio Online ou IPTV"), 24, 86, 12, muted, 560);

  panel_card(20, 108, 600, 316, 16);
  label(tr("1. Fontes abertas e agregadores públicos"), 36, 124, 14, accent, 568);
  wrapped(tr("Todos os dados de IPTV e Rádio são retirados de agregadores públicos da internet ou de fontes abertas (Radio-Browser e catálogos web públicos). O KPlayer é apenas um reprodutor e não hospeda conteúdo próprio."),
          36, 148, 568, 13, 20, 4, textc);

  rect(36, 240, 568, 1, alpha(textc, 24));
  label(tr("2. Você tem direito de colocar seu próprio link"), 36, 252, 14, accent, 568);
  wrapped(tr("Com total transparência, você pode inserir seus próprios links e playlists .m3u/.m3u8 (pelo teclado virtual ou em iptv_usuario/) e rádios .pls/.m3u (em radios_usuario/) a qualquer momento."),
          36, 276, 568, 13, 20, 4, textc);

  rounded(36, 372, 272, 36, 12, accent);
  centered(tr("B  Concordo e continuar"), 36, 383, 272, 13, bg);
  rounded(320, 372, 174, 36, 12, elevated);
  centered(tr("Y  Termos"), 320, 383, 174, 13, textc);
  rounded(504, 372, 100, 36, 12, elevated);
  centered(tr("A  Voltar"), 504, 383, 100, 13, muted);

  const FooterHint hints[] = {
      {"B", "Concordo e continuar"},
      {"Y", "Termos de uso"},
      {"A", "Voltar"}};
  footer_hints(hints, 3);
}
static void open_terms(int from) {
  terms_return = from;
  terms_page = 0;
  mode = 6;
}
static void open_stream_notice(int target_mode, int from_mode) {
  stream_notice_target = target_mode;
  stream_notice_return = from_mode;
  mode = 10;
}
static void finish_onboarding(void) {
  save_settings();
  if (!save_preferences(true)) {
    notify(tr("Não foi possível salvar. Verifique o cartão."));
    return;
  }
  onboarding_done = true;
  if (!tutorial_done) {
    tutorial_from_options = false;
    mode = 12;
  } else {
    mode = 3;
  }
  status_next = 0;
}
