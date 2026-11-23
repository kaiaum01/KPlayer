/* Procedural tactile UI click sound effects for KPlayer R36S (v2.1.1).
 * Synthesizes lightweight 16-bit mono PCM waveforms in memory — zero external
 * audio files.
 *
 * CRITICAL R36S/ALSA FIX (v2.1.1):
 * On R36S (dArkOS/ArkOS), libVLC outputs directly to ALSA (--aout=alsa).
 * Keeping an SDL2 audio device permanently open locks the hardware ALSA PCM
 * device and prevents libVLC from playing music, videos, radio, or IPTV.
 * Therefore we:
 *  1) Never open or play UI clicks while libVLC media is active or starting.
 *  2) Release (SDL_CloseAudioDevice) immediately before any libVLC playback.
 *  3) Auto-close the SDL2 audio device ~220ms after the click finishes playing.
 */
enum {
  SFX_MOVE = 0,
  SFX_CONFIRM = 1,
  SFX_BACK = 2,
  SFX_TAB = 3,
  SFX_ERROR = 4,
  SFX_COUNT = 5
};

#define SFX_SAMPLE_RATE 22050
#define SFX_MAX_SAMPLES 1400

static bool ui_sfx_enabled = true;
static bool sfx_boot_ready = false;
static SDL_AudioDeviceID sfx_device = 0;
static bool sfx_subsys_tried = false;
static bool sfx_subsys_ok = false;
static bool sfx_buffers_ready = false;
static int16_t sfx_pcm[SFX_COUNT][SFX_MAX_SAMPLES];
static int sfx_samples[SFX_COUNT];
static uint32_t sfx_last_play_tick = 0;

static void sfx_set_boot_ready(bool ready) {
  sfx_boot_ready = ready;
}

static void sfx_synth_tone(int id, float f0, float f1, float dur_ms,
                           float amp, bool double_pulse) {
  int n = (int)((dur_ms * (float)SFX_SAMPLE_RATE) / 1000.0f);
  if (n < 32) n = 32;
  if (n > SFX_MAX_SAMPLES) n = SFX_MAX_SAMPLES;
  sfx_samples[id] = n;

  double phase = 0.0;
  for (int i = 0; i < n; i++) {
    float u = (float)i / (float)n;
    float freq = f0 + (f1 - f0) * u;
    phase += (2.0 * M_PI * (double)freq) / (double)SFX_SAMPLE_RATE;

    /* Smooth attack (first 8%) + exponential decay for crisp console click */
    float attack = u < 0.08f ? (u / 0.08f) : 1.0f;
    float decay = expf(-u * 6.2f);
    float env = attack * decay;
    if (double_pulse) {
      float gate = (u < 0.42f || u > 0.56f) ? 1.0f : 0.12f;
      env *= gate;
    }

    /* Warm fundamental + subtle 2nd harmonic + gentle transient snap */
    float wave = (float)(sin(phase) * 0.78 + sin(phase * 2.0) * 0.22);
    if (u < 0.12f) {
      float snap = (1.0f - u / 0.12f) * (float)sin(phase * 3.1);
      wave += snap * 0.25f;
    }

    float sample = wave * env * amp * 32767.0f;
    if (sample > 32000.0f) sample = 32000.0f;
    if (sample < -32000.0f) sample = -32000.0f;
    sfx_pcm[id][i] = (int16_t)sample;
  }
}

static void sfx_build_buffers(void) {
  if (sfx_buffers_ready) return;
  sfx_buffers_ready = true;
  /* Crisp soft handheld D-Pad tick */
  sfx_synth_tone(SFX_MOVE, 960.0f, 520.0f, 18.0f, 0.22f, false);
  /* Warm ascending confirm pop (B button) */
  sfx_synth_tone(SFX_CONFIRM, 640.0f, 1080.0f, 40.0f, 0.28f, false);
  /* Soft descending back thud (A button) */
  sfx_synth_tone(SFX_BACK, 520.0f, 290.0f, 34.0f, 0.24f, false);
  /* Airy shoulder/tab switch blip (L1/R1/X/Y/SELECT) */
  sfx_synth_tone(SFX_TAB, 820.0f, 1220.0f, 28.0f, 0.22f, false);
  /* Subtle low double tick (blocked/error) */
  sfx_synth_tone(SFX_ERROR, 250.0f, 190.0f, 58.0f, 0.24f, true);
}

