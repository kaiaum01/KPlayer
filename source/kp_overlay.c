#define _GNU_SOURCE
/*
 * KPlayer R36S In-Game & System-Wide Mini-Player Overlay (libkp_overlay.so)
 *
 * Preloaded into launched games and EmulationStation when enabled via
 * KPLAYER_OVERLAY_SHM / /etc/ld.so.preload. Zero extra library dependencies
 * beyond libc/libdl, zero static RGBA BSS bloat, and immediately inert inside
 * system daemons, shells, python, oga_events, gptokeyb, and kplayer itself.
 *
 * Graphics hooks:
 *   - SDL_RenderPresent             (2D SDL2 games — software & GLES-backed)
 *   - SDL_GL_SwapWindow             (EmulationStation & SDL2 OpenGL ES / KMS-DRM)
 *   - eglSwapBuffers                (RetroArch, Godot, Love2D, native EGL engines)
 *   - eglSwapBuffersWithDamageKHR   (EGL partial-damage compositors / Mali G31)
 *   - eglSwapBuffersWithDamageEXT   (EGL partial-damage compositors / Mali G31)
 *
 * Input isolation hooks (zero EVIOCGRAB conflicts, zero stuck keys in ES):
 *   - SDL_PollEvent / SDL_WaitEvent / SDL_WaitEventTimeout / SDL_PeepEvents
 *   - SDL_JoystickGetButton / SDL_JoystickGetHat / SDL_JoystickGetAxis
 *   - SDL_GameControllerGetButton / SDL_GameControllerGetAxis
 *
 * Supports OpenGL ES 1.1 (matrix save/restore without stack overflow),
 * OpenGL ES 2.0 (strict GLES2 enums only — no GLES3 GL_INVALID_ENUM), and
 * OpenGL ES 3.0+ (PBO/VAO save/restore), with a 4-slot per-EGLContext cache.
 */

#include <dlfcn.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#include "kp_overlay_shared.h"

/* Minimal EGL / GLES2 / GLES1 / SDL2 type & constant definitions */
typedef void *EGLDisplay;
typedef void *EGLSurface;
typedef void *EGLContext;
typedef int32_t EGLint;
typedef unsigned int EGLBoolean;

typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef unsigned int GLbitfield;
typedef int GLint;
typedef int GLsizei;
typedef unsigned int GLuint;
typedef float GLfloat;
typedef char GLchar;
typedef ptrdiff_t GLsizeiptr;

#define EGL_HEIGHT 0x3056
#define EGL_WIDTH 0x3057
#define EGL_DRAW 0x3059
#define EGL_CONTEXT_CLIENT_VERSION 0x3098

#define GL_FALSE 0
#define GL_TRUE 1
#define GL_TRIANGLE_STRIP 0x0005
#define GL_UNSIGNED_BYTE 0x1401
#define GL_FLOAT 0x1406
#define GL_RGBA 0x1908
#define GL_VERSION 0x1F02
#define GL_TEXTURE_2D 0x0DE1
#define GL_TEXTURE0 0x84C0
#define GL_TEXTURE_MAG_FILTER 0x2800
#define GL_TEXTURE_MIN_FILTER 0x2801
#define GL_TEXTURE_WRAP_S 0x2802
#define GL_TEXTURE_WRAP_T 0x2803
#define GL_LINEAR 0x2601
#define GL_CLAMP_TO_EDGE 0x812F
#define GL_ARRAY_BUFFER 0x8892
#define GL_ELEMENT_ARRAY_BUFFER 0x8893
#define GL_PIXEL_UNPACK_BUFFER 0x88EC
#define GL_PIXEL_UNPACK_BUFFER_BINDING 0x88EF
#define GL_STATIC_DRAW 0x88E4
#define GL_DYNAMIC_DRAW 0x88E8
#define GL_FRAGMENT_SHADER 0x8B30
#define GL_VERTEX_SHADER 0x8B31
#define GL_COMPILE_STATUS 0x8B81
#define GL_LINK_STATUS 0x8B82
#define GL_CURRENT_PROGRAM 0x8B8D
#define GL_ACTIVE_TEXTURE 0x84E0
#define GL_CLIENT_ACTIVE_TEXTURE 0x84E1
#define GL_TEXTURE_BINDING_2D 0x8069
#define GL_ARRAY_BUFFER_BINDING 0x8894
#define GL_ELEMENT_ARRAY_BUFFER_BINDING 0x8895
#define GL_FRAMEBUFFER 0x8D40
#define GL_FRAMEBUFFER_BINDING 0x8CA6
#define GL_VERTEX_ARRAY_BINDING 0x85B5
#define GL_VIEWPORT 0x0BA2
#define GL_SCISSOR_BOX 0x0C10
#define GL_SCISSOR_TEST 0x0C11
#define GL_BLEND 0x0BE2
#define GL_BLEND_DST 0x0BE0
#define GL_BLEND_SRC 0x0BE1
#define GL_BLEND_SRC_RGB 0x80C9
#define GL_BLEND_DST_RGB 0x80C8
#define GL_BLEND_SRC_ALPHA 0x80CB
#define GL_BLEND_DST_ALPHA 0x80CA
#define GL_BLEND_EQUATION_RGB 0x8009
#define GL_BLEND_EQUATION_ALPHA 0x883D
#define GL_ONE 1
#define GL_SRC_ALPHA 0x0302
#define GL_ONE_MINUS_SRC_ALPHA 0x0303
#define GL_FUNC_ADD 0x8006
#define GL_DEPTH_TEST 0x0B71
#define GL_CULL_FACE 0x0B44
#define GL_STENCIL_TEST 0x0B90
#define GL_ALPHA_TEST 0x0BC0
#define GL_LIGHTING 0x0B50
#define GL_FOG 0x0B60
#define GL_COLOR_WRITEMASK 0x0C23
#define GL_UNPACK_ALIGNMENT 0x0CF5
#define GL_VERTEX_ATTRIB_ARRAY_ENABLED 0x8622
#define GL_VERTEX_ATTRIB_ARRAY_SIZE 0x8623
#define GL_VERTEX_ATTRIB_ARRAY_STRIDE 0x8624
#define GL_VERTEX_ATTRIB_ARRAY_TYPE 0x8625
#define GL_VERTEX_ATTRIB_ARRAY_NORMALIZED 0x886A
#define GL_VERTEX_ATTRIB_ARRAY_POINTER 0x8645
#define GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING 0x889F
#define GL_MODELVIEW 0x1700
#define GL_PROJECTION 0x1701
#define GL_TEXTURE_MATRIX_MODE 0x1702
#define GL_MATRIX_MODE 0x0BA0
#define GL_MODELVIEW_MATRIX 0x0BA6
#define GL_PROJECTION_MATRIX 0x0BA7
#define GL_TEXTURE_MATRIX 0x0BA8
#define GL_TEXTURE_ENV 0x2300
#define GL_TEXTURE_ENV_MODE 0x2200
#define GL_REPLACE 0x1E01
#define GL_VERTEX_ARRAY 0x8074
#define GL_COLOR_ARRAY 0x8076
#define GL_TEXTURE_COORD_ARRAY 0x8078
#define GL_CURRENT_COLOR 0x0B00

#define KP_SDL_PIXELFORMAT_ABGR8888 0x16762004u
#define KP_SDL_TEXTUREACCESS_STREAMING 1
#define KP_SDL_BLENDMODE_BLEND 1

/* SDL2 event ABI constants (verified 56-byte union on Linux ARM64 & x86_64) */
#define KP_SDL_EVENT_SIZE 56
#define KP_SDL_KEYDOWN 0x300u
#define KP_SDL_KEYUP 0x301u
#define KP_SDL_TEXTEDITING 0x302u
#define KP_SDL_TEXTINPUT 0x303u
#define KP_SDL_JOYAXISMOTION 0x600u
#define KP_SDL_JOYBALLMOTION 0x601u
#define KP_SDL_JOYHATMOTION 0x602u
#define KP_SDL_JOYBUTTONDOWN 0x603u
#define KP_SDL_JOYBUTTONUP 0x604u
#define KP_SDL_CONTROLLERAXISMOTION 0x650u
#define KP_SDL_CONTROLLERBUTTONDOWN 0x651u
#define KP_SDL_CONTROLLERBUTTONUP 0x652u
#define KP_SDL_GETEVENT 2

typedef struct {
  int x, y, w, h;
} KpSdlRect;

/* ==================== SHARED MEMORY READER (INODE-RESILIENT) ==================== */

static volatile int g_shm_disabled = -1;
static int64_t g_shm_last_try_ms = 0;
static int64_t g_shm_last_stat_ms = 0;
static int64_t g_last_hb_ms = 0;
static int64_t g_last_input_hb_ms = 0;
static KpOverlayShared *g_shm = NULL;
static bool g_shm_writable = false;
static dev_t g_shm_dev = 0;
static ino_t g_shm_ino = 0;
static uint32_t *g_rgba_buf = NULL;
static uint32_t g_rendered_seq = 0xFFFFFFFFu;
static __thread int g_in_hook = 0;
static __thread int g_in_event_hook = 0;
static volatile int g_lock = 0;

static void kp_lock(void) {
  while (__atomic_test_and_set(&g_lock, __ATOMIC_ACQUIRE)) {
  }
}

static void kp_unlock(void) {
  __atomic_clear(&g_lock, __ATOMIC_RELEASE);
}

