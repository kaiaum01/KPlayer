/* A separate audio browser keeps the playing queue stable while browsing. */
typedef struct {
  char *name;
  bool dir;
  uint64_t size_bytes;
} MusicEntry;
static MusicEntry music_entries[MAX_FILES];
static char music_folder[PATH_MAX];
static int music_total = 0, music_selected = 0, music_offset = 0;
static int audio_panel = 0, queue_selected = 0, plain_scroll = 0;
static void clear_music_entries(void) {
  for (int i = 0; i < music_total; i++)
    free(music_entries[i].name);
  music_total = 0;
  music_selected = music_offset = 0;
}
static int music_compare(const void *a, const void *b) {
  const MusicEntry *x = a, *y = b;
  if (x->dir != y->dir)
    return y->dir - x->dir;
  return strcasecmp(x->name, y->name);
}
static bool scan_music_folder(const char *path) {
  char resolved[PATH_MAX];
  if (!realpath(path, resolved)) {
    folder_failure(errno);
    return false;
  }
  DIR *d = opendir(resolved);
  if (!d) {
    folder_failure(errno);
    return false;
  }
  clear_music_entries();
  snprintf(music_folder, sizeof(music_folder), "%s", resolved);
  struct dirent *e;
  while ((e = readdir(d))) {
    if (e->d_name[0] == '.')
      continue;
    char p[PATH_MAX];
    if (snprintf(p, sizeof(p), "%s/%s", resolved, e->d_name) >= (int)sizeof(p))
      continue;
    struct stat st;
    if (stat(p, &st))
      continue;
    bool dir = S_ISDIR(st.st_mode);
    if (!dir && (!S_ISREG(st.st_mode) || !audio_file(e->d_name)))
      continue;
    if (music_total == MAX_FILES)
      break;
    char *name = strdup(e->d_name);
    if (!name)
      break;
    music_entries[music_total++] = (MusicEntry){
        name, dir, !dir && st.st_size > 0 ? (uint64_t)st.st_size : 0};
  }
  closedir(d);
  qsort(music_entries, music_total, sizeof(*music_entries), music_compare);
  return true;
}
static void open_current_music_folder(void) {
  char p[PATH_MAX];
  snprintf(p, sizeof(p), "%s", current_path);
  char *slash = strrchr(p, '/');
  if (slash) {
    if (slash == p)
      slash[1] = 0;
    else
      *slash = 0;
  } else {
    DIR *d1 = opendir("/roms/bgmusic");
    if (d1) {
      closedir(d1);
      snprintf(p, sizeof(p), "/roms/bgmusic");
    } else {
      DIR *d2 = opendir("/roms2/bgmusic");
      if (d2) {
        closedir(d2);
        snprintf(p, sizeof(p), "/roms2/bgmusic");
      } else
        snprintf(p, sizeof(p), "%s", root);
    }
  }
  scan_music_folder(p);
  for (int i = 0; i < music_total; i++) {
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "%s/%s", music_folder,
                 music_entries[i].name) >= (int)sizeof(path))
      continue;
    if (!strcmp(path, current_path)) {
      music_selected = i;
      break;
    }
  }
}
static void switch_audio_panel(void) {
  audio_panel = audio_panel == 1 ? 2 : 1;
  plain_scroll = 0;
  if (audio_panel == 1)
    queue_selected = queue_index;
  if (audio_panel == 2 && !music_folder[0])
    open_current_music_folder();
}
static void build_music_queue(void) {
  clear_queue();
  for (int i = 0; i < music_total; i++) {
    if (music_entries[i].dir)
      continue;
    char p[PATH_MAX];
    if (snprintf(p, sizeof(p), "%s/%s", music_folder, music_entries[i].name) >=
        (int)sizeof(p))
      continue;
    if (i == music_selected)
      queue_index = queue_count;
    queue_paths[queue_count] = strdup(p);
    if (queue_paths[queue_count])
      queue_count++;
  }
}
static void play_music_entry(void) {
  if (!music_total)
    return;
  char path[PATH_MAX];
  if (snprintf(path, sizeof(path), "%s/%s", music_folder,
               music_entries[music_selected].name) >= (int)sizeof(path))
    return;
  if (music_entries[music_selected].dir) {
    scan_music_folder(path);
    return;
  }
  build_music_queue();
  int pane = audio_panel;
  play_path(path);
  audio_panel = pane;
}
static bool parent_music_folder(void) {
  if (!music_folder[0] || !strcmp(music_folder, "/"))
    return false;
  char p[PATH_MAX];
  snprintf(p, sizeof(p), "%s", music_folder);
  char *slash = strrchr(p, '/');
  if (slash && slash > p)
    *slash = 0;
  else
    snprintf(p, sizeof(p), "/");
  return scan_music_folder(p);
}
