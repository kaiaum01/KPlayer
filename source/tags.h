/* Bounded ID3v2.2/2.3/2.4 and ID3v1 reader. GPL-2.0-or-later. */
#define TAG_LIMIT (16u * 1024u * 1024u)
#define TAG_TEXT_LIMIT 65536u
typedef struct {
  char title[512], artist[512], album[512];
  unsigned char *picture;
  size_t picture_size;
  char *lyrics;
} LocalTags;
static uint32_t tag_be32(const unsigned char *p) {
  return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 |
         p[3];
}
static bool tag_sync(const unsigned char *p, uint32_t *v) {
  if ((p[0] | p[1] | p[2] | p[3]) & 128)
    return false;
  *v = (uint32_t)p[0] << 21 | (uint32_t)p[1] << 14 | (uint32_t)p[2] << 7 | p[3];
  return true;
}
static size_t tag_unsync(unsigned char *p, size_t n) {
  size_t w = 0;
  for (size_t i = 0; i < n; i++) {
    p[w++] = p[i];
    if (p[i] == 255 && i + 1 < n && p[i + 1] == 0)
      i++;
  }
  return w;
}
static void tag_put(char *out, size_t cap, size_t *used, unsigned cp) {
  unsigned char b[4];
  size_t n;
  if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
    cp = 0xfffd;
  if (cp < 128) {
    b[0] = cp;
    n = 1;
  } else if (cp < 2048) {
    b[0] = 0xc0 | (cp >> 6);
    b[1] = 0x80 | (cp & 63);
    n = 2;
  } else if (cp < 65536) {
    b[0] = 0xe0 | (cp >> 12);
    b[1] = 0x80 | ((cp >> 6) & 63);
    b[2] = 0x80 | (cp & 63);
    n = 3;
  } else {
    b[0] = 0xf0 | (cp >> 18);
    b[1] = 0x80 | ((cp >> 12) & 63);
    b[2] = 0x80 | ((cp >> 6) & 63);
    b[3] = 0x80 | (cp & 63);
    n = 4;
  }
  if (*used + n < cap) {
    memcpy(out + *used, b, n);
    *used += n;
    out[*used] = 0;
  }
}
static void tag_text(const unsigned char *p, size_t n, int encoding, char *out,
                     size_t cap) {
  size_t used = 0;
  bool little = false;
  out[0] = 0;
  if (encoding < 0 || encoding > 3)
    return;
  if (encoding == 1) {
    if (n >= 2 && p[0] == 255 && p[1] == 254) {
      little = true;
      p += 2;
      n -= 2;
    } else if (n >= 2 && p[0] == 254 && p[1] == 255) {
      p += 2;
      n -= 2;
    }
  }
  for (size_t i = 0; i < n && used + 4 < cap;) {
    unsigned cp;
    if (encoding == 1 || encoding == 2) {
      if (n - i < 2)
        break;
      cp = little ? (unsigned)p[i] | (unsigned)p[i + 1] << 8
                  : (unsigned)p[i] << 8 | p[i + 1];
      i += 2;
      if (cp >= 0xd800 && cp <= 0xdbff && n - i >= 2) {
        unsigned low = little ? (unsigned)p[i] | (unsigned)p[i + 1] << 8
                              : (unsigned)p[i] << 8 | p[i + 1];
        if (low >= 0xdc00 && low <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
          i += 2;
        } else
          cp = 0xfffd;
      }
    } else if (encoding == 0)
      cp = p[i++];
    else {
      unsigned a = p[i++];
      if (a < 128)
        cp = a;
      else {
        unsigned count = a >= 0xc2 && a <= 0xdf   ? 1
                         : a >= 0xe0 && a <= 0xef ? 2
                         : a >= 0xf0 && a <= 0xf4 ? 3
                                                  : 0;
        cp = count ? a & ((1u << (6 - count)) - 1) : 0xfffd;
        bool valid = count && n - i >= count;
        for (unsigned j = 0; valid && j < count; j++)
          if ((p[i + j] & 0xc0) != 0x80)
            valid = false;
        if (valid) {
          for (unsigned j = 0; j < count; j++)
            cp = (cp << 6) | (p[i++] & 63);
          if ((count == 1 && cp < 128) || (count == 2 && cp < 2048) ||
              (count == 3 && cp < 65536))
            cp = 0xfffd;
        } else
          cp = 0xfffd;
      }
    }
    if (cp == 0) {
      if (used && out[used - 1] != ' ') {
        tag_put(out, cap, &used, ',');
        tag_put(out, cap, &used, ' ');
      }
      continue;
    }
    if (cp == 0xfeff)
      continue;
    if (cp < 32 && cp != '\n' && cp != '\r' && cp != '\t')
      cp = ' ';
    tag_put(out, cap, &used, cp);
  }
  while (used && (out[used - 1] == ' ' || out[used - 1] == ',' ||
                  out[used - 1] == '\r' || out[used - 1] == '\n'))
    out[--used] = 0;
}
static size_t tag_terminator(const unsigned char *p, size_t n, int enc) {
  size_t step = enc == 1 || enc == 2 ? 2 : 1;
  for (size_t i = 0; i + step <= n; i += step)
    if (!p[i] && (step == 1 || !p[i + 1]))
      return i + step;
  return n;
}
static void tag_frame(LocalTags *t, const char *id, const unsigned char *p,
                      size_t n, bool old) {
  if (!n)
    return;
  char *target = !strcmp(id, old ? "TT2" : "TIT2")   ? t->title
                 : !strcmp(id, old ? "TP1" : "TPE1") ? t->artist
                 : !strcmp(id, old ? "TAL" : "TALB") ? t->album
                                                     : NULL;
  if (target) {
    tag_text(p + 1, n - 1, p[0], target, 512);
    return;
  }
  if (!strcmp(id, old ? "TP2" : "TPE2") && !t->artist[0]) {
    tag_text(p + 1, n - 1, p[0], t->artist, 512);
    return;
  }
  if (!strcmp(id, old ? "ULT" : "USLT")) {
    if (n < 4 || p[0] > 3)
      return;
    size_t at = 4 + tag_terminator(p + 4, n - 4, p[0]);
    if (at >= n)
      return;
    char *v = calloc(1, TAG_TEXT_LIMIT);
    if (!v)
      return;
    tag_text(p + at, n - at, p[0], v, TAG_TEXT_LIMIT);
    if (*v) {
      free(t->lyrics);
      t->lyrics = v;
    } else
      free(v);
    return;
  }
  if (strcmp(id, old ? "PIC" : "APIC") || p[0] > 3)
    return;
  size_t at = 1;
  if (old) {
    if (n < 5)
      return;
    at = 4;
  } else {
    while (at < n && p[at])
      at++;
    if (at >= n)
      return;
    at++;
  }
  if (at >= n)
    return;
  int picture_type = p[at++];
  at += tag_terminator(p + at, n - at, p[0]);
  if (at >= n || n - at > 8u * 1024u * 1024u ||
      (t->picture && picture_type != 3))
    return;
  unsigned char *data = malloc(n - at);
  if (!data)
    return;
  memcpy(data, p + at, n - at);
  free(t->picture);
  t->picture = data;
  t->picture_size = n - at;
}
static void free_local_tags(LocalTags *t) {
  free(t->picture);
  free(t->lyrics);
  memset(t, 0, sizeof(*t));
}
static void read_local_tags(const char *path, LocalTags *t) {
  memset(t, 0, sizeof(*t));
  FILE *f = fopen(path, "rb");
  if (!f)
    return;
  unsigned char h[10];
  size_t got = fread(h, 1, 10, f);
  uint32_t length = 0;
  if (got == 10 && !memcmp(h, "ID3", 3) && h[3] >= 2 && h[3] <= 4 &&
      tag_sync(h + 6, &length) && length <= TAG_LIMIT) {
    unsigned char *data = malloc(length ? length : 1);
    if (data && fread(data, 1, length, f) == length) {
      size_t n = length, at = 0;
      int version = h[3];
      if (version < 4 && (h[5] & 128))
        n = tag_unsync(data, n);
      if (h[5] & 64) {
        if (version == 2)
          at = n;
        else if (n < 4)
          at = n;
        else {
          uint32_t ext = 0;
          if (version == 3) {
            ext = tag_be32(data);
            if (ext > n - 4)
              at = n;
            else
              at = ext + 4;
          } else if (!tag_sync(data, &ext) || ext < 6 || ext > n)
            at = n;
          else
            at = ext;
        }
      }
      size_t header = version == 2 ? 6 : 10;
      while (at <= n && n - at >= header && data[at]) {
        size_t idlen = version == 2 ? 3 : 4;
        bool valid = true;
        for (size_t i = 0; i < idlen; i++)
          if (!((data[at + i] >= 'A' && data[at + i] <= 'Z') ||
                (data[at + i] >= '0' && data[at + i] <= '9')))
            valid = false;
        if (!valid)
          break;
        char id[5] = {0};
        memcpy(id, data + at, idlen);
        uint32_t size;
        if (version == 2)
          size = (uint32_t)data[at + 3] << 16 | (uint32_t)data[at + 4] << 8 |
                 data[at + 5];
        else if (version == 3)
          size = tag_be32(data + at + 4);
        else if (!tag_sync(data + at + 4, &size))
          break;
        unsigned flags = version == 2 ? 0 : data[at + 9];
        at += header;
        if (size > n - at)
          break;
        unsigned char *frame = data + at;
        size_t count = size;
        at += size;
        if (!count || (version == 3 && (flags & 0xc0)) ||
            (version == 4 && (flags & 0x0c)))
          continue;
        if (version == 4 && ((flags & 2) || (h[5] & 128)))
          count = tag_unsync(frame, count);
        if ((version == 3 && (flags & 0x20)) ||
            (version == 4 && (flags & 0x40))) {
          if (!count)
            continue;
          frame++;
          count--;
        }
        if (version == 4 && (flags & 1)) {
          if (count < 4)
            continue;
          frame += 4;
          count -= 4;
        }
        tag_frame(t, id, frame, count, version == 2);
      }
    }
    free(data);
  }
  unsigned char v1[128];
  if (!fseek(f, -128, SEEK_END) && fread(v1, 1, 128, f) == 128 &&
      !memcmp(v1, "TAG", 3)) {
    if (!t->title[0])
      tag_text(v1 + 3, 30, 0, t->title, 512);
    if (!t->artist[0])
      tag_text(v1 + 33, 30, 0, t->artist, 512);
    if (!t->album[0])
      tag_text(v1 + 63, 30, 0, t->album, 512);
  }
  fclose(f);
}
