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
  /* Exercise unlimited category-by-category IPTV & series workers without network. */
  char test_cwd[PATH_MAX], fetch_dir[] = "/tmp/kplayer-iptv-XXXXXX";
  assert(getcwd(test_cwd, sizeof(test_cwd)) && mkdtemp(fetch_dir));
  assert(chdir(fetch_dir) == 0 && mkdir("iptv", 0755) == 0 && mkdir("iptv_usuario", 0755) == 0);
  rf = fopen("python3", "w"); assert(rf);
  fputs("#!/bin/sh\n"
        "if [ \"$KP_TEST_FAIL\" = 1 ]; then exit 1; fi\n"
        "cmd=$2\n"
        "if [ \"$cmd\" = categories ]; then\n"
        "  printf 'all\\tTodos os canais\\t2\\ngrp:ESPORTES\\tESPORTES\\t2\\n' > \"$4\"\n"
        "elif [ \"$cmd\" = list ]; then\n"
        "  printf '#EXTM3U\\n#EXTINF:-1 tvg-id=\"series:T:1:Série • 2025 • 18 eps\" group-title=\"Séries em alta\",Terra da Máfia\\nkplayer-series://T/1\\n#EXTINF:-1 tvg-id=\"Canal\" group-title=\"ESPORTES\",Canal Teste\\nhttps://example.org/live.m3u8\\n' > \"$5\"\n"
        "elif [ \"$cmd\" = episodes ]; then\n"
        "  printf '#EXTM3U\\n#EXTINF:-1 tvg-id=\"Série • T01E01 • DUB\" group-title=\"Temporada 1\",Terra da Máfia — T01E01\\nhttps://example.org/ep1.mp4\\n' > \"$6\"\n"
        "fi\n", rf);
  fclose(rf); assert(chmod("python3", 0755) == 0);
  const char *old_path = getenv("PATH");
  char *saved_path = old_path ? strdup(old_path) : NULL;
  assert(setenv("PATH", fetch_dir, 1) == 0);
  unsetenv("KP_TEST_FAIL");
  IptvJobSpec *sp = calloc(1, sizeof(*sp));
  assert(sp);
  sp->job = IPTV_JOB_CATS; sp->source = 0;
  snprintf(sp->out_path, sizeof(sp->out_path), "iptv/.cats-canais.tsv");
  iptv_job_worker(sp);
  assert(iptv_fetch_ok && iptv_read_categories_tsv("iptv/.cats-canais.tsv") == 2);
  assert(!strcmp(iptv_cats[1].id, "grp:ESPORTES") && iptv_cats[1].count == 2);
  sp = calloc(1, sizeof(*sp));
  assert(sp);
  sp->job = IPTV_JOB_ITEMS; sp->source = 2;
  snprintf(sp->arg1, sizeof(sp->arg1), "shelf:Séries em alta");
  snprintf(sp->out_path, sizeof(sp->out_path), "iptv/.items-current.m3u8");
  iptv_job_worker(sp);
  assert(iptv_fetch_ok);
  int dyn_n = iptv_read_list_dyn("iptv/.items-current.m3u8", &iptv_channels, &iptv_cap);
  assert(dyn_n == 2 && !strcmp(iptv_channels[0].name, "Terra da Máfia"));
  char sltr[16] = "", ssh[32] = "";
  assert(iptv_parse_series_id(&iptv_channels[0], sltr, sizeof(sltr), ssh, sizeof(ssh)));
  assert(!strcmp(sltr, "T") && !strcmp(ssh, "1"));
  sp = calloc(1, sizeof(*sp));
  assert(sp);
  sp->job = IPTV_JOB_EPISODES; sp->source = 2;
  snprintf(sp->arg1, sizeof(sp->arg1), "T");
  snprintf(sp->arg2, sizeof(sp->arg2), "1");
  snprintf(sp->arg3, sizeof(sp->arg3), "Terra da Máfia");
  snprintf(sp->out_path, sizeof(sp->out_path), "iptv/.episodes-current.m3u8");
  iptv_job_worker(sp);
  assert(iptv_fetch_ok);
  int ep_n = iptv_read_list_dyn("iptv/.episodes-current.m3u8", &iptv_episodes, &iptv_ep_cap);
  assert(ep_n == 1 && !strcmp(iptv_episodes[0].group, "Temporada 1"));
  snprintf(iptv_kb_url, sizeof(iptv_kb_url), "https://");
  iptv_kb_append("tv.m3u8");
  assert(!strcmp(iptv_kb_url, "https://tv.m3u8"));
  iptv_kb_backspace();
  assert(!strcmp(iptv_kb_url, "https://tv.m3u"));
  if (saved_path) { assert(setenv("PATH", saved_path, 1) == 0); free(saved_path); }
  else unsetenv("PATH");
  unlink("iptv/.cats-canais.tsv");
  unlink("iptv/.items-current.m3u8");
  unlink("iptv/.episodes-current.m3u8");
  assert(rmdir("iptv") == 0 && rmdir("iptv_usuario") == 0 && unlink("python3") == 0);
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
  tutorial_done = false;
  key(SDLK_RETURN, false);
  /* First run opens Comandos tutorial (mode 12), then one-time Changelog (mode 14) before Home */
  assert(mode == 12 && onboarding_done && !tutorial_done);
  draw_tutorial();
  key(SDLK_RETURN, false);
  assert(mode == 14 && tutorial_done);
  draw_changelog();
  key(SDLK_RETURN, false);
  assert(mode == 3 && !strcmp(seen_version, KPLAYER_VERSION));
  /* Second startup for same version skips changelog straight to Home */
  assert(strcmp(seen_version, KPLAYER_VERSION) == 0);
  /* Screensaver default timeout is 30 seconds (index 1) */
  assert(ss_timeout_idx == 1 && ss_timeout_secs[ss_timeout_idx] == 30);
  /* Weather-reactive Home hero copy: OFF -> false; ON -> true with climate & fun text */
  {
    char hbuf[96] = "", sbuf[160] = "";
    weather_data.valid = false;
    assert(!weather_home_hero_copy(hbuf, sizeof(hbuf), sbuf, sizeof(sbuf)));
    weather_data.valid = true;
    snprintf(weather_data.temp, sizeof(weather_data.temp), "19");
    weather_data.code = 61; /* chuva */
    weather_data.is_day = true;
    assert(weather_home_hero_copy(hbuf, sizeof(hbuf), sbuf, sizeof(sbuf)));
    assert(strstr(hbuf, "19") != NULL && sbuf[0] != 0);
    draw_home();
    weather_data.valid = false;
  }
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
    assert(measure(tr("Y  Termos de uso"), 11) <= 168);
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
  key(SDLK_RETURN, false);
  assert(mode == 0 && category == 0 && automatic_view);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3 && !automatic_view);
  key(SDLK_RIGHT, false);
  assert(dash_focus == 1);
  key(SDLK_RETURN, false);
  assert(mode == 16);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3);
  show_locations();
  assert(mode == 0 && locations_view);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3);
  /* Verify Notícias tile (index 4, right before Placar da Bola) & renderer */
  dash_focus = 4;
  mode = 15;
  news_count = 1;
  news_filter = 0;
  snprintf(news_articles[0].category, sizeof(news_articles[0].category), "breaking");
  snprintf(news_articles[0].cat_label, sizeof(news_articles[0].cat_label), "Urgente");
  snprintf(news_articles[0].title, sizeof(news_articles[0].title), "Teste de manchete nacional");
  snprintf(news_articles[0].source, sizeof(news_articles[0].source), "G1 Brasil");
  snprintf(news_articles[0].date, sizeof(news_articles[0].date), "23/11 08:30");
  snprintf(news_articles[0].summary, sizeof(news_articles[0].summary), "Resumo de teste sem listras.");
  snprintf(news_articles[0].body, sizeof(news_articles[0].body), "Corpo completo da notícia de teste.");
  snprintf(news_articles[0].image_path, sizeof(news_articles[0].image_path), ".news-thumbs/nonexistent.jpg");
  snprintf(news_articles[0].video_url, sizeof(news_articles[0].video_url), "https://cdn.example.com/news.mp4");
  assert(news_valid_thumb_path(".news-thumbs/abc12345.jpg"));
  assert(!news_valid_thumb_path("../etc/passwd"));
  assert(!news_valid_thumb_path(".news-thumbs/../secret.jpg"));
  assert(news_valid_http_url("https://cdn.example.com/news.mp4"));
  assert(!news_valid_http_url("file:///tmp/x.mp4"));
  news_selected = 0;
  news_offset = 0;
  news_detail_open = false;
  news_busy = false;
  draw_news();
  key(SDLK_RETURN, false);
  assert(news_detail_open);
  draw_news();
  key(SDLK_BACKSPACE, false);
  assert(!news_detail_open);
  key(SDLK_BACKSPACE, false);
  assert(mode == 3);
  news_clear_textures();
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
  const char *old3 = location_paths[3];
  location_paths[3] = "/";
  show_locations();
  location_selected = 3;
  key(SDLK_RETURN, false);
  assert(!strcmp(folder, "/"));
  key(SDLK_BACKSPACE, false);
  assert(locations_view);
  location_paths[3] = old3;
  location_paths[2] = "/this-path-does-not-exist-kplayer";
  location_selected = 2;
  key(SDLK_RETURN, false);
  assert(locations_view && !location_available[2]);
  location_paths[1] = old1;
  location_paths[2] = old2;

  /* Automatic media search uses dedicated audio/video folders and excludes files below 50 KB. */
  FILE *large = fopen(automatic_track, "wb");
  assert(large);
  assert(!fseek(large, 60 * 1024 - 1, SEEK_SET) && fputc(0, large) != EOF);
  fclose(large);
  const char *auto0 = automatic_roots[0].path, *auto1 = automatic_roots[1].path,
             *auto2 = automatic_roots[2].path, *auto3 = automatic_roots[3].path;
  automatic_roots[0].path = card2;
  automatic_roots[1].path = "/this-path-does-not-exist-kplayer";
  automatic_roots[2].path = "/this-path-does-not-exist-kplayer";
  automatic_roots[3].path = "/this-path-does-not-exist-kplayer";
  category = 1;
  favorites_view = false;
  clear_cached_media();
  media_preloaded = false;
  running = 1;
  scan_automatic_media();
  for (int wait_ms = 0; wait_ms < 2000; wait_ms += 10) {
    pthread_mutex_lock(&media_cache_mutex);
    bool still_scanning = media_scan_running;
    pthread_mutex_unlock(&media_cache_mutex);
    if (!still_scanning) break;
    SDL_Delay(10);
  }
  media_library_poll();
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
  automatic_roots[0].path = auto0;
  automatic_roots[1].path = auto1;
  automatic_roots[2].path = auto2;
  automatic_roots[3].path = auto3;
  clear_cached_media();
  media_preloaded = false;
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
  /* Contextual Options: Music (mode 4) opens OPT_SEC_MUSIC */
  open_options();
  assert(opt_section == OPT_SEC_MUSIC && option == 12);
  draw_options();
  key(SDLK_BACKSPACE, false);
  assert(mode == 4);
  /* Contextual Options: Video (mode 1) opens OPT_SEC_VIDEO */
  mode = 1;
  open_options();
  assert(opt_section == OPT_SEC_VIDEO && option == 0);
  key(SDLK_BACKSPACE, false);
  assert(mode == 1);
  /* Contextual Options: IPTV (mode 8) opens OPT_SEC_IPTV */
  mode = 8;
  open_options();
  assert(opt_section == OPT_SEC_IPTV && option == 50);
  key(SDLK_BACKSPACE, false);
  assert(mode == 8);
  /* Contextual Options: Radio (mode 7) opens OPT_SEC_RADIO */
  mode = 7;
  open_options();
  assert(opt_section == OPT_SEC_RADIO && option == 60);
  key(SDLK_BACKSPACE, false);
  assert(mode == 7);
  /* General Options from Home (mode 3) opens OPT_SEC_ROOT */
  mode = 3;
  open_options();
  assert(opt_section == OPT_SEC_ROOT && option == 18);
  /* Navigate to Audio em jogos (Teste previo) (27) and toggle + persist */
  opt_cursor = 1;
  opt_sync_option_id();
  assert(option == 27);
  bool prev_bg_audio = bg_audio_preview;
  key(SDLK_RIGHT, false);
  assert(bg_audio_preview != prev_bg_audio);
  save_settings();
  bg_audio_preview = prev_bg_audio;
  load_settings();
  assert(bg_audio_preview != prev_bg_audio);
  bg_audio_preview = false;
  save_settings();
  /* Navigate to Layout da tela inicial (24) and toggle */
  opt_cursor = 4;
  opt_sync_option_id();
  assert(option == 24);
  bool prev_inv = home_layout_inverted;
  key(SDLK_RIGHT, false);
  assert(home_layout_inverted != prev_inv);
  draw_home();
  home_layout_inverted = false;
  /* Navigate to Protetor de tela (25) -> opens OPT_SEC_SCREENSAVER */
  opt_cursor = 5;
  opt_sync_option_id();
  assert(option == 25);
  key(SDLK_RETURN, false);
  assert(opt_section == OPT_SEC_SCREENSAVER && option == 70);
  draw_options();
  int prev_ss = ss_timeout_idx;
  key(SDLK_RIGHT, false);
  assert(ss_timeout_idx != prev_ss);
  /* Test all 5 WMP visualizer styles + clock/weather + lyrics in mode 13 */
  ss_open(4);
  assert(mode == 13);
  for (int v = 0; v < SS_VIZ_COUNT; v++) {
    ss_viz_style = v;
    draw_screensaver();
  }
  key(SDLK_e, false);
  assert(mode == 13);
  key(SDLK_x, false);
  assert(mode == 13);
  key(SDLK_y, false);
  assert(mode == 13);
  key(SDLK_BACKSPACE, false);
  assert(mode == 4);
  mode = 2;
  opt_enter_section(OPT_SEC_ROOT);
  /* Navigate to Rever comandos (20) -> opens mode 12 tutorial */
  opt_cursor = 6;
  opt_sync_option_id();
  assert(option == 20);
  key(SDLK_RETURN, false);
  assert(mode == 12 && tutorial_from_options);
  draw_tutorial();
  key(SDLK_BACKSPACE, false);
  assert(mode == 2 && opt_section == OPT_SEC_ROOT);
  /* Verify penultimate is Verificar atualizacoes (19) and last is Sair (8) */
  assert(opt_root_ids[OPT_ROOT_COUNT - 2] == 19);
  assert(opt_root_ids[OPT_ROOT_COUNT - 1] == 8);
  opt_cursor = OPT_ROOT_COUNT - 2;
  opt_sync_option_id();
  assert(option == 19);
  key(SDLK_RETURN, false);
  assert(opt_section == OPT_SEC_UPDATE);
  kp_upd_progress = 64;
  kp_upd_applying = true;
  draw_options();
  kp_upd_applying = false;
  kp_upd_progress = 0;
  key(SDLK_BACKSPACE, false);
  assert(opt_section == OPT_SEC_ROOT);
  opt_cursor = OPT_ROOT_COUNT - 1;
  opt_sync_option_id();
  assert(option == 8);
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
  /* Button X on Home opens the Open-Meteo Weather App (asking IP vs Manual first) */
  weather_mode = WEATHER_MODE_UNSET;
  key(SDLK_SPACE, false);
  assert(mode == 11 && weather_view == WEATHER_VIEW_SETUP);
  draw_weather();
  key(SDLK_BACKSPACE, false);
  assert(mode == 3 && active);
  /* L1/R1 on Home jumps to active media player */
  key(SDLK_e, false);
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
  /* Verify v2.1.2 + v2.1.3 + v2.1.4 standalone File Manager helpers, editor, PDF, bg-audio handoff & rendering */
  assert(fm_is_archive_name("roms.zip"));
  assert(fm_is_archive_name("BACKUP.7Z"));
  assert(fm_is_archive_name("pacote.tar.gz"));
  assert(!fm_is_archive_name("musica.mp3"));
  assert(fm_is_pdf_name("Manual-R36S.pdf"));
  assert(fm_is_pdf_name("GUIDE.PDF"));
  assert(!fm_is_pdf_name("manual.txt"));
  assert(fm_is_text_name("gamelist.xml"));
  assert(fm_is_text_name("guia.html"));
  assert(fm_is_text_name("notas.txt"));
  assert(fm_is_script_name("IniciarJogo.sh"));
  assert(!fm_is_script_name("musica.mp3"));
  assert(fm_is_playlist_name("canais.m3u8"));
  assert(fm_is_playlist_name("lista.m3u"));
  assert(fm_is_radio_file("estacoes.pls", "/roms/radios/estacoes.pls"));
  assert(fm_is_protected_path("/"));
  assert(fm_is_protected_path("/roms"));
  assert(!fm_is_protected_path("/roms/bgmusic/album"));
  char fm_spd[32], fm_eta[32];
  fm_format_speed(2.5 * 1024.0 * 1024.0, fm_spd, sizeof(fm_spd));
  assert(strstr(fm_spd, "MB/s") != NULL);
  fm_format_eta(85, fm_eta, sizeof(fm_eta));
  assert(strcmp(fm_eta, "1m 25s") == 0);
  {
    char fm_tmp[] = "/tmp/kplayer-fm214-XXXXXX";
    assert(mkdtemp(fm_tmp));
    char f_txt[512], f_m3u8[512], f_pls[512], f_elf[512], f_bg[512];
    snprintf(f_txt, sizeof(f_txt), "%s/guia.html", fm_tmp);
    snprintf(f_m3u8, sizeof(f_m3u8), "%s/canais.m3u8", fm_tmp);
    snprintf(f_pls, sizeof(f_pls), "%s/radios.pls", fm_tmp);
    snprintf(f_elf, sizeof(f_elf), "%s/emulationstation", fm_tmp);
    snprintf(f_bg, sizeof(f_bg), "%s/bg-launch.json", fm_tmp);
    FILE *ff = fopen(f_txt, "wb");
    assert(ff);
    fputs("<html>\n<body>KPlayer</body>\n</html>\n", ff);
    fclose(ff);
    ff = fopen(f_m3u8, "wb");
    assert(ff);
    fputs("#EXTM3U\n#EXTINF:-1,Canal Teste\nhttps://example.org/stream.m3u8\n", ff);
    fclose(ff);
    ff = fopen(f_pls, "wb");
    assert(ff);
    fputs("[playlist]\nNumberOfEntries=1\nFile1=https://example.org/radio.mp3\nTitle1=Radio Teste\n", ff);
    fclose(ff);
    ff = fopen(f_elf, "wb");
    assert(ff);
    const unsigned char elf_hdr[8] = {0x7f, 'E', 'L', 'F', 2, 1, 1, 0};
    assert(fwrite(elf_hdr, 1, sizeof(elf_hdr), ff) == sizeof(elf_hdr));
    fclose(ff);
    assert(chmod(f_elf, 0755) == 0);
    assert(fm_is_executable_file(f_elf, S_IFREG | 0755));
    assert(!fm_is_executable_file(f_txt, S_IFREG | 0644));
    fm_ensure_buffers();

    /* v2.1.4 Background audio handoff JSON writer */
    assert(fm_write_bg_launch_json(f_bg, "/roms/ports/Celeste.sh", true, true,
                                   "radio", "https://example.org/radio.mp3",
                                   12000, 50, "Radio Teste"));
    FILE *fbg = fopen(f_bg, "rb");
    assert(fbg);
    char bg_buf[1024] = {0};
    size_t bg_n = fread(bg_buf, 1, sizeof(bg_buf) - 1, fbg);
    fclose(fbg);
    assert(bg_n > 20);
    assert(strstr(bg_buf, "\"bg_audio_enabled\": true") != NULL);
    assert(strstr(bg_buf, "\"media_type\": \"radio\"") != NULL);

    /* Native Text Editor open -> replace -> insert -> save -> render */
    assert(fm_ed_open(f_txt, "guia.html"));
    assert(fm_ed_count == 3 && strcmp(fm_ed_lines[1], "<body>KPlayer</body>") == 0);
    assert(fm_ed_replace_line(1, "<body>KPlayer v2.1.4</body>"));
    assert(fm_ed_insert_line(2, "<!-- ok -->"));
    assert(fm_ed_dirty && fm_ed_count == 4);
    assert(fm_ed_save());
    assert(!fm_ed_dirty);
    fm_view = FM_VIEW_EDITOR;
    draw_file_manager();
    fm_ed_free();

    /* Native Playlist & Radio parser -> render */
    assert(fm_parse_media_list(f_m3u8, "canais.m3u8", false));
    assert(fm_ml_count == 1 && strcmp(fm_ml_items[0].title, "Canal Teste") == 0);
    fm_view = FM_VIEW_MEDIA_LIST;
    draw_file_manager();
    assert(fm_parse_media_list(f_pls, "radios.pls", true));
    assert(fm_ml_count == 1 && strcmp(fm_ml_items[0].title, "Radio Teste") == 0);
    draw_file_manager();

    /* v2.1.4 Native PDF Viewer render smoke test */
    snprintf(fm_pdf_name, sizeof(fm_pdf_name), "Manual.pdf");
    snprintf(fm_pdf_title, sizeof(fm_pdf_title), "Manual KPlayer v2.1.4");
    snprintf(fm_pdf_engine, sizeof(fm_pdf_engine), "pdfcraft");
    fm_pdf_total_pages = 2;
    fm_pdf_page = 1;
    fm_pdf_text_mode = true;
    fm_pdf_text_buf = strdup("KPlayer PDF Reader\nPdfCraft R36S Compatible");
    fm_view = FM_VIEW_PDF;
    draw_file_manager();
    fm_pdf_clear_render();
    fm_view = FM_VIEW_BROWSE;

    /* v2.1.6 Native --bg-audio JSON queue + L3+R3 KPlayer Mini-Player state machine */
    FmBgTrack mp_tracks[3] = {
        {"/roms/bgmusic/track1.mp3", "Faixa Um", false},
        {"/roms/bgmusic/track2.mp3", "Faixa Dois", false},
        {"https://stream.example.org/radio.mp3", "Radio Ilha", true},
    };
    assert(fm_write_bg_launch_json_ext(
        f_bg, f_elf, true, true, true, "music", mp_tracks[1].uri, 12000, 55,
        mp_tracks[1].title, "#22d3ee", mp_tracks, 3, 1));
    BgMpState mp_st;
    assert(bg_mp_load_json_file(f_bg, &mp_st));
    assert(mp_st.track_count == 3 && mp_st.current_index == 1);
    assert(mp_st.volume_pct == 55 && mp_st.auto_play && !mp_st.overlay_open);
    assert(mp_st.selected_row == 0);
    assert(mp_st.accent_r == 0x22 && mp_st.accent_g == 0xd3 && mp_st.accent_b == 0xee);
    assert(mp_st.tracks[2].is_radio && !strcmp(mp_st.tracks[2].title, "Radio Ilha"));
    /* While Mini-Player is closed, normal gameplay/ES inputs must be completely ignored */
    assert(bg_mp_handle_action(&mp_st, BG_ACT_R2) == BG_RES_NONE);
    assert(bg_mp_handle_action(&mp_st, BG_ACT_L2) == BG_RES_NONE);
    assert(bg_mp_handle_action(&mp_st, BG_ACT_NAV_DOWN) == BG_RES_NONE);
    assert(bg_mp_handle_action(&mp_st, BG_ACT_CONFIRM) == BG_RES_NONE);
    assert(mp_st.current_index == 1 && !mp_st.overlay_open);
    /* L3+R3 opens KPlayer Mini-Player menu at row 0 */
    unsigned int r_open = bg_mp_handle_action(&mp_st, BG_ACT_L3_R3);
    assert((r_open & BG_RES_OPEN_OVERLAY) && mp_st.overlay_open && mp_st.selected_row == 0);
    /* Confirm on row 0 toggles play/pause */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_CONFIRM) & BG_RES_PAUSE_TOGGLED) &&
           mp_st.paused);
    assert((bg_mp_handle_action(&mp_st, BG_ACT_CONFIRM) & BG_RES_PAUSE_TOGGLED) &&
           !mp_st.paused);
    /* D-Pad DOWN moves to row 1 (PROXIMA MUSICA) and CONFIRM skips track (1 -> 2) */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_NAV_DOWN) & BG_RES_REDRAW) &&
           mp_st.selected_row == 1);
    unsigned int r_next = bg_mp_handle_action(&mp_st, BG_ACT_CONFIRM);
    assert((r_next & BG_RES_TRACK_CHANGED) && mp_st.current_index == 2);
    /* Direct R2 shortcut wraps (2 -> 0) and highlights row 1 */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_R2) & BG_RES_TRACK_CHANGED) &&
           mp_st.current_index == 0 && mp_st.selected_row == 1);
    /* Direct L2 shortcut goes back (0 -> 2) and highlights row 2 */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_L2) & BG_RES_TRACK_CHANGED) &&
           mp_st.current_index == 2 && mp_st.selected_row == 2);
    /* Navigate to row 3 (VOLUME) and adjust with RIGHT/LEFT */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_NAV_DOWN) & BG_RES_REDRAW) &&
           mp_st.selected_row == 3);
    assert((bg_mp_handle_action(&mp_st, BG_ACT_NAV_RIGHT) & BG_RES_VOLUME_CHANGED) &&
           mp_st.volume_pct == 65);
    assert((bg_mp_handle_action(&mp_st, BG_ACT_NAV_LEFT) & BG_RES_VOLUME_CHANGED) &&
           mp_st.volume_pct == 55);
    /* Navigate to row 4 (OCULTAR MENU) and CONFIRM closes overlay */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_NAV_DOWN) & BG_RES_REDRAW) &&
           mp_st.selected_row == 4);
    assert((bg_mp_handle_action(&mp_st, BG_ACT_CONFIRM) & BG_RES_CLOSE_OVERLAY) &&
           !mp_st.overlay_open);
    /* Reopen with L3+R3 and close with L3+R3 toggle */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_L3_R3) & BG_RES_OPEN_OVERLAY) &&
           mp_st.overlay_open);
    assert((bg_mp_handle_action(&mp_st, BG_ACT_L3_R3) & BG_RES_CLOSE_OVERLAY) &&
           !mp_st.overlay_open);
    /* Reopen with L3+R3 and close with A */
    assert((bg_mp_handle_action(&mp_st, BG_ACT_L3_R3) & BG_RES_OPEN_OVERLAY) &&
           mp_st.overlay_open);
    assert((bg_mp_handle_action(&mp_st, BG_ACT_CLOSE) & BG_RES_CLOSE_OVERLAY) &&
           !mp_st.overlay_open);

    /* R36S SDL_GAMECONTROLLERCONFIG parser (L3/R3 sticks + D-Pad) & KPlayer Mini-Player RGBA renderer */
    {
      const char *r36s_cfg =
          "190000004b4800000010000000010000,GO-Super Gamepad,a:b0,b:b1,x:b2,y:b3,"
          "leftshoulder:b4,rightshoulder:b5,lefttrigger:b6,righttrigger:b7,"
          "dpup:b8,dpdown:b9,dpleft:b10,dpright:b11,leftstick:b12,rightstick:b13,"
          "back:b14,start:b15,guide:b16,platform:Linux,\n";
      BgSdlMap sm;
      assert(bg_mp_parse_sdl_mapping(r36s_cfg, "GO-Super Gamepad", &sm));
      assert(sm.valid && sm.l3_btn == 12 && sm.r3_btn == 13);
      assert(sm.back_btn == 14 && sm.start_btn == 15 && sm.guide_btn == 16);
      assert(sm.l2_btn == 6 && sm.r2_btn == 7 && sm.a_btn == 0 && sm.b_btn == 1);
      assert(sm.dpup_btn == 8 && sm.dpdown_btn == 9 && sm.dpleft_btn == 10 && sm.dpright_btn == 11);

      KpOverlayShared ov;
      memset(&ov, 0, sizeof(ov));
      ov.magic = KP_OV_MAGIC;
      ov.version = KP_OV_VERSION;
      ov.overlay_open = 1;
      ov.selected_row = 1;
      ov.track_index = 1;
      ov.track_count = 3;
      ov.volume_pct = 55;
      ov.accent_r = 0x22;
      ov.accent_g = 0xd3;
      ov.accent_b = 0xee;
      snprintf(ov.title, sizeof(ov.title), "Faixa Dois — R36S");
      uint32_t *rgba = (uint32_t *)calloc((size_t)KP_OV_CARD_W * KP_OV_CARD_H, sizeof(uint32_t));
      assert(rgba != NULL);
      kp_ov_render_rgba(&ov, rgba);
      /* Rounded outer corner (0,0) must be fully transparent */
      assert(rgba[0] == 0);
      /* Top KPlayer accent line inside header must have exact theme accent color */
      assert(rgba[1 * KP_OV_CARD_W + 20] == kp_ov_rgba(0x22, 0xd3, 0xee, 255));
      /* Selected KPlayer row 1 left vertical focus bar must render in exact theme accent */
      int sel_y = 83 + 1 * 25 + 6;
      assert(rgba[sel_y * KP_OV_CARD_W + 11] == kp_ov_rgba(0x22, 0xd3, 0xee, 255));
      free(rgba);
    }

    unlink(f_txt);
    unlink(f_m3u8);
    unlink(f_pls);
    unlink(f_elf);
    unlink(f_bg);
    rmdir(fm_tmp);
  }
  fm_open();
  draw_file_manager();
  fm_free_buffers();
  /* Unified single-frame changelog render */
  mode = 14;
  draw_changelog();
  mode = 3;

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
  /* Verify v2.1.1 ALSA SFX release lifecycle & same-version reinstall disarm */
  sfx_set_boot_ready(false);
  sfx_play(SFX_CONFIRM);
  assert(sfx_device == 0);
  sfx_set_boot_ready(true);
  sfx_poll(1000u, true);
  sfx_release_device();
  assert(sfx_device == 0);
  pthread_mutex_lock(&kp_upd_mutex);
  kp_upd_reinstall_armed = true;
  pthread_mutex_unlock(&kp_upd_mutex);
  updater_disarm_reinstall();
  pthread_mutex_lock(&kp_upd_mutex);
  assert(!kp_upd_reinstall_armed);
  pthread_mutex_unlock(&kp_upd_mutex);

  media_library_join();
  clear_cached_media();
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
      "buffers, UTF-8 font, empty/options/video/filemanager "
      "rendering");
  return 0;
}