static bool kp_should_skip_process(void) {
  int cached = __atomic_load_n(&g_shm_disabled, __ATOMIC_ACQUIRE);
  if (cached >= 0) return cached != 0;

  int skip = 0;
  const char *dis = getenv("KPLAYER_DISABLE_OVERLAY");
  if (dis && dis[0] == '1') {
    skip = 1;
  } else {
    int fd = open("/proc/self/comm", O_RDONLY | O_CLOEXEC);
    if (fd >= 0) {
      char comm[32];
      ssize_t n = read(fd, comm, sizeof(comm) - 1);
      close(fd);
      if (n > 0) {
        comm[n] = 0;
        while (n > 0 && (comm[n - 1] == '\n' || comm[n - 1] == '\r')) comm[--n] = 0;
        static const char *const skip_list[] = {
            "kplayer",        "bash",           "sh",           "dash",
            "ash",            "python3",        "python",       "systemd",
            "systemd-journal","systemd-udevd",  "systemd-logind","dbus-daemon",
            "pulseaudio",     "pipewire",       "wireplumber",  "oga_events",
            "gptokeyb",       "gptokeyb2",      "sshd",         "udevd",
            "cron",           "mpg123",         "ogg123",       "alsactl",
            "wpa_supplicant", "NetworkManager", "dhclient",     "udhcpc",
            "getty",          "agetty",         "login",        "sudo",
            "su",             "grep",           "sed",          "awk",
            "sleep",          "cat",            "ls",           "cp",
            "mv",             "rm",             "chmod",        "chown",
            "find",           "tar",            "gzip",         "unzip",
            "curl",           "wget",           "pgrep",        "pkill",
        };
        for (size_t i = 0; i < sizeof(skip_list) / sizeof(skip_list[0]); i++) {
          if (strcmp(comm, skip_list[i]) == 0) {
            skip = 1;
            break;
          }
        }
      }
    }
  }
  __atomic_store_n(&g_shm_disabled, skip, __ATOMIC_RELEASE);
  return skip != 0;
}

static const char *kp_shm_path(void) {
  const char *path = getenv("KPLAYER_OVERLAY_SHM");
  if (!path || !path[0]) path = KP_OV_DEFAULT_SHM_PATH;
  return path;
}

/* Must be called with kp_lock() held so munmap on inode rotation is 100% race-free */
static KpOverlayShared *kp_get_shm_locked(int64_t now) {
  if (kp_should_skip_process()) return NULL;

  const char *path = kp_shm_path();
  if (g_shm) {
    if (now - g_shm_last_stat_ms >= 1000) {
      g_shm_last_stat_ms = now;
      struct stat st;
      if (stat(path, &st) == 0 && (st.st_dev != g_shm_dev || st.st_ino != g_shm_ino)) {
        munmap(g_shm, sizeof(KpOverlayShared));
        g_shm = NULL;
        g_shm_writable = false;
        g_shm_dev = 0;
        g_shm_ino = 0;
        g_rendered_seq = 0xFFFFFFFFu;
        g_shm_last_try_ms = 0;
      }
    }
    if (g_shm) return g_shm;
  }

  if (g_shm_last_try_ms != 0 && (now - g_shm_last_try_ms) < 1000) {
    return NULL;
  }
  g_shm_last_try_ms = now ? now : 1;

  bool writable = true;
  int fd = open(path, O_RDWR | O_CLOEXEC);
  if (fd < 0) {
    writable = false;
    fd = open(path, O_RDONLY | O_CLOEXEC);
  }
  if (fd >= 0) {
    struct stat st;
    if (fstat(fd, &st) == 0 && st.st_size >= (off_t)sizeof(KpOverlayShared)) {
      int prot = writable ? (PROT_READ | PROT_WRITE) : PROT_READ;
      void *m = mmap(NULL, sizeof(KpOverlayShared), prot, MAP_SHARED, fd, 0);
      if (m != MAP_FAILED) {
        g_shm = (KpOverlayShared *)m;
        g_shm_writable = writable;
        g_shm_dev = st.st_dev;
        g_shm_ino = st.st_ino;
        g_shm_last_stat_ms = now;
      }
    }
    close(fd);
  }
  return g_shm;
}

static bool kp_shm_valid(const KpOverlayShared *shm) {
  return shm && __atomic_load_n(&shm->magic, __ATOMIC_ACQUIRE) == KP_OV_MAGIC &&
         shm->version == KP_OV_VERSION;
}

static void kp_touch_hook_heartbeat_locked(KpOverlayShared *shm, int64_t now) {
  if (!shm || !g_shm_writable || !kp_shm_valid(shm)) return;
  if (now - g_last_hb_ms >= 250 || g_last_hb_ms == 0) {
    g_last_hb_ms = now;
    shm->last_hook_ms = now;
    shm->hook_pid = (uint32_t)getpid();
  }
}

static bool kp_overlay_active_locked(KpOverlayShared **out_shm) {
  int64_t now = kp_ov_now_ms();
  KpOverlayShared *shm = kp_get_shm_locked(now);
  if (!kp_shm_valid(shm)) return false;
  kp_touch_hook_heartbeat_locked(shm, now);
  bool toast_active = (shm->toast_until_ms > 0 && now < shm->toast_until_ms);
  if (!shm->overlay_open && !toast_active) return false;
  *out_shm = shm;
  return true;
}

static bool kp_refresh_rgba_if_needed(const KpOverlayShared *shm) {
  if (!g_rgba_buf) {
    g_rgba_buf = (uint32_t *)malloc((size_t)KP_OV_CARD_W * KP_OV_CARD_H * sizeof(uint32_t));
    if (!g_rgba_buf) return false;
    g_rendered_seq = 0xFFFFFFFFu;
  }
  uint32_t cur_seq = __atomic_load_n(&shm->seq, __ATOMIC_ACQUIRE);
  if (cur_seq == g_rendered_seq) return false;
  KpOverlayShared snap;
  memcpy(&snap, shm, sizeof(snap));
  kp_ov_render_rgba(&snap, g_rgba_buf);
  g_rendered_seq = cur_seq;
  return true;
}

static void kp_compute_card_rect(int sw, int sh, int *rx, int *ry, int *rw, int *rh) {
  /* KPlayer Mini-Player placement: compact vertical panel docked at top-left */
  int margin_x = sw >= 480 ? 16 : 8;
  int margin_y = sh >= 360 ? 16 : 8;
  int target_w = (sw * 46) / 100;
  if (target_w > 304) target_w = 304;
  if (target_w < 200) target_w = sw - margin_x * 2;
  int target_h = (target_w * KP_OV_CARD_H) / KP_OV_CARD_W;
  int max_h = (sh * 64) / 100;
  if (max_h < 150) max_h = sh - margin_y * 2;
  if (target_h > max_h) {
    target_h = max_h;
    target_w = (target_h * KP_OV_CARD_W) / KP_OV_CARD_H;
  }
  if (target_w > sw - margin_x * 2) target_w = sw - margin_x * 2;
  if (target_h > sh - margin_y * 2) target_h = sh - margin_y * 2;
  if (target_w < 120) target_w = 120;
  if (target_h < 96) target_h = 96;
  *rw = target_w;
  *rh = target_h;
  *rx = margin_x;
  *ry = margin_y;
}

/* ==================== LAZY GLES2 / GLES1 / EGL RESOLVER ==================== */

typedef struct {
  bool loaded;
  bool ok_gles2;
  bool ok_gles1;
  void *egl_dl;
  void *gles2_dl;
  void *gles1_dl;
  void *mali_dl;
  void *(*eglGetProcAddress)(const char *);
  void *(*SDL_GL_GetProcAddress)(const char *);

  EGLDisplay (*eglGetCurrentDisplay)(void);
  EGLSurface (*eglGetCurrentSurface)(EGLint);
  EGLContext (*eglGetCurrentContext)(void);
  EGLBoolean (*eglQuerySurface)(EGLDisplay, EGLSurface, EGLint, EGLint *);
  EGLBoolean (*eglQueryContext)(EGLDisplay, EGLContext, EGLint, EGLint *);

  /* Common GLES1/GLES2 functions */
  const unsigned char *(*glGetString)(GLenum);
  void (*glGenTextures)(GLsizei, GLuint *);
  void (*glDeleteTextures)(GLsizei, const GLuint *);
  void (*glActiveTexture)(GLenum);
  void (*glBindTexture)(GLenum, GLuint);
  void (*glTexParameteri)(GLenum, GLenum, GLint);
  void (*glTexImage2D)(GLenum, GLint, GLint, GLsizei, GLsizei, GLint, GLenum, GLenum, const void *);
  void (*glTexSubImage2D)(GLenum, GLint, GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, const void *);
  void (*glPixelStorei)(GLenum, GLint);
  void (*glViewport)(GLint, GLint, GLsizei, GLsizei);
  void (*glScissor)(GLint, GLint, GLsizei, GLsizei);
  void (*glEnable)(GLenum);
  void (*glDisable)(GLenum);
  GLboolean (*glIsEnabled)(GLenum);
  void (*glBlendFunc)(GLenum, GLenum);
  void (*glColorMask)(GLboolean, GLboolean, GLboolean, GLboolean);
  void (*glDrawArrays)(GLenum, GLint, GLsizei);
  void (*glGetIntegerv)(GLenum, GLint *);
  void (*glGetBooleanv)(GLenum, GLboolean *);
  void (*glGetFloatv)(GLenum, GLfloat *);

  /* GLES2+ functions */
  GLuint (*glCreateShader)(GLenum);
  void (*glShaderSource)(GLuint, GLsizei, const GLchar *const *, const GLint *);
  void (*glCompileShader)(GLuint);
  void (*glGetShaderiv)(GLuint, GLenum, GLint *);
  void (*glDeleteShader)(GLuint);
  GLuint (*glCreateProgram)(void);
  void (*glAttachShader)(GLuint, GLuint);
  void (*glLinkProgram)(GLuint);
  void (*glGetProgramiv)(GLuint, GLenum, GLint *);
  void (*glDeleteProgram)(GLuint);
  void (*glUseProgram)(GLuint);
  GLint (*glGetAttribLocation)(GLuint, const GLchar *);
  GLint (*glGetUniformLocation)(GLuint, const GLchar *);
  void (*glUniform1i)(GLint, GLint);
  void (*glGenBuffers)(GLsizei, GLuint *);
  void (*glDeleteBuffers)(GLsizei, const GLuint *);
  void (*glBindBuffer)(GLenum, GLuint);
  void (*glBufferData)(GLenum, GLsizeiptr, const void *, GLenum);
  void (*glBindFramebuffer)(GLenum, GLuint);
  void (*glBlendFuncSeparate)(GLenum, GLenum, GLenum, GLenum);
  void (*glBlendEquationSeparate)(GLenum, GLenum);
  void (*glEnableVertexAttribArray)(GLuint);
  void (*glDisableVertexAttribArray)(GLuint);
  void (*glVertexAttribPointer)(GLuint, GLint, GLenum, GLboolean, GLsizei, const void *);
  void (*glGetVertexAttribiv)(GLuint, GLenum, GLint *);
  void (*glGetVertexAttribPointerv)(GLuint, GLenum, void **);
  void (*glBindVertexArray)(GLuint);

  /* GLES1 fixed-function pipeline functions */
  void (*glMatrixMode)(GLenum);
  void (*glPushMatrix)(void);
  void (*glPopMatrix)(void);
  void (*glLoadIdentity)(void);
  void (*glLoadMatrixf)(const GLfloat *);
  void (*glTexEnvi)(GLenum, GLenum, GLint);
  void (*glGetTexEnviv)(GLenum, GLenum, GLint *);
  void (*glClientActiveTexture)(GLenum);
  void (*glEnableClientState)(GLenum);
  void (*glDisableClientState)(GLenum);
  void (*glVertexPointer)(GLint, GLenum, GLsizei, const void *);
  void (*glTexCoordPointer)(GLint, GLenum, GLsizei, const void *);
  void (*glColor4f)(GLfloat, GLfloat, GLfloat, GLfloat);
} KpGlApi;

