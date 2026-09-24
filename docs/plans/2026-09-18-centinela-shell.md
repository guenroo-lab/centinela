# Centinela — Cascarón + Turno + Sugerencias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-file `ControlTurno_Taisa_SIMPLIFICADO.js` (v3.2) into a multi-file "Centinela" Apps Script project: a tabbed shell (Kairos visual system: 4 accents + light/dark, ported literally) with Control de Turno as tab 1, a shared identity selector, and a floating Sugerencias button.

**Architecture:** Multi-file GAS project (`.gs` + `.html`), composed server-side via `HtmlService.createTemplateFromFile` + `include()`. No test framework exists for this codebase — verification is `node --check` on every `.gs`, `new Function()` on every extracted `<script>` block, and smoke tests with mocked GAS globals (established pattern, already used for v3.2).

**Tech Stack:** Google Apps Script (V8), vanilla HTML/CSS/JS, `clasp` for push/deploy (already configured, Script ID `1mrj0RUSqX-2g37A1LyNPyX-pwPyE0a2UegRQIJQqZ3esrbnyOnZjXDI7`).

**Source of truth for relocated code:** `C:\Users\30081048\Desktop\Proyectos\FindeTurno\ControlTurno_Taisa_SIMPLIFICADO.js` (current, v3.2, verified working — line numbers below are exact as of this plan).

---

### Task 1: `Config.gs` — shared constants + setup

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Config.gs`

- [ ] **Step 1: Write the file**

Move from `ControlTurno_Taisa_SIMPLIFICADO.js` **lines 8–111** verbatim (`ZONA_DISPOSITIVOS`, `TURNOS`, `JEFES_EQUIPO`, `CONFIG`, `LOGO_TAISA_B64`, `LOGO_TAISA_DATA_URI`, `CABECERAS_HOJA`), with these exact changes:
- Rename `CABECERAS_HOJA` → `CABECERAS_TURNO`.
- In `CONFIG`, rename `SHEET_NAME: "Registros_Turno"` → `SHEET_NAME_TURNO: "Registros_Turno"`, and add `SHEET_NAME_SUGERENCIAS: "Sugerencias"` right after it.
- Add `const CABECERAS_SUGERENCIAS = ["Fecha", "Hora", "Jefe de Equipo", "Sugerencia"];` after `CABECERAS_TURNO`.

Then append (new code, replaces the old `setupSistemaCompleto`/`crearHojaRegistros`/`escribirCabeceras`/`cabecerasOk` at lines 114–190 — those do **not** get copied, they're superseded by this):

```javascript
// ── FUNCIÓN DE CONFIGURACIÓN INICIAL ─────────────────────────
function setupSistemaCompleto() {
  Logger.log("🚀 Iniciando configuración de Centinela...");

  const ss = crearHojaCentinela_();

  const props = PropertiesService.getScriptProperties();
  props.setProperty("SPREADSHEET_ID", ss.getId());

  Logger.log("✅ Configuración completada.");
  Logger.log("📊 Spreadsheet ID: " + ss.getId());
  Logger.log("🌐 URL de la Hoja: " + ss.getUrl());

  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      "✅ Centinela Configurado",
      "El sistema está listo.\n\n📊 Hoja de registro: " + ss.getUrl() +
      "\n\nPara desplegar: Implementar > Nueva implementación > Aplicación web",
      ui.ButtonSet.OK
    );
  } catch (e) {
    Logger.log("ℹ️ UI no disponible (normal si se ejecuta desde el editor)");
  }
}

function crearHojaCentinela_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("SPREADSHEET_ID");

  if (existingId) {
    try {
      const ss = SpreadsheetApp.openById(existingId);
      Logger.log("📂 Usando hoja existente: " + existingId);
      asegurarPestanas_(ss);
      return ss;
    } catch (e) {
      Logger.log("⚠️ No se encontró la hoja anterior. Creando nueva...");
    }
  }

  const ss = SpreadsheetApp.create("Centinela");
  const primeraHoja = ss.getActiveSheet();
  primeraHoja.setName(CONFIG.SHEET_NAME_TURNO);
  escribirCabeceras(primeraHoja, CABECERAS_TURNO);

  const sugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
  escribirCabeceras(sugerencias, CABECERAS_SUGERENCIAS);

  Logger.log("✅ Hoja Centinela creada: " + ss.getUrl());
  return ss;
}

// Se llama también cuando la hoja ya existía, por si falta alguna pestaña
// (p.ej. Sugerencias se añadió después de crear la hoja original).
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

function abrirHojaCentinela_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty("SPREADSHEET_ID");
  if (!ssId) return null;
  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Config.gs"`
Expected: no output (exit 0). (GAS `.gs` is plain JS, `node --check` works directly on it.)

---

### Task 2: `Utilidades.gs` — shared helpers

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Utilidades.gs`

- [ ] **Step 1: Write the file**

Move from `ControlTurno_Taisa_SIMPLIFICADO.js` **lines 202–243** verbatim (`escapeHtml`, `clampEstado`, `estadoLabel`, `colorPorPuntuacion`, `dataUriABlob`). Then add this new code:

```javascript
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

