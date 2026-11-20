/* Compact three-column music transport, drawn with native SDL primitives. */
static double media_ui_progress(long long current, long long length) {
  return length > 0 ? fmax(0, fmin(1, (double)current / (double)length)) : 0;
}
static void media_ui_format_filesize(uint64_t bytes, bool known, char *out,
                                     size_t n) {
  if (!known)
    snprintf(out, n, "-- MB");
  else if (bytes >= 1024u * 1024u)
    snprintf(out, n, "%.1f MB", (double)bytes / (1024. * 1024.));
  else
    snprintf(out, n, "%llu KB",
             (unsigned long long)(bytes ? ((bytes - 1) / 1024 + 1) : 0));
}
static void media_ui_circle(int cx, int cy, int radius, SDL_Color c) {
  color(c);
  for (int y = -radius; y <= radius; y++) {
    int dx = (int)sqrt((double)radius * radius - y * y);
    SDL_RenderDrawLine(renderer, cx - dx, cy + y, cx + dx, cy + y);
  }
}
static void media_ui_skip(int cx, int cy, bool next) {
  if (kp_sprite(KP_SPR_CONTROLS, next ? KP_NEXT : KP_PREV,
                cx - 8, cy - 8, 16, 16))
    return;
  color(muted);
  int dir = next ? 1 : -1;
  rect(cx + dir * 5 - 1, cy - 5, 2, 11, muted);
  for (int i = 0; i < 8; i++) {
    int x = cx - dir * 5 + dir * i, half = (7 - i) * 5 / 7;
    SDL_RenderDrawLine(renderer, x, cy - half, x, cy + half);
  }
}
static void media_ui_button_circle(const char *name, int cx, int cy) {
  int id = !strcmp(name,"A") ? 1 : !strcmp(name,"B") ? 2 :
           !strcmp(name,"X") ? 3 : !strcmp(name,"Y") ? 4 :
           !strcmp(name,"FN") ? 5 : -1;
  if (id>=0 && kp_sprite(KP_SPR_BUTTONS,id,cx-10,cy-10,20,20)) return;
  media_ui_circle(cx, cy, 9, elevated);
  centered(name, cx - 8, cy - 5, 16, 10, textc);
}
static void media_ui_button_pill(const char *name, int x, int y, int width) {
  int id = !strcmp(name,"DIR") ? 0 : !strcmp(name,"SELECT") ? 6 :
           !strcmp(name,"START") ? 7 : !strcmp(name,"L1") ? 10 :
           !strcmp(name,"L2") ? 11 : !strcmp(name,"R1") ? 12 :
           !strcmp(name,"R2") ? 13 : -1;
  if (id>=0 && kp_sprite(KP_SPR_BUTTONS,id,x+(width-22)/2,y-2,22,22)) return;
  rounded(x, y, width, 18, 7, elevated);
  centered(name, x + 2, y + 4, width - 4, 9, textc);
}
static void media_ui_next_track(char *out, size_t size) {
  if (!size)
    return;
  if (!queue_count || queue_index + 1 >= queue_count ||
      !queue_paths[queue_index + 1]) {
    snprintf(out, size, "%s", tr("Fim da fila"));
    return;
  }
  const char *path = queue_paths[queue_index + 1];
  const char *name = strrchr(path, '/');
  name = name ? name + 1 : path;
  snprintf(out, size, "%s", name);
  char *dot = strrchr(out, '.');
  if (dot && dot != out)
    *dot = 0;
}
static void draw_music_transport(void) {
  /* Symmetric 184 | 240 | 184 layout so center transport sits at exact x=320. */
  const int x = 16, y = 374, w = 608, h = 100, left = 184, center = 240;
  panel_card(x, y, w, h, 16);
  rect(x + left, y + 9, 1, 40, hairline());
  rect(x + left + center, y + 9, 1, 40, hairline());
  rect(x + 12, y + 57, w - 24, 1, hairline());

  /* Left column: Up Next badge + title */
  rounded(x + 10, y + 10, 38, 38, 10, mix(elevated, accent, 0.16f));
  triangle(x + 25, y + 23, 13, accent);
  const int info = x + 56, info_width = left - 64;
  label(tr("A SEGUIR"), info, y + 12, 9, accent, info_width);
  char next_title[512];
  media_ui_next_track(next_title, sizeof(next_title));
  label(next_title, info, y + 27, 12, textc, info_width);

  /* Center column: dead-center Prev / Play-Pause / Next + Progress bar */
  int cx = x + left + center / 2, cy = y + 21;
  fill_circle(cx - 42, cy, 12, mix(elevated, textc, 0.05f));
  media_ui_skip(cx - 42, cy, false);
  fill_circle(cx + 42, cy, 12, mix(elevated, textc, 0.05f));
  media_ui_skip(cx + 42, cy, true);
  play_disc(cx, cy, 14, active && !paused);

  long long t = now_ms(), duration = duration_ms();
  double amount = media_ui_progress(t, duration);
  const int barw = 144, barx = cx - barw / 2, bary = y + 44;
  rounded(barx, bary, barw, 4, 2, track_color());
  int fill = (int)(barw * amount);
  if (fill > 0)
    rounded(barx, bary, fill > 4 ? fill : 4, 4, 2, accent);
  media_ui_circle(barx + fill, bary + 2, 4, textc);
  char current[32], total_time[32];
  time_string(t, current, sizeof(current));
  time_string(duration, total_time, sizeof(total_time));
  label(current, barx - (int)ceil(measure(current, 10)) - 6, y + 38, 10, muted,
        44);
  label(total_time, barx + barw + 6, y + 38, 10, muted, 44);

  /* Right column: Format pill + file size, vertically centered */
  char size[40];
  media_ui_format_filesize(media_size_bytes, media_size_known, size,
                           sizeof(size));
  int edge = x + w - 12, size_width = (int)ceil(measure(size, 11)),
      badge_width = (int)ceil(measure(media_format, 10)) + 14;
  int size_x = edge - size_width, badge_x = size_x - badge_width - 8;
  rounded(badge_x, y + 19, badge_width, 20, 10, mix(elevated, accent, 0.16f));
  centered(media_format, badge_x, y + 23, badge_width, 10, accent);
  label(size, size_x, y + 23, 11, textc, size_width);

  /* Bottom shortcut hints row */
  const int shortcuts_y = y + 78;
  media_ui_button_circle("A", x + 28, shortcuts_y);
  label(tr("Voltar"), x + 44, shortcuts_y - 6, 12, muted, 84);
  media_ui_button_circle("Y", x + 168, shortcuts_y);
  label(tr("Letras"), x + 184, shortcuts_y - 6, 12, muted, 84);
  media_ui_button_circle("X", x + 308, shortcuts_y);
  label(tr("Fila / Pasta"), x + 324, shortcuts_y - 6, 12, muted, 108);
  media_ui_button_pill("SELECT", x + 462, shortcuts_y - 9, 46);
  label(tr("Opções"), x + 516, shortcuts_y - 6, 12, muted, 80);
  if (SDL_GetTicks() < note_until) {
    glow_rect(30, 397, 580, 32, 16, accent, 4);
    rounded(30, 397, 580, 32, 16, elevated);
    centered(status_note, 40, 405, 560, 13, accent);
  }
}