static KpGlApi g_gl;

static void *kp_resolve_sym_chain(void *h1, void *h2, void *h3, bool try_proc_addr,
                                  const char *name) {
  void *p = dlsym(RTLD_DEFAULT, name);
  if (!p && h1) p = dlsym(h1, name);
  if (!p && h2) p = dlsym(h2, name);
  if (!p && h3) p = dlsym(h3, name);
  if (!p && try_proc_addr && g_gl.SDL_GL_GetProcAddress) {
    p = g_gl.SDL_GL_GetProcAddress(name);
  }
  if (!p && try_proc_addr && g_gl.eglGetProcAddress) {
    p = g_gl.eglGetProcAddress(name);
  }
  return p;
}

static bool kp_gl_ensure_loaded(void) {
  if (g_gl.loaded) return g_gl.ok_gles2 || g_gl.ok_gles1;
  g_gl.loaded = true;
  g_gl.ok_gles2 = false;
  g_gl.ok_gles1 = false;

  g_gl.mali_dl = dlopen("libmali.so", RTLD_LAZY | RTLD_NOLOAD);
  if (!g_gl.mali_dl) g_gl.mali_dl = dlopen("libmali.so.1", RTLD_LAZY | RTLD_NOLOAD);

  g_gl.egl_dl = dlopen("libEGL.so.1", RTLD_LAZY | RTLD_NOLOAD);
  if (!g_gl.egl_dl) g_gl.egl_dl = dlopen("libEGL.so", RTLD_LAZY | RTLD_NOLOAD);

  g_gl.gles2_dl = dlopen("libGLESv2.so.2", RTLD_LAZY | RTLD_NOLOAD);
  if (!g_gl.gles2_dl) g_gl.gles2_dl = dlopen("libGLESv2.so", RTLD_LAZY | RTLD_NOLOAD);
  if (!g_gl.gles2_dl) g_gl.gles2_dl = dlopen("libGL.so.1", RTLD_LAZY | RTLD_NOLOAD);

  g_gl.gles1_dl = dlopen("libGLESv1_CM.so.1", RTLD_LAZY | RTLD_NOLOAD);
  if (!g_gl.gles1_dl) g_gl.gles1_dl = dlopen("libGLESv1_CM.so", RTLD_LAZY | RTLD_NOLOAD);

  *(void **)(&g_gl.SDL_GL_GetProcAddress) = dlsym(RTLD_DEFAULT, "SDL_GL_GetProcAddress");
  *(void **)(&g_gl.eglGetProcAddress) =
      kp_resolve_sym_chain(g_gl.egl_dl, g_gl.mali_dl, NULL, false, "eglGetProcAddress");

#define LOAD_EGL(fn) \
  *(void **)(&g_gl.fn) = kp_resolve_sym_chain(g_gl.egl_dl, g_gl.mali_dl, NULL, false, #fn)
#define LOAD_GL(fn) \
  *(void **)(&g_gl.fn) = kp_resolve_sym_chain(g_gl.gles2_dl, g_gl.mali_dl, g_gl.gles1_dl, true, #fn)
#define LOAD_GL1(fn) \
  *(void **)(&g_gl.fn) = kp_resolve_sym_chain(g_gl.gles1_dl, g_gl.mali_dl, g_gl.gles2_dl, true, #fn)

  LOAD_EGL(eglGetCurrentDisplay);
  LOAD_EGL(eglGetCurrentSurface);
  LOAD_EGL(eglGetCurrentContext);
  LOAD_EGL(eglQuerySurface);
  LOAD_EGL(eglQueryContext);

  LOAD_GL(glGetString);
  LOAD_GL(glGenTextures);
  LOAD_GL(glDeleteTextures);
  LOAD_GL(glActiveTexture);
  LOAD_GL(glBindTexture);
  LOAD_GL(glTexParameteri);
  LOAD_GL(glTexImage2D);
  LOAD_GL(glTexSubImage2D);
  LOAD_GL(glPixelStorei);
  LOAD_GL(glViewport);
  LOAD_GL(glScissor);
  LOAD_GL(glEnable);
  LOAD_GL(glDisable);
  LOAD_GL(glIsEnabled);
  LOAD_GL(glBlendFunc);
  LOAD_GL(glColorMask);
  LOAD_GL(glDrawArrays);
  LOAD_GL(glGetIntegerv);
  LOAD_GL(glGetBooleanv);
  LOAD_GL(glGetFloatv);

  LOAD_GL(glCreateShader);
  LOAD_GL(glShaderSource);
  LOAD_GL(glCompileShader);
  LOAD_GL(glGetShaderiv);
  LOAD_GL(glDeleteShader);
  LOAD_GL(glCreateProgram);
  LOAD_GL(glAttachShader);
  LOAD_GL(glLinkProgram);
  LOAD_GL(glGetProgramiv);
  LOAD_GL(glDeleteProgram);
  LOAD_GL(glUseProgram);
  LOAD_GL(glGetAttribLocation);
  LOAD_GL(glGetUniformLocation);
  LOAD_GL(glUniform1i);
  LOAD_GL(glGenBuffers);
  LOAD_GL(glDeleteBuffers);
  LOAD_GL(glBindBuffer);
  LOAD_GL(glBufferData);
  LOAD_GL(glBindFramebuffer);
  LOAD_GL(glBlendFuncSeparate);
  LOAD_GL(glBlendEquationSeparate);
  LOAD_GL(glEnableVertexAttribArray);
  LOAD_GL(glDisableVertexAttribArray);
  LOAD_GL(glVertexAttribPointer);
  LOAD_GL(glGetVertexAttribiv);
  LOAD_GL(glGetVertexAttribPointerv);
  LOAD_GL(glBindVertexArray);

  LOAD_GL1(glMatrixMode);
  LOAD_GL1(glPushMatrix);
  LOAD_GL1(glPopMatrix);
  LOAD_GL1(glLoadIdentity);
  LOAD_GL1(glLoadMatrixf);
  LOAD_GL1(glTexEnvi);
  LOAD_GL1(glGetTexEnviv);
  LOAD_GL1(glClientActiveTexture);
  LOAD_GL1(glEnableClientState);
  LOAD_GL1(glDisableClientState);
  LOAD_GL1(glVertexPointer);
  LOAD_GL1(glTexCoordPointer);
  LOAD_GL1(glColor4f);

#undef LOAD_EGL
#undef LOAD_GL
#undef LOAD_GL1

  bool base_ok = g_gl.glGenTextures && g_gl.glBindTexture && g_gl.glTexParameteri &&
                 g_gl.glTexImage2D && g_gl.glTexSubImage2D && g_gl.glPixelStorei &&
                 g_gl.glViewport && g_gl.glScissor && g_gl.glEnable && g_gl.glDisable &&
                 g_gl.glIsEnabled && g_gl.glColorMask && g_gl.glDrawArrays &&
                 g_gl.glGetIntegerv && g_gl.glGetBooleanv;

  g_gl.ok_gles2 = base_ok && g_gl.glActiveTexture && g_gl.glCreateShader && g_gl.glShaderSource &&
                  g_gl.glCompileShader && g_gl.glGetShaderiv && g_gl.glDeleteShader &&
                  g_gl.glCreateProgram && g_gl.glAttachShader && g_gl.glLinkProgram &&
                  g_gl.glGetProgramiv && g_gl.glDeleteProgram && g_gl.glUseProgram &&
                  g_gl.glGetAttribLocation && g_gl.glGetUniformLocation && g_gl.glUniform1i &&
                  g_gl.glGenBuffers && g_gl.glBindBuffer && g_gl.glBufferData &&
                  g_gl.glBindFramebuffer && g_gl.glBlendFuncSeparate &&
                  g_gl.glBlendEquationSeparate && g_gl.glEnableVertexAttribArray &&
                  g_gl.glDisableVertexAttribArray && g_gl.glVertexAttribPointer &&
                  g_gl.glGetVertexAttribiv && g_gl.glGetVertexAttribPointerv;

  g_gl.ok_gles1 = base_ok && g_gl.glBlendFunc && g_gl.glMatrixMode && g_gl.glLoadIdentity &&
                  (g_gl.glLoadMatrixf || (g_gl.glPushMatrix && g_gl.glPopMatrix)) &&
                  g_gl.glEnableClientState && g_gl.glDisableClientState &&
                  g_gl.glVertexPointer && g_gl.glTexCoordPointer;

  return g_gl.ok_gles2 || g_gl.ok_gles1;
}

#define KP_MAX_GL_SLOTS 4

typedef struct {
  EGLContext ctx;
  int client_ver;
  bool use_gles1;
  bool init_failed;
  uint32_t last_used;
  GLuint prog;
  GLuint tex;
  GLuint vbo;
  GLint a_pos;
  GLint a_uv;
  GLint u_tex;
  uint32_t tex_seq;
  bool tex_allocated;
} KpGlState;

static KpGlState g_gl_slots[KP_MAX_GL_SLOTS];
static uint32_t g_gl_lru_clock = 0;

static int kp_detect_gles_version(EGLDisplay dpy, EGLContext cur_ctx) {
  if (g_gl.eglQueryContext && dpy && cur_ctx && cur_ctx != (EGLContext)(uintptr_t)1) {
    EGLint ver = 0;
    if (g_gl.eglQueryContext(dpy, cur_ctx, EGL_CONTEXT_CLIENT_VERSION, &ver) && ver >= 1) {
      return (int)ver;
    }
  }
  if (g_gl.glGetString) {
    const char *vstr = (const char *)g_gl.glGetString(GL_VERSION);
    if (vstr) {
      if (strstr(vstr, "OpenGL ES-CM 1.") || strstr(vstr, "OpenGL ES-CL 1.") ||
          strstr(vstr, "OpenGL ES 1.")) {
        return 1;
      }
      if (strstr(vstr, "OpenGL ES 3.")) return 3;
      if (strstr(vstr, "OpenGL ES 2.")) return 2;
    }
  }
  return 2;
}

static GLuint kp_compile_shader(GLenum type, const char *src) {
  GLuint s = g_gl.glCreateShader(type);
  if (!s) return 0;
  g_gl.glShaderSource(s, 1, &src, NULL);
  g_gl.glCompileShader(s);
  GLint ok = 0;
  g_gl.glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    g_gl.glDeleteShader(s);
    return 0;
  }
  return s;
}

static KpGlState *kp_gl_get_slot(EGLDisplay dpy, EGLContext cur_ctx) {
  for (int i = 0; i < KP_MAX_GL_SLOTS; i++) {
    if (g_gl_slots[i].ctx == cur_ctx) {
      g_gl_slots[i].last_used = ++g_gl_lru_clock;
      if (g_gl_slots[i].init_failed) return NULL;
      if (g_gl_slots[i].use_gles1 && g_gl_slots[i].tex != 0) return &g_gl_slots[i];
      if (!g_gl_slots[i].use_gles1 && g_gl_slots[i].prog != 0 && g_gl_slots[i].tex != 0) {
        return &g_gl_slots[i];
      }
    }
  }

  /* Pick empty slot or least-recently-used slot */
  int pick = 0;
  uint32_t oldest = 0xFFFFFFFFu;
  for (int i = 0; i < KP_MAX_GL_SLOTS; i++) {
    if (!g_gl_slots[i].ctx) {
      pick = i;
      break;
    }
    if (g_gl_slots[i].last_used < oldest) {
      oldest = g_gl_slots[i].last_used;
      pick = i;
    }
  }

  KpGlState *st = &g_gl_slots[pick];
  memset(st, 0, sizeof(*st));
  st->ctx = cur_ctx;
  st->last_used = ++g_gl_lru_clock;
  st->tex_seq = 0xFFFFFFFFu;
  st->client_ver = kp_detect_gles_version(dpy, cur_ctx);

  /* Only touch GLES2 shader pipeline if context is actually GLES 2.0+ */
  if (st->client_ver >= 2 && g_gl.ok_gles2) {
    static const char *vs_src =
        "attribute vec2 a_pos;\n"
        "attribute vec2 a_uv;\n"
        "varying vec2 v_uv;\n"
        "void main() {\n"
        "  v_uv = a_uv;\n"
        "  gl_Position = vec4(a_pos, 0.0, 1.0);\n"
        "}\n";
    static const char *fs_src =
        "#ifdef GL_ES\n"
        "precision mediump float;\n"
        "#endif\n"
        "varying vec2 v_uv;\n"
        "uniform sampler2D u_tex;\n"
        "void main() {\n"
        "  gl_FragColor = texture2D(u_tex, v_uv);\n"
        "}\n";

    GLuint vs = kp_compile_shader(GL_VERTEX_SHADER, vs_src);
    GLuint fs = kp_compile_shader(GL_FRAGMENT_SHADER, fs_src);
    if (vs && fs) {
      GLuint prog = g_gl.glCreateProgram();
      g_gl.glAttachShader(prog, vs);
      g_gl.glAttachShader(prog, fs);
      g_gl.glLinkProgram(prog);
      g_gl.glDeleteShader(vs);
      g_gl.glDeleteShader(fs);

      GLint linked = 0;
      g_gl.glGetProgramiv(prog, GL_LINK_STATUS, &linked);
      if (linked) {
        st->prog = prog;
        st->a_pos = g_gl.glGetAttribLocation(prog, "a_pos");
        st->a_uv = g_gl.glGetAttribLocation(prog, "a_uv");
        st->u_tex = g_gl.glGetUniformLocation(prog, "u_tex");
        if (st->a_pos >= 0 && st->a_uv >= 0) {
          g_gl.glGenTextures(1, &st->tex);
          g_gl.glGenBuffers(1, &st->vbo);
          if (st->tex != 0 && st->vbo != 0) {
            st->use_gles1 = false;
            return st;
          }
        }
      }
      if (prog) g_gl.glDeleteProgram(prog);
      st->prog = 0;
    } else {
      if (vs) g_gl.glDeleteShader(vs);
      if (fs) g_gl.glDeleteShader(fs);
    }
  }

  /* Pure OpenGL ES 1.1 fixed-function pipeline (used by GLES1 EmulationStation builds) */
  if (g_gl.ok_gles1) {
    st->tex = 0;
    g_gl.glGenTextures(1, &st->tex);
    if (st->tex != 0) {
      st->use_gles1 = true;
      return st;
    }
  }

  st->init_failed = true;
  return NULL;
}

typedef struct {
  GLint enabled;
  GLint size;
  GLint type;
  GLint normalized;
  GLint stride;
  GLint buf;
  void *ptr;
} KpAttribBackup;

static void kp_save_attrib(GLint loc, KpAttribBackup *b) {
  memset(b, 0, sizeof(*b));
  if (loc < 0) return;
  g_gl.glGetVertexAttribiv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_ENABLED, &b->enabled);
  g_gl.glGetVertexAttribiv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_SIZE, &b->size);
  g_gl.glGetVertexAttribiv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_TYPE, &b->type);
  g_gl.glGetVertexAttribiv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_NORMALIZED, &b->normalized);
  g_gl.glGetVertexAttribiv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_STRIDE, &b->stride);
  g_gl.glGetVertexAttribiv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING, &b->buf);
  g_gl.glGetVertexAttribPointerv((GLuint)loc, GL_VERTEX_ATTRIB_ARRAY_POINTER, &b->ptr);
}