/* Immediately closes the SDL2 audio device so ALSA is 100% free for libVLC. */
static void sfx_release_device(void) {
  if (sfx_device) {
    if (SDL_PauseAudioDevice) SDL_PauseAudioDevice(sfx_device, 1);
    if (SDL_ClearQueuedAudio) SDL_ClearQueuedAudio(sfx_device);
    if (SDL_CloseAudioDevice) SDL_CloseAudioDevice(sfx_device);
    sfx_device = 0;
    /* Let ALSA PCM handle finish kernel teardown before libVLC opens ALSA. */
    if (!preview_mode && p_SDL_Delay) SDL_Delay(20);
  }
}

static void sfx_ensure_open(void) {
  if (sfx_device != 0 || preview_mode || !sfx_boot_ready) return;
  const char *drv = getenv("SDL_AUDIODRIVER");
  if (drv && !strcmp(drv, "dummy")) return;
  if (!SDL_InitSubSystem || !SDL_OpenAudioDevice || !SDL_QueueAudio ||
      !SDL_PauseAudioDevice || !SDL_CloseAudioDevice)
    return;
  if (!sfx_subsys_tried) {
    sfx_subsys_tried = true;
    sfx_subsys_ok = (SDL_InitSubSystem(SDL_INIT_AUDIO) >= 0);
  }
  if (!sfx_subsys_ok) return;

  sfx_build_buffers();

  SDL_AudioSpec want, have;
  memset(&want, 0, sizeof(want));
  want.freq = SFX_SAMPLE_RATE;
  want.format = AUDIO_S16SYS;
  want.channels = 1;
  want.samples = 512;

  sfx_device = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);
  if (sfx_device == 0) return;
  SDL_PauseAudioDevice(sfx_device, 0);
}

/* Called each frame in the main loop to auto-release ALSA once clicks finish. */
static void sfx_poll(uint32_t now, bool media_busy) {
  if (!sfx_device) return;
  if (media_busy || !ui_sfx_enabled || !sfx_boot_ready) {
    sfx_release_device();
    return;
  }
  uint32_t elapsed = now - sfx_last_play_tick;
  Uint32 queued = SDL_GetQueuedAudioSize ? SDL_GetQueuedAudioSize(sfx_device) : 0u;
  if ((queued == 0u && elapsed >= 160u) || elapsed >= 320u) {
    sfx_release_device();
  }
}

static void sfx_play(int id) {
  if (!sfx_boot_ready || !ui_sfx_enabled || preview_mode || active ||
      playing_radio || playing_iptv || playing_news_video)
    return;
  if (id < 0 || id >= SFX_COUNT) return;
  /* Never contend with libVLC audio while media or a stream is opening/buffering/playing */
  if (player && p_libvlc_media_player_get_state) {
    libvlc_state_t st = libvlc_media_player_get_state(player);
    if (st == libvlc_Opening || st == libvlc_Buffering || st == libvlc_Playing) {
      sfx_release_device();
      return;
    }
  }

  uint32_t now = SDL_GetTicks();
  if (id == SFX_MOVE && now - sfx_last_play_tick < 24u) return;

  sfx_ensure_open();
  if (sfx_device == 0) return;

  sfx_last_play_tick = now;
  if (SDL_GetQueuedAudioSize && SDL_ClearQueuedAudio) {
    if (SDL_GetQueuedAudioSize(sfx_device) > 4096u)
      SDL_ClearQueuedAudio(sfx_device);
  }
  SDL_QueueAudio(sfx_device, sfx_pcm[id],
                 (Uint32)(sfx_samples[id] * (int)sizeof(int16_t)));
}

static void sfx_play_for_key(SDL_Keycode k) {
  if (k == SDLK_UP || k == SDLK_DOWN || k == SDLK_LEFT || k == SDLK_RIGHT)
    sfx_play(SFX_MOVE);
  else if (k == SDLK_RETURN || k == SDLK_TAB)
    sfx_play(SFX_CONFIRM);
  else if (k == SDLK_BACKSPACE)
    sfx_play(SFX_BACK);
  else if (k == SDLK_q || k == SDLK_e || k == SDLK_F1 || k == SDLK_SPACE ||
           k == SDLK_m || k == SDLK_PAGEUP || k == SDLK_PAGEDOWN)
    sfx_play(SFX_TAB);
}

static void sfx_quit(void) {
  sfx_boot_ready = false;
  sfx_release_device();
}
