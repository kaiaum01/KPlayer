/* 640 x 480 native adaptation of the supplied simulator. */
static void centered(const char *s, int x, int y, int w, int size,
                     SDL_Color c) {
  int n = measure(s, size);
  label(s, x + (n < w ? (w - n) / 2 : 0), y, size, c, w);
}
static void icon(int kind, int x, int y, int size, SDL_Color c) {
  if (kp_sprite(KP_SPR_CATEGORIES, kind == 2 ? 2 : kind == 1 ? 1 : 0,
                x-2, y-2, size+4, size+4)) return;
  if (kind == 2) {
    rounded(x, y + size / 4, size, size * 3 / 5, 3, c);
    rect(x + 2, y + size / 8, size / 2, size / 4, c);
    return;
  }
  if (kind == 1) {
    rounded(x, y, size, size, 4, c);
    rect(x + 4, y + 6, size - 8, size - 12, bg);
    triangle(x + size / 3, y + size / 3, size / 3, c);
    return;
  }
  rounded(x, y, size, size, size / 2, c);
  rounded(x + 4, y + 4, size - 8, size - 8, (size - 8) / 2, panel);
  rect(x, y + size / 2, size, size / 2, panel);
  rounded(x, y + size / 2, 7, size / 2, 3, c);
  rounded(x + size - 7, y + size / 2, 7, size / 2, 3, c);
}
static void play_button(int x, int y, int size) {
  play_disc(x + size / 2, y + size / 2, size / 2, active && !paused);
}
/* Album art: the embedded cover when present, otherwise a vinyl disc. */
static void art(int x, int y, int size) {
  if (cover_texture) {
    SDL_Rect r = {x, y, size, size};
    int crop = cover_w < cover_h ? cover_w : cover_h;
    SDL_Rect source = {(cover_w - crop) / 2, (cover_h - crop) / 2, crop, crop};
    glow_rect(x, y, size, size, 10, alpha(accent, 200), 6);
    SDL_RenderCopy(renderer, cover_texture, crop > 0 ? &source : NULL, &r);
  } else
    vinyl(x + size / 2, y + size / 2, size / 2, active && !paused);
}
static bool updater_is_available(char *latest_out, size_t latest_cap);
static void draw_home_weather_widget(void);
static void draw_home_weather_large(void);
static bool weather_home_hero_copy(char *headline, size_t hcap, char *subtitle, size_t scap);
static bool home_layout_inverted;
static char menu_search[64];
static bool menu_search_kb;
static void draw_menu_search_keyboard(void);
static void draw_header(const char *section) {
  update_status();
  rect(0, 0, 640, 32, alpha(panel, 215));
  rect(0, 32, 640, 1, hairline());
  float dot_p = preview_mode ? 0.5f : (0.5f + 0.5f * sinf((float)SDL_GetTicks() * 0.004f));
  glow_circle(18, 16, 4, alpha(accent, (int)(175.0f + dot_p * 80.0f)), 4 + (int)(dot_p * 2.0f));
  fill_circle(18, 16, 4, accent);
  label("K PLAYER", 30, 8, 15, textc, 85);
  label(KPLAYER_VERSION, 113, 10, 11, dim, 34);
  label(top_location, 152, 10, 11, muted, 108);
  rounded(262, 6, 134, 20, 10, elevated);
  centered(section, 262, 9, 134, 11, muted);
  char upd_ver[32] = "";
  if (sleep_choice > 0 && sleep_end > 0) {
    uint32_t now_t = SDL_GetTicks();
    uint32_t rem_ms = (int32_t)(sleep_end - now_t) > 0 ? (sleep_end - now_t) : 0;
    unsigned rem_min = (rem_ms + 59999u) / 60000u;
    char sbuf[24];
    snprintf(sbuf, sizeof(sbuf), "ZZZ %um", rem_min);
    rounded(404, 6, 74, 20, 10, alpha(accent, 42));
    centered(sbuf, 404, 9, 74, 10, accent);
  } else if (updater_is_available(upd_ver, sizeof(upd_ver))) {
    char badge[48];
    snprintf(badge, sizeof(badge), "v%.31s • SEL", upd_ver);
    rounded(404, 6, 112, 20, 10, alpha(accent, 44));
    centered(badge, 404, 9, 112, 10, accent);
  }
  label(clock_text, 526, 9, 12, muted, 50);
  if (battery_percent >= 0) {
    char s[16];
    snprintf(s, sizeof(s), "%d%%", battery_percent);
    label(s, 583, 9, 12, accent, 50);
  }
}
/* Word wrapping also keeps translated control hints readable. Returns lines
 * used. */
