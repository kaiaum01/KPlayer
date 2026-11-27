/* K PLAYER native interface, GPL-2.0-or-later.
 * Uses the public libVLC 3 API from VideoLAN and SDL2.
 * The bundled, rebuilt VLC 3.0.23 engine is loaded at runtime.
 * Decoder/output plugins are supplied by the target Debian 13 system.
 */
#define _POSIX_C_SOURCE 200809L
#define _XOPEN_SOURCE 700
#include <SDL.h>
#include <ctype.h>
#include <dirent.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <limits.h>
#include <math.h>
#include <netdb.h>
#include <pthread.h>
#include <signal.h>
#include <spawn.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#include <vlc/vlc.h>
#define STB_TRUETYPE_IMPLEMENTATION
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#include "dynamic.h"
#include "vendor/stb_image.h"
#include "vendor/stb_truetype.h"

#include "i18n.h"
#include "version.h"
#include "network_location.h"

#define W 640
#define H 480
#define MAX_FILES 4096
#define CACHE 96
static SDL_Window *window;
static SDL_Renderer *renderer;
static int dev_w = W, dev_h = H;
/* 0 = Auto (Adaptativo sem barras), 1 = Preencher tela, 2 = Clássico 4:3. */
static int display_mode = 0;
static bool display_adaptive_active = false;
static bool display_preview_lock = false;
static void begin_full_screen_pass(void) {
  if (!renderer || !display_adaptive_active) return;
  if (SDL_RenderSetScale) SDL_RenderSetScale(renderer, 1.0f, 1.0f);
  if (SDL_RenderSetViewport) {
    SDL_Rect full = {0, 0, dev_w, dev_h};
    SDL_RenderSetViewport(renderer, &full);
  }
}
static void begin_ui_pass(void) {
  if (!renderer || !display_adaptive_active) return;
  if (display_mode == 1) {
    if (SDL_RenderSetViewport) {
      SDL_Rect full = {0, 0, dev_w, dev_h};
      SDL_RenderSetViewport(renderer, &full);
    }
    if (SDL_RenderSetScale)
      SDL_RenderSetScale(renderer, (float)dev_w / (float)W,
                         (float)dev_h / (float)H);
    return;
  }
  float sx = (float)dev_w / (float)W;
  float sy = (float)dev_h / (float)H;
  float sc = sx < sy ? sx : sy;
  if (sc < 0.25f) sc = 0.25f;
  int uw = (int)lroundf((float)W * sc);
  int uh = (int)lroundf((float)H * sc);
  if (uw > dev_w) uw = dev_w;
  if (uh > dev_h) uh = dev_h;
  if (SDL_RenderSetScale) SDL_RenderSetScale(renderer, sc, sc);
  if (SDL_RenderSetViewport) {
    /* SDL_RenderSetViewport expects logical/scaled units when scale is active. */
    SDL_Rect vp = {(int)lroundf((float)(dev_w - uw) / (2.0f * sc)),
                   (int)lroundf((float)(dev_h - uh) / (2.0f * sc)), W, H};
    SDL_RenderSetViewport(renderer, &vp);
  }
}
static void refresh_device_display(void) {
  if (!renderer) return;
  int out_w = 0, out_h = 0;
  if (SDL_GetRendererOutputSize &&
      SDL_GetRendererOutputSize(renderer, &out_w, &out_h) == 0 &&
      out_w >= 240 && out_h >= 240) {
    dev_w = out_w;
    dev_h = out_h;
  } else if (window && SDL_GetWindowSize) {
    SDL_GetWindowSize(window, &out_w, &out_h);
    if (out_w >= 240 && out_h >= 240) {
      dev_w = out_w;
      dev_h = out_h;
    }
  } else {
    const char *ew = getenv("KPLAYER_DISPLAY_W");
    const char *eh = getenv("KPLAYER_DISPLAY_H");
    if (ew && eh) {
      int pw = atoi(ew), ph = atoi(eh);
      if (pw >= 240 && ph >= 240) {
        dev_w = pw;
        dev_h = ph;
      }
    }
  }
  if (display_preview_lock || display_mode == 2 ||
      !SDL_RenderSetScale || !SDL_RenderSetViewport) {
    display_adaptive_active = false;
    if (SDL_RenderSetViewport) SDL_RenderSetViewport(renderer, NULL);
    if (SDL_RenderSetScale) SDL_RenderSetScale(renderer, 1.0f, 1.0f);
    SDL_RenderSetLogicalSize(renderer, W, H);
    return;
  }
  SDL_RenderSetLogicalSize(renderer, 0, 0);
  display_adaptive_active = true;
  begin_ui_pass();
}
static libvlc_instance_t *engine;
static libvlc_media_player_t *player;
static volatile sig_atomic_t running = 1;
static unsigned char *fontdata;
static stbtt_fontinfo font;
static unsigned char *bolddata;
static stbtt_fontinfo boldfont;
static int category;
static SDL_Color bg = {18, 18, 18, 255}, panel = {24, 24, 24, 255};
static SDL_Color textc = {255, 255, 255, 255}, muted = {179, 179, 179, 255},
                 accent = {29, 185, 84, 255};
static const char *root = "midias";
static char folder[PATH_MAX], media_name[512], status_note[256];
static int selected = 0, offset = 0, total = 0, mode = 3, option = 0;
static bool paused = false, show_osd = true, menu_dirty = true,
            options_from_video = false;
static bool loop_video = false;
static bool favorites_view = false;
static bool is_favorite_path(const char *path);
static void radio_cancel_retries(void);
/* 0 = off, 1 = repeat current item, 2 = repeat queue. */
static int repeat_mode = 0;
static bool shuffle_enabled = false;
static bool playing_iptv = false;
static bool playing_news_video = false;
static long long resume_pending_ms = -1;
static uint32_t resume_deadline;
static uint32_t sleep_end;
static int sleep_choice;
static int eq_choice;
static unsigned (*eq_count_fn)(void);
static const char *(*eq_name_fn)(unsigned);
static libvlc_equalizer_t *(*eq_new_fn)(unsigned);
static void (*eq_release_fn)(libvlc_equalizer_t *);
static int (*eq_apply_fn)(libvlc_media_player_t *, libvlc_equalizer_t *);
static void load_equalizer_api(void) {
  *(void **)(&eq_count_fn) = dlsym(RTLD_DEFAULT, "libvlc_audio_equalizer_get_preset_count");
  *(void **)(&eq_name_fn) = dlsym(RTLD_DEFAULT, "libvlc_audio_equalizer_get_preset_name");
  *(void **)(&eq_new_fn) = dlsym(RTLD_DEFAULT, "libvlc_audio_equalizer_new_from_preset");
  *(void **)(&eq_release_fn) = dlsym(RTLD_DEFAULT, "libvlc_audio_equalizer_release");
  *(void **)(&eq_apply_fn) = dlsym(RTLD_DEFAULT, "libvlc_media_player_set_equalizer");
}
static bool apply_equalizer(void) {
  if (!player || !eq_apply_fn) return false;
  if (eq_choice == 0) return eq_apply_fn(player, NULL) == 0;
  if (!eq_new_fn || !eq_release_fn || !eq_count_fn || (unsigned)eq_choice > eq_count_fn()) return false;
  libvlc_equalizer_t *eq = eq_new_fn((unsigned)eq_choice - 1);
  if (!eq) return false;
  int rc = eq_apply_fn(player, eq);
  eq_release_fn(eq);
  return rc == 0;
}
static uint32_t osd_until = 0, note_until = 0;
static float rate = 1.0f;
static int fit = 0;
static SDL_Texture *video_texture;
static int texture_w = 0, texture_h = 0;
static struct {
  pthread_mutex_t mutex;
  unsigned char *pixels;
  unsigned width, height, pitch;
  bool ready;
} video = {.mutex = PTHREAD_MUTEX_INITIALIZER};

typedef struct {
  char *name;
  char *path;
  bool dir;
  long long size;
} Item;
static Item items[MAX_FILES];
typedef struct {
  char *s;
  int size;
  SDL_Texture *texture;
  int w, h;
  unsigned used;
} Text;
static Text cache[CACHE];
static unsigned cache_tick;
static void stop_signal(int sig) {
  (void)sig;
  running = 0;
}
static void color(SDL_Color c) {
  SDL_SetRenderDrawColor(renderer, c.r, c.g, c.b, c.a);
}
static void rect(int x, int y, int w, int h, SDL_Color c) {
  SDL_Rect r = {x, y, w, h};
  color(c);
  SDL_RenderFillRect(renderer, &r);
}
static void rounded(int x, int y, int w, int h, int r, SDL_Color c) {
  if (w <= 0 || h <= 0 || c.a == 0)
    return;
  if (r < 0)
    r = 0;
  if (r * 2 > w)
    r = w / 2;
  if (r * 2 > h)
    r = h / 2;
  if (r == 0) {
    rect(x, y, w, h, c);
    return;
  }
  int mid_h = h - 2 * r;
  if (mid_h > 0)
    rect(x, y + r, w, mid_h, c);
  color(c);
  for (int d = 0; d < r; d++) {
    int dx = (int)sqrt((double)r * r - (r - d - .5) * (r - d - .5));
    int x0 = x + r - dx;
    int x1 = x + w - r + dx - 1;
    if (x0 < x)
      x0 = x;
    if (x1 > x + w - 1)
      x1 = x + w - 1;
    if (x0 <= x1) {
      SDL_RenderDrawLine(renderer, x0, y + d, x1, y + d);
      SDL_RenderDrawLine(renderer, x0, y + h - 1 - d, x1, y + h - 1 - d);
    }
  }
}
static void triangle(int x, int y, int size, SDL_Color c) {
  color(c);
  for (int i = 0; i < size; i++) {
    int half = (size - i) / 2;
    SDL_RenderDrawLine(renderer, x + i, y + size / 2 - half, x + i,
                       y + size / 2 + half);
  }
}
static bool preview_mode;
#include "modern.h"
static const unsigned char *decode(const unsigned char *s, int *cp) {
  unsigned a = *s++;
  if (a < 128) {
    *cp = a;
    return s;
  }
  int n = (a & 0xe0) == 0xc0   ? 1
          : (a & 0xf0) == 0xe0 ? 2
          : (a & 0xf8) == 0xf0 ? 3
                               : 0;
  if (!n) {
    *cp = '?';
    return s;
  }
  int value = a & ((1 << (6 - n)) - 1);
  for (int i = 0; i < n; i++) {
    if ((*s & 0xc0) != 0x80) {
      *cp = '?';
      return s;
    }
    value = (value << 6) | (*s++ & 63);
  }
  *cp = value;
  return s;
}
/* Escala global da fonte da interface (mantém measure() e label() juntas). */
#define FONT_SCALE 1.15f
static int font_px(int size) {
  float px = (size < 17 ? (float)size + 2.0f : (float)size + 1.0f) * FONT_SCALE;
  return (int)ceilf(px);
}
static float measure(const char *s, int size) {
  float scale = stbtt_ScaleForPixelHeight(size >= 17 ? &boldfont : &font,
                                          (float)font_px(size)),
        x = 0;
  for (const unsigned char *p = (const unsigned char *)s; *p;) {
    int c, a, b;
    p = decode(p, &c);
    stbtt_GetCodepointHMetrics(size >= 17 ? &boldfont : &font, c, &a, &b);
    x += a * scale;
  }
  return x;
}
static Text *text_texture(const char *s, int size) {
  cache_tick++;
  int slot = 0;
  for (int i = 0; i < CACHE; i++) {
    if (cache[i].s && cache[i].size == size && !strcmp(cache[i].s, s)) {
      cache[i].used = cache_tick;
      return &cache[i];
    }
    if (!cache[i].s || (cache[slot].s && cache[i].used < cache[slot].used))
      slot = i;
  }
  Text *t = &cache[slot];
  free(t->s);
  if (t->texture)
    SDL_DestroyTexture(t->texture);
  memset(t, 0, sizeof(*t));
  t->s = strdup(s);
  t->size = size;
  t->used = cache_tick;
  t->w = (int)ceil(measure(s, size)) + 4;
  t->h = font_px(size) + 8;
  unsigned char *pixels = calloc((size_t)t->w * t->h, 4);
  if (!pixels)
    return t;
  float scale = stbtt_ScaleForPixelHeight(size >= 17 ? &boldfont : &font,
                                          (float)font_px(size));
  int asc, desc, gap;
  stbtt_GetFontVMetrics(size >= 17 ? &boldfont : &font, &asc, &desc, &gap);
  float pen = 2;
  int baseline = (int)ceil(asc * scale) + 2;
  for (const unsigned char *p = (const unsigned char *)s; *p;) {
    int c, a, b, bw, bh, ox, oy;
    p = decode(p, &c);
    unsigned char *bitmap = stbtt_GetCodepointBitmap(
        size >= 17 ? &boldfont : &font, scale, scale, c, &bw, &bh, &ox, &oy);
    for (int y = 0; y < bh; y++)
      for (int x = 0; x < bw; x++) {
        int tx = (int)pen + ox + x, ty = baseline + oy + y;
        if (tx >= 0 && tx < t->w && ty >= 0 && ty < t->h) {
          size_t n = ((size_t)ty * t->w + tx) * 4;
          pixels[n] = pixels[n + 1] = pixels[n + 2] = 255;
          pixels[n + 3] = bitmap[y * bw + x];
        }
      }
    stbtt_FreeBitmap(bitmap, NULL);
    stbtt_GetCodepointHMetrics(size >= 17 ? &boldfont : &font, c, &a, &b);
    pen += a * scale;
  }
  t->texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                 SDL_TEXTUREACCESS_STATIC, t->w, t->h);
  if (t->texture) {
    SDL_UpdateTexture(t->texture, NULL, pixels, t->w * 4);
    SDL_SetTextureBlendMode(t->texture, SDL_BLENDMODE_BLEND);
  }
  free(pixels);
  return t;
}
static void label(const char *s, int x, int y, int size, SDL_Color c,
                  int limit) {
  char clipped[1024];
  snprintf(clipped, sizeof(clipped), "%s", s);
  if (limit > 0 && measure(clipped, size) > limit) {
    size_t len = strlen(clipped);
    while (len) {
      do {
        len--;
      } while (len > 0 && ((unsigned char)clipped[len] & 0xc0) == 0x80);
      clipped[len] = 0;
      char trial[1028];
      memcpy(trial, clipped, len);
      memcpy(trial + len, "…", 4);
      if (measure(trial, size) <= limit) {
        if (len + 4 <= sizeof(clipped))
          memcpy(clipped, trial, len + 4);
        break;
      }
    }
  }
  Text *t = text_texture(clipped, size);
  if (!t->texture)
    return;
  SDL_SetTextureColorMod(t->texture, c.r, c.g, c.b);
  SDL_SetTextureAlphaMod(t->texture, c.a);
  SDL_Rect r = {x - 2, y - 2, t->w, t->h};
  SDL_RenderCopy(renderer, t->texture, NULL, &r);
}
static volatile sig_atomic_t scan_cancelled;
static pthread_mutex_t media_cache_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_t media_scan_thread;
static bool media_scan_thread_valid = false;
static bool media_scan_running = false;
static bool media_scan_pending_refresh = false;
static int media_scan_found_count = 0;
static Item cached_media[MAX_FILES];
static int cached_media_total = 0;
static bool media_preloaded = false;
static bool media_cache_capped = false;
static void clear_cached_media(void) {
  pthread_mutex_lock(&media_cache_mutex);
  for (int i = 0; i < cached_media_total; i++) {
    free(cached_media[i].name);
    free(cached_media[i].path);
  }
  cached_media_total = 0;
  media_preloaded = false;
  media_cache_capped = false;
  media_scan_found_count = 0;
  pthread_mutex_unlock(&media_cache_mutex);
}
static void notify(const char *message) {
  snprintf(status_note, sizeof(status_note), "%s", message);
  note_until = SDL_GetTicks() + 4000;
  menu_dirty = true;
}
static void time_string(long long ms, char *out, size_t n) {
  long long s = ms > 0 ? ms / 1000 : 0;
  if (s >= 3600)
    snprintf(out, n, "%lld:%02lld:%02lld", s / 3600, s / 60 % 60, s % 60);
  else
    snprintf(out, n, "%02lld:%02lld", s / 60, s % 60);
}
static bool supported(const char *s) {
  const char *p = strrchr(s, '.');
  if (!p)
    return false;
  const char *ext[] = {".mp4", ".mkv", ".avi",  ".mov", ".webm",
                       ".m4v", ".mpg", ".mpeg", ".ts",  ".flv",
                       ".wmv", ".mp3", ".flac", ".ogg", ".wav",
                       ".m4a", ".aac", ".opus", NULL};
  for (int i = 0; ext[i]; i++)
    if (!strcasecmp(p, ext[i]))
      return true;
  return false;
}
static bool audio_file(const char *s) {
  const char *p = strrchr(s, '.');
  return p && (!strcasecmp(p, ".mp3") || !strcasecmp(p, ".flac") ||
               !strcasecmp(p, ".ogg") || !strcasecmp(p, ".wav") ||
               !strcasecmp(p, ".m4a") || !strcasecmp(p, ".aac") ||
               !strcasecmp(p, ".opus"));
}
static bool playlist_file(const char *s) {
  const char *ext = strrchr(s, '.');
  return ext && (!strcasecmp(ext, ".m3u") || !strcasecmp(ext, ".m3u8"));
}
static bool home_layout_inverted = false;
static bool bg_audio_preview = false;
static bool system_miniplayer_installed = false;
static bool adult_section_unlocked = false;
static bool tutorial_done = false;
static bool tutorial_from_options = false;
static char seen_version[32] = "";
static char menu_search[64] = "";
static bool menu_search_kb = false;
static int menu_skb_row = 1, menu_skb_col = 0;

