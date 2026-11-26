#!/bin/bash
# KPlayer v2.1.6 - dArkOS / Debian 13 ARM64 / PortMaster
KPLAYER_VERSION="2.1.6"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
GAMEDIR="$script_dir/kplayer"
cd "$GAMEDIR" || exit 1
exec > "$GAMEDIR/log.txt" 2>&1
printf 'K PLAYER v%s nativo\n' "$KPLAYER_VERSION"
# Remove atalhos versionados antigos (KPlayer v*.sh) caso KPlayer.sh esteja ativo
if [ "$(basename -- "$0")" = "KPlayer.sh" ] && [ -f "$script_dir/KPlayer.sh" ]; then
    for old_sh in "$script_dir"/KPlayer\ v*.sh; do
        [ -f "$old_sh" ] && rm -f "$old_sh" 2>/dev/null || true
    done
fi
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
controlfolder=""
for candidate in /opt/system/Tools/PortMaster /opt/tools/PortMaster "$XDG_DATA_HOME/PortMaster" "$script_dir/PortMaster" /roms/ports/PortMaster /roms2/ports/PortMaster; do
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
if [ -n "${DISPLAY_WIDTH:-}" ]; then export KPLAYER_DISPLAY_W="$DISPLAY_WIDTH"; fi
if [ -n "${DISPLAY_HEIGHT:-}" ]; then export KPLAYER_DISPLAY_H="$DISPLAY_HEIGHT"; fi
if [ -n "${DEVICE_NAME:-}" ]; then export KPLAYER_DEVICE="$DEVICE_NAME"; fi
if [ -z "${GPTOKEYB:-}" ]; then printf 'GPTOKEYB nao foi definido pelo PortMaster.\n'; exit 1; fi
# Motor VLC 3.0.23 recompilado para este port; codecs/plugins do Debian 13.
unset PYTHON_VLC_LIB_PATH
export KPLAYER_GAMEDIR="$GAMEDIR"
export KPLAYER_ORIG_LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"
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
chmod +x ./kplayer ./updater.py ./iptv_fetch.py ./football_fetch.py ./weather_fetch.py ./news_fetch.py ./file_ops.py ./bg_audio.py ./pdf_ops.py ./7zzs 2>/dev/null || true
# Se o audio em 2o plano estiver rodando no EmulationStation, encerra suavemente para o KPlayer assumir o controle
python3 "$GAMEDIR/bg_audio.py" stop-daemon --keep-es-mute >/dev/null 2>&1 || true
./kplayer --check || exit 1
$GPTOKEYB "kplayer" -c "$GAMEDIR/kplayer.gptk" &
mapper_pid=$!
while true; do
    chmod +x ./kplayer ./updater.py ./iptv_fetch.py ./football_fetch.py ./weather_fetch.py ./news_fetch.py ./file_ops.py ./bg_audio.py ./pdf_ops.py ./7zzs 2>/dev/null || true
    ./kplayer
    result=$?
    if [ "$result" -eq 42 ]; then
        printf 'K PLAYER atualizado com sucesso — reiniciando automaticamente...\n'
        if [ -n "${mapper_pid:-}" ]; then kill "$mapper_pid" 2>/dev/null || true; wait "$mapper_pid" 2>/dev/null || true; fi
        trap - EXIT
        sleep 1
        if [ -f "$script_dir/KPlayer.sh" ]; then
            exec bash "$script_dir/KPlayer.sh"
        fi
        # Fallback seguro caso KPlayer.sh tenha sido movido: reinicia diretamente o binario
        trap cleanup EXIT
        $GPTOKEYB "kplayer" -c "$GAMEDIR/kplayer.gptk" &
        mapper_pid=$!
        continue
    fi
    if [ "$result" -eq 43 ] && [ -f "$GAMEDIR/.bg-launch.json" ]; then
        printf 'K PLAYER iniciando alvo externo com retorno automatico...\n'
        if [ -n "${mapper_pid:-}" ]; then kill "$mapper_pid" 2>/dev/null || true; wait "$mapper_pid" 2>/dev/null || true; mapper_pid=""; fi
        python3 "$GAMEDIR/bg_audio.py" run "$GAMEDIR/.bg-launch.json" || true
        rm -f "$GAMEDIR/.bg-launch.json" 2>/dev/null || true
        $GPTOKEYB "kplayer" -c "$GAMEDIR/kplayer.gptk" &
        mapper_pid=$!
        continue
    fi
    if [ "$result" -eq 44 ] && [ -f "$GAMEDIR/.bg-daemon.json" ]; then
        printf 'K PLAYER mantendo audio em 2o plano no EmulationStation (L3 + R3)...\n'
        if [ -n "${mapper_pid:-}" ]; then kill "$mapper_pid" 2>/dev/null || true; wait "$mapper_pid" 2>/dev/null || true; mapper_pid=""; fi
        python3 "$GAMEDIR/bg_audio.py" start-daemon "$GAMEDIR/.bg-daemon.json" || true
        rm -f "$GAMEDIR/.bg-daemon.json" 2>/dev/null || true
        result=0
        break
    fi
    # Saida normal com 2o plano desativado: garante que a musica do EmulationStation seja restaurada
    python3 "$GAMEDIR/bg_audio.py" stop-daemon >/dev/null 2>&1 || true
    break
done
printf 'K PLAYER finalizado: codigo %s\n' "$result"
exit "$result"
