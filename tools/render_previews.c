/* Native UI screenshots with original illustrative fixtures; GPL-2.0-or-later.
 */
#define main kplayer_application_main
#include "../source/kplayer.c"
#undef main
static void save_view(const char *directory, const char *name) {
  char p[PATH_MAX];
  if (snprintf(p, sizeof(p), "%s/%s.bmp", directory, name) >= (int)sizeof(p) ||
      !screenshot(p)) {
    fprintf(stderr, "Preview failed: %s\n", name);
    exit(1);
  }
}
int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "Usage: render-previews OUTPUT_DIRECTORY\n");
    return 1;
  }
  if (!load_sdl() || SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) < 0)
    return 1;
  window = SDL_CreateWindow("KPlayer Beta previews", 0, 0, W, H, 0);
  if (!window)
    return 1;
  renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
  if (!renderer)
    return 1;
  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
  if (!load_font())
    return 1;
  preview_mode = true;
  preview_now = 35000;
  preview_duration = 195000;
  language = 0;
  draw_welcome();
  save_view(argv[1], "welcome");
  draw_home();
  save_view(argv[1], "dashboard");
  radio_count = 6;
  radio_selected = 1;
  radio_filter = 0;
  const char *radio_names[] = {"Rádio Nacional", "KPlayer FM",
                               "Jovem Pan News", "Rock Brasil",
                               "MPB ao Vivo", "Notícias 24h"};
  for (int i = 0; i < radio_count; i++) {
    snprintf(radio_stations[i].name, sizeof(radio_stations[i].name), "%s",
             radio_names[i]);
    snprintf(radio_stations[i].url, sizeof(radio_stations[i].url),
             "https://example.invalid/radio/%d", i);
    snprintf(radio_stations[i].tags, sizeof(radio_stations[i].tags),
             "%s", i == 1 ? "pop, brasil, hits" : "música, brasil");
    snprintf(radio_stations[i].country, sizeof(radio_stations[i].country),
             "Brazil");
    snprintf(radio_stations[i].codec, sizeof(radio_stations[i].codec), "MP3");
    radio_stations[i].bitrate = i == 1 ? 192 : 128;
  }
  draw_radio();
  save_view(argv[1], "radio-online");
  dash_focus = 3;
  draw_home();
  save_view(argv[1], "dashboard-radio");
  snprintf(current_path, sizeof(current_path), "%s", radio_stations[1].url);
  snprintf(title, sizeof(title), "%s", radio_stations[1].name);
  snprintf(artist, sizeof(artist), "%s", radio_stations[1].tags);
  snprintf(album, sizeof(album), "Rádio Online");
  snprintf(media_format, sizeof(media_format), "%.15s",
           radio_stations[1].codec);
  active = true;
  playing_audio = true;
  playing_radio = true;
  paused = false;
  draw_radio();
  save_view(argv[1], "radio-playing");
  save_view(argv[1], "radio-player-list");
  active = false;
  playing_audio = false;
  playing_radio = false;
  dash_focus = 0;
  snprintf(current_path, sizeof(current_path), "/roms2/music/Neon Horizon.mp3");
  snprintf(title, sizeof(title), "Neon Horizon");
  snprintf(artist, sizeof(artist), "KPlayer Demo");
  snprintf(album, sizeof(album), "Beta Sessions");
  lyrics[0] = (Lyric){0, "Cada caminho tem seu som"};
  lyrics[1] = (Lyric){30000, "A música segue com você"};
  lyrics[2] = (Lyric){60000, "E o dia ganha uma nova cor"};
  lyric_count = 3;
  const char *names[] = {"Neon Horizon.mp3", "Green Lights.flac",
                         "Small Adventures.ogg", "Night Ride.mp3"};
  for (int i = 0; i < 4; i++) {
    char p[512];
    snprintf(p, sizeof(p), "/roms2/music/%s", names[i]);
    queue_paths[i] = strdup(p);
  }
  queue_count = 4;
  queue_index = queue_selected = 0;
  media_size_bytes = 8000000;
  media_size_known = true;
  snprintf(media_format, sizeof(media_format), "MP3");
  media_sample_rate = 44100;
  media_channels = 2;
  media_bitrate_kbps = 320;
  active = true;
  playing_audio = true;
  paused = false;
  audio_panel = 0;
  draw_music();
  save_view(argv[1], "audio-lyrics");
  save_view(argv[1], "audio-metadata-next");
  audio_panel = 1;
  queue_selected = 1;
  draw_music();
  save_view(argv[1], "audio-queue");
  snprintf(music_folder, sizeof(music_folder), "/roms2/music");
  music_entries[0] = (MusicEntry){strdup("Albums"), true, 0};
  music_total = 1;
  for (int i = 0; i < 4; i++)
    music_entries[music_total++] = (MusicEntry){
        strdup(names[i]), false, 8000000u + (uint64_t)i * 2000000u};
  music_selected = 1;
  audio_panel = 2;
  draw_music();
  save_view(argv[1], "audio-folder");
  active = false;
  playing_audio = false;
  audio_panel = 0;
  mode = 3;
  locations_view = false;
  automatic_view = true;
  snprintf(folder, sizeof(folder), "/roms2/music");
  category = 1;
  total = 0;
  for (int i = 0; i < 4; i++)
    items[total++] = (Item){strdup(names[i]), strdup(names[i]), false,
                            9000000 + i * 1000000};
  selected = 0;
  draw_menu();
  save_view(argv[1], "library");
  /* These statuses are fixtures, not a probe of the build computer. */
  clear_items();
  automatic_view = false;
  locations_view = true;
  location_available[0] = location_available[1] = location_available[2] =
      location_available[3] = true;
  draw_menu();
  save_view(argv[1], "storage");
  locations_view = false;
  draw_options();
  save_view(argv[1], "settings");
  /* An original colour scene rendered through the same video texture path. */
  unsigned w = 640, h = 360, pitch, lines;
  void *opaque = NULL;
  char chroma[4];
  if (!format_video(&opaque, chroma, &w, &h, &pitch, &lines))
    return 1;
  for (unsigned y = 0; y < h; y++)
    for (unsigned x = 0; x < w; x++) {
      unsigned char *p = video.pixels + y * pitch + x * 4;
      p[0] = (unsigned char)(38 + y / 4);
      p[1] = (unsigned char)(45 + x / 6);
      p[2] = (unsigned char)(12 + y / 10);
      p[3] = 0;
    }
  video.ready = true;
  active = true;
  snprintf(media_name, sizeof(media_name), "KPlayer - visual demo.mp4");
  show_osd = true;
  draw_video();
  save_view(argv[1], "video");
  active = false;
  terms_page = 0;
  draw_terms();
  save_view(argv[1], "terms");
  language = 1;
  draw_welcome();
  save_view(argv[1], "welcome-en");
  draw_home();
  save_view(argv[1], "dashboard-en");
  language = 2;
  draw_welcome();
  save_view(argv[1], "welcome-es");
  SDL_Quit();
  puts("Native illustrative previews rendered.");
  return 0;
}