static int wrapped(const char *text, int x, int y, int width, int size,
                   int step, int maxlines, SDL_Color c) {
  char copy[2048];
  snprintf(copy, sizeof(copy), "%s", text);
  char *save = NULL, *word = strtok_r(copy, " ", &save);
  char line[2048] = "";
  int row = 0;
  while (word) {
    char candidate[2048];
    size_t a = strlen(line), b = strlen(word), space = a ? 1 : 0;
    if (a + b + space >= sizeof(candidate))
      return -1;
    memcpy(candidate, line, a);
    if (space)
      candidate[a] = ' ';
    memcpy(candidate + a + space, word, b + 1);
    if (*line && measure(candidate, size) > width) {
      if (row >= maxlines)
        return -1;
      label(line, x, y + row * step, size, c, width);
      row++;
      snprintf(line, sizeof(line), "%s", word);
    } else
      snprintf(line, sizeof(line), "%s", candidate);
    word = strtok_r(NULL, " ", &save);
  }
  if (*line) {
    if (row >= maxlines)
      return -1;
    label(line, x, y + row * step, size, c, width);
    row++;
  }
  return row;
}
/* Same controller badges as the music transport, arranged in equal cells. */
static void media_ui_skip(int cx, int cy, bool next);
static void media_ui_button_circle(const char *name, int cx, int cy);
static void media_ui_button_pill(const char *name, int x, int y, int width);
typedef struct { const char *key; const char *action; } FooterHint;
static void footer_hints(const FooterHint *hints, int count) {
  /* Bottom shortcut bar removed in v2.0.4+ (shortcuts live in Options -> Atalhos).
   * Keep only floating status toasts cleanly at the bottom edge. */
  (void)hints;
  (void)count;
  uint32_t now = SDL_GetTicks();
  if (now < note_until) {
    uint32_t rem = note_until - now;
    uint32_t age = (rem <= 4000u) ? (4000u - rem) : 4000u;
    float enter = age < 220u ? ((float)age / 220.0f) : 1.0f;
    float leave = rem < 320u ? ((float)rem / 320.0f) : 1.0f;
    float ease_in = 1.0f - (1.0f - enter) * (1.0f - enter);
    float vis = ease_in * leave;
    int ty = 434 + (int)((1.0f - ease_in) * 26.0f) + (int)((1.0f - leave) * 14.0f);
    int ta = (int)(vis * 255.0f);
    if (ta > 8) {
      glow_rect(30, ty, 580, 32, 16, alpha(accent, ta), 4);
      rounded(30, ty, 580, 32, 16, alpha(elevated, ta));
      centered(status_note, 40, ty + 8, 560, 13, alpha(accent, ta));
    }
  }
}
static __attribute__((unused)) void progress(int x, int y, int w) {
  long long len = duration_ms(), t = now_ms();
  double p = len > 0 ? fmax(0, fmin(1, (double)t / len)) : 0;
  rounded(x, y, w, 4, 2, track_color());
  int fill = (int)(w * p);
  if (fill > 0) rounded(x, y, fill > 4 ? fill : 4, 4, 2, accent);
  glow_circle(x + fill, y + 2, 5, alpha(accent, 190), 3);
  fill_circle(x + fill, y + 2, 5, textc);
}
/* Small arrow used on home tiles. */
static void tile_arrow(int x, int y, SDL_Color c) {
  color(c);
  for (int k = 0; k < 2; k++) {
    SDL_RenderDrawLine(renderer, x + k, y + 9, x + 9 + k, y);
    SDL_RenderDrawLine(renderer, x + 3, y + k, x + 9, y + k);
    SDL_RenderDrawLine(renderer, x + 9 - k, y, x + 9 - k, y + 6);
  }
}
/* Compact top-right Mini Player showing only what is currently playing (v2.0.6 default). */
static void draw_home_mini_player(void) {
  int mx = 414, my = 40, mw = 210, mh = 54;
  bool on = active && !paused;
  panel_card(mx, my, mw, mh, 12);
  if (active) {
    art(mx + 8, my + 9, 36);
    rounded(mx + mw - 58, my + 6, 50, 16, 8, alpha(accent, on ? 56 : 30));
    centered(on ? "TOCANDO" : "PAUSADO", mx + mw - 58, my + 8, 50, 9, accent);
    label(title[0] ? title : media_name, mx + 52, my + 12, 13, textc, 96);
    label(artist[0] ? artist : (playing_radio ? "Rádio Online" : (playing_iptv ? "IPTV" : "Reproduzindo")),
          mx + 52, my + 31, 10, muted, 146);
  } else {
    fill_circle(mx + 26, my + 27, 15, mix(elevated, accent, 0.14f));
    triangle(mx + 22, my + 21, 12, muted);
    label("Mini Player", mx + 50, my + 10, 13, textc, 146);
    label("Nada reproduzindo", mx + 50, my + 30, 10, muted, 146);
  }
}

