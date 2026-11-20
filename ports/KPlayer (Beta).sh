#!/bin/bash
# K PLAYER 1.0.0 - dArkOS / Debian 13 ARM64 / PortMaster
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
GAMEDIR="$script_dir/kplayer"
cd "$GAMEDIR" || exit 1
exec > "$GAMEDIR/log.txt" 2>&1
printf 'K PLAYER nativo 1.0.0\n'
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
controlfolder=""
for candidate in /opt/system/Tools/PortMaster /opt/tools/PortMaster "$XDG_DATA_HOME/PortMaster" "$script_dir/PortMaster" /roms/ports/PortMaster; do
    if [ -f "$candidate/control.txt" ]; then controlfolder="$candidate"; break; fi
done
if [ -z "$controlfolder" ]; then
    printf 'PortMaster/control.txt nao encontrado.\n'; exit 1
fi
source "$controlfolder/control.txt"
if [ -n "${CFW_NAME:-}" ] && [ -f "$controlfolder/mod_${CFW_NAME}.txt" ]; then
    source "$controlfolder/mod_${CFW_NAME}.txt"
fi
get_controls
if [ -n "${sdl_controllerconfig:-}" ]; then export SDL_GAMECONTROLLERCONFIG="$sdl_controllerconfig"; fi
if [ -z "${GPTOKEYB:-}" ]; then printf 'GPTOKEYB nao foi definido pelo PortMaster.\n'; exit 1; fi
# Motor VLC 3.0.23 recompilado para este port; codecs/plugins do Debian 13.
unset PYTHON_VLC_LIB_PATH
export LD_LIBRARY_PATH="$GAMEDIR/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export VLC_PLUGIN_PATH="/usr/lib/aarch64-linux-gnu/vlc/plugins"
export VLC_DATA_PATH="/usr/share/vlc"
cleanup() {
    if [ -n "${mapper_pid:-}" ]; then kill "$mapper_pid" 2>/dev/null || true; wait "$mapper_pid" 2>/dev/null || true; fi
    if command -v systemctl >/dev/null 2>&1; then $ESUDO systemctl restart oga_events 2>/dev/null || true; fi
    if [ -w /dev/tty0 ]; then printf '\033c' > /dev/tty0; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
chmod +x ./kplayer
./kplayer --check || exit 1
$GPTOKEYB "kplayer" -c "$GAMEDIR/kplayer.gptk" &
mapper_pid=$!
./kplayer
result=$?
printf 'K PLAYER finalizado: codigo %s\n' "$result"
exit "$result"
