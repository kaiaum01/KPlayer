/* UTF-8 interface translations. Never applied to user media text. */
static int language = 0;
static bool onboarding_done = false;
static const char *language_names[] = {"Português (BR)", "English", "Español"};
static const char *preferences_path = "preferences.cfg";
typedef struct {
  const char *pt, *en, *es;
} Translation;
static const Translation translations[] = {
    {"Seu som.", "Your sound.", "Tu sonido."},
    {"Sua tela.", "Your screen.", "Tu pantalla."},
    {"Músicas, vídeos, rádios e TV ao vivo num player só.", "Music, videos, radio and live TV in one player.", "Música, videos, radio y TV en vivo en un solo reproductor."},
    {"TOCANDO AGORA", "NOW PLAYING", "SONANDO AHORA"},
    {"PAUSADO", "PAUSED", "EN PAUSA"},
    {"NADA TOCANDO", "NOTHING PLAYING", "NADA SONANDO"},
    {"Placar da Bola", "Placar da Bola", "Placar da Bola"},
    {"PLACAR DA BOLA", "PLACAR DA BOLA", "PLACAR DA BOLA"},
    {"Placar ao vivo", "Live scores", "Marcador en vivo"},
    {"Jogos e estatísticas", "Matches & stats", "Partidos y stats"},
    {"Estatísticas", "Statistics", "Estadísticas"},
    {"Eventos", "Events", "Eventos"},
    {"Escalações", "Lineups", "Alineaciones"},
    {"Detalhes", "Details", "Detalles"},
    {"Filtro", "Filter", "Filtro"},
    {"Ao vivo", "Live", "En vivo"},
    {"Europa", "Europe", "Europa"},
    {"Abas / Rolar", "Tabs / Scroll", "Pestañas / Desplazar"},
    {"Carregando estatísticas...", "Loading match stats...", "Cargando estadísticas..."},
    {"Estatísticas disponíveis quando a partida iniciar", "Statistics available once the match begins", "Estadísticas disponibles al iniciar el partido"},
    {"Nenhum evento registrado ainda", "No events recorded yet", "Aún no hay eventos registrados"},
    {"Escalações ainda não divulgadas", "Lineups not announced yet", "Alineaciones aún no publicadas"},
    {"B para estatísticas, eventos e escalações", "B for stats, events and lineups", "B para estadísticas, eventos y alineaciones"},
    {"Iniciando K PLAYER", "Starting K PLAYER", "Iniciando K PLAYER"},
    {"Carregando biblioteca de mídias", "Loading media library", "Cargando biblioteca multimedia"},
    {"Preparando rádios, IPTV e Placar da Bola", "Preparing radio, IPTV & Placar da Bola", "Preparando radios, IPTV y Placar da Bola"},
    {"Tudo pronto!", "All set!", "¡Todo listo!"},
    {"arquivos", "files", "archivos"},
    {"Futebol", "Football", "Fútbol"},
    {"FUTEBOL", "FOOTBALL", "FÚTBOL"},
    {"Jogos ao vivo", "Live matches", "Partidos en vivo"},
    {"Carregando placares...", "Loading scores...", "Cargando marcadores..."},
    {"Nenhum jogo ao vivo", "No live matches", "No hay partidos en vivo"},
    {"Não foi possível atualizar placares", "Could not refresh scores", "No se pudieron actualizar marcadores"},
    {"Sem dados atualizados", "No up-to-date data", "Sin datos actualizados"},
    {"Dados salvos; podem estar desatualizados", "Cached data may be outdated", "Datos guardados; pueden estar desactualizados"},
    {"Canais ao vivo", "Live channels", "Canales en vivo"},
    {"TV Online", "Online TV", "TV en línea"},
    {"Sem imagem", "No image", "Sin imagen"},
    {"Categoria", "Category", "Categoría"},
    {"Canais", "Channels", "Canales"},
    {"Filmes", "Movies", "Películas"},
    {"Séries", "Series", "Series"},
    {"Usuário", "User", "Usuario"},
    {"IPTV do Usuário", "User IPTV", "IPTV del usuario"},
    {"Filmes e séries", "Movies & series", "Películas y series"},
    {"Carregando lista...", "Loading playlist...", "Cargando lista..."},
    {"Carregando categorias...", "Loading categories...", "Cargando categorías..."},
    {"Carregando episódios...", "Loading episodes...", "Cargando episodios..."},
    {"Nenhum episódio encontrado", "No episodes found", "No se encontraron episodios"},
    {"Nenhum item encontrado", "No items found", "No se encontraron elementos"},
    {"Alternar", "Switch", "Cambiar"},
    {"Assistir", "Watch", "Ver"},
    {"Episódios", "Episodes", "Episodios"},
    {"Temporada", "Season", "Temporada"},
    {"Teclado", "Keyboard", "Teclado"},
    {"Teclado IPTV", "IPTV Keyboard", "Teclado IPTV"},
    {"+ Adicionar URL pelo teclado", "+ Add URL with keyboard", "+ Añadir URL con teclado"},
    {"Digite o link da playlist (.m3u / .m3u8)", "Type the playlist link (.m3u / .m3u8)", "Escribe el enlace de la lista (.m3u / .m3u8)"},
    {"Pasta iptv_usuario/ + Teclado", "iptv_usuario/ folder + Keyboard", "Carpeta iptv_usuario/ + Teclado"},
    {"Coloque arquivos .m3u/.m3u8 em iptv_usuario/", "Place .m3u/.m3u8 files in iptv_usuario/", "Pon archivos .m3u/.m3u8 en iptv_usuario/"},
    {"Lista salva com sucesso", "Playlist saved", "Lista guardada"},
    {"URL inválida (use http:// ou https://)", "Invalid URL (use http:// or https://)", "URL inválida (usa http:// o https://)"},
    {"Inserir", "Insert", "Insertar"},
    {"Apagar", "Delete", "Borrar"},
    {"Lista indisponível; usando cache", "List unavailable; using cache", "Lista no disponible; usando caché"},
    {"Canal sem fluxo direto compatível", "No compatible direct stream", "Sin flujo directo compatible"},
    {"API indisponível; usando lista salva", "API unavailable; using saved list", "API no disponible; usando lista guardada"},
    {"Pressione Y para atualizar", "Press Y to refresh", "Pulse Y para actualizar"},
    {"Atualizando canais...", "Updating channels...", "Actualizando canales..."},
    {"Cima/Baixo Navegar   B Assistir   X Fonte   Y Atualizar   A Voltar", "Up/Down Browse   B Watch   X Source   Y Refresh   A Back", "Arriba/Abajo Navegar   B Ver   X Fuente   Y Actualizar   A Volver"},
    {"Reprodução", "Playback", "Reproducción"},
    {"Biblioteca", "Library", "Biblioteca"},
    {"Geral", "General", "General"},
    {"Alterar", "Change", "Cambiar"},
    {"Categorias", "Categories", "Categorías"},
    {"Fechar", "Close", "Cerrar"},
    {"Navegar", "Browse", "Navegar"},
    {"Ouvir", "Play", "Escuchar"},
    {"Favorita", "Favorite", "Favorita"},
    {"Atualizar", "Refresh", "Actualizar"},
    {"Início", "Home", "Inicio"},
    {"Pausa", "Pause", "Pausa"},
    {"Player", "Player", "Reproductor"},
    {"Fechar opções", "Close settings", "Cerrar ajustes"},
    {"IPTV", "IPTV", "IPTV"},
    {"Atualizando Free-TV...", "Updating Free-TV...", "Actualizando Free-TV..."},
    {"Free-TV indisponível; usando lista salva", "Free-TV unavailable; using saved list", "Free-TV no disponible; usando lista guardada"},
    {"Não foi possível abrir o canal", "Could not open channel", "No se pudo abrir el canal"},
    {"Canais IPTV", "IPTV channels", "Canales IPTV"},
    {"Nenhum canal encontrado", "No channels found", "No se encontraron canales"},
    {"Coloque listas M3U/M3U8 em ports/kplayer/iptv", "Place M3U/M3U8 lists in ports/kplayer/iptv", "Ponga listas M3U/M3U8 en ports/kplayer/iptv"},
    {"Cima/Baixo Navegar   B Assistir   Y Atualizar   A Voltar", "Up/Down Browse   B Watch   Y Refresh   A Back", "Arriba/Abajo Navegar   B Ver   Y Actualizar   A Volver"},
    {"Conectando canal...", "Connecting channel...", "Conectando canal..."},
    {"Favoritas", "Favorites", "Favoritas"},
    {"Nenhuma rádio favorita", "No favorite stations", "Sin radios favoritas"},
    {"Favorita atualizada", "Favorite updated", "Favorita actualizada"},
    {"Direcional Navegar   B Ouvir   X Favorita   Y Atualizar   A Início   SELECT Opções", "D-pad Browse   B Play   X Favorite   Y Refresh   A Home   SELECT Settings", "Cruceta Navegar   B Oír   X Favorita   Y Actualizar   A Inicio   SELECT Ajustes"},
    {"Rádio indisponível", "Radio unavailable", "Radio no disponible"},
    {"Tentando reconectar rádio...", "Trying to reconnect radio...", "Intentando reconectar la radio..."},
    {"Reconectando...", "Reconnecting...", "Reconectando..."},
    {"Timer de sono", "Sleep timer", "Temporizador"},
    {"Equalizador", "Equalizer", "Ecualizador"},
    {"Equalizador indisponível", "Equalizer unavailable", "Ecualizador no disponible"},
    {"Retomar mídia", "Resume media", "Reanudar archivo"},
    {"Nenhuma mídia para retomar", "No media to resume", "No hay archivo para reanudar"},
    {"Playlist vazia ou inválida", "Playlist empty or invalid", "Lista vacía o inválida"},
    {"Minhas favoritas", "My favorites", "Mis favoritas"},
    {"Nenhuma favorita encontrada", "No favorites found", "No se encontraron favoritas"},
    {"Modo de repetição", "Repeat mode", "Modo de repetición"},
    {"Repetir faixa", "Repeat track", "Repetir pista"},
    {"Repetir fila", "Repeat queue", "Repetir cola"},
    {"Aleatório", "Shuffle", "Aleatorio"},
    {"A Cancelar", "A Cancel", "A Cancelar"},
    {"A Cancelar busca", "A Cancel scan", "A Cancelar búsqueda"},
    {"Busca cancelada", "Scan cancelled", "Búsqueda cancelada"},
    {"Localização por IP", "IP location", "Ubicación por IP"},
    {"Sim", "Yes", "Sí"},
    {"Não", "No", "No"},
    {"Aguarde...", "Please wait...", "Espere..."},
    {"B Continuar", "B Continue", "B Continuar"},
    {"Tema", "Theme", "Tema"},
    {"Preto e verde", "Black and green", "Negro y verde"},
    {"Preto e branco", "Black and white", "Negro y blanco"},
    {"Branco e preto", "White and black", "Blanco y negro"},
    {"Verde e preto", "Green and black", "Verde y negro"},
    {"Preto e azul", "Black and blue", "Negro y azul"},
    {"Preto e roxo", "Black and purple", "Negro y morado"},
    {"Preto e vermelho", "Black and red", "Negro y rojo"},
    {"Carregando músicas", "Loading music", "Cargando música"},
    {"Carregando vídeos", "Loading videos", "Cargando vídeos"},
    {"Carregando arquivos", "Loading files", "Cargando archivos"},
    {"Aguarde, procurando arquivos...", "Please wait, searching files...", "Espere, buscando archivos..."},
    {"Arquivos encontrados", "Files found", "Archivos encontrados"},
    {"Fila / Pasta", "Queue / Folder", "Cola / Carpeta"},
    {"Pastas: /roms(2)/bgmusic e /roms(2)/videos",
     "Folders: /roms(2)/bgmusic & /roms(2)/videos",
     "Carpetas: /roms(2)/bgmusic y /roms(2)/videos"},
    {"Nenhuma mídia acima de 50 KB encontrada", "No media over 50 KB found",
     "No se encontraron medios de más de 50 KB"},
    {"Sair do KPlayer", "Exit KPlayer", "Salir de KPlayer"},
    {"Esquerda/direita ou B para alterar", "Left/right or B to change",
     "Izquierda/derecha o B para cambiar"},
    {"A Voltar    SELECT Fechar opções", "A Back    SELECT Close settings",
     "A Volver    SELECT Cerrar ajustes"},
    {"Direcional Navegar   B Abrir   X Player   Y/SELECT Opções   START Pausa",
     "D-pad Navigate   B Open   X Player   Y/SELECT Settings   START Pause",
     "Cruceta Navegar   B Abrir   X Player   Y/SELECT Ajustes   START Pausa"},
    {"B Abrir   A Início   Esq/Dir Filtro   X Player   Y Atualizar   SELECT "
     "Opções",
     "B Open   A Home   Left/Right Filter   X Player   Y Refresh   SELECT "
     "Settings",
     "B Abrir   A Inicio   Izq/Der Filtro   X Player   Y Actualizar   SELECT "
     "Ajustes"},
    {"B Abrir   A Voltar   Esq/Dir Filtro   X Player   Y Atualizar   SELECT "
     "Opções",
     "B Open   A Back   Left/Right Filter   X Player   Y Refresh   SELECT "
     "Settings",
     "B Abrir   A Volver   Izq/Der Filtro   X Player   Y Actualizar   SELECT "
     "Ajustes"},
    {"A volta. Esquerda/direita muda o filtro. Y atualiza.",
     "A goes back. Left/right changes filter. Y refreshes.",
     "A vuelve. Izquierda/derecha cambia el filtro. Y actualiza."},
    {"B  Reproduzir", "B  Play", "B  Reproducir"},
    {"A  Voltar", "A  Back", "A  Volver"},
    {"SELECT Opções", "SELECT Settings", "SELECT Ajustes"},
    {"B / START Pausa   Esq/Dir 10s   X Ocultar   A Voltar   SELECT Opções",
     "B / START Pause   Left/Right 10s   X Hide   A Back   SELECT Settings",
     "B / START Pausa   Izq/Der 10s   X Ocultar   A Volver   SELECT Ajustes"},
    {"B  Iniciar K PLAYER", "B  Start K PLAYER", "B  Iniciar K PLAYER"},
    {"Direcional: idioma    B: iniciar    SELECT: opções",
     "D-pad: language    B: start    SELECT: settings",
     "Cruceta: idioma    B: iniciar    SELECT: ajustes"},
    {"A Voltar    Esquerda/Direita Páginas", "A Back    Left/Right Pages",
     "A Volver    Izquierda/Derecha Páginas"},
    {"Favoritar faixa", "Favorite track", "Marcar favorita"},
    {"A Tocar/Pausar   START Pausa   B Voltar   L1/R1 Faixa   L2/R2 Volume",
     "A Play/Pause   START Pause   B Back   L1/R1 Track   L2/R2 Volume",
     "A Reproducir/Pausa   START Pausa   B Volver   L1/R1 Pista   L2/R2 "
     "Volumen"},
    {"Letras", "Lyrics", "Letras"},
    {"Fila", "Queue", "Cola"},
    {"Pasta sem músicas", "No music in this folder", "Carpeta sin música"},
    {"Fila vazia", "Empty queue", "Cola vacía"},
    {"Em reprodução", "Now playing", "En reproducción"},
    {"A  Reproduzir", "A  Play", "A  Reproducir"},
    {"LETRAS SINCRONIZADAS", "SYNCED LYRICS", "LETRAS SINCRONIZADAS"},
    {"LETRAS EMBUTIDAS", "EMBEDDED LYRICS", "LETRAS INTEGRADAS"},
    {"LETRAS", "LYRICS", "LETRAS"},
    {"Aguardando a letra...", "Waiting for lyrics...", "Esperando la letra..."},
    {"%d faixas na fila", "%d tracks in queue", "%d pistas en la cola"},
    {"X Painel   A Tocar/Pausar   START Pausa   B Voltar   L1/R1 Faixa   L2/R2 "
     "Volume",
     "X Panel   A Play/Pause   START Pause   B Back   L1/R1 Track   L2/R2 "
     "Volume",
     "X Panel   A Reproducir/Pausa   START Pausa   B Volver   L1/R1 Pista   "
     "L2/R2 Volumen"},
    {"B Voltar    SELECT Sair", "B Back    SELECT Exit",
     "B Volver    SELECT Salir"},
    {"Central de Mídia Portátil", "Portable Media Center",
     "Centro multimedia portátil"},
    {"Sua biblioteca. Seu ritmo. Em qualquer lugar.",
     "Your library. Your rhythm. Anywhere.",
     "Tu biblioteca. Tu ritmo. Donde quieras."},
    {"Músicas", "Music", "Música"},
    {"Vídeos", "Videos", "Vídeos"},
    {"Arquivos", "Files", "Archivos"},
    {"Rádio Online", "Online Radio", "Radio Online"},
    {"Estações do mundo", "Stations worldwide", "Emisoras del mundo"},
    {"ao vivo pela internet.", "live over the internet.",
     "en vivo por internet."},
    {"Radio Browser", "Radio Browser", "Radio Browser"},
    {"Sua trilha sonora,", "Your soundtrack,", "Tu banda sonora,"},
    {"com letras em sincronia.", "with synced lyrics.",
     "con letras sincronizadas."},
    {"Cinema na palma", "Cinema in the palm", "El cine en la palma"},
    {"da sua mão.", "of your hand.", "de tu mano."},
    {"Explore as pastas", "Explore the folders", "Explora las carpetas"},
    {"do seu cartão SD.", "on your SD card.", "de tu tarjeta SD."},
    {"LRC Sync", "LRC Sync", "LRC Sync"},
    {"Ocultar auto.", "Auto-Hide", "Autoocultar"},
    {"Mídias locais", "Local media", "Medios locales"},
    {"Abrir biblioteca", "Open library", "Abrir biblioteca"},
    {"Pronto para dar o play", "Ready to play", "Listo para reproducir"},
    {"Reprodução local", "Local playback", "Reproducción local"},
    {"Abra Músicas ou Vídeos para começar",
     "Open Music or Videos to get started",
     "Abre Música o Vídeos para empezar"},
    {"DASHBOARD", "HOME", "INICIO"},
    {"BIBLIOTECA", "LIBRARY", "BIBLIOTECA"},
    {"MÚSICAS", "MUSIC", "MÚSICA"},
    {"VÍDEOS", "VIDEOS", "VÍDEOS"},
    {"OPÇÕES", "SETTINGS", "AJUSTES"},
    {"RÁDIO ONLINE", "ONLINE RADIO", "RADIO ONLINE"},
    {"Estações ao vivo pela internet", "Live stations over the internet",
     "Emisoras en vivo por internet"},
    {"Estações", "Stations", "Emisoras"},
    {"Estação online", "Online station", "Emisora online"},
    {"Internet", "Internet", "Internet"},
    {"AO VIVO", "LIVE", "EN VIVO"},
    {"Transmitindo agora", "Streaming now", "Transmitiendo ahora"},
    {"B  Ouvir estação", "B  Play station", "B  Reproducir emisora"},
    {"Brasil", "Brazil", "Brasil"},
    {"Mais ouvidas", "Popular", "Populares"},
    {"Rádio do Usuário", "User Radio", "Radio del usuario"},
    {"Nenhuma rádio do usuário", "No user radios", "No hay radios del usuario"},
    {"Notícias", "News", "Noticias"},
    {"Buscando estações...", "Loading stations...",
     "Buscando emisoras..."},
    {"Nenhuma estação encontrada", "No stations found",
     "No se encontraron emisoras"},
    {"Sem conexão ou nenhuma estação encontrada",
     "Offline or no stations found", "Sin conexión o no hay emisoras"},
    {"Pressione Y para tentar novamente", "Press Y to try again",
     "Pulsa Y para intentarlo de nuevo"},
    {"estações", "stations", "emisoras"},
    {" • tocando ao vivo", " • live", " • en vivo"},
    {"Cima/Baixo Estação   Esq/Dir Categoria   B Ouvir/Pausar   A Início   "
     "Y Atualizar   SELECT Opções",
     "Up/Down Station   Left/Right Category   B Play/Pause   A Home   Y Refresh   "
     "SELECT Settings",
     "Arriba/Abajo Emisora   Izq/Der Categoría   B Reproducir/Pausa   A Inicio   "
     "Y Actualizar   SELECT Ajustes"},
    {"Escolha o local das suas mídias", "Choose your media location",
     "Elige la ubicación de tus archivos"},
    {"Todos", "All", "Todos"},
    {"Mídias do K PLAYER", "K PLAYER media", "Medios de K PLAYER"},
    {"Cartão /roms", "Card /roms", "Tarjeta /roms"},
    {"Cartão /roms2", "Card /roms2", "Tarjeta /roms2"},
    {"Músicas (SD1)", "Music (SD1)", "Música (SD1)"},
    {"Músicas (SD2)", "Music (SD2)", "Música (SD2)"},
    {"Vídeos (SD1)", "Videos (SD1)", "Vídeos (SD1)"},
    {"Vídeos (SD2)", "Videos (SD2)", "Vídeos (SD2)"},
    {"Sistema /", "System /", "Sistema /"},
    {"Explorar dispositivo", "Browse device", "Explorar dispositivo"},
    {"Todos os canais", "All channels", "Todos los canales"},
    {"Escolha a categoria", "Choose a category", "Elige una categoría"},
    {"Nenhum canal nesta categoria", "No channels in this category", "No hay canales en esta categoría"},
    {"Abrir", "Open", "Abrir"},
    {"Indisponível", "Unavailable", "No disponible"},
    {"Selecione um local. Y verifica novamente os cartões.",
     "Choose a location. Y checks the cards again.",
     "Elige una ubicación. Y comprueba las tarjetas."},
    {"Pasta", "Folder", "Carpeta"},
    {"Explorar pasta", "Browse folder", "Explorar carpeta"},
    {"Áudio", "Audio", "Audio"},
    {"Vídeo", "Video", "Vídeo"},
    {"Nenhuma mídia neste filtro", "No media matches this filter",
     "No hay archivos con este filtro"},
    {"B volta. Esquerda/direita muda o filtro. Y atualiza.",
     "B goes back. Left/right changes filter. Y refreshes.",
     "B vuelve. Izquierda/derecha cambia el filtro. Y actualiza."},
    {"%d / %d itens", "%d / %d items", "%d / %d elementos"},
    {"Y  Favorita", "Y  Favorite", "Y  Favorita"},
    {"Y  Favoritar", "Y  Favorite", "Y  Favorito"},
    {"LRC SYNC", "LRC SYNC", "LRC SYNC"},
    {"ÁUDIO LOCAL", "LOCAL AUDIO", "AUDIO LOCAL"},
    {"Artista não informado", "Unknown artist", "Artista desconocido"},
    {"A SEGUIR", "UP NEXT", "A CONTINUACIÓN"},
    {"Fim da fila", "End of queue", "Fin de la cola"},
    {"canais", "channels", "canales"},
    {"Analisando dados técnicos...", "Reading technical data...",
     "Analizando datos técnicos..."},
    {"LETRAS EM TEMPO REAL", "LIVE LYRICS", "LETRAS SINCRONIZADAS"},
    {"Cada música, um momento.", "Every song, a moment.",
     "Cada canción, un momento."},
    {"Letras indisponíveis", "Lyrics unavailable", "Letras no disponibles"},
    {"Use um .lrc com o mesmo nome do áudio.",
     "Use a .lrc with the same name as the audio.",
     "Usa un .lrc con el mismo nombre del audio."},
    {"X  Expandir / recolher letras", "X  Expand / collapse lyrics",
     "X  Ampliar / reducir letras"},
    {"Áudio local", "Local audio", "Audio local"},
    {"PRÉVIA DA INTERFACE", "INTERFACE PREVIEW", "VISTA PREVIA"},
    {"Carregando vídeo...", "Loading video...", "Cargando vídeo..."},
    {"B  Voltar", "B  Back", "B  Volver"},
    {"Controles ocultam em 3s", "Controls hide after 3s",
     "Controles se ocultan en 3s"},
    {"VOL %d%%     Y Opções", "VOL %d%%     Y Settings",
     "VOL %d%%     Y Ajustes"},
    {"Opções", "Settings", "Ajustes"},
    {"Volume", "Volume", "Volumen"},
    {"Velocidade", "Speed", "Velocidad"},
    {"Formato da imagem", "Aspect ratio", "Formato de imagen"},
    {"Faixa de áudio", "Audio track", "Pista de audio"},
    {"Legendas", "Subtitles", "Subtítulos"},
    {"Repetir mídia", "Repeat media", "Repetir archivo"},
    {"Proporção original", "Original aspect", "Proporción original"},
    {"Preencher (corte)", "Fill (crop)", "Rellenar (recorte)"},
    {"Esticar", "Stretch", "Estirar"},
    {"Abra uma mídia", "Open a media file", "Abre un archivo"},
    {"Ativada", "On", "Activada"},
    {"Desativada", "Off", "Desactivada"},
    {"Padrão", "Default", "Predeterminada"},
    {"Faixa", "Track", "Pista"},
    {"Esquerda/direita ou A para alterar", "Left/right or A to change",
     "Izquierda/derecha o A para cambiar"},
    {"Voltar", "Back", "Volver"},
    {"Sair", "Exit", "Salir"},
    {"Biblioteca atualizada", "Library refreshed", "Biblioteca actualizada"},
    {"Limite de 4096 itens: organize em subpastas",
     "4096-item limit: organize into subfolders",
     "Límite de 4096: organiza en subcarpetas"},
    {"Não foi possível abrir a mídia", "Could not open media",
     "No se pudo abrir el archivo"},
    {"Falha ao iniciar. Consulte log.txt", "Playback failed. See log.txt",
     "Error al iniciar. Consulta log.txt"},
    {"Falha na reprodução. Consulte log.txt", "Playback error. See log.txt",
     "Error de reproducción. Consulta log.txt"},
    {"Sem permissão de leitura nesta pasta",
     "No read permission for this folder",
     "Sin permiso de lectura en esta carpeta"},
    {"Pasta indisponível ou cartão removido",
     "Folder unavailable or card removed",
     "Carpeta no disponible o tarjeta retirada"},
    {"Pasta ausente ou cartão não montado",
     "Folder missing or card not mounted",
     "Carpeta ausente o tarjeta no montada"},
    {"Não foi possível abrir a pasta", "Could not open the folder",
     "No se pudo abrir la carpeta"},
    {"%.1f GB livres", "%.1f GB free", "%.1f GB libres"},
    {"Armazenamento local", "Local storage", "Almacenamiento local"},
    {"Bem-vindo ao seu player", "Welcome to your player",
     "Bienvenido a tu reproductor"},
    {"Escolha seu idioma", "Choose your language", "Elige tu idioma"},
    {"A  Iniciar K PLAYER", "A  Start K PLAYER", "A  Iniciar K PLAYER"},
    {"Y  Termos de uso", "Y  Terms of use", "Y  Términos de uso"},
    {"Termos de uso", "Terms of use", "Términos de uso"},
    {"Idioma", "Language", "Idioma"},
    {"Pressione B para continuar", "Press B to continue",
     "Pulsa B para continuar"},
    {"Sua escolha será salva neste aparelho.",
     "Your choice will be saved on this device.",
     "Tu elección se guardará en este dispositivo."},
    {"Direcional: idioma    A: iniciar    SELECT: sair",
     "D-pad: language    A: start    SELECT: exit",
     "Cruceta: idioma    A: iniciar    SELECT: salir"},
    {"B Voltar    Esquerda/Direita Páginas", "B Back    Left/Right Pages",
     "B Volver    Izquierda/Derecha Páginas"},
    {"Não foi possível salvar. Verifique o cartão.",
     "Could not save. Check your card.",
     "No se pudo guardar. Revisa la tarjeta."},
    {"Sobre o aplicativo", "About this application", "Acerca de la aplicación"},
    {"Seus arquivos e preferências", "Your files and preferences",
     "Tus archivos y preferencias"},
    {"Licenças e avisos", "Licenses and notices", "Licencias y avisos"},
    {"K PLAYER é um reprodutor independente para suas músicas e vídeos. Não "
     "inclui conteúdo de terceiros. Use mídias que você tenha direito de "
     "acessar. A compatibilidade e o desempenho dependem do arquivo, dos "
     "codecs e do aparelho.",
     "K PLAYER is an independent player for your music and videos. It does not "
     "include third-party media. Use media you have the right to access. "
     "Compatibility and performance depend on the file, codecs and device.",
     "K PLAYER es un reproductor independiente para tu música y vídeos. No "
     "incluye contenido de terceros. Usa medios a los que tengas derecho de "
     "acceso. La compatibilidad y el rendimiento dependen del archivo, los "
     "códecs y el dispositivo."},
    {"O explorador permite ler mídias nas pastas acessíveis do aparelho. "
     "Idioma, opções e favoritos são salvos na pasta do K PLAYER. Preserve "
     "seus arquivos e configurações ao atualizar. Você pode mudar o idioma e "
     "consultar estes avisos em Opções. Com internet, o K PLAYER consulta "
     "ip-api.com para exibir cidade e horário aproximados pelo IP público; "
     "nenhuma mídia é enviada. A Rádio Online consulta o diretório Radio "
     "Browser e conecta diretamente à transmissão escolhida.",
     "The browser reads media from accessible folders on your device. "
     "Language, settings and favorites are saved in the K PLAYER folder. Keep "
     "your files and settings when updating. You can change the language and "
     "read these notices in Settings. When online, K PLAYER queries ip-api.com "
     "to show an approximate city and time from the public IP; no media is "
     "sent. Online Radio queries the Radio Browser directory and connects "
     "directly to the selected stream.",
     "El explorador lee archivos de las carpetas accesibles del dispositivo. "
     "El idioma, los ajustes y los favoritos se guardan en la carpeta de K "
     "PLAYER. Conserva tus archivos y ajustes al actualizar. Puedes cambiar el "
     "idioma y consultar estos avisos en Ajustes. Con internet, K PLAYER "
     "consulta ip-api.com para mostrar ciudad y hora aproximadas mediante la "
     "IP "
     "pública; no se envía contenido multimedia. Radio Online consulta el "
     "directorio Radio Browser y conecta directamente a la transmisión "
     "elegida."},
    {"Este software é fornecido sem garantia, nos limites das licenças "
     "aplicáveis. O K PLAYER utiliza VLC, SDL2, stb e Inter. As licenças estão "
     "na pasta licencas e o código-fonte acompanha o pacote. Estes avisos não "
     "limitam os direitos concedidos pelas licenças de software livre. Sem "
     "afiliação com a VideoLAN.",
     "This software is provided without warranty to the extent stated in its "
     "applicable licenses. K PLAYER uses VLC, SDL2, stb and Inter. Licenses "
     "are in the licencas folder and source code is included in the package. "
     "These notices do not restrict rights granted by free software licenses. "
     "Not affiliated with VideoLAN.",
     "Este software se proporciona sin garantía en los términos de sus "
     "licencias aplicables. K PLAYER utiliza VLC, SDL2, stb e Inter. Las "
     "licencias están en la carpeta licencas y el código fuente acompaña al "
     "paquete. Estos avisos no limitan los derechos de las licencias de "
     "software libre. Sin afiliación con VideoLAN."},
    {"Direcional Navegar   A Abrir   X Player   Y Opções   START Pausa   "
     "SELECT Sair",
     "D-pad Navigate   A Open   X Player   Y Settings   START Pause   SELECT "
     "Exit",
     "Cruceta Navegar   A Abrir   X Player   Y Ajustes   START Pausa   SELECT "
     "Salir"},
    {"A Abrir   B Início   Esq/Dir Filtro   X Player   Y Atualizar   SELECT "
     "Sair",
     "A Open   B Home   Left/Right Filter   X Player   Y Refresh   SELECT Exit",
     "A Abrir   B Inicio   Izq/Der Filtro   X Player   Y Actualizar   SELECT "
     "Salir"},
    {"A Abrir   B Voltar   Esq/Dir Filtro   X Player   Y Atualizar   SELECT "
     "Sair",
     "A Open   B Back   Left/Right Filter   X Player   Y Refresh   SELECT Exit",
     "A Abrir   B Volver   Izq/Der Filtro   X Player   Y Actualizar   SELECT "
     "Salir"},
    {"A Pausa   B Início   X Letras   Y Favoritar   L1/R1 Faixa   Cima/Baixo "
     "Volume",
     "A Pause   B Home   X Lyrics   Y Favorite   L1/R1 Track   Up/Down Volume",
     "A Pausa   B Inicio   X Letras   Y Favorito   L1/R1 Pista   Arriba/Abajo "
     "Volumen"},
    {"A / START Pausa   Esq/Dir 10s   Cima/Baixo Volume   X Ocultar   SELECT "
     "Sair",
     "A / START Pause   Left/Right 10s   Up/Down Volume   X Hide   SELECT Exit",
     "A / START Pausa   Izq/Der 10s   Arriba/Abajo Volumen   X Ocultar   "
     "SELECT Salir"},
    {"TRANSPARÊNCIA", "TRANSPARENCY", "TRANSPARENCIA"},
    {"Aviso de Transparência", "Transparency Notice", "Aviso de Transparencia"},
    {"Antes de acessar Rádio Online ou IPTV",
     "Before entering Online Radio or IPTV",
     "Antes de entrar en Radio Online o IPTV"},
    {"1. Fontes abertas e agregadores públicos",
     "1. Open sources & public aggregators",
     "1. Fuentes abiertas y agregadores públicos"},
    {"Todos os dados de IPTV e Rádio são retirados de agregadores públicos da internet ou de fontes abertas (Radio-Browser e catálogos web públicos). O KPlayer é apenas um reprodutor e não hospeda conteúdo próprio.",
     "All IPTV and Radio data is obtained from public internet aggregators or open sources (Radio-Browser and public web catalogs). KPlayer is strictly a media player and does not host any content.",
     "Todos los datos de IPTV y Radio provienen de agregadores públicos de internet o fuentes abiertas (Radio-Browser y catálogos web públicos). KPlayer es solo un reproductor y no aloja contenido propio."},
    {"2. Você tem direito de colocar seu próprio link",
     "2. You have the right to add your own link",
     "2. Tienes derecho a añadir tu propio enlace"},
    {"Com total transparência, você pode inserir seus próprios links e playlists .m3u/.m3u8 (pelo teclado virtual ou em iptv_usuario/) e rádios .pls/.m3u (em radios_usuario/) a qualquer momento.",
     "With full transparency, you can add your own .m3u/.m3u8 links and playlists (via the virtual keyboard or in iptv_usuario/) and .pls/.m3u radio files (in radios_usuario/) at any time.",
     "Con total transparencia, puedes añadir tus propios enlaces y listas .m3u/.m3u8 (con el teclado virtual o en iptv_usuario/) y radios .pls/.m3u (en radios_usuario/) en cualquier momento."},
    {"B  Concordo e continuar", "B  Agree & continue", "B  Aceptar y continuar"},
    {"Concordo e continuar", "Agree & continue", "Aceptar y continuar"},
    {"Y  Termos", "Y  Terms", "Y  Términos"},
    {"Transparência: IPTV e Rádio", "Transparency: IPTV & Radio", "Transparencia: IPTV y Radio"},
    {"K PLAYER é um reprodutor independente para suas músicas, vídeos, rádios e listas IPTV. O aplicativo não hospeda, armazena nem distribui conteúdo próprio. Use mídias que você tenha direito de acessar. A compatibilidade e o desempenho dependem do arquivo, dos codecs e do aparelho.",
     "K PLAYER is an independent player for your music, videos, online radio and IPTV playlists. It does not host, store or distribute its own content. Use media you have the right to access. Compatibility and performance depend on the file, codecs and device.",
     "K PLAYER es un reproductor independiente para tu música, vídeos, radio y listas IPTV. No aloja, almacena ni distribuye contenido propio. Usa medios a los que tengas derecho de acceso. La compatibilidad depende del archivo, códecs y dispositivo."},
    {"Todos os dados de IPTV e Rádio são retirados de agregadores públicos da internet ou de fontes abertas (como Radio-Browser e catálogos web públicos). Você tem total direito de colocar seu próprio link ou arquivo (.m3u/.m3u8 pelo teclado na tela ou em iptv_usuario/, e .pls/.m3u em radios_usuario/), sempre com transparência.",
     "All IPTV and Radio data is obtained from public internet aggregators or open sources (such as Radio-Browser and public web catalogs). You always have the full right to add your own link or file (.m3u/.m3u8 via the on-screen keyboard or in iptv_usuario/, and .pls/.m3u in radios_usuario/), with full transparency.",
     "Todos los datos de IPTV y Radio provienen de agregadores públicos de internet o fuentes abiertas (como Radio-Browser y catálogos web públicos). Siempre tienes derecho a añadir tu propio enlace o archivo (.m3u/.m3u8 con el teclado o en iptv_usuario/, y .pls/.m3u en radios_usuario/), con total transparencia."},
    {"O explorador lê apenas as pastas dedicadas (/roms(2)/bgmusic e /roms(2)/videos) e suas pastas de playlists (iptv_usuario/ e radios_usuario/). Idioma, tema, opções e favoritos são salvos localmente. Preserve seus arquivos ao atualizar.",
     "The browser reads only the dedicated folders (/roms(2)/bgmusic and /roms(2)/videos) and your playlist folders (iptv_usuario/ and radios_usuario/). Language, theme, settings and favorites are saved locally. Keep your files when updating.",
     "El explorador lee solo las carpetas dedicadas (/roms(2)/bgmusic y /roms(2)/videos) y tus carpetas de listas (iptv_usuario/ y radios_usuario/). Idioma, tema, ajustes y favoritos se guardan localmente. Conserva tus archivos al actualizar."},
    {"Este software é fornecido sem garantia, nos limites das licenças aplicáveis (GPL-2.0-or-later). O K PLAYER utiliza VLC/libVLC, SDL2, stb e fontes livres. As licenças estão na pasta licencas e o código-fonte acompanha o pacote. Sem afiliação com VideoLAN, PortMaster ou SofaScore.",
     "This software is provided without warranty to the extent stated in its applicable licenses (GPL-2.0-or-later). K PLAYER uses VLC/libVLC, SDL2, stb and open fonts. Licenses are in the licencas folder and source code accompanies the package. Not affiliated with VideoLAN, PortMaster or SofaScore.",
     "Este software se proporciona sin garantía según sus licencias aplicables (GPL-2.0-or-later). K PLAYER utiliza VLC/libVLC, SDL2, stb y fuentes libres. Las licencias están en licencas y el código fuente acompaña el paquete. Sin afiliación con VideoLAN, PortMaster o SofaScore."},
};
static const char *tr(const char *pt) {
  if (language == 0)
    return pt;
  for (size_t i = 0; i < sizeof(translations) / sizeof(*translations); i++)
    if (!strcmp(pt, translations[i].pt))
      return language == 1 ? translations[i].en : translations[i].es;
  return pt;
}
static void load_preferences(void) {
  language = 0;
  onboarding_done = false;
  FILE *f = fopen(preferences_path, "r");
  if (!f)
    return;
  int version, l, done;
  if (fscanf(f, "KPLAYER_PREFS %d\nlanguage %d\nonboarding %d", &version, &l,
             &done) == 3 &&
      version == 1 && l >= 0 && l < 3 && (done == 0 || done == 1)) {
    language = l;
    onboarding_done = done;
  }
  fclose(f);
}
static bool save_preferences(bool completed) {
  char temporary[PATH_MAX];
  if (snprintf(temporary, sizeof(temporary), "%s.tmp", preferences_path) >=
      (int)sizeof(temporary))
    return false;
  FILE *f = fopen(temporary, "w");
  if (!f)
    return false;
  bool ok = fprintf(f, "KPLAYER_PREFS 1\nlanguage %d\nonboarding %d\n",
                    language, completed ? 1 : 0) > 0;
  if (fflush(f) || fsync(fileno(f)))
    ok = false;
  if (fclose(f))
    ok = false;
  if (ok && rename(temporary, preferences_path) == 0)
    return true;
  unlink(temporary);
  return false;
}