/* Full Now Playing bottom card (used when Home layout is inverted in Settings). */
static void draw_home_player_large(void) {
  panel_card(16, 334, 608, 132, 18);
  bool on = active && !paused;
  art(30, 356, 88);
  label(active ? (on ? tr("TOCANDO AGORA") : tr("PAUSADO")) : tr("NADA TOCANDO"),
        134, 356, 11, active ? accent : dim, 300);
  label(active ? (title[0] ? title : media_name) : tr("Pronto para dar o play"),
        134, 376, 19, textc, 330);
  label(active ? (artist[0] ? artist : tr("Reprodução local"))
               : tr("Abra Músicas ou Vídeos para começar"),
        134, 405, 13, muted, 330);
  visualizer(134, 430, 200, 14, 34, on);
  fill_circle(500, 400, 14, mix(elevated, textc, 0.05f));
  media_ui_skip(500, 400, false);
  play_button(524, 378, 44);
  fill_circle(592, 400, 14, mix(elevated, textc, 0.05f));
  media_ui_skip(592, 400, true);
}

static void draw_home(void) {
  backdrop();
  draw_header(tr("DASHBOARD"));
  /* Hero: weather-reactive greeting + fun suggestion when Weather is ON; default copy when OFF. */
  char w_head[96] = "", w_sub[160] = "";
  if (weather_home_hero_copy(w_head, sizeof(w_head), w_sub, sizeof(w_sub))) {
    label(w_head, 18, 44, 23, textc, 386);
    label(w_sub, 18, 77, 12, muted, 386);
  } else {
    const char *h1 = tr("Seu som."), *h2 = tr("Sua tela.");
    label(h1, 18, 42, 26, textc, 220);
    label(h2, 18 + (int)measure(h1, 26) + 8, 42, 26, muted, 220);
    label(tr("Músicas, vídeos, rádios e TV ao vivo num player só."), 18, 77, 12,
          muted, 386);
  }
  if (home_layout_inverted)
    draw_home_weather_widget();
  else
    draw_home_mini_player();
  const char *names[] = {tr("Músicas e Vídeos"), tr("Arquivos"), tr("Rádio Online"),
                         tr("IPTV"), tr("Notícias"), tr("Placar da Bola")},
             *desc[] = {tr("Áudio, vídeo e letras"), tr("Raiz, Editor, .sh e 7-Zip"),
                        tr("Estações do mundo"), tr("Canais ao vivo"),
                        tr("Últimas do dia"), tr("Jogos e estatísticas")},
             *tags[] = {tr("LRC & Cinema"), tr("Gerenciador"), tr("Radio Browser"),
                        tr("TV & EPG"), tr("Brasil • Hoje"), tr("Ao vivo")};
  static const int tile_sprite_col[6] = {0, 2, 3, 4, -1, 5};
  static float home_aura_x = -1.0f, home_aura_y = -1.0f;
  float target_ax = (float)(16 + (dash_focus % 3) * 208);
  float target_ay = (float)(104 + (dash_focus / 3) * 112);
  if (preview_mode || home_aura_x < 0.0f) {
    home_aura_x = target_ax;
    home_aura_y = target_ay;
  } else {
    home_aura_x += (target_ax - home_aura_x) * 0.34f;
    home_aura_y += (target_ay - home_aura_y) * 0.34f;
    if (fabsf(target_ax - home_aura_x) > 0.6f || fabsf(target_ay - home_aura_y) > 0.6f)
      ui_anim_kick(160);
  }
  float home_pulse = preview_mode ? 0.5f : (0.5f + 0.5f * sinf((float)SDL_GetTicks() * 0.0055f));
  glow_rect((int)lroundf(home_aura_x), (int)lroundf(home_aura_y) - 2, 192, 102, 16,
            alpha(accent, (int)(185.0f + home_pulse * 70.0f)), 7);
  for (int i = 0; i < 6; i++) {
    int x = 16 + (i % 3) * 208;
    bool focus = i == dash_focus;
    int lift = (focus && !preview_mode) ? -2 : 0;
    int y = 104 + (i / 3) * 112 + lift;
    rounded_gradient(x + (focus ? 2 : 1), y + (focus ? 2 : 1), 192 - (focus ? 4 : 2),
                     102 - (focus ? 4 : 2), focus ? 14 : 15,
                     mix(elevated, accent, focus ? (0.22f + home_pulse * 0.06f) : 0.10f), panel);
    if (focus) {
      SDL_Color fc = mix(accent, textc, home_pulse * 0.14f);
      rounded_outline(x, y, 192, 102, 16, fc);
      rounded_outline(x + 1, y + 1, 190, 100, 15, fc);
    } else {
      rounded_outline(x, y, 192, 102, 16, hairline());
    }
    rounded(x + 13, y + 13, 36, 36, 11, alpha(bg, 165));
    rounded_outline(x + 12, y + 12, 38, 38, 12, mix(panel, textc, 0.10f));
    if (i == 4) {
      /* Crisp custom vector newspaper icon for Notícias */
      int ix = x + 20, iy = y + 20;
      rounded_outline(ix, iy, 22, 20, 4, accent);
      rounded_outline(ix + 1, iy + 1, 20, 18, 3, accent);
      rect(ix + 4, iy + 5, 7, 6, accent);
      rect(ix + 13, iy + 5, 5, 2, accent);
      rect(ix + 13, iy + 9, 5, 2, accent);
      rect(ix + 4, iy + 13, 14, 2, mix(accent, textc, 0.25f));
    } else if (tile_sprite_col[i] < 0 ||
               !kp_sprite(KP_SPR_CATEGORIES, tile_sprite_col[i], x + 18, y + 18, 26, 26)) {
      icon(i == 1 ? 2 : i == 3 ? 1 : 0, x + 19, y + 19, 24, accent);
    }
    label(tags[i], x + 60, y + 15, 11, accent, 104);
    int arrow_shift = (focus && !preview_mode) ? (int)(home_pulse * 2.5f) : 0;
    tile_arrow(x + 170 + arrow_shift, y + 14 - arrow_shift, focus ? accent : dim);
    label(names[i], x + 14, y + 56, 17, textc, 168);
    label(desc[i], x + 14, y + 80, 11, muted, 168);
  }
  /* Bottom large section: Weather (v2.0.6 default) or Full Player (inverted). */
  if (home_layout_inverted)
    draw_home_player_large();
  else
    draw_home_weather_large();
  footer_hints(NULL, 0);
}
static void draw_menu(void) {
  if (menu_search_kb) {
    draw_menu_search_keyboard();
    return;
  }
  backdrop();
  draw_header(locations_view ? tr("ARQUIVOS")
              : category == 2 ? tr("VÍDEOS")
              : category == 1 ? tr("MÚSICAS")
                              : tr("MÚSICAS E VÍDEOS"));
  panel_card(14, 38, 612, 66, 14);
  icon(2, 26, 48, 22, accent);
  label(favorites_view   ? tr("Minhas favoritas")
        : locations_view   ? tr("Escolha o local das suas mídias")
        : automatic_view ? tr("Pastas: /roms(2)/bgmusic e /roms(2)/videos")
                         : folder,
        58, 47, 16, textc, 430);
  if (!locations_view) {
    char count[80];
    snprintf(count, sizeof(count), tr("%d / %d itens"), total ? selected + 1 : 0, total);
    label(count, 496, 50, 12, muted, 118);
  }
  const char *tabs[] = {tr("Todos"), tr("Músicas"), tr("Vídeos")};
  for (int i = 0; i < 3; i++) {
    pill(26 + i * 96, 75, 88, 23, i == category);
    centered(tabs[i], 26 + i * 96, 80, 88, 13, i == category ? bg : muted);
  }
  if (!locations_view) {
    char sbadge[96];
    if (menu_search[0])
      snprintf(sbadge, sizeof(sbadge), "Busca: %.24s  (L1 / R1 limpa)", menu_search);
    else
      snprintf(sbadge, sizeof(sbadge), "L1 • Pesquisar digitando");
    rounded(322, 75, 290, 23, 10, menu_search[0] ? alpha(accent, 42) : elevated);
    centered(sbadge, 326, 80, 282, 11, menu_search[0] ? accent : muted);
  }
  if (locations_view) {
    for (int i = 0; i < LOCATION_COUNT; i++) {
      int y = 112 + i * 59;
      bool focus = i == location_selected;
      card(14, y, 612, 53, 11, focus, panel);
      icon(2, 28, y + 14, 26, focus ? accent : muted);
      label(tr(location_names[i]), 68, y + 7, 19, textc, 410);
      label(location_paths[i], 68, y + 32, 12, muted, 410);
      label(location_available[i] ? tr("Abrir") : tr("Indisponível"), 494,
            y + 18, 13, location_available[i] ? accent : dim, 118);
    }
    footer_hints(NULL, 0);
    return;
  }
  if (selected < offset)
    offset = selected;
  if (selected >= offset + 7)
    offset = selected - 6;
  for (int row = 0; row < 7 && offset + row < total; row++) {
    int i = offset + row, y = 112 + row * 51;
    Item *it = &items[i];
    bool focus = i == selected;
    card(14, y, 612, 46, 10, focus, panel);
    icon(it->dir                ? 2
         : audio_file(it->name) ? 0
                                : 1,
         28, y + 11, 24,
         it->dir ? accent
         : focus ? accent
                 : muted);
    label(it->name, 64, y + 6, 18, textc, 444);
    char s[48];
    if (it->dir)
      snprintf(s, sizeof(s), "%s", tr("Pasta"));
    else
      size_string(it->size, s, sizeof(s));
    label(s, 520, y + 14, 13, muted, 94);
    if (!it->dir && !audio_file(it->name)) {
      char full_vp[PATH_MAX];
      if (it->path && it->path[0]) snprintf(full_vp, sizeof(full_vp), "%s", it->path);
      else snprintf(full_vp, sizeof(full_vp), "%.2047s/%.2047s", folder, it->name);
      long long wh_pos = kp_wh_find_ms(full_vp, NULL);
      if (wh_pos >= 5000) {
        char wt[32], wlbl[64];
        time_string(wh_pos, wt, sizeof(wt));
        snprintf(wlbl, sizeof(wlbl), "Vídeo  •  Continuar em %s", wt);
        label(wlbl, 64, y + 28, 12, accent, 420);
      } else {
        label(tr("Vídeo"), 64, y + 28, 12, dim, 400);
      }
    } else {
      label(it->dir                ? tr("Explorar pasta")
            : audio_file(it->name) ? tr("Áudio")
                                   : tr("Vídeo"),
            64, y + 28, 12, dim, 400);
    }
  }
  if (!total) {
    centered(menu_search[0] ? "Nenhum item encontrado para a pesquisa"
             : folder_error[0] ? folder_error : tr("Nenhuma mídia neste filtro"),
             14, 224, 612, 22, textc);
    centered(menu_search[0] ? "Pressione R1 para limpar a busca ou L1 para editar."
                            : tr("A volta. Esquerda/direita muda o filtro. Y atualiza."),
             14, 264, 612, 14, muted);
  }
  footer_hints(NULL, 0);
}
/* Aligned audio screen: one album card, one switchable pane, one transport. */
static void music_lines(const char *text, int x, int y, int width, int size,
                        int step, int maxlines, SDL_Color c, bool center) {
  char copy[2048], line[2048] = "";
  snprintf(copy, sizeof(copy), "%s", text);
  char *save = NULL, *word = strtok_r(copy, " ", &save);
  int row = 0;
  while (word && row < maxlines) {
    char candidate[4096];
    snprintf(candidate, sizeof(candidate), "%s%s%s", line, *line ? " " : "",
             word);
    if (*line && measure(candidate, size) > width) {
      if (row == maxlines - 1) {
        size_t n = strlen(line);
        if (n + 5 < sizeof(line))
          memcpy(line + n, " …", 5);
        word = NULL;
      }
      if (center)
        centered(line, x, y + row * step, width, size, c);
      else
        label(line, x, y + row * step, size, c, width);
      row++;
      if (!word)
        return;
      snprintf(line, sizeof(line), "%s", word);
    } else
      snprintf(line, sizeof(line), "%.2047s", candidate);
    word = strtok_r(NULL, " ", &save);
  }
  if (*line && row < maxlines) {
    if (center)
      centered(line, x, y + row * step, width, size, c);
    else
      label(line, x, y + row * step, size, c, width);
  }
}
static int queue_offset = 0;
static void draw_audio_rows(bool files) {
  int count = files ? music_total : queue_count;
  int *cursor = files ? &music_selected : &queue_selected;
  int *scroll = files ? &music_offset : &queue_offset;
  if (count && *cursor >= count)
    *cursor = count - 1;
  if (*cursor < *scroll)
    *scroll = *cursor;
  if (*cursor >= *scroll + 5)
    *scroll = *cursor - 4;
  if (!count) {
    centered(tr(files ? "Pasta sem músicas" : "Fila vazia"), 274, 204, 336, 18,
             textc);
    return;
  }
  for (int row = 0; row < 5 && *scroll + row < count; row++) {
    int i = *scroll + row, y = 126 + row * 46;
    bool focus = i == *cursor;
    const char *path = files ? music_entries[i].name : queue_paths[i];
    const char *base = strrchr(path, '/');
    base = base ? base + 1 : path;
    bool dir = files && music_entries[i].dir;
    char full[PATH_MAX];
    if (files) {
      if (snprintf(full, sizeof(full), "%s/%s", music_folder, path) >=
          (int)sizeof(full))
        full[0] = 0;
    } else
      snprintf(full, sizeof(full), "%s", path);
    bool playing = !dir && !strcmp(full, current_path);
    card(272, y, 340, 41, 8, focus, panel);
    if (dir)
      icon(2, 282, y + 12, 18, accent);
    else if (playing) {
      float et = preview_mode ? 0.5f : (float)SDL_GetTicks() * 0.008f;
      int h1 = 6 + (int)(fabsf(sinf(et * 1.1f)) * 12.0f);
      int h2 = 6 + (int)(fabsf(sinf(et * 1.7f + 1.3f)) * 14.0f);
      int h3 = 6 + (int)(fabsf(sinf(et * 1.4f + 2.6f)) * 11.0f);
      rect(284, y + 29 - h1, 3, h1, accent);
      rect(289, y + 29 - h2, 3, h2, accent);
      rect(294, y + 29 - h3, 3, h3, accent);
    } else
      triangle(285, y + 12, 14, muted);
    label(playing ? title : base, 310, y + 6, 14, playing ? accent : textc,
          284);
    label(dir       ? tr("Pasta")
          : playing ? tr("Em reprodução")
                    : tr("B  Reproduzir"),
          310, y + 25, 10, muted, 280);
  }
}
#include "transport.h"
static void draw_music(void) {
  backdrop();
  draw_header(tr("MÚSICAS"));
  panel_card(16, 46, 232, 320, 16);
  art(70, 58, 124);
  music_lines(title, 28, 192, 208, 17, 20, 2, textc, true);
  centered(artist[0] ? artist : tr("Artista não informado"), 28, 236, 208, 12,
           accent);
  centered(album[0] ? album : tr("Áudio local"), 28, 253, 208, 11, muted);
  visualizer(36, 272, 192, 18, 30, active && !paused);
  rect(28, 298, 208, 1, hairline());
  char size[40], duration[32], detail[128];
  media_ui_format_filesize(media_size_bytes, media_size_known, size,
                           sizeof(size));
  time_string(duration_ms(), duration, sizeof(duration));
  snprintf(detail, sizeof(detail), "%s  •  %s  •  %s", media_format, size,
           duration);
  label(detail, 28, 307, 11, textc, 208);
  if (media_sample_rate || media_channels || media_bitrate_kbps) {
    char rate_text[32], channel_text[32], bitrate_text[32];
    snprintf(rate_text, sizeof(rate_text), media_sample_rate
                                                ? "%.1f kHz"
                                                : "-- kHz",
             media_sample_rate / 1000.0);
    snprintf(channel_text, sizeof(channel_text), "%u %s",
             media_channels, tr("canais"));
    snprintf(bitrate_text, sizeof(bitrate_text), "%u kbps",
             media_bitrate_kbps);
    snprintf(detail, sizeof(detail), "%s  •  %s", rate_text, channel_text);
    label(detail, 28, 329, 11, muted, 208);
    label(bitrate_text, 28, 348, 11, accent, 208);
  } else
    label(tr("Analisando dados técnicos..."), 28, 330, 11, muted, 208);
  panel_card(260, 46, 364, 320, 16);
  const char *tabs[] = {tr("Letras"), tr("Fila"), tr("Pasta")};
  for (int i = 0; i < 3; i++) {
    int x = 272 + i * 114;
    pill(x, 58, 108, 28, i == audio_panel);
    centered(tabs[i], x + 4, 65, 100, 14, i == audio_panel ? bg : muted);
  }
  if (audio_panel == 0) {
    label(lyric_count   ? tr("LETRAS SINCRONIZADAS")
          : plain_count ? tr("LETRAS EMBUTIDAS")
                        : tr("LETRAS"),
          276, 101, 10, accent, 328);
    if (lyric_count) {
      int i = current_lyric();
      if (i < 0)
        centered(tr("Aguardando a letra..."), 278, 209, 328, 17, muted);
      else {
        if (i > 0)
          music_lines(lyrics[i - 1].text, 278, 139, 328, 14, 20, 2, muted,
                      true);
        music_lines(lyrics[i].text, 278, 204, 328, 20, 25, 2, textc, true);
        if (i + 1 < lyric_count)
          music_lines(lyrics[i + 1].text, 278, 281, 328, 14, 20, 2, muted,
                      true);
      }
    } else if (plain_count) {
      for (int row = 0; row < 5 && plain_scroll + row < plain_count; row++)
        label(plain_lyrics[plain_scroll + row], 278, 133 + row * 42, 14, textc,
              328);
    } else {
      centered(tr("Letras indisponíveis"), 278, 194, 328, 18, textc);
      music_lines(tr("Use um .lrc com o mesmo nome do áudio."), 278, 237, 328,
                  13, 21, 2, muted, true);
    }
  } else {
    if (audio_panel == 2)
      label(music_folder, 276, 101, 12, muted, 328);
    else {
      char s[96];
      snprintf(s, sizeof(s), "%d faixas  •  Y Remover  •  L2/R2 Mover", queue_count);
      label(s, 276, 101, 11, muted, 340);
    }
    draw_audio_rows(audio_panel == 2);
  }
  draw_music_transport();
}