static bool str_contains_ci(const char *hay, const char *needle) {
  if (!needle || !needle[0]) return true;
  if (!hay) return false;
  size_t nlen = strlen(needle);
  for (const char *p = hay; *p; p++) {
    size_t i = 0;
    while (i < nlen && p[i] &&
           tolower((unsigned char)p[i]) == tolower((unsigned char)needle[i]))
      i++;
    if (i == nlen) return true;
  }
  return false;
}

static int sort_items(const void *a, const void *b) {
  const Item *x = a, *y = b;
  if (x->dir != y->dir)
    return y->dir - x->dir;
  return strcasecmp(x->name, y->name);
}
static void clear_items(void) {
  for (int i = 0; i < total; i++) {
    free(items[i].name);
    free(items[i].path);
  }
  total = 0;
}
#include "storage.h"
static void scan(void) {
  if (locations_view) {
    refresh_locations();
    return;
  }
  scan_cancelled = false;
  folder_error[0] = 0;
  clear_items();
  selected = offset = 0;
  DIR *d = opendir(folder);
  if (!d) {
    snprintf(folder_error, sizeof(folder_error), "%s",
             errno == EACCES || errno == EPERM
                 ? tr("Sem permissão de leitura nesta pasta")
                 : tr("Pasta indisponível ou cartão removido"));
    notify(folder_error);
    return;
  }
  struct dirent *e;
  bool capped = false;
  while ((e = readdir(d))) {
    if (e->d_name[0] == '.')
      continue;
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "%s/%s", folder, e->d_name) >=
        (int)sizeof(path))
      continue;
    struct stat st;
    if (stat(path, &st))
      continue;
    bool dir = S_ISDIR(st.st_mode);
    if (!dir && (!S_ISREG(st.st_mode) || (!supported(e->d_name) && !(category == 0 && playlist_file(e->d_name)))))
      continue;
    if (!dir && ((category == 1 && !audio_file(e->d_name)) ||
                 (category == 2 && audio_file(e->d_name))))
      continue;
    if (menu_search[0] && !str_contains_ci(e->d_name, menu_search))
      continue;
    if (total == MAX_FILES) {
      capped = true;
      break;
    }
    char *name = strdup(e->d_name), *stored_path = strdup(path);
    if (!name || !stored_path) {
      free(name);
      free(stored_path);
      break;
    }
    items[total++] = (Item){name, stored_path, dir, st.st_size};
  }
  closedir(d);
  qsort(items, total, sizeof(*items), sort_items);
  if (!total && menu_search[0])
    snprintf(folder_error, sizeof(folder_error), "Nenhum arquivo encontrado para a pesquisa");
  if (capped)
    notify(tr("Limite de 4096 itens: organize em subpastas"));
  menu_dirty = true;
}
static bool stage_has_path(const Item *list, int count, const char *path) {
  for (int i = 0; i < count; i++)
    if (list[i].path && !strcmp(list[i].path, path))
      return true;
  return false;
}
static void boot_scan_tree_into(Item *dst, int *dst_total, const char *base,
                                int depth, int media_filter, bool *capped) {
  if (scan_cancelled || !running || depth > 8 || *dst_total >= MAX_FILES) {
    if (*dst_total >= MAX_FILES) *capped = true;
    return;
  }
  DIR *d = opendir(base);
  if (!d)
    return;
  struct dirent *e;
  while ((e = readdir(d)) && *dst_total < MAX_FILES) {
    if (scan_cancelled || !running) break;
    if (e->d_name[0] == '.')
      continue;
    char path[PATH_MAX];
    if (snprintf(path, sizeof(path), "%s/%s", base, e->d_name) >=
        (int)sizeof(path))
      continue;
    struct stat lst, st;
    if (lstat(path, &lst) || S_ISLNK(lst.st_mode) || stat(path, &st))
      continue;
    if (S_ISDIR(st.st_mode)) {
      boot_scan_tree_into(dst, dst_total, path, depth + 1, media_filter, capped);
      continue;
    }
    if (!S_ISREG(st.st_mode) || st.st_size < 50 * 1024 ||
        !supported(e->d_name) || stage_has_path(dst, *dst_total, path))
      continue;
    if (media_filter == 1 && !audio_file(e->d_name))
      continue;
    if (media_filter == 2 && audio_file(e->d_name))
      continue;
    char *name = strdup(e->d_name), *stored_path = strdup(path);
    if (!name || !stored_path) {
      free(name);
      free(stored_path);
      *capped = true;
      break;
    }
    dst[(*dst_total)++] = (Item){name, stored_path, false, st.st_size};
    pthread_mutex_lock(&media_cache_mutex);
    media_scan_found_count = *dst_total;
    pthread_mutex_unlock(&media_cache_mutex);
  }
  if (*dst_total >= MAX_FILES)
    *capped = true;
  closedir(d);
}
static void *media_scan_worker(void *arg) {
  (void)arg;
  Item *stage = (Item *)calloc(MAX_FILES, sizeof(Item));
  int stage_total = 0;
  bool capped = false;
  if (stage) {
    for (size_t i = 0;
         i < sizeof(automatic_roots) / sizeof(*automatic_roots) && !capped &&
         !scan_cancelled && running;
         i++) {
      char resolved[PATH_MAX];
      if (realpath(automatic_roots[i].path, resolved))
        boot_scan_tree_into(stage, &stage_total, resolved, 0,
                            automatic_roots[i].kind, &capped);
    }
    if (stage_total > 1)
      qsort(stage, (size_t)stage_total, sizeof(*stage), sort_items);
  }

  Item *old_items = (Item *)calloc(MAX_FILES, sizeof(Item));
  int old_total = 0;

  pthread_mutex_lock(&media_cache_mutex);
  if (!scan_cancelled && stage) {
    if (old_items) {
      old_total = cached_media_total;
      if (old_total > 0)
        memcpy(old_items, cached_media, (size_t)old_total * sizeof(Item));
    } else {
      for (int i = 0; i < cached_media_total; i++) {
        free(cached_media[i].name);
        free(cached_media[i].path);
      }
    }
    cached_media_total = stage_total;
    if (stage_total > 0)
      memcpy(cached_media, stage, (size_t)stage_total * sizeof(Item));
    media_cache_capped = capped;
    media_preloaded = true;
    media_scan_found_count = stage_total;
    media_scan_pending_refresh = true;
  } else if (stage) {
    for (int i = 0; i < stage_total; i++) {
      free(stage[i].name);
      free(stage[i].path);
    }
  }
  media_scan_running = false;
  pthread_mutex_unlock(&media_cache_mutex);

  free(stage);
  if (old_items) {
    for (int i = 0; i < old_total; i++) {
      free(old_items[i].name);
      free(old_items[i].path);
    }
    free(old_items);
  }
  return NULL;
}
static int media_library_found_count(void) {
  pthread_mutex_lock(&media_cache_mutex);
  int c = media_scan_running ? media_scan_found_count : cached_media_total;
  pthread_mutex_unlock(&media_cache_mutex);
  return c;
}
static void media_library_start_async(bool force) {
  pthread_mutex_lock(&media_cache_mutex);
  if (media_scan_running) {
    pthread_mutex_unlock(&media_cache_mutex);
    return;
  }
  if (!force && media_preloaded) {
    pthread_mutex_unlock(&media_cache_mutex);
    return;
  }
  bool need_join = media_scan_thread_valid;
  media_scan_thread_valid = false;
  pthread_mutex_unlock(&media_cache_mutex);

  if (need_join)
    pthread_join(media_scan_thread, NULL);

  scan_cancelled = 0;
  pthread_mutex_lock(&media_cache_mutex);
  media_scan_running = true;
  media_scan_found_count = 0;
  pthread_mutex_unlock(&media_cache_mutex);

  if (pthread_create(&media_scan_thread, NULL, media_scan_worker, NULL) == 0) {
    pthread_mutex_lock(&media_cache_mutex);
    media_scan_thread_valid = true;
    pthread_mutex_unlock(&media_cache_mutex);
  } else {
    pthread_mutex_lock(&media_cache_mutex);
    media_scan_running = false;
    pthread_mutex_unlock(&media_cache_mutex);
  }
}
static void media_library_join(void) {
  scan_cancelled = 1;
  pthread_mutex_lock(&media_cache_mutex);
  bool valid = media_scan_thread_valid;
  media_scan_thread_valid = false;
  pthread_mutex_unlock(&media_cache_mutex);
  if (valid)
    pthread_join(media_scan_thread, NULL);
}
static void populate_automatic_from_cache(void) {
  clear_items();
  selected = offset = 0;
  folder_error[0] = 0;
  automatic_view = true;
  locations_view = false;

  pthread_mutex_lock(&media_cache_mutex);
  bool scanning = media_scan_running;
  bool preloaded = media_preloaded;
  bool capped = media_cache_capped;
  for (int i = 0; i < cached_media_total && total < MAX_FILES; i++) {
    const char *nm = cached_media[i].name;
    const char *pt = cached_media[i].path;
    if (!nm || !pt) continue;
    if ((category == 1 && !audio_file(nm)) || (category == 2 && audio_file(nm)))
      continue;
    if (favorites_view && !is_favorite_path(pt))
      continue;
    if (menu_search[0] && !str_contains_ci(nm, menu_search))
      continue;
    char *name = strdup(nm), *stored_path = strdup(pt);
    if (!name || !stored_path) {
      free(name);
      free(stored_path);
      break;
    }
    items[total++] = (Item){name, stored_path, false, cached_media[i].size};
  }
  pthread_mutex_unlock(&media_cache_mutex);

  if (!total) {
    if (scanning && !preloaded)
      snprintf(folder_error, sizeof(folder_error), "%s",
               tr("Carregando biblioteca de mídias em segundo plano..."));
    else if (menu_search[0])
      snprintf(folder_error, sizeof(folder_error), "Nenhum arquivo encontrado para a pesquisa");
    else
      snprintf(folder_error, sizeof(folder_error), "%s",
               tr(favorites_view ? "Nenhuma favorita encontrada" : "Nenhuma mídia acima de 50 KB encontrada"));
  }
  if (capped)
    notify(tr("Limite de 4096 itens: organize em subpastas"));
  mode = 0;
  menu_dirty = true;
}
static void media_library_poll(void) {
  bool should_refresh = false;
  pthread_mutex_lock(&media_cache_mutex);
  if (media_scan_pending_refresh) {
    media_scan_pending_refresh = false;
    should_refresh = true;
  }
  pthread_mutex_unlock(&media_cache_mutex);
  if (should_refresh && mode == 0 && automatic_view) {
    populate_automatic_from_cache();
  }
}
static void scan_automatic_media(void) {
  pthread_mutex_lock(&media_cache_mutex);
  bool need_start = !media_preloaded && !media_scan_running;
  pthread_mutex_unlock(&media_cache_mutex);
  if (need_start)
    media_library_start_async(false);
  populate_automatic_from_cache();
}
static void rescan_automatic_media(void) {
  media_library_start_async(true);
  notify(tr("Atualizando biblioteca em segundo plano..."));
  populate_automatic_from_cache();
}
static unsigned format_video(void **opaque, char *chroma, unsigned *width,
                             unsigned *height, unsigned *pitches,
                             unsigned *lines) {
  (void)opaque;
  unsigned w = *width, h = *height;
  unsigned max_w = (unsigned)(dev_w > W ? dev_w : W);
  unsigned max_h = (unsigned)(dev_h > H ? dev_h : H);
  if (max_w > 1920) max_w = 1920;
  if (max_h > 1080) max_h = 1080;
  if (!w || !h) {
    w = max_w;
    h = max_h;
  }
  double factor = fmin((double)max_w / w, (double)max_h / h);
  if (factor > 1)
    factor = 1;
  w = (unsigned)fmax(2, floor(w * factor));
  h = (unsigned)fmax(2, floor(h * factor));
  unsigned pitch = (w * 4 + 31) & ~31u;
  unsigned char *p = NULL;
  if (posix_memalign((void **)&p, 32, (size_t)pitch * h))
    return 0;
  memset(p, 0, (size_t)pitch * h);
  pthread_mutex_lock(&video.mutex);
  free(video.pixels);
  video.pixels = p;
  video.width = w;
  video.height = h;
  video.pitch = pitch;
  video.ready = false;
  pthread_mutex_unlock(&video.mutex);
  memcpy(chroma, "RV32", 4);
  *width = w;
  *height = h;
  *pitches = pitch;
  *lines = h;
  return 1;
}
static void cleanup_video(void *opaque) {
  (void)opaque;
  pthread_mutex_lock(&video.mutex);
  video.ready = false;
  pthread_mutex_unlock(&video.mutex);
}
static void *lock_video(void *opaque, void **planes) {
  (void)opaque;
  pthread_mutex_lock(&video.mutex);
  planes[0] = video.pixels;
  return NULL;
}
static void unlock_video(void *opaque, void *picture, void *const *planes) {
  (void)opaque;
  (void)picture;
  (void)planes;
  video.ready = true;
  pthread_mutex_unlock(&video.mutex);
}
#include "media_ui.h"
// Browser uses the media state above.
#include "music_browser.h"

