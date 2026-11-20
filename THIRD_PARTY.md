# Third-party notices

KPlayer's original interface code is GPL-2.0-or-later, as marked in its source. This repository preserves the licenses and notices of third-party components.

| Component | Role | License / notice |
| --- | --- | --- |
| VLC / VideoLAN 3.0.23 | Rebuilt libVLC and core; original source archive included | Original per-file licenses; LGPL 2.1-or-later for the libVLC/core code used; GPL components retain their terms. See original archive and `ports/kplayer/licencas/` |
| SDL2 | System-provided rendering, events and public development headers | zlib license; `ports/kplayer/licencas/SDL.txt` |
| stb_image / stb_truetype | Image decoding and font rasterization | MIT or public-domain dual license; header notices and `ports/kplayer/licencas/stb.txt` |
| Inter | Bundled interface font | SIL Open Font License 1.1; `ports/kplayer/licencas/Inter-OFL.txt` |
| ip-api.com | Optional approximate city/state and UTC offset lookup from the public IP | External service; the free endpoint requires no key, uses HTTP and is limited to non-commercial use under the provider's current terms |
| Radio Browser | Online radio directory, filters and resolved station stream URLs | Free/open-source community service; station streams remain third-party content subject to each broadcaster's availability and terms |
| libVLC for Android 3.7.7 | Android audio, video and stream playback | VideoLAN LGPL terms; downloaded by Gradle during the local Android Studio build and not bundled in the source archive |

The modified VLC engine defaults to the K PLAYER application identity and uses the Debian `3_0_0ft64` plugin ABI. Changes are recorded in `patches/kplayer-vlc.patch`. It is not represented as an unmodified upstream engine. The original source archive is `upstream/vlc-3.0.23.tar.xz`.

Device codecs/plugins, SDL2 and ALSA shared libraries are supplied by the target operating system and are not repackaged here. No affiliation with or endorsement by VideoLAN or the PortMaster team is claimed.

The public banner and screenshot fixture text were created for KPlayer. Screenshots contain original illustrative data and a generated colour scene, not third-party album artwork or commercial media. The uploaded music sample used privately for metadata validation is not part of this repository.

Original sources:

- https://code.videolan.org/videolan/vlc
- https://download.videolan.org/pub/videolan/vlc/3.0.23/vlc-3.0.23.tar.xz
- https://github.com/libsdl-org/SDL/tree/release-2.32.4
- https://github.com/nothings/stb
- https://github.com/google/fonts/tree/main/ofl/inter
- https://ip-api.com/docs/api:json
- https://api.radio-browser.info/

The in-app usage notices do not replace or restrict the rights granted by component licenses.
