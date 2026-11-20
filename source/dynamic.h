/* Generated dynamic imports: only public APIs; no development libraries needed
 * on target. */
static __typeof__(SDL_CreateRGBSurfaceWithFormat)
    *p_SDL_CreateRGBSurfaceWithFormat;
#define SDL_CreateRGBSurfaceWithFormat p_SDL_CreateRGBSurfaceWithFormat
static __typeof__(SDL_CreateRenderer) *p_SDL_CreateRenderer;
#define SDL_CreateRenderer p_SDL_CreateRenderer
static __typeof__(SDL_CreateTexture) *p_SDL_CreateTexture;
#define SDL_CreateTexture p_SDL_CreateTexture
static __typeof__(SDL_CreateWindow) *p_SDL_CreateWindow;
#define SDL_CreateWindow p_SDL_CreateWindow
static __typeof__(SDL_Delay) *p_SDL_Delay;
#define SDL_Delay p_SDL_Delay
static __typeof__(SDL_DestroyRenderer) *p_SDL_DestroyRenderer;
#define SDL_DestroyRenderer p_SDL_DestroyRenderer
static __typeof__(SDL_DestroyTexture) *p_SDL_DestroyTexture;
#define SDL_DestroyTexture p_SDL_DestroyTexture
static __typeof__(SDL_DestroyWindow) *p_SDL_DestroyWindow;
#define SDL_DestroyWindow p_SDL_DestroyWindow
static __typeof__(SDL_FreeSurface) *p_SDL_FreeSurface;
#define SDL_FreeSurface p_SDL_FreeSurface
static __typeof__(SDL_GetError) *p_SDL_GetError;
#define SDL_GetError p_SDL_GetError
static __typeof__(SDL_GetTicks) *p_SDL_GetTicks;
#define SDL_GetTicks p_SDL_GetTicks
static __typeof__(SDL_Init) *p_SDL_Init;
#define SDL_Init p_SDL_Init
static __typeof__(SDL_PollEvent) *p_SDL_PollEvent;
#define SDL_PollEvent p_SDL_PollEvent
static __typeof__(SDL_Quit) *p_SDL_Quit;
#define SDL_Quit p_SDL_Quit
static __typeof__(SDL_RenderClear) *p_SDL_RenderClear;
#define SDL_RenderClear p_SDL_RenderClear
static __typeof__(SDL_RenderCopy) *p_SDL_RenderCopy;
#define SDL_RenderCopy p_SDL_RenderCopy
static __typeof__(SDL_RenderDrawLine) *p_SDL_RenderDrawLine;
#define SDL_RenderDrawLine p_SDL_RenderDrawLine
static __typeof__(SDL_RenderFillRect) *p_SDL_RenderFillRect;
#define SDL_RenderFillRect p_SDL_RenderFillRect
static __typeof__(SDL_RenderPresent) *p_SDL_RenderPresent;
#define SDL_RenderPresent p_SDL_RenderPresent
static __typeof__(SDL_RenderReadPixels) *p_SDL_RenderReadPixels;
#define SDL_RenderReadPixels p_SDL_RenderReadPixels
static __typeof__(SDL_RenderSetLogicalSize) *p_SDL_RenderSetLogicalSize;
#define SDL_RenderSetLogicalSize p_SDL_RenderSetLogicalSize
static __typeof__(SDL_SetHint) *p_SDL_SetHint;
#define SDL_SetHint p_SDL_SetHint
static __typeof__(SDL_SetRenderDrawBlendMode) *p_SDL_SetRenderDrawBlendMode;
#define SDL_SetRenderDrawBlendMode p_SDL_SetRenderDrawBlendMode
static __typeof__(SDL_SetRenderDrawColor) *p_SDL_SetRenderDrawColor;
#define SDL_SetRenderDrawColor p_SDL_SetRenderDrawColor
static __typeof__(SDL_SetTextureAlphaMod) *p_SDL_SetTextureAlphaMod;
#define SDL_SetTextureAlphaMod p_SDL_SetTextureAlphaMod
static __typeof__(SDL_SetTextureBlendMode) *p_SDL_SetTextureBlendMode;
#define SDL_SetTextureBlendMode p_SDL_SetTextureBlendMode
static __typeof__(SDL_SetTextureColorMod) *p_SDL_SetTextureColorMod;
#define SDL_SetTextureColorMod p_SDL_SetTextureColorMod
static __typeof__(SDL_ShowCursor) *p_SDL_ShowCursor;
#define SDL_ShowCursor p_SDL_ShowCursor
static __typeof__(SDL_UpdateTexture) *p_SDL_UpdateTexture;
#define SDL_UpdateTexture p_SDL_UpdateTexture
static __typeof__(SDL_RWFromFile) *p_SDL_RWFromFile;
#define SDL_RWFromFile p_SDL_RWFromFile
static __typeof__(SDL_SaveBMP_RW) *p_SDL_SaveBMP_RW;
#define SDL_SaveBMP_RW p_SDL_SaveBMP_RW
static __typeof__(libvlc_errmsg) *p_libvlc_errmsg;
#define libvlc_errmsg p_libvlc_errmsg
static __typeof__(libvlc_new) *p_libvlc_new;
#define libvlc_new p_libvlc_new
static __typeof__(libvlc_release) *p_libvlc_release;
#define libvlc_release p_libvlc_release
static __typeof__(libvlc_media_player_get_media)
    *p_libvlc_media_player_get_media;