static void kp_restore_attrib(GLint loc, const KpAttribBackup *b) {
  if (loc < 0) return;
  if (b->size > 0 && b->type > 0) {
    g_gl.glBindBuffer(GL_ARRAY_BUFFER, (GLuint)b->buf);
    g_gl.glVertexAttribPointer((GLuint)loc, b->size, (GLenum)b->type,
                               (GLboolean)b->normalized, b->stride, b->ptr);
  }
  if (b->enabled) {
    g_gl.glEnableVertexAttribArray((GLuint)loc);
  } else {
    g_gl.glDisableVertexAttribArray((GLuint)loc);
  }
}

static bool kp_upload_overlay_tex(KpGlState *st, KpOverlayShared *shm) {
  bool dirty = kp_refresh_rgba_if_needed(shm);
  if (!g_rgba_buf) return false;
  g_gl.glBindTexture(GL_TEXTURE_2D, st->tex);
  if (!st->tex_allocated || dirty || st->tex_seq != g_rendered_seq) {
    g_gl.glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    g_gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    g_gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    g_gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    g_gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    if (!st->tex_allocated) {
      g_gl.glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, KP_OV_CARD_W, KP_OV_CARD_H, 0,
                        GL_RGBA, GL_UNSIGNED_BYTE, g_rgba_buf);
      st->tex_allocated = true;
    } else {
      g_gl.glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, KP_OV_CARD_W, KP_OV_CARD_H,
                           GL_RGBA, GL_UNSIGNED_BYTE, g_rgba_buf);
    }
    st->tex_seq = g_rendered_seq;
  }
  return true;
}

