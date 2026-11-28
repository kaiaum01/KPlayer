#ifndef KPLAYER_PLAYLISTS_H
#define KPLAYER_PLAYLISTS_H

/*
 * Custom M3U playlists & editable queue operations for KPlayer R36S (v2.1.7+).
 * Lets users save their active music queue as .m3u playlists in playlists/,
 * load saved playlists back, and reorder or remove tracks inside the Queue tab.
 */

#include <dirent.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#define KP_MAX_PLAYLISTS 64

typedef struct {
  char name[128];
  char path[PATH_MAX];
  int tracks;
} KpPlaylistItem;

static KpPlaylistItem kp_saved_playlists[KP_MAX_PLAYLISTS];
static int kp_saved_playlist_count = 0;
static int kp_saved_playlist_cursor = 0;

static void kp_playlists_ensure_dir(void) {
  (void)mkdir("playlists", 0755);
}

static bool kp_queue_save_m3u(const char *custom_name, char *out_name, size_t out_cap) {
  if (queue_count <= 0) return false;
  kp_playlists_ensure_dir();
  char safe[96];
  if (custom_name && custom_name[0]) {
    size_t w = 0;
    for (size_t i = 0; custom_name[i] && w + 1 < sizeof(safe); i++) {
      unsigned char c = (unsigned char)custom_name[i];
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '_') {
        safe[w++] = (char)c;
      } else if (c == ' ') {
        safe[w++] = '_';
      }
    }
    safe[w] = 0;
  } else {
    time_t t = time(NULL);
    struct tm tm_buf;
    if (localtime_r(&t, &tm_buf)) {
      snprintf(safe, sizeof(safe), "Playlist_%02d%02d_%02d%02d",
               tm_buf.tm_mon + 1, tm_buf.tm_mday, tm_buf.tm_hour, tm_buf.tm_min);
    } else {
      snprintf(safe, sizeof(safe), "Playlist_KPlayer");
    }
  }
  if (!safe[0]) snprintf(safe, sizeof(safe), "Playlist_KPlayer");

  char full_path[PATH_MAX], tmp_path[PATH_MAX];
  snprintf(full_path, sizeof(full_path), "playlists/%.80s.m3u", safe);
  snprintf(tmp_path, sizeof(tmp_path), "playlists/.%.80s.m3u.tmp", safe);

  FILE *f = fopen(tmp_path, "w");
  if (!f) return false;
  bool ok = fprintf(f, "#EXTM3U\n") > 0;
  for (int i = 0; i < queue_count && ok; i++) {
    if (!queue_paths[i] || !queue_paths[i][0]) continue;
    const char *bn = strrchr(queue_paths[i], '/');
    const char *lbl = (bn && bn[1]) ? bn + 1 : queue_paths[i];
    if (fprintf(f, "#EXTINF:-1,%s\n%s\n", lbl, queue_paths[i]) < 0) ok = false;
  }
  if (fclose(f) != 0 || !ok) {
    remove(tmp_path);
    return false;
  }
  if (rename(tmp_path, full_path) != 0) {
    remove(tmp_path);
    return false;
  }
  if (out_name && out_cap > 0) {
    snprintf(out_name, out_cap, "%.80s.m3u", safe);
  }
  return true;
}

static int kp_playlists_scan(void) {
  kp_playlists_ensure_dir();
  kp_saved_playlist_count = 0;
  DIR *d = opendir("playlists");
  if (!d) return 0;
  struct dirent *de;
  while ((de = readdir(d)) != NULL && kp_saved_playlist_count < KP_MAX_PLAYLISTS) {
    if (de->d_name[0] == '.') continue;
    const char *dot = strrchr(de->d_name, '.');
    if (!dot || (strcasecmp(dot, ".m3u") != 0 && strcasecmp(dot, ".m3u8") != 0)) continue;
    KpPlaylistItem *it = &kp_saved_playlists[kp_saved_playlist_count];
    snprintf(it->name, sizeof(it->name), "%.127s", de->d_name);
    snprintf(it->path, sizeof(it->path), "playlists/%.240s", de->d_name);
    it->tracks = 0;
    FILE *f = fopen(it->path, "r");
    if (f) {
      char ln[1024];
      while (fgets(ln, sizeof(ln), f)) {
        if (ln[0] && ln[0] != '#' && ln[0] != '\r' && ln[0] != '\n') it->tracks++;
      }
      fclose(f);
    }
    kp_saved_playlist_count++;
  }
  closedir(d);
  if (kp_saved_playlist_cursor >= kp_saved_playlist_count) {
    kp_saved_playlist_cursor = kp_saved_playlist_count > 0 ? kp_saved_playlist_count - 1 : 0;
  }
  return kp_saved_playlist_count;
}

static bool kp_queue_remove_at(int idx) {
  if (idx < 0 || idx >= queue_count) return false;
  if (queue_count == 1) return false; /* keep at least 1 active item in queue */
  free(queue_paths[idx]);
  for (int i = idx; i + 1 < queue_count; i++) {
    queue_paths[i] = queue_paths[i + 1];
  }
  queue_paths[queue_count - 1] = NULL;
  queue_count--;
  if (queue_index > idx) queue_index--;
  else if (queue_index >= queue_count) queue_index = queue_count - 1;
  if (queue_selected >= queue_count) queue_selected = queue_count - 1;
  return true;
}

static bool kp_queue_move_at(int idx, int delta) {
  int dst = idx + delta;
  if (idx < 0 || idx >= queue_count || dst < 0 || dst >= queue_count || idx == dst) {
    return false;
  }
  char *tmp = queue_paths[idx];
  queue_paths[idx] = queue_paths[dst];
  queue_paths[dst] = tmp;
  if (queue_index == idx) queue_index = dst;
  else if (queue_index == dst) queue_index = idx;
  queue_selected = dst;
  return true;
}

#endif /* KPLAYER_PLAYLISTS_H */