#define libvlc_media_player_get_media p_libvlc_media_player_get_media
static __typeof__(libvlc_media_get_meta) *p_libvlc_media_get_meta;
#define libvlc_media_get_meta p_libvlc_media_get_meta
static __typeof__(libvlc_media_tracks_get) *p_libvlc_media_tracks_get;
#define libvlc_media_tracks_get p_libvlc_media_tracks_get
static __typeof__(libvlc_media_tracks_release) *p_libvlc_media_tracks_release;
#define libvlc_media_tracks_release p_libvlc_media_tracks_release
static __typeof__(libvlc_free) *p_libvlc_free;
#define libvlc_free p_libvlc_free
static int load_sdl(void) {
  const char *override = getenv("KPLAYER_SDL_LIBRARY");
  void *handle =
      dlopen(override ? override : "libSDL2-2.0.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!handle) {
    fprintf(stderr, "Biblioteca libSDL2-2.0.so.0: %s\n", dlerror());
    return 0;
  }
  *(void **)(&p_SDL_CreateRGBSurfaceWithFormat) =
      dlsym(handle, "SDL_CreateRGBSurfaceWithFormat");
  if (!p_SDL_CreateRGBSurfaceWithFormat) {
    fprintf(stderr, "Símbolo ausente: SDL_CreateRGBSurfaceWithFormat\n");
    return 0;
  }
  *(void **)(&p_SDL_CreateRenderer) = dlsym(handle, "SDL_CreateRenderer");
  if (!p_SDL_CreateRenderer) {
    fprintf(stderr, "Símbolo ausente: SDL_CreateRenderer\n");
    return 0;
  }
  *(void **)(&p_SDL_CreateTexture) = dlsym(handle, "SDL_CreateTexture");
  if (!p_SDL_CreateTexture) {
    fprintf(stderr, "Símbolo ausente: SDL_CreateTexture\n");
    return 0;
  }
  *(void **)(&p_SDL_CreateWindow) = dlsym(handle, "SDL_CreateWindow");
  if (!p_SDL_CreateWindow) {
    fprintf(stderr, "Símbolo ausente: SDL_CreateWindow\n");
    return 0;
  }
  *(void **)(&p_SDL_Delay) = dlsym(handle, "SDL_Delay");
  if (!p_SDL_Delay) {
    fprintf(stderr, "Símbolo ausente: SDL_Delay\n");
    return 0;
  }
  *(void **)(&p_SDL_DestroyRenderer) = dlsym(handle, "SDL_DestroyRenderer");
  if (!p_SDL_DestroyRenderer) {
    fprintf(stderr, "Símbolo ausente: SDL_DestroyRenderer\n");
    return 0;
  }
  *(void **)(&p_SDL_DestroyTexture) = dlsym(handle, "SDL_DestroyTexture");
  if (!p_SDL_DestroyTexture) {
    fprintf(stderr, "Símbolo ausente: SDL_DestroyTexture\n");
    return 0;
  }
  *(void **)(&p_SDL_DestroyWindow) = dlsym(handle, "SDL_DestroyWindow");
  if (!p_SDL_DestroyWindow) {
    fprintf(stderr, "Símbolo ausente: SDL_DestroyWindow\n");
    return 0;
  }
  *(void **)(&p_SDL_FreeSurface) = dlsym(handle, "SDL_FreeSurface");
  if (!p_SDL_FreeSurface) {
    fprintf(stderr, "Símbolo ausente: SDL_FreeSurface\n");
    return 0;
  }
  *(void **)(&p_SDL_GetError) = dlsym(handle, "SDL_GetError");
  if (!p_SDL_GetError) {
    fprintf(stderr, "Símbolo ausente: SDL_GetError\n");
    return 0;
  }
  *(void **)(&p_SDL_GetTicks) = dlsym(handle, "SDL_GetTicks");
  if (!p_SDL_GetTicks) {
    fprintf(stderr, "Símbolo ausente: SDL_GetTicks\n");
    return 0;
  }
  *(void **)(&p_SDL_Init) = dlsym(handle, "SDL_Init");
  if (!p_SDL_Init) {
    fprintf(stderr, "Símbolo ausente: SDL_Init\n");
    return 0;
  }
  *(void **)(&p_SDL_PollEvent) = dlsym(handle, "SDL_PollEvent");
  if (!p_SDL_PollEvent) {
    fprintf(stderr, "Símbolo ausente: SDL_PollEvent\n");
    return 0;
  }
  *(void **)(&p_SDL_Quit) = dlsym(handle, "SDL_Quit");
  if (!p_SDL_Quit) {
    fprintf(stderr, "Símbolo ausente: SDL_Quit\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderClear) = dlsym(handle, "SDL_RenderClear");
  if (!p_SDL_RenderClear) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderClear\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderCopy) = dlsym(handle, "SDL_RenderCopy");
  if (!p_SDL_RenderCopy) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderCopy\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderDrawLine) = dlsym(handle, "SDL_RenderDrawLine");
  if (!p_SDL_RenderDrawLine) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderDrawLine\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderFillRect) = dlsym(handle, "SDL_RenderFillRect");
  if (!p_SDL_RenderFillRect) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderFillRect\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderPresent) = dlsym(handle, "SDL_RenderPresent");
  if (!p_SDL_RenderPresent) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderPresent\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderReadPixels) = dlsym(handle, "SDL_RenderReadPixels");
  if (!p_SDL_RenderReadPixels) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderReadPixels\n");
    return 0;
  }
  *(void **)(&p_SDL_RenderSetLogicalSize) =
      dlsym(handle, "SDL_RenderSetLogicalSize");
  if (!p_SDL_RenderSetLogicalSize) {
    fprintf(stderr, "Símbolo ausente: SDL_RenderSetLogicalSize\n");
    return 0;
  }
  *(void **)(&p_SDL_SetHint) = dlsym(handle, "SDL_SetHint");
  if (!p_SDL_SetHint) {
    fprintf(stderr, "Símbolo ausente: SDL_SetHint\n");
    return 0;
  }
  *(void **)(&p_SDL_SetRenderDrawBlendMode) =
      dlsym(handle, "SDL_SetRenderDrawBlendMode");
  if (!p_SDL_SetRenderDrawBlendMode) {
    fprintf(stderr, "Símbolo ausente: SDL_SetRenderDrawBlendMode\n");
    return 0;
  }
  *(void **)(&p_SDL_SetRenderDrawColor) =
      dlsym(handle, "SDL_SetRenderDrawColor");
  if (!p_SDL_SetRenderDrawColor) {
    fprintf(stderr, "Símbolo ausente: SDL_SetRenderDrawColor\n");
    return 0;
  }
  *(void **)(&p_SDL_SetTextureAlphaMod) =
      dlsym(handle, "SDL_SetTextureAlphaMod");
  if (!p_SDL_SetTextureAlphaMod) {
    fprintf(stderr, "Símbolo ausente: SDL_SetTextureAlphaMod\n");
    return 0;
  }
  *(void **)(&p_SDL_SetTextureBlendMode) =
      dlsym(handle, "SDL_SetTextureBlendMode");
  if (!p_SDL_SetTextureBlendMode) {
    fprintf(stderr, "Símbolo ausente: SDL_SetTextureBlendMode\n");
    return 0;
  }
  *(void **)(&p_SDL_SetTextureColorMod) =
      dlsym(handle, "SDL_SetTextureColorMod");
  if (!p_SDL_SetTextureColorMod) {
    fprintf(stderr, "Símbolo ausente: SDL_SetTextureColorMod\n");
    return 0;
  }
  *(void **)(&p_SDL_ShowCursor) = dlsym(handle, "SDL_ShowCursor");
  if (!p_SDL_ShowCursor) {
    fprintf(stderr, "Símbolo ausente: SDL_ShowCursor\n");
    return 0;
  }
  *(void **)(&p_SDL_UpdateTexture) = dlsym(handle, "SDL_UpdateTexture");
  if (!p_SDL_UpdateTexture) {
    fprintf(stderr, "Símbolo ausente: SDL_UpdateTexture\n");
    return 0;
  }
  *(void **)(&p_SDL_RWFromFile) = dlsym(handle, "SDL_RWFromFile");
  if (!p_SDL_RWFromFile) {
    fprintf(stderr, "Símbolo ausente: SDL_RWFromFile\n");
    return 0;
  }
  *(void **)(&p_SDL_SaveBMP_RW) = dlsym(handle, "SDL_SaveBMP_RW");
  if (!p_SDL_SaveBMP_RW) {
    fprintf(stderr, "Símbolo ausente: SDL_SaveBMP_RW\n");
    return 0;
  }
  return 1;
}
static __typeof__(libvlc_audio_get_track) *p_libvlc_audio_get_track;
#define libvlc_audio_get_track p_libvlc_audio_get_track
static __typeof__(libvlc_audio_get_track_description)
    *p_libvlc_audio_get_track_description;