static bool kp_gles1_draw_overlay(KpGlState *st, KpOverlayShared *shm, int sw, int sh) {
  GLint prev_vp[4] = {0, 0, 0, 0};
  GLint prev_sc[4] = {0, 0, 0, 0};
  GLint prev_act_tex = GL_TEXTURE0;
  GLint prev_cli_tex = GL_TEXTURE0;
  GLint prev_tex0 = 0;
  GLint prev_mat_mode = GL_MODELVIEW;
  GLint prev_unpack = 4;
  GLint prev_vbo = 0;
  GLint prev_blend_src = GL_SRC_ALPHA;
  GLint prev_blend_dst = GL_ONE_MINUS_SRC_ALPHA;
  GLint prev_tex_env = GL_REPLACE;
  GLboolean prev_cmask[4] = {1, 1, 1, 1};
  GLfloat prev_color[4] = {1.0f, 1.0f, 1.0f, 1.0f};
  GLfloat prev_proj[16];
  GLfloat prev_mv[16];
  GLfloat prev_texm[16];
  bool saved_mats = false;

  g_gl.glGetIntegerv(GL_VIEWPORT, prev_vp);
  if (sw <= 0 || sh <= 0) {
    sw = prev_vp[2];
    sh = prev_vp[3];
  }
  if (sw < 320 || sh < 240) {
    return false;
  }

  g_gl.glGetIntegerv(GL_SCISSOR_BOX, prev_sc);
  if (g_gl.glActiveTexture) g_gl.glGetIntegerv(GL_ACTIVE_TEXTURE, &prev_act_tex);
  if (g_gl.glClientActiveTexture) g_gl.glGetIntegerv(GL_CLIENT_ACTIVE_TEXTURE, &prev_cli_tex);
  g_gl.glGetIntegerv(GL_MATRIX_MODE, &prev_mat_mode);
  g_gl.glGetIntegerv(GL_UNPACK_ALIGNMENT, &prev_unpack);
  g_gl.glGetIntegerv(GL_BLEND_SRC, &prev_blend_src);
  g_gl.glGetIntegerv(GL_BLEND_DST, &prev_blend_dst);
  if (g_gl.glBindBuffer) g_gl.glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &prev_vbo);
  g_gl.glGetBooleanv(GL_COLOR_WRITEMASK, prev_cmask);
  if (g_gl.glGetFloatv) {
    g_gl.glGetFloatv(GL_CURRENT_COLOR, prev_color);
    if (g_gl.glLoadMatrixf) {
      g_gl.glGetFloatv(GL_PROJECTION_MATRIX, prev_proj);
      g_gl.glGetFloatv(GL_MODELVIEW_MATRIX, prev_mv);
      g_gl.glGetFloatv(GL_TEXTURE_MATRIX, prev_texm);
      saved_mats = true;
    }
  }

  GLboolean prev_tex2d = g_gl.glIsEnabled(GL_TEXTURE_2D);
  GLboolean prev_blend = g_gl.glIsEnabled(GL_BLEND);
  GLboolean prev_scissor = g_gl.glIsEnabled(GL_SCISSOR_TEST);
  GLboolean prev_depth = g_gl.glIsEnabled(GL_DEPTH_TEST);
  GLboolean prev_cull = g_gl.glIsEnabled(GL_CULL_FACE);
  GLboolean prev_alpha = g_gl.glIsEnabled(GL_ALPHA_TEST);
  GLboolean prev_light = g_gl.glIsEnabled(GL_LIGHTING);
  GLboolean prev_fog = g_gl.glIsEnabled(GL_FOG);
  GLboolean prev_va = g_gl.glIsEnabled(GL_VERTEX_ARRAY);
  GLboolean prev_ta = g_gl.glIsEnabled(GL_TEXTURE_COORD_ARRAY);
  GLboolean prev_ca = g_gl.glIsEnabled(GL_COLOR_ARRAY);

  if (g_gl.glActiveTexture) g_gl.glActiveTexture(GL_TEXTURE0);
  if (g_gl.glClientActiveTexture) g_gl.glClientActiveTexture(GL_TEXTURE0);
  g_gl.glGetIntegerv(GL_TEXTURE_BINDING_2D, &prev_tex0);
  if (g_gl.glGetTexEnviv) g_gl.glGetTexEnviv(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, &prev_tex_env);

  if (!kp_upload_overlay_tex(st, shm)) {
    g_gl.glBindTexture(GL_TEXTURE_2D, (GLuint)prev_tex0);
    if (g_gl.glActiveTexture) g_gl.glActiveTexture((GLenum)prev_act_tex);
    if (g_gl.glClientActiveTexture) g_gl.glClientActiveTexture((GLenum)prev_cli_tex);
    return false;
  }

  int rx, ry, rw, rh;
  kp_compute_card_rect(sw, sh, &rx, &ry, &rw, &rh);
  float x0 = (2.0f * (float)rx / (float)sw) - 1.0f;
  float x1 = (2.0f * (float)(rx + rw) / (float)sw) - 1.0f;
  float y_top = 1.0f - (2.0f * (float)ry / (float)sh);
  float y_bot = 1.0f - (2.0f * (float)(ry + rh) / (float)sh);

  const GLfloat pos[8] = {x0, y_top, x1, y_top, x0, y_bot, x1, y_bot};
  const GLfloat uv[8] = {0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f};

  if (g_gl.glBindBuffer && prev_vbo != 0) g_gl.glBindBuffer(GL_ARRAY_BUFFER, 0);

  g_gl.glViewport(0, 0, sw, sh);
  g_gl.glDisable(GL_SCISSOR_TEST);
  g_gl.glDisable(GL_DEPTH_TEST);
  g_gl.glDisable(GL_CULL_FACE);
  g_gl.glDisable(GL_ALPHA_TEST);
  g_gl.glDisable(GL_LIGHTING);
  g_gl.glDisable(GL_FOG);
  g_gl.glEnable(GL_TEXTURE_2D);
  g_gl.glEnable(GL_BLEND);
  g_gl.glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  g_gl.glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  if (g_gl.glTexEnvi) g_gl.glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE);
  if (g_gl.glColor4f) g_gl.glColor4f(1.0f, 1.0f, 1.0f, 1.0f);

  /* Avoid glPushMatrix() to prevent GL_STACK_OVERFLOW on 2-deep GLES 1.1 projection stacks */
  if (saved_mats) {
    g_gl.glMatrixMode(GL_PROJECTION);
    g_gl.glLoadIdentity();
    g_gl.glMatrixMode(GL_MODELVIEW);
    g_gl.glLoadIdentity();
    g_gl.glMatrixMode(GL_TEXTURE_MATRIX_MODE);
    g_gl.glLoadIdentity();
  } else {
    g_gl.glMatrixMode(GL_PROJECTION);
    g_gl.glPushMatrix();
    g_gl.glLoadIdentity();
    g_gl.glMatrixMode(GL_MODELVIEW);
    g_gl.glPushMatrix();
    g_gl.glLoadIdentity();
    g_gl.glMatrixMode(GL_TEXTURE_MATRIX_MODE);
    g_gl.glPushMatrix();
    g_gl.glLoadIdentity();
  }

  g_gl.glEnableClientState(GL_VERTEX_ARRAY);
  g_gl.glEnableClientState(GL_TEXTURE_COORD_ARRAY);
  g_gl.glDisableClientState(GL_COLOR_ARRAY);
  g_gl.glVertexPointer(2, GL_FLOAT, 0, pos);
  g_gl.glTexCoordPointer(2, GL_FLOAT, 0, uv);
  g_gl.glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

  /* Restore GLES1 matrices & full render state */
  if (saved_mats) {
    g_gl.glMatrixMode(GL_TEXTURE_MATRIX_MODE);
    g_gl.glLoadMatrixf(prev_texm);
    g_gl.glMatrixMode(GL_MODELVIEW);
    g_gl.glLoadMatrixf(prev_mv);
    g_gl.glMatrixMode(GL_PROJECTION);
    g_gl.glLoadMatrixf(prev_proj);
  } else {
    g_gl.glMatrixMode(GL_TEXTURE_MATRIX_MODE);
    g_gl.glPopMatrix();
    g_gl.glMatrixMode(GL_MODELVIEW);
    g_gl.glPopMatrix();
    g_gl.glMatrixMode(GL_PROJECTION);
    g_gl.glPopMatrix();
  }
  g_gl.glMatrixMode((GLenum)prev_mat_mode);

  if (prev_va) g_gl.glEnableClientState(GL_VERTEX_ARRAY);
  else g_gl.glDisableClientState(GL_VERTEX_ARRAY);
  if (prev_ta) g_gl.glEnableClientState(GL_TEXTURE_COORD_ARRAY);
  else g_gl.glDisableClientState(GL_TEXTURE_COORD_ARRAY);
  if (prev_ca) g_gl.glEnableClientState(GL_COLOR_ARRAY);
  else g_gl.glDisableClientState(GL_COLOR_ARRAY);

  if (g_gl.glBindBuffer && prev_vbo != 0) g_gl.glBindBuffer(GL_ARRAY_BUFFER, (GLuint)prev_vbo);
  g_gl.glPixelStorei(GL_UNPACK_ALIGNMENT, prev_unpack);
  if (g_gl.glTexEnvi) g_gl.glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, prev_tex_env);
  g_gl.glBindTexture(GL_TEXTURE_2D, (GLuint)prev_tex0);
  if (g_gl.glActiveTexture) g_gl.glActiveTexture((GLenum)prev_act_tex);
  if (g_gl.glClientActiveTexture) g_gl.glClientActiveTexture((GLenum)prev_cli_tex);
  g_gl.glViewport(prev_vp[0], prev_vp[1], prev_vp[2], prev_vp[3]);
  g_gl.glScissor(prev_sc[0], prev_sc[1], prev_sc[2], prev_sc[3]);
  g_gl.glBlendFunc((GLenum)prev_blend_src, (GLenum)prev_blend_dst);
  g_gl.glColorMask(prev_cmask[0], prev_cmask[1], prev_cmask[2], prev_cmask[3]);
  if (g_gl.glColor4f) g_gl.glColor4f(prev_color[0], prev_color[1], prev_color[2], prev_color[3]);
  if (prev_tex2d) g_gl.glEnable(GL_TEXTURE_2D); else g_gl.glDisable(GL_TEXTURE_2D);
  if (prev_blend) g_gl.glEnable(GL_BLEND); else g_gl.glDisable(GL_BLEND);
  if (prev_scissor) g_gl.glEnable(GL_SCISSOR_TEST); else g_gl.glDisable(GL_SCISSOR_TEST);
  if (prev_depth) g_gl.glEnable(GL_DEPTH_TEST); else g_gl.glDisable(GL_DEPTH_TEST);
  if (prev_cull) g_gl.glEnable(GL_CULL_FACE); else g_gl.glDisable(GL_CULL_FACE);
  if (prev_alpha) g_gl.glEnable(GL_ALPHA_TEST); else g_gl.glDisable(GL_ALPHA_TEST);
  if (prev_light) g_gl.glEnable(GL_LIGHTING); else g_gl.glDisable(GL_LIGHTING);
  if (prev_fog) g_gl.glEnable(GL_FOG); else g_gl.glDisable(GL_FOG);

  if (g_shm_writable) shm->last_draw_ms = kp_ov_now_ms();
  return true;
}

