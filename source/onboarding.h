/* First-run flow and readable in-app usage notices. */
static int terms_page = 0, terms_return = 5;
static void app_logo(int x, int y) {
  glow_rect(x, y, 76, 76, 22, accent, 8);
  rounded(x, y, 76, 76, 22, accent);
  label("K", x + 14, y + 9, 49, bg, 44);
  triangle(x + 50, y + 29, 20, bg);
}
static void draw_welcome(void) {
  backdrop();
  rounded(430, 16, 194, 30, 15, elevated);
  centered(tr("Y  Termos de uso"), 438, 23, 178, 13, muted);
  app_logo(282, 54);
  centered("K PLAYER", 20, 147, 600, 33, textc);
  centered(tr("Bem-vindo ao seu player"), 20, 192, 600, 17, muted);
  centered(tr("Escolha seu idioma"), 20, 230, 600, 18, textc);
  const char *codes[] = {"PT-BR", "EN", "ES"};
  for (int i = 0; i < 3; i++) {
    int x = 24 + i * 200;
    bool chosen = i == language;
    card(x, 264, 192, 66, 12, chosen, panel);
    label(codes[i], x + 14, 275, 12, chosen ? accent : muted, 162);
    label(language_names[i], x + 14, 297, 18, textc, 164);
  }
  glow_rect(180, 352, 280, 44, 22, accent, 6);
  rounded(180, 352, 280, 44, 22, accent);
  centered(tr("B  Iniciar K PLAYER"), 190, 364, 260, 19, bg);
  centered(tr("Sua escolha será salva neste aparelho."), 20, 412, 600, 12,
           muted);
  const FooterHint hints[] = {{"DIR", "Idioma"}, {"B", "Iniciar"}, {"Y", "Termos"}};
  footer_hints(hints, 3);
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
  if (!save_preferences(true)) {
    notify(tr("Não foi possível salvar. Verifique o cartão."));
    return;
  }
  onboarding_done = true;
  mode = 3;
  status_next = 0;
}