#define libvlc_audio_get_track_description p_libvlc_audio_get_track_description
static __typeof__(libvlc_audio_set_track) *p_libvlc_audio_set_track;
#define libvlc_audio_set_track p_libvlc_audio_set_track
static __typeof__(libvlc_get_version) *p_libvlc_get_version;
#define libvlc_get_version p_libvlc_get_version
static __typeof__(libvlc_media_new_path) *p_libvlc_media_new_path;
#define libvlc_media_new_path p_libvlc_media_new_path
static __typeof__(libvlc_media_new_location) *p_libvlc_media_new_location;
#define libvlc_media_new_location p_libvlc_media_new_location
static __typeof__(libvlc_media_player_get_length)
    *p_libvlc_media_player_get_length;
#define libvlc_media_player_get_length p_libvlc_media_player_get_length
static __typeof__(libvlc_media_player_get_state)
    *p_libvlc_media_player_get_state;
#define libvlc_media_player_get_state p_libvlc_media_player_get_state
static __typeof__(libvlc_media_player_get_time) *p_libvlc_media_player_get_time;
#define libvlc_media_player_get_time p_libvlc_media_player_get_time
static __typeof__(libvlc_media_player_is_seekable)
    *p_libvlc_media_player_is_seekable;
#define libvlc_media_player_is_seekable p_libvlc_media_player_is_seekable
static __typeof__(libvlc_media_player_new) *p_libvlc_media_player_new;
#define libvlc_media_player_new p_libvlc_media_player_new
static __typeof__(libvlc_media_player_play) *p_libvlc_media_player_play;
#define libvlc_media_player_play p_libvlc_media_player_play
static __typeof__(libvlc_media_player_release) *p_libvlc_media_player_release;
#define libvlc_media_player_release p_libvlc_media_player_release
static __typeof__(libvlc_media_player_set_media)
    *p_libvlc_media_player_set_media;