static bool kp_gles_draw_overlay(KpOverlayShared *shm, EGLDisplay dpy, int sw, int sh) {
  if (!kp_gl_ensure_loaded()) return false;
  EGLContext cur_ctx =
      g_gl.eglGetCurrentContext ? g_gl.eglGetCurrentContext() : (EGLContext)(uintptr_t)1;
  if (!cur_ctx) return false;
  if (!dpy && g_gl.eglGetCurrentDisplay) dpy = g_gl.eglGetCurrentDisplay();

  KpGlState *st = kp_gl_get_slot(dpy, cur_ctx);
  if (!st) return false;
  if (st->use_gles1) {
    return kp_gles1_draw_overlay(st, shm, sw, sh);
  }

  GLint prev_vp[4] = {0, 0, 0, 0};
  g_gl.glGetIntegerv(GL_VIEWPORT, prev_vp);
  if (sw <= 0 || sh <= 0) {
    sw = prev_vp[2];
    sh = prev_vp[3];
  }
  /* Ignore tiny offscreen/video-preview surfaces */
  if (sw < 320 || sh < 240) {
    return false;
  }

  GLint prev_prog = 0, prev_fbo = 0, prev_act_tex = 0, prev_tex0 = 0;
  GLint prev_vao = 0, prev_vbo = 0, prev_ebo = 0, prev_pbo = 0, prev_unpack = 4;
  GLint prev_sc[4] = {0, 0, 0, 0};
  GLint prev_src_rgb = 0, prev_dst_rgb = 0, prev_src_a = 0, prev_dst_a = 0;
  GLint prev_eq_rgb = 0, prev_eq_a = 0;
  GLboolean prev_cmask[4] = {1, 1, 1, 1};
  const bool is_gles3 = (st->client_ver >= 3);

  g_gl.glGetIntegerv(GL_CURRENT_PROGRAM, &prev_prog);
  g_gl.glGetIntegerv(GL_FRAMEBUFFER_BINDING, &prev_fbo);
  g_gl.glGetIntegerv(GL_ACTIVE_TEXTURE, &prev_act_tex);
  g_gl.glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &prev_vbo);
  g_gl.glGetIntegerv(GL_ELEMENT_ARRAY_BUFFER_BINDING, &prev_ebo);
  if (is_gles3) {
    g_gl.glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &prev_pbo);
  }
  g_gl.glGetIntegerv(GL_SCISSOR_BOX, prev_sc);
  g_gl.glGetIntegerv(GL_BLEND_SRC_RGB, &prev_src_rgb);
  g_gl.glGetIntegerv(GL_BLEND_DST_RGB, &prev_dst_rgb);
  g_gl.glGetIntegerv(GL_BLEND_SRC_ALPHA, &prev_src_a);
  g_gl.glGetIntegerv(GL_BLEND_DST_ALPHA, &prev_dst_a);
  g_gl.glGetIntegerv(GL_BLEND_EQUATION_RGB, &prev_eq_rgb);
  g_gl.glGetIntegerv(GL_BLEND_EQUATION_ALPHA, &prev_eq_a);
  g_gl.glGetIntegerv(GL_UNPACK_ALIGNMENT, &prev_unpack);
  g_gl.glGetBooleanv(GL_COLOR_WRITEMASK, prev_cmask);

  GLboolean prev_blend = g_gl.glIsEnabled(GL_BLEND);
  GLboolean prev_scissor = g_gl.glIsEnabled(GL_SCISSOR_TEST);
  GLboolean prev_depth = g_gl.glIsEnabled(GL_DEPTH_TEST);
  GLboolean prev_cull = g_gl.glIsEnabled(GL_CULL_FACE);
  GLboolean prev_stencil = g_gl.glIsEnabled(GL_STENCIL_TEST);

  if (is_gles3 && g_gl.glBindVertexArray) {
    g_gl.glGetIntegerv(GL_VERTEX_ARRAY_BINDING, &prev_vao);
    if (prev_vao != 0) g_gl.glBindVertexArray(0);
  }

  g_gl.glActiveTexture(GL_TEXTURE0);
  g_gl.glGetIntegerv(GL_TEXTURE_BINDING_2D, &prev_tex0);

  KpAttribBackup ab_pos, ab_uv;
  kp_save_attrib(st->a_pos, &ab_pos);
  kp_save_attrib(st->a_uv, &ab_uv);

  if (is_gles3 && prev_pbo != 0) g_gl.glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0);
  bool uploaded = kp_upload_overlay_tex(st, shm);
  if (is_gles3 && prev_pbo != 0) g_gl.glBindBuffer(GL_PIXEL_UNPACK_BUFFER, (GLuint)prev_pbo);

  if (uploaded) {
    int rx, ry, rw, rh;
    kp_compute_card_rect(sw, sh, &rx, &ry, &rw, &rh);
    /* Convert top-down screen rect to GL NDC (y=+1 is top, y=-1 is bottom) */
    float x0 = (2.0f * (float)rx / (float)sw) - 1.0f;
    float x1 = (2.0f * (float)(rx + rw) / (float)sw) - 1.0f;
    float y_top = 1.0f - (2.0f * (float)ry / (float)sh);
    float y_bot = 1.0f - (2.0f * (float)(ry + rh) / (float)sh);

    /* Row 0 of g_rgba_buf is top of card -> v=0.0 at y_top, v=1.0 at y_bot */
    const GLfloat verts[16] = {
        x0, y_top, 0.0f, 0.0f,
        x1, y_top, 1.0f, 0.0f,
        x0, y_bot, 0.0f, 1.0f,
        x1, y_bot, 1.0f, 1.0f,
    };

    g_gl.glBindFramebuffer(GL_FRAMEBUFFER, 0);
    g_gl.glViewport(0, 0, sw, sh);
    g_gl.glDisable(GL_SCISSOR_TEST);
    g_gl.glDisable(GL_DEPTH_TEST);
    g_gl.glDisable(GL_CULL_FACE);
    g_gl.glDisable(GL_STENCIL_TEST);
    g_gl.glEnable(GL_BLEND);
    g_gl.glBlendEquationSeparate(GL_FUNC_ADD, GL_FUNC_ADD);
    g_gl.glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA,
                             GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    g_gl.glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);

    g_gl.glUseProgram(st->prog);
    if (st->u_tex >= 0) g_gl.glUniform1i(st->u_tex, 0);

    g_gl.glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    g_gl.glBindBuffer(GL_ARRAY_BUFFER, st->vbo);
    g_gl.glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(verts), verts, GL_DYNAMIC_DRAW);

    g_gl.glEnableVertexAttribArray((GLuint)st->a_pos);
    g_gl.glEnableVertexAttribArray((GLuint)st->a_uv);
    g_gl.glVertexAttribPointer((GLuint)st->a_pos, 2, GL_FLOAT, GL_FALSE,
                               (GLsizei)(4 * sizeof(GLfloat)), (const void *)0);
    g_gl.glVertexAttribPointer((GLuint)st->a_uv, 2, GL_FLOAT, GL_FALSE,
                               (GLsizei)(4 * sizeof(GLfloat)),
                               (const void *)(2 * sizeof(GLfloat)));

    g_gl.glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  }

  /* Complete GLES2/3 state restore */
  kp_restore_attrib(st->a_pos, &ab_pos);
  kp_restore_attrib(st->a_uv, &ab_uv);
  g_gl.glBindBuffer(GL_ARRAY_BUFFER, (GLuint)prev_vbo);
  g_gl.glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, (GLuint)prev_ebo);
  g_gl.glPixelStorei(GL_UNPACK_ALIGNMENT, prev_unpack);
  g_gl.glBindTexture(GL_TEXTURE_2D, (GLuint)prev_tex0);
  g_gl.glActiveTexture((GLenum)prev_act_tex);
  g_gl.glUseProgram((GLuint)prev_prog);
  g_gl.glBindFramebuffer(GL_FRAMEBUFFER, (GLuint)prev_fbo);
  g_gl.glViewport(prev_vp[0], prev_vp[1], prev_vp[2], prev_vp[3]);
  g_gl.glScissor(prev_sc[0], prev_sc[1], prev_sc[2], prev_sc[3]);
  g_gl.glColorMask(prev_cmask[0], prev_cmask[1], prev_cmask[2], prev_cmask[3]);
  g_gl.glBlendEquationSeparate((GLenum)prev_eq_rgb, (GLenum)prev_eq_a);
  g_gl.glBlendFuncSeparate((GLenum)prev_src_rgb, (GLenum)prev_dst_rgb,
                           (GLenum)prev_src_a, (GLenum)prev_dst_a);
  if (prev_blend) g_gl.glEnable(GL_BLEND); else g_gl.glDisable(GL_BLEND);
  if (prev_scissor) g_gl.glEnable(GL_SCISSOR_TEST); else g_gl.glDisable(GL_SCISSOR_TEST);
  if (prev_depth) g_gl.glEnable(GL_DEPTH_TEST); else g_gl.glDisable(GL_DEPTH_TEST);
  if (prev_cull) g_gl.glEnable(GL_CULL_FACE); else g_gl.glDisable(GL_CULL_FACE);
  if (prev_stencil) g_gl.glEnable(GL_STENCIL_TEST); else g_gl.glDisable(GL_STENCIL_TEST);
  if (is_gles3 && g_gl.glBindVertexArray && prev_vao != 0) g_gl.glBindVertexArray((GLuint)prev_vao);

  if (uploaded && g_shm_writable) shm->last_draw_ms = kp_ov_now_ms();
  return uploaded;
}

static void kp_draw_on_egl_surface_locked(KpOverlayShared *shm, EGLDisplay dpy, EGLSurface surface) {
  int sw = 0, sh = 0;
  if (kp_gl_ensure_loaded() && g_gl.eglQuerySurface) {
    EGLint ew = 0, eh = 0;
    if (g_gl.eglQuerySurface(dpy, surface, EGL_WIDTH, &ew) &&
        g_gl.eglQuerySurface(dpy, surface, EGL_HEIGHT, &eh)) {
      sw = (int)ew;
      sh = (int)eh;
    }
  }
  (void)kp_gles_draw_overlay(shm, dpy, sw, sh);
}

/* ==================== HOOK 1: eglSwapBuffers (+ Damage KHR/EXT) ==================== */

EGLBoolean eglSwapBuffers(EGLDisplay dpy, EGLSurface surface) {
  static EGLBoolean (*real_fn)(EGLDisplay, EGLSurface) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "eglSwapBuffers");
    if (!real_fn) return 0;
  }

  if (!g_in_hook && !kp_should_skip_process()) {
    g_in_hook = 1;
    kp_lock();
    KpOverlayShared *shm = NULL;
    if (kp_overlay_active_locked(&shm)) {
      kp_draw_on_egl_surface_locked(shm, dpy, surface);
    }
    kp_unlock();
    EGLBoolean ret = real_fn(dpy, surface);
    g_in_hook = 0;
    return ret;
  }

  return real_fn(dpy, surface);
}

EGLBoolean eglSwapBuffersWithDamageKHR(EGLDisplay dpy, EGLSurface surface,
                                       const EGLint *rects, EGLint n_rects) {
  static EGLBoolean (*real_fn)(EGLDisplay, EGLSurface, const EGLint *, EGLint) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "eglSwapBuffersWithDamageKHR");
    if (!real_fn) return 0;
  }

  if (!g_in_hook && !kp_should_skip_process()) {
    g_in_hook = 1;
    bool drew = false;
    kp_lock();
    KpOverlayShared *shm = NULL;
    if (kp_overlay_active_locked(&shm)) {
      kp_draw_on_egl_surface_locked(shm, dpy, surface);
      drew = true;
    }
    kp_unlock();
    /* Pass full-surface swap when overlay is open so partial damage cannot clip the card */
    EGLBoolean ret = drew ? real_fn(dpy, surface, NULL, 0) : real_fn(dpy, surface, rects, n_rects);
    g_in_hook = 0;
    return ret;
  }

  return real_fn(dpy, surface, rects, n_rects);
}