static void draw_video(void) {
  begin_full_screen_pass();
  color((SDL_Color){0, 0, 0, 255});
  SDL_RenderClear(renderer);
  pthread_mutex_lock(&video.mutex);
  if (video.ready && video.pixels) {
    if (!video_texture || texture_w != (int)video.width ||
        texture_h != (int)video.height) {
      if (video_texture)
        SDL_DestroyTexture(video_texture);
      texture_w = video.width;
      texture_h = video.height;
      video_texture =
          SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGB888,
                            SDL_TEXTUREACCESS_STREAMING, texture_w, texture_h);
    }
    if (video_texture)
      SDL_UpdateTexture(video_texture, NULL, video.pixels, video.pitch);
  }
  pthread_mutex_unlock(&video.mutex);
  int vw = display_adaptive_active ? dev_w : W;
  int vh = display_adaptive_active ? dev_h : H;
  if (video_texture) {
    double scale = fit == 1
                       ? fmax((double)vw / texture_w, (double)vh / texture_h)
                       : fmin((double)vw / texture_w, (double)vh / texture_h);
    SDL_Rect r = {(vw - (int)(texture_w * scale)) / 2,
                  (vh - (int)(texture_h * scale)) / 2, (int)(texture_w * scale),
                  (int)(texture_h * scale)};
    if (fit == 2)
      r = (SDL_Rect){0, 0, vw, vh};
    SDL_RenderCopy(renderer, video_texture, NULL, &r);
  }
  begin_ui_pass();
  uint32_t now_t = SDL_GetTicks();
  if (!video_texture) {
    centered(preview_mode ? tr("PRÉVIA DA INTERFACE")
                          : (playing_iptv ? "Conectando transmissão..." : tr("Carregando vídeo...")),
             16, 210, 608, 22, (SDL_Color){225, 230, 240, 255});
    if (!preview_mode) {
      centered(media_name, 40, 246, 560, 14, muted);
    }
  }

  /* Center auto-fading HUD action toast (seek, speed, fit, brightness, A-B loop, lock) */
  if (video_hud_toast[0] && now_t < video_hud_toast_until) {
    uint32_t rem = video_hud_toast_until - now_t;
    int a_val = rem < 300u ? (int)((rem * 235u) / 300u) : 235;
    if (a_val > 12) {
      rounded(180, 184, 280, 48, 16, (SDL_Color){10, 14, 22, (Uint8)a_val});
      rounded_outline(180, 184, 280, 48, 16, alpha(accent, a_val));
      centered(video_hud_toast, 192, 198, 264, 17, alpha(textc, a_val));
    }
  }

  /* Control Lock minimal banner */
  if (video_locked) {
    if (now_t < osd_until) {
      rounded(152, 22, 336, 34, 14, (SDL_Color){10, 14, 22, 220});
      rounded_outline(152, 22, 336, 34, 14, accent);
      centered("CONTROLES TRAVADOS  •  X ou SELECT destrava", 160, 31, 320, 12, accent);
    }
    return;
  }

  if (show_osd && (now_t < osd_until || paused || preview_mode)) {
    update_status();
    /* Top cinematic gradient scrim */
    for (int s = 0; s < 14; s++) {
      int sa = 215 - s * 15;
      if (sa < 0) sa = 0;
      rect(0, s * 6, 640, 6, (SDL_Color){4, 7, 12, (Uint8)sa});
    }
    /* Source badge + Title + Resolution + Clock/Battery/Sleep */
    const char *src_tag = playing_news_video ? "NOTÍCIAS"
                        : playing_iptv       ? "IPTV"
                                             : "VÍDEO";
    rounded(16, 12, 74, 22, 9, accent);
    centered(src_tag, 16, 16, 74, 10, bg);
    label(media_name[0] ? media_name : tr("Vídeo"), 100, 12, 17, textc, 332);

    char meta_right[96];
    if (texture_w > 0 && texture_h > 0) {
      snprintf(meta_right, sizeof(meta_right), "%dx%d  •  %.2fx", texture_w, texture_h, rate);
    } else {
      snprintf(meta_right, sizeof(meta_right), "%.2fx  •  Brilho %d%%", rate, kp_hw_brightness_pct);
    }
    label(meta_right, 100, 36, 11, muted, 260);

    if (sleep_choice > 0 && sleep_end > 0) {
      uint32_t srem = (int32_t)(sleep_end - now_t) > 0 ? (sleep_end - now_t) : 0;
      char sbuf[24];
      snprintf(sbuf, sizeof(sbuf), "ZZZ %um", (srem + 59999u) / 60000u);
      rounded(446, 12, 68, 22, 9, alpha(accent, 48));
      centered(sbuf, 446, 16, 68, 10, accent);
    }
    label(clock_text, 524, 15, 13, textc, 50);
    if (battery_percent >= 0) {
      char bat_s[16];
      snprintf(bat_s, sizeof(bat_s), "%d%%", battery_percent);
      label(bat_s, 580, 15, 13, accent, 48);
    }

    /* Bottom cinematic gradient scrim */
    for (int s = 0; s < 28; s++) {
      int sa = (s * 230) / 27;
      rect(0, 308 + s * 6, 640, 6, (SDL_Color){4, 7, 12, (Uint8)sa});
    }

    /* Timeline container (Row 0 focus) */
    bool row0_focus = (video_osd_row == 0);
    long long len = duration_ms();
    long long cur = now_ms();
    char cur_s[32], dur_s[32], rem_s[80];
    time_string(cur, cur_s, sizeof(cur_s));
    if (len > 0) {
      time_string(len, dur_s, sizeof(dur_s));
      long long left_ms = len > cur ? (len - cur) : 0;
      char tmp_r[32];
      time_string(left_ms, tmp_r, sizeof(tmp_r));
      snprintf(rem_s, sizeof(rem_s), "-%s  /  %s", tmp_r, dur_s);
    } else {
      snprintf(rem_s, sizeof(rem_s), playing_iptv ? "AO VIVO" : "--:--");
    }

    label(cur_s, 22, 344, 13, row0_focus ? accent : textc, 96);
    if (video_ab_a >= 0) {
      char ab_info[64];
      char ta[24], tb[24];
      time_string(video_ab_a, ta, sizeof(ta));
      if (video_ab_b > video_ab_a) {
        time_string(video_ab_b, tb, sizeof(tb));
        snprintf(ab_info, sizeof(ab_info), "LOOP A-B: %s → %s", ta, tb);
      } else {
        snprintf(ab_info, sizeof(ab_info), "PONTO A: %s (marque B)", ta);
      }
      rounded(204, 341, 232, 20, 8, alpha(accent, 42));
      centered(ab_info, 208, 345, 224, 10, accent);
    }
    int rw = (int)measure(rem_s, 12);
    label(rem_s, 618 - (rw < 180 ? rw : 180), 344, 12, muted, 180);

    /* Enhanced progress bar with A-B markers */
    int bx = 22, by = 368, bw = 596;
    if (row0_focus) rounded_outline(bx - 4, by - 5, bw + 8, 16, 8, alpha(accent, 110));
    rounded(bx, by, bw, 6, 3, (SDL_Color){255, 255, 255, 45});
    if (len > 0 && video_ab_a >= 0) {
      int ax = bx + (int)(bw * fmax(0.0, fmin(1.0, (double)video_ab_a / (double)len)));
      if (video_ab_b > video_ab_a) {
        int bpx = bx + (int)(bw * fmax(0.0, fmin(1.0, (double)video_ab_b / (double)len)));
        rounded(ax, by - 1, (bpx - ax) > 4 ? (bpx - ax) : 4, 8, 3, alpha(accent, 120));
        rect(bpx, by - 4, 2, 14, textc);
      }
      rect(ax, by - 4, 2, 14, accent);
    }
    double p = len > 0 ? fmax(0.0, fmin(1.0, (double)cur / (double)len)) : (playing_iptv ? 1.0 : 0.0);
    int fill = (int)(bw * p);
    if (fill > 0) rounded(bx, by, fill > 6 ? fill : 6, 6, 3, accent);
    glow_circle(bx + fill, by + 3, 6, alpha(accent, 210), 4);
    fill_circle(bx + fill, by + 3, 5, textc);

    /* Interactive Quick-Action Dock (Row 1 focus, 8 buttons) */
    const char *dock_top[8] = {
        paused ? "Tocar" : "Pausa",
        "Vel.",
        "Tela",
        "Áudio",
        "Legenda",
        "Brilho",
        "Loop A-B",
        "Travar",
    };
    char dock_sub[8][20];
    snprintf(dock_sub[0], sizeof(dock_sub[0]), "%s", paused ? "PAUSADO" : "TOCANDO");
    snprintf(dock_sub[1], sizeof(dock_sub[1]), "%.2fx", rate);
    snprintf(dock_sub[2], sizeof(dock_sub[2]), "%s",
             fit == 0 ? "Original" : fit == 1 ? "Cheia" : "Esticar");
    snprintf(dock_sub[3], sizeof(dock_sub[3]), "Trocar");
    snprintf(dock_sub[4], sizeof(dock_sub[4]), "Trocar");
    snprintf(dock_sub[5], sizeof(dock_sub[5]), "%d%%", kp_hw_brightness_pct);
    snprintf(dock_sub[6], sizeof(dock_sub[6]), "%s",
             video_ab_b > video_ab_a ? "A-B ON" : (video_ab_a >= 0 ? "A ✓" : "Off"));
    snprintf(dock_sub[7], sizeof(dock_sub[7]), "Lock");

    int dock_w = 71;
    int dock_gap = 4;
    int dock_x0 = 22;
    int dock_y = 390;
    for (int i = 0; i < 8; i++) {
      int dx = dock_x0 + i * (dock_w + dock_gap);
      bool focus = (video_osd_row == 1 && video_dock_idx == i);
      bool active_btn = (i == 6 && video_ab_a >= 0) || (i == 0 && paused);
      rounded(dx, dock_y, dock_w, 48, 10,
              focus ? alpha(accent, 52)
                    : (active_btn ? alpha(elevated, 225) : (SDL_Color){16, 22, 34, 210}));
      rounded_outline(dx, dock_y, dock_w, 48, 10,
                      focus ? accent : (active_btn ? alpha(accent, 140) : (SDL_Color){255, 255, 255, 36}));
      centered(dock_top[i], dx + 2, dock_y + 8, dock_w - 4, 12, focus ? accent : textc);
      centered(dock_sub[i], dx + 2, dock_y + 27, dock_w - 4, 10, focus ? textc : muted);
    }

    centered(video_osd_row == 0
                 ? "←/→ Buscar 10s  •  ↓ Ações rápidas  •  B Pausa  •  L1/R1 Próx  •  SELECT Opções"
                 : "←/→ Escolher ação  •  B Aplicar  •  ↑ Voltar p/ linha do tempo  •  X Ocultar",
             16, 452, 608, 11, muted);
  }
}
