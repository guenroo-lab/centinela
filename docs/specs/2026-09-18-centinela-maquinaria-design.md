# Centinela — Pieza 2: Maquinaria — Design

## Contexto

Segunda pestaña de Centinela (tras el cascarón + Turno + Sugerencias). Sustituye
un proyecto Apps Script independiente ya en uso ("Control Maquinarias Taisa",
Script ID `1O4VVYXQq91S_BO1T12E0LwYXgEajdIZlHGnBnAkC4tSRgwqJORFTPeNU`, clonado
y revisado durante el brainstorming) — el usuario quiere retirar ese documento
y que Maquinaria viva dentro de Centinela.

Del sistema viejo se reutilizan: el inventario real (18 máquinas), las
direcciones de correo del SAT por marca, y la lógica de qué dispara aviso vs
qué dispara correo al SAT. Se cambian dos cosas a propósito (decisión
explícita del usuario): el envío al SAT pasa de "agrupado, disparado a mano
desde un menú de Sheets" a **individual y automático**; y se añade
**historial** (el sistema viejo borraba la avería al resolverla, sin dejar
rastro — ahora se archiva).

## Inventario de partida (18 máquinas, tal cual las pasó el usuario)

Columnas: ID INTERNO, MAQUINA, PROPIETARIA, Designacion, SERIAL, ESTADO,
OBSERVACIÓN, Fecha actualizacion, PRESUPUESTADO, ACEPTADO, Observaciones
tras revisión. Se cargan las 18 filas reales que dio el usuario (13 Linde,
5 Still; todas "OK" salvo la #14 y #18, "Averiada").

## Datos — dos hojas nuevas en la spreadsheet "Centinela"

### `Maquinaria` (inventario activo — 1 fila por máquina, fija en 18 salvo altas futuras)

| Columna | Contenido |
|---|---|
| ID Interno | Igual que la tabla vieja (1-18) |
| Maquina | Tipo (ej. "TRANSPALETA ELECT") |
| Propietaria | `Linde` \| `Still` — determina a qué SAT se avisa |
| Designacion | Código corto (MOTO/ELV/TORO/RT) |
| Serial | Identificador físico |
| Estado | `OK` \| `Fallas` \| `Averiada` |
| Observacion | Texto libre de la avería activa (vacío si OK) |
| Fecha Estado | Cuándo se puso el estado actual |
| Fecha Envio SAT | Cuándo se mandó el correo al SAT para la avería activa (vacío si OK, o si aún no se ha mandado) |
| Presupuestado | Texto/número libre — lo rellena un supervisor |
| Aceptado | Sí/No/texto libre — lo rellena un supervisor |
| Observaciones Revision | Lo que dice el SAT tras revisar/reparar — lo rellena un supervisor |

### `Historial_Maquinaria` (append-only, una fila por avería resuelta)

ID Interno, Maquina, Propietaria, Serial, Estado (Fallas/Averiada — el que
tuvo), Observacion, Fecha Inicio, Fecha Resuelto, Presupuestado, Aceptado,
Observaciones Revision, Resuelto Por (el jefe que la marcó OK).

## Flujo

**Reportar (cualquier jefe, en la pestaña Maquinaria):**
1. Elige máquina (desplegable por ID+tipo) → ve su serial actual.
2. Elige estado: OK / Fallas / Averiada.
3. Si no es OK, escribe observación (obligatoria, min. unos caracteres —
   mismo criterio que el formulario viejo).
4. Guardar → servidor decide:
   - **Estado nuevo es Fallas o Averiada Y la máquina estaba en OK** (avería
     nueva): guarda fila activa (Observacion/Fecha Estado), envía aviso
     interno (Pedro Gil + Jose Antonio Alcaide) **y** envía ya el correo al
     SAT correspondiente (Still o Linde según Propietaria, cc Jose Antonio),
     estampa Fecha Envio SAT.
   - **Estado nuevo es Fallas/Averiada Y la máquina YA estaba en Fallas o
     Averiada** (se edita/actualiza la observación de una avería en curso):
     actualiza Observacion/Fecha Estado, envía solo el aviso interno — **no**
     reenvía al SAT (evita duplicados; ya se avisó cuando pasó de OK a
     Fallas/Averiada la primera vez).
   - **Estado nuevo es OK** (resuelta): copia la fila activa completa
     (incluyendo lo que haya en Presupuestado/Aceptado/Observaciones
     Revision) a `Historial_Maquinaria` con Fecha Resuelto=ahora y Resuelto
     Por=jefe actual, y limpia la fila activa (Estado=OK, resto vacío).

**Ver historial (cualquier jefe, sin contraseña):** desde la ficha de una
máquina, lista de sus averías pasadas (`Historial_Maquinaria` filtrado por
ID Interno) — fecha, tipo, observación, si se aceptó presupuesto. Sirve
para ver patrones de fallos por máquina.

**Modo supervisor (Pedro Gil / Jose Antonio Alcaide):** mantener pulsado 2s
el texto "Centinela" de la cabecera del cascarón → pide una contraseña →
si es correcta (**`467`**), activa un modo supervisor para la sesión del
navegador (no persistente entre visitas — hay que repetir el gesto+
contraseña cada vez que se abre la app). En modo supervisor, dentro de
Maquinaria aparece una sección "Revisión SAT": lista de máquinas con
Fallas/Averiada activa, cada una con campos editables Presupuestado /
Aceptado / Observaciones Revision, que se guardan en su fila activa (se
archivarán junto con el resto cuando el jefe correspondiente marque la
máquina como OK).

El gesto de "mantener pulsado" y el modo supervisor viven en el **cascarón**
(`ShellUI.html`), no dentro de Maquinaria — es un concepto compartido de
Centinela, reutilizable cuando se construya Personal (que también necesitará
una forma de restringir acceso).

## Direcciones (verificadas con el usuario, iguales al sistema viejo)

- Aviso interno (cualquier Fallas/Averiada nueva o editada): `Pedro.gil@ext.leroymerlin.es`, `jose-antonio.alcaide@ext.leroymerlin.es`
- SAT Still (Propietaria=Still): para `service.flotasbcn@still.es, angel.gordo@still.es, carresur@carresur.com`, cc `jose-antonio.alcaide@ext.leroymerlin.es`
- SAT Linde (Propietaria=Linde): para `satmalaga@linde-mh.es`, cc `jose-antonio.alcaide@ext.leroymerlin.es`

## Arquitectura

Mismo patrón que Turno/Sugerencias: `Maquinaria.gs` (lógica) +
`MaquinariaUI.html` (fragmento, tokens del cascarón, sin `<!DOCTYPE>`/
`<html>`/`<head>`/`<body>`) + nueva entrada en `ShellUI.html` (pestaña +
`<?!= include('MaquinariaUI'); ?>`). Cabeceras de las 2 hojas nuevas se
añaden a `Config.gs` (`CABECERAS_MAQUINARIA`, `CABECERAS_HISTORIAL_MAQUINARIA`)
y `asegurarPestanas_` pasa a crearlas también. La carga de las 18 filas
iniciales va en `setupSistemaCompleto()` (solo si la hoja `Maquinaria` se
crea vacía por primera vez — no sobreescribe si ya tiene datos).

**Modo supervisor** en `ShellUI.html`: estado en memoria de página
(`CentinelaState.supervisor = false`), gesto de pulsación larga sobre
`.brand-nombre` (event listener `touchstart`/`mousedown` + temporizador
2000ms, cancelable si suelta antes), `prompt()`-equivalente (reutilizar
patrón de modal simple, no el `prompt()` nativo del navegador — más
consistente visualmente) para la contraseña, comparación en cliente contra
`"467"` (no hace falta verificación en servidor: no protege datos
sensibles de personas, solo evita que un jefe cualquiera toque
presupuestos por error).

## Fuera de alcance

- Dar de alta máquinas nuevas desde la app (el inventario es fijo por
  ahora, 18 máquinas — si hace falta añadir una, se hace editando
  `Config.gs`/la hoja directamente).
- Notificar por Slack/otro canal — solo email, igual que el resto de
  Centinela.
- Cualquier lógica de Residuos o Personal (piezas propias, aparte).

## Testing / verificación

Mismo patrón ya usado en Turno/Sugerencias/cascarón: `node --check` en
`Maquinaria.gs`, evaluación recursiva real de scriptlets (la técnica
corregida tras el bug de `include()` — no un resolve manual de un solo
nivel) sobre la página completa, y smoke test de
`procesarActualizacionMaquina` (los 3 casos: avería nueva → email SAT;
avería editada → sin reenvío; vuelta a OK → archiva en historial).