EGLBoolean eglSwapBuffersWithDamageEXT(EGLDisplay dpy, EGLSurface surface,
                                       const EGLint *rects, EGLint n_rects) {
  static EGLBoolean (*real_fn)(EGLDisplay, EGLSurface, const EGLint *, EGLint) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "eglSwapBuffersWithDamageEXT");
    if (!real_fn) return 0;
  }

  if (!g_in_hook && !kp_should_skip_process()) {
    g_in_hook = 1;
    bool drew = false;
    kp_lock();
    KpOverlayShared *shm = NULL;
    if (kp_overlay_active_locked(&shm)) {
      kp_draw_on_egl_surface_locked(shm, dpy, surface);
      drew = true;
    }
    kp_unlock();
    EGLBoolean ret = drew ? real_fn(dpy, surface, NULL, 0) : real_fn(dpy, surface, rects, n_rects);
    g_in_hook = 0;
    return ret;
  }

  return real_fn(dpy, surface, rects, n_rects);
}

/* ==================== HOOK 2: SDL_GL_SwapWindow ==================== */

void SDL_GL_SwapWindow(void *window) {
  static void (*real_fn)(void *) = NULL;
  static void (*fn_drawable_size)(void *, int *, int *) = NULL;
  static void (*fn_window_size)(void *, int *, int *) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_GL_SwapWindow");
    *(void **)(&fn_drawable_size) = dlsym(RTLD_DEFAULT, "SDL_GL_GetDrawableSize");
    *(void **)(&fn_window_size) = dlsym(RTLD_DEFAULT, "SDL_GetWindowSize");
    if (!real_fn) return;
  }

  if (!g_in_hook && !kp_should_skip_process()) {
    g_in_hook = 1;
    kp_lock();
    KpOverlayShared *shm = NULL;
    if (kp_overlay_active_locked(&shm)) {
      int sw = 0, sh = 0;
      if (fn_drawable_size && window) fn_drawable_size(window, &sw, &sh);
      if ((sw <= 0 || sh <= 0) && fn_window_size && window) fn_window_size(window, &sw, &sh);
      (void)kp_gles_draw_overlay(shm, NULL, sw, sh);
    }
    kp_unlock();
    real_fn(window);
    g_in_hook = 0;
    return;
  }

  real_fn(window);
}

/* ==================== HOOK 3: SDL_RenderPresent ==================== */

static void *g_sdl_last_ren = NULL;
static void *g_sdl_tex = NULL;
static uint32_t g_sdl_tex_seq = 0xFFFFFFFFu;

void SDL_RenderPresent(void *renderer) {
  static void (*real_fn)(void *) = NULL;
  static int (*fn_out_size)(void *, int *, int *) = NULL;
  static void *(*fn_create_tex)(void *, uint32_t, int, int, int) = NULL;
  static int (*fn_set_blend)(void *, int) = NULL;
  static int (*fn_update_tex)(void *, const KpSdlRect *, const void *, int) = NULL;
  static int (*fn_copy)(void *, void *, const KpSdlRect *, const KpSdlRect *) = NULL;
  static void (*fn_get_vp)(void *, KpSdlRect *) = NULL;
  static int (*fn_set_vp)(void *, const KpSdlRect *) = NULL;
  static void (*fn_get_clip)(void *, KpSdlRect *) = NULL;
  static int (*fn_set_clip)(void *, const KpSdlRect *) = NULL;
  static int (*fn_is_clipped)(void *) = NULL;
  static void (*fn_get_scale)(void *, float *, float *) = NULL;
  static int (*fn_set_scale)(void *, float, float) = NULL;

  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_RenderPresent");
    *(void **)(&fn_out_size) = dlsym(RTLD_DEFAULT, "SDL_GetRendererOutputSize");
    *(void **)(&fn_create_tex) = dlsym(RTLD_DEFAULT, "SDL_CreateTexture");
    *(void **)(&fn_set_blend) = dlsym(RTLD_DEFAULT, "SDL_SetTextureBlendMode");
    *(void **)(&fn_update_tex) = dlsym(RTLD_DEFAULT, "SDL_UpdateTexture");
    *(void **)(&fn_copy) = dlsym(RTLD_DEFAULT, "SDL_RenderCopy");
    *(void **)(&fn_get_vp) = dlsym(RTLD_DEFAULT, "SDL_RenderGetViewport");
    *(void **)(&fn_set_vp) = dlsym(RTLD_DEFAULT, "SDL_RenderSetViewport");
    *(void **)(&fn_get_clip) = dlsym(RTLD_DEFAULT, "SDL_RenderGetClipRect");
    *(void **)(&fn_set_clip) = dlsym(RTLD_DEFAULT, "SDL_RenderSetClipRect");
    *(void **)(&fn_is_clipped) = dlsym(RTLD_DEFAULT, "SDL_RenderIsClipEnabled");
    *(void **)(&fn_get_scale) = dlsym(RTLD_DEFAULT, "SDL_RenderGetScale");
    *(void **)(&fn_set_scale) = dlsym(RTLD_DEFAULT, "SDL_RenderSetScale");
    if (!real_fn) return;
  }

  if (!g_in_hook && renderer && !kp_should_skip_process() &&
      fn_out_size && fn_create_tex && fn_update_tex && fn_copy) {
    g_in_hook = 1;
    kp_lock();
    KpOverlayShared *shm = NULL;
    if (kp_overlay_active_locked(&shm)) {
      int sw = 0, sh = 0;
      if (fn_out_size(renderer, &sw, &sh) == 0 && sw >= 240 && sh >= 180) {
        if (g_sdl_last_ren != renderer) {
          g_sdl_tex = NULL;
          g_sdl_last_ren = renderer;
          g_sdl_tex_seq = 0xFFFFFFFFu;
        }
        if (!g_sdl_tex) {
          g_sdl_tex = fn_create_tex(renderer, KP_SDL_PIXELFORMAT_ABGR8888,
                                    KP_SDL_TEXTUREACCESS_STREAMING,
                                    KP_OV_CARD_W, KP_OV_CARD_H);
          if (g_sdl_tex && fn_set_blend) {
            fn_set_blend(g_sdl_tex, KP_SDL_BLENDMODE_BLEND);
          }
        }
        if (g_sdl_tex) {
          bool dirty = kp_refresh_rgba_if_needed(shm);
          if (g_rgba_buf) {
            if (dirty || g_sdl_tex_seq != g_rendered_seq) {
              fn_update_tex(g_sdl_tex, NULL, g_rgba_buf, KP_OV_CARD_W * 4);
              g_sdl_tex_seq = g_rendered_seq;
            }
            KpSdlRect prev_vp = {0, 0, 0, 0};
            KpSdlRect prev_clip = {0, 0, 0, 0};
            int was_clipped = 0;
            float sx = 1.0f, sy = 1.0f;
            if (fn_get_vp) fn_get_vp(renderer, &prev_vp);
            if (fn_is_clipped) was_clipped = fn_is_clipped(renderer);
            if (was_clipped && fn_get_clip) fn_get_clip(renderer, &prev_clip);
            if (fn_get_scale) fn_get_scale(renderer, &sx, &sy);

            if (fn_set_vp) fn_set_vp(renderer, NULL);
            if (fn_set_clip) fn_set_clip(renderer, NULL);
            if (fn_set_scale) fn_set_scale(renderer, 1.0f, 1.0f);

            KpSdlRect dst;
            kp_compute_card_rect(sw, sh, &dst.x, &dst.y, &dst.w, &dst.h);
            fn_copy(renderer, g_sdl_tex, NULL, &dst);

            if (fn_set_scale) fn_set_scale(renderer, sx, sy);
            if (fn_set_vp && prev_vp.w > 0 && prev_vp.h > 0) fn_set_vp(renderer, &prev_vp);
            if (fn_set_clip) fn_set_clip(renderer, was_clipped ? &prev_clip : NULL);

            if (g_shm_writable) shm->last_draw_ms = kp_ov_now_ms();
          }
        }
      }
    }
    kp_unlock();
    real_fn(renderer);
    g_in_hook = 0;
    return;
  }

  real_fn(renderer);
}

/* ==================== HOOK 4: ZERO-CONFLICT SDL2 INPUT ISOLATION ==================== */

typedef struct {
  bool shm_ready;
  bool overlay_open;
  bool block_input;
  uint32_t seq;
} KpInputStatus;

static uint64_t g_held_joy_btns = 0;
static uint64_t g_held_ctrl_btns = 0;
static uint64_t g_held_keys[8];
static bool g_held_hat_nonzero = false;
static uint32_t g_wait_last_seq = 0xFFFFFFFFu;
static bool g_wait_last_open = false;

static KpInputStatus kp_query_input_status(void) {
  KpInputStatus st;
  memset(&st, 0, sizeof(st));
  if (kp_should_skip_process()) return st;

  int64_t now = kp_ov_now_ms();
  kp_lock();
  KpOverlayShared *shm = kp_get_shm_locked(now);
  if (kp_shm_valid(shm)) {
    st.shm_ready = true;
    st.overlay_open = (shm->overlay_open != 0);
    st.block_input = st.overlay_open || (now < shm->swallow_until_ms);
    st.seq = __atomic_load_n(&shm->seq, __ATOMIC_ACQUIRE);
    if (g_shm_writable && (now - g_last_input_hb_ms >= 250 || g_last_input_hb_ms == 0)) {
      g_last_input_hb_ms = now;
      shm->last_input_hook_ms = now;
    }
  }
  kp_unlock();
  return st;
}

static bool kp_held_key_test(uint32_t scancode) {
  if (scancode >= 512u) return false;
  return (g_held_keys[scancode >> 6] & (1ULL << (scancode & 63u))) != 0;
}

static void kp_held_key_set(uint32_t scancode, bool down) {
  if (scancode >= 512u) return;
  uint64_t mask = 1ULL << (scancode & 63u);
  if (down) g_held_keys[scancode >> 6] |= mask;
  else g_held_keys[scancode >> 6] &= ~mask;
}

/*
 * Returns true if the SDL event should be SWALLOWED (hidden from EmulationStation / game).
 * Preserves paired UP/center events ONLY for keys/buttons pressed BEFORE the overlay opened,
 * guaranteeing zero stuck keys AND zero leaked Mini-Player button presses.
 */