static void save_resume(void);
static void sfx_release_device(void);
static void stop_media(void) {
  if (player && active && !preview_mode && resume_pending_ms < 0) save_resume();
  active = false;
  playing_radio = false;
  playing_iptv = false;
  playing_news_video = false;
  if (player)
    libvlc_media_player_stop(player);
  pthread_mutex_lock(&video.mutex);
  video.ready = false;
  pthread_mutex_unlock(&video.mutex);
  if (video_texture) {
    SDL_DestroyTexture(video_texture);
    video_texture = NULL;
  }
  texture_w = texture_h = 0;
  paused = false;
  mode = 0;
  menu_dirty = true;
}
static void play_path(const char *path) {
  radio_cancel_retries();
  resume_pending_ms = -1;
  char saved[PATH_MAX];
  snprintf(saved, sizeof(saved), "%s", path);
  libvlc_media_t *m = libvlc_media_new_path(engine, saved);
  if (!m) {
    notify(tr("Não foi possível abrir a mídia"));
    return;
  }
  stop_media();
  sfx_release_device();
  snprintf(current_path, sizeof(current_path), "%s", saved);
  const char *name = strrchr(saved, '/');
  name = name ? name + 1 : saved;
  snprintf(media_name, sizeof(media_name), "%.511s", name);
  snprintf(title, sizeof(title), "%.511s", name);
  char *dot = strrchr(title, '.');
  if (dot)
    *dot = 0;
  artist[0] = album[0] = 0;
  playing_audio = audio_file(name);
  media_sample_rate = media_channels = media_bitrate_kbps = 0;
  media_ui_read_file_info(saved);
  load_lyrics(saved);
  load_cover(saved);
  apply_local_metadata(saved);
  plain_scroll = 0;
  queue_selected = queue_index;
  libvlc_media_player_set_media(player, m);
  libvlc_media_release(m);
  if (libvlc_media_player_play(player) < 0) {
    notify(tr("Falha ao iniciar. Consulte log.txt"));
    return;
  }
  active = true;
  meta_pending = true;
  meta_deadline = SDL_GetTicks() + 8000;
  meta_next = 0;
  libvlc_media_player_set_rate(player, playing_audio ? 1.0f : rate);
  mode = playing_audio ? 4 : 1;
  osd_until = SDL_GetTicks() + 3000;
  show_osd = true;
}
static void save_resume(void) {
  if (!active || playing_radio || !current_path[0] || strchr(current_path, '\n') || strchr(current_path, '\r')) return;
  long long pos = now_ms();
  if (pos < 0) return;
  char full[PATH_MAX];
  if (!realpath(current_path, full)) return;
  FILE *f = fopen("resume.tmp", "w");
  if (!f) return;
  bool ok = fprintf(f, "%lld\n%s\n", pos, full) > 0;
  if (fclose(f) == 0 && ok) rename("resume.tmp", "resume.cfg");
}
static void resume_last(void) {
  FILE *f = fopen("resume.cfg", "r");
  if (!f) { notify(tr("Nenhuma mídia para retomar")); return; }
  char line[PATH_MAX + 4], position[40], *end;
  bool ok = fgets(position, sizeof(position), f) && fgets(line, sizeof(line), f);
  fclose(f);
  if (!ok || !strchr(position, '\n') || !strchr(line, '\n')) { notify(tr("Nenhuma mídia para retomar")); return; }
  long long ms = strtoll(position, &end, 10);
  if (end == position || *end != '\n' || ms < 0 || ms > 604800000LL) { notify(tr("Nenhuma mídia para retomar")); return; }
  line[strcspn(line, "\r\n")] = 0;
  struct stat st;
  if (line[0] != '/' || !supported(line) || stat(line, &st) || !S_ISREG(st.st_mode)) {
    notify(tr("Nenhuma mídia para retomar")); return;
  }
  char *path = strdup(line);
  if (!path) return;
  clear_queue();
  queue_paths[0] = path;
  queue_count = 1;
  queue_index = queue_selected = 0;
  play_path(path);
  if (active && !strcmp(current_path, path)) {
    resume_pending_ms = ms;
    resume_deadline = SDL_GetTicks() + 15000;
  }
}
/* Local M3U entries only: reject streams and nested playlists. */
static bool load_local_playlist(const char *filename) {
  struct stat st;
  if (stat(filename, &st) || !S_ISREG(st.st_mode) || st.st_size > 1024 * 1024) return false;
  FILE *f = fopen(filename, "rb");
  if (!f) return false;
  char directory[PATH_MAX], line[PATH_MAX + 4], candidate[PATH_MAX], resolved[PATH_MAX];
  if (!realpath(filename, directory)) { fclose(f); return false; }
  char *slash = strrchr(directory, '/');
  if (!slash) { fclose(f); return false; }
  if (slash == directory) slash[1] = 0; else *slash = 0;
  char *paths[MAX_FILES];
  int count = 0;
  while (count < MAX_FILES && fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    if (n && line[n - 1] != '\n' && !feof(f)) {
      int ch; while ((ch = fgetc(f)) != '\n' && ch != EOF) {}
      continue;
    }
    while (n && (line[n - 1] == '\r' || line[n - 1] == '\n')) line[--n] = 0;
    char *entry = line;
    if (count == 0 && n >= 3 && !memcmp(entry, "\xef\xbb\xbf", 3)) entry += 3;
    while (*entry == ' ' || *entry == '\t') entry++;
    if (!*entry || *entry == '#' || strstr(entry, "://")) continue;
    int len = entry[0] == '/' ? snprintf(candidate, sizeof(candidate), "%s", entry)
                               : snprintf(candidate, sizeof(candidate), "%s/%s", directory, entry);
    if (len < 0 || len >= (int)sizeof(candidate) || !realpath(candidate, resolved) ||
        !audio_file(resolved) || stat(resolved, &st) || !S_ISREG(st.st_mode)) continue;
    paths[count] = strdup(resolved);
    if (!paths[count]) break;
    count++;
  }
  fclose(f);
  if (!count) return false;
  clear_queue();
  for (int i = 0; i < count; i++) queue_paths[i] = paths[i];
  queue_count = count;
  queue_index = queue_selected = 0;
  return true;
}
static void start_media(void) {
  if (!total)
    return;
  const char *path = items[selected].path;
  if (!path)
    return;
  if (items[selected].dir) {
    enter_folder(path);
    return;
  }
  if (playlist_file(path)) {
    if (load_local_playlist(path)) play_path(queue_paths[0]);
    else notify(tr("Playlist vazia ou inválida"));
    return;
  }
  build_queue();
  play_path(path);
}
static void parent_folder(void) {
  if (automatic_view) {
    automatic_view = false;
    favorites_view = false;
    menu_search[0] = 0;
    menu_search_kb = false;
    mode = 3;
    return;
  }
  if (!strcmp(folder, location_root) || !strcmp(folder, "/")) {
    show_locations();
    return;
  }
  char parent[PATH_MAX];
  snprintf(parent, sizeof(parent), "%s", folder);
  char *p = strrchr(parent, '/');
  if (p && p > parent)
    *p = 0;
  else
    snprintf(parent, sizeof(parent), "/");
  enter_folder(parent);
}
static void size_string(long long bytes, char *out, size_t n) {
  if (bytes >= 1024LL * 1024 * 1024)
    snprintf(out, n, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
  else
    snprintf(out, n, "%.1f MB", bytes / (1024.0 * 1024));
}
#include "sprites.h"
#include "sfx.h"
#include "skin.h"
typedef struct {
  const char *name;
  SDL_Color background, panel_color, raised, text, secondary, highlight, subdued;
} KpTheme;
static const KpTheme themes[] = {
  {"Preto e verde",    {18,18,18,255},   {24,24,24,255},   {36,36,36,255},   {255,255,255,255}, {179,179,179,255}, {29,185,84,255},   {145,145,145,255}},
  {"Preto e branco",   {15,15,15,255},   {28,28,28,255},   {45,45,45,255},   {255,255,255,255}, {190,190,190,255}, {245,245,245,255}, {150,150,150,255}},
  {"Branco e preto",   {248,248,248,255},{233,233,233,255},{218,218,218,255},{20,20,20,255},    {70,70,70,255},    {25,25,25,255},    {90,90,90,255}},
  {"Verde e preto",    {133,218,150,255},{166,231,179,255},{190,239,199,255},{12,35,18,255},    {32,78,43,255},    {10,45,20,255},    {39,91,50,255}},
  {"Preto e azul",     {11,17,29,255},   {19,29,46,255},   {31,45,68,255},   {245,249,255,255}, {178,193,212,255}, {102,182,255,255}, {149,165,184,255}},
  {"Preto e roxo",     {22,15,30,255},   {35,24,45,255},   {52,38,65,255},   {252,245,255,255}, {204,187,215,255}, {211,153,255,255}, {170,150,184,255}},
  {"Preto e vermelho", {24,14,15,255},   {39,23,24,255},   {59,35,36,255},   {255,246,246,255}, {218,185,185,255}, {255,139,139,255}, {185,149,149,255}},
  {"Preto e dourado",  {16,14,10,255},   {26,22,15,255},   {40,34,22,255},   {255,250,235,255}, {198,186,156,255}, {245,183,49,255},  {148,136,108,255}},
  {"Preto e ciano",    {9,18,22,255},    {15,28,35,255},   {24,43,53,255},   {240,253,255,255}, {162,202,212,255}, {34,211,238,255},  {116,155,166,255}},
  {"Preto e laranja",  {22,14,10,255},   {35,22,15,255},   {52,33,22,255},   {255,248,242,255}, {210,182,164,255}, {251,146,60,255},  {166,134,114,255}},
  {"Preto e rosa",     {24,13,22,255},   {38,20,34,255},   {56,30,50,255},   {255,244,252,255}, {214,178,205,255}, {244,114,182,255}, {170,132,160,255}},
  {"Meia-noite Neon",  {11,11,26,255},   {19,19,42,255},   {31,31,66,255},   {242,248,255,255}, {166,178,214,255}, {45,212,191,255},  {122,134,172,255}},
  {"Retrô Game Boy",   {155,188,15,255}, {139,172,15,255}, {122,156,16,255}, {15,56,15,255},    {40,86,36,255},    {15,56,15,255},    {48,98,48,255}},
  {"Oceano Profundo",  {7,19,32,255},    {12,31,52,255},   {20,46,74,255},   {240,249,255,255}, {158,192,220,255}, {56,189,248,255},  {114,150,180,255}}
};
#define THEME_COUNT ((int)(sizeof(themes) / sizeof(themes[0])))
static int theme_index;
static void apply_theme(int index) {
  if (index < 0 || index >= THEME_COUNT) index = 0;
  theme_index = index;
  kp_sprite_palette = index;
  const KpTheme *t = &themes[index];
  bg = t->background; panel = t->panel_color; elevated = t->raised;
  textc = t->text; muted = t->secondary; accent = t->highlight; dim = t->subdued;
}
static void save_settings(void);
static int kp_sys_inject_run(const char *cmd, const char *arg);
static bool kp_export_audio_payload(const char *out_path, const char *target_path,
                                    bool is_script, bool enable_miniplayer);
extern char **environ;
// Online radio uses the same skin primitives and libVLC player.
#include "radio.h"
#include "iptv.h"
#include "news.h"
#include "football.h"
#include "file_manager.h"
#include "bg_miniplayer.h"
#include "updater.h"
#include "weather.h"
#include "screensaver.h"
#include "splash.h"
// First-run screens use the skin drawing helpers.
#include "onboarding.h"
static void track_label(bool subtitle, char *out, size_t n) {
  int id =
      subtitle ? libvlc_video_get_spu(player) : libvlc_audio_get_track(player);
  if (subtitle && id < 0) {
    snprintf(out, n, "%s", tr("Desativada"));
    return;
  }
  libvlc_track_description_t *list =
      subtitle ? libvlc_video_get_spu_description(player)
               : libvlc_audio_get_track_description(player);
  snprintf(out, n, "%s", tr("Padrão"));
  for (libvlc_track_description_t *t = list; t; t = t->p_next)
    if (t->i_id == id) {
      snprintf(out, n, "%s", t->psz_name ? t->psz_name : tr("Faixa"));
      break;
    }
  libvlc_track_description_list_release(list);
}
/* Virtual typing search keyboard for Vídeos & Gerenciador de Arquivos (v2.0.6) */
static const char *menu_kb_rows[4] = {
    "1234567890",
    "QWERTYUIOP",
    "ASDFGHJKL-",
    "ZXCVBNM. _"
};

static void menu_apply_search_now(void) {
  menu_search_kb = false;
  if (automatic_view) populate_automatic_from_cache();
  else scan();
}

static void draw_menu_search_keyboard(void) {
  backdrop();
  draw_header("PESQUISA");
  label("Pesquisar Vídeos e Arquivos", 24, 42, 23, textc, 580);
  label("Digite parte do nome • B digita • A apaga/fecha • X espaço", 24, 72, 13, muted, 592);

  panel_card(24, 98, 592, 48, 12);
  char shown[80];
  snprintf(shown, sizeof(shown), "%.60s_", menu_search);
  label(shown[0] == '_' ? "Digite para filtrar..._" : shown, 40, 111, 18,
        menu_search[0] ? textc : muted, 560);

  const char *acts[3] = {"Buscar", "Limpar", "Voltar"};
  for (int i = 0; i < 3; i++) {
    bool focus = (menu_skb_row == 0 && menu_skb_col == i);
    card(24 + i * 200, 158, 192, 40, 10, focus, panel);
    centered(acts[i], 24 + i * 200, 169, 192, 15, focus ? accent : textc);
  }

  for (int r = 0; r < 4; r++) {
    int y = 212 + r * 58;
    for (int c = 0; c < 10; c++) {
      int x = 24 + c * 60;
      bool focus = (menu_skb_row == r + 1 && menu_skb_col == c);
      card(x, y, 54, 48, 10, focus, panel);
      char ch[4];
      char raw = menu_kb_rows[r][c];
      if (raw == ' ') snprintf(ch, sizeof(ch), "ESP");
      else { ch[0] = raw; ch[1] = 0; }
      centered(ch, x, y + 14, 54, raw == ' ' ? 12 : 17, focus ? accent : textc);
    }
  }
  footer_hints(NULL, 0);
}

static void menu_search_kb_key(SDL_Keycode k) {
  size_t len = strlen(menu_search);
  if (k == SDLK_UP) {
    menu_skb_row = (menu_skb_row + 4) % 5;
    if (menu_skb_row == 0 && menu_skb_col > 2) menu_skb_col = 2;
  } else if (k == SDLK_DOWN) {
    menu_skb_row = (menu_skb_row + 1) % 5;
    if (menu_skb_row == 0 && menu_skb_col > 2) menu_skb_col = 2;
  } else if (k == SDLK_LEFT) {
    int cols = menu_skb_row == 0 ? 3 : 10;
    menu_skb_col = (menu_skb_col + cols - 1) % cols;
  } else if (k == SDLK_RIGHT) {
    int cols = menu_skb_row == 0 ? 3 : 10;
    menu_skb_col = (menu_skb_col + 1) % cols;
  } else if (k == SDLK_BACKSPACE) {
    if (len > 0) menu_search[len - 1] = 0;
    else menu_apply_search_now();
  } else if (k == SDLK_SPACE) {
    if (len + 1 < sizeof(menu_search)) {
      menu_search[len] = ' ';
      menu_search[len + 1] = 0;
    }
  } else if (k == SDLK_RETURN) {
    if (menu_skb_row == 0) {
      if (menu_skb_col == 0) menu_apply_search_now();
      else if (menu_skb_col == 1) menu_search[0] = 0;
      else menu_apply_search_now();
    } else {
      char ch = menu_kb_rows[menu_skb_row - 1][menu_skb_col];
      if (len + 1 < sizeof(menu_search)) {
        menu_search[len] = ch;
        menu_search[len + 1] = 0;
      }
    }
  } else if ((k >= SDLK_a && k <= SDLK_z) || (k >= SDLK_0 && k <= SDLK_9) ||
             k == SDLK_MINUS || k == SDLK_PERIOD) {
    if (len + 1 < sizeof(menu_search)) {
      menu_search[len] = (char)k;
      menu_search[len + 1] = 0;
    }
  }
  menu_dirty = true;
}

/* Contextual vertical Options menu (v2.0.6):
 * - General root (OPT_SEC_ROOT): strictly alphabetical (A-Z), no player/TV/radio clutter,
 *   penultimate [A] Verificar atualizacoes, last Sair.
 * - Video player (OPT_SEC_VIDEO), Music player (OPT_SEC_MUSIC),
 *   TV/IPTV (OPT_SEC_IPTV), Radio (OPT_SEC_RADIO): contextual options only! */
enum {
  OPT_SEC_ROOT = 0,
  OPT_SEC_WEATHER = 1,
  OPT_SEC_UPDATE = 2,
  OPT_SEC_VIDEO = 3,
  OPT_SEC_MUSIC = 4,
  OPT_SEC_IPTV = 5,
  OPT_SEC_RADIO = 6,
  OPT_SEC_SCREENSAVER = 7
};

static int opt_section = OPT_SEC_ROOT;
static int opt_entry_section = OPT_SEC_ROOT;
static int opt_cursor = 0;
static int opt_scroll = 0;

/* General Root order (strict A-Z, then penultimate [A] Verificar atualizacoes, then last Sair):
 * 18=Adaptacao de tela, 22=Clima e Localizacao, 5=Idioma,
 * 24=Layout da tela inicial, 27=Mini-Player no Sistema Inteiro,
 * 25=Protetor de tela, 20=Rever comandos, 28=Secao +18, 26=Sons das teclas,
 * 9=Tema, 6=Termos de uso, 15=Timer de sono,
 * 19=[A] Verificar atualizacoes (penultimate), 8=Sair (last). */
static const int opt_root_ids[] = {18, 22, 5, 24, 27, 25, 20, 28, 26, 9, 6, 15, 19, 8};
#define OPT_ROOT_COUNT ((int)(sizeof(opt_root_ids) / sizeof(opt_root_ids[0])))

static const int opt_weather_ids[] = {30, 31, 32, 11, 33, -99};
#define OPT_WEATHER_COUNT 6

static const int opt_update_ids[] = {40, 41, -99};
#define OPT_UPDATE_COUNT 3

static const int opt_screensaver_ids[] = {70, 71, 72, 73, 74, -99};
#define OPT_SCREENSAVER_COUNT 6

/* Video player contextual options ONLY */
static const int opt_video_ids[] = {0, 1, 2, 3, 4, 14, -98};
#define OPT_VIDEO_COUNT 7

/* Music player contextual options ONLY */
static const int opt_music_ids[] = {12, 16, 7, 13, 4, 14, 0, 25, 15, -98};
#define OPT_MUSIC_COUNT 10

/* TV / IPTV contextual options ONLY */
static const int opt_iptv_ids[] = {50, 51, 52, 53, 54, 6, -98};
#define OPT_IPTV_COUNT 7

/* Radio contextual options ONLY */
static const int opt_radio_ids[] = {60, 61, 62, 25, 15, 6, -98};
#define OPT_RADIO_COUNT 7

typedef struct {
  const char *btn;
  const char *action;
} CommandRow;

static const CommandRow opt_commands[] = {
    {"DIR", "Navegar menus, listas e avançar/voltar 10s"},
    {"B", "Confirmar, abrir item ou pausar/retomar"},
    {"A", "Voltar à tela anterior ou fechar menu"},
    {"X", "Clima (Início), trocar abas ou ocultar OSD"},
    {"Y", "Atualizar listas, trocar cidade ou opções"},
    {"L1 / R1", "Pesquisar (TV/Séries/Vídeos) ou trocar faixa"},
    {"START", "Pausar / retomar reprodução rapidamente"},
    {"SELECT", "Abrir opções da tela atual e atualizações"},
};
#define OPT_COMMANDS_COUNT ((int)(sizeof(opt_commands) / sizeof(opt_commands[0])))

static void draw_tutorial(void) {
  backdrop();
  draw_header("COMANDOS");
  label(tutorial_from_options ? "Comandos do R36S" : "Bem-vindo! Conheça os Comandos",
        24, 42, 23, textc, 592);
  label(tutorial_from_options
            ? "Guia rápido dos botões • Pressione B ou A para voltar"
            : "Tutorial inicial • Você pode rever em Opções › Rever comandos",
        24, 72, 13, muted, 592);

  for (int i = 0; i < OPT_COMMANDS_COUNT; i++) {
    int y = 98 + i * 38;
    panel_card(20, y, 600, 34, 10);
    rounded(30, y + 5, 96, 24, 8, alpha(accent, 40));
    centered(opt_commands[i].btn, 30, y + 10, 96, 12, accent);
    label(opt_commands[i].action, 138, y + 9, 14, textc, 470);
  }

  rounded(20, 416, 600, 48, 12, accent);
  centered(tutorial_from_options
               ? "B ou A  •  Voltar às Opções"
               : "B  •  Entendi, começar a usar o K PLAYER",
           20, 430, 600, 16, bg);
  footer_hints(NULL, 0);
}

static void opt_enter_section(int sec);

static void tutorial_key(SDL_Keycode k) {
  if (k == SDLK_RETURN || k == SDLK_BACKSPACE || k == SDLK_SPACE || k == SDLK_m) {
    if (tutorial_from_options) {
      tutorial_from_options = false;
      mode = 2;
      opt_enter_section(OPT_SEC_ROOT);
    } else {
      tutorial_done = true;
      save_settings();
      mode = strcmp(seen_version, KPLAYER_VERSION) != 0 ? 14 : 3;
    }
    menu_dirty = true;
  }
}

/* One-time Post-Update Changelog Screen (mode 14) — shown once per new version. */
static char changelog_items[6][160];
static int changelog_count = 0;
static bool changelog_loaded = false;

static void changelog_ensure_loaded(void) {
  if (changelog_loaded) return;
  changelog_loaded = true;
  changelog_count = 0;
  FILE *f = fopen("changelog.txt", "r");
  if (f) {
    char line[256];
    while (changelog_count < 6 && fgets(line, sizeof(line), f)) {
      size_t len = strlen(line);
      while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r' || line[len - 1] == ' '))
        line[--len] = 0;
      char *p = line;
      while (*p == ' ' || *p == '\t' || *p == '-') p++;
      if (*p)
        snprintf(changelog_items[changelog_count++], sizeof(changelog_items[0]), "%.159s", p);
    }
    fclose(f);
  }
  if (changelog_count == 0) {
    static const char *const builtin[] = {
        "Mini-Player nativo nos ports (L3 + R3): sempre pronto ao abrir jogos pelo Gerenciador de Arquivos, com escolha entre iniciar com ou sem Mini-Player.",
        "Nova opcao Mini-Player no Sistema Inteiro (SELECT -> Opcoes): script dedicado desativa a musica do EmulationStation e injeta o Mini-Player no console.",
        "Injecao persistente no sistema: continua ativo mesmo apos reiniciar o R36S e so pode ser desativado dentro das Opcoes do KPlayer (restaurando a musica do ES).",
        "Design proprio do KPlayer no overlay GLES2/EGL/SDL2 (libkp_overlay.so) com sincronizacao automatica de playlist, radio e tema ativo.",
        "Base completa mantida: Leitor de PDF (PdfCraft R36S), Editor de Texto nativo, 7-Zip oficial, Radio Online, IPTV + EPG, Noticias e Clima.",
    };
    int n = (int)(sizeof(builtin) / sizeof(builtin[0]));
    for (int i = 0; i < n && changelog_count < 6; i++)
      snprintf(changelog_items[changelog_count++], sizeof(changelog_items[0]), "%.159s", builtin[i]);
  }
}

static int changelog_scroll = 0;

static void draw_changelog(void) {
  changelog_ensure_loaded();
  backdrop();
  draw_header("NOVIDADES");
  char heading[96];
  snprintf(heading, sizeof(heading), "Novidades da versão v%s", KPLAYER_VERSION);
  label(heading, 24, 42, 24, textc, 592);
  label("O que mudou nesta atualização • exibido apenas uma vez", 24, 71, 13, muted, 592);

  /* Single unified frame for the entire changelog (v2.1.3) */
  const int bx = 20, by = 94, bw = 600, bh = 312;
  panel_card(bx, by, bw, bh, 14);

  int count = changelog_count;
  int max_visible = 5;
  int max_scroll = count > max_visible ? count - max_visible : 0;
  if (changelog_scroll < 0) changelog_scroll = 0;
  if (changelog_scroll > max_scroll) changelog_scroll = max_scroll;

  int visible = count - changelog_scroll;
  if (visible > max_visible) visible = max_visible;
  int row_h = visible <= 4 ? 72 : 58;
  int y = by + 10;

  for (int i = 0; i < visible; i++) {
    int idx = changelog_scroll + i;
    if (i > 0)
      rect(bx + 18, y - 3, bw - 36, 1, hairline());
    fill_circle(bx + 24, y + 18, 4, accent);
    wrapped(changelog_items[idx], bx + 40, y + 8, bw - 62, 13, 17, 3, textc);
    y += row_h;
  }

  if (max_scroll > 0) {
    char pg[48];
    snprintf(pg, sizeof(pg), "D-Pad rolar (%d/%d)", changelog_scroll + 1, max_scroll + 1);
    int pw = (int)measure(pg, 11);
    label(pg, bx + bw - pw - 14, by + bh - 18, 11, muted, 160);
  }

  rounded(20, 418, 600, 46, 12, accent);
  centered("B  •  Continuar para o K PLAYER", 20, 431, 600, 16, bg);
  footer_hints(NULL, 0);
}

static void changelog_key(SDL_Keycode k) {
  int max_scroll = changelog_count > 5 ? changelog_count - 5 : 0;
  if (k == SDLK_UP && changelog_scroll > 0) {
    changelog_scroll--;
    return;
  }
  if (k == SDLK_DOWN && changelog_scroll < max_scroll) {
    changelog_scroll++;
    return;
  }
  if (k == SDLK_RETURN || k == SDLK_BACKSPACE || k == SDLK_SPACE || k == SDLK_m) {
    snprintf(seen_version, sizeof(seen_version), "%s", KPLAYER_VERSION);
    save_settings();
    changelog_scroll = 0;
    mode = 3;
    menu_dirty = true;
  }
}

static int opt_current_list(const int **out_ids) {
  switch (opt_section) {
  case OPT_SEC_WEATHER:
    *out_ids = opt_weather_ids;
    return OPT_WEATHER_COUNT;
  case OPT_SEC_UPDATE:
    *out_ids = opt_update_ids;
    return OPT_UPDATE_COUNT;
  case OPT_SEC_VIDEO:
    *out_ids = opt_video_ids;
    return OPT_VIDEO_COUNT;
  case OPT_SEC_MUSIC:
    *out_ids = opt_music_ids;
    return OPT_MUSIC_COUNT;
  case OPT_SEC_IPTV:
    *out_ids = opt_iptv_ids;
    return OPT_IPTV_COUNT;
  case OPT_SEC_RADIO:
    *out_ids = opt_radio_ids;
    return OPT_RADIO_COUNT;
  case OPT_SEC_SCREENSAVER:
    *out_ids = opt_screensaver_ids;
    return OPT_SCREENSAVER_COUNT;
  default:
    *out_ids = opt_root_ids;
    return OPT_ROOT_COUNT;
  }
}

static void opt_sync_option_id(void) {
  const int *ids = NULL;
  int cnt = opt_current_list(&ids);
  if (cnt <= 0) return;
  if (opt_cursor < 0) opt_cursor = 0;
  if (opt_cursor >= cnt) opt_cursor = cnt - 1;
  option = ids[opt_cursor];
}

static void opt_enter_section(int sec) {
  if (opt_section == OPT_SEC_UPDATE && sec != OPT_SEC_UPDATE)
    updater_disarm_reinstall();
  opt_section = sec;
  opt_cursor = 0;
  opt_scroll = 0;
  opt_sync_option_id();
}

static const char *opt_label_for(int id) {
  switch (id) {
  case 0: return tr("Velocidade");
  case 1: return tr("Formato da imagem");
  case 2: return tr("Faixa de áudio");
  case 3: return tr("Legendas");
  case 4: return tr("Modo de repetição");
  case 5: return tr("Idioma");
  case 6: return tr("Termos de uso");
  case 7: return tr("Favoritar faixa");
  case 8: return tr("Sair");
  case 9: return tr("Tema");
  case 11: return tr("Localização na barra");
  case 12: return tr("Aleatório");
  case 13: return tr("Minhas favoritas");
  case 14: return tr("Retomar mídia");
  case 15: return tr("Timer de sono");
  case 16: return tr("Equalizador");
  case 18: return tr("Adaptação de tela");
  case 19: return "Verificar atualizações";
  case 20: return "Rever comandos";
  case 22: return "Clima e Localização";
  case 24: return "Layout da tela inicial";
  case 25: return "Protetor de tela";
  case 26: return "Sons das teclas";
  case 27: return "Mini-Player no Sistema Inteiro";
  case 28: return "Seção +18";
  case 30: return "Abrir aplicativo de Clima";
  case 31: return "Usar localização do meu IP";
  case 32: return "Pesquisar cidade manualmente";
  case 33: return "Limpar localização salva";
  case 40: return "Verificar nova versão agora";
  case 41: {
    pthread_mutex_lock(&kp_upd_mutex);
    bool avail = kp_upd_available;
    bool armed = kp_upd_reinstall_armed;
    pthread_mutex_unlock(&kp_upd_mutex);
    if (avail) return "Baixar e atualizar (sem perder dados)";
    if (armed) return "CONFIRMAR: Reinstalar mesma versão agora";
    return "Reinstalar mesma versão (com aviso)";
  }
  case 50: return "Pesquisar canais / séries / filmes";
  case 51: return "Limpar pesquisa IPTV";
  case 52: return "Alternar aba IPTV";
  case 53: return "Atualizar listas e EPG";
  case 54: return "Adicionar URL M3U (Usuário)";
  case 60: return "Favoritar estação atual";
  case 61: return "Categoria de rádio";
  case 62: return "Atualizar estações";
  case 70: return "Tempo para ativar";
  case 71: return "Visualizador (WMP)";
  case 72: return "Relógio, data e clima";
  case 73: return "Letras sobre visualizador";
  case 74: return "Iniciar protetor agora";
  case -98: return "Configurações gerais ›";
  case -99: return "← Voltar às Opções";
  default: return "";
  }
}

static void opt_value_for(int id, char *value, size_t cap) {
  value[0] = 0;
  switch (id) {
  case 0:
    snprintf(value, cap, "%.2fx", rate);
    break;
  case 1:
    snprintf(value, cap, "%s",
             fit == 0   ? tr("Proporção original")
             : fit == 1 ? tr("Preencher (corte)")
                        : tr("Esticar"));
    break;
  case 2:
  case 3:
    if (options_from_video && !preview_mode)
      track_label(id == 3, value, cap);
    else
      snprintf(value, cap, "%s", tr("Abra uma mídia"));
    break;
  case 4:
    snprintf(value, cap, "%s",
             repeat_mode == 1   ? tr("Repetir faixa")
             : repeat_mode == 2 ? tr("Repetir fila")
                                : tr("Desativada"));
    break;
  case 5:
    snprintf(value, cap, "%s", language_names[language]);
    break;
  case 6:
    snprintf(value, cap, "%s", tr("Abrir"));
    break;
  case 7:
    snprintf(value, cap, "%s",
             active && playing_audio
                 ? (is_favorite() ? tr("Ativada") : tr("Desativada"))
                 : tr("Abra uma mídia"));
    break;
  case 8:
    value[0] = 0; /* Only "Sair", nothing extra */
    break;
  case 9:
    snprintf(value, cap, "%s", tr(themes[theme_index].name));
    break;
  case 11:
    snprintf(value, cap, "%s", tr(network_location_enabled ? "Ativada" : "Desativada"));
    break;
  case 12:
    snprintf(value, cap, "%s", tr(shuffle_enabled ? "Ativada" : "Desativada"));
    break;
  case 15: {
    const int minutes[] = {0, 15, 30, 60, 90, 120};
    if (sleep_choice) snprintf(value, cap, "%d min", minutes[sleep_choice]);
    else snprintf(value, cap, "%s", tr("Desativada"));
    break;
  }
  case 16:
    if (eq_choice && eq_name_fn) {
      const char *name = eq_name_fn((unsigned)eq_choice - 1);
      snprintf(value, cap, "%s", name ? name : "-");
    } else snprintf(value, cap, "%s", tr("Desativada"));
    break;
  case 18:
    if (display_mode == 0)
      snprintf(value, cap, "Auto (%dx%d)", dev_w, dev_h);
    else if (display_mode == 1)
      snprintf(value, cap, "%s", tr("Preencher tela"));
    else
      snprintf(value, cap, "%s", tr("Clássico 4:3"));
    break;
  case 19: {
    char lat[32] = "";
    if (updater_is_available(lat, sizeof(lat)))
      snprintf(value, cap, "v%.31s disponível", lat);
    else
      snprintf(value, cap, "v%s", KPLAYER_VERSION);
    break;
  }
  case 20:
    snprintf(value, cap, "%d comandos ›", OPT_COMMANDS_COUNT);
    break;
  case 22: {
    pthread_mutex_lock(&weather_mutex);
    int wm = weather_mode;
    char cname[64];
    snprintf(cname, sizeof(cname), "%.63s", weather_saved_city.name);
    pthread_mutex_unlock(&weather_mutex);
    if (wm == WEATHER_MODE_IP) snprintf(value, cap, "IP: %.48s", cname[0] ? cname : "Auto");
    else if (wm == WEATHER_MODE_MANUAL && cname[0]) snprintf(value, cap, "%.56s", cname);
    else snprintf(value, cap, "Configurar ›");
    break;
  }
  case 24:
    snprintf(value, cap, "%s", home_layout_inverted ? "Invertido (Clima topo)" : "Clima grande embaixo");
    break;
  case 25:
    snprintf(value, cap, "%s ›", ss_timeout_labels[ss_timeout_idx % SS_TIMEOUT_COUNT]);
    break;
  case 26:
    snprintf(value, cap, "%s", tr(ui_sfx_enabled ? "Ativada" : "Desativada"));
    break;
  case 27:
    snprintf(value, cap, "%s",
             system_miniplayer_installed ? "Injetado (R36S)" : "Desativado");
    break;
  case 28:
    snprintf(value, cap, "%s",
             adult_section_unlocked ? "Desbloqueado" : "Bloqueado");
    break;
  case 30:
    snprintf(value, cap, "Open-Meteo ›");
    break;
  case 31:
    snprintf(value, cap, weather_mode == WEATHER_MODE_IP ? "Ativo" : "Detectar");
    break;
  case 32:
    snprintf(value, cap, "Buscar ›");
    break;
  case 33:
    snprintf(value, cap, weather_mode == WEATHER_MODE_UNSET ? "Sem local" : "Remover");
    break;
  case 40:
    snprintf(value, cap, "GitHub updates/");
    break;
  case 41: {
    char lat[32] = "";
    if (updater_is_available(lat, sizeof(lat)))
      snprintf(value, cap, "Instalar v%.31s", lat);
    else
      snprintf(value, cap, "Preserva dados");
    break;
  }
  case 50:
    if (iptv_search_query[0]) snprintf(value, cap, "Filtro: %.40s", iptv_search_query);
    else snprintf(value, cap, "Teclado ›");
    break;
  case 51:
    snprintf(value, cap, iptv_search_query[0] ? "Limpar filtro" : "Sem filtro");
    break;
  case 52:
    snprintf(value, cap, "%s",
             iptv_source == 0 ? "Canais"
             : iptv_source == 1 ? "Filmes"
             : iptv_source == 2 ? "Séries"
                                : "Usuário");
    break;
  case 53:
    snprintf(value, cap, "Atualizar");
    break;
  case 54:
    snprintf(value, cap, "Inserir link ›");
    break;
  case 60:
    snprintf(value, cap, radio_count > 0 ? "Alternar" : "Sem estação");
    break;
  case 61:
    snprintf(value, cap, "%s", tr(radio_filter_names[radio_filter % 7]));
    break;
  case 62:
    snprintf(value, cap, "Recarregar");
    break;
  case 70:
    snprintf(value, cap, "%s", ss_timeout_labels[ss_timeout_idx % SS_TIMEOUT_COUNT]);
    break;
  case 71:
    snprintf(value, cap, "%s", ss_viz_labels[ss_viz_style % SS_VIZ_COUNT]);
    break;
  case 72:
    snprintf(value, cap, "%s", tr(ss_show_clock ? "Ativada" : "Desativada"));
    break;
  case 73:
    snprintf(value, cap, "%s", tr(ss_show_lyrics ? "Ativada" : "Desativada"));
    break;
  case 74:
    snprintf(value, cap, "Testar ›");
    break;
  case -98:
    snprintf(value, cap, "Tema, Clima, Update");
    break;
  case -99:
    value[0] = 0;
    break;
  default:
    snprintf(value, cap, "%s", tr("Abrir"));
  }
}

static void draw_options(void) {
  backdrop();
  draw_header(tr("OPÇÕES"));

  const char *sec_title = tr("Opções");
  const char *sec_sub = "Configurações gerais (ordem alfabética)";
  if (opt_section == OPT_SEC_WEATHER) {
    sec_title = "Clima e Localização";
    sec_sub = "API Open-Meteo • IP automático ou busca manual";
  } else if (opt_section == OPT_SEC_UPDATE) {
    sec_title = "Verificar atualizações";
    sec_sub = "Auto-update pela pasta updates/ do GitHub sem perda de dados";
  } else if (opt_section == OPT_SEC_VIDEO) {
    sec_title = "Opções do Player de Vídeo";
    sec_sub = "Controles exclusivos da reprodução de vídeo";
  } else if (opt_section == OPT_SEC_MUSIC) {
    sec_title = "Opções de Música";
    sec_sub = "Aleatório, equalizador, favoritas e repetição";
  } else if (opt_section == OPT_SEC_IPTV) {
    sec_title = "Opções de TV e Séries";
    sec_sub = "Pesquisa digitada, abas, atualização e links M3U";
  } else if (opt_section == OPT_SEC_RADIO) {
    sec_title = "Opções de Rádio Online";
    sec_sub = "Favoritas, categorias, protetor de tela e timer de sono";
  } else if (opt_section == OPT_SEC_SCREENSAVER) {
    sec_title = "Protetor de Tela";
    sec_sub = "Visualizadores estilo WMP, relógio/data/clima e letras (.LRC) ao tocar música/rádio";
  }
  label(sec_title, 24, 42, 23, textc, 580);
  label(sec_sub, 24, 71, 12, muted, 592);

  int list_top = 96;
  int visible_rows = 8;

  if (opt_section == OPT_SEC_UPDATE) {
    pthread_mutex_lock(&kp_upd_mutex);
    bool avail = kp_upd_available;
    bool checking = kp_upd_checking;
    bool applying = kp_upd_applying;
    bool armed = kp_upd_reinstall_armed;
    int prog = kp_upd_progress;
    char cur[32], lat[32], nxt[32], src[32], msg[192], repo[128];
    char stage[96], detail[128];
    int ncnt = kp_upd_note_count;
    if (ncnt < 0) ncnt = 0;
    if (ncnt > 4) ncnt = 4;
    char notes[4][160];
    snprintf(cur, sizeof(cur), "%.31s", kp_upd_current);
    snprintf(lat, sizeof(lat), "%.31s", kp_upd_latest);
    snprintf(nxt, sizeof(nxt), "%.31s", kp_upd_next);
    snprintf(src, sizeof(src), "%.31s", kp_upd_source);
    snprintf(msg, sizeof(msg), "%.191s", kp_upd_message);
    snprintf(repo, sizeof(repo), "%.127s", kp_upd_repo);
    snprintf(stage, sizeof(stage), "%.95s", kp_upd_stage);
    snprintf(detail, sizeof(detail), "%.127s", kp_upd_detail);
    for (int i = 0; i < ncnt; i++)
      snprintf(notes[i], sizeof(notes[i]), "%.159s", kp_upd_notes[i]);
    pthread_mutex_unlock(&kp_upd_mutex);

    panel_card(24, 94, 592, 188, 12);
    char hdr[128];
    if (avail) snprintf(hdr, sizeof(hdr), "Nova versão disponível: v%.31s", lat);
    else snprintf(hdr, sizeof(hdr), "Versão instalada: v%.31s (mesma versão mais recente)", cur);
    label(hdr, 40, 102, 15, avail ? accent : textc, 430);
    label(!strcmp(src, "github") || !strcmp(src, "github-release") ? "GitHub Online" : "Canal Local",
          480, 104, 11, avail ? accent : muted, 124);

    if (repo[0]) {
      char rline[192];
      snprintf(rline, sizeof(rline), "Repositório: %.127s (updates/latest.json)", repo);
      label(rline, 40, 123, 11, muted, 560);
    } else {
      label("Repositório: configurado automaticamente na build do GitHub (update-repo.txt)",
            40, 123, 11, muted, 560);
    }

    /* Live KPlayer Update Loading Bar */
    int bx = 40, by = 144, bw = 560, bh = 16;
    if (prog < 0) prog = 0;
    if (prog > 100) prog = 100;
    const char *bar_stage = stage[0]
                                ? stage
                                : (applying ? "Atualizando KPlayer..."
                                   : checking ? "Verificando atualizações..."
                                   : avail ? "Atualização pronta para baixar"
                                           : "Mesma versão instalada (reinstalação disponível)");
    char pct_txt[16];
    snprintf(pct_txt, sizeof(pct_txt), "%d%%", prog);
    label(bar_stage, bx, by, 12, (checking || applying || avail || armed) ? accent : textc, 480);
    label(pct_txt, bx + bw - 48, by, 12, (checking || applying || prog == 100) ? accent : muted, 48);

    int ty = by + 18;
    rounded(bx, ty, bw, bh, 8, track_color());
    int fill_w = (bw * prog) / 100;
    if ((checking || applying) && fill_w < 24) fill_w = 24;
    if (fill_w > bw) fill_w = bw;
    if (fill_w > 0) {
      rounded(bx, ty, fill_w, bh, 8, accent);
      if (checking || applying) {
        /* Animated shimmer highlight sliding along the progress bar */
        uint32_t tk = SDL_GetTicks();
        int sw = 48;
        int sx = bx + (int)((tk / 8u) % (uint32_t)(fill_w + sw)) - sw;
        int clip_x = sx < bx ? bx : sx;
        int clip_r = (sx + sw) > (bx + fill_w) ? (bx + fill_w) : (sx + sw);
        if (clip_r > clip_x + 4)
          rounded(clip_x, ty + 2, clip_r - clip_x, bh - 4, 6, alpha(textc, 95));
      }
    }
    const char *bar_detail = detail[0] ? detail : (msg[0] ? msg : "Preserva favoritos, histórico, listas e ajustes.");
    label(bar_detail, bx, ty + 21, 11, (checking || applying) ? textc : muted, bw);

    if (!avail && !checking && !applying) {
      /* Explicit warning banner for same-version update / reinstall */
      SDL_Color warn_c = {245, 190, 66, 255};
      rounded_gradient(36, 205, 568, 44, 9, alpha(warn_c, armed ? 68 : 34), alpha(warn_c, armed ? 36 : 16));
      rounded_outline(36, 205, 568, 44, 9, alpha(warn_c, armed ? 220 : 135));
      if (armed) {
        char w1[160];
        snprintf(w1, sizeof(w1), "AVISO: Mesma versão (v%.31s)! Pressione B novamente para confirmar.", cur);
        label(w1, 48, 211, 11, warn_c, 544);
        label("Todos os seus favoritos, histórico, listas, clima e notícias serão preservados.",
              48, 229, 10, textc, 544);
      } else {
        char w1[160];
        snprintf(w1, sizeof(w1), "AVISO: Você já está na versão v%.31s (monitorando v%.31s+).", cur, nxt);
        label(w1, 48, 211, 11, warn_c, 544);
        label("Você ainda pode atualizar para reinstalar o pacote desta versão mantendo seus dados.",
              48, 229, 10, muted, 544);
      }
    } else {
      for (int i = 0; i < ncnt && i < 2; i++) {
        char nb[176];
        snprintf(nb, sizeof(nb), "• %.159s", notes[i]);
        label(nb, 40, 206 + i * 17, 11, muted, 560);
      }
    }
    label("Preservados no update: favoritos, histórico, listas IPTV/Rádio, clima e ajustes.",
          40, 258, 10, dim, 560);

    list_top = 294;
    visible_rows = 3;
  }

  const int *ids = NULL;
  int cnt = opt_current_list(&ids);
  if (opt_cursor >= cnt && cnt > 0) opt_cursor = cnt - 1;
  if (opt_cursor < opt_scroll) opt_scroll = opt_cursor;
  if (opt_cursor >= opt_scroll + visible_rows) opt_scroll = opt_cursor - visible_rows + 1;

  for (int row = 0; row < visible_rows && opt_scroll + row < cnt; row++) {
    int idx = opt_scroll + row;
    int id = ids[idx];
    int y = list_top + row * 46;
    bool focus = (idx == opt_cursor);
    card(24, y, 592, 41, 10, focus, panel);

    int text_x = 40;
    if (id == 19) {
      /* Penultimate item: ONLY "A" badge + "Verificar atualizacoes" */
      rounded(36, y + 8, 25, 25, 7, focus ? accent : alpha(accent, 42));
      centered("A", 36, y + 12, 25, 14, focus ? bg : accent);
      text_x = 70;
    }

    label(opt_label_for(id), text_x, y + 10, 17,
          focus ? accent : textc, 330);

    char val[160];
    opt_value_for(id, val, sizeof(val));
    if (val[0]) label(val, 372, y + 11, 15, focus ? accent : muted, 230);
  }
  footer_hints(NULL, 0);
}

static void cycle_track(bool subtitle, int dir) {
  libvlc_track_description_t *list =
      subtitle ? libvlc_video_get_spu_description(player)
               : libvlc_audio_get_track_description(player);
  int ids[128], count = 0, index = 0,
                current = subtitle ? libvlc_video_get_spu(player)
                                   : libvlc_audio_get_track(player);
  for (libvlc_track_description_t *t = list; t && count < 128; t = t->p_next) {
    if (t->i_id == current)
      index = count;
    ids[count++] = t->i_id;
  }
  if (count) {
    int id = ids[(index + dir + count) % count];
    if (subtitle)
      libvlc_video_set_spu(player, id);
    else
      libvlc_audio_set_track(player, id);
  }
  libvlc_track_description_list_release(list);
}
static void change_option(int dir) {
  switch (option) {
  case 0: {
    float newrate = rate + dir * .25f;
    if (newrate < .5f)
      newrate = 2;
    if (newrate > 2)
      newrate = .5f;
    if (!options_from_video || playing_audio ||
        libvlc_media_player_set_rate(player, newrate) == 0)
      rate = newrate;
    break;
  }
  case 1:
    fit = (fit + dir + 3) % 3;
    break;
  case 2:
  case 3:
    if (options_from_video)
      cycle_track(option == 3, dir);
    break;
  case 4:
    repeat_mode = (repeat_mode + dir + 3) % 3;
    loop_video = repeat_mode == 1;
    save_settings();
    break;
  case 5: {
    int old = language;
    language = (language + dir + 3) % 3;
    if (!save_preferences(onboarding_done)) {
      language = old;
      notify(tr("Não foi possível salvar. Verifique o cartão."));
    }
    status_next = 0;
    break;
  }
  case 6:
    open_terms(2);
    break;
  case 7:
    if (active && playing_audio)
      toggle_favorite();
    else
      notify(tr("Abra uma mídia"));
    break;
  case 8:
    running = 0;
    break;
  case 9:
    apply_theme((theme_index + dir + THEME_COUNT) % THEME_COUNT);
    save_settings();
    break;
  case 11:
    network_location_enabled = !network_location_enabled;
    if (network_location_enabled) network_location_start();
    save_settings();
    break;
  case 12:
    shuffle_enabled = !shuffle_enabled;
    memset(shuffle_seen, 0, sizeof(shuffle_seen));
    shuffle_seen_count = 0;
    save_settings();
    break;
  case 13:
    favorites_view = true;
    category = 1;
    scan_automatic_media();
    break;
  case 14:
    resume_last();
    break;
  case 15: {
    const int minutes[] = {0, 15, 30, 60, 90, 120};
    sleep_choice = (sleep_choice + dir + 6) % 6;
    sleep_end = sleep_choice ? SDL_GetTicks() + (uint32_t)minutes[sleep_choice] * 60000u : 0;
    break;
  }
  case 16:
    if (eq_count_fn && eq_new_fn && eq_release_fn && eq_apply_fn && eq_name_fn) {
      unsigned count = eq_count_fn();
      if (count > 100) count = 100;
      int previous = eq_choice;
      eq_choice = (eq_choice + dir + (int)count + 1) % ((int)count + 1);
      if (!apply_equalizer()) { eq_choice = previous; notify(tr("Equalizador indisponível")); }
    } else notify(tr("Equalizador indisponível"));
    break;
  case 18:
    display_mode = (display_mode + dir + 3) % 3;
    refresh_device_display();
    save_settings();
    break;
  case 19:
    opt_enter_section(OPT_SEC_UPDATE);
    break;
  case 20:
    tutorial_from_options = true;
    mode = 12;
    break;
  case 22:
    opt_enter_section(OPT_SEC_WEATHER);
    break;
  case 24:
    home_layout_inverted = !home_layout_inverted;
    save_settings();
    notify(home_layout_inverted
               ? "Início invertido: Clima no topo e Player embaixo"
               : "Início padrão: Mini player no topo e Clima grande embaixo");
    break;
  case 25:
    opt_enter_section(OPT_SEC_SCREENSAVER);
    break;
  case 26:
    ui_sfx_enabled = !ui_sfx_enabled;
    save_settings();
    if (ui_sfx_enabled) sfx_play(SFX_CONFIRM);
    else sfx_release_device();
    notify(ui_sfx_enabled ? "Sons das teclas ativados" : "Sons das teclas desativados");
    break;
  case 27: {
    bool want_install = !system_miniplayer_installed;
    if (want_install) {
      kp_export_audio_payload("system-audio.json", "", false, true);
      int rc = kp_sys_inject_run("install", "system-audio.json");
      if (rc == 0) {
        system_miniplayer_installed = true;
        bg_audio_preview = true;
        save_settings();
        notify("Mini-Player injetado no sistema! Música do ES desativada (L3 + R3)");
      } else {
        notify("Falha ao injetar no sistema (requer R36S root e libkp_overlay.so)");
      }
    } else {
      int rc = kp_sys_inject_run("uninstall", NULL);
      if (rc == 0) {
        system_miniplayer_installed = false;
        bg_audio_preview = false;
        save_settings();
        notify("Mini-Player removido do sistema e música do EmulationStation restaurada");
      } else {
        notify("Falha ao remover injeção do sistema");
      }
    }
    break;
  }
  case 28:
    if (!adult_section_unlocked) {
      open_stream_notice(18, 2);
    } else {
      adult_section_unlocked = false;
      if (iptv_source == 4) iptv_source = 0;
      save_settings();
      notify("Seção +18 bloqueada e oculta do IPTV");
    }
    break;
  case 30:
    weather_open(2);
    break;
  case 31:
    weather_start_ip(true);
    weather_open(2);
    break;
  case 32:
    weather_open_manual_search(2);
    break;
  case 33:
    weather_clear_location();
    notify("Localização do clima removida");
    break;
  case 40:
    updater_start_check(true);
    break;
  case 41: {
    pthread_mutex_lock(&kp_upd_mutex);
    bool avail = kp_upd_available;
    bool armed = kp_upd_reinstall_armed;
    bool busy = kp_upd_applying || kp_upd_checking;
    char cur[32];
    snprintf(cur, sizeof(cur), "%.31s", kp_upd_current);
    if (!avail && !busy && !armed) {
      kp_upd_reinstall_armed = true;
    }
    pthread_mutex_unlock(&kp_upd_mutex);
    if (busy) break;
    if (avail) {
      updater_start_apply(false);
    } else if (!armed) {
      char warn_msg[160];
      snprintf(warn_msg, sizeof(warn_msg),
               "Aviso: já está na v%.31s! Pressione B de novo para reinstalar.", cur);
      notify(warn_msg);
    } else {
      updater_start_apply(true);
    }
    break;
  }
  case 50:
    mode = 8;
    iptv_open_search_kb();
    break;
  case 51:
    iptv_clear_search();
    mode = 8;
    break;
  case 52:
    iptv_search_query[0] = 0;
    iptv_switch_source(dir >= 0 ? 1 : -1);
    break;
  case 53:
    iptv_refresh_current();
    mode = 8;
    break;
  case 54:
    mode = 8;
    iptv_open_add_url_kb();
    break;
  case 60:
    radio_toggle_current_favorite();
    break;
  case 61:
    radio_cycle_filter(dir >= 0 ? 1 : -1);
    break;
  case 62:
    radio_refresh();
    notify("Estações de rádio atualizadas");
    mode = 7;
    break;
  case 70:
    ss_timeout_idx = (ss_timeout_idx + dir + SS_TIMEOUT_COUNT) % SS_TIMEOUT_COUNT;
    ss_touch_activity();
    save_settings();
    break;
  case 71:
    ss_viz_style = (ss_viz_style + dir + SS_VIZ_COUNT) % SS_VIZ_COUNT;
    save_settings();
    break;
  case 72:
    ss_show_clock = !ss_show_clock;
    save_settings();
    break;
  case 73:
    ss_show_lyrics = !ss_show_lyrics;
    save_settings();
    break;
  case 74:
    ss_open(return_mode);
    break;
  case -98:
    opt_enter_section(OPT_SEC_ROOT);
    break;
  case -99:
    if (opt_section == OPT_SEC_SCREENSAVER &&
        (opt_entry_section == OPT_SEC_MUSIC || opt_entry_section == OPT_SEC_RADIO))
      opt_enter_section(opt_entry_section);
    else
      opt_enter_section(OPT_SEC_ROOT);
    break;
  }
  menu_dirty = true;
}
static void toggle_pause(void) {
  if (!active)
    return;
  paused = !paused;
  libvlc_media_player_set_pause(player, paused);
}
static void seek_media(long long delta) {
  if (!active || !libvlc_media_player_is_seekable(player))
    return;
  long long t = now_ms() + delta, len = duration_ms();
  if (t < 0)
    t = 0;
  if (len > 0 && t >= len)
    t = len - 1;
  libvlc_media_player_set_time(player, t);
}
static void open_options(void) {
  return_mode = mode;
  mode = 2;
  options_from_video = (return_mode == 1) || active;
  if (return_mode == 1)
    opt_entry_section = OPT_SEC_VIDEO;
  else if (return_mode == 4)
    opt_entry_section = OPT_SEC_MUSIC;
  else if (return_mode == 8)
    opt_entry_section = OPT_SEC_IPTV;
  else if (return_mode == 7)
    opt_entry_section = OPT_SEC_RADIO;
  else
    opt_entry_section = OPT_SEC_ROOT;
  opt_enter_section(opt_entry_section);
}
static void key(SDL_Keycode k, bool repeat) {
  ui_anim_kick(320);
  if (!repeat || k == SDLK_UP || k == SDLK_DOWN || k == SDLK_LEFT || k == SDLK_RIGHT)
    sfx_play_for_key(k);
  if (radio_play_is_busy()) {
    if (mode == 8 && !repeat) { iptv_key(k); return; }
    if (mode == 7 && k != SDLK_ESCAPE && k != SDLK_F1 && k != SDLK_TAB)
      radio_key(k, repeat);
    else if (!repeat)
      notify("Aguarde a conexão da rádio");
    return;
  }
  if (k == SDLK_ESCAPE) {
    running = 0;
    return;
  }
  if (k == SDLK_F1 && !repeat) {
    if (mode == 2)
      mode = return_mode;
    else
      open_options();
    return;
  }
  if (mode == 5) {
    if (k == SDLK_UP || k == SDLK_DOWN)
      welcome_focus = 1 - welcome_focus;
    else if (k == SDLK_LEFT) {
      if (welcome_focus == 0)
        language = (language + 2) % 3;
      else
        apply_theme((theme_index + THEME_COUNT - 1) % THEME_COUNT);
    } else if (k == SDLK_RIGHT) {
      if (welcome_focus == 0)
        language = (language + 1) % 3;
      else
        apply_theme((theme_index + 1) % THEME_COUNT);
    } else if (k == SDLK_PAGEUP) {
      welcome_focus = 1;
      apply_theme((theme_index + THEME_COUNT - 1) % THEME_COUNT);
    } else if (k == SDLK_PAGEDOWN) {
      welcome_focus = 1;
      apply_theme((theme_index + 1) % THEME_COUNT);
    } else if (k == SDLK_m && !repeat)
      open_terms(5);
    else if ((k == SDLK_RETURN || k == SDLK_SPACE) && !repeat)
      finish_onboarding();
    return;
  }
  if (mode == 6) {
    if ((k == SDLK_BACKSPACE || k == SDLK_m) && !repeat)
      mode = terms_return;
    else if (k == SDLK_LEFT || k == SDLK_UP)
      terms_page = (terms_page + TERMS_COUNT - 1) % TERMS_COUNT;
    else if (k == SDLK_RIGHT || k == SDLK_DOWN)
      terms_page = (terms_page + 1) % TERMS_COUNT;
    return;
  }
  if (mode == 10) {
    if (k == SDLK_RETURN && !repeat) {
      if (stream_notice_target == 18) {
        adult_section_unlocked = true;
        save_settings();
        mode = stream_notice_return;
        notify("Seção +18 desbloqueada no serviço de IPTV");
      } else {
        stream_notice_accepted = true;
        if (stream_notice_target == 7)
          radio_open();
        else
          iptv_open();
      }
    } else if (k == SDLK_m && !repeat) {
      open_terms(10);
      terms_page = (stream_notice_target == 18) ? 4 : 1;
    } else if (k == SDLK_BACKSPACE && !repeat) {
      mode = stream_notice_return;
    }
    return;
  }
  osd_until = SDL_GetTicks() + 3000;
  ss_touch_activity();
  if (mode == 13) {
    if (!repeat) screensaver_key(k);
    return;
  }
  if (k == SDLK_TAB && !repeat) {
    toggle_pause();
    show_osd = true;
    return;
  }
  if (mode == 12) {
    if (!repeat) tutorial_key(k);
    return;
  }
  if (mode == 14) {
    if (!repeat) changelog_key(k);
    return;
  }
  if (mode == 2) {
    const int *ids = NULL;
    int cnt = opt_current_list(&ids);
    if ((k == SDLK_BACKSPACE || k == SDLK_m) && !repeat) {
      if (opt_section == OPT_SEC_UPDATE)
        updater_disarm_reinstall();
      if (opt_section == opt_entry_section)
        mode = return_mode;
      else if (opt_section == OPT_SEC_SCREENSAVER &&
               (opt_entry_section == OPT_SEC_MUSIC || opt_entry_section == OPT_SEC_RADIO))
        opt_enter_section(opt_entry_section);
      else if (opt_section == OPT_SEC_WEATHER || opt_section == OPT_SEC_UPDATE ||
               opt_section == OPT_SEC_SCREENSAVER)
        opt_enter_section(OPT_SEC_ROOT);
      else
        opt_enter_section(opt_entry_section);
    } else if (k == SDLK_UP && cnt > 0) {
      opt_cursor = (opt_cursor + cnt - 1) % cnt;
      opt_sync_option_id();
    } else if (k == SDLK_DOWN && cnt > 0) {
      opt_cursor = (opt_cursor + 1) % cnt;
      opt_sync_option_id();
    } else if (k == SDLK_LEFT) {
      if (option == 0 || option == 1 || option == 2 || option == 3 ||
          option == 4 || option == 5 || option == 9 || option == 11 ||
          option == 12 || option == 15 || option == 16 || option == 18 ||
          option == 24 || option == 26 || option == 27 || option == 28 ||
          option == 52 || option == 61 || option == 70 || option == 71 ||
          option == 72 || option == 73)
        change_option(-1);
    } else if (k == SDLK_RIGHT) {
      if (option == 0 || option == 1 || option == 2 || option == 3 ||
          option == 4 || option == 5 || option == 9 || option == 11 ||
          option == 12 || option == 15 || option == 16 || option == 18 ||
          option == 24 || option == 26 || option == 27 || option == 28 ||
          option == 52 || option == 61 || option == 70 || option == 71 ||
          option == 72 || option == 73)
        change_option(1);
    } else if (k == SDLK_RETURN && !repeat) {
      change_option(1);
    }
    return;
  }
  if (mode == 11) {
    if (!repeat) weather_key(k);
    return;
  }
  if (mode == 3) {
    if (k == SDLK_LEFT || k == SDLK_UP)
      dash_focus = (dash_focus + 5) % 6;
    else if (k == SDLK_RIGHT || k == SDLK_DOWN)
      dash_focus = (dash_focus + 1) % 6;
    else if (k == SDLK_RETURN && !repeat) {
      favorites_view = false;
      menu_search[0] = 0;
      menu_search_kb = false;
      category = 0;
      if (dash_focus == 0)
        scan_automatic_media();
      else if (dash_focus == 1)
        fm_open();
      else if (dash_focus == 2) {
        if (stream_notice_accepted)
          radio_open();
        else
          open_stream_notice(7, 3);
      } else if (dash_focus == 3) {
        if (stream_notice_accepted)
          iptv_open();
        else
          open_stream_notice(8, 3);
      } else if (dash_focus == 4)
        news_open();
      else if (dash_focus == 5)
        football_open();
    } else if (k == SDLK_SPACE && !repeat) {
      /* Button X on Home opens the Open-Meteo Weather App */
      weather_open(3);
    } else if ((k == SDLK_q || k == SDLK_e) && !repeat && active) {
      mode = playing_audio ? 4 : 1;
    } else if (k == SDLK_m && !repeat)
      open_options();
    return;
  }
  if (mode == 7) {
    radio_key(k, repeat);
    return;
  }
  if (mode == 8) {
    if (!repeat) iptv_key(k);
    return;
  }
  if (mode == 9) {
    if (!repeat) football_key(k);
    return;
  }
  if (mode == 15) {
    if (!repeat) news_key(k);
    return;
  }
  if (mode == 16) {
    fm_key(k, repeat);
    return;
  }
  if (mode == 0) {
    if (locations_view) {
      if (k == SDLK_UP)
        location_selected = (location_selected + LOCATION_COUNT - 1) % LOCATION_COUNT;
      else if (k == SDLK_DOWN)
        location_selected = (location_selected + 1) % LOCATION_COUNT;
      else if (k == SDLK_RETURN && !repeat)
        open_location();
      else if (k == SDLK_BACKSPACE && !repeat)
        mode = 3;
      else if (k == SDLK_LEFT || k == SDLK_RIGHT)
        category = (category + (k == SDLK_LEFT ? 2 : 1)) % 3;
      else if (k == SDLK_m && !repeat)
        refresh_locations();
      else if (k == SDLK_SPACE && !repeat && active)
        mode = playing_audio ? 4 : 1;
      return;
    }
    if (menu_search_kb) {
      if (!repeat) menu_search_kb_key(k);
      return;
    }
    if (k == SDLK_q && !repeat) {
      menu_search_kb = true;
      menu_skb_row = 1;
      menu_skb_col = 0;
      return;
    }
    if (k == SDLK_e && !repeat && menu_search[0]) {
      menu_search[0] = 0;
      if (automatic_view) populate_automatic_from_cache();
      else scan();
      notify("Pesquisa limpa");
      return;
    }
    if (k == SDLK_UP && total)
      selected = (selected + total - 1) % total;
    else if (k == SDLK_DOWN && total)
      selected = (selected + 1) % total;
    else if (k == SDLK_RETURN && !repeat)
      start_media();
    else if (k == SDLK_BACKSPACE && !repeat) {
      parent_folder();
    } else if (k == SDLK_LEFT || k == SDLK_RIGHT) {
      favorites_view = false;
      category = (category + (k == SDLK_LEFT ? 2 : 1)) % 3;
      if (automatic_view)
        scan_automatic_media();
      else
        scan();
    } else if (k == SDLK_m && !repeat) {
      if (automatic_view)
        rescan_automatic_media();
      else
        scan();
      notify(tr("Biblioteca atualizada"));
    } else if (k == SDLK_SPACE && !repeat && active)
      mode = playing_audio ? 4 : 1;
    return;
  }
  if (mode == 4) {
    if (k == SDLK_BACKSPACE && !repeat) {
      if (audio_panel == 2 && parent_music_folder())
        return;
      if (fm_return_on_exit) {
        fm_return_on_exit = false;
        mode = 16;
      } else {
        mode = 3;
      }
      return;
    }
    if (k == SDLK_SPACE && !repeat)
      switch_audio_panel();
    else if (k == SDLK_RETURN && !repeat) {
      if (audio_panel == 1 && queue_count) {
        queue_index = queue_selected;
        memset(shuffle_seen, 0, sizeof(shuffle_seen));
        shuffle_seen_count = 0;
        play_path(queue_paths[queue_index]);
      } else if (audio_panel == 2)
        play_music_entry();
      else
        toggle_pause();
    } else if (k == SDLK_UP || k == SDLK_DOWN) {
      int d = k == SDLK_UP ? -1 : 1;
      if (audio_panel == 1 && queue_count)
        queue_selected = (queue_selected + d + queue_count) % queue_count;
      else if (audio_panel == 2 && music_total)
        music_selected = (music_selected + d + music_total) % music_total;
      else if (audio_panel == 0 && plain_count) {
        plain_scroll += d;
        if (plain_scroll < 0)
          plain_scroll = 0;
        if (plain_scroll >= plain_count)
          plain_scroll = plain_count - 1;
      }
    } else if (k == SDLK_m && !repeat) {
      audio_panel = 0;
      plain_scroll = 0;
    } else if ((k == SDLK_q || k == SDLK_e) && !repeat) {
      next_media(k == SDLK_q ? -1 : 1);
      queue_selected = queue_index;
    } else if (k == SDLK_LEFT || k == SDLK_RIGHT)
      seek_media(k == SDLK_LEFT ? -10000 : 10000);
    return;
  }
  if (k == SDLK_BACKSPACE && !repeat) {
    bool was_iptv = playing_iptv;
    bool was_news = playing_news_video;
    bool was_fm = fm_return_on_exit;
    fm_return_on_exit = false;
    if (mode == 1)
      stop_media();
    mode = was_fm ? 16 : was_news ? 15 : was_iptv ? 8 : 3;
    return;
  }
  if (k == SDLK_RETURN && !repeat)
    toggle_pause();
  else if (k == SDLK_SPACE && !repeat) {
    {
      show_osd = !show_osd;
      return;
    }
  } else if (k == SDLK_m && !repeat) {
    if (mode == 4)
      toggle_favorite();
    else
      open_options();
  } else if ((k == SDLK_q || k == SDLK_e) && !repeat) {
    if (playing_iptv)
      iptv_step_channel(k == SDLK_q ? -1 : 1);
    else
      next_media(k == SDLK_q ? -1 : 1);
  }
  else if (k == SDLK_LEFT || k == SDLK_RIGHT)
    seek_media(k == SDLK_LEFT ? -10000 : 10000);
  else if (k == SDLK_PAGEUP || k == SDLK_PAGEDOWN)
    seek_media(k == SDLK_PAGEUP ? -5000 : 5000);
  else if (k == SDLK_UP || k == SDLK_DOWN) {
    /* Volume is controlled exclusively by the console firmware. */
  }
  show_osd = true;
}
static bool read_font(const char *path, unsigned char **data,
                      stbtt_fontinfo *info) {
  FILE *f = fopen(path, "rb");
  if (!f)
    return false;
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  rewind(f);
  if (n <= 0 || n > 20000000) {
    fclose(f);
    return false;
  }
  *data = malloc(n);
  if (!*data) {
    fclose(f);
    return false;
  }
  bool ok = fread(*data, 1, n, f) == (size_t)n;
  fclose(f);
  return ok &&
         stbtt_InitFont(info, *data, stbtt_GetFontOffsetForIndex(*data, 0));
}
static bool load_font(void) {
  return read_font("fonts/Interface.ttf", &fontdata, &font) &&
         read_font("fonts/Bold.ttf", &bolddata, &boldfont);
}
static void save_settings(void) {
  FILE *f = fopen("settings.tmp", "w");
  if (!f)
    return;
  fprintf(f,
          "KPLAYER_SETTINGS 2\nfit %d\nloop %d\nrate %.2f\ntheme %d\n"
          "location %d\nrepeat %d\nshuffle %d\ndisplay %d\n"
          "home_inv %d\ntutorial %d\nss_sec %d\nss_viz %d\nss_clock %d\nss_lyrics %d\n"
          "seen_ver %s\nui_sfx %d\nbg_audio %d\nadult_18 %d\n",
          fit, loop_video, rate, theme_index,
          network_location_enabled ? 1 : 0, repeat_mode,
          shuffle_enabled ? 1 : 0, display_mode,
          home_layout_inverted ? 1 : 0, tutorial_done ? 1 : 0,
          ss_timeout_idx, ss_viz_style, ss_show_clock ? 1 : 0, ss_show_lyrics ? 1 : 0,
          seen_version[0] ? seen_version : "-", ui_sfx_enabled ? 1 : 0,
          bg_audio_preview ? 1 : 0, adult_section_unlocked ? 1 : 0);
  if (fclose(f) == 0)
    rename("settings.tmp", "settings.cfg");
}
static void load_settings(void) {
  FILE *f = fopen("settings.cfg", "r");
  if (!f)
    return;
  char line[160];
  char saved_seen[32] = "";
  int legacy_setting, ft, loop, saved_theme = 0, saved_location = 0,
                                saved_repeat = -1, saved_shuffle = 0,
                                saved_display = 0, saved_home_inv = 0,
                                saved_tutorial = 0, saved_ss_sec = 1,
                                saved_ss_viz = 0, saved_ss_clock = 1,
                                saved_ss_lyrics = 1, saved_ui_sfx = 1,
                                saved_bg_audio = 0, saved_adult_18 = 0;
  float r;
  bool valid = false;
  if (fgets(line, sizeof(line), f)) {
    if (!strcmp(line, "KPLAYER_SETTINGS 2\n")) {
      valid = fscanf(f, "fit %d\nloop %d\nrate %f", &ft, &loop, &r) == 3;
      if (valid && fscanf(f, "\ntheme %d", &saved_theme) != 1) saved_theme = 0;
      if (valid && fscanf(f, "\nlocation %d", &saved_location) != 1) saved_location = 0;
      if (valid && fscanf(f, "\nrepeat %d", &saved_repeat) != 1) saved_repeat = -1;
      if (valid && fscanf(f, "\nshuffle %d", &saved_shuffle) != 1) saved_shuffle = 0;
      if (valid && fscanf(f, "\ndisplay %d", &saved_display) != 1) saved_display = 0;
      if (valid && fscanf(f, "\nhome_inv %d", &saved_home_inv) != 1) saved_home_inv = 0;
      if (valid && fscanf(f, "\ntutorial %d", &saved_tutorial) != 1) saved_tutorial = 0;
      if (valid && fscanf(f, "\nss_sec %d", &saved_ss_sec) != 1) saved_ss_sec = 1;
      if (valid && fscanf(f, "\nss_viz %d", &saved_ss_viz) != 1) saved_ss_viz = 0;
      if (valid && fscanf(f, "\nss_clock %d", &saved_ss_clock) != 1) saved_ss_clock = 1;
      if (valid && fscanf(f, "\nss_lyrics %d", &saved_ss_lyrics) != 1) saved_ss_lyrics = 1;
      if (valid && fscanf(f, "\nseen_ver %31s", saved_seen) != 1) saved_seen[0] = 0;
      if (valid && fscanf(f, "\nui_sfx %d", &saved_ui_sfx) != 1) saved_ui_sfx = 1;
      if (valid && fscanf(f, "\nbg_audio %d", &saved_bg_audio) != 1) saved_bg_audio = 0;
      if (valid && fscanf(f, "\nadult_18 %d", &saved_adult_18) != 1) saved_adult_18 = 0;
    } else
      valid = sscanf(line, "%d %d %d %f", &legacy_setting, &ft, &loop, &r) == 4;
  }
  if (valid && ft >= 0 && ft <= 2 && (loop == 0 || loop == 1) && r >= .5f &&
      r <= 2) {
    fit = ft;
    loop_video = loop;
    repeat_mode = saved_repeat >= 0 && saved_repeat <= 2 ? saved_repeat : loop;
    loop_video = repeat_mode == 1;
    shuffle_enabled = saved_shuffle == 1;
    display_mode = saved_display >= 0 && saved_display <= 2 ? saved_display : 0;
    home_layout_inverted = saved_home_inv == 1;
    tutorial_done = saved_tutorial == 1;
    ss_timeout_idx = (saved_ss_sec >= 0 && saved_ss_sec < SS_TIMEOUT_COUNT) ? saved_ss_sec : 1;
    ss_viz_style = (saved_ss_viz >= 0 && saved_ss_viz < SS_VIZ_COUNT) ? saved_ss_viz : 0;
    ss_show_clock = saved_ss_clock != 0;
    ss_show_lyrics = saved_ss_lyrics != 0;
    ui_sfx_enabled = saved_ui_sfx != 0;
    bg_audio_preview = saved_bg_audio == 1;
    adult_section_unlocked = saved_adult_18 == 1;
    if (saved_seen[0] && strcmp(saved_seen, "-") != 0)
      snprintf(seen_version, sizeof(seen_version), "%.31s", saved_seen);
    else
      seen_version[0] = 0;
    rate = r;
    apply_theme(saved_theme);
    network_location_enabled = saved_location == 1;
    refresh_device_display();
  }
  fclose(f);
}
static int kp_sys_inject_run(const char *cmd, const char *arg) {
  const char *mock = getenv("KPLAYER_TEST_SYS_INJECT");
  if (mock && !strcmp(mock, "ok")) return 0;
  if (mock && !strcmp(mock, "fail")) return 1;
  if (!cmd || !cmd[0]) return -1;
  if (access("./system_inject.py", R_OK) != 0) return -1;
  extern char **environ;
  char *argv[5];
  int argc = 0;
  argv[argc++] = "python3";
  argv[argc++] = "./system_inject.py";
  argv[argc++] = (char *)cmd;
  if (arg && arg[0]) argv[argc++] = (char *)arg;
  argv[argc] = NULL;
  pid_t pid = 0;
  if (posix_spawnp(&pid, "python3", NULL, NULL, argv, environ) != 0)
    return -1;
  int status = 0;
  while (waitpid(pid, &status, 0) < 0) {
    if (errno != EINTR) return -1;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  return -1;
}
static void kp_sys_inject_detect(void) {
  bool state_ok = access(".system-inject-state.json", F_OK) == 0;
  bool so_ok = access("/usr/local/lib/libkp_overlay.so", F_OK) == 0;
  if (state_ok && so_ok) {
    system_miniplayer_installed = true;
    bg_audio_preview = true;
  } else if (!state_ok && !so_ok) {
    system_miniplayer_installed = false;
  } else {
    system_miniplayer_installed = state_ok;
  }
}
static bool kp_export_audio_payload(const char *out_path, const char *target_path,
                                    bool is_script, bool enable_miniplayer) {
  const char *mtype = "none";
  const char *muri = "";
  const char *mtitle = "";
  long long mpos = 0;
  bool auto_play = false;
  bool keep_bg = false;
  FmBgTrack bg_tracks[BG_MP_MAX_TRACKS];
  char bg_title_buf[BG_MP_MAX_TRACKS][128];
  char *bg_owned_uris[BG_MP_MAX_TRACKS];
  int bg_owned_count = 0;
  int bg_track_count = 0;
  int bg_track_index = 0;

  if (enable_miniplayer && active && playing_radio && radio_current_station.url[0]) {
    mtype = "radio";
    muri = radio_current_station.url;
    mtitle = radio_current_station.name;
    keep_bg = true;
    auto_play = !paused;
    bool found_cur = false;
    for (int i = 0; i < radio_count && bg_track_count < BG_MP_MAX_TRACKS; i++) {
      if (!radio_stations[i].url[0]) continue;
      if (!strcmp(radio_stations[i].url, radio_current_station.url)) {
        bg_track_index = bg_track_count;
        found_cur = true;
      }
      bg_tracks[bg_track_count].uri = radio_stations[i].url;
      bg_tracks[bg_track_count].title = radio_stations[i].name;
      bg_tracks[bg_track_count].is_radio = true;
      bg_track_count++;
    }
    if (!found_cur && bg_track_count < BG_MP_MAX_TRACKS) {
      bg_track_index = bg_track_count;
      bg_tracks[bg_track_count].uri = radio_current_station.url;
      bg_tracks[bg_track_count].title = radio_current_station.name;
      bg_tracks[bg_track_count].is_radio = true;
      bg_track_count++;
    }
  } else if (enable_miniplayer && active && playing_audio && current_path[0]) {
    mtype = "music";
    muri = current_path;
    mtitle = title[0] ? title : media_name;
    keep_bg = true;
    auto_play = !paused;
    if (player) {
      libvlc_time_t cur_t = libvlc_media_player_get_time(player);
      if (cur_t > 0) mpos = (long long)cur_t;
    }
    bool found_cur = false;
    for (int i = 0; i < queue_count && bg_track_count < BG_MP_MAX_TRACKS; i++) {
      if (!queue_paths[i] || !queue_paths[i][0]) continue;
      if (!strcmp(queue_paths[i], current_path)) {
        bg_track_index = bg_track_count;
        found_cur = true;
        snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s", mtitle);
      } else {
        const char *bn = strrchr(queue_paths[i], '/');
        snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s",
                 (bn && bn[1]) ? bn + 1 : queue_paths[i]);
      }
      bg_tracks[bg_track_count].uri = queue_paths[i];
      bg_tracks[bg_track_count].title = bg_title_buf[bg_track_count];
      bg_tracks[bg_track_count].is_radio = false;
      bg_track_count++;
    }
    if (!found_cur && bg_track_count < BG_MP_MAX_TRACKS) {
      bg_track_index = bg_track_count;
      snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s", mtitle);
      bg_tracks[bg_track_count].uri = current_path;
      bg_tracks[bg_track_count].title = bg_title_buf[bg_track_count];
      bg_tracks[bg_track_count].is_radio = false;
      bg_track_count++;
    }
    /* If opened as a single song, scan sibling audio files in the same folder */
    if (bg_track_count <= 1 && current_path[0] == '/') {
      char dir_buf[1024];
      snprintf(dir_buf, sizeof(dir_buf), "%.1023s", current_path);
      char *slash = strrchr(dir_buf, '/');
      if (slash && slash > dir_buf) {
        *slash = 0;
        DIR *d = opendir(dir_buf);
        if (d) {
          char *sibs[BG_MP_MAX_TRACKS];
          int sib_n = 0;
          struct dirent *de;
          while ((de = readdir(d)) != NULL && sib_n < BG_MP_MAX_TRACKS) {
            if (de->d_name[0] == '.' || !audio_file(de->d_name)) continue;
            char full[1024];
            snprintf(full, sizeof(full), "%.700s/%.300s", dir_buf, de->d_name);
            sibs[sib_n++] = strdup(full);
          }
          closedir(d);
          for (int a = 1; a < sib_n; a++) {
            char *key_s = sibs[a];
            int b = a - 1;
            while (b >= 0 && strcasecmp(sibs[b], key_s) > 0) {
              sibs[b + 1] = sibs[b];
              b--;
            }
            sibs[b + 1] = key_s;
          }
          if (sib_n > 1) {
            bg_track_count = 0;
            bg_track_index = 0;
            for (int a = 0; a < sib_n && bg_track_count < BG_MP_MAX_TRACKS; a++) {
              if (!sibs[a]) continue;
              bg_owned_uris[bg_owned_count++] = sibs[a];
              if (!strcmp(sibs[a], current_path)) {
                bg_track_index = bg_track_count;
                snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s", mtitle);
              } else {
                const char *bn = strrchr(sibs[a], '/');
                snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s",
                         (bn && bn[1]) ? bn + 1 : sibs[a]);
              }
              bg_tracks[bg_track_count].uri = sibs[a];
              bg_tracks[bg_track_count].title = bg_title_buf[bg_track_count];
              bg_tracks[bg_track_count].is_radio = false;
              bg_track_count++;
            }
          } else {
            for (int a = 0; a < sib_n; a++) free(sibs[a]);
          }
        }
      }
    }
    if (bg_track_count <= 1) {
      pthread_mutex_lock(&media_cache_mutex);
      for (int i = 0; i < cached_media_total && bg_track_count < BG_MP_MAX_TRACKS; i++) {
        if (!cached_media[i].path || !audio_file(cached_media[i].path)) continue;
        bool dup = false;
        for (int k = 0; k < bg_track_count; k++) {
          if (!strcmp(bg_tracks[k].uri, cached_media[i].path)) { dup = true; break; }
        }
        if (dup) continue;
        snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s",
                 cached_media[i].name ? cached_media[i].name : cached_media[i].path);
        bg_tracks[bg_track_count].uri = cached_media[i].path;
        bg_tracks[bg_track_count].title = bg_title_buf[bg_track_count];
        bg_tracks[bg_track_count].is_radio = false;
        bg_track_count++;
      }
      pthread_mutex_unlock(&media_cache_mutex);
    }
  } else if (enable_miniplayer) {
    /* Native Mini-Player ready even when paused/idle: export queue, cached audio, or radios */
    for (int i = 0; i < queue_count && bg_track_count < BG_MP_MAX_TRACKS; i++) {
      if (!queue_paths[i] || !queue_paths[i][0]) continue;
      const char *bn = strrchr(queue_paths[i], '/');
      snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s",
               (bn && bn[1]) ? bn + 1 : queue_paths[i]);
      bg_tracks[bg_track_count].uri = queue_paths[i];
      bg_tracks[bg_track_count].title = bg_title_buf[bg_track_count];
      bg_tracks[bg_track_count].is_radio = false;
      bg_track_count++;
    }
    if (bg_track_count == 0) {
      pthread_mutex_lock(&media_cache_mutex);
      for (int i = 0; i < cached_media_total && bg_track_count < BG_MP_MAX_TRACKS; i++) {
        if (!cached_media[i].path || !audio_file(cached_media[i].path)) continue;
        snprintf(bg_title_buf[bg_track_count], sizeof(bg_title_buf[0]), "%.127s",
                 cached_media[i].name ? cached_media[i].name : cached_media[i].path);
        bg_tracks[bg_track_count].uri = cached_media[i].path;
        bg_tracks[bg_track_count].title = bg_title_buf[bg_track_count];
        bg_tracks[bg_track_count].is_radio = false;
        bg_track_count++;
      }
      pthread_mutex_unlock(&media_cache_mutex);
    }
    if (bg_track_count == 0 && radio_count > 0) {
      for (int i = 0; i < radio_count && bg_track_count < BG_MP_MAX_TRACKS; i++) {
        if (!radio_stations[i].url[0]) continue;
        bg_tracks[bg_track_count].uri = radio_stations[i].url;
        bg_tracks[bg_track_count].title = radio_stations[i].name;
        bg_tracks[bg_track_count].is_radio = true;
        bg_track_count++;
      }
    }
    /* Keep Mini-Player enabled even if no tracks yet (daemon scans /roms/bgmusic too) */
    keep_bg = true;
    auto_play = false;
    if (bg_track_count > 0) {
      bg_track_index = 0;
      mtype = bg_tracks[0].is_radio ? "radio" : "music";
      muri = bg_tracks[0].uri;
      mtitle = bg_tracks[0].title;
    }
  }

  char accent_hex[16];
  SDL_Color ac = themes[theme_index].highlight;
  snprintf(accent_hex, sizeof(accent_hex), "#%02x%02x%02x", ac.r, ac.g, ac.b);
  bool ok = fm_write_bg_launch_json_ext(out_path, target_path ? target_path : "",
                                        is_script, keep_bg, auto_play,
                                        mtype, muri, mpos, 55, mtitle, accent_hex,
                                        bg_tracks, bg_track_count, bg_track_index);
  for (int i = 0; i < bg_owned_count; i++) free(bg_owned_uris[i]);
  return ok;
}
static bool screenshot(const char *path) {
  SDL_Surface *s =
      SDL_CreateRGBSurfaceWithFormat(0, W, H, 32, SDL_PIXELFORMAT_ARGB8888);
  if (!s)
    return false;
  bool ok = SDL_RenderReadPixels(renderer, NULL, s->format->format, s->pixels,
                                 s->pitch) == 0 &&
            SDL_SaveBMP(s, path) == 0;
  SDL_FreeSurface(s);
  return ok;
}
int main(int argc, char **argv) {
  srand((unsigned)time(NULL));
  bool preview = argc > 1 && !strncmp(argv[1], "--preview", 9),
       check = argc > 1 && !strcmp(argv[1], "--check");
  signal(SIGINT, stop_signal);
  signal(SIGTERM, stop_signal);
  signal(SIGPIPE, SIG_IGN);
  if (argc > 2 && !strcmp(argv[1], "--bg-audio")) {
    pid_t gpid = (argc > 3) ? (pid_t)strtol(argv[3], NULL, 10) : 0;
    return bg_miniplayer_main(argv[2], gpid);
  }
  if (!load_sdl())
    return 1;
  if (!preview && !load_vlc())
    return 1;
  if (check) {
    printf("K PLAYER %s | SDL2 carregada | VLC %s\n", KPLAYER_VERSION, libvlc_get_version());
    return 0;
  }
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_TIMER) < 0) {
    fprintf(stderr, "SDL: %s\n", SDL_GetError());
    return 1;
  }
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "1");
  SDL_ShowCursor(SDL_DISABLE);
  display_preview_lock = preview;
  int win_w = W, win_h = H;
  Uint32 win_flags = preview ? 0 : SDL_WINDOW_FULLSCREEN_DESKTOP;
  if (!preview && getenv("KPLAYER_WINDOWED")) {
    win_flags = SDL_WINDOW_RESIZABLE;
    const char *ew = getenv("KPLAYER_DISPLAY_W");
    const char *eh = getenv("KPLAYER_DISPLAY_H");
    if (ew && eh) {
      int pw = atoi(ew), ph = atoi(eh);
      if (pw >= 320 && ph >= 240) { win_w = pw; win_h = ph; }
    }
  } else if (!preview && SDL_GetCurrentDisplayMode) {
    SDL_DisplayMode dm;
    if (SDL_GetCurrentDisplayMode(0, &dm) == 0 && dm.w >= 240 && dm.h >= 240) {
      win_w = dm.w;
      win_h = dm.h;
    }
  }
  window = SDL_CreateWindow("K PLAYER", SDL_WINDOWPOS_CENTERED,
                            SDL_WINDOWPOS_CENTERED, win_w, win_h, win_flags);
  if (!window) {
    fprintf(stderr, "Janela SDL: %s\n", SDL_GetError());
    SDL_Quit();
    return 1;
  }
  renderer = SDL_CreateRenderer(
      window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
  if (!renderer)
    renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
  if (!renderer) {
    fprintf(stderr, "Renderizador SDL: %s\n", SDL_GetError());
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 1;
  }
  refresh_device_display();
  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
  kp_sprites_load();
  if (!load_font()) {
    fprintf(stderr, "Fonte fonts/Interface.ttf ausente ou inválida\n");
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 1;
  }
  if (preview) {
    preview_mode = true;
    if (argc > 3) {
      int l = atoi(argv[3]);
      if (l >= 0 && l < 3)
        language = l;
    }
    snprintf(folder, sizeof(folder), "midias");
    const char *names[] = {"Minhas músicas", "Meus vídeos",
                           "Noite tranquila.flac", "Viagem.mp4",
                           "Horizonte.mp3"};
    for (int i = 0; i < 5; i++)
      items[total++] =
          (Item){strdup(names[i]), strdup(names[i]), i < 2, 32500000};
    if (!strcmp(argv[1], "--preview-splash")) {
      splash_visual_progress = 0.72f;
      draw_boot_splash_frame(0.72f, "Preparando rádios, IPTV e Placar da Bola", 42, 0.0f);
    } else if (!strcmp(argv[1], "--preview-welcome"))
      draw_welcome();
    else if (!strcmp(argv[1], "--preview-terms")) {
      if (argc > 4)
        terms_page = atoi(argv[4]) % TERMS_COUNT;
      draw_terms();
    } else if (!strcmp(argv[1], "--preview-notice")) {
      stream_notice_target = 8;
      draw_stream_notice();
    } else if (!strcmp(argv[1], "--preview-audio")) {
      active = true;
      playing_audio = true;
      snprintf(title, sizeof(title), "Noite tranquila");
      snprintf(artist, sizeof(artist), "Faixa demonstrativa");
      lyrics[0] = (Lyric){0, "O dia vai ficando para trás"};
      lyrics[1] = (Lyric){30000, "E a música encontra seu lugar"};
      lyrics[2] = (Lyric){60000, "Um novo caminho para seguir"};
      lyric_count = 3;
      if (argc > 4) {
        char path[PATH_MAX];
        if (realpath(argv[4], path)) {
          snprintf(current_path, sizeof(current_path), "%s", path);
          media_ui_read_file_info(path);
          load_lyrics(path);
          load_cover(path);
          apply_local_metadata(path);
          queue_paths[0] = strdup(path);
          queue_count = 1;
          queue_index = queue_selected = 0;
          open_current_music_folder();
        }
      }
      if (argc > 5)
        audio_panel = atoi(argv[5]) % 3;
      if (argc > 6)
        preview_duration = atoll(argv[6]);
      draw_music();
    } else if (!strcmp(argv[1], "--preview-video")) {
      active = true;
      snprintf(media_name, sizeof(media_name), "Viagem.mp4");
      draw_video();
    } else if (!strcmp(argv[1], "--preview-options")) {
      if (argc > 4) apply_theme(atoi(argv[4]));
      option = 9;
      draw_options();
    } else if (!strcmp(argv[1], "--preview-radio")) {
      radio_count = 3;
      snprintf(radio_stations[0].name, sizeof(radio_stations[0].name), "Rádio Ilha 107.1");
      snprintf(radio_stations[1].name, sizeof(radio_stations[1].name), "Rádio Massa");
      snprintf(radio_stations[2].name, sizeof(radio_stations[2].name), "Aline FM");
      for (int i = 0; i < radio_count; i++)
        snprintf(radio_stations[i].codec, sizeof(radio_stations[i].codec), "STREAM");
      radio_filter = 5;
      draw_radio();
    } else if (!strcmp(argv[1], "--preview-iptv")) {
      iptv_source = 0;
      iptv_view = IPTV_VIEW_CATS;
      if (iptv_ensure_cats_cap(3)) {
        iptv_cat_count = 3;
        snprintf(iptv_cats[0].id, sizeof(iptv_cats[0].id), "all");
        snprintf(iptv_cats[0].name, sizeof(iptv_cats[0].name), "Todos os canais");
        iptv_cats[0].count = 8;
        snprintf(iptv_cats[1].id, sizeof(iptv_cats[1].id), "grp:ESPORTES");
        snprintf(iptv_cats[1].name, sizeof(iptv_cats[1].name), "ESPORTES");
        iptv_cats[1].count = 4;
        snprintf(iptv_cats[2].id, sizeof(iptv_cats[2].id), "grp:FILMES");
        snprintf(iptv_cats[2].name, sizeof(iptv_cats[2].name), "FILMES E SÉRIES");
        iptv_cats[2].count = 3;
      }
      draw_iptv();
    } else if (!strcmp(argv[1], "--preview-news")) {
      news_count = 1;
      snprintf(news_articles[0].category, sizeof(news_articles[0].category), "breaking");
      snprintf(news_articles[0].cat_label, sizeof(news_articles[0].cat_label), "Urgente");
      snprintf(news_articles[0].title, sizeof(news_articles[0].title), "Manchete demonstrativa do Brasil");
      snprintf(news_articles[0].source, sizeof(news_articles[0].source), "Notícias BR");
      snprintf(news_articles[0].date, sizeof(news_articles[0].date), "Hoje");
      snprintf(news_articles[0].summary, sizeof(news_articles[0].summary), "Resumo das últimas notícias do Brasil e do mundo.");
      draw_news();
    } else if (!strcmp(argv[1], "--preview-football")) {
      football_count = 1;
      snprintf(football_matches[0].league, sizeof(football_matches[0].league), "Campeonato exemplo");
      snprintf(football_matches[0].home, sizeof(football_matches[0].home), "Time A");
      snprintf(football_matches[0].away, sizeof(football_matches[0].away), "Time B");
      snprintf(football_matches[0].score, sizeof(football_matches[0].score), "1 - 0");
      snprintf(football_matches[0].status, sizeof(football_matches[0].status), "45'");
      draw_football();
    } else if (!strcmp(argv[1], "--preview-weather")) {
      weather_view = WEATHER_VIEW_SETUP;
      draw_weather();
    } else if (!strcmp(argv[1], "--preview-tutorial")) {
      tutorial_from_options = false;
      draw_tutorial();
    } else if (!strcmp(argv[1], "--preview-changelog")) {
      draw_changelog();
    } else if (!strcmp(argv[1], "--preview-screensaver")) {
      active = true;
      playing_audio = true;
      snprintf(title, sizeof(title), "Noite tranquila");
      snprintf(artist, sizeof(artist), "K PLAYER R36S");
      lyrics[0] = (Lyric){0, "O dia vai ficando para trás"};
      lyrics[1] = (Lyric){30000, "E a música encontra seu lugar"};
      lyrics[2] = (Lyric){60000, "Um novo caminho para seguir"};
      lyric_count = 3;
      draw_screensaver();
    } else if (!strcmp(argv[1], "--preview-locations")) {
      show_locations();
      draw_menu();
    } else if (!strcmp(argv[1], "--preview-files")) {
      fm_open();
      draw_file_manager();
    } else if (!strcmp(argv[1], "--preview-library"))
      draw_menu();
    else
      draw_home();
    bool ok = screenshot(argc > 2 ? argv[2] : "preview.bmp");
    SDL_RenderPresent(renderer);
    kp_sprites_free();
    SDL_Quit();
    return ok ? 0 : 1;
  }
  const char *args[] = {"--no-xlib", "--no-video-title-show", "--quiet",
                        "--aout=alsa"};
  engine = libvlc_new(4, args);
  if (!engine) {
    fprintf(stderr, "Falha libvlc_new: %s\n", libvlc_errmsg());
    SDL_Quit();
    return 1;
  }
  libvlc_set_user_agent(engine, "K PLAYER " KPLAYER_VERSION, "KPLAYER/" KPLAYER_VERSION);
  player = libvlc_media_player_new(engine);
  if (!player) {
    libvlc_release(engine);
    SDL_Quit();
    return 1;
  }
  load_equalizer_api();
  libvlc_video_set_callbacks(player, lock_video, unlock_video, NULL, NULL);
  libvlc_video_set_format_callbacks(player, format_video, cleanup_video);
  load_preferences();
  load_settings();
  kp_sys_inject_detect();
  mode = !onboarding_done ? 5
       : (!tutorial_done ? 12
       : (strcmp(seen_version, KPLAYER_VERSION) != 0 ? 14 : 3));
  load_favorites();
  run_boot_splash();
  sfx_set_boot_ready(true);
  weather_boot_refresh();
  updater_start_check(false);
  ss_touch_activity();
  while (running) {
    uint32_t frame = SDL_GetTicks();
    sfx_poll(frame, active || radio_play_is_busy());
    media_library_poll();
    fm_poll_main_thread();
    updater_poll_main_thread();
    if (!running) break;
    ss_check_idle(frame);
    if (sleep_choice && (int32_t)(frame - sleep_end) >= 0) {
      sleep_choice = 0;
      sleep_end = 0;
      if (active) { save_resume(); stop_media(); mode = 3; }
    }
    static uint32_t resume_next_save;
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
      if (e.type == SDL_QUIT) {
        if (!radio_play_is_busy()) running = 0;
      } else if (e.type == SDL_WINDOWEVENT &&
                 (e.window.event == SDL_WINDOWEVENT_SIZE_CHANGED ||
                  e.window.event == SDL_WINDOWEVENT_RESIZED)) {
        refresh_device_display();
      } else if (e.type == SDL_KEYDOWN)
        key(e.key.keysym.sym, e.key.repeat != 0);
    }
    radio_poll_play();
    radio_retry_tick();
    if (active) {
      if (playing_radio) radio_update_nowplaying();
      if (resume_pending_ms >= 0) {
        if ((int32_t)(SDL_GetTicks() - resume_deadline) >= 0) resume_pending_ms = -1;
        else if (libvlc_media_player_is_seekable(player)) {
          libvlc_media_player_set_time(player, resume_pending_ms);
          resume_pending_ms = -1;
        }
      }
      if (!playing_radio && resume_pending_ms < 0 && (int32_t)(frame - resume_next_save) >= 0) {
        save_resume();
        resume_next_save = frame + 10000;
      }
      update_metadata();
      libvlc_state_t state = libvlc_media_player_get_state(player);
      if (playing_radio && state == libvlc_Playing) radio_note_playing();
      else if (playing_radio) radio_stable_since = 0;
      if (state == libvlc_Error) {
        bool was_iptv = playing_iptv;
        bool was_news = playing_news_video;
        bool was_radio = playing_radio;
        if (was_radio) { active = false; playing_radio = false; paused = false; radio_schedule_retry(); }
        else stop_media();
        notify(tr("Falha na reprodução. Consulte log.txt"));
        if (was_radio)
          mode = 7;
        else if (was_news) mode = 15;
        else if (was_iptv) mode = 8;
      } else if (state == libvlc_Ended) {
        if (playing_radio) {
          active = false;
          playing_radio = false;
          paused = false;
          radio_schedule_retry();
          mode = 7;
        } else if (playing_news_video) {
          stop_media();
          mode = 15;
        } else if (playing_iptv) {
          stop_media();
          mode = 8;
        } else if (repeat_mode == 1) {
          play_path(current_path);
        } else if (playing_audio && queue_advance(1, true))
          play_path(queue_paths[queue_index]);
        else {
          stop_media();
          mode = 3;
        }
      }
    }
    ui_trans_check_mode(mode);
    if (mode == 1)
      draw_video();
    else if (mode == 2)
      draw_options();
    else if (mode == 3)
      draw_home();
    else if (mode == 4)
      draw_music();
    else if (mode == 5)
      draw_welcome();
    else if (mode == 6)
      draw_terms();
    else if (mode == 7)
      draw_radio();
    else if (mode == 9)
      draw_football();
    else if (mode == 8)
      draw_iptv();
    else if (mode == 10)
      draw_stream_notice();
    else if (mode == 11)
      draw_weather();
    else if (mode == 12)
      draw_tutorial();
    else if (mode == 13)
      draw_screensaver();
    else if (mode == 14)
      draw_changelog();
    else if (mode == 15)
      draw_news();
    else if (mode == 16)
      draw_file_manager();
    else
      draw_menu();
    ui_trans_overlay();
    SDL_RenderPresent(renderer);
    uint32_t elapsed = SDL_GetTicks() - frame;
    /* Smooth ~35 FPS during animations, transitions, focus glides, playback, and visualizers; 20 FPS calm idle. */
    bool fast_anim = (mode == 5 || mode == 13 ||
                      ui_trans_tick != 0 ||
                      (int32_t)(ui_anim_active_until - frame) > 0 ||
                      (frame < note_until) ||
                      (active && !paused) ||
                      (mode == 16 && fm_is_job_busy()) ||
                      (mode == 2 && opt_section == OPT_SEC_UPDATE &&
                       (kp_upd_checking || kp_upd_applying)));
    uint32_t frame_ms = fast_anim ? 28 : 50;
    if (elapsed < frame_ms)
      SDL_Delay(frame_ms - elapsed);
  }
  save_settings();
  save_resume();
  bool handoff_ready = false;
  if (fm_exec_target_path[0] && fm_exec_use_handoff) {
    handoff_ready = kp_export_audio_payload(".bg-launch.json", fm_exec_target_path,
                                            fm_exec_is_script, fm_exec_keep_bg_audio);
  } else if (!fm_exec_target_path[0] && system_miniplayer_installed) {
    if (kp_export_audio_payload("system-audio.json", "", false, true)) {
      (void)kp_sys_inject_run("sync-audio", "system-audio.json");
    }
  }
  stop_media();
  libvlc_media_player_release(player);
  libvlc_release(engine);
  free(video.pixels);
  clear_items();
  for (int i = 0; i < CACHE; i++) {
    free(cache[i].s);
    if (cache[i].texture)
      SDL_DestroyTexture(cache[i].texture);
  }
  free(fontdata);
  free(bolddata);
  clear_queue();
  clear_music_entries();
  media_library_join();
  clear_cached_media();
  if (cover_texture)
    SDL_DestroyTexture(cover_texture);
  if (radio_art_texture)
    SDL_DestroyTexture(radio_art_texture);
  news_clear_textures();
  fm_free_buffers();
  kp_sprites_free();
  sfx_quit();
  SDL_DestroyRenderer(renderer);
  SDL_DestroyWindow(window);
  SDL_Quit();
  if (handoff_ready) {
    return 43;
  }
  if (fm_exec_target_path[0]) {
    if (!fm_exec_keep_bg_audio) {
      setenv("KPLAYER_DISABLE_OVERLAY", "1", 1);
    } else {
      unsetenv("KPLAYER_DISABLE_OVERLAY");
    }
    char exec_dir[PATH_MAX];
    snprintf(exec_dir, sizeof(exec_dir), "%s", fm_exec_target_path);
    char *sl = strrchr(exec_dir, '/');
    if (sl && sl > exec_dir) {
      *sl = 0;
      if (chdir(exec_dir) != 0) {
        /* continue even if chdir fails */
      }
    }
    if (fm_exec_is_script) {
      char *const bash_argv[] = {"/bin/bash", fm_exec_target_path, NULL};
      execv("/bin/bash", bash_argv);
      char *const sh_argv[] = {"/bin/sh", fm_exec_target_path, NULL};
      execv("/bin/sh", sh_argv);
    } else {
      char *const bin_argv[] = {fm_exec_target_path, NULL};
      execv(fm_exec_target_path, bin_argv);
    }
    _exit(127);
  }
  return kp_upd_exit_code ? kp_upd_exit_code : 0;
}
