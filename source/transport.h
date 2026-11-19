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
                cx-12, cy-12, 24, 24)) return;
  color(muted);
  int dir = next ? 1 : -1;
  rect(cx + dir * 7 - 1, cy - 5, 2, 11, muted);
  for (int i = 0; i < 9; i++) {
    int x = cx - dir * 5 + dir * i, half = (8 - i) * 5 / 8;
    SDL_RenderDrawLine(renderer, x, cy - half, x, cy + half);
  }
}
static void media_ui_button_circle(const char *name, int cx, int cy) {
  int id = !strcmp(name,"A") ? 1 : !strcmp(name,"B") ? 2 :
           !strcmp(name,"X") ? 3 : !strcmp(name,"Y") ? 4 :
           !strcmp(name,"FN") ? 5 : -1;
  if (id>=0 && kp_sprite(KP_SPR_BUTTONS,id,cx-12,cy-12,24,24)) return;
  media_ui_circle(cx, cy, 9, elevated);
  centered(name, cx - 8, cy - 5, 16, 10, textc);
}
static void media_ui_button_pill(const char *name, int x, int y, int width) {
  int id = !strcmp(name,"DIR") ? 0 : !strcmp(name,"SELECT") ? 6 :
           !strcmp(name,"START") ? 7 : !strcmp(name,"L1") ? 10 :
           !strcmp(name,"L2") ? 11 : !strcmp(name,"R1") ? 12 :
           !strcmp(name,"R2") ? 13 : -1;
  if (id>=0 && kp_sprite(KP_SPR_BUTTONS,id,x+(width-26)/2,y-4,26,26)) return;
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
  const int x = 16, y = 374, w = 608, h = 100, left = 207, center = 219;
  panel_card(x, y, w, h, 16);
  rect(x + left, y + 8, 1, 42, hairline());
  rect(x + left + center, y + 8, 1, 42, hairline());
  rect(x + 12, y + 57, w - 24, 1, hairline());
  rounded(x + 8, y + 7, 42, 42, 12, mix(elevated, accent, 0.18f));
  triangle(x + 23, y + 19, 16, accent);
  const int info = x + 58, info_width = left - 62;
  label(tr("A SEGUIR"), info, y + 6, 9, accent, info_width);
  char next_title[512];
  media_ui_next_track(next_title, sizeof(next_title));
  label(next_title, info, y + 23, 12, textc, info_width);
  int cx = x + left + center / 2, cy = y + 16;
  media_ui_skip(cx - 29, cy, false);
  media_ui_skip(cx + 29, cy, true);
  play_disc(cx, cy, 14, active && !paused);
  long long t = now_ms(), duration = duration_ms();
  double amount = media_ui_progress(t, duration);
  const int barw = center - 86, barx = cx - barw / 2, bary = y + 40;
  rounded(barx, bary, barw, 4, 2, track_color());
  int fill = (int)(barw * amount);
  if (fill)
    rect(barx, bary, fill, 4, accent);
  media_ui_circle(barx + fill, bary + 2, 4, textc);
  char current[32], total_time[32];
  time_string(t, current, sizeof(current));
  time_string(duration, total_time, sizeof(total_time));
  label(current, barx - (int)ceil(measure(current, 10)) - 6, y + 33, 10, muted,
        44);
  label(total_time, barx + barw + 6, y + 33, 10, muted, 44);
  char size[40];
  media_ui_format_filesize(media_size_bytes, media_size_known, size,
                           sizeof(size));
  int edge = x + w - 10, size_width = (int)ceil(measure(size, 11)),
      badge_width = (int)ceil(measure(media_format, 11)) + 12;
  int size_x = edge - size_width, badge_x = size_x - badge_width - 6;
  rounded(badge_x, y + 7, badge_width, 19, 9, mix(elevated, accent, 0.15f));
  label(media_format, badge_x + 6, y + 10, 11, accent, badge_width - 12);
  label(size, size_x, y + 10, 11, textc, size_width);
  const int shortcuts_y = y + 78;
  media_ui_button_circle("A", x + 24, shortcuts_y);
  label(tr("Voltar"), x + 39, shortcuts_y - 6, 12, muted, 75);
  media_ui_button_circle("Y", x + 150, shortcuts_y);
  label(tr("Letras"), x + 165, shortcuts_y - 6, 12, muted, 75);
  media_ui_button_circle("X", x + 276, shortcuts_y);
  label(tr("Fila / Pasta"), x + 291, shortcuts_y - 6, 12, muted, 100);
  media_ui_button_pill("SELECT", x + 424, shortcuts_y - 9, 52);
  label(tr("Opções"), x + 486, shortcuts_y - 6, 12, muted, 90);
  if (SDL_GetTicks() < note_until) {
    glow_rect(30, 397, 580, 32, 16, accent, 4);
    rounded(30, 397, 580, 32, 16, elevated);
    centered(status_note, 40, 405, 560, 13, accent);
  }
}