// Escribe cabeceras genéricas en cualquier hoja (Turno, Sugerencias, o
// futuros módulos). `cabeceras` es el array de nombres de columna.
function escribirCabeceras(sheet, cabeceras) {
  const headerRange = sheet.getRange(1, 1, 1, cabeceras.length);
  headerRange.setValues([cabeceras]);
  headerRange.setBackground("#0f1220");
  headerRange.setFontColor("#f0f4ff");
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);
}

// Comprueba que la fila 1 sigue teniendo las cabeceras esperadas
// (alguien pudo borrarlas a mano sin borrar la hoja entera).
function cabecerasOk(sheet, cabeceras) {
  if (sheet.getLastRow() === 0) return false;
  const fila1 = sheet.getRange(1, 1, 1, cabeceras.length).getValues()[0];
  return cabeceras.every((h, i) => fila1[i] === h);
}

function asegurarCabeceras_(sheet, cabeceras) {
  if (!cabecerasOk(sheet, cabeceras)) escribirCabeceras(sheet, cabeceras);
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Utilidades.gs"`
Expected: no output (exit 0).

---

### Task 3: `Turno.gs` — business logic, relocated + adapted

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Turno.gs`

- [ ] **Step 1: Write the file**

Move from `ControlTurno_Taisa_SIMPLIFICADO.js`:
- **Lines 245–318** (`procesarRegistro`) — verbatim, no changes (it already only references `TURNOS`/`JEFES_EQUIPO`/`clampEstado`, all now globals from Config.gs/Utilidades.gs).
- **Lines 320–391** (`guardarEnHoja`) — with these exact changes:
  - Replace the block that reads `PropertiesService`/`ssId`/opens the spreadsheet (originally the first ~15 lines of the function body) with:
    ```javascript
    function guardarEnHoja(data, turno, meta, emailOk) {
      const ss = abrirHojaCentinela_();
      if (!ss) {
        Logger.log("⚠️ SPREADSHEET_ID no configurado. Ejecuta setupSistemaCompleto() primero.");
        return { ok: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
      }
    ```
  - Replace the sheet-lookup block (`let sheet = ss.getSheetByName(CONFIG.SHEET_NAME); ... escribirCabeceras(sheet);` / `cabecerasOk(sheet)`) with:
    ```javascript
      let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_TURNO);
      if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEET_NAME_TURNO);
        escribirCabeceras(sheet, CABECERAS_TURNO);
      } else if (sheet.getLastRow() === 0 || !cabecerasOk(sheet, CABECERAS_TURNO)) {
        escribirCabeceras(sheet, CABECERAS_TURNO);
      }
    ```
  - Everything else in the function (lock handling, `zonasParaSheet`, `appendRow`, row coloring, `try/finally`) stays **exactly as it is in v3.2** — no other changes.
- **Lines 393–430** (`enviarInformeEmail`) — verbatim.
- **Lines 434–561** (`generarHTMLEmail`) — verbatim (it already only uses `CONFIG.MAX_BYTES_FOTOS_EMAIL`, `dataUriABlob`, `escapeHtml`, `colorPorPuntuacion`, `estadoLabel`, `LOGO_TAISA_DATA_URI` — all globals from Config.gs/Utilidades.gs now).

Do **not** copy lines 114–199 (`setupSistemaCompleto`, `crearHojaRegistros`, `escribirCabeceras`, `cabecerasOk`, `doGet`) — those are superseded by `Config.gs` (Task 1) and `Shell.gs` (Task 5).

- [ ] **Step 2: Verify syntax**

Run: `node --check "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Turno.gs"`
Expected: no output (exit 0).

---

### Task 4: `Sugerencias.gs` — new module

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Sugerencias.gs`

- [ ] **Step 1: Write the file**

