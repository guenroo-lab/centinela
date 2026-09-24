# 📋 CENTINELA — Plataforma de gestión de almacén (Taisa)
## Documento único del proyecto

---

## 🎯 QUÉ ES

**Centinela** es una plataforma Apps Script con pestañas, cada una un módulo
de gestión del almacén Taisa. Nace de "Control de Turno" (app original de
fotos por turno), que ahora es su primera pestaña.

**Estado actual: las 4 pestañas pedidas + Cargas + Plantillas construidas** (v29 desplegada).
**Dispositivos y Tareas** están escritas y verificadas con Node (smoke tests + arnés de navegador con
hojas simuladas), **pendientes de desplegar** (`clasp push` + `clasp deploy`); sus hojas se crean solas
la primera vez que se abren (no requieren `?setup=1`).
El usuario decidió no enseñar nada a los jefes hasta dar el visto bueno final.
**Barra inferior** (orden pedido por el usuario): Turno (abre por defecto), Cargas, Plantilla de carga,
Tareas, Maquinaria, Dispositivos, Residuos, Personal, Turnos, Chat. Con tantas pestañas no caben en móvil: la barra se
desplaza en horizontal (mín. 68 px por pestaña) y `mostrarTab()` deja a la vista la activa.
**Despliegue:** SIEMPRE `clasp deploy -i AKfycbwmhHWgXRZ8f1PKM7Ko-VxFUMU2NW4A02vPFJ9oULMWhuYonML36X6hREma-sKe-6sqzw -V <n>` (mismo link, nunca crear despliegue nuevo).
Pendiente: abrir una vez `<link>/exec?setup=1` (crea hojas y datos iniciales) y luego quitar esa rama de `Shell.gs`.

