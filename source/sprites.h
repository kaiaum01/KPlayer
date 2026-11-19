/* Optional player art atlases. Runtime requires only SDL2 and stb_image,
 * both already used by the native KPlayer. Falls back to vector UI if absent.
 * Grid sizes and glyph indices are documented in ports/kplayer/sprites/README.txt.
 */
enum { KP_SPR_CONTROLS=0, KP_SPR_CATEGORIES=1, KP_SPR_BUTTONS=2 };
enum { KP_PLAY=0, KP_PAUSE=1, KP_PREV=2, KP_REWIND=3, KP_FORWARD=4,
       KP_NEXT=5, KP_SHUFFLE=6, KP_REPEAT=7, KP_HEART=8,
       KP_HEART_ON=9, KP_VOLUME=10, KP_VOLUME_LOW=11,
       KP_VOLUME_HIGH=12, KP_MUTE=13, KP_LIST=14,
       KP_SCREEN=15, KP_FULLSCREEN=16 };
static SDL_Texture *kp_atlases[3];
static SDL_Rect kp_category_bounds[7][6];
static int kp_sprite_palette = 0;
static const int kp_sprite_cols[3] = {17, 6, 15};
static const int kp_sprite_cell[3] = {48, 76, 64};
/* Theme order: green Spotify, white, black, dark green, blue, purple, red. */
static const int kp_sprite_theme_rows[7] = {3, 0, 1, 2, 4, 5, 6};
static void kp_sprites_load(void) {
  static const char *names[3] = {
    "sprites/controles.png", "sprites/categorias.png", "sprites/botoes.png"
  };
  for (int i=0;i<3;i++) {
    int w=0, h=0, channels=0;
    unsigned char *pixels=stbi_load(names[i], &w, &h, &channels, 4);
    int cell=kp_sprite_cell[i];
    if (!pixels) continue;
    if (w==kp_sprite_cols[i]*cell && h==7*cell) {
      if (i == KP_SPR_CATEGORIES) {
        for (int row = 0; row < 7; row++) for (int col = 0; col < 6; col++) {
          int minx=cell, miny=cell, maxx=-1, maxy=-1;
          for (int py=0; py<cell; py++) for (int px=0; px<cell; px++) {
            if (pixels[((row*cell+py)*w+col*cell+px)*4+3] > 32) {
              if (px<minx) minx=px;
              if (px>maxx) maxx=px;
              if (py<miny) miny=py;
              if (py>maxy) maxy=py;
            }
          }
          if (maxx>=minx && maxy>=miny)
            kp_category_bounds[row][col]=(SDL_Rect){col*cell+minx,row*cell+miny,maxx-minx+1,maxy-miny+1};
        }
      }
      SDL_Texture *tex=SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                         SDL_TEXTUREACCESS_STATIC, w, h);
      if (tex) {
        if (SDL_UpdateTexture(tex, NULL, pixels, w*4)==0) {
          SDL_SetTextureBlendMode(tex, SDL_BLENDMODE_BLEND);
          kp_atlases[i]=tex;
        } else SDL_DestroyTexture(tex);
      }
    }
    stbi_image_free(pixels);
  }
}
static bool kp_sprite(int atlas, int id, int x, int y, int w, int h) {
  if (atlas<0 || atlas>=3 || id<0 || id>=kp_sprite_cols[atlas] ||
      w<=0 || h<=0 || !kp_atlases[atlas]) return false;
  int cell=kp_sprite_cell[atlas];
  int palette=kp_sprite_palette;
  if (palette<0 || palette>=7) palette=0;
  SDL_Rect source={id*cell,kp_sprite_theme_rows[palette]*cell,cell,cell};
  SDL_Rect dest={x,y,w,h};
  if (atlas == KP_SPR_CATEGORIES) {
    SDL_Rect bounds=kp_category_bounds[kp_sprite_theme_rows[palette]][id];
    if (bounds.w > 0 && bounds.h > 0) {
      source=bounds;
      if ((long long)w*bounds.h > (long long)h*bounds.w) dest.w=h*bounds.w/bounds.h;
      else dest.h=w*bounds.h/bounds.w;
      dest.x=x+(w-dest.w)/2; dest.y=y+(h-dest.h)/2;
    }
  }
  SDL_RenderCopy(renderer,kp_atlases[atlas],&source,&dest);
  return true;
}
static void kp_sprites_free(void) {
  for (int i=0;i<3;i++) {
    if (kp_atlases[i]) SDL_DestroyTexture(kp_atlases[i]);
    kp_atlases[i]=NULL;
  }
}
