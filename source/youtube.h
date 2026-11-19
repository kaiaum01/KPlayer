/* Native YouTube browser; network resolution happens outside the SDL thread. */
typedef struct { char id[12], title[192], channel[160]; SDL_Texture *thumb; } YoutubeItem;
static YoutubeItem youtube_items[20];
static int youtube_count, youtube_selected, youtube_offset, youtube_cursor;
static bool youtube_keyboard = true;
static bool youtube_download_menu;
static int youtube_download_selection;
static char youtube_query[81], youtube_message[100] = "Digite uma busca";
static const char youtube_keys[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 <OO";
static pthread_mutex_t youtube_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool youtube_busy, youtube_done, youtube_ok;
static int youtube_action;
static char youtube_request[128], youtube_output[65536];

static void *youtube_worker(void *unused) {
  (void)unused;
  int fds[2], status = 0; pid_t child, ret; bool ok = false;
  char action[8], request[128];
  pthread_mutex_lock(&youtube_mutex);
  snprintf(action, sizeof(action), "%s", youtube_action == 1 ? "search" : youtube_action == 2 ? "play" : youtube_action == 3 ? "video" : "audio");
  snprintf(request, sizeof(request), "%s", youtube_request);
  pthread_mutex_unlock(&youtube_mutex);
  char *args[] = {"python3", "./youtube_helper.py", action, request, NULL};
  youtube_output[0] = 0;
  if (pipe(fds) == 0) {
    posix_spawn_file_actions_t fa;
    posix_spawn_file_actions_init(&fa);
    posix_spawn_file_actions_adddup2(&fa, fds[1], STDOUT_FILENO);
    posix_spawn_file_actions_addclose(&fa, fds[0]);
    posix_spawn_file_actions_addclose(&fa, fds[1]);
    int rc = posix_spawnp(&child, "python3", &fa, NULL, args, environ);
    posix_spawn_file_actions_destroy(&fa);
    close(fds[1]);
    if (!rc) {
      size_t used = 0; char buf[2048]; ssize_t n;
      while ((n = read(fds[0], buf, sizeof(buf))) > 0) {
        size_t copy = (size_t)n;
        if (copy > sizeof(youtube_output) - 1 - used) copy = sizeof(youtube_output) - 1 - used;
        memcpy(youtube_output + used, buf, copy); used += copy;
      }
      youtube_output[used] = 0;
      do { ret = waitpid(child, &status, 0); } while (ret < 0 && errno == EINTR);
      ok = ret == child && WIFEXITED(status) && WEXITSTATUS(status) == 0;
    }
    close(fds[0]);
  }
  pthread_mutex_lock(&youtube_mutex); youtube_busy = false; youtube_done = true; youtube_ok = ok; pthread_mutex_unlock(&youtube_mutex);
  return NULL;
}
static void youtube_start(int action, const char *value) {
  pthread_mutex_lock(&youtube_mutex);
  if (youtube_busy) { pthread_mutex_unlock(&youtube_mutex); return; }
  youtube_action = action; snprintf(youtube_request, sizeof(youtube_request), "%s", value);
  youtube_busy = true; youtube_done = false; pthread_mutex_unlock(&youtube_mutex);
  pthread_t thread;
  if (!pthread_create(&thread, NULL, youtube_worker, NULL)) pthread_detach(thread);
  else { pthread_mutex_lock(&youtube_mutex); youtube_busy = false; youtube_done = true; youtube_ok = false; pthread_mutex_unlock(&youtube_mutex); }
}
static void youtube_poll(void) {
  pthread_mutex_lock(&youtube_mutex);
  bool done = youtube_done, ok = youtube_ok; int action = youtube_action; youtube_done = false;
  pthread_mutex_unlock(&youtube_mutex);
  if (!done) return;
  if (!ok) { snprintf(youtube_message, sizeof(youtube_message), "Falha. Verifique internet, espaço e compatibilidade."); return; }
  if (action == 1) {
    for (int i = 0; i < youtube_count; i++) { if (youtube_items[i].thumb) SDL_DestroyTexture(youtube_items[i].thumb); youtube_items[i].thumb = NULL; }
    youtube_count = youtube_selected = youtube_offset = 0;
    char *save = NULL;
    for (char *line = strtok_r(youtube_output, "\n", &save); line && youtube_count < 20; line = strtok_r(NULL, "\n", &save)) {
      if (strncmp(line, "ITEM\t", 5)) continue;
      char *id = line + 5, *name = strchr(id, '\t'); if (!name) continue; *name++ = 0;
      char *channel = strchr(name, '\t'); if (!channel) continue; *channel++ = 0;
      if (strlen(id) != 11) continue;
      YoutubeItem *item = &youtube_items[youtube_count++];
      snprintf(item->id, sizeof(item->id), "%s", id);
      snprintf(item->title, sizeof(item->title), "%s", name);
      snprintf(item->channel, sizeof(item->channel), "%s", channel);
      char path[128]; snprintf(path, sizeof(path), ".youtube-thumbnails/%.11s.jpg", item->id);
      int w = 0, h = 0, n = 0; unsigned char *pixels = NULL;
      if (stbi_info(path, &w, &h, &n) && w > 0 && h > 0 && w <= 1024 && h <= 1024)
        pixels = stbi_load(path, &w, &h, &n, 4);
      if (pixels && w > 0 && h > 0 && w <= 1024 && h <= 1024) {
        item->thumb = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, w, h);
        if (item->thumb) SDL_UpdateTexture(item->thumb, NULL, pixels, w * 4);
      }
      if (pixels) stbi_image_free(pixels);
    }
    snprintf(youtube_message, sizeof(youtube_message), youtube_count ? "%d resultados" : "Nenhum resultado", youtube_count);
  } else if (action >= 3) {
    snprintf(youtube_message, sizeof(youtube_message), "Download concluído: Arquivos / midias / Downloads");
    if (mode != 10) notify("Download concluído em midias/Downloads");
  } else if (mode == 10 && !strncmp(youtube_output, "URL\thttps://", 12)) {
    youtube_output[strcspn(youtube_output, "\r\n")] = 0;
    libvlc_media_t *media = libvlc_media_new_location(engine, youtube_output + 4);
    if (!media) { snprintf(youtube_message, sizeof(youtube_message), "Não foi possível abrir o vídeo"); return; }
    stop_media();
    libvlc_media_player_set_media(player, media); libvlc_media_release(media);
    if (libvlc_media_player_play(player) < 0) { snprintf(youtube_message, sizeof(youtube_message), "Falha ao reproduzir vídeo"); return; }
    snprintf(media_name, sizeof(media_name), "%s", youtube_items[youtube_selected].title);
    snprintf(title, sizeof(title), "%s", media_name);
    active = true; playing_audio = false; youtube_playing = true; mode = 1;
    osd_until = SDL_GetTicks() + 3000; show_osd = true;
  }
  memset(youtube_output, 0, sizeof(youtube_output));
}
static void youtube_open(void) { mode = 10; }
static void youtube_key(SDL_Keycode k) {
  pthread_mutex_lock(&youtube_mutex); bool busy = youtube_busy; pthread_mutex_unlock(&youtube_mutex);
  if (youtube_download_menu) {
    if (k == SDLK_BACKSPACE) youtube_download_menu = false;
    else if (k == SDLK_UP || k == SDLK_DOWN) youtube_download_selection = 1 - youtube_download_selection;
    else if (k == SDLK_RETURN) { youtube_download_menu = false; youtube_start(youtube_download_selection ? 4 : 3, youtube_items[youtube_selected].id); }
    return;
  }
  if (k == SDLK_BACKSPACE) { if (!youtube_keyboard) youtube_keyboard = true; else mode = 3; return; }
  if (busy) return;
  if (k == SDLK_m) { youtube_keyboard = !youtube_keyboard; return; }
  if (youtube_keyboard) {
    if (k == SDLK_LEFT) youtube_cursor = (youtube_cursor + 39) % 40;
    else if (k == SDLK_RIGHT) youtube_cursor = (youtube_cursor + 1) % 40;
    else if (k == SDLK_UP) youtube_cursor = (youtube_cursor + 30) % 40;
    else if (k == SDLK_DOWN) youtube_cursor = (youtube_cursor + 10) % 40;
    else if (k == SDLK_RETURN) {
      size_t n = strlen(youtube_query);
      if (youtube_cursor == 38 || youtube_cursor == 39) {
        if (n) { youtube_keyboard = false; youtube_start(1, youtube_query); }
      } else if (youtube_cursor == 37) { if (n) youtube_query[n-1] = 0; }
      else if (n < 80) { youtube_query[n] = youtube_keys[youtube_cursor]; youtube_query[n+1] = 0; }
    }
  } else if (k == SDLK_UP && youtube_selected >= 3) youtube_selected -= 3;
  else if (k == SDLK_DOWN && youtube_selected + 3 < youtube_count) youtube_selected += 3;
  else if (k == SDLK_LEFT && youtube_selected > 0) youtube_selected--;
  else if (k == SDLK_RIGHT && youtube_selected + 1 < youtube_count) youtube_selected++;
  else if (k == SDLK_SPACE && youtube_count) { youtube_download_selection = 0; youtube_download_menu = true; }
  else if (k == SDLK_RETURN && youtube_count) youtube_start(2, youtube_items[youtube_selected].id);
}
static void draw_youtube(void) {
  pthread_mutex_lock(&youtube_mutex); bool busy = youtube_busy; pthread_mutex_unlock(&youtube_mutex);
  backdrop(); draw_header("VÍDEOS ONLINE");
  label("Busca no YouTube", 24, 56, 23, textc, 400);
  rounded(24, 91, 592, 39, 7, panel); label(youtube_query[0] ? youtube_query : "Digite uma busca...", 36, 102, 15, textc, 560);
  if (youtube_keyboard) {
    for (int i = 0; i < 40; i++) {
      int x = 24 + (i % 10) * 59, y = 150 + (i / 10) * 49;
      rounded(x, y, 54, 43, 6, i == youtube_cursor ? accent : elevated);
      char s[4] = {youtube_keys[i], 0, 0, 0};
      if (i == 36) snprintf(s, sizeof(s), "_");
      if (i == 37) snprintf(s, sizeof(s), "<");
      if (i >= 38) snprintf(s, sizeof(s), "OK");
      centered(s, x, y + 13, 54, 16, i == youtube_cursor ? bg : textc);
    }
    label("_ espaço   < apagar   OK pesquisar", 25, 364, 13, muted, 580);
  } else {
    youtube_offset = (youtube_selected / 6) * 6;
    for (int cell = 0; cell < 6 && youtube_offset + cell < youtube_count; cell++) {
      int i = cell + youtube_offset, x = 24 + (cell % 3) * 199, y = 140 + (cell / 3) * 128;
      card(x, y, 190, 120, 10, i == youtube_selected, panel);
      SDL_Rect thumb = {x + 5, y + 5, 180, 75};
      if (youtube_items[i].thumb) SDL_RenderCopy(renderer, youtube_items[i].thumb, NULL, &thumb);
      else { rounded(thumb.x, thumb.y, thumb.w, thumb.h, 4, elevated); centered("▶", thumb.x, thumb.y + 25, thumb.w, 18, muted); }
      label(youtube_items[i].title, x + 6, y + 84, 12, textc, 178);
      label(youtube_items[i].channel, x + 6, y + 102, 10, muted, 178);
    }
  }
  label(busy ? (youtube_action >= 3 ? "Baixando... aguarde" : "Carregando... aguarde") : youtube_message, 24, 407, 12, accent, 580);
  const FooterHint hints[] = {{"DIR", "Navegar"}, {"B", "Abrir"}, {"X", "Baixar"}, {"Y", "Busca"}, {"A", "Voltar"}};
  footer_hints(hints, 5);
  if (youtube_download_menu) {
    panel_card(120, 151, 400, 166, 16);
    label("Baixar conteúdo", 138, 168, 19, textc, 360);
    const char *choices[] = {"Vídeo com som", "Somente áudio"};
    for (int i = 0; i < 2; i++) {
      rounded(138, 200 + i * 42, 364, 36, 6, i == youtube_download_selection ? accent : elevated);
      label(choices[i], 150, 209 + i * 42, 15, i == youtube_download_selection ? bg : textc, 330);
    }
  }
}
