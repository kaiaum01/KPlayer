#!/bin/bash
# Script de jogo PortMaster / R36S
XDG_DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}
GAMEDIR="/roms/ports/demo_port"
export SDL_GAMECONTROLLERCONFIG_FILE="$GAMEDIR/gamecontrollerdb.txt"
cd "$GAMEDIR"
$ESUDO chmod 666 /dev/uinput
./game_arm64 --fullscreen
