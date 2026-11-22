/* Native R36S Open-Meteo Weather App & Home Right-Corner Widget (v2.0.5).
 * Mode 11: Full Weather App opened via button X on Home or Options -> Clima e Localizacao.
 * First asks the user whether to use their IP location or search a city manually.
 * All Open-Meteo API calls run off-thread via ./weather_fetch.py (zero UI blocking). */

#define WEATHER_MODE_UNSET 0
#define WEATHER_MODE_IP 1
#define WEATHER_MODE_MANUAL 2

#define WEATHER_VIEW_SETUP 0
#define WEATHER_VIEW_SEARCH 1
#define WEATHER_VIEW_FORECAST 2

typedef struct {
  char name[64];
  char region[48];
  char country[48];
  double lat;
  double lon;
} WeatherCity;

typedef struct {
  char hour[8];
  char temp[12];
  int code;
  int rain_prob;
} WeatherHour;

typedef struct {
  char day[24];
  char desc[40];
  char tmin[12];
  char tmax[12];
  int rain_prob;
} WeatherDay;

typedef struct {
  bool valid;
  WeatherCity city;
  char temp[16];
  char feels[16];
  int humidity;
  char wind[16];
  int pressure;
  char uv[12];
  int code;
  bool is_day;
  char desc[48];
  char tmin[16];
  char tmax[16];
  char sunrise[12];
  char sunset[12];
  WeatherHour hours[6];
  int hour_count;
  WeatherDay days[5];
  int day_count;
} WeatherState;

static pthread_mutex_t weather_mutex = PTHREAD_MUTEX_INITIALIZER;
static int weather_mode = WEATHER_MODE_UNSET;
static int weather_view = WEATHER_VIEW_SETUP;
static int weather_return_mode = 3;
static int weather_setup_focus = 0; /* 0 = IP, 1 = Manual */
static bool weather_busy = false;
static char weather_error[160] = "";
static WeatherState weather_data = {0};
static WeatherCity weather_saved_city = {0};

/* Manual city search state (quick Brazilian cities + virtual keyboard + live results) */
static char weather_query[64] = "";
static int weather_search_tab = 0; /* 0 = Cidades rápidas / Resultados, 1 = Teclado */
static int weather_result_cursor = 0;
static int weather_kb_row = 0;
static int weather_kb_col = 0;
static WeatherCity weather_results[10];
static int weather_result_count = 0;

static const WeatherCity weather_quick_cities[] = {
    {"São Paulo", "SP", "Brasil", -23.5505, -46.6333},
    {"Rio de Janeiro", "RJ", "Brasil", -22.9068, -43.1729},
    {"Curitiba", "PR", "Brasil", -25.4284, -49.2733},
    {"Belo Horizonte", "MG", "Brasil", -19.9167, -43.9345},
    {"Brasília", "DF", "Brasil", -15.7939, -47.8828},
    {"Salvador", "BA", "Brasil", -12.9714, -38.5014},
    {"Porto Alegre", "RS", "Brasil", -30.0346, -51.2177},
    {"Recife", "PE", "Brasil", -8.0476, -34.8770},
    {"Fortaleza", "CE", "Brasil", -3.7319, -38.5267},
    {"Manaus", "AM", "Brasil", -3.1190, -60.0217},
};
#define WEATHER_QUICK_COUNT ((int)(sizeof(weather_quick_cities) / sizeof(weather_quick_cities[0])))

