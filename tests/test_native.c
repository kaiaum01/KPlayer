#define main kplayer_application_main
#include "../source/kplayer.c"
#undef main
#undef NDEBUG
#include <assert.h>
static void test_video(unsigned iw, unsigned ih, unsigned ew, unsigned eh) {
  unsigned pitch = 0, lines = 0;
  char chroma[4];
  void *opaque = NULL, *planes[1];
  assert(format_video(&opaque, chroma, &iw, &ih, &pitch, &lines) == 1);
  assert(iw == ew && ih == eh && pitch >= iw * 4 && pitch % 32 == 0 &&
         lines == ih);
  assert(!memcmp(chroma, "RV32", 4));
  assert((uintptr_t)video.pixels % 32 == 0);
  void *p = lock_video(NULL, planes);
  assert(planes[0] == video.pixels);
  memset(planes[0], 0x55, (size_t)pitch * lines);
  unlock_video(NULL, p, planes);
  assert(video.ready);
  cleanup_video(NULL);
  assert(!video.ready);
}
int main(void) {
  /* Timestamp parsing, multiple timestamps, offset and folder-independent
   * queue. */
  FILE *fixture = fopen("sync.lrc", "w");
  assert(fixture);
  fputs("[ar:Artist]\n[offset:500]\n[00:02.50][00:04.00]Second\n[00:01.00]"
        "First\n",
        fixture);
  fclose(fixture);
  load_lyrics("sync.mp3");
  assert(lyric_count == 3 && lyrics[0].time == 1000 && lyrics[2].time == 4000);
  preview_mode = true;
  preview_now = 2100;
  assert(current_lyric() == 1);
  preview_now = 0;
  assert(current_lyric() == -1);
  preview_mode = false;
  remove("sync.lrc");
  char bytes[40];
  media_ui_format_filesize(0, false, bytes, sizeof(bytes));
  assert(!strcmp(bytes, "-- MB"));
  media_ui_format_filesize(0, true, bytes, sizeof(bytes));
  assert(!strcmp(bytes, "0 KB"));
  media_ui_format_filesize(1, true, bytes, sizeof(bytes));
  assert(!strcmp(bytes, "1 KB"));
  media_ui_format_filesize(512 * 1024, true, bytes, sizeof(bytes));
  assert(!strcmp(bytes, "512 KB"));
  media_ui_format_filesize(1024 * 1024, true, bytes, sizeof(bytes));
  assert(!strcmp(bytes, "1.0 MB"));
  assert(media_ui_progress(-20, 100) == 0 && media_ui_progress(200, 100) == 1 &&
         media_ui_progress(40, 0) == 0 && media_ui_progress(25, 100) == .25);
  char detected_location[96];
  int detected_offset = 0;
  assert(network_parse_location(
      "{\"status\":\"success\",\"city\":\"Umuarama\",\"region\":\"PR\","
      "\"countryCode\":\"BR\",\"offset\":-10800}",
      detected_location, sizeof(detected_location), &detected_offset));
  assert(!strcmp(detected_location, "Umuarama, PR") &&
         detected_offset == -10800);
  assert(!network_parse_location(
      "{\"status\":\"fail\",\"city\":\"\",\"region\":\"\","
      "\"countryCode\":\"\",\"offset\":0}",
      detected_location, sizeof(detected_location), &detected_offset));
  RadioStation parsed_radio[2];
  int parsed_count = radio_parse_stations(
      "[{\"stationuuid\":\"abc\",\"name\":\"Rádio Teste\","
      "\"url\":\"http://old\",\"url_resolved\":\"http://stream\","
      "\"tags\":\"pop,brasil\",\"country\":\"Brazil\","
      "\"codec\":\"MP3\",\"bitrate\":128,"
      "\"favicon\":\"https://example.org/radio.png\"}]",
      parsed_radio, 2);
  assert(parsed_count == 1 && !strcmp(parsed_radio[0].name, "Rádio Teste") &&
         !strcmp(parsed_radio[0].url, "http://stream") &&
         parsed_radio[0].bitrate == 128 &&
         !strcmp(parsed_radio[0].favicon, "https://example.org/radio.png"));
  char radio_dir[] = "/tmp/kplayer-user-radio-XXXXXX";
  assert(mkdtemp(radio_dir));
  char radio_file[512];
  snprintf(radio_file, sizeof(radio_file), "%s/Ilha.pls", radio_dir);
  FILE *rf = fopen(radio_file, "wb");
  assert(rf); fputs("[Playlist]\nFile1=http://cast.suaradionanet.net:13325/stream\n", rf); fclose(rf);
  char radio_asx[512];
  snprintf(radio_asx, sizeof(radio_asx), "%s/Teste.asx", radio_dir);
  rf = fopen(radio_asx, "wb"); assert(rf);
  fputs("<ASX><ENTRY><REF HREF=\"https://example.org/live?a=1&amp;b=2\"/></ENTRY></ASX>\n", rf); fclose(rf);
  char radio_m3u[512];
  snprintf(radio_m3u, sizeof(radio_m3u), "%s/Lista.m3u", radio_dir);
  rf = fopen(radio_m3u, "wb"); assert(rf);
  fputs("#EXTM3U\n#EXTINF:-1,Station\nhttps://example.org/audio\n", rf); fclose(rf);
  RadioStation user_radios[4];
  int user_count = radio_read_user_folder(radio_dir, user_radios, 4);
  assert(user_count == 3);
  int found_pls = 0, found_asx = 0, found_m3u = 0;
  for (int i = 0; i < user_count; i++) {
    found_pls |= !strcmp(user_radios[i].url, "http://cast.suaradionanet.net:13325/stream");
    found_asx |= !strcmp(user_radios[i].url, "https://example.org/live?a=1&b=2");
    found_m3u |= !strcmp(user_radios[i].url, "https://example.org/audio");
  }
  assert(found_pls && found_asx && found_m3u);
  char iptv_file[512];
  snprintf(iptv_file, sizeof(iptv_file), "%s/tv.m3u", radio_dir);
  rf = fopen(iptv_file, "wb"); assert(rf);
  fputs("#EXTM3U\n#EXTINF:-1 tvg-id=\"test\" tvg-logo=\"https://example.org/logo.png\" group-title=\"Notícias\",Canal Teste\nhttps://example.org/live.m3u8\n#EXTINF:-1,Outro\nhttp://example.org/tv\nlocal.mp4\n", rf);
  fclose(rf);
  IptvChannel channels[4] = {0};
  assert(iptv_read_list(iptv_file, channels, 0, 4) == 2);
  assert(!strcmp(channels[0].name, "Canal Teste") && !strcmp(channels[0].url, "https://example.org/live.m3u8"));
  assert(!strcmp(channels[0].id, "test") && !strcmp(channels[0].logo, "https://example.org/logo.png") && !strcmp(channels[0].group, "Notícias"));
  assert(!channels[1].logo[0] && !channels[1].group[0] && !channels[1].id[0]);
  assert(!strcmp(channels[1].name, "Outro"));
  assert(unlink(iptv_file) == 0);
  assert(unlink(radio_file) == 0 && unlink(radio_asx) == 0 && unlink(radio_m3u) == 0);
  assert(rmdir(radio_dir) == 0);
  /* Exercise successful and failed catalogue downloads without network. */
  char test_cwd[PATH_MAX], fetch_dir[] = "/tmp/kplayer-iptv-XXXXXX";
  assert(getcwd(test_cwd, sizeof(test_cwd)) && mkdtemp(fetch_dir));
  assert(chdir(fetch_dir) == 0 && mkdir("iptv", 0755) == 0);
  rf = fopen("curl", "w"); assert(rf);
  fputs("#!/bin/sh\nout=\nwhile [ $# -gt 0 ]; do\n"
        "  if [ \"$1\" = --output ]; then shift; out=$1; fi\n  shift\ndone\n"
        "if [ \"$KP_TEST_FAIL\" = 1 ]; then exit 1; fi\n"
        "printf '#EXTM3U\\n#EXTINF:-1,Free Test\\nhttps://example.org/live.m3u8\\n' > \"$out\"\n", rf);
  fclose(rf); assert(chmod("curl", 0755) == 0);
  const char *old_path = getenv("PATH");
  char *saved_path = old_path ? strdup(old_path) : NULL;
  assert(setenv("PATH", fetch_dir, 1) == 0);
  unsetenv("KP_TEST_FAIL");
  iptv_fetch_worker((void *)(intptr_t)1);
  assert(iptv_fetch_ok && iptv_read_list(IPTV_BR_CACHE, channels, 0, 4) == 1);
  assert(!strcmp(channels[0].name, "Free Test"));
  assert(setenv("KP_TEST_FAIL", "1", 1) == 0);
  iptv_fetch_worker((void *)(intptr_t)1);
  assert(!iptv_fetch_ok && iptv_read_list(IPTV_BR_CACHE, channels, 0, 4) == 1);
  unsetenv("KP_TEST_FAIL");
  iptv_fetch_worker((void *)(intptr_t)2);
  assert(iptv_fetch_ok && iptv_read_list(IPTV_WORLD_CACHE, channels, 0, 4) == 1);
  if (saved_path) { assert(setenv("PATH", saved_path, 1) == 0); free(saved_path); }
  else unsetenv("PATH");
  assert(unlink(IPTV_BR_CACHE) == 0 && unlink(IPTV_WORLD_CACHE) == 0 && rmdir("iptv") == 0 && unlink("curl") == 0);
  assert(chdir(test_cwd) == 0 && rmdir(fetch_dir) == 0);
  char original_dir[PATH_MAX], theme_dir[] = "/tmp/kplayer-theme-XXXXXX";
  assert(getcwd(original_dir, sizeof(original_dir)) && mkdtemp(theme_dir));
  assert(chdir(theme_dir) == 0);
  apply_theme(2);
  save_settings();
  apply_theme(0);
  load_settings();
  assert(theme_index == 2 && bg.r == 248 && textc.r == 20);
  FILE *old_settings = fopen("settings.cfg", "w");
  assert(old_settings);
  fputs("KPLAYER_SETTINGS 2\nfit 0\nloop 0\nrate 1.00\n", old_settings);
  fclose(old_settings);
  load_settings();
  assert(theme_index == 0);
  RadioStation favorite_station = {0}, saved_stations[2];
  snprintf(favorite_station.name, sizeof(favorite_station.name), "%s", "Rádio teste");
  snprintf(favorite_station.url, sizeof(favorite_station.url), "%s", "https://example.org/stream");
  assert(radio_toggle_favorite(&favorite_station));
  assert(radio_load_favorites(saved_stations, 2) == 1);
  assert(!strcmp(saved_stations[0].url, favorite_station.url));
  assert(radio_toggle_favorite(&favorite_station));
  assert(radio_load_favorites(saved_stations, 2) == 0);
  assert(unlink("radio-favorites.tsv") == 0);
  assert(unlink("settings.cfg") == 0);
  assert(chdir(original_dir) == 0 && rmdir(theme_dir) == 0);
  char t[32];
  time_string(-1, t, sizeof(t));
  assert(!strcmp(t, "00:00"));
  time_string(3661000, t, sizeof(t));
  assert(!strcmp(t, "1:01:01"));
  assert(supported("TEST.MP4") && !supported("movie.txt") &&
         audio_file("music.FLAC"));
  test_video(1920, 1080, 640, 360);
  test_video(1080, 1920, 270, 480);
  test_video(640, 480, 640, 480);
  test_video(0, 0, 640, 480);
  if (!load_sdl())
    return 1;
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "1");
  assert(SDL_Init(SDL_INIT_VIDEO) == 0);
  window = SDL_CreateWindow("test", 0, 0, W, H, 0);
  assert(window);
  renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
  assert(renderer);
  assert(load_font());
  snprintf(radio_current_station.url, sizeof(radio_current_station.url), "%s", "http://example.invalid/stream");
  radio_cancel_retries();
  for (int i = 1; i <= 3; i++) {
    radio_schedule_retry();
    assert(radio_retry_waiting && radio_retry_count == i);
  }
  radio_schedule_retry();
  assert(!radio_retry_waiting && radio_retry_count == 3);
  radio_cancel_retries();
  assert(!radio_retry_waiting && radio_retry_count == 0);
  radio_current_station.url[0] = 0;
  /* The uploaded MP3 is external test data, never bundled with the release. */
  const char *sample = getenv("KPLAYER_TEST_MP3");
  if (sample) {
    LocalTags tags;
    read_local_tags(sample, &tags);
    assert(!strcmp(tags.title,
                   "Get Lucky (feat. Pharrell Williams and Nile Rodgers)"));
    assert(!strcmp(tags.artist, "Daft Punk, Pharrell Williams, Nile Rodgers"));
    assert(!strcmp(tags.album, "Random Access Memories"));
    assert(tags.picture && tags.picture_size == 98617 && tags.lyrics);
    free_local_tags(&tags);
    load_lyrics(sample);
    load_cover(sample);
    apply_local_metadata(sample);
    assert(local_title && local_artist && local_album && cover_texture &&
           cover_w > 0 && cover_h > 0);
    assert(lyric_count == 77 && embedded_lyrics && plain_count == 0);
    preview_mode = true;
    preview_now = 35000;
    assert(current_lyric() >= 0);
    preview_mode = false;
  }
  char decoded[512];
  const unsigned char utf16[] = {255, 254,  'C',  0, 0xe9,
                                 0,   0x3d, 0xd8, 0, 0xde};
  tag_text(utf16, sizeof(utf16), 1, decoded, sizeof(decoded));
  assert(!strcmp(decoded, "Cé😀"));
  const unsigned char latin[] = {'C', 0xe9};
  tag_text(latin, sizeof(latin), 0, decoded, sizeof(decoded));
  assert(!strcmp(decoded, "Cé"));
  lyric_count = 0;
  plain_count = 0;
  load_embedded_lyrics("First line\nSecond line");
  assert(plain_count == 2 && lyric_count == 0);
  plain_count = 0;
  load_lyrics("no-file.mp3");
  /* First-run completion must survive restart; exit/terms must not complete it.
   */
  char prefdir[] = "/tmp/kplayer-preferences-XXXXXX";
  assert(mkdtemp(prefdir));
  char prefpath[256];
  snprintf(prefpath, sizeof(prefpath), "%s/preferences.cfg", prefdir);
  const char *saved_preferences_path = preferences_path;
  preferences_path = prefpath;
  load_preferences();
  assert(!onboarding_done && language == 0);
  mode = 5;
  key(SDLK_RIGHT, false);
  assert(language == 1);
  key(SDLK_m, false);
  assert(mode == 6 && terms_return == 5);
  key(SDLK_RIGHT, false);
  assert(terms_page == 1);
  key(SDLK_RETURN, false);
  assert(!onboarding_done && access(prefpath, F_OK) != 0);
  key(SDLK_BACKSPACE, false);
  assert(mode == 5 && language == 1);
  key(SDLK_TAB, false);
  key(SDLK_F1, false);
  assert(mode == 2 && return_mode == 5 && !onboarding_done);
  key(SDLK_F1, false);
  assert(mode == 5 && !onboarding_done);
  key(SDLK_ESCAPE, false);
  assert(!running && access(prefpath, F_OK) != 0);
  running = 1;
  key(SDLK_RETURN, true);
  assert(!onboarding_done);
  preferences_path = "/no-such-kplayer-directory/preferences.cfg";
  key(SDLK_RETURN, false);
  assert(mode == 5 && !onboarding_done);
  preferences_path = prefpath;
  key(SDLK_RETURN, false);
  assert(mode == 3 && onboarding_done);
  language = 0;
  onboarding_done = false;
  load_preferences();
  assert(language == 1 && onboarding_done);
  open_options();
  option = 5;
  key(SDLK_RIGHT, false);
  assert(language == 2);
  language = 0;
  load_preferences();
  assert(language == 2 && onboarding_done);
  option = 6;
  key(SDLK_RETURN, false);
  assert(mode == 6 && terms_return == 2);
  key(SDLK_BACKSPACE, false);
  assert(mode == 2);
  FILE *broken = fopen(prefpath, "w");
  assert(broken);
  fputs("KPLAYER_PREFS 1\nlanguage 9\nonboarding 1\n", broken);
  fclose(broken);
  load_preferences();
  assert(!onboarding_done && language == 0);
  unlink(prefpath);
  rmdir(prefdir);
  preferences_path = saved_preferences_path;
  for (int lang = 0; lang < 3; lang++) {
    language = lang;
    draw_welcome();
    assert(measure(tr("Y  Termos de uso"), 13) <= 178);
    for (int page = 0; page < 3; page++) {
      terms_page = page;
      assert(wrapped(tr(terms_text[page]), 38, 169, 560, 16, 26, 8, textc) > 0);
      draw_terms();
    }
    draw_home();
    radio_count = 0;
    radio_loading = false;
    draw_radio();
    draw_music();
    draw_options();
  }
  language = 0;
  onboarding_done = false;
  mode = 3;
  note_until = 0;
  assert(stbtt_FindGlyphIndex(&font, 0xe7));
  assert(measure("Vídeo", 20) > 0);
  snprintf(folder, sizeof(folder), "midias");
  mode = 3;
  dash_focus = 0;
  key(SDLK_RIGHT, false);
  assert(dash_focus == 1);
  key(SDLK_RETURN, false);
  assert(mode == 0 && category == 2 && automatic_view);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3 && !automatic_view);
  /* Storage navigation uses actual temporary folders, never /roms on the host.
   */
  char temp[] = "/tmp/kplayer-storage-XXXXXX";
  assert(mkdtemp(temp));
  char card1[256], card2[256], nested[300], linkdir[300], track[340],
      movie[340], automatic_track[340];
  snprintf(card1, sizeof(card1), "%s/roms", temp);
  snprintf(card2, sizeof(card2), "%s/roms2", temp);
  snprintf(nested, sizeof(nested), "%s/Musicas", card2);
  snprintf(linkdir, sizeof(linkdir), "%s/Atalho", card1);
  snprintf(track, sizeof(track), "%s/Teste.mp3", nested);
  snprintf(movie, sizeof(movie), "%s/Teste.mp4", nested);
  snprintf(automatic_track, sizeof(automatic_track), "%s/Grande.flac", nested);
  assert(!mkdir(card1, 0700) && !mkdir(card2, 0700) && !mkdir(nested, 0700));
  FILE *media = fopen(track, "w");
  assert(media);
  assert(fputs("testdata", media) >= 0);
  fclose(media);
  media = fopen(movie, "w");
  assert(media);
  fclose(media);
  assert(!symlink(nested, linkdir));
  const char *old1 = location_paths[1], *old2 = location_paths[2];
  location_paths[1] = card1;
  location_paths[2] = card2;
  category = 1;
  show_locations();
  assert(location_available[1] && location_available[2]);
  location_selected = 2;
  key(SDLK_RETURN, false);
  assert(!locations_view && !strcmp(folder, card2) && total == 1 &&
         items[0].dir);
  key(SDLK_RETURN, false);
  assert(!strcmp(folder, nested) && total == 1 && audio_file(items[0].name));
  key(SDLK_RIGHT, false);
  assert(category == 2 && total == 1 && !audio_file(items[0].name));
  key(SDLK_BACKSPACE, false);
  assert(!strcmp(folder, card2));
  key(SDLK_BACKSPACE, false);
  assert(locations_view && mode == 0);
  location_selected = 1;
  key(SDLK_RETURN, false);
  assert(total == 1 && items[0].dir);
  key(SDLK_RETURN, false);
  assert(!strcmp(folder, nested));
  show_locations();
  location_selected = 3;
  key(SDLK_RETURN, false);
  assert(!strcmp(folder, "/"));
  key(SDLK_BACKSPACE, false);
  assert(locations_view);
  location_paths[2] = "/this-path-does-not-exist-kplayer";
  location_selected = 2;
  key(SDLK_RETURN, false);
  assert(locations_view && !location_available[2]);
  location_paths[1] = old1;
  location_paths[2] = old2;

  /* Automatic media search is recursive and excludes files below 50 KB. */
  FILE *large = fopen(automatic_track, "wb");
  assert(large);
  assert(!fseek(large, 60 * 1024 - 1, SEEK_SET) && fputc(0, large) != EOF);
  fclose(large);
  const char *auto0 = automatic_roots[0], *auto1 = automatic_roots[1],
             *auto2 = automatic_roots[2];
  automatic_roots[0] = card2;
  automatic_roots[1] = "/this-path-does-not-exist-kplayer";
  automatic_roots[2] = "/this-path-does-not-exist-kplayer";
  category = 1;
  scan_automatic_media();
  assert(automatic_view && total == 1 &&
         !strcmp(items[0].name, "Grande.flac") && items[0].size >= 60 * 1024 &&
         !strcmp(items[0].path, automatic_track));
  favorites[0] = media_hash_path(automatic_track);
  favorite_count = 1;
  option = 13;
  change_option(1);
  assert(favorites_view && mode == 0 && total == 1 &&
         !strcmp(items[0].path, automatic_track));
  favorites[0] = media_hash_path("/unrelated.mp3");
  scan_automatic_media();
  assert(favorites_view && total == 0);
  favorites_view = false;
  favorite_count = 0;
  char playlist[340];
  snprintf(playlist, sizeof(playlist), "%s/lista.m3u", nested);
  FILE *pl = fopen(playlist, "wb");
  assert(pl);
  fputs("#EXTM3U\nGrande.flac\nhttps://example.org/stream\nmissing.mp3\n", pl);
  fclose(pl);
  assert(load_local_playlist(playlist));
  assert(queue_count == 1 && !strcmp(queue_paths[0], automatic_track));
  clear_queue();
  assert(!unlink(playlist));
  automatic_roots[0] = auto0;
  automatic_roots[1] = auto1;
  automatic_roots[2] = auto2;
  clear_items();
  unlink(automatic_track);
  assert(scan_music_folder(card2));
  audio_panel = 2;
  mode = 4;
  assert(music_total == 1 && music_entries[0].dir);
  key(SDLK_RETURN, false);
  assert(!strcmp(music_folder, nested) && music_total == 1 &&
         !music_entries[0].dir);
  assert(music_entries[0].size_bytes == 8);
  media_ui_read_file_info(track);
  assert(media_size_known && media_size_bytes == 8 &&
         !strcmp(media_format, "MP3"));
  media_ui_read_file_info("/no-kplayer-such-file.flac");
  assert(!media_size_known && !media_size_bytes &&
         !strcmp(media_format, "FLAC"));
  build_music_queue();
  assert(queue_count == 1 && strstr(queue_paths[0], "Teste.mp3"));
  key(SDLK_BACKSPACE, false);
  assert(!strcmp(music_folder, card2) && mode == 4 && queue_count == 1);
  key(SDLK_SPACE, false);
  assert(audio_panel == 1 && queue_selected == queue_index);
  key(SDLK_SPACE, false);
  assert(audio_panel == 2);
  key(SDLK_m, false);
  assert(audio_panel == 0);
  key(SDLK_SPACE, false);
  assert(audio_panel == 1);
  mode = 2;
  option = 0;
  key(SDLK_DOWN, false);
  assert(option == 1);
  key(SDLK_UP, false);
  assert(option == 0);
  key(SDLK_SPACE, false);
  assert(option == 7 && option_group_for(option) == 1);
  key(SDLK_DOWN, false);
  assert(option == 13);
  key(SDLK_SPACE, false);
  assert(option == 5 && option_group_for(option) == 2);
  key(SDLK_SPACE, false);
  assert(option == 0 && option_group_for(option) == 0);
  option = 8;
  running = 1;
  key(SDLK_RETURN, false);
  assert(!running);
  running = 1;
  mode = 4;
  clear_queue();
  queue_count = 3;
  queue_index = 2;
  playing_audio = true;
  repeat_mode = 0;
  shuffle_enabled = false;
  assert(!queue_advance(1, true));
  repeat_mode = 2;
  assert(queue_advance(1, true) && queue_index == 0);
  repeat_mode = 1;
  assert(queue_advance(1, true) && queue_index == 0);
  repeat_mode = 0;
  shuffle_enabled = true;
  memset(shuffle_seen, 0, sizeof(shuffle_seen));
  shuffle_seen_count = 0;
  assert(queue_advance(1, true));
  assert(queue_advance(1, true));
  assert(!queue_advance(1, true));
  queue_count = 0;
  queue_index = 0;
  shuffle_enabled = false;
  repeat_mode = 0;
  clear_music_entries();
  music_folder[0] = 0;
  audio_panel = 0;
  mode = 0;
  locations_view = true;
  unlink(track);
  unlink(movie);
  unlink(linkdir);
  rmdir(nested);
  rmdir(card1);
  rmdir(card2);
  rmdir(temp);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3);
  locations_view = false;
  category = 0;
  snprintf(folder, sizeof(folder), "midias");
  note_until = 0;
  active = true;
  playing_audio = true;
  key(SDLK_SPACE, false);
  assert(mode == 4);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3 && active);
  active = false;
  clear_items();
  items[0] = (Item){strdup("a.mp3"), strdup("midias/a.mp3"), false, 1};
  items[1] = (Item){strdup("b.mp4"), strdup("midias/b.mp4"), false, 1};
  items[2] = (Item){strdup("c.flac"), strdup("midias/c.flac"), false, 1};
  total = 3;
  selected = 2;
  build_queue();
  assert(queue_count == 2 && queue_index == 1);
  queue_index = 0;
  char next_track[64];
  media_ui_next_track(next_track, sizeof(next_track));
  assert(!strcmp(next_track, "c"));
  queue_index = 1;
  media_ui_next_track(next_track, sizeof(next_track));
  assert(!strcmp(next_track, tr("Fim da fila")));
  clear_items();
  assert(strstr(queue_paths[1], "c.flac"));
  clear_queue();
  draw_home();
  assert(screenshot("../../home-test.bmp"));
  draw_menu();
  assert(screenshot("../../empty-native.bmp"));
  draw_options();
  assert(screenshot("../../options-native.bmp"));
  /* RGB colour order and aspect render: 16:9 frame, no mocked decoder claims.
   */
  unsigned w = 1920, h = 1080, pitch, lines;
  char chroma[4];
  void *opaque = NULL;
  assert(format_video(&opaque, chroma, &w, &h, &pitch, &lines));
  for (unsigned y = 0; y < h; y++)
    for (unsigned x = 0; x < w; x++) {
      unsigned char *p = video.pixels + y * pitch + x * 4;
      p[0] = x < w / 3 ? 0 : x < 2 * w / 3 ? 0 : 255;
      p[1] = x >= w / 3 && x < 2 * w / 3 ? 255 : 0;
      p[2] = x < w / 3 ? 255 : 0;
      p[3] = 0;
    }
  video.ready = true;
  show_osd = false;
  draw_video();
  assert(screenshot("../../video-native.bmp"));
  SDL_DestroyTexture(video_texture);
  video_texture = NULL;
  for (int i = 0; i < CACHE; i++) {
    free(cache[i].s);
    if (cache[i].texture)
      SDL_DestroyTexture(cache[i].texture);
  }
  free(fontdata);
  free(bolddata);
  if (cover_texture)
    SDL_DestroyTexture(cover_texture);
  clear_music_entries();
  free(video.pixels);
  SDL_DestroyRenderer(renderer);
  SDL_DestroyWindow(window);
  SDL_Quit();
  puts(
      "PASS: IP location parsing and clock fallback, recursive 50 KB media "
      "discovery, swapped A/B and SELECT settings, "
      "settings exit, file size, format badge, progress bounds, audio "
      "shortcuts, local "
      "ID3 metadata/art/lyrics, Unicode, audio panels/browser, "
      "first run persistence, language changes, terms navigation and "
      "layout, storage roots, folders, filters, symlinks, missing storage, LRC "
      "sync, navigation, persistent queue, time, extensions, video "
      "buffers, UTF-8 font, empty/options/video "
      "rendering");
  return 0;
}