#define libvlc_media_player_set_media p_libvlc_media_player_set_media
static __typeof__(libvlc_media_player_set_pause)
    *p_libvlc_media_player_set_pause;
#define libvlc_media_player_set_pause p_libvlc_media_player_set_pause
static __typeof__(libvlc_media_player_set_rate) *p_libvlc_media_player_set_rate;
#define libvlc_media_player_set_rate p_libvlc_media_player_set_rate
static __typeof__(libvlc_media_player_set_time) *p_libvlc_media_player_set_time;
#define libvlc_media_player_set_time p_libvlc_media_player_set_time
static __typeof__(libvlc_media_player_stop) *p_libvlc_media_player_stop;
#define libvlc_media_player_stop p_libvlc_media_player_stop
static __typeof__(libvlc_media_release) *p_libvlc_media_release;
#define libvlc_media_release p_libvlc_media_release
static __typeof__(libvlc_set_user_agent) *p_libvlc_set_user_agent;
#define libvlc_set_user_agent p_libvlc_set_user_agent
static __typeof__(libvlc_track_description_list_release)
    *p_libvlc_track_description_list_release;
#define libvlc_track_description_list_release                                  \
  p_libvlc_track_description_list_release
static __typeof__(libvlc_video_get_spu) *p_libvlc_video_get_spu;
#define libvlc_video_get_spu p_libvlc_video_get_spu
static __typeof__(libvlc_video_get_spu_description)
    *p_libvlc_video_get_spu_description;
