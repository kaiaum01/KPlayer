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
static void draw_header(const char *section) {
  update_status();
  rect(0, 0, 640, 32, alpha(panel, 215));
  rect(0, 32, 640, 1, hairline());
  glow_circle(18, 16, 4, accent, 4);
  fill_circle(18, 16, 4, accent);
  label("K PLAYER", 30, 8, 15, textc, 85);
  label(KPLAYER_VERSION, 113, 10, 11, dim, 34);
  label(top_location, 154, 10, 11, muted, 120);
  rounded(272, 6, 144, 20, 10, elevated);
  centered(section, 272, 9, 144, 11, muted);
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
static void media_ui_button_circle(const char *name, int cx, int cy);
static void media_ui_button_pill(const char *name, int x, int y, int width);
typedef struct { const char *key; const char *action; } FooterHint;
static void footer_hints(const FooterHint *hints, int count) {
  rect(0, 436, 640, 44, alpha(panel, 225));
  rect(0, 436, 640, 1, hairline());
  if (count <= 0) return;
  int cols = count >= 6 ? (count + 1) / 2 : count;
  int cell = 616 / cols;
  for (int i = 0; i < count; i++) {
    int x = 12 + (i % cols) * cell;
    int cy = count >= 6 ? 447 + (i / cols) * 20 : 458;
    int width = (int)strlen(hints[i].key) == 1 ? 24 :
                (int)ceil(measure(hints[i].key, 9)) + 12;
    if (width < 26) width = 26;
    int id = !strcmp(hints[i].key,"DIR") ? 0 : !strcmp(hints[i].key,"A") ? 1 :
             !strcmp(hints[i].key,"B") ? 2 : !strcmp(hints[i].key,"X") ? 3 :
             !strcmp(hints[i].key,"Y") ? 4 : !strcmp(hints[i].key,"SELECT") ? 6 : -1;
    if (count >= 6 && id >= 0 && kp_sprite(KP_SPR_BUTTONS, id, x + 3, cy - 9, 18, 18)) {
      /* Two-line footers keep each sprite inside its own 20-pixel row. */
    } else if (strlen(hints[i].key) == 1)
      media_ui_button_circle(hints[i].key, x + 13, cy);
    else
      media_ui_button_pill(hints[i].key, x, cy - 9, width);
    label(tr(hints[i].action), x + width + 4, cy - 6, count >= 6 ? 11 : 12, muted,
          cell - width - 7);
  }
  if (SDL_GetTicks() < note_until) {
    glow_rect(30, 397, 580, 32, 16, accent, 4);
    rounded(30, 397, 580, 32, 16, elevated);
    centered(status_note, 40, 405, 560, 13, accent);
  }
}
static void progress(int x, int y, int w) {
  long long len = duration_ms(), t = now_ms();
  double p = len > 0 ? fmax(0, fmin(1, (double)t / len)) : 0;
  rounded(x, y, w, 4, 2, track_color());
  int fill = (int)(w * p);
  if (fill > 0) rounded(x, y, fill > 4 ? fill : 4, 4, 2, accent);
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
static void draw_home(void) {
  backdrop();
  draw_header(tr("DASHBOARD"));
  /* Hero: two-tone headline. */
  const char *h1 = tr("Seu som."), *h2 = tr("Sua tela.");
  label(h1, 18, 42, 29, textc, 300);
  label(h2, 18 + (int)measure(h1, 29) + 10, 42, 29, muted, 300);
  label(tr("Músicas, vídeos, rádios e TV ao vivo num player só."), 18, 82, 12,
        muted, 600);
  const char *names[] = {tr("Músicas"), tr("Vídeos"), tr("Arquivos"),
                         tr("Rádio Online"), tr("IPTV"), "YouTube"},
             *desc[] = {tr("Sua trilha sonora,"), tr("Cinema na palma"),
                        tr("Explore as pastas"), tr("Estações do mundo"),
                        tr("Canais ao vivo"), tr("Vídeos online")},
             *tags[] = {tr("LRC Sync"), tr("Ocultar auto."), tr("Mídias locais"),
                        tr("Radio Browser"), tr("TV Online"), "PilasTube"};
  for (int i = 0; i < 6; i++) {
    int x = 16 + (i % 3) * 208, y = 104 + (i / 3) * 104;
    bool focus = i == dash_focus;
    if (focus) {
      glow_rect(x, y, 192, 94, 16, accent, 6);
      rounded(x, y, 192, 94, 16, accent);
    } else
      rounded(x, y, 192, 94, 16, hairline());
    rounded_gradient(x + (focus ? 2 : 1), y + (focus ? 2 : 1), 192 - (focus ? 4 : 2),
                     94 - (focus ? 4 : 2), focus ? 14 : 15,
                     mix(elevated, accent, focus ? 0.22f : 0.10f), panel);
    rounded(x + 12, y + 12, 38, 38, 12, alpha(bg, 150));
    if (!kp_sprite(KP_SPR_CATEGORIES, i == 5 ? 1 : i, x + 17, y + 17, 28, 28))
      icon(i == 3 ? 2 : i >= 4 ? 1 : i, x + 18, y + 18, 26, accent);
    label(tags[i], x + 60, y + 14, 10, accent, 104);
    tile_arrow(x + 170, y + 14, focus ? accent : dim);
    label(names[i], x + 14, y + 54, 17, textc, 168);
    label(desc[i], x + 14, y + 75, 10, muted, 168);
  }
  /* Now playing card. */
  panel_card(16, 318, 608, 108, 18);
  bool on = active && !paused;
  art(30, 330, 84);
  label(active ? (on ? tr("TOCANDO AGORA") : tr("PAUSADO")) : tr("NADA TOCANDO"),
        130, 336, 10, active ? accent : dim, 300);
  label(active ? title : tr("Pronto para dar o play"), 130, 352, 18, textc, 330);
  label(active ? (artist[0] ? artist : tr("Reprodução local"))
               : tr("Abra Músicas ou Vídeos para começar"),
        130, 379, 12, muted, 330);
  visualizer(130, 400, 200, 14, 34, on);
  if (!kp_sprite(KP_SPR_CONTROLS, KP_PREV, 484, 360, 24, 24))
    label("|<", 488, 364, 16, muted, 25);
  play_button(526, 350, 44);
  if (!kp_sprite(KP_SPR_CONTROLS, KP_NEXT, 588, 360, 24, 24))
    label(">|", 592, 364, 16, muted, 25);
  const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Abrir"},
      {"X", "Player"}, {"Y", "Opções"}, {"START", "Pausa"}};
  footer_hints(hints, 5);
}
static void draw_menu(void) {
  backdrop();
  draw_header(tr("BIBLIOTECA"));
  panel_card(14, 46, 612, 68, 14);
  icon(2, 28, 59, 22, accent);
  label(favorites_view   ? tr("Minhas favoritas")
        : locations_view   ? tr("Escolha o local das suas mídias")
        : automatic_view ? tr("Busca automática: midias, /roms e /roms2")
                         : folder,
        62, 59, 15, textc, 548);
  const char *tabs[] = {tr("Todos"), tr("Músicas"), tr("Vídeos")};
  for (int i = 0; i < 3; i++) {
    pill(28 + i * 100, 86, 92, 21, i == category);
    centered(tabs[i], 28 + i * 100, 90, 92, 12, i == category ? bg : muted);
  }
  if (locations_view) {
    for (int i = 0; i < 4; i++) {
      int y = 126 + i * 66;
      bool focus = i == location_selected;
      card(14, y, 612, 58, 10, focus, panel);
      icon(2, 28, y + 17, 26, focus ? accent : muted);
      label(tr(location_names[i]), 68, y + 9, 18, textc, 380);
      label(location_paths[i], 68, y + 34, 12, muted, 380);
      label(location_available[i] ? tr("Abrir") : tr("Indisponível"), 510,
            y + 23, 13, location_available[i] ? accent : dim, 103);
    }
    label(tr("Selecione um local. Y verifica novamente os cartões."), 18, 420,
          12, muted, 604);
    const FooterHint hints[] = {{"B", "Abrir"}, {"A", "Início"}, {"DIR", "Filtro"},
                                {"X", "Player"}, {"Y", "Atualizar"}, {"SELECT", "Opções"}};
    footer_hints(hints, 6);
    return;
  }
  if (selected < offset)
    offset = selected;
  if (selected >= offset + 6)
    offset = selected - 5;
  for (int row = 0; row < 6 && offset + row < total; row++) {
    int i = offset + row, y = 126 + row * 49;
    Item *it = &items[i];
    bool focus = i == selected;
    card(14, y, 612, 44, 9, focus, panel);
    icon(it->dir                ? 2
         : audio_file(it->name) ? 0
                                : 1,
         28, y + 10, 24,
         it->dir ? accent
         : focus ? accent
                 : muted);
    label(it->name, 66, y + 7, 16, textc, 442);
    char s[48];
    if (it->dir)
      snprintf(s, sizeof(s), "%s", tr("Pasta"));
    else
      size_string(it->size, s, sizeof(s));
    label(s, 527, y + 14, 12, muted, 87);
    label(it->dir                ? tr("Explorar pasta")
          : audio_file(it->name) ? tr("Áudio")
                                 : tr("Vídeo"),
          66, y + 27, 10, dim, 400);
  }
  if (!total) {
    centered(folder_error[0] ? folder_error : tr("Nenhuma mídia neste filtro"),
             14, 220, 612, 22, textc);
    centered(tr("A volta. Esquerda/direita muda o filtro. Y atualiza."), 14,
             259, 612, 14, muted);
  }
  char count[80];
  snprintf(count, sizeof(count), tr("%d / %d itens"), total ? selected + 1 : 0,
           total);
  label(count, 18, 420, 11, dim, 200);
  const FooterHint hints[] = {{"B", "Abrir"}, {"A", "Voltar"}, {"DIR", "Filtro"},
                              {"X", "Player"}, {"Y", "Atualizar"}, {"SELECT", "Opções"}};
  footer_hints(hints, 6);
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
      rect(284, y + 15, 3, 12, accent);
      rect(289, y + 10, 3, 17, accent);
      rect(294, y + 13, 3, 14, accent);
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
      char s[64];
      snprintf(s, sizeof(s), tr("%d faixas na fila"), queue_count);
      label(s, 276, 101, 12, muted, 328);
    }
    draw_audio_rows(audio_panel == 2);
  }
  draw_music_transport();
}

