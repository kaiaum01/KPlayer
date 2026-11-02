/* Optional IP-based location for the top bar.
 * The free ip-api endpoint is queried in a detached worker so playback and UI
 * never wait for the network. No API key is required. */
static pthread_mutex_t network_location_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool network_location_enabled = false;
static bool network_location_started = false;
static bool network_location_valid = false;
static int network_utc_offset = 0;
static char network_location_text[96] = "dArkOS / ARM64";

static const char *network_json_value(const char *json, const char *key) {
  static char pattern[64];
  if (snprintf(pattern, sizeof(pattern), "\"%s\"", key) >= (int)sizeof(pattern))
    return NULL;
  const char *p = strstr(json, pattern);
  if (!p)
    return NULL;
  p += strlen(pattern);
  while (*p == ' ' || *p == '\t')
    p++;
  if (*p++ != ':')
    return NULL;
  while (*p == ' ' || *p == '\t')
    p++;
  return p;
}

static bool network_json_string(const char *json, const char *key, char *out,
                                size_t size) {
  const char *p = network_json_value(json, key);
  if (!p || *p++ != '"' || !size)
    return false;
  size_t used = 0;
  while (*p && *p != '"') {
    unsigned char c = (unsigned char)*p++;
    if (c == '\\' && *p) {
      c = (unsigned char)*p++;
      if (c == 'n' || c == 't')
        c = ' ';
    }
    if (used + 1 < size)
      out[used++] = (char)c;
  }
  out[used] = 0;
  return *p == '"';
}

static bool network_json_int(const char *json, const char *key, int *value) {
  const char *p = network_json_value(json, key);
  if (!p)
    return false;
  char *end = NULL;
  long parsed = strtol(p, &end, 10);
  if (end == p || parsed < -50400 || parsed > 50400)
    return false;
  *value = (int)parsed;
  return true;
}

static bool network_parse_location(const char *json, char *location,
                                   size_t location_size, int *utc_offset) {
  char status[24], city[64], region[16], country[16];
  if (!network_json_string(json, "status", status, sizeof(status)) ||
      strcmp(status, "success") ||
      !network_json_string(json, "city", city, sizeof(city)) ||
      !network_json_string(json, "region", region, sizeof(region)) ||
      !network_json_string(json, "countryCode", country, sizeof(country)) ||
      !network_json_int(json, "offset", utc_offset))
    return false;
  if (city[0] && region[0])
    snprintf(location, location_size, "%s, %s", city, region);
  else if (city[0])
    snprintf(location, location_size, "%s", city);
  else
    snprintf(location, location_size, "%s", country);
  return location[0] != 0;
}

static void *network_location_worker(void *unused) {
  (void)unused;
  struct addrinfo hints = {0}, *addresses = NULL;
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  if (getaddrinfo("ip-api.com", "80", &hints, &addresses))
    return NULL;

  int socket_fd = -1;
  for (struct addrinfo *it = addresses; it; it = it->ai_next) {
    socket_fd = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
    if (socket_fd < 0)
      continue;
    struct timeval timeout = {.tv_sec = 4, .tv_usec = 0};
    setsockopt(socket_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(socket_fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    if (!connect(socket_fd, it->ai_addr, it->ai_addrlen))
      break;
    close(socket_fd);
    socket_fd = -1;
  }
  freeaddrinfo(addresses);
  if (socket_fd < 0)
    return NULL;

  static const char request[] =
      "GET /json/?fields=status,message,city,region,countryCode,offset "
      "HTTP/1.0\r\nHost: ip-api.com\r\nUser-Agent: KPlayer/1.0.0\r\n"
      "Connection: close\r\n\r\n";
  size_t sent = 0;
  while (sent < sizeof(request) - 1) {
    ssize_t count = send(socket_fd, request + sent, sizeof(request) - 1 - sent,
                         MSG_NOSIGNAL);
    if (count <= 0) {
      close(socket_fd);
      return NULL;
    }
    sent += (size_t)count;
  }

  char response[8192];
  size_t used = 0;
  while (used + 1 < sizeof(response)) {
    ssize_t count =
        recv(socket_fd, response + used, sizeof(response) - 1 - used, 0);
    if (count <= 0)
      break;
    used += (size_t)count;
  }
  close(socket_fd);
  response[used] = 0;
  if (strncmp(response, "HTTP/1.0 200", 12) &&
      strncmp(response, "HTTP/1.1 200", 12))
    return NULL;
  char *body = strstr(response, "\r\n\r\n");
  if (!body)
    return NULL;
  body += 4;

  char location[96];
  int offset;
  if (!network_parse_location(body, location, sizeof(location), &offset))
    return NULL;
  pthread_mutex_lock(&network_location_mutex);
  snprintf(network_location_text, sizeof(network_location_text), "%s",
           location);
  network_utc_offset = offset;
  network_location_valid = true;
  pthread_mutex_unlock(&network_location_mutex);
  return NULL;
}

static void network_location_start(void) {
  if (!network_location_enabled || network_location_started)
    return;
  network_location_started = true;
  pthread_t worker;
  if (!pthread_create(&worker, NULL, network_location_worker, NULL))
    pthread_detach(worker);
}

static void network_location_snapshot(char *location, size_t location_size,
                                      bool *valid, int *utc_offset) {
  pthread_mutex_lock(&network_location_mutex);
  snprintf(location, location_size, "%s", network_location_text);
  *valid = network_location_valid && network_location_enabled;
  *utc_offset = network_utc_offset;
  pthread_mutex_unlock(&network_location_mutex);
}