#define libvlc_video_get_spu_description p_libvlc_video_get_spu_description
static __typeof__(libvlc_video_set_callbacks) *p_libvlc_video_set_callbacks;
#define libvlc_video_set_callbacks p_libvlc_video_set_callbacks
static __typeof__(libvlc_video_set_format_callbacks)
    *p_libvlc_video_set_format_callbacks;
#define libvlc_video_set_format_callbacks p_libvlc_video_set_format_callbacks
static __typeof__(libvlc_video_set_spu) *p_libvlc_video_set_spu;
#define libvlc_video_set_spu p_libvlc_video_set_spu
static int load_vlc(void) {
  void *handle = dlopen("libvlc.so.5", RTLD_NOW | RTLD_GLOBAL);
  if (!handle) {
    fprintf(stderr, "Biblioteca libvlc.so.5: %s\n", dlerror());
    return 0;
  }
  *(void **)(&p_libvlc_media_player_get_media) =
      dlsym(handle, "libvlc_media_player_get_media");
  if (!p_libvlc_media_player_get_media)
    return 0;
  *(void **)(&p_libvlc_media_get_meta) = dlsym(handle, "libvlc_media_get_meta");
  if (!p_libvlc_media_get_meta)
    return 0;
  *(void **)(&p_libvlc_media_tracks_get) =
      dlsym(handle, "libvlc_media_tracks_get");
  if (!p_libvlc_media_tracks_get)
    return 0;
  *(void **)(&p_libvlc_media_tracks_release) =
      dlsym(handle, "libvlc_media_tracks_release");
  if (!p_libvlc_media_tracks_release)
    return 0;
  *(void **)(&p_libvlc_free) = dlsym(handle, "libvlc_free");
  if (!p_libvlc_free)
    return 0;
  *(void **)(&p_libvlc_audio_get_track) =
      dlsym(handle, "libvlc_audio_get_track");
  if (!p_libvlc_audio_get_track) {
    fprintf(stderr, "Símbolo ausente: libvlc_audio_get_track\n");
    return 0;
  }
  *(void **)(&p_libvlc_audio_get_track_description) =
      dlsym(handle, "libvlc_audio_get_track_description");
  if (!p_libvlc_audio_get_track_description) {
    fprintf(stderr, "Símbolo ausente: libvlc_audio_get_track_description\n");
    return 0;
  }
  *(void **)(&p_libvlc_audio_set_track) =
      dlsym(handle, "libvlc_audio_set_track");
  if (!p_libvlc_audio_set_track) {
    fprintf(stderr, "Símbolo ausente: libvlc_audio_set_track\n");
    return 0;
  }
  *(void **)(&p_libvlc_errmsg) = dlsym(handle, "libvlc_errmsg");
  if (!p_libvlc_errmsg) {
    fprintf(stderr, "Símbolo ausente: libvlc_errmsg\n");
    return 0;
  }
  *(void **)(&p_libvlc_get_version) = dlsym(handle, "libvlc_get_version");
  if (!p_libvlc_get_version) {
    fprintf(stderr, "Símbolo ausente: libvlc_get_version\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_new_path) = dlsym(handle, "libvlc_media_new_path");
  if (!p_libvlc_media_new_path) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_new_path\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_new_location) =
      dlsym(handle, "libvlc_media_new_location");
  if (!p_libvlc_media_new_location) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_new_location\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_get_length) =
      dlsym(handle, "libvlc_media_player_get_length");
  if (!p_libvlc_media_player_get_length) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_get_length\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_get_state) =
      dlsym(handle, "libvlc_media_player_get_state");
  if (!p_libvlc_media_player_get_state) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_get_state\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_get_time) =
      dlsym(handle, "libvlc_media_player_get_time");
  if (!p_libvlc_media_player_get_time) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_get_time\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_is_seekable) =
      dlsym(handle, "libvlc_media_player_is_seekable");
  if (!p_libvlc_media_player_is_seekable) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_is_seekable\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_new) =
      dlsym(handle, "libvlc_media_player_new");
  if (!p_libvlc_media_player_new) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_new\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_play) =
      dlsym(handle, "libvlc_media_player_play");
  if (!p_libvlc_media_player_play) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_play\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_release) =
      dlsym(handle, "libvlc_media_player_release");
  if (!p_libvlc_media_player_release) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_release\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_set_media) =
      dlsym(handle, "libvlc_media_player_set_media");
  if (!p_libvlc_media_player_set_media) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_set_media\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_set_pause) =
      dlsym(handle, "libvlc_media_player_set_pause");
  if (!p_libvlc_media_player_set_pause) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_set_pause\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_set_rate) =
      dlsym(handle, "libvlc_media_player_set_rate");
  if (!p_libvlc_media_player_set_rate) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_set_rate\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_set_time) =
      dlsym(handle, "libvlc_media_player_set_time");
  if (!p_libvlc_media_player_set_time) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_set_time\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_player_stop) =
      dlsym(handle, "libvlc_media_player_stop");
  if (!p_libvlc_media_player_stop) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_player_stop\n");
    return 0;
  }
  *(void **)(&p_libvlc_media_release) = dlsym(handle, "libvlc_media_release");
  if (!p_libvlc_media_release) {
    fprintf(stderr, "Símbolo ausente: libvlc_media_release\n");
    return 0;
  }
  *(void **)(&p_libvlc_new) = dlsym(handle, "libvlc_new");
  if (!p_libvlc_new) {
    fprintf(stderr, "Símbolo ausente: libvlc_new\n");
    return 0;
  }
  *(void **)(&p_libvlc_release) = dlsym(handle, "libvlc_release");
  if (!p_libvlc_release) {
    fprintf(stderr, "Símbolo ausente: libvlc_release\n");
    return 0;
  }
  *(void **)(&p_libvlc_set_user_agent) = dlsym(handle, "libvlc_set_user_agent");
  if (!p_libvlc_set_user_agent) {
    fprintf(stderr, "Símbolo ausente: libvlc_set_user_agent\n");
    return 0;
  }
  *(void **)(&p_libvlc_track_description_list_release) =
      dlsym(handle, "libvlc_track_description_list_release");
  if (!p_libvlc_track_description_list_release) {
    fprintf(stderr, "Símbolo ausente: libvlc_track_description_list_release\n");
    return 0;
  }
  *(void **)(&p_libvlc_video_get_spu) = dlsym(handle, "libvlc_video_get_spu");
  if (!p_libvlc_video_get_spu) {
    fprintf(stderr, "Símbolo ausente: libvlc_video_get_spu\n");
    return 0;
  }
  *(void **)(&p_libvlc_video_get_spu_description) =
      dlsym(handle, "libvlc_video_get_spu_description");
  if (!p_libvlc_video_get_spu_description) {
    fprintf(stderr, "Símbolo ausente: libvlc_video_get_spu_description\n");
    return 0;
  }
  *(void **)(&p_libvlc_video_set_callbacks) =
      dlsym(handle, "libvlc_video_set_callbacks");
  if (!p_libvlc_video_set_callbacks) {
    fprintf(stderr, "Símbolo ausente: libvlc_video_set_callbacks\n");
    return 0;
  }
  *(void **)(&p_libvlc_video_set_format_callbacks) =
      dlsym(handle, "libvlc_video_set_format_callbacks");
  if (!p_libvlc_video_set_format_callbacks) {
    fprintf(stderr, "Símbolo ausente: libvlc_video_set_format_callbacks\n");
    return 0;
  }
  *(void **)(&p_libvlc_video_set_spu) = dlsym(handle, "libvlc_video_set_spu");
  if (!p_libvlc_video_set_spu) {
    fprintf(stderr, "Símbolo ausente: libvlc_video_set_spu\n");
    return 0;
  }
  return 1;
}
