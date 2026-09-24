# Centinela — Pieza 1: Cascarón + Turno como pestaña + Sugerencias — Design

## Contexto

La app "Control de Turno – Taisa" (v3.2, no desplegada aún en producción real)
se convierte en el primer módulo de **Centinela**, una plataforma más amplia
de gestión del almacén. Petición del usuario: 4 pestañas independientes
(Turno / Maquinaria / Residuos / Personal) + botón de sugerencias. Se
decidió construir todo antes de poner nada en marcha ("hasta que no esté
terminado no lo voy a poner en marcha").

Esta pieza es **solo el cascarón**: la navegación por pestañas, la identidad
compartida, el sistema visual, y Control de Turno migrado dentro como
pestaña 1 (sin tocar su lógica de negocio, ya reparada en v3.2). Maquinaria,
Residuos y Personal son piezas futuras, cada una con su propio spec → plan
→ implementación.

Decisiones tomadas en la sesión de brainstorming (una por una, con el
usuario):
- Navegación: barra fija abajo, 4 iconos+texto.
- Identidad: selector único "¿quién eres?" (los 4 jefes de equipo actuales)
  al abrir Centinela, válido para las 4 pestañas — ningún módulo lo repite.
- Sugerencias: icono flotante visible en cualquier pestaña, no ocupa hueco
  de las 4 pestañas principales. Envía email a Pedro Gil + guarda en Sheets.
- Datos: una sola hoja de cálculo "Centinela", una pestaña de Sheets por
  módulo.
- Nombre: "Centinela" pasa a ser el nombre principal visible de la app.
- Sistema visual: se copia **literalmente** el sistema ya en producción de
  Kairos (`Desktop\Proyectos\Kairos\kairos-operario\Index.html`, Pieza 7 de
  ese proyecto) — tokens de color, componentes, selector de tema, iconos
  SVG. Ver sección "Sistema visual" abajo para el detalle exacto copiado.

## Arquitectura

**Multi-archivo dentro del mismo proyecto Apps Script** (Script ID
`1mrj0RUSqX-2g37A1LyNPyX-pwPyE0a2UegRQIJQqZ3esrbnyOnZjXDI7`, el que ya tiene
Control de Turno v3.2 desplegado). Se sube con `clasp push` (ya configurado
y probado en esta sesión) — no hace falta copiar/pegar a mano.

```
Config.gs           → JEFES_EQUIPO, ID de la hoja Centinela (PropertiesService)
Utilidades.gs        → escapeHtml, clampEstado, dataUriABlob, helpers de Sheets/email compartidos
Shell.gs              → doGet(), sirve ShellUI.html con los includes de cada módulo
Turno.gs               → toda la lógica de Control de Turno (la que ya existe en v3.2, movida tal cual)
Sugerencias.gs          → procesarSugerencia(data)
ShellUI.html             → cascarón: tokens de tema, cabecera de marca, selector "quién eres",
                            barra de pestañas, botón flotante de sugerencias, incluye TurnoUI/SugerenciasUI
TurnoUI.html              → HTML/CSS/JS de Control de Turno (migrado de getAppHtml(), colores
                            repintados a los tokens Centinela)
SugerenciasUI.html         → formulario del botón flotante
```

Composición: `Shell.gs` usa `HtmlService.createTemplateFromFile('ShellUI')`
+ `<?!= include('TurnoUI') ?>` / `<?!= include('SugerenciasUI') ?>` (patrón
estándar de Apps Script para HTML multi-archivo). Sin scriptlets booleanos
(`<?= boolVar ?>`) en ningún include — solo `include()` de texto, evitando
el gotcha ya conocido de HtmlTemplate.

Cambio de pestaña: 100% cliente (igual que el sistema de pantallas que ya
tiene Turno), sin recarga de página — un solo `doGet()` sirve todo.

## Sistema visual (copiado de Kairos, sin modificar valores)

**Tokens** (`:root` + `[data-kmode="light"]` + `[data-ktheme="..."]`):
- Superficie: `--ink-950/900/850/800/700/600`
- Texto: `--text-100/300/500/600`
- Semántico: `--ok`/`--ok-ink`, `--warn-bg/fg/line`, `--danger-bg/fg/line`
- Acento (4 temas): `indigo`, `lmgreen`, `taisared` (por defecto), `amber` —
  cada uno define `--accent`/`--accent-ink`/`--accent-dim`/`--accent-line`.
  Solo `lmgreen` y `taisared` tienen variante clara; `indigo`/`amber` son
  solo oscuros (`TEMAS_MODOS`, tal cual Kairos).
- `--radius-card/btn/chip`, `--shadow-card`.
- Modo/tema por defecto: `dark` + `taisared` (coincide con la identidad
  Taisa que ya tenía Turno).

**Componentes reutilizados tal cual:** botones base + variantes pastel
(`.aviso`/`.peligro`/`.ok`/`.neutro` — Turno ya usa esta paleta para sus 5
niveles de valoración, encaja directo), `.fila` (tarjeta), `.chip`,
`.tabs` (barra de pestañas), cabecera de marca (`.brand-head`/
`.brand-badge`/`.brand-nombre`), panel de selector de tema
(`.theme-panel`/`.pick`), `kModal_()` (modal propio para confirmaciones,
sustituye `alert`/`confirm` nativos — se deja disponible en `Utilidades`
para que los módulos futuros lo usen).

**Iconos:** SVG inline trazo fino (`stroke-width:1.8`, `stroke-linecap:round`),
mismo patrón que `ICONO_TABS` de Kairos. Se crean 4 iconos nuevos para
Turno/Maquinaria/Residuos/Personal (líneas simples, mismo estilo). Sustituye
los emoji que usaba Turno como iconos de pestaña/tarjeta; los emoji dentro
de los 5 niveles de valoración (⛔🔴🟡🟢⭐) se mantienen — son parte del
patrón pastel ya calcado de `PreparacionPedidosPC`, no navegación.

**Selector de tema:** botón "Tema" en la cabecera (icono SVG + texto),
despliega el panel de modo (Oscuro/Claro) + acento (4 opciones, solo
muestra los compatibles con el modo activo). Persistencia en
`localStorage` (`kairos_mode_pick`/`kairos_theme_pick` — mismas claves que
Kairos, por si en el futuro se comparte dispositivo entre apps del
ecosistema Taisa) — por dispositivo, no por usuario (igual razón que
Kairos: ningún jefe tiene login personal donde guardar esto server-side).

**Logo:** se reutiliza `LOGO_TAISA_B64` que ya existe en
`ControlTurno_Taisa_SIMPLIFICADO.js` (mismos bytes que usa Kairos). No se
añade logo de Leroy Merlin — Centinela es herramienta interna, no cara a
tienda.

**Migración de colores de Turno:** el CSS específico de Turno (zona de
cámara, botones de valoración, tarjetas de resultado) se re-apunta a los
tokens Centinela en vez de sus variables propias (`--bg`→`--ink-950`,
`--surface`→`--ink-900`, `--surface2`→`--ink-850`, `--muted`→`--text-500`,
`--red`→`--accent`, `--red-text`→`--accent` cuando el acento activo ya
resuelve el contraste — ver "Riesgos" abajo sobre validar esto por acento).
El HTML del **email** de Turno (documento aparte, sin acceso a CSS
variables del navegador) sigue con sus valores hex fijos tal cual quedaron
en v3.2 (ya corregidos) — Gmail no puede leer `var(--accent)`, así que ahí
no aplica el sistema de temas.

## Datos

Nueva hoja de cálculo **"Centinela"** (sustituye a "Control de Turno –
Taisa v3"). `setupSistemaCompleto()` se mueve a `Config.gs`, crea/reutiliza
esta hoja única, con pestañas de Sheets:
- `Registros_Turno` (la que ya existe, misma estructura — sin cambios).
- `Sugerencias` (nueva): Fecha, Hora, Quién, Texto.

Como Turno nunca llegó a producción, no hay migración de datos reales que
hacer.

## Botón de sugerencias

Icono circular flotante (esquina inferior, por encima de la barra de
pestañas, visible en cualquier pestaña). Abre un formulario corto
(`SugerenciasUI.html`): textarea libre + botón enviar. `procesarSugerencia`
(en `Sugerencias.gs`) valida que quién eres esté seleccionado + el texto no
esté vacío, guarda en la pestaña `Sugerencias` (con `LockService`, mismo
patrón que Turno) y envía email a Pedro Gil (asunto
`[Centinela] Sugerencia de <jefe>`).

## Turno como pestaña 1

- Su lógica de servidor (`procesarRegistro`, `guardarEnHoja`,
  `enviarInformeEmail`, `generarHTMLEmail`, validaciones, etc.) se mueve a
  `Turno.gs` **sin cambios de comportamiento** — ya está reparada en v3.2.
- `TURNOS`/`ZONA_DISPOSITIVOS` se mueven a `Config.gs` (junto a
  `JEFES_EQUIPO`) ya que son configuración compartida potencialmente útil
  para Maquinaria más adelante (misma idea de "roles").
- Su HTML/CSS/JS (hoy generado por `getAppHtml()`) pasa a `TurnoUI.html`,
  quitando su cabecera propia (logo+título — ahora los pone el cascarón una
  sola vez) y su pantalla de selección de jefe (ahora la hace el cascarón).
  El flujo de Turno empieza directamente en la selección de rol/turno
  (jefe ya viene dado por el selector de Centinela).
- El selector de rol de Turno sigue siendo su propia elección (no todos los
  módulos comparten "rol", cada uno tiene el suyo si aplica).

## Fuera de alcance (piezas futuras, specs propios)

- Funcionalidad real de Maquinaria (inventario, estado, peticiones SAT).
- Funcionalidad real de Residuos (peticiones a Recisur, tipos de cuba).
- Funcionalidad real de Personal (canal de incidencias/peticiones sobre
  operarios) — pendiente además decidir control de acceso, dato sensible.
- Estas 3 pestañas NO aparecen todavía en la barra (se añaden cuando se
  construya cada una) — no hay "próximamente" en esta pieza porque nada se
  pone en marcha hasta tener las 4 completas.

## Testing / verificación

Sin acceso a navegador real para esta app (mismo motivo que Kairos: no hay
forma de abrir la webapp desde esta sesión). Verificación mínima, igual
patrón que se usó para v3.2:
- `node --check` sobre cada `.gs` (sintaxis JS válida).
- Extracción + `new Function()` de cada bloque `<script>` de cada `.html`
  con los includes resueltos a mano (mismo patrón que
  `tecnica-verificar-js-gas-con-node-antes-de-push`).
- Smoke test de `generarHTMLEmail`/`procesarRegistro`/`procesarSugerencia`
  con globales de GAS mockeados (Logger/Utilities/PropertiesService/etc),
  igual que se hizo para v3.2.
- Revisión manual de que el HTML generado por `Shell.gs` con los includes
  resueltos no tiene tags rotos.

## Riesgos / decisiones

- **Contraste por acento:** los 4 acentos no están garantizados a pasar
  4.5:1 igual en todos los usos de texto (el spec de Kairos ya distingue
  `--accent` de `--accent-ink` para esto). Al repintar el CSS de Turno hay
  que revisar caso por caso qué variable usar (texto vs fondo), no un
  reemplazo mecánico 1:1. Si algún caso queda dudoso, se prioriza legibilidad
  sobre fidelidad literal al valor de Kairos.
- **Sin verificación visual real:** como con Kairos, la verificación es
  sintáctica + smoke test, no visual en navegador. Riesgo aceptado, mismo
  que ya se aceptó para Kairos.
- **Tamaño de la pieza:** toca bastante superficie (cascarón nuevo +
  migración completa de Turno + módulo nuevo de Sugerencias). El plan de
  implementación debe ir archivo por archivo, no como un cambio monolítico.
- **Deploy:** se sube con `clasp push` + `clasp deploy` (nueva versión,
  reemplazando la @16 actual) al mismo proyecto ya limpio (Script ID de
  arriba). Sigue sin ponerse en marcha de cara a los jefes hasta que las 4
  pestañas estén completas, según instrucción explícita del usuario.
