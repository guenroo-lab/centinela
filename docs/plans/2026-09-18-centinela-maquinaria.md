# Centinela — Pieza 2: Maquinaria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Maquinaria" tab to Centinela that replaces the standalone "Control Maquinarias Taisa" app — report machine status (OK/Fallas/Averiada), auto-email the right SAT (Still/Linde) on a new fault without duplicating on edits, archive resolved faults to a history sheet, and let a password-gated "supervisor" fill in post-repair paperwork.

**Architecture:** Same pattern as Turno/Sugerencias — `Maquinaria.gs` (logic) + `MaquinariaUI.html` (fragment using the shell's tokens) + one new tab entry in `ShellUI.html`. Supervisor mode (long-press "Centinela" + password `467`) lives in the shell, not the module, so Personal can reuse it later.

**Tech Stack:** Google Apps Script (V8), vanilla HTML/CSS/JS, same verification approach as Pieza 1 (`node --check`, recursive scriptlet evaluation, smoke tests with mocked GAS globals).

**Source of truth reused from the old standalone app** (cloned during brainstorming from Script ID `1O4VVYXQq91S_BO1T12E0LwYXgEajdIZlHGnBnAkC4tSRgwqJORFTPeNU`): SAT email addresses, internal notice recipients, the 18-machine inventory the user pasted.

---

### Task 1: `Config.gs` — sheets, headers, seed data

**Files:**
- Modify: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Config.gs`

- [ ] **Step 1: Add sheet names to `CONFIG`**

Find:
```javascript
  SHEET_NAME_TURNO: "Registros_Turno",
  SHEET_NAME_SUGERENCIAS: "Sugerencias",
```
Replace with:
```javascript
  SHEET_NAME_TURNO: "Registros_Turno",
  SHEET_NAME_SUGERENCIAS: "Sugerencias",
  SHEET_NAME_MAQUINARIA: "Maquinaria",
  SHEET_NAME_HISTORIAL_MAQUINARIA: "Historial_Maquinaria",
```

- [ ] **Step 2: Add headers + seed data (after `CABECERAS_SUGERENCIAS`)**

```javascript
const CABECERAS_MAQUINARIA = [
  "ID Interno", "Maquina", "Propietaria", "Designacion", "Serial", "Estado",
  "Observacion", "Fecha Estado", "Fecha Envio SAT", "Presupuestado",
  "Aceptado", "Observaciones Revision"
];

const CABECERAS_HISTORIAL_MAQUINARIA = [
  "ID Interno", "Maquina", "Propietaria", "Serial", "Estado", "Observacion",
  "Fecha Inicio", "Fecha Resuelto", "Presupuestado", "Aceptado",
  "Observaciones Revision", "Resuelto Por"
];

// Inventario real de partida (18 máquinas). Las #14 y #18 ya estaban
// Averiadas en el sistema viejo — se cargan con su observación/fecha real
// en vez de resetearlas a OK, y con Fecha Envio SAT puesta a la fecha en que
// ya se avisó al SAT entonces, para no volver a mandar ese correo al
// ejecutar setupSistemaCompleto().
const MAQUINAS_INICIALES = [
  [1, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05118", "OK", "", "", "", "", "", ""],
  [2, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05117", "OK", "", "", "", "", "", ""],
  [3, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P04995", "OK", "", "", "", "", "", ""],
  [4, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P04973", "OK", "", "", "", "", "", ""],
  [5, "TRANSPALETA ELECT 2.4", "Linde", "MOTO", "W4X131V08723", "OK", "", "", "", "", "", ""],
  [6, "ELEVADORA", "Still", "ELV", "EXV-SF16 / F20329X00058", "OK", "", "", "", "", "", ""],
  [7, "TRANSPALETA ELECT DOBLE", "Still", "MOTO", "EXH – SF20 / W42362X00664", "OK", "", "", "", "", "", ""],
  [8, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05085", "OK", "", "", "", "", "", ""],
  [9, "TORITO PEQUEÑO", "Linde", "TORO", "E16L / H21251R04660", "OK", "", "", "", "", "", ""],
  [10, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02353", "OK", "", "", "", "", "", ""],
  [11, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02292", "OK", "", "", "", "", "", ""],
  [12, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02301", "OK", "", "", "", "", "", ""],
  [13, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02282", "OK", "", "", "", "", "", ""],
  [14, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02341", "Averiada", "Averiada fallo t-222", "15/09/2026", "30/07/2026", "", "", ""],
  [15, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02364", "OK", "", "", "", "", "", ""],
  [16, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02368", "OK", "", "", "", "", "", ""],
  [17, "TRANSPALETA ELECT", "Still", "MOTO", "EXH – SF20 / W42362X00621", "OK", "", "", "", "", "", ""],
  [18, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05010", "Averiada", "Cambiar ruedas, va muy muy mal", "15/09/2026", "20/07/2026", "", "", ""]
];
```

- [ ] **Step 3: Seed the sheet on creation — modify `crearHojaCentinela_`**

Find:
```javascript
  const sugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
  escribirCabeceras(sugerencias, CABECERAS_SUGERENCIAS);

  Logger.log("✅ Hoja Centinela creada: " + ss.getUrl());
  return ss;
}
```
Replace with:
```javascript
  const sugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
  escribirCabeceras(sugerencias, CABECERAS_SUGERENCIAS);

  const maquinaria = ss.insertSheet(CONFIG.SHEET_NAME_MAQUINARIA);
  escribirCabeceras(maquinaria, CABECERAS_MAQUINARIA);
  maquinaria.getRange(2, 1, MAQUINAS_INICIALES.length, CABECERAS_MAQUINARIA.length).setValues(MAQUINAS_INICIALES);

  const historialMaquinaria = ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
  escribirCabeceras(historialMaquinaria, CABECERAS_HISTORIAL_MAQUINARIA);

  Logger.log("✅ Hoja Centinela creada: " + ss.getUrl());
  return ss;
}
```

- [ ] **Step 4: Also create+seed them if the spreadsheet already existed — modify `asegurarPestanas_`**

Find:
```javascript
function asegurarPestanas_(ss) {
  let hojaTurno = ss.getSheetByName(CONFIG.SHEET_NAME_TURNO);
  if (!hojaTurno) {
    hojaTurno = ss.insertSheet(CONFIG.SHEET_NAME_TURNO);
    escribirCabeceras(hojaTurno, CABECERAS_TURNO);
  }
  let hojaSugerencias = ss.getSheetByName(CONFIG.SHEET_NAME_SUGERENCIAS);
  if (!hojaSugerencias) {
    hojaSugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
    escribirCabeceras(hojaSugerencias, CABECERAS_SUGERENCIAS);
  }
}
```
Replace with:
```javascript
function asegurarPestanas_(ss) {
  let hojaTurno = ss.getSheetByName(CONFIG.SHEET_NAME_TURNO);
  if (!hojaTurno) {
    hojaTurno = ss.insertSheet(CONFIG.SHEET_NAME_TURNO);
    escribirCabeceras(hojaTurno, CABECERAS_TURNO);
  }
  let hojaSugerencias = ss.getSheetByName(CONFIG.SHEET_NAME_SUGERENCIAS);
  if (!hojaSugerencias) {
    hojaSugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
    escribirCabeceras(hojaSugerencias, CABECERAS_SUGERENCIAS);
  }
  let hojaMaquinaria = ss.getSheetByName(CONFIG.SHEET_NAME_MAQUINARIA);
  if (!hojaMaquinaria) {
    hojaMaquinaria = ss.insertSheet(CONFIG.SHEET_NAME_MAQUINARIA);
    escribirCabeceras(hojaMaquinaria, CABECERAS_MAQUINARIA);
    hojaMaquinaria.getRange(2, 1, MAQUINAS_INICIALES.length, CABECERAS_MAQUINARIA.length).setValues(MAQUINAS_INICIALES);
  }
  let hojaHistorialMaquinaria = ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
  if (!hojaHistorialMaquinaria) {
    hojaHistorialMaquinaria = ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
    escribirCabeceras(hojaHistorialMaquinaria, CABECERAS_HISTORIAL_MAQUINARIA);
  }
}
```

- [ ] **Step 5: Verify syntax**

Run: `node --check < "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Config.gs"`
Expected: no output (exit 0).

---

### Task 2: `Maquinaria.gs` — business logic

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Maquinaria.gs`

- [ ] **Step 1: Write the file**

```javascript
// ============================================================
//  CENTINELA — MAQUINARIA
// ============================================================

// Columnas de la hoja Maquinaria (1-indexadas, para getRange):
// 1 ID | 2 Maquina | 3 Propietaria | 4 Designacion | 5 Serial | 6 Estado |
// 7 Observacion | 8 Fecha Estado | 9 Fecha Envio SAT | 10 Presupuestado |
// 11 Aceptado | 12 Observaciones Revision

function obtenerMaquinas() {
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_MAQUINARIA);
  if (!sheet) return [];
  const datos = sheet.getDataRange().getValues();
  const maquinas = [];
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    if (fila[0] === "" || fila[0] === null) continue;
    maquinas.push({
      id: fila[0], maquina: fila[1], propietaria: fila[2], designacion: fila[3],
      serial: fila[4], estado: fila[5], observacion: fila[6]
    });
  }
  return maquinas;
}

function obtenerMaquinasConAveria() {
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_MAQUINARIA);
  if (!sheet) return [];
  const datos = sheet.getDataRange().getValues();
  const resultado = [];
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    if (fila[5] === "Fallas" || fila[5] === "Averiada") {
      resultado.push({
        id: fila[0], maquina: fila[1], serial: fila[4], estado: fila[5],
        observacion: fila[6], presupuestado: fila[9], aceptado: fila[10],
        observacionesRevision: fila[11]
      });
    }
  }
  return resultado;
}

function obtenerHistorialMaquina(id) {
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
  if (!sheet) return [];
  const datos = sheet.getDataRange().getValues();
  const resultado = [];
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(id).trim()) {
      resultado.push({
        estado: datos[i][4], observacion: datos[i][5], fechaInicio: datos[i][6],
        fechaResuelto: datos[i][7], presupuestado: datos[i][8],
        aceptado: datos[i][9], observacionesRevision: datos[i][10],
        resueltoPor: datos[i][11]
      });
    }
  }
  return resultado.reverse();
}

function procesarActualizacionMaquina(data) {
  Logger.log("📥 Actualizando maquina: " + (data && data.id));

  if (!data) throw new Error("No se han recibido datos.");
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  if (!data.id) throw new Error("Falta la máquina.");
  const estado = data.estado;
  if (["OK", "Fallas", "Averiada"].indexOf(estado) === -1) {
    throw new Error("Estado no válido: " + estado);
  }
  const observacion = (data.observacion || "").trim();
  if (estado !== "OK" && observacion.length < 5) {
    throw new Error("Describe la avería (mínimo unos caracteres).");
  }

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }

  try {
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_MAQUINARIA);
    if (!sheet) return { success: false, error: "Hoja de Maquinaria no encontrada." };

    const datos = sheet.getDataRange().getValues();
    let filaIdx = -1;
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === String(data.id).trim()) { filaIdx = i; break; }
    }
    if (filaIdx === -1) return { success: false, error: "Máquina no encontrada." };

    const fila = filaIdx + 1;
    const actual = datos[filaIdx];
    const estadoAnterior = actual[5];
    const nombreMaquina = actual[1];
    const propietaria = actual[2];
    const serial = actual[4];
    const tz = Session.getScriptTimeZone();
    const fechaStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm");

    if (estado === "OK") {
      if (estadoAnterior !== "OK") {
        const filaHistorial = [
          actual[0], nombreMaquina, propietaria, serial, estadoAnterior, actual[6],
          actual[7], fechaStr, actual[9], actual[10], actual[11], data.jefe_equipo
        ];
        let hojaHist = ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
        if (!hojaHist) hojaHist = ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
        asegurarCabeceras_(hojaHist, CABECERAS_HISTORIAL_MAQUINARIA);
        hojaHist.appendRow(filaHistorial);
      }
      sheet.getRange(fila, 6, 1, 7).setValues([["OK", "", "", "", "", "", ""]]);
      SpreadsheetApp.flush();
      return { success: true, avisoSat: false };
    }

    // Fallas / Averiada
    const esNueva = (estadoAnterior === "OK");
    sheet.getRange(fila, 6, 1, 2).setValues([[estado, observacion]]);
    sheet.getRange(fila, 8, 1, 1).setValue(fechaStr);

    let avisoSat = false;
    if (esNueva) {
      sheet.getRange(fila, 9, 1, 1).setValue(fechaStr);
      avisoSat = enviarAvisoSat_(propietaria, actual[0], nombreMaquina, serial, observacion);
    }
    enviarAvisoInternoMaquinaria_(actual[0], nombreMaquina, estado, observacion, data.jefe_equipo);

    SpreadsheetApp.flush();
    return { success: true, avisoSat: avisoSat };

  } catch (e) {
    Logger.log("❌ Error actualizando maquinaria: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function guardarRevisionSat(data) {
  if (!data || !data.id) throw new Error("Falta la máquina.");

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }

  try {
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_MAQUINARIA);
    if (!sheet) return { success: false, error: "Hoja de Maquinaria no encontrada." };
    const datos = sheet.getDataRange().getValues();
    let filaIdx = -1;
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === String(data.id).trim()) { filaIdx = i; break; }
    }
    if (filaIdx === -1) return { success: false, error: "Máquina no encontrada." };

    sheet.getRange(filaIdx + 1, 10, 1, 3).setValues([[
      data.presupuestado || "", data.aceptado || "", data.observacionesRevision || ""
    ]]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error guardando revisión SAT: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function enviarAvisoSat_(propietaria, id, nombreMaquina, serial, observacion) {
  const marca = String(propietaria).trim().toLowerCase();
  let para, cc;
  if (marca === "still") {
    para = "service.flotasbcn@still.es, angel.gordo@still.es, carresur@carresur.com";
    cc = "jose-antonio.alcaide@ext.leroymerlin.es";
  } else if (marca === "linde") {
    para = "satmalaga@linde-mh.es";
    cc = "jose-antonio.alcaide@ext.leroymerlin.es";
  } else {
    Logger.log("⚠️ Propietaria desconocida, no se avisa al SAT: " + propietaria);
    return false;
  }
  try {
    const asunto = "⚠️ Avería TAISA - " + nombreMaquina + " (ID " + id + ")";
    const html = "<table border=\"1\" cellpadding=\"5\" style=\"border-collapse:collapse;width:100%;\">" +
      "<tr style=\"background:#1d3557;color:#fff;\"><th>ID</th><th>Máquina</th><th>Serie</th><th>Avería</th></tr>" +
      "<tr><td>" + escapeHtml(id) + "</td><td>" + escapeHtml(nombreMaquina) + "</td><td>" + escapeHtml(serial) + "</td><td>" + escapeHtml(observacion) + "</td></tr></table>";
    MailApp.sendEmail({ to: para, cc: cc, subject: asunto, htmlBody: "<h2>Aviso de avería</h2>" + html });
    return true;
  } catch (e) {
    Logger.log("❌ Error enviando aviso SAT: " + e.message);
    return false;
  }
}

function enviarAvisoInternoMaquinaria_(id, nombreMaquina, estado, observacion, jefe) {
  try {
    const destinatarios = "Pedro.gil@ext.leroymerlin.es, jose-antonio.alcaide@ext.leroymerlin.es";
    const asunto = "🚨 " + estado + " - " + nombreMaquina + " (ID " + id + ")";
    const html = "<div style=\"font-family:Arial;border:1px solid #ccc;padding:15px;\">" +
      "<h2 style=\"color:#1d3557;\">Aviso de Maquinaria — Centinela</h2>" +
      "<p><b>ID:</b> " + escapeHtml(id) + " | <b>Máquina:</b> " + escapeHtml(nombreMaquina) + "</p>" +
      "<p><b>Estado:</b> " + escapeHtml(estado) + "</p>" +
      "<p><b>Observación:</b> " + escapeHtml(observacion) + "</p>" +
      "<p><b>Reportado por:</b> " + escapeHtml(jefe) + "</p>" +
      "<hr><p style=\"font-size:11px;\">Centinela — Control de Maquinaria</p></div>";
    MailApp.sendEmail({ to: destinatarios, subject: asunto, htmlBody: html });
  } catch (e) {
    Logger.log("❌ Error enviando aviso interno maquinaria: " + e.message);
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check < "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Maquinaria.gs"`
Expected: no output (exit 0).

---

### Task 3: `MaquinariaUI.html` — fragment

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\MaquinariaUI.html`

- [ ] **Step 1: Write the file**

```html
<style>
  .maq-select { width:100%; background:var(--ink-950); border:1px solid var(--ink-700); border-radius:var(--radius-btn); color:var(--text-100); padding:12px; font-size:15px; margin-bottom:12px; }
  .maq-info { background:var(--ink-900); border:1px solid var(--ink-800); border-radius:var(--radius-card); padding:14px; margin-bottom:14px; font-size:13px; color:var(--text-500); }
  .maq-info b { color:var(--text-100); }
  .maq-estados { display:flex; gap:8px; margin-bottom:12px; }
  .maq-estado-btn { flex:1; cursor:pointer; border:1px solid var(--ink-700); background:var(--ink-900); color:var(--text-300); border-radius:var(--radius-btn); padding:12px 4px; font-size:13px; font-weight:700; text-align:center; }
  .maq-estado-btn.sel-OK { border-color:var(--ok); background:var(--ink-900); color:var(--ok); }
  .maq-estado-btn.sel-Fallas { border-color:var(--warn-line); background:var(--warn-bg); color:var(--warn-fg); }
  .maq-estado-btn.sel-Averiada { border-color:var(--danger-line); background:var(--danger-bg); color:var(--danger-fg); }
  .maq-textarea { width:100%; min-height:90px; background:var(--ink-950); border:1px solid var(--ink-700); border-radius:var(--radius-btn); color:var(--text-100); padding:12px; font-size:15px; font-family:inherit; resize:vertical; margin-bottom:12px; }
  .maq-btn-guardar { width:100%; cursor:pointer; border:none; border-radius:var(--radius-btn); padding:14px; min-height:48px; font-size:15px; font-weight:800; background:var(--accent); color:var(--accent-ink); }
  .maq-hist-item { background:var(--ink-900); border:1px solid var(--ink-800); border-radius:var(--radius-card); padding:12px; margin-bottom:8px; font-size:13px; }
  .maq-hist-item .fecha { color:var(--text-500); font-size:11.5px; }
  .maq-sup-card { background:var(--ink-900); border:1px solid var(--warn-line); border-radius:var(--radius-card); padding:14px; margin-bottom:10px; }
  .maq-sup-card input { width:100%; background:var(--ink-950); border:1px solid var(--ink-700); border-radius:var(--radius-btn); color:var(--text-100); padding:10px; font-size:14px; margin-top:6px; margin-bottom:8px; box-sizing:border-box; }
  .maq-sup-card button { width:100%; cursor:pointer; border:none; border-radius:var(--radius-btn); padding:10px; font-size:13px; font-weight:700; background:var(--accent); color:var(--accent-ink); }
</style>

<h1 style="font-size:19px;font-weight:800;margin:0 0 4px;">🔧 Maquinaria</h1>
<p style="color:var(--text-500);font-size:13px;margin:0 0 14px;">Reporta el estado de una máquina.</p>

<select class="maq-select" id="maqSelect" onchange="maqSeleccionar()">
  <option value="">— Selecciona máquina —</option>
</select>

<div class="maq-info" id="maqInfo" style="display:none;">
  <div><b id="maqInfoNombre"></b> · <span id="maqInfoSerial"></span></div>
  <div>Estado actual: <b id="maqInfoEstado"></b></div>
</div>

<div id="maqFormulario" style="display:none;">
  <div class="maq-estados">
    <div class="maq-estado-btn" id="maqEstadoBtn-OK" onclick="maqElegirEstado('OK')">OK</div>
    <div class="maq-estado-btn" id="maqEstadoBtn-Fallas" onclick="maqElegirEstado('Fallas')">Fallas</div>
    <div class="maq-estado-btn" id="maqEstadoBtn-Averiada" onclick="maqElegirEstado('Averiada')">Averiada</div>
  </div>
  <textarea class="maq-textarea" id="maqObservacion" placeholder="Describe el problema (obligatorio si no es OK)..."></textarea>
  <button type="button" class="maq-btn-guardar" id="maqBtnGuardar" onclick="maqGuardar()">Guardar</button>

  <div id="maqHistorialBox" style="margin-top:20px;">
    <h3 style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-500);margin:0 0 8px;">Historial de esta máquina</h3>
    <div id="maqHistorialLista" style="font-size:13px;color:var(--text-500);">—</div>
  </div>
</div>

<div id="maqSupervisorBox" style="display:none;margin-top:24px;">
  <h3 style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--warn-fg);margin:0 0 10px;">🔒 Revisión SAT (supervisor)</h3>
  <div id="maqSupervisorLista"></div>
</div>

<script>
  let maqCache = [];

  function maqInit() {
    google.script.run.withSuccessHandler(function (lista) {
      maqCache = lista;
      const sel = document.getElementById('maqSelect');
      sel.innerHTML = '<option value="">— Selecciona máquina —</option>' + lista.map(function (m) {
        return '<option value="' + m.id + '">' + m.id + ' · ' + m.maquina + ' (' + m.propietaria + ')</option>';
      }).join('');
    }).obtenerMaquinas();
  }

  let maqEstadoElegido = '';

  function maqSeleccionar() {
    const id = document.getElementById('maqSelect').value;
    const info = document.getElementById('maqInfo');
    const formulario = document.getElementById('maqFormulario');
    if (!id) { info.style.display = 'none'; formulario.style.display = 'none'; return; }
    const m = maqCache.find(function (x) { return String(x.id) === String(id); });
    if (!m) return;
    document.getElementById('maqInfoNombre').textContent = m.maquina;
    document.getElementById('maqInfoSerial').textContent = m.serial;
    document.getElementById('maqInfoEstado').textContent = m.estado;
    info.style.display = 'block';
    formulario.style.display = 'block';
    maqEstadoElegido = '';
    ['OK', 'Fallas', 'Averiada'].forEach(function (e) { document.getElementById('maqEstadoBtn-' + e).className = 'maq-estado-btn'; });
    document.getElementById('maqObservacion').value = '';
    maqCargarHistorial(id);
  }

  function maqElegirEstado(estado) {
    maqEstadoElegido = estado;
    ['OK', 'Fallas', 'Averiada'].forEach(function (e) {
      document.getElementById('maqEstadoBtn-' + e).className = 'maq-estado-btn' + (e === estado ? ' sel-' + e : '');
    });
  }

  function maqCargarHistorial(id) {
    const box = document.getElementById('maqHistorialLista');
    box.textContent = 'Cargando…';
    google.script.run.withSuccessHandler(function (historial) {
      if (!historial || !historial.length) { box.textContent = 'Sin averías registradas.'; return; }
      box.innerHTML = historial.map(function (h) {
        return '<div class="maq-hist-item"><div class="fecha">' + h.fechaInicio + ' → ' + h.fechaResuelto + '</div>' +
          '<div><b>' + h.estado + ':</b> ' + h.observacion + '</div></div>';
      }).join('');
    }).obtenerHistorialMaquina(id);
  }

  function maqGuardar() {
    const id = document.getElementById('maqSelect').value;
    const observacion = document.getElementById('maqObservacion').value.trim();
    if (!id) { showToast('❌ Selecciona una máquina'); return; }
    if (!maqEstadoElegido) { showToast('❌ Selecciona un estado'); return; }
    if (maqEstadoElegido !== 'OK' && observacion.length < 5) { showToast('❌ Describe la avería'); return; }
    if (!CentinelaState.jefe) { showToast('❌ Falta identificarte — recarga la app'); return; }

    const boton = document.getElementById('maqBtnGuardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    google.script.run
      .withSuccessHandler(function (result) {
        boton.disabled = false;
        boton.textContent = 'Guardar';
        if (result && result.success) {
          showToast(result.avisoSat ? '✅ Guardado, SAT avisado' : '✅ Guardado');
          maqInit();
          maqSeleccionar();
        } else {
          showToast('❌ ' + ((result && result.error) || 'Error desconocido'));
        }
      })
      .withFailureHandler(function (err) {
        boton.disabled = false;
        boton.textContent = 'Guardar';
        showToast('❌ Error del servidor: ' + (err && err.message ? err.message : err));
      })
      .procesarActualizacionMaquina({ jefe_equipo: CentinelaState.jefe, id: id, estado: maqEstadoElegido, observacion: observacion });
  }

  function maquinariaActualizarSupervisor() {
    const box = document.getElementById('maqSupervisorBox');
    if (!CentinelaState.supervisor) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const lista = document.getElementById('maqSupervisorLista');
    lista.textContent = 'Cargando…';
    google.script.run.withSuccessHandler(function (maquinas) {
      if (!maquinas || !maquinas.length) { lista.innerHTML = '<p style="color:var(--text-500);font-size:13px;">No hay averías activas.</p>'; return; }
      lista.innerHTML = maquinas.map(function (m) {
        return '<div class="maq-sup-card">' +
          '<b>' + m.id + ' · ' + m.maquina + '</b> (' + m.serial + ') — ' + m.estado + '<br>' +
          '<span style="color:var(--text-500);font-size:12px;">' + m.observacion + '</span>' +
          '<input type="text" id="maqPresu-' + m.id + '" placeholder="Presupuestado" value="' + (m.presupuestado || '') + '">' +
          '<input type="text" id="maqAcept-' + m.id + '" placeholder="Aceptado" value="' + (m.aceptado || '') + '">' +
          '<input type="text" id="maqObsRev-' + m.id + '" placeholder="Observaciones tras revisión" value="' + (m.observacionesRevision || '') + '">' +
          '<button type="button" onclick="maqGuardarRevision(\'' + m.id + '\')">Guardar revisión</button>' +
          '</div>';
      }).join('');
    }).obtenerMaquinasConAveria();
  }

  function maqGuardarRevision(id) {
    const presupuestado = document.getElementById('maqPresu-' + id).value;
    const aceptado = document.getElementById('maqAcept-' + id).value;
    const observacionesRevision = document.getElementById('maqObsRev-' + id).value;
    google.script.run
      .withSuccessHandler(function (result) {
        if (result && result.success) showToast('✅ Revisión guardada');
        else showToast('❌ ' + ((result && result.error) || 'Error desconocido'));
      })
      .withFailureHandler(function (err) {
        showToast('❌ Error del servidor: ' + (err && err.message ? err.message : err));
      })
      .guardarRevisionSat({ id: id, presupuestado: presupuestado, aceptado: aceptado, observacionesRevision: observacionesRevision });
  }

  maqInit();
</script>
```

- [ ] **Step 2: Verify no stray top-level HTML tags**

Run:
```bash
grep -n "<!DOCTYPE\|<html\|<head>\|<body>" "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\MaquinariaUI.html"
```
Expected: no matches.

---

### Task 4: `ShellUI.html` — add the Maquinaria tab + supervisor mode

**Files:**
- Modify: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\ShellUI.html`

- [ ] **Step 1: Add `supervisor` to the shared state**

Find:
```javascript
    var CentinelaState = { jefe: null };
```
Replace with:
```javascript
    var CentinelaState = { jefe: null, supervisor: false };
```

- [ ] **Step 2: Make the brand name long-pressable**

Find:
```html
      <span class="brand-nombre">Centinela</span>
```
Replace with:
```html
      <span class="brand-nombre"
            onmousedown="iniciarPulsacionSupervisor()" onmouseup="cancelarPulsacionSupervisor()" onmouseleave="cancelarPulsacionSupervisor()"
            ontouchstart="iniciarPulsacionSupervisor()" ontouchend="cancelarPulsacionSupervisor()">Centinela</span>
```

- [ ] **Step 3: Add the Maquinaria tab panel**

Find:
```html
      <div class="tab-panel activo" id="tab-turno" data-tab="turno">
        <?!= include('TurnoUI'); ?>
      </div>
    </div>
  </div>
```
Replace with:
```html
      <div class="tab-panel activo" id="tab-turno" data-tab="turno">
        <?!= include('TurnoUI'); ?>
      </div>
      <div class="tab-panel" id="tab-maquinaria" data-tab="maquinaria">
        <?!= include('MaquinariaUI'); ?>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: Add the Maquinaria entry to the tab bar**

Find:
```html
  <div class="tabs" id="barraTabs" style="display:none;">
    <a href="#" class="activa" data-tab="turno" onclick="event.preventDefault(); mostrarTab('turno')">
      <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <span>Turno</span>
    </a>
  </div>
```
Replace with:
```html
  <div class="tabs" id="barraTabs" style="display:none;">
    <a href="#" class="activa" data-tab="turno" onclick="event.preventDefault(); mostrarTab('turno')">
      <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <span>Turno</span>
    </a>
    <a href="#" data-tab="maquinaria" onclick="event.preventDefault(); mostrarTab('maquinaria')">
      <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span>Maquinaria</span>
    </a>
  </div>
```

- [ ] **Step 5: Add the supervisor password overlay**

Find:
```html
  <div class="koverlay" id="overlaySugerencias">
    <div class="kmodal">
      <?!= include('SugerenciasUI'); ?>
    </div>
  </div>
```
Replace with:
```html
  <div class="koverlay" id="overlaySugerencias">
    <div class="kmodal">
      <?!= include('SugerenciasUI'); ?>
    </div>
  </div>

  <div class="koverlay" id="overlaySupervisor">
    <div class="kmodal">
      <p style="margin:0 0 14px;font-size:15px;font-weight:700;color:var(--text-100);">🔒 Modo supervisor</p>
      <input type="password" id="supervisorPass" placeholder="Contraseña"
             style="width:100%;background:var(--ink-950);border:1px solid var(--ink-700);border-radius:var(--radius-btn);color:var(--text-100);padding:12px;font-size:15px;box-sizing:border-box;"
             onkeydown="if(event.key==='Enter'){confirmarSupervisor();}">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button type="button" onclick="cerrarSupervisor()" style="cursor:pointer;border:none;border-radius:var(--radius-btn);padding:10px 16px;min-height:44px;font-size:14px;font-weight:700;background:var(--ink-800);color:var(--text-300);">Cancelar</button>
        <button type="button" onclick="confirmarSupervisor()" style="cursor:pointer;border:none;border-radius:var(--radius-btn);padding:10px 16px;min-height:44px;font-size:14px;font-weight:700;background:var(--accent);color:var(--accent-ink);">Entrar</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 6: Add the supervisor gesture functions**

Find:
```javascript
    function cerrarSugerencias() {
      document.getElementById('overlaySugerencias').classList.remove('abierto');
    }

    initShell();
```
Replace with:
```javascript
    function cerrarSugerencias() {
      document.getElementById('overlaySugerencias').classList.remove('abierto');
    }

    var supervisorTimer = null;
    function iniciarPulsacionSupervisor() {
      supervisorTimer = setTimeout(function () {
        supervisorTimer = null;
        document.getElementById('overlaySupervisor').classList.add('abierto');
        var input = document.getElementById('supervisorPass');
        input.value = '';
        input.focus();
      }, 2000);
    }
    function cancelarPulsacionSupervisor() {
      if (supervisorTimer) { clearTimeout(supervisorTimer); supervisorTimer = null; }
    }
    function confirmarSupervisor() {
      var val = document.getElementById('supervisorPass').value;
      if (val === '467') {
        CentinelaState.supervisor = true;
        document.getElementById('overlaySupervisor').classList.remove('abierto');
        showToast('🔓 Modo supervisor activado');
        if (typeof maquinariaActualizarSupervisor === 'function') maquinariaActualizarSupervisor();
      } else {
        showToast('❌ Contraseña incorrecta');
      }
    }
    function cerrarSupervisor() {
      document.getElementById('overlaySupervisor').classList.remove('abierto');
    }

    initShell();
```

- [ ] **Step 7: Verify no boolean scriptlets snuck in**

Run:
```bash
grep -n '<?=' "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\ShellUI.html"
```
Expected: no matches.

---

### Task 5: Verification (syntax + real recursive scriptlet evaluation + smoke tests)

**Files:** none (verification only, scratchpad scripts).

- [ ] **Step 1: `node --check` every `.gs` file**

Run:
```bash
for f in Config Utilidades Turno Sugerencias Maquinaria Shell; do
  node --check < "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\$f.gs" && echo "$f OK"
done
```
Expected: `Config OK`, `Utilidades OK`, `Turno OK`, `Sugerencias OK`, `Maquinaria OK`, `Shell OK`.

- [ ] **Step 2: Real recursive scriptlet evaluation + script syntax check**

Reuse the exact harness from Pieza 1 (`evaluateTemplate(name)` that recursively resolves every `<?!= include(...) ?>` and other scriptlets by actually evaluating the expression, not a one-shot string replace — this is the technique that would have caught the `include()`/`createHtmlOutputFromFile` bug before it shipped). Extend its fake globals with `TURNOS`/`JEFES_EQUIPO`/`LOGO_TAISA_DATA_URI` as before; `MaquinariaUI.html` has no scriptlets of its own so no extra globals needed for it specifically. Run against `ShellUI.html` and confirm:
- No `<?!=`/`<?=` remains unresolved in the final output.
- Every `<script>` block parses with `new Function()`.
- The resolved page contains `id="tab-maquinaria"` and `maquinariaActualizarSupervisor` (confirms the new tab and supervisor hook actually made it into the composed page).

- [ ] **Step 3: Smoke-test `Maquinaria.gs`**

Write a Node script that stubs `Logger`, `Utilities`, `PropertiesService`, `LockService`, `MailApp`, `Session`, `SpreadsheetApp` (fake sheet backed by a plain in-memory 2D array so `getRange`/`setValues`/`appendRow`/`getDataRange` behave realistically enough to assert on), requires `Config.gs`+`Utilidades.gs`+`Maquinaria.gs` concatenated, then asserts:
1. **New fault sends SAT email:** call `procesarActualizacionMaquina({jefe_equipo:'Dani Simo', id:1, estado:'Averiada', observacion:'Prueba de fallo'})` on machine #1 (Linde, currently OK per the seed data) → expect `result.avisoSat === true`, one `MailApp.sendEmail` call to `satmalaga@linde-mh.es`, and the in-memory sheet's row 2 (ID 1) now has Estado=Averiada, Observacion='Prueba de fallo', Fecha Envio SAT populated.
2. **Editing an existing fault does not resend:** call `procesarActualizacionMaquina` again on the same machine (still Averiada) with a different observación → expect `result.avisoSat === false` (or absent) and only the ONE `MailApp.sendEmail`-to-SAT call total across both steps (count calls, don't just check the return value).
3. **Resolving archives to history:** call `procesarActualizacionMaquina({..., id:1, estado:'OK'})` → expect the fake `Historial_Maquinaria` sheet gets exactly one appended row for ID 1, and the active row's Estado is back to `OK` with Observacion/Fecha columns cleared.
4. **Unknown jefe rejected:** same pattern as Turno/Sugerencias — `procesarActualizacionMaquina({jefe_equipo:'Nadie', ...})` throws "no reconocido".

Expected: all four checks pass.

---

### Task 6: Deploy

**Files:** none (uses the scratchpad clone at `.../scratchpad/doc2/`).

- [ ] **Step 1: Copy the two new files + the two modified files into the clone**

```bash
cp "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Config.gs" ".../scratchpad/doc2/Config.gs"
cp "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Maquinaria.gs" ".../scratchpad/doc2/Maquinaria.gs"
cp "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\MaquinariaUI.html" ".../scratchpad/doc2/MaquinariaUI.html"
cp "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\ShellUI.html" ".../scratchpad/doc2/ShellUI.html"
```

- [ ] **Step 2: Push**

Run (from inside `.../scratchpad/doc2/`): `clasp push -f`
Expected: `Pushed 11 files.` (9 previous + `Maquinaria.gs` + `MaquinariaUI.html`).

- [ ] **Step 3: Run `setupSistemaCompleto()` to create the new sheets on the existing spreadsheet**

This can't be triggered from `clasp` directly (it's a Sheets-bound `Ui.alert`-using function meant to run from the Apps Script editor or a Sheets menu). Since `SPREADSHEET_ID` is already set (from Pieza 1), calling `crearHojaCentinela_()`'s existing-spreadsheet branch only runs `asegurarPestanas_(ss)` — which Task 1 Step 4 already made create+seed `Maquinaria`/`Historial_Maquinaria` if missing. The next real request that touches `abrirHojaCentinela_()` (e.g. the first `obtenerMaquinas()` call when a jefe opens the Maquinaria tab) will use the existing spreadsheet as-is, WITHOUT calling `asegurarPestanas_` (only `crearHojaCentinela_`/`setupSistemaCompleto` call that). So the two new sheets will **not** exist yet on the real spreadsheet until `setupSistemaCompleto()` is run once more. Note this clearly for the user: after deploying, open the Apps Script editor for this project, select `setupSistemaCompleto` in the function dropdown, and run it once (same as the very first setup) — it's idempotent (Task 1 Step 3/4 both check `if (!sheet)` before creating), so running it again on the existing spreadsheet is safe and only adds what's missing.

- [ ] **Step 4: Deploy a new version**

Run: `clasp deploy --description "Centinela v1.2 - Maquinaria"`
Expected: a new deployment ID printed.

- [ ] **Step 5: Undeploy the previous version, report the new URL**

Same pattern as Pieza 1's bugfix: `clasp undeploy <ID anterior>` to avoid leaving a second, now-stale link alive, then give the user the one working `https://script.google.com/macros/s/<nuevo-id>/exec` URL plus the reminder to run `setupSistemaCompleto()` once from the Apps Script editor before testing Maquinaria.

---

## Post-plan note

The old standalone "Control Maquinarias Taisa" project (Script ID
`1O4VVYXQq91S_BO1T12E0LwYXgEajdIZlHGnBnAkC4tSRgwqJORFTPeNU`) is not touched
by this plan — retiring it (trashing the file, or just abandoning it) is a
separate decision for the user once Maquinaria is verified working inside
Centinela.
