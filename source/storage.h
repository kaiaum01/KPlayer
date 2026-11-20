/* Read-only browsing of local storage; no permission or mount changes. */
static bool locations_view = false;
static bool automatic_view = false;
static int location_selected = 0;
static char location_root[PATH_MAX], folder_error[160];
#define LOCATION_COUNT 5
static const char *location_names[] = {"Músicas (SD1)", "Músicas (SD2)",
                                       "Vídeos (SD1)", "Vídeos (SD2)",
                                       "Explorar dispositivo"};
static const char *location_paths[] = {"/roms/bgmusic", "/roms2/bgmusic",
                                       "/roms/videos", "/roms2/videos", "/"};
typedef struct {
  const char *path;
  int kind; /* 1 = audio only, 2 = video only */
} AutoMediaRoot;
static AutoMediaRoot automatic_roots[] = {
    {"/roms/bgmusic", 1},
    {"/roms2/bgmusic", 1},
    {"/roms/videos", 2},
    {"/roms2/videos", 2},
};
static bool location_available[LOCATION_COUNT];
static void scan(void);
static void refresh_locations(void) {
  for (int i = 0; i < LOCATION_COUNT; i++) {
    DIR *d = opendir(location_paths[i]);
    location_available[i] = d != NULL;
    if (d)
      closedir(d);
  }
}
static void show_locations(void) {
  clear_items();
  automatic_view = false;
  locations_view = true;
  folder_error[0] = 0;
  selected = offset = 0;
  refresh_locations();
  mode = 0;
}
static void folder_failure(int error) {
  const char *message = error == EACCES || error == EPERM
                            ? tr("Sem permissão de leitura nesta pasta")
                        : error == ENOENT || error == ENODEV
                            ? tr("Pasta ausente ou cartão não montado")
                            : tr("Não foi possível abrir a pasta");
  notify(message);
}
static bool enter_folder(const char *path) {
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
  closedir(d);
  snprintf(folder, sizeof(folder), "%s", resolved);
  locations_view = false;
  automatic_view = false;
  scan();
  return true;
}
static void open_location(void) {
  if (enter_folder(location_paths[location_selected]))
    snprintf(location_root, sizeof(location_root), "%s", folder);
  else
    refresh_locations();
}