| Pestaña | Estado |
|---|---|
| **Turno** (control de turno por fotos) | ✅ Construida (v3.2 migrada) |
| **Maquinaria** (inventario, estado OK/Fallas/Averiada/**En revisión**, aviso SAT automático solo en Fallas/Averiada — En revisión no manda correo, solo cambia la etiqueta —, historial) | ✅ Construida — sustituye el proyecto standalone viejo |
| **Residuos** (peticiones a Recisur: cambio de cubas + campo libre de avería, correo premium) | ✅ Construida |
| **Personal** (lista fija de operarios + registro de incidencias por tarjeta, sin email; **acceso con código «Taisa»** validado en el servidor (propiedad de script `PERSONAL_CODIGO` lo cambia; 5 fallos = 5 min de bloqueo; se re-bloquea al cambiar de jefe/salir/inactividad)) | ✅ Construida — falta cargar la lista real de operarios |
| **Cargas** (plan del B2B por fecha en dos columnas Cargas/Descargas + EnCurso/Registros; **anular transporte** y **añadir transporte Extra** ESCRIBEN en el B2B desde `CargasGestion.gs`, réplica de jefeAnularEnB2B/jefeAnadirAlB2B de proyecto_cargas: marca AT, tachado A..AF, correo a administración; el Extra se inserta bajo el siguiente transporte del mismo destino copiando A-D, E=«Extra», F=hora de llegada; la cuenta de quien usa Centinela necesita permiso de EDICIÓN en el B2B) | ✅ Construida — sin probar contra el B2B real |
| **Plantilla de carga** (con silueta de HODOS OPCIONAL: la casilla nace desmarcada desde v45, si se marca añade los pendientes de carga de la tienda, leídos de HODOS por `HodosPendientes.gs` → `doGet?accion=pendientesTienda` de HODOS, solo lectura; requiere permiso Drive por el Bearer token; `?diag=hodos` es temporal) (sube el Excel «Repertorio de soportes» de Infolog, formato A de 21 cols o B de 22; tienda auto, horario elegido, imprime A4; todo en el navegador, sin servidor) | ✅ Construida — imprime desde una pestaña propia (`window.open`, reserva: iframe oculto); cada página es una caja A4 con margen interior de 12 mm y `@page{margin:0}` (no depende de los márgenes del diálogo; en v31 con `@page` de 12 mm salía cortado). Sin probar el flujo completo en navegador real |
| **Dispositivos** (inventario de dispositivos de la nave: tipo, servicio (Carga/Descarga, Recepción, Pedido Cliente, Arrastre, SIE), **número de serie** (antes IMEI; en móviles se revisa con *#06#, hay un anuncio en la pestaña), estado Operativo/Averiado/En reparación/Baja; tarjetas expandibles, alta y edición desde la app, historial de cambios de estado, buscador + filtros por estado y servicio; sin correos) | ✅ Escrita y verificada, pendiente de desplegar. Lista inicial vacía (no hay inventario cargado). IMEI: 14–16 dígitos o vacío, sin duplicados, guardado como texto. Cambiar estado/editar exige jefe identificado o supervisor |
| **Tareas** (el supervisor asigna tareas a un jefe o una GLOBAL a todos; cada jefe ve solo las suyas, las cierra con un feedback de ≥5 caracteres y llega un correo-informe a `CONFIG.EMAIL_RESPONSABLE`) | ✅ Escrita y verificada, pendiente de desplegar. Global = "Asignado a" `TODOS`: la ven todos y la cierra el primero (el servidor lo comprueba bajo bloqueo; el segundo recibe «Ya la ha completado X a las HH:MM»). Refresco automático cada 45 s con la pestaña visible; insignia con el nº de pendientes en la barra |
| **Botón de sugerencias** (flotante, en cualquier pestaña) | ✅ Construido |
| **Modo supervisor** (pulsación larga 2s en "Centinela" + contraseña) | ✅ Construido — usado hoy por Maquinaria (revisión SAT) y Tareas (crear/anular/ver todas); en la pestaña Tareas hay un botón «Salir del modo supervisor» (`salirModoSupervisor()`), antes solo se salía recargando. Es un filtro de **cliente**, no seguridad fuerte (la contraseña va en el HTML) |

Specs y planes de cada pieza en `docs/specs/` y `docs/plans/`.

---

## 📦 ARCHIVOS DEL PROYECTO

Proyecto Apps Script **multi-archivo** (Script ID
`1mrj0RUSqX-2g37A1LyNPyX-pwPyE0a2UegRQIJQqZ3esrbnyOnZjXDI7`), carpeta local
`centinela/`:

```
centinela/
  Config.gs           → JEFES_EQUIPO, TURNOS, CONFIG, cabeceras, logo, setup de la hoja
  Utilidades.gs         → escapeHtml, clampEstado, dataUriABlob, include(), helpers de Sheets
  Shell.gs               → doGet() — sirve ShellUI con los módulos incluidos
  Turno.gs                → lógica de negocio de la pestaña Turno
  Sugerencias.gs            → lógica del botón flotante de sugerencias
  Maquinaria.gs               → lógica de la pestaña Maquinaria (estado, aviso SAT, historial)
  ShellUI.html                  → cascarón: tema (Kairos), identidad, pestañas, sugerencias, modo supervisor
  TurnoUI.html                    → HTML/CSS/JS de la pestaña Turno
  SugerenciasUI.html                → formulario del botón flotante
  MaquinariaUI.html                   → HTML/CSS/JS de la pestaña Maquinaria (+ panel supervisor)
  Dispositivos.gs / DispositivosUI.html → pestaña Dispositivos (prefijo `dis` / `disp` en JS, CSS e ids)
  Tareas.gs / TareasUI.html             → pestaña Tareas (prefijo `tar`); correo-informe al completar
  (más: Personal, Residuos, Cargas, Plantillas, HodosPendientes — ver la tabla de arriba)
docs/specs/    → diseños (spec) de cada pieza
docs/plans/    → planes de implementación de cada pieza
```

No hay ningún otro documento del proyecto (ni un `.js` de una sola pieza, ni
un `RESUMEN_RAPIDO.txt` — se fusionó todo aquí en su momento). Si algo
cambia, se actualiza este archivo, no se crea uno nuevo.

**Despliegue:** vía `clasp push` + `clasp deploy` (ya configurado en esta
sesión de trabajo — no hace falta copiar/pegar a mano en el editor de Apps
Script, aunque se puede seguir usando si se prefiere).

---

## 🎨 SISTEMA VISUAL (copiado de Kairos)

Centinela reutiliza **literalmente** el sistema visual ya en producción de
Kairos (`Desktop\Proyectos\Kairos\kairos-operario\Index.html`, su Pieza 7):

- **4 acentos de color** vía `[data-ktheme="..."]`: `indigo`, `lmgreen`,
  `taisared` (por defecto), `amber`. Solo `lmgreen`/`taisared` tienen
  variante de modo claro.
- **Modo oscuro/claro** vía `[data-kmode="dark|light"]`, con selector
  colapsable en la cabecera ("🎨 Tema"), persistido en `localStorage`
  (`centinela_mode_pick`/`centinela_theme_pick`) — por dispositivo, no por
  usuario (ningún jefe tiene login personal).
- **Tokens:** `--ink-950…600` (superficies), `--text-100…600`, semánticos
  `--ok`/`--warn-*`/`--danger-*`, `--radius-card/btn/chip`, `--shadow-card`.
  Además, propio de Centinela (no de Kairos): `--accent-text` — una
  variante más clara del acento activo, solo para usarla como **color de
  texto** sobre fondo oscuro (el acento "crudo" no siempre llega a 4.5:1 de
  contraste como texto; sí vale tal cual como fondo de botones/badges).
- **Iconos:** SVG inline trazo fino, sin emoji, para navegación/chrome. Los
  emoji de los 5 niveles de valoración de Turno (⛔🔴🟡🟢⭐) se mantuvieron
  — son parte del patrón pastel calcado de `PreparacionPedidosPC`, no
  navegación.
- **Colores de estado (verde/ámbar/crítico) van en hex fijo**, no dependen
  del acento elegido — mismo criterio que usa Kairos para sus colores de
  tipo de pedido.

Al añadir una pestaña nueva (Maquinaria/Residuos/Personal), su HTML usa
estos mismos tokens — no declarar `:root` propio, ya lo pone `ShellUI.html`.

---

## 👥 IDENTIDAD COMPARTIDA

Selector único "¿Quién eres?" (los 4 jefes de `JEFES_EQUIPO`) al abrir
Centinela, válido para todas las pestañas — ninguna pestaña lo vuelve a
preguntar. Guardado en `CentinelaState.jefe` (memoria de la página, **no**
persistido entre sesiones — se elige de nuevo cada vez que se abre la app,
porque el dispositivo puede rotar entre jefes de distinto turno).

```
1. Dani Simo
2. Daniel Arrastio
3. Francisco Parada
4. Sebastián Gelviz
```

Se valida también en servidor (`procesarRegistro`, `procesarSugerencia`)
contra `JEFES_EQUIPO`.

---

## 📊 DATOS

Una sola hoja de cálculo **"Centinela"**, una pestaña de Sheets por módulo:

| Columna Sheets | Contenido |
|---|---|
| `Registros_Turno` | Igual estructura que siempre (ver `CABECERAS_TURNO` en `Config.gs`) |
| `Sugerencias` | Fecha, Hora, Jefe de Equipo, Sugerencia |
| `Dispositivos` | ID, Tipo, Servicio, Numero Serie, Estado, Observacion, Fecha Estado |
| `Historial_Dispositivos` | Fecha, Hora, ID, Tipo, Numero Serie, Estado Anterior, Estado Nuevo, Observacion, Jefe (una línea por alta o cambio de estado) |
| `Tareas` | ID, Titulo, Descripcion, Asignado a (jefe o `TODOS`), Prioridad (Normal/Alta), Fecha Asignacion, Fecha Limite, Estado (Pendiente/Completada/Anulada), Feedback, Fecha Cierre, Cerrada por, Correo Enviado (Sí/No). Se puede apuntar una tarea a mano: se lee de forma tolerante y se le asigna ID sola, Foto Tarea, Foto Cierre ("Sí" si hay foto; **fotos opcionales** al crear y al completar) |
| `Tareas_Fotos` | Foto ID (`<id>-T` tarea / `<id>-C` cierre), Parte, Total, Datos (la foto reducida en el navegador, troceada en celdas de 40.000 caracteres; sin Drive). Se ven con `obtenerFotoTarea` (solo quien ve la tarea) y van incrustadas en el correo de cierre |
| `Personal_Historial` | ID Operario, Nombre, Fecha, Hora (cuándo se registró), Reportado Por (jefe que la puso), Texto, **Gravedad (1 leve … 5 muy grave, obligatoria)**, Tipo, Medida, Fecha Hecho (cuándo ocurrió). Las filas antiguas (6 columnas) se leen como «Sin puntuar»; las cabeceras nuevas se escriben solas en la primera incidencia |
| `Residuos` | Fecha, Hora, Jefe de Equipo, Tipo (cuba o `Averia`), Observacion. La pestaña muestra las 5 últimas (`obtenerUltimasPeticionesResiduos`) |

`setupSistemaCompleto()` (en `Config.gs`) crea/repara la hoja y sus
pestañas — **ejecutar UNA VEZ** tras el primer despliegue. Si a alguna
pestaña le falta o le borraron la fila de cabeceras, se repara sola en el
siguiente guardado (`cabecerasOk`/`asegurarCabeceras_`).

`Dispositivos`, `Historial_Dispositivos` y `Tareas` se crean **solas** la primera
vez que se usan (`asegurarHojaPerezosa_` en `Config.gs`, bajo LockService) y
sus columnas de texto/fecha/nº de serie se crean con formato «texto sin formato»:
así Sheets no convierte fechas en `Date` (que `google.script.run` entrega como
`null` en silencio), no pierde ceros de un nº de serie y no interpreta como fórmula un
texto que empiece por `=`, `+` o `-`. Los bloqueos de Apps Script **no son
reentrantes**: `asegurarHojaPerezosa_` se llama siempre *antes* de coger el
bloqueo de escritura.

---

## 🔧 CÓMO AÑADIR UNA PESTAÑA NUEVA (Maquinaria/Residuos/Personal)

1. Spec propio en `docs/specs/` (brainstorming primero, no saltar a código).
2. `NombreModulo.gs` (lógica) + `NombreModuloUI.html` (fragmento, sin
   `<!DOCTYPE>`/`<html>`/`<head>`/`<body>`, usa los tokens del cascarón).
3. En `ShellUI.html`: añadir `<div class="tab-panel" data-tab="x"><?!= include('NombreModuloUI'); ?></div>`
   y una entrada más en la barra `<div class="tabs">` con su icono SVG.
4. Si necesita guardar datos: nueva pestaña de Sheets + cabeceras en
   `Config.gs`, siguiendo el mismo patrón que `Sugerencias`.
5. `clasp push` + `clasp deploy` (nueva versión, mismo Script ID).

El cascarón ya está pensado para esto (`mostrarTab(id)` es genérico) — no
hace falta tocar Turno ni Sugerencias al añadir un módulo.

---

## 🔍 TROUBLESHOOTING

- **Error de conexión al enviar (Turno):** verifica que ejecutaste
  `setupSistemaCompleto()` una vez; si tarda más de 40 s, Turno avisa solo
  y vuelve al resumen sin perder las fotos ya tomadas.
- **No se guarda en Sheets:** comprueba `SPREADSHEET_ID` en las
  propiedades del script; revisa logs con `Logger.log()`.
- **Email no llega:** revisa Spam; comprueba que el script tiene permisos
  de Gmail; si el turno tenía muchas fotos grandes puede haberse superado
  `CONFIG.MAX_BYTES_FOTOS_EMAIL`.
- **El `.js` local va por delante de lo desplegado:** ya no aplica igual
  que antes — ahora se despliega con `clasp push`/`clasp deploy` en la
  misma sesión de trabajo, no por copiar/pegar a mano. Aun así, verificar
  con `clasp deployments` cuál es el despliegue real en uso antes de dar
  por buena una discrepancia.

---

## 📦 HISTORIAL

- **Centinela v1** (18/09/2026): rediseño desde Control de Turno v3.2 →
  plataforma multi-pestaña. Cascarón + identidad compartida + sistema
  visual Kairos (4 acentos + claro/oscuro) + Turno migrado + botón de
  sugerencias. Desplegado (`clasp deploy`, Script ID de arriba) — **no
  compartido con los jefes todavía**, pendiente Maquinaria/Residuos/Personal.
- **Control de Turno v3.2** (17/09/2026): repaso completo de bugs
  (backend, frontend, email, botones y accesibilidad) — 26 correcciones.
  Documentación fusionada en un único archivo (antecedente de esta misma
  regla aplicada ahora a nivel de todo Centinela).
- v3.1 (04/08/2026), v3.0 (27/06/2026), v2.0 (02/05/2026), v1.0 (26/04/2026):
  historial previo de Control de Turno como app independiente.

---

## 🚨 NOTAS IMPORTANTES

1. **Jefes se editan solo en `JEFES_EQUIPO`** (`Config.gs`) — usado por
   identidad compartida, Turno y Sugerencias, no hay listas duplicadas.
2. **No poner en marcha de cara a los jefes** hasta que Maquinaria,
   Residuos y Personal estén completos (decisión explícita del usuario).
3. **Un solo documento**: toda la documentación vive en este `CLAUDE.md`.
   No crear un segundo archivo de resumen — si algo cambia, se actualiza
   aquí. (Ya pasó una vez con `RESUMEN_RAPIDO.txt` — no repetir.)
4. **Zona horaria:** `Session.getScriptTimeZone()` — comprobar que el
   proyecto de Apps Script tiene **Europe/Madrid** configurado.

---

## 📞 SOPORTE

Pedro Gil — Pedro.gil@ext.leroymerlin.es


## Notas de la sesión 2026-09-21 (v38)
- Deploy SIEMPRE con `clasp deploy -i AKfycbwmhHWgXRZ8f1PKM7Ko-VxFUMU2NW4A02vPFJ9oULMWhuYonML36X6hREma-sKe-6sqzw -V <n>`.
- `appsscript.json` tiene `oauthScopes` EXPLÍCITOS (clasp no recalcula los automáticos). Si un servicio nuevo necesita otro permiso, hay que añadirlo ahí y el usuario debe reautorizar marcando TODAS las casillas.
- HODOS: `HodosPendientes.gs` → `doGet?accion=pendientesTienda` de HODOS (v74+, solo lectura). Si falta permiso, la tarjeta muestra el enlace «Conceder permiso».
- `cambiarIdentidad()` ya NO hereda el modo supervisor.
- Los historiales (Maquinaria, Personal) se leen con `getDisplayValues()`: un `Date` cruzando `google.script.run` devuelve null en silencio.
- `?setup=1` ya se ejecutó (21/09/2026) y se quitó de `Shell.gs`. Si hiciera falta de nuevo, ejecutar `setupSistemaCompleto()` desde el editor de Apps Script.
- **v42 (21/09/2026):** correos a Recisur en copia a los 4 jefes + José + Pedro + administración (`CORREOS_JEFES_EQUIPO`/`CORREOS_RESPONSABLES` en `Config.gs`, `CONFIG.RECISUR_CC`). Emojis fuera del plano básico (🕕, 🌐, 😡…) salían como `������` en `GmailApp` con imágenes incrustadas (se codifican como pares sustitutos): TODO `htmlBody` pasa por `htmlSeguro_()` (`Utilidades.gs`), que los convierte a entidades `&#NNNN;`. Si se añade otro envío con `GmailApp`, usarla.
- Personal: cada incidencia lleva gravedad 1-5, tipo, medida y fecha del hecho; la ficha muestra nº de incidencias, la más grave y la última fecha.
- **v43:** José y Pedro (`CORREOS_RESPONSABLES`) van en copia de TODOS los correos de la app vía `ccConResponsables_(para, cc)` (`Utilidades.gs`): Turno, Sugerencias, Tareas, Recisur y avisos al SAT. Cargas (anular/añadir transporte) y el aviso interno de Maquinaria ya los llevan como destinatarios. Todo envío nuevo debe usar el helper.
- **v44:** pestaña **Turnos** (entre Residuos y Personal): cuadro con los turnos de la semana en curso (lunes-domingo) leídos de la hoja del MES del «Cuadrante 2.0» (`CONFIG.CUADRANTE_SHEET_ID`; hojas `Sep 2026`, `Oct 2026`…; si la semana cruza de mes lee las dos). Sin la sección MANDOS (ni roles SUP/JA/JE). Backend `TurnosSemana.gs` (`obtenerTurnosSemana`), UI `TurnosUI.html`. Solo LEE; devuelve solo nombre+turno (nunca DNI/teléfonos/horas del resto de hojas del cuadrante). Códigos: M Mañana, T Tarde, P Partido, V Vacaciones, A Asuntos propios, B Baja, PR (permiso), · Libre; `P +2h`/`T +4h` = horas extra tal cual. Mapa de nombres en `TN_CODIGOS` (`TurnosUI.html`). Si la cuenta de quien abre la pestaña no puede abrir el cuadrante, se sirve la copia de esta semana que dejó alguien con acceso (propiedad de script `TURNOS_COPIA`).
- **v45 (22/09/2026):**
  - Pestaña **Chat** (`ChatUI.html`, sin `.gs`): probado en real el iframe a Google Chat — Google lo bloquea con un 403 ("no tienes acceso a esta página"), como se avisó que podía pasar. **v46:** quitado el iframe, se quedó solo el botón "Abrir Chat" (`https://mail.google.com/chat/u/0/`, `target="_blank"`) con la cuenta del que lo abre.
  - **Plantilla de carga:** la casilla "Imprimir también la silueta de HODOS" nace desmarcada (`incluirHodos: false` en `PlantillasUI.html`) — antes nacía marcada y se pedía a HODOS en segundo plano en cada carga de Excel aunque no se fuera a imprimir.
  - **Turnos (cuadrante semana) reescrito para tiempo real:** `TurnosSemana.gs` ya NO parsea las hojas visuales "Sep 2026"/"Oct 2026" del Sheet `CUADRANTE_SHEET_ID` (iban por detrás de la app real). Ahora lee DIRECTAMENTE, del mismo Sheet, la pestaña **"Turnos"** que usa en tiempo real la app "Cuadrante de Turnos - Málaga" de Pedro (Script ID `1ULYQjtcsplszuh5lVo57s3vgWYX3ukhwfG3hZTcYHFjzwka3ndcsBn7U`, clonado a mano solo para ver su formato — NO se tocó ni se desplegó su código, decisión explícita del usuario de no tocar el proyecto de un compañero). Formato de esa pestaña: fila `<idEmpleado>_<yyyy-mm-dd>` → código de turno (M/T/P/V/VV/B/A/PR/vacío). Catálogo de empleados (nombre/rol/subgrupo) replicado en `TSEM_EMPLEADOS_BASE_` (solo Oficina+Almacén, sin Mandos) y sobreescrito en el mismo orden que su app: hojas `Ocultos`/`Empleados`/`EmpEdits`/`Personal` del mismo Sheet — así un cambio hecho desde su interfaz (sin tocar código) se refleja también aquí. Agrupación: "Oficina" en un solo grupo, Almacén por `subgrupo` (Pedido Cliente / Carga-Descarga / SIE-REC-GDS). Sigue sin mostrar Mandos. Límite conocido: si su Sheet cambia de estructura (nombre de pestaña/columnas) sin avisar, esto se rompe — no hay más aviso que el `avisos` genérico de "no encuentro la pestaña Turnos". `TurnosUI.html`: añadido código `VV` (Vacaciones año anterior) a la leyenda.
  - **Maquinaria:** nuevo estado **"En revisión"** (valor interno `Revision`, mismo selector que OK/Fallas/Averiada) para marcar una máquina ya vista pero aún sin reparar. No manda `avisoSat` ni el correo interno (`enviarAvisoInternoMaquinaria_`) aunque sea la primera vez que se marca — solo cambia la etiqueta. Sigue apareciendo en el listado de "máquinas con avería" (`obtenerMaquinasConAveria`) mientras no vuelva a OK.
  - Desplegado como v45 (mismo link de siempre). `.clasp.json` de `centinela/` no existía en este entorno — se creó apuntando al Script ID de arriba.
- **v46 (22/09/2026):** probado en real el iframe de Chat — Google lo bloquea (403). Quitado el iframe de `ChatUI.html`, se quedó solo el botón "Abrir Chat" (`target="_blank"`).
- **Chat en iframe — investigado con Codex, CERRADO definitivamente:** no existe forma legítima de meter la interfaz real de Google Chat en iframe (ni ajuste de admin Workspace, ni endpoint de embed, ni excepción posible) — es bloqueo server-side de Google (`X-Frame-Options`/`frame-ancestors`), confirmado por la propia matriz de integraciones de Google, Stack Overflow (mismo bloqueo en Gmail) y la comunidad de soporte de Chat. Las únicas vías (proxy, extensión que quita cabeceras, navegador embebido) violan políticas de Google y son inviables en producción. Nos quedamos con el botón "Abrir Chat"; mejora posible: enlazar directo al espacio del equipo (`.../chat/u/0/#chat/space/{spaceId}`) en vez de solo la bandeja.
- **Chat API a medida — investigado con Codex, DESCARTADO por ahora:** los 3 scopes de usuario existen (`chat.spaces.readonly`, `chat.messages.readonly`, `chat.messages.create`) y se podrían llamar igual que HODOS (`UrlFetchApp` + Bearer), PERO exige mover Centinela del proyecto GCP automático de Apps Script a uno **estándar** (cambio irreversible, todos los jefes reautorizan) + habilitar Chat API ahí, normalmente tarea de IT/Adeo, no de un jefe ni nuestra. `chat.messages.readonly` es scope **restringido** de Google: riesgo real de bloqueo por política del dominio. Decisión: nos quedamos con el botón "Abrir Chat"; solo se retoma si IT prepara ese proyecto GCP.
- **⚠️ v47→v48 (22/09/2026) — INCIDENTE:** v47 añadió `.setFaviconUrl(LOGO_TAISA_DATA_URI)` (el logo en base64) a `Shell.gs`. `setFaviconUrl` NO admite `data:` URIs (solo URL `http(s)://` real terminada en extensión de imagen) — lanzó excepción SÍNCRONA dentro de `doGet()`, así que **tiró la app entera abajo para todos los jefes** (pantalla de "Exception..." en vez de Centinela), no solo el favicon. v48 revirtió esa línea en caliente para restaurar el servicio. **Lección:** cualquier `set*` que pueda lanzar excepción dentro de la cadena de `doGet()` es candidato a `try/catch` — un fallo decorativo no puede tirar toda la app.
- **v49 (22/09/2026):** favicon reintentado de forma segura (con Codex) — `Shell.gs` construye el `HtmlOutput` aparte y aplica `setFaviconUrl` en un `try/catch` propio (solo si `Config.gs` → `FAVICON_TAISA_URL` no está vacío); un fallo ahí ya no puede romper `doGet()`. `FAVICON_TAISA_URL` está vacío por ahora (icono genérico) hasta colgar el logo en una URL real `.png` accesible por HTTPS — Drive `uc?export=view` NO es fiable para esto (no es un contrato estable de Google); mejor Cloud Storage público o el CDN de la empresa si existe.

