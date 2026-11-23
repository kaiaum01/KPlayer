/* Procedural tactile UI click sound effects for KPlayer R36S (v2.1.0).
 * Synthesizes lightweight 16-bit mono PCM waveforms in memory — zero external
 * audio files, lazy non-fatal SDL2 audio initialization, completely safe when
 * ALSA is busy or running under SDL_AUDIODRIVER=dummy.
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
static SDL_AudioDeviceID sfx_device = 0;
static bool sfx_init_tried = false;
static bool sfx_buffers_ready = false;
static int16_t sfx_pcm[SFX_COUNT][SFX_MAX_SAMPLES];
static int sfx_samples[SFX_COUNT];
static uint32_t sfx_last_play_tick = 0;

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

static void sfx_ensure_init(void) {
  if (sfx_init_tried || preview_mode) return;
  sfx_init_tried = true;
  const char *drv = getenv("SDL_AUDIODRIVER");
  if (drv && !strcmp(drv, "dummy")) return;
  if (!SDL_InitSubSystem || !SDL_OpenAudioDevice || !SDL_QueueAudio ||
      !SDL_PauseAudioDevice)
    return;
  if (SDL_InitSubSystem(SDL_INIT_AUDIO) < 0) return;

  SDL_AudioSpec want, have;
  memset(&want, 0, sizeof(want));
  want.freq = SFX_SAMPLE_RATE;
  want.format = AUDIO_S16SYS;
  want.channels = 1;
  want.samples = 512;

  sfx_device = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);
  if (sfx_device == 0) return;
  sfx_build_buffers();
  SDL_PauseAudioDevice(sfx_device, 0);
}

static void sfx_play(int id) {
  if (!ui_sfx_enabled || preview_mode) return;
  if (id < 0 || id >= SFX_COUNT) return;
  sfx_ensure_init();
  if (sfx_device == 0) return;

  uint32_t now = SDL_GetTicks();
  if (id == SFX_MOVE && now - sfx_last_play_tick < 24u) return;
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
  if (sfx_device && SDL_CloseAudioDevice) {
    SDL_CloseAudioDevice(sfx_device);
    sfx_device = 0;
  }
}