```javascript
// ============================================================
//  CENTINELA — SUGERENCIAS
// ============================================================

function procesarSugerencia(data) {
  Logger.log("📥 Procesando sugerencia de: " + (data && data.jefe_equipo));

  if (!data) throw new Error("No se han recibido datos.");
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  const texto = (data.texto || "").trim();
  if (!texto) throw new Error("La sugerencia está vacía.");

  const ahora = new Date();
  const tz = Session.getScriptTimeZone();
  const fechaStr = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
  const horaStr = Utilities.formatDate(ahora, tz, "HH:mm:ss");

  const guardado = guardarSugerenciaEnHoja_(data.jefe_equipo, texto, fechaStr, horaStr);
  const emailOk = enviarEmailSugerencia_(data.jefe_equipo, texto, fechaStr, horaStr);

  const avisos = [];
  if (!guardado.ok) avisos.push("No se pudo guardar: " + guardado.error);
  if (!emailOk) avisos.push("El email no se pudo enviar. Avisa a Pedro Gil.");

  const success = guardado.ok || emailOk;
  return { success: success, error: success ? undefined : avisos.join(" | "), avisos: avisos };
}

function guardarSugerenciaEnHoja_(jefe, texto, fechaStr, horaStr) {
  const ss = abrirHojaCentinela_();
  if (!ss) {
    return { ok: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }

  try {
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SUGERENCIAS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
    }
    asegurarCabeceras_(sheet, CABECERAS_SUGERENCIAS);
    sheet.appendRow([fechaStr, horaStr, jefe, texto]);
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    Logger.log("❌ Error guardando sugerencia: " + e.message);
    return { ok: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function enviarEmailSugerencia_(jefe, texto, fechaStr, horaStr) {
  try {
    const asunto = "[Centinela] Sugerencia de " + jefe;
    const cuerpo = "Nueva sugerencia en Centinela\n\n" +
      "Fecha: " + fechaStr + " " + horaStr + "\n" +
      "De: " + jefe + "\n\n" +
      texto;
    const html = "<div style=\"font-family:Helvetica,Arial,sans-serif;background:#080a10;color:#f0f4ff;padding:24px;\">" +
      "<h2 style=\"margin:0 0 12px;\">Nueva sugerencia \u2014 Centinela</h2>" +
      "<p style=\"margin:0 0 4px;color:#8b96b8;\">" + escapeHtml(fechaStr) + " " + escapeHtml(horaStr) + " \u00b7 " + escapeHtml(jefe) + "</p>" +
      "<div style=\"background:#0f1220;border-radius:12px;padding:16px;margin-top:12px;\">" +
      "<p style=\"margin:0;white-space:pre-wrap;\">" + escapeHtml(texto) + "</p></div></div>";

    GmailApp.sendEmail(CONFIG.EMAIL_RESPONSABLE, asunto, cuerpo, {
      htmlBody: html,
      name: "Centinela"
    });
    return true;
  } catch (e) {
    Logger.log("❌ ERROR al enviar email de sugerencia: " + e.message);
    return false;
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Sugerencias.gs"`
Expected: no output (exit 0).

---

### Task 5: `Shell.gs` — entry point

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Shell.gs`

- [ ] **Step 1: Write the file**

```javascript
// ============================================================
//  CENTINELA — CASCARÓN
// ============================================================