static bool kp_should_swallow_sdl_event(const void *ev_ptr, bool block_input) {
  if (!ev_ptr) return false;
  const uint8_t *raw = (const uint8_t *)ev_ptr;
  uint32_t type = 0;
  memcpy(&type, raw, sizeof(type));

  if (!block_input) {
    if (type == KP_SDL_KEYDOWN) {
      uint32_t sc = 0;
      memcpy(&sc, raw + 16, sizeof(sc));
      kp_held_key_set(sc, true);
    } else if (type == KP_SDL_KEYUP) {
      uint32_t sc = 0;
      memcpy(&sc, raw + 16, sizeof(sc));
      kp_held_key_set(sc, false);
    } else if (type == KP_SDL_JOYBUTTONDOWN) {
      uint8_t btn = raw[12];
      if (btn < 64u) g_held_joy_btns |= (1ULL << btn);
    } else if (type == KP_SDL_JOYBUTTONUP) {
      uint8_t btn = raw[12];
      if (btn < 64u) g_held_joy_btns &= ~(1ULL << btn);
    } else if (type == KP_SDL_CONTROLLERBUTTONDOWN) {
      uint8_t btn = raw[12];
      if (btn < 64u) g_held_ctrl_btns |= (1ULL << btn);
    } else if (type == KP_SDL_CONTROLLERBUTTONUP) {
      uint8_t btn = raw[12];
      if (btn < 64u) g_held_ctrl_btns &= ~(1ULL << btn);
    } else if (type == KP_SDL_JOYHATMOTION) {
      g_held_hat_nonzero = (raw[13] != 0);
    }
    return false;
  }

  switch (type) {
    case KP_SDL_KEYDOWN:
    case KP_SDL_TEXTEDITING:
    case KP_SDL_TEXTINPUT:
    case KP_SDL_JOYAXISMOTION:
    case KP_SDL_JOYBALLMOTION:
    case KP_SDL_JOYBUTTONDOWN:
    case KP_SDL_CONTROLLERAXISMOTION:
    case KP_SDL_CONTROLLERBUTTONDOWN:
      return true;
    case KP_SDL_KEYUP: {
      uint32_t sc = 0;
      memcpy(&sc, raw + 16, sizeof(sc));
      if (kp_held_key_test(sc)) {
        kp_held_key_set(sc, false);
        return false;
      }
      return true;
    }
    case KP_SDL_JOYBUTTONUP: {
      uint8_t btn = raw[12];
      if (btn < 64u && (g_held_joy_btns & (1ULL << btn))) {
        g_held_joy_btns &= ~(1ULL << btn);
        return false;
      }
      return true;
    }
    case KP_SDL_CONTROLLERBUTTONUP: {
      uint8_t btn = raw[12];
      if (btn < 64u && (g_held_ctrl_btns & (1ULL << btn))) {
        g_held_ctrl_btns &= ~(1ULL << btn);
        return false;
      }
      return true;
    }
    case KP_SDL_JOYHATMOTION: {
      if (raw[13] == 0 && g_held_hat_nonzero) {
        g_held_hat_nonzero = false;
        return false;
      }
      return true;
    }
    default:
      return false;
  }
}

int SDL_PollEvent(void *event) {
  static int (*real_fn)(void *) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_PollEvent");
    if (!real_fn) return 0;
  }
  if (g_in_event_hook || !event || kp_should_skip_process()) {
    return real_fn(event);
  }

  g_in_event_hook = 1;
  KpInputStatus st = kp_query_input_status();
  int res = 0;
  for (int tries = 0; tries < 64; tries++) {
    res = real_fn(event);
    if (res <= 0) break;
    if (!st.shm_ready) break;
    if (!kp_should_swallow_sdl_event(event, st.block_input)) break;
    res = 0;
  }
  g_in_event_hook = 0;
  return res;
}

int SDL_WaitEventTimeout(void *event, int timeout) {
  static int (*real_fn)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_WaitEventTimeout");
    if (!real_fn) return 0;
  }
  if (g_in_event_hook || !event || kp_should_skip_process()) {
    return real_fn(event, timeout);
  }

  g_in_event_hook = 1;
  KpInputStatus st = kp_query_input_status();
  if (!st.shm_ready) {
    int res = real_fn(event, timeout);
    g_in_event_hook = 0;
    return res;
  }

  int eff_timeout = timeout;
  if (st.overlay_open) {
    /* Keep EmulationStation's render loop alive while the Mini-Player is visible */
    if (eff_timeout < 0 || eff_timeout > 25) eff_timeout = 25;
  } else if (eff_timeout < 0 || eff_timeout > 80) {
    eff_timeout = 80;
  }

  int64_t deadline = (timeout >= 0) ? (kp_ov_now_ms() + timeout) : 0;
  int res = 0;
  for (;;) {
    res = real_fn(event, eff_timeout);
    st = kp_query_input_status();
    if (res > 0) {
      if (!kp_should_swallow_sdl_event(event, st.block_input)) break;
      res = 0;
    }
    if (st.overlay_open || st.overlay_open != g_wait_last_open || st.seq != g_wait_last_seq) {
      g_wait_last_open = st.overlay_open;
      g_wait_last_seq = st.seq;
      /* Return 0 (timeout) so the caller breaks out of wait and swaps a fresh frame */
      res = 0;
      break;
    }
    if (timeout >= 0) {
      int64_t rem = deadline - kp_ov_now_ms();
      if (rem <= 0) {
        res = 0;
        break;
      }
      eff_timeout = (rem > 80) ? 80 : (int)rem;
    } else {
      eff_timeout = 80;
    }
  }
  g_in_event_hook = 0;
  return res;
}

int SDL_WaitEvent(void *event) {
  static int (*real_fn)(void *) = NULL;
  static int (*real_wait_to)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_WaitEvent");
    *(void **)(&real_wait_to) = dlsym(RTLD_NEXT, "SDL_WaitEventTimeout");
    if (!real_fn) return 0;
  }
  if (g_in_event_hook || !event || !real_wait_to || kp_should_skip_process()) {
    return real_fn(event);
  }

  g_in_event_hook = 1;
  KpInputStatus st = kp_query_input_status();
  if (!st.shm_ready) {
    int res = real_fn(event);
    g_in_event_hook = 0;
    return res;
  }

  for (;;) {
    int slice = st.overlay_open ? 25 : 80;
    int res = real_wait_to(event, slice);
    st = kp_query_input_status();
    if (res > 0) {
      if (!kp_should_swallow_sdl_event(event, st.block_input)) {
        g_in_event_hook = 0;
        return res;
      }
    }
    if (st.overlay_open || st.overlay_open != g_wait_last_open ||
        (st.overlay_open && st.seq != g_wait_last_seq)) {
      g_wait_last_open = st.overlay_open;
      g_wait_last_seq = st.seq;
      /* Emit benign SDL_FIRSTEVENT (type=0) so PowerSaver EmulationStation repaints cleanly */
      memset(event, 0, KP_SDL_EVENT_SIZE);
      g_in_event_hook = 0;
      return 1;
    }
  }
}

int SDL_PeepEvents(void *events, int numevents, int action, uint32_t minType, uint32_t maxType) {
  static int (*real_fn)(void *, int, int, uint32_t, uint32_t) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_PeepEvents");
    if (!real_fn) return 0;
  }
  if (g_in_event_hook || action != KP_SDL_GETEVENT || !events || numevents <= 0 ||
      kp_should_skip_process()) {
    return real_fn(events, numevents, action, minType, maxType);
  }

  g_in_event_hook = 1;
  int got = real_fn(events, numevents, action, minType, maxType);
  if (got > 0) {
    KpInputStatus st = kp_query_input_status();
    if (st.shm_ready) {
      uint8_t *arr = (uint8_t *)events;
      int out = 0;
      for (int i = 0; i < got; i++) {
        uint8_t *ev = arr + (size_t)i * KP_SDL_EVENT_SIZE;
        if (!kp_should_swallow_sdl_event(ev, st.block_input)) {
          if (out != i) {
            memcpy(arr + (size_t)out * KP_SDL_EVENT_SIZE, ev, KP_SDL_EVENT_SIZE);
          }
          out++;
        }
      }
      got = out;
    }
  }
  g_in_event_hook = 0;
  return got;
}

uint8_t SDL_JoystickGetButton(void *joystick, int button) {
  static uint8_t (*real_fn)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_JoystickGetButton");
    if (!real_fn) return 0;
  }
  if (!g_in_event_hook && !kp_should_skip_process()) {
    KpInputStatus st = kp_query_input_status();
    if (st.block_input) return 0;
  }
  return real_fn(joystick, button);
}

uint8_t SDL_JoystickGetHat(void *joystick, int hat) {
  static uint8_t (*real_fn)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_JoystickGetHat");
    if (!real_fn) return 0;
  }
  if (!g_in_event_hook && !kp_should_skip_process()) {
    KpInputStatus st = kp_query_input_status();
    if (st.block_input) return 0;
  }
  return real_fn(joystick, hat);
}

int16_t SDL_JoystickGetAxis(void *joystick, int axis) {
  static int16_t (*real_fn)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_JoystickGetAxis");
    if (!real_fn) return 0;
  }
  if (!g_in_event_hook && !kp_should_skip_process()) {
    KpInputStatus st = kp_query_input_status();
    if (st.block_input) return 0;
  }
  return real_fn(joystick, axis);
}

uint8_t SDL_GameControllerGetButton(void *controller, int button) {
  static uint8_t (*real_fn)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_GameControllerGetButton");
    if (!real_fn) return 0;
  }
  if (!g_in_event_hook && !kp_should_skip_process()) {
    KpInputStatus st = kp_query_input_status();
    if (st.block_input) return 0;
  }
  return real_fn(controller, button);
}

int16_t SDL_GameControllerGetAxis(void *controller, int axis) {
  static int16_t (*real_fn)(void *, int) = NULL;
  if (!real_fn) {
    *(void **)(&real_fn) = dlsym(RTLD_NEXT, "SDL_GameControllerGetAxis");
    if (!real_fn) return 0;
  }
  if (!g_in_event_hook && !kp_should_skip_process()) {
    KpInputStatus st = kp_query_input_status();
    if (st.block_input) return 0;
  }
  return real_fn(controller, axis);
}