static const char *weather_kb_rows[4][10] = {
    {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
    {"a", "s", "d", "f", "g", "h", "j", "k", "l", " "},
    {"z", "x", "c", "v", "b", "n", "m", "-", "DEL", "OK"},
    {"LIMPAR", "BUSCAR", "VOLTAR", NULL, NULL, NULL, NULL, NULL, NULL, NULL},
};

static int weather_kb_row_len(int r) { return r == 3 ? 3 : 10; }

static void weather_save_cfg(void) {
  FILE *f = fopen("weather.tmp", "w");
  if (!f) return;
  fprintf(f, "KPLAYER_WEATHER 1\nmode %d\nname %s\nregion %s\ncountry %s\nlat %.4f\nlon %.4f\n",
          weather_mode,
          weather_saved_city.name,
          weather_saved_city.region,
          weather_saved_city.country,
          weather_saved_city.lat,
          weather_saved_city.lon);
  if (fclose(f) == 0) rename("weather.tmp", "weather.cfg");
}

static void weather_load_cfg(void) {
  FILE *f = fopen("weather.cfg", "r");
  if (!f) return;
  char line[160];
  if (!fgets(line, sizeof(line), f) || strncmp(line, "KPLAYER_WEATHER 1", 17)) {
    fclose(f);
    return;
  }
  while (fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
    if (!strncmp(line, "mode ", 5)) {
      int m = atoi(line + 5);
      if (m >= 0 && m <= 2) weather_mode = m;
    } else if (!strncmp(line, "name ", 5)) {
      snprintf(weather_saved_city.name, sizeof(weather_saved_city.name), "%.63s", line + 5);
    } else if (!strncmp(line, "region ", 7)) {
      snprintf(weather_saved_city.region, sizeof(weather_saved_city.region), "%.47s", line + 7);
    } else if (!strncmp(line, "country ", 8)) {
      snprintf(weather_saved_city.country, sizeof(weather_saved_city.country), "%.47s", line + 8);
    } else if (!strncmp(line, "lat ", 4)) {
      weather_saved_city.lat = strtod(line + 4, NULL);
    } else if (!strncmp(line, "lon ", 4)) {
      weather_saved_city.lon = strtod(line + 4, NULL);
    }
  }
  fclose(f);
}

static void weather_split_tsv(char *line, char **fields, int max_fields, int *out_count) {
  int nf = 0;
  char *p = line;
  while (nf < max_fields) {
    fields[nf++] = p;
    char *tab = strchr(p, '\t');
    if (!tab) break;
    *tab = 0;
    p = tab + 1;
  }
  *out_count = nf;
}

static bool weather_parse_forecast_tsv(const char *path, WeatherState *dst) {
  FILE *f = fopen(path, "r");
  if (!f) return false;
  memset(dst, 0, sizeof(*dst));
  char line[512];
  while (fgets(line, sizeof(line), f)) {
    size_t n = strlen(line);
    while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
    char *fields[16] = {0};
    int nf = 0;
    weather_split_tsv(line, fields, 16, &nf);
    if (nf < 2) continue;
    if (!strcmp(fields[0], "LOC") && nf >= 6) {
      snprintf(dst->city.name, sizeof(dst->city.name), "%s", fields[1]);
      snprintf(dst->city.region, sizeof(dst->city.region), "%s", fields[2]);
      snprintf(dst->city.country, sizeof(dst->city.country), "%s", fields[3]);
      dst->city.lat = strtod(fields[4], NULL);
      dst->city.lon = strtod(fields[5], NULL);
    } else if (!strcmp(fields[0], "CUR") && nf >= 14) {
      snprintf(dst->temp, sizeof(dst->temp), "%s", fields[1]);
      snprintf(dst->feels, sizeof(dst->feels), "%s", fields[2]);
      dst->humidity = atoi(fields[3]);
      snprintf(dst->wind, sizeof(dst->wind), "%s", fields[4]);
      dst->pressure = atoi(fields[5]);
      snprintf(dst->uv, sizeof(dst->uv), "%s", fields[6]);
      dst->code = atoi(fields[7]);
      dst->is_day = atoi(fields[8]) != 0;
      snprintf(dst->desc, sizeof(dst->desc), "%s", fields[9]);
      snprintf(dst->tmin, sizeof(dst->tmin), "%s", fields[10]);
      snprintf(dst->tmax, sizeof(dst->tmax), "%s", fields[11]);
      snprintf(dst->sunrise, sizeof(dst->sunrise), "%s", fields[12]);
      snprintf(dst->sunset, sizeof(dst->sunset), "%s", fields[13]);
      dst->valid = true;
    } else if (!strcmp(fields[0], "HR") && nf >= 5 && dst->hour_count < 6) {
      WeatherHour *h = &dst->hours[dst->hour_count++];
      snprintf(h->hour, sizeof(h->hour), "%s", fields[1]);
      snprintf(h->temp, sizeof(h->temp), "%s", fields[2]);
      h->code = atoi(fields[3]);
      h->rain_prob = atoi(fields[4]);
    } else if (!strcmp(fields[0], "DAY") && nf >= 6 && dst->day_count < 5) {
      WeatherDay *d = &dst->days[dst->day_count++];
      snprintf(d->day, sizeof(d->day), "%s", fields[1]);
      snprintf(d->desc, sizeof(d->desc), "%s", fields[2]);
      snprintf(d->tmin, sizeof(d->tmin), "%s", fields[3]);
      snprintf(d->tmax, sizeof(d->tmax), "%s", fields[4]);
      d->rain_prob = atoi(fields[5]);
    }
  }
  fclose(f);
  return dst->valid;
}

typedef struct {
  int kind; /* 0 = ip, 1 = forecast, 2 = search */
  bool refresh;
  WeatherCity city;
  char query[64];
} WeatherJob;

static void *weather_worker(void *arg) {
  WeatherJob *job = (WeatherJob *)arg;
  const char *out_path = job->kind == 2 ? "iptv/.cache/weather-search.tsv"
                                        : "iptv/.cache/weather-forecast.tsv";
  int rc = -1;
  if (job->kind == 0) {
    char *argv[] = {"python3", "./weather_fetch.py", "ip", (char *)out_path,
                    job->refresh ? "--refresh" : NULL, NULL};
    rc = kp_upd_run_python(argv);
  } else if (job->kind == 1) {
    char lat_s[32], lon_s[32];
    snprintf(lat_s, sizeof(lat_s), "%.4f", job->city.lat);
    snprintf(lon_s, sizeof(lon_s), "%.4f", job->city.lon);
    char *argv[] = {"python3", "./weather_fetch.py", "forecast", lat_s, lon_s,
                    job->city.name, job->city.region, job->city.country,
                    (char *)out_path, job->refresh ? "--refresh" : NULL, NULL};
    rc = kp_upd_run_python(argv);
  } else {
    char *argv[] = {"python3", "./weather_fetch.py", "search", job->query,
                    (char *)out_path, NULL};
    rc = kp_upd_run_python(argv);
  }

  if (job->kind == 2) {
    WeatherCity found[10];
    int cnt = 0;
    if (rc == 0) {
      FILE *f = fopen(out_path, "r");
      if (f) {
        char line[256];
        while (cnt < 10 && fgets(line, sizeof(line), f)) {
          size_t n = strlen(line);
          while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
          char *fields[6] = {0};
          int nf = 0;
          weather_split_tsv(line, fields, 6, &nf);
          if (nf >= 5 && fields[0][0]) {
            snprintf(found[cnt].name, sizeof(found[cnt].name), "%s", fields[0]);
            snprintf(found[cnt].region, sizeof(found[cnt].region), "%s", fields[1]);
            snprintf(found[cnt].country, sizeof(found[cnt].country), "%s", fields[2]);
            found[cnt].lat = strtod(fields[3], NULL);
            found[cnt].lon = strtod(fields[4], NULL);
            cnt++;
          }
        }
        fclose(f);
      }
    }
    pthread_mutex_lock(&weather_mutex);
    weather_result_count = cnt;
    for (int i = 0; i < cnt; i++) weather_results[i] = found[i];
    weather_result_cursor = 0;
    if (cnt == 0)
      snprintf(weather_error, sizeof(weather_error),
               "Nenhuma cidade encontrada para \"%s\".", job->query);
    else {
      weather_error[0] = 0;
      weather_search_tab = 0;
    }
    weather_busy = false;
    pthread_mutex_unlock(&weather_mutex);
  } else {
    WeatherState parsed;
    bool ok = (rc == 0) && weather_parse_forecast_tsv(out_path, &parsed);
    pthread_mutex_lock(&weather_mutex);
    if (ok) {
      weather_data = parsed;
      weather_saved_city = parsed.city;
      weather_error[0] = 0;
      weather_save_cfg();
    } else {
      snprintf(weather_error, sizeof(weather_error),
               "Não foi possível obter o clima via Open-Meteo agora.");
    }
    weather_busy = false;
    pthread_mutex_unlock(&weather_mutex);
  }
  free(job);
  return NULL;
}

static void weather_start_ip(bool refresh) {
  pthread_mutex_lock(&weather_mutex);
  if (weather_busy) { pthread_mutex_unlock(&weather_mutex); return; }
  weather_busy = true;
  weather_mode = WEATHER_MODE_IP;
  weather_error[0] = 0;
  pthread_mutex_unlock(&weather_mutex);
  weather_save_cfg();

  WeatherJob *job = calloc(1, sizeof(*job));
  if (!job) return;
  job->kind = 0;
  job->refresh = refresh;
  pthread_t t;
  if (pthread_create(&t, NULL, weather_worker, job) == 0) pthread_detach(t);
  else { free(job); pthread_mutex_lock(&weather_mutex); weather_busy = false; pthread_mutex_unlock(&weather_mutex); }
}

static void weather_start_city(const WeatherCity *city, bool refresh) {
  pthread_mutex_lock(&weather_mutex);
  if (weather_busy) { pthread_mutex_unlock(&weather_mutex); return; }
  weather_busy = true;
  weather_mode = WEATHER_MODE_MANUAL;
  weather_saved_city = *city;
  weather_error[0] = 0;
  pthread_mutex_unlock(&weather_mutex);
  weather_save_cfg();

  WeatherJob *job = calloc(1, sizeof(*job));
  if (!job) return;
  job->kind = 1;
  job->refresh = refresh;
  job->city = *city;
  pthread_t t;
  if (pthread_create(&t, NULL, weather_worker, job) == 0) pthread_detach(t);
  else { free(job); pthread_mutex_lock(&weather_mutex); weather_busy = false; pthread_mutex_unlock(&weather_mutex); }
}

static void weather_start_search(const char *query) {
  if (!query || strlen(query) < 2) {
    pthread_mutex_lock(&weather_mutex);
    snprintf(weather_error, sizeof(weather_error), "Digite pelo menos 2 letras.");
    pthread_mutex_unlock(&weather_mutex);
    return;
  }
  pthread_mutex_lock(&weather_mutex);
  if (weather_busy) { pthread_mutex_unlock(&weather_mutex); return; }
  weather_busy = true;
  weather_error[0] = 0;
  pthread_mutex_unlock(&weather_mutex);

  WeatherJob *job = calloc(1, sizeof(*job));
  if (!job) return;
  job->kind = 2;
  snprintf(job->query, sizeof(job->query), "%s", query);
  pthread_t t;
  if (pthread_create(&t, NULL, weather_worker, job) == 0) pthread_detach(t);
  else { free(job); pthread_mutex_lock(&weather_mutex); weather_busy = false; pthread_mutex_unlock(&weather_mutex); }
}

static void weather_boot_refresh(void) {
  weather_load_cfg();
  if (weather_mode == WEATHER_MODE_IP) {
    weather_start_ip(false);
  } else if (weather_mode == WEATHER_MODE_MANUAL && weather_saved_city.name[0]) {
    weather_start_city(&weather_saved_city, false);
  }
}

static void weather_clear_location(void) {
  pthread_mutex_lock(&weather_mutex);
  weather_mode = WEATHER_MODE_UNSET;
  memset(&weather_data, 0, sizeof(weather_data));
  memset(&weather_saved_city, 0, sizeof(weather_saved_city));
  weather_error[0] = 0;
  weather_view = WEATHER_VIEW_SETUP;
  pthread_mutex_unlock(&weather_mutex);
  weather_save_cfg();
}

static void weather_open(int ret_mode) {
  weather_return_mode = ret_mode;
  if (weather_mode == WEATHER_MODE_UNSET) {
    weather_view = WEATHER_VIEW_SETUP;
    weather_setup_focus = 0;
  } else {
    weather_view = WEATHER_VIEW_FORECAST;
    pthread_mutex_lock(&weather_mutex);
    bool has_data = weather_data.valid;
    pthread_mutex_unlock(&weather_mutex);
    if (!has_data) {
      if (weather_mode == WEATHER_MODE_IP) weather_start_ip(false);
      else if (weather_saved_city.name[0]) weather_start_city(&weather_saved_city, false);
    }
  }
  mode = 11;
}

static void weather_open_manual_search(int ret_mode) {
  weather_return_mode = ret_mode;
  weather_view = WEATHER_VIEW_SEARCH;
  weather_search_tab = 0;
  weather_result_cursor = 0;
  mode = 11;
}

/* Compact weather + location widget placed in the right corner next to "Seu som. Sua tela." */
static void draw_home_weather_widget(void) {
  pthread_mutex_lock(&weather_mutex);
  WeatherState snap = weather_data;
  bool busy = weather_busy;
  int wmode = weather_mode;
  pthread_mutex_unlock(&weather_mutex);

  int wx = 414, wy = 40, ww = 210, wh = 54;
  panel_card(wx, wy, ww, wh, 12);
  /* Small X badge in top-right of widget */
  rounded(wx + ww - 54, wy + 6, 46, 16, 8, alpha(accent, 42));
  centered("X Clima", wx + ww - 54, wy + 8, 46, 9, accent);

  if (snap.valid) {
    char tbuf[24];
    snprintf(tbuf, sizeof(tbuf), "%s°C", snap.temp);
    label(tbuf, wx + 12, wy + 7, 19, textc, 84);
    char loc_line[120];
    if (snap.city.region[0])
      snprintf(loc_line, sizeof(loc_line), "%.63s, %.47s", snap.city.name, snap.city.region);
    else
      snprintf(loc_line, sizeof(loc_line), "%.63s", snap.city.name);
    label(loc_line, wx + 12, wy + 33, 10, accent, ww - 24);
    label(snap.desc, wx + 82, wy + 24, 10, muted, ww - 90);
  } else if (busy) {
    label("Clima", wx + 12, wy + 8, 13, textc, 120);
    label("Carregando Open-Meteo...", wx + 12, wy + 29, 10, muted, ww - 24);
  } else if (wmode == WEATHER_MODE_UNSET) {
    label("Clima & Local", wx + 12, wy + 8, 13, textc, 130);
    label("X: IP ou buscar cidade", wx + 12, wy + 29, 10, muted, ww - 24);
  } else {
    label("Open-Meteo", wx + 12, wy + 8, 13, textc, 120);
    label("Pressione X p/ atualizar", wx + 12, wy + 29, 10, muted, ww - 24);
  }
}

static void draw_weather(void) {
  backdrop();
  draw_header("CLIMA");

  pthread_mutex_lock(&weather_mutex);
  WeatherState snap = weather_data;
  bool busy = weather_busy;
  char err[160];
  snprintf(err, sizeof(err), "%s", weather_error);
  int rcount = weather_result_count;
  WeatherCity res_copy[10];
  for (int i = 0; i < rcount; i++) res_copy[i] = weather_results[i];
  pthread_mutex_unlock(&weather_mutex);

  if (weather_view == WEATHER_VIEW_SETUP) {
    label("Clima Open-Meteo", 24, 46, 23, textc, 420);
    label("Como deseja definir sua localização para o clima?", 24, 76, 13, muted, 590);

    /* Option 0: IP Location */
    card(24, 118, 592, 92, 14, weather_setup_focus == 0, panel);
    rounded(40, 136, 44, 44, 12, alpha(accent, 42));
    centered("IP", 40, 148, 44, 16, accent);
    label("Usar localização do meu IP", 100, 134, 18,
          weather_setup_focus == 0 ? accent : textc, 490);
    label("Detecta automaticamente sua cidade pelo IP e carrega o clima ao vivo.",
          100, 162, 12, muted, 490);
    label("B: Confirmar", 100, 183, 10, accent, 200);

    /* Option 1: Manual city search */
    card(24, 226, 592, 92, 14, weather_setup_focus == 1, panel);
    rounded(40, 244, 44, 44, 12, alpha(accent, 42));
    centered("BR", 40, 256, 44, 16, accent);
    label("Pesquisar cidade manualmente", 100, 242, 18,
          weather_setup_focus == 1 ? accent : textc, 490);
    label("Escolha entre cidades rápidas ou digite qualquer cidade via Open-Meteo.",
          100, 270, 12, muted, 490);
    label("B: Abrir pesquisa", 100, 291, 10, accent, 200);

    panel_card(24, 340, 592, 82, 12);
    label("Privacidade & Opções", 40, 352, 13, accent, 300);
    label("Você pode alterar entre IP, cidade manual ou desativar o clima a qualquer momento",
          40, 374, 11, muted, 560);
    label("em Opções (SELECT) -> Clima e Localização, ou pressionando Y aqui.",
          40, 392, 11, muted, 560);
    if (err[0]) label(err, 24, 434, 12, accent, 592);
    footer_hints(NULL, 0);
    return;
  }

  if (weather_view == WEATHER_VIEW_SEARCH) {
    label("Pesquisar Cidade (Open-Meteo)", 24, 44, 19, textc, 390);
    /* Mode switch pills */
    pill(422, 44, 92, 24, weather_search_tab == 0);
    centered(rcount > 0 ? "Resultados" : "Cidades", 422, 50, 92, 11,
             weather_search_tab == 0 ? bg : muted);
    pill(522, 44, 94, 24, weather_search_tab == 1);
    centered("Teclado", 522, 50, 94, 11, weather_search_tab == 1 ? bg : muted);

    /* Query bar */
    card(24, 78, 592, 34, 10, weather_search_tab == 1, elevated);
    char qshown[80];
    snprintf(qshown, sizeof(qshown), "Busca: %s_", weather_query);
    label(qshown, 36, 87, 13, accent, 460);
    label("X: Alternar aba", 494, 88, 10, muted, 112);

    if (weather_search_tab == 1) {
      for (int r = 0; r < 4; r++) {
        int cols = weather_kb_row_len(r);
        int y = 126 + r * 52;
        int w = r == 3 ? 190 : 55;
        int step = r == 3 ? 200 : 59;
        for (int c = 0; c < cols; c++) {
          int x = 24 + c * step;
          bool focus = (r == weather_kb_row && c == weather_kb_col);
          card(x, y, w, 42, 9, focus, panel);
          const char *lbl = weather_kb_rows[r][c];
          if (!strcmp(lbl, " ")) lbl = "ESP";
          centered(lbl, x + 2, y + 12, w - 4, strlen(lbl) > 3 ? 12 : 15,
                   focus ? accent : textc);
        }
      }
      label(busy ? "Pesquisando Open-Meteo..." : (err[0] ? err : "B: Inserir letra • BUSCAR para consultar Open-Meteo"),
            24, 348, 12, busy || err[0] ? accent : muted, 592);
    } else {
      const WeatherCity *list = rcount > 0 ? res_copy : weather_quick_cities;
      int total_c = rcount > 0 ? rcount : WEATHER_QUICK_COUNT;
      if (weather_result_cursor >= total_c) weather_result_cursor = 0;
      int off = weather_result_cursor >= 6 ? weather_result_cursor - 5 : 0;
      label(rcount > 0 ? "Resultados Open-Meteo (B: Selecionar)"
                       : "Cidades rápidas do Brasil (X para digitar no teclado)",
            24, 122, 11, muted, 592);
      for (int row = 0; row < 6 && off + row < total_c; row++) {
        int i = off + row;
        int y = 144 + row * 48;
        bool focus = i == weather_result_cursor;
        card(24, y, 592, 42, 10, focus, panel);
        label(list[i].name, 40, y + 7, 15, focus ? accent : textc, 340);
        char sub[112];
        snprintf(sub, sizeof(sub), "%s%s%s", list[i].region,
                 (list[i].region[0] && list[i].country[0]) ? " • " : "",
                 list[i].country);
        label(sub, 40, y + 25, 10, muted, 360);
        char coords[40];
        snprintf(coords, sizeof(coords), "%.2f, %.2f", list[i].lat, list[i].lon);
        label(coords, 480, y + 14, 11, dim, 120);
      }
      if (busy) label("Consultando Open-Meteo...", 24, 440, 12, accent, 400);
      else if (err[0]) label(err, 24, 440, 12, accent, 590);
    }
    footer_hints(NULL, 0);
    return;
  }

  /* WEATHER_VIEW_FORECAST: Full Open-Meteo Weather App Dashboard */
  if (!snap.valid) {
    panel_card(24, 90, 592, 220, 16);
    centered(busy ? "Carregando previsão da Open-Meteo..."
                  : (err[0] ? err : "Nenhuma previsão carregada"),
             36, 170, 568, 18, busy ? accent : textc);
    centered("X: Tentar novamente  •  Y: Trocar cidade / IP  •  A: Voltar",
             36, 214, 568, 12, muted);
    footer_hints(NULL, 0);
    return;
  }

  /* Hero card */
  panel_card(18, 42, 604, 110, 14);
  char loc_title[120];
  if (snap.city.region[0])
    snprintf(loc_title, sizeof(loc_title), "%s, %s", snap.city.name, snap.city.region);
  else
    snprintf(loc_title, sizeof(loc_title), "%s", snap.city.name);
  label(loc_title, 34, 52, 18, textc, 360);
  label(weather_mode == WEATHER_MODE_IP ? "Open-Meteo • Localização por IP"
                                        : "Open-Meteo • Cidade manual",
        34, 76, 11, accent, 320);
  label(snap.desc, 34, 96, 15, textc, 280);
  char mm[96];
  snprintf(mm, sizeof(mm), "Sensação %s°C  •  Mín %s°  Máx %s°",
           snap.feels, snap.tmin, snap.tmax);
  label(mm, 34, 122, 11, muted, 360);

  /* Big temperature on right of hero */
  char bigt[24];
  snprintf(bigt, sizeof(bigt), "%s°C", snap.temp);
  centered(bigt, 426, 56, 180, 38, accent);
  char sun[48];
  snprintf(sun, sizeof(sun), "Sol %s / %s", snap.sunrise, snap.sunset);
  centered(sun, 426, 114, 180, 11, muted);

  /* 4 metrics row */
  const char *m_lbl[4] = {"UMIDADE", "VENTO", "PRESSÃO", "ÍNDICE UV"};
  char m_val[4][24];
  snprintf(m_val[0], sizeof(m_val[0]), "%d%%", snap.humidity);
  snprintf(m_val[1], sizeof(m_val[1]), "%s km/h", snap.wind);
  snprintf(m_val[2], sizeof(m_val[2]), "%d hPa", snap.pressure);
  snprintf(m_val[3], sizeof(m_val[3]), "%s", snap.uv);
  for (int i = 0; i < 4; i++) {
    int mx = 18 + i * 154;
    panel_card(mx, 162, 144, 52, 10);
    label(m_lbl[i], mx + 12, 170, 9, muted, 120);
    label(m_val[i], mx + 12, 188, 15, textc, 124);
  }

  /* Next 6 hours strip */
  label("PRÓXIMAS HORAS", 20, 224, 10, accent, 200);
  label(busy ? "Atualizando..." : "Y: Trocar local • X: Atualizar", 384, 224, 10, muted, 238);
  int hc = snap.hour_count < 6 ? snap.hour_count : 6;
  for (int i = 0; i < hc; i++) {
    int hx = 18 + i * 102;
    panel_card(hx, 240, 94, 68, 10);
    centered(snap.hours[i].hour, hx + 4, 247, 86, 11, muted);
    char ht[16], hp[16];
    snprintf(ht, sizeof(ht), "%s°", snap.hours[i].temp);
    snprintf(hp, sizeof(hp), "%d%% chv", snap.hours[i].rain_prob);
    centered(ht, hx + 4, 265, 86, 16, textc);
    centered(hp, hx + 4, 288, 86, 9, accent);
  }

  /* 5-day forecast */
  label("PRÓXIMOS DIAS", 20, 318, 10, accent, 200);
  int dc = snap.day_count < 5 ? snap.day_count : 5;
  for (int i = 0; i < dc; i++) {
    int dy = 334 + i * 27;
    rounded(18, dy, 604, 23, 7, i == 0 ? elevated : panel);
    label(snap.days[i].day, 28, dy + 5, 11, i == 0 ? accent : textc, 100);
    label(snap.days[i].desc, 134, dy + 5, 11, muted, 220);
    char dp[24], dmm[32];
    snprintf(dp, sizeof(dp), "Chuva %d%%", snap.days[i].rain_prob);
    snprintf(dmm, sizeof(dmm), "%s° / %s°", snap.days[i].tmin, snap.days[i].tmax);
    label(dp, 382, dy + 5, 11, dim, 100);
    label(dmm, 514, dy + 5, 12, textc, 98);
  }
  footer_hints(NULL, 0);
}

static void weather_key(SDL_Keycode k) {
  if (weather_view == WEATHER_VIEW_SETUP) {
    if (k == SDLK_UP || k == SDLK_DOWN || k == SDLK_LEFT || k == SDLK_RIGHT) {
      weather_setup_focus = 1 - weather_setup_focus;
    } else if (k == SDLK_RETURN) {
      if (weather_setup_focus == 0) {
        weather_view = WEATHER_VIEW_FORECAST;
        weather_start_ip(true);
      } else {
        weather_view = WEATHER_VIEW_SEARCH;
        weather_search_tab = 0;
        weather_result_cursor = 0;
      }
    } else if (k == SDLK_BACKSPACE) {
      mode = weather_return_mode;
    }
    return;
  }

  if (weather_view == WEATHER_VIEW_SEARCH) {
    if (k == SDLK_BACKSPACE) {
      if (weather_mode == WEATHER_MODE_UNSET) weather_view = WEATHER_VIEW_SETUP;
      else weather_view = WEATHER_VIEW_FORECAST;
      return;
    }
    if (k == SDLK_SPACE) {
      weather_search_tab = 1 - weather_search_tab;
      return;
    }
    if (weather_search_tab == 1) {
      int rows = 4;
      if (k == SDLK_UP) weather_kb_row = (weather_kb_row + rows - 1) % rows;
      else if (k == SDLK_DOWN) weather_kb_row = (weather_kb_row + 1) % rows;
      else if (k == SDLK_LEFT) {
        int cols = weather_kb_row_len(weather_kb_row);
        weather_kb_col = (weather_kb_col + cols - 1) % cols;
      } else if (k == SDLK_RIGHT) {
        int cols = weather_kb_row_len(weather_kb_row);
        weather_kb_col = (weather_kb_col + 1) % cols;
      } else if (k == SDLK_RETURN) {
        int cols = weather_kb_row_len(weather_kb_row);
        if (weather_kb_col >= cols) weather_kb_col = cols - 1;
        const char *tok = weather_kb_rows[weather_kb_row][weather_kb_col];
        if (!strcmp(tok, "DEL")) {
          size_t n = strlen(weather_query);
          if (n > 0) weather_query[n - 1] = 0;
        } else if (!strcmp(tok, "LIMPAR")) {
          weather_query[0] = 0;
        } else if (!strcmp(tok, "VOLTAR")) {
          weather_search_tab = 0;
        } else if (!strcmp(tok, "OK") || !strcmp(tok, "BUSCAR")) {
          weather_start_search(weather_query);
        } else {
          size_t n = strlen(weather_query);
          if (n + strlen(tok) < sizeof(weather_query) - 1) {
            strcat(weather_query, tok);
          }
        }
      }
      int cols = weather_kb_row_len(weather_kb_row);
      if (weather_kb_col >= cols) weather_kb_col = cols - 1;
      return;
    }
    /* Results / Quick cities list */
    pthread_mutex_lock(&weather_mutex);
    int rcount = weather_result_count;
    WeatherCity chosen = {0};
    int total_c = rcount > 0 ? rcount : WEATHER_QUICK_COUNT;
    if (k == SDLK_UP) weather_result_cursor = (weather_result_cursor + total_c - 1) % total_c;
    else if (k == SDLK_DOWN) weather_result_cursor = (weather_result_cursor + 1) % total_c;
    else if (k == SDLK_RETURN && total_c > 0) {
      chosen = rcount > 0 ? weather_results[weather_result_cursor]
                          : weather_quick_cities[weather_result_cursor];
    }
    pthread_mutex_unlock(&weather_mutex);
    if (k == SDLK_RETURN && chosen.name[0]) {
      weather_view = WEATHER_VIEW_FORECAST;
      weather_start_city(&chosen, true);
    }
    return;
  }

  /* WEATHER_VIEW_FORECAST */
  if (k == SDLK_BACKSPACE) {
    mode = weather_return_mode;
  } else if (k == SDLK_m) {
    /* Y: Re-open choice between IP location or manual search */
    weather_view = WEATHER_VIEW_SETUP;
    weather_setup_focus = weather_mode == WEATHER_MODE_MANUAL ? 1 : 0;
  } else if (k == SDLK_SPACE || k == SDLK_RETURN) {
    if (weather_mode == WEATHER_MODE_IP) weather_start_ip(true);
    else if (weather_saved_city.name[0]) weather_start_city(&weather_saved_city, true);
    else weather_view = WEATHER_VIEW_SETUP;
  }
}