function doGet(e) {
  return HtmlService.createTemplateFromFile('ShellUI').evaluate()
    .setTitle("Centinela")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\Shell.gs"`
Expected: no output (exit 0).

---

### Task 6: `TurnoUI.html` — Turno's screens, relocated + repainted

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\TurnoUI.html`

- [ ] **Step 1: Extract the fragment**

Source is `getAppHtml()`, **lines 563–1732** of `ControlTurno_Taisa_SIMPLIFICADO.js`. That function returns one big JS template literal starting `return \`<!DOCTYPE html>...` and ending `</html>\`;`. Build `TurnoUI.html` from it like this:

1. **Drop** the function wrapper (`function getAppHtml() { const turnosJson = ...; const jefesJson = ...; return \`` and the closing `` `; } ``), the `<!DOCTYPE html><html lang="es"><head>...</head><body>` opening tags, the `<header class="header">...</header>` block (shell now owns the app header), and the closing `</div></body></html>` tags (keep the innermost `<div class="wrap">`'s **content**, drop the wrapper div itself since the shell's `#tab-turno` container already plays that role — replace `<div class="wrap">` with nothing and its matching closing `</div>` with nothing).
2. **Drop** the "SCREEN 0" jefe-equipo `<div class="card">` block (the one containing `<select id="jefeEquipo">`) — identity now comes from the shell. Keep the "Rol del turno" card and the `<button id="btnStart">` as-is.
3. **Un-escape** the inner template literal syntax, since it's no longer nested inside an outer JS template literal: replace every `` \` `` with `` ` `` and every `\${` with `${` throughout the `<script>` portion.
4. In the `<script>` block: **drop** the line `const JEFES = ${jefesJson};` (becomes `const JEFES = ...;` after step 3 — delete this whole line, `JEFES` is no longer used here).
5. In `initApp()`: **drop** the block that populates `jefeSelect` (the `JEFES.forEach(...)` loop over `document.getElementById('jefeEquipo')`) — keep the `turnoSelect` population loop.
6. In `validarSeleccion()`: change
   ```javascript
   const jefe = document.getElementById('jefeEquipo').value;
   const turnoId = document.getElementById('turnoSelect').value;
   document.getElementById('btnStart').disabled = !(jefe && turnoId);
   ```
   to
   ```javascript
   const turnoId = document.getElementById('turnoSelect').value;
   document.getElementById('btnStart').disabled = !turnoId;
   ```
   (rest of the function — the `rolPreview` block — stays unchanged).
7. In `iniciarControl()`: change
   ```javascript
   state.jefe = document.getElementById('jefeEquipo').value;
   state.turnoId = document.getElementById('turnoSelect').value;
   state.turno = TURNOS[state.turnoId];

   if (!state.jefe) {
     showToast('❌ Selecciona el jefe de equipo');
     return;
   }
   if (!state.turno) {
   ```
   to
   ```javascript
   state.turnoId = document.getElementById('turnoSelect').value;
   state.turno = TURNOS[state.turnoId];

   if (!state.jefe) {
     showToast('❌ Falta identificarte — recarga la app');
     return;
   }
   if (!state.turno) {
   ```
8. At the very end of the `<script>` block (right before its closing `</script>`), add:
   ```javascript
   function turnoRecibirJefe(jefe) {
     state.jefe = jefe;
   }
   ```
9. In the CSS `<style>` block: **delete** the `:root { --bg: ...; ... --radius: 20px; }` block entirely, and in its place insert:
   ```css
   :root { --radius: 20px; }
   ```
   (Turno keeps its own 20px card radius as a local override; every other color token it declared is now supplied by the shell's `:root` — see the mapping table below.)
10. Throughout the rest of the `<style>` block, apply this **exact** variable rename (find-and-replace, case-sensitive, `var(--X)` → `var(--Y)`):

    | Old (Turno-only) | New (shell token) |
    |---|---|
    | `--bg` | `--ink-950` |
    | `--surface` | `--ink-900` |
    | `--surface2` | `--ink-850` |
    | `--red` | `--accent` |
    | `--red-dim` | `--accent-dim` |
    | `--red-text` | `--accent-text` |
    | `--text` | `--text-100` |
    | `--muted` | `--text-500` |
    | `--border` | `--ink-800` |

    Do **not** touch literal hex colors (`#22c55e`, `#f0b429`, `#ff4d5a` used inline, `#0b1220`, the rating-button gradients, etc.) — those are domain-status colors (verde/ámbar/crítico), independent of the chosen accent theme, exactly like Kairos keeps `--tipo-refill`/`--tipo-pedido`/`--tipo-cesion` as fixed hex regardless of accent. Only variable **references** (`var(--old-name)`) get renamed; two spots use the old boosted-border value `rgba(255,255,255,0.2)` (the `select, textarea` rule) — replace that literal with `var(--ink-700)` instead (matches the shell's convention of using an ink tier directly for emphasized borders).

- [ ] **Step 2: Verify the fragment has no leftover old tokens**

Run:
```bash
grep -n -- "--bg\|--surface\|--red\b\|--red-dim\|--red-text\|var(--text)\|--muted\|--border" "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\TurnoUI.html"
```
Expected: no matches (empty output). If anything matches, it was missed in Step 1.10 — fix it.

- [ ] **Step 3: Verify no doctype/head/body leaked through**

Run:
```bash
grep -n "<!DOCTYPE\|<html\|<head>\|<body>\|jefeEquipo" "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\TurnoUI.html"
```
Expected: no matches. (`jefeEquipo` should be fully gone — the select, its `initApp()` population, and both reads of it.)

---

### Task 7: `SugerenciasUI.html` — floating form

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\SugerenciasUI.html`

- [ ] **Step 1: Write the file**

```html
<style>
  .sug-form label { display:block; font-size:13px; font-weight:700; color:var(--text-500); margin-bottom:8px; text-transform:uppercase; letter-spacing:.04em; }
  .sug-form textarea { width:100%; min-height:120px; background:var(--ink-950); border:1px solid var(--ink-700); border-radius:var(--radius-btn); color:var(--text-100); padding:12px; font-size:15px; font-family:inherit; resize:vertical; }
  .sug-form .sug-botones { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; }
  .sug-form button { cursor:pointer; border:none; border-radius:var(--radius-btn); padding:10px 16px; min-height:44px; font-size:14px; font-weight:700; }
  .sug-form button.enviar { background:var(--accent); color:var(--accent-ink); }
  .sug-form button.cancelar { background:var(--ink-800); color:var(--text-300); }
  .sug-form p.titulo { margin:0 0 14px; font-size:17px; font-weight:800; color:var(--text-100); }
</style>
<div class="sug-form">
  <p class="titulo">💡 Enviar sugerencia</p>
  <label for="sugTexto">¿Qué mejorarías?</label>
  <textarea id="sugTexto" placeholder="Cuéntanos tu idea..."></textarea>
  <div class="sug-botones">
    <button type="button" class="cancelar" onclick="cerrarSugerencias()">Cancelar</button>
    <button type="button" class="enviar" id="btnEnviarSugerencia" onclick="enviarSugerencia()">Enviar</button>
  </div>
</div>
<script>
  function sugerenciasAlAbrir(jefe) {
    document.getElementById('sugTexto').value = '';
    document.getElementById('btnEnviarSugerencia').disabled = false;
  }

  function enviarSugerencia() {
    var texto = document.getElementById('sugTexto').value.trim();
    if (!texto) { showToast('❌ Escribe algo antes de enviar'); return; }
    if (!CentinelaState.jefe) { showToast('❌ Falta identificarte — recarga la app'); return; }

    var boton = document.getElementById('btnEnviarSugerencia');
    boton.disabled = true;
    boton.textContent = 'Enviando…';

    google.script.run
      .withSuccessHandler(function (result) {
        boton.disabled = false;
        boton.textContent = 'Enviar';
        if (result && result.success) {
          showToast('✅ Sugerencia enviada, gracias');
          cerrarSugerencias();
        } else {
          showToast('❌ ' + ((result && result.error) || 'Error desconocido'));
        }
      })
      .withFailureHandler(function (err) {
        boton.disabled = false;
        boton.textContent = 'Enviar';
        showToast('❌ Error del servidor: ' + (err && err.message ? err.message : err));
      })
      .procesarSugerencia({ jefe_equipo: CentinelaState.jefe, texto: texto });
  }
</script>
```

`showToast` is defined inside `TurnoUI.html`'s script (it's a generic toast, not Turno-specific logic) — since both fragments are concatenated into the same page by `include()`, it's already in scope here. No duplicate needed.

- [ ] **Step 2: Verify no stray top-level HTML tags**

Run:
```bash
grep -n "<!DOCTYPE\|<html\|<head>\|<body>" "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\SugerenciasUI.html"
```
Expected: no matches.

---

### Task 8: `ShellUI.html` — the shell itself

**Files:**
- Create: `C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\ShellUI.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <script>
    (function () {
      var m = 'dark', t = 'taisared';
      try {
        m = localStorage.getItem('centinela_mode_pick') || 'dark';
        t = localStorage.getItem('centinela_theme_pick') || 'taisared';
      } catch (e) {}
      document.documentElement.setAttribute('data-kmode', m);
      document.documentElement.setAttribute('data-ktheme', t);
    })();
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Permanent+Marker&family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink-950:#090d13; --ink-900:#0f151e; --ink-850:#141b26; --ink-800:#1a2230;
      --ink-700:#28323f; --ink-600:#3a4757;
      --text-100:#eef2f7; --text-300:#c3ccd8; --text-500:#8b97a8; --text-600:#66707e;
      --ok:#34d17a; --ok-ink:#062b12;
      --warn-bg:#4a2c0b; --warn-fg:#ffcd8a; --warn-line:#7a4a15;
      --danger-bg:#3a1414; --danger-fg:#ffb0ab; --danger-line:#7a2a24;
      --radius-card:14px; --radius-btn:10px; --radius-chip:999px;
      --shadow-card:0 1px 0 rgba(255,255,255,.03) inset, 0 8px 24px -12px rgba(0,0,0,.6);
      --accent-text: color-mix(in srgb, var(--accent) 65%, white 35%);
    }
    [data-kmode="light"] {
      --ink-950:#f6f4f1; --ink-900:#ffffff; --ink-850:#fbfaf8; --ink-800:#e8e4de;
      --ink-700:#d7d2ca; --ink-600:#b6afa4;
      --text-100:#201f1c; --text-300:#4a473f; --text-500:#7a7568; --text-600:#96917f;
      --ok:#1a8f4c; --ok-ink:#eafff2;
      --warn-bg:#fff1d6; --warn-fg:#92400e; --warn-line:#f0c878;
      --danger-bg:#fde7e5; --danger-fg:#b91c1c; --danger-line:#f4b3ac;
      --shadow-card:0 1px 2px rgba(30,25,15,.04), 0 10px 24px -14px rgba(30,25,15,.18);
      --accent-text: var(--accent);
    }
    [data-ktheme="indigo"]   { --accent:#4c7dff; --accent-ink:#ffffff; --accent-dim:#1c2b52; --accent-line:#3a55a8; }
    [data-ktheme="lmgreen"]  { --accent:#3fb54a; --accent-ink:#04220a; --accent-dim:#123420; --accent-line:#2f7a3c; }
    [data-ktheme="taisared"] { --accent:#e2263a; --accent-ink:#ffffff; --accent-dim:#3a1216; --accent-line:#8a2530; }
    [data-ktheme="amber"]    { --accent:#f0a020; --accent-ink:#241400; --accent-dim:#3a2708; --accent-line:#93672a; }
    [data-kmode="light"][data-ktheme="lmgreen"]  { --accent:#2f9e3f; --accent-ink:#ffffff; --accent-dim:#e4f5e7; --accent-line:#a9dab4; }
    [data-kmode="light"][data-ktheme="taisared"] { --accent:#dc1a23; --accent-ink:#ffffff; --accent-dim:#fde6e6; --accent-line:#f0aaac; }

    * { box-sizing: border-box; }
    html, body { background: var(--ink-950); }
    body { margin:0; padding:0 0 84px; color:var(--text-100); font-family:'Inter',system-ui,-apple-system,sans-serif; -webkit-font-smoothing:antialiased; transition:background .15s ease,color .15s ease; }
    #shell { max-width:480px; margin:0 auto; padding:16px; }

    .brand-head { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px; }
    .brand-badge { background:#fff; border-radius:10px; padding:6px 10px; display:flex; align-items:center; box-shadow:0 2px 8px -3px rgba(0,0,0,.4); }
    .brand-badge img { display:block; height:28px; width:auto; }
    .brand-nombre { font-family:'Permanent Marker', cursive; font-size:30px; color:var(--accent-text); line-height:1; letter-spacing:.015em; }
    .theme-toggle { margin-left:auto; }
    button.theme-btn { cursor:pointer; border:none; background:var(--ink-800); color:var(--text-300); padding:7px 10px; border-radius:var(--radius-btn); font-size:12px; display:flex; align-items:center; gap:5px; min-height:36px; font-weight:700; }
    .theme-btn svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }

    .theme-panel { background:var(--ink-900); border:1px solid var(--ink-800); border-radius:var(--radius-card); padding:12px; margin-bottom:14px; display:none; }
    .theme-panel.abierto { display:block; }
    .picker-row { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .picker-row:last-child { margin-bottom:0; }
    .picker-label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-600); width:52px; flex:none; }
    .pick { cursor:pointer; display:flex; align-items:center; gap:7px; padding:7px 11px 7px 8px; border-radius:var(--radius-chip); background:var(--ink-800); border:1px solid var(--ink-700); color:var(--text-300); font-size:12.5px; font-weight:600; }
    .pick .dot { width:13px; height:13px; border-radius:50%; flex:none; }
    .pick[data-for="indigo"] .dot { background:#4c7dff; }
    .pick[data-for="lmgreen"] .dot { background:#3fb54a; }
    .pick[data-for="taisared"] .dot { background:#e2263a; }
    .pick[data-for="amber"] .dot { background:#f0a020; }
    .pick.active { background:var(--accent-dim); border-color:var(--accent-line); color:var(--accent-ink); }
    [data-kmode="light"] .pick.active { color:var(--accent); }
    .pick[data-hidden] { display:none; }

    .grid-jefes { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:16px 0; }
    .btn-jefe { min-height:72px; border-radius:16px; border:2px solid var(--ink-700); background:var(--ink-900); color:var(--text-100); font-size:16px; font-weight:800; cursor:pointer; padding:10px; }
    .btn-jefe:active { background:var(--accent-dim); border-color:var(--accent); transform:scale(.98); }

    .id-bar { background:var(--accent-dim); border:1px solid var(--accent-line); color:var(--accent-ink); padding:9px 12px; border-radius:var(--radius-btn); margin-bottom:14px; font-size:13px; display:flex; align-items:center; justify-content:space-between; gap:8px; font-weight:700; }
    [data-kmode="light"] .id-bar { color:var(--accent); }
    button.btn-cambiar { background:var(--ink-950); color:var(--text-100); border:1px solid rgba(255,255,255,.18); padding:6px 12px; font-size:12px; min-height:32px; border-radius:var(--radius-chip); cursor:pointer; font-weight:700; }

    .tabs { position:fixed; left:0; right:0; bottom:0; display:flex; background:var(--ink-900); border-top:1px solid var(--ink-800); padding:4px max(4px, env(safe-area-inset-left)) calc(4px + env(safe-area-inset-bottom)); gap:2px; z-index:900; }
    .tabs a { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:8px 2px; border-radius:calc(var(--radius-card) - 4px); text-decoration:none; color:var(--text-500); font-size:10.5px; font-weight:700; min-height:52px; cursor:pointer; }
    .tabs a svg { width:20px; height:20px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .tabs a.activa { background:var(--accent-dim); color:var(--accent-text); }

    .fab-sugerencias { position:fixed; right:16px; bottom:76px; width:52px; height:52px; border-radius:50%; background:var(--accent); color:var(--accent-ink); border:none; box-shadow:0 8px 20px -8px rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:901; }
    .fab-sugerencias svg { width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .fab-sugerencias:active { transform:scale(.94); }

    .koverlay { position:fixed; inset:0; background:rgba(5,7,10,.6); display:none; align-items:center; justify-content:center; padding:20px; z-index:1000; }
    .koverlay.abierto { display:flex; }
    .kmodal { background:var(--ink-900); border:1px solid var(--ink-800); border-radius:var(--radius-card); padding:18px; max-width:400px; width:100%; box-shadow:var(--shadow-card); }

    .tab-panel { display:none; }
    .tab-panel.activo { display:block; }
  </style>
</head>
<body>
  <div id="shell">
    <div class="brand-head">
      <div class="brand-badge"><img src="<?!= LOGO_TAISA_DATA_URI ?>" alt="Taisa"></div>
      <span class="brand-nombre">Centinela</span>
      <div class="theme-toggle">
        <button class="theme-btn" onclick="toggleThemePanel()" type="button">
          <svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
          Tema
        </button>
      </div>
    </div>

    <div class="theme-panel" id="themePanel">
      <div class="picker-row"><span class="picker-label">Modo</span>
        <button class="pick" data-mode="dark" onclick="setKModo('dark')" type="button">Oscuro</button>
        <button class="pick" data-mode="light" onclick="setKModo('light')" type="button">Claro</button>
      </div>
      <div class="picker-row" id="acentoPicker">
        <span class="picker-label">Acento</span>
        <button class="pick" data-for="indigo" onclick="setKTema('indigo')" type="button"><span class="dot"></span>Índigo</button>
        <button class="pick" data-for="lmgreen" onclick="setKTema('lmgreen')" type="button"><span class="dot"></span>Verde LM</button>
        <button class="pick" data-for="taisared" onclick="setKTema('taisared')" type="button"><span class="dot"></span>Rojo Taisa</button>
        <button class="pick" data-for="amber" onclick="setKTema('amber')" type="button"><span class="dot"></span>Ámbar</button>
      </div>
    </div>

    <div id="puertaIdentidad">
      <h1 style="font-size:19px;font-weight:800;margin:0 0 4px;">¿Quién eres?</h1>
      <p style="color:var(--text-500);font-size:13px;margin:0 0 4px;">Selecciona tu nombre para continuar.</p>
      <div class="grid-jefes" id="gridJefes"></div>
    </div>

    <div id="appCentinela" style="display:none;">
      <div class="id-bar">
        <span id="idBarTexto"></span>
        <button class="btn-cambiar" onclick="cambiarIdentidad()" type="button">Cambiar</button>
      </div>

      <div class="tab-panel activo" id="tab-turno" data-tab="turno">
        <?!= include('TurnoUI'); ?>
      </div>
    </div>
  </div>

  <button class="fab-sugerencias" id="fabSugerencias" onclick="abrirSugerencias()" type="button" style="display:none;" aria-label="Enviar sugerencia">
    <svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26A7 7 0 0 0 12 2z"/><path d="M9 21h6"/></svg>
  </button>

  <div class="tabs" id="barraTabs" style="display:none;">
    <a href="#" class="activa" data-tab="turno" onclick="event.preventDefault(); mostrarTab('turno')">
      <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <span>Turno</span>
    </a>
  </div>

  <div class="koverlay" id="overlaySugerencias">
    <div class="kmodal">
      <?!= include('SugerenciasUI'); ?>
    </div>
  </div>

  <script>
    var CentinelaState = { jefe: null };
    var JEFES = <?!= JSON.stringify(JEFES_EQUIPO) ?>;
    var TEMAS_MODOS = { indigo: ['dark'], lmgreen: ['dark', 'light'], taisared: ['dark', 'light'], amber: ['dark'] };

    function toggleThemePanel() {
      document.getElementById('themePanel').classList.toggle('abierto');
    }
    function setKModo(modo) {
      document.documentElement.setAttribute('data-kmode', modo);
      try { localStorage.setItem('centinela_mode_pick', modo); } catch (e) {}
      var actual = document.documentElement.getAttribute('data-ktheme');
      if (TEMAS_MODOS[actual].indexOf(modo) === -1) setKTema('taisared'); else sincronizarPickers_();
    }
    function setKTema(nombre) {
      document.documentElement.setAttribute('data-ktheme', nombre);
      try { localStorage.setItem('centinela_theme_pick', nombre); } catch (e) {}
      sincronizarPickers_();
    }
    function sincronizarPickers_() {
      var modo = document.documentElement.getAttribute('data-kmode');
      var tema = document.documentElement.getAttribute('data-ktheme');
      var picks = document.querySelectorAll('.pick[data-mode]');
      for (var i = 0; i < picks.length; i++) picks[i].classList.toggle('active', picks[i].getAttribute('data-mode') === modo);
      picks = document.querySelectorAll('.pick[data-for]');
      for (var j = 0; j < picks.length; j++) {
        var p = picks[j];
        var nombre = p.getAttribute('data-for');
        p.toggleAttribute('data-hidden', TEMAS_MODOS[nombre].indexOf(modo) === -1);
        p.classList.toggle('active', nombre === tema);
      }
    }

    function initShell() {
      var grid = document.getElementById('gridJefes');
      grid.innerHTML = JEFES.map(function (j, i) {
        return '<button type="button" class="btn-jefe" data-i="' + i + '">' + j + '</button>';
      }).join('');
      var botones = grid.querySelectorAll('.btn-jefe');
      for (var i = 0; i < botones.length; i++) {
        (function (idx) {
          botones[idx].onclick = function () { elegirIdentidad(JEFES[idx]); };
        })(i);
      }
      sincronizarPickers_();
    }

    function elegirIdentidad(jefe) {
      CentinelaState.jefe = jefe;
      document.getElementById('puertaIdentidad').style.display = 'none';
      document.getElementById('appCentinela').style.display = 'block';
      document.getElementById('barraTabs').style.display = 'flex';
      document.getElementById('fabSugerencias').style.display = 'flex';
      document.getElementById('idBarTexto').textContent = jefe;
      if (typeof turnoRecibirJefe === 'function') turnoRecibirJefe(jefe);
    }

    function cambiarIdentidad() {
      CentinelaState.jefe = null;
      document.getElementById('appCentinela').style.display = 'none';
      document.getElementById('barraTabs').style.display = 'none';
      document.getElementById('fabSugerencias').style.display = 'none';
      document.getElementById('puertaIdentidad').style.display = 'block';
    }

    function mostrarTab(id) {
      var paneles = document.querySelectorAll('.tab-panel');
      for (var i = 0; i < paneles.length; i++) paneles[i].classList.toggle('activo', paneles[i].getAttribute('data-tab') === id);
      var enlaces = document.querySelectorAll('#barraTabs a');
      for (var j = 0; j < enlaces.length; j++) enlaces[j].classList.toggle('activa', enlaces[j].getAttribute('data-tab') === id);
    }

    function abrirSugerencias() {
      document.getElementById('overlaySugerencias').classList.add('abierto');
      if (typeof sugerenciasAlAbrir === 'function') sugerenciasAlAbrir(CentinelaState.jefe);
    }
    function cerrarSugerencias() {
      document.getElementById('overlaySugerencias').classList.remove('abierto');
    }

    initShell();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify no boolean scriptlets**

Run:
```bash
grep -n '<?=' "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\ShellUI.html"
```
Expected: no matches — this file only uses `<?!= ?>` (unescaped-output) scriptlets on strings (`LOGO_TAISA_DATA_URI`, `JSON.stringify(...)`, `include(...)`), never `<?= ?>` on a boolean, so the known GAS scriptlet gotcha (`if(<?= boolVar ?>)` always true) does not apply here — this check confirms no `<?= ?>` snuck in.

---

### Task 9: Syntax + smoke-test verification (all files together)

**Files:**
- Create (scratch, not part of the app): a temp Node harness under the session scratchpad.

- [ ] **Step 1: `node --check` every `.gs` file**

Run:
```bash
for f in Config Utilidades Turno Sugerencias Shell; do
  node --check "C:\Users\30081048\Desktop\Proyectos\FindeTurno\centinela\$f.gs" && echo "$f OK"
done
```
Expected: `Config OK`, `Utilidades OK`, `Turno OK`, `Sugerencias OK`, `Shell OK` — no syntax errors.

- [ ] **Step 2: Resolve includes and syntax-check each `<script>` block**

Write a Node script (in the scratchpad) that: reads `ShellUI.html`, replaces `<?!= include('TurnoUI'); ?>` with the raw content of `TurnoUI.html` and `<?!= include('SugerenciasUI'); ?>` with the raw content of `SugerenciasUI.html`, replaces `<?!= LOGO_TAISA_DATA_URI ?>` with a dummy `"data:image/png;base64,AA=="` string and `<?!= JSON.stringify(JEFES_EQUIPO) ?>` with `'["Dani Simo","Daniel Arrastio","Francisco Parada","Sebastián Gelviz"]'`, then extracts every `<script>...</script>` block from the resolved HTML and runs `new Function(scriptSrc)` on each (same technique already used and proven for v3.2 this session).
Expected: every extracted script block parses with `new Function()` without throwing.

- [ ] **Step 3: Smoke-test the backend**

Write a Node script that stubs `Logger`, `Utilities` (`base64Decode`, `newBlob`, `formatDate`), `PropertiesService`, `LockService`, `GmailApp`, `Session`, requires `Config.gs`+`Utilidades.gs`+`Turno.gs`+`Sugerencias.gs` concatenated (GAS shares one global scope across files — concatenating them in any order that respects "declarations before use" reproduces that), then calls:
- `procesarRegistro({jefe_equipo:'Intruso', turno_id:'expedicion_manana', zonas:[...]})` → expect it to throw "Jefe de equipo no reconocido".
- `procesarRegistro({jefe_equipo:'Dani Simo', turno_id:'expedicion_manana', zonas:[oneZone]})` → expect it to throw the zonas-length mismatch error (same behavior already verified for v3.2 — this task only checks it still works after the file split).
- `generarHTMLEmail(fakeData, TURNOS.expedicion_manana, fakeMeta)` → expect `email.html.length > 0` and `Object.keys(email.inlineImages)` to include `'logotaisa'`.
- `procesarSugerencia({jefe_equipo:'Dani Simo', texto:'Prueba'})` with `SpreadsheetApp`/`abrirHojaCentinela_` stubbed to return a fake sheet object (`getSheetByName`, `insertSheet`, `appendRow`, `getRange().getValues()`, `getLastRow()` all stubbed) → expect `{success: true}` shape, `appendRow` called once with `[fechaStr, horaStr, 'Dani Simo', 'Prueba']`.

Expected: all four checks pass (matches the pattern already used and printed successfully for v3.2 earlier this session).

---

### Task 10: Deploy

**Files:** none (deployment step, uses the already-configured clasp clone under the session scratchpad).

- [ ] **Step 1: Replace the clone's file set**

The scratchpad clone at `.../scratchpad/doc2/` currently has a single `ControlTurno_Taisa_SIMPLIFICADO.js`. Delete it, copy all 8 files from `centinela/` into `.../scratchpad/doc2/`.

- [ ] **Step 2: Push**

Run: `clasp push -f` (from inside `.../scratchpad/doc2/`).
Expected: `Pushed 8 files.` (7 `centinela/*` files + the existing `appsscript.json`, unchanged).

- [ ] **Step 3: Deploy a new version**

Run: `clasp deploy --description "Centinela v1 - cascaron + Turno + Sugerencias"`.
Expected: a new deployment ID printed, e.g. `Created version N. - <id> @N.`

- [ ] **Step 4: Report the URL**

Construct `https://script.google.com/macros/s/<deploymentId>/exec` and give it to the user, with the same first-open-permissions caveat as before. Per the spec, this does **not** get shared with the jefes yet — Maquinaria/Residuos/Personal are still pending pieces.

---

## Post-plan note

Maquinaria, Residuos and Personal are explicitly out of scope (see spec). Each gets its own spec → plan → implementation cycle later, added as a new `<div class="tab-panel">` + `<a data-tab="...">` in `ShellUI.html` plus its own `.gs`/`.html` pair — the shell was built data-driven enough (`mostrarTab(id)` keyed by `data-tab`) that adding a tab does not require touching Turno or Sugerencias.