static void draw_video(void) {
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
  if (video_texture) {
    double scale = fit == 1
                       ? fmax((double)W / texture_w, (double)H / texture_h)
                       : fmin((double)W / texture_w, (double)H / texture_h);
    SDL_Rect r = {(W - (int)(texture_w * scale)) / 2,
                  (H - (int)(texture_h * scale)) / 2, (int)(texture_w * scale),
                  (int)(texture_h * scale)};
    if (fit == 2)
      r = (SDL_Rect){0, 0, W, H};
    SDL_RenderCopy(renderer, video_texture, NULL, &r);
  } else {
    centered(preview_mode ? tr("PRÉVIA DA INTERFACE")
                          : tr("Carregando vídeo..."),
             16, 210, 608, 22, (SDL_Color){220,220,220,255});
  }
  if (show_osd && (SDL_GetTicks() < osd_until || paused || preview_mode)) {
    draw_header(tr("VÍDEOS"));
    rounded(16, 46, 88, 28, 14, alpha(panel, 225));
    label(tr("A  Voltar"), 29, 54, 13, textc, 66);
    rounded(450, 46, 174, 28, 14, alpha(panel, 225));
    label(tr("Controles ocultam em 3s"), 461, 54, 11, muted, 158);
    rounded(16, 328, 608, 100, 18, alpha(panel, 235));
    label(media_name, 32, 340, 18, textc, 400);
    char a[32], b[32], s[80];
    time_string(now_ms(), a, sizeof(a));
    time_string(duration_ms(), b, sizeof(b));
    snprintf(s, sizeof(s), "%s / %s", a, b);
    label(s, 480, 343, 12, muted, 130);
    progress(32, 372, 576);
    play_button(32, 387, 30);
    label("-10s     +10s", 82, 397, 13, textc, 140);
    snprintf(s, sizeof(s), "%s", tr("SELECT Opções"));
    label(s, 420, 397, 13, muted, 190);
    const FooterHint hints[] = {{"B", "Pausa"}, {"DIR", "10s"}, {"X", "Ocultar"},
                                {"A", "Voltar"}, {youtube_playing ? "Y" : "SELECT", youtube_playing ? "Baixar" : "Opções"}};
    footer_hints(hints, 5);
  }
}
