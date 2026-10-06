// ============================================================
//  CENTINELA — ZONAS DE TURNO EDITABLES (CierreTurno)
//  El supervisor puede reordenar, renombrar o añadir/quitar las zonas (fotos) que se piden
//  en cada rol de turno, desde la propia pestaña Turno. Se guardan en la hoja Turno_Zonas;
//  mientras esa hoja no tenga filas para un rol concreto, ese rol sigue usando las zonas por
//  defecto de TURNOS (Config.gs) — así una instalación nueva, sin editar nada, funciona igual
//  que siempre. turnosConZonas_() es la única fuente de verdad: TurnoUI.html (al cargar la
//  pestaña) y procesarRegistro (Turno.gs, al validar el envío) la llaman los dos, así nunca
//  se desincroniza cliente y servidor.
// ============================================================

const TURNO_ZONAS_MAX_ = 10;
const TURNO_ZONA_NOMBRE_MAX_ = 80;
const TURNO_ZONA_DESC_MAX_ = 200;

// Zonas guardadas en la hoja, por rol: { <turnoId>: [{nombre, descripcion}, ...] } ya ordenadas.
// Solo trae los roles que tienen filas (y que existen en TURNOS). Puede lanzar si Sheets falla.
function leerZonasHoja_(ss) {
  const porTurno = {};
  const libro = ss || abrirHojaCentinela_();
  if (!libro) return porTurno;
  const sheet = libro.getSheetByName(CONFIG.SHEET_NAME_TURNO_ZONAS);
  if (!sheet || sheet.getLastRow() < 2) return porTurno;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (f) {
    const turnoId = String(f[0] || "").trim();
    const nombre = String(f[2] || "").trim().slice(0, TURNO_ZONA_NOMBRE_MAX_);
    if (!TURNOS[turnoId] || !nombre) return;
    (porTurno[turnoId] || (porTurno[turnoId] = [])).push({
      orden: Number(f[1]) || 0, nombre: nombre, descripcion: String(f[3] || "").trim().slice(0, TURNO_ZONA_DESC_MAX_)
    });
  });

  Object.keys(porTurno).forEach(function (id) {
    porTurno[id] = porTurno[id]
      .sort(function (a, b) { return a.orden - b.orden; })
      .map(function (f) { return { nombre: f.nombre, descripcion: f.descripcion }; });
  });
  return porTurno;
}

// { <turnoId>: { id, codigo, nombre, color_email, zonas:[{nombre,descripcion}] } } — TURNOS con
// las zonas ya sustituidas por lo que haya en Turno_Zonas para cada rol (rol por rol: si un rol
// no tiene filas en la hoja, se queda con sus zonas por defecto).
// Se llama al componer la página: si algo falla leyendo la hoja, cae a los valores por defecto en
// vez de lanzar (una excepción aquí tumbaría la app entera para todos los jefes).
function turnosConZonas_() {
  let porTurno;
  try {
    porTurno = leerZonasHoja_();
  } catch (e) {
    Logger.log("⚠️ No se pudieron leer las zonas de turno; se usan las de por defecto: " + e.message);
    return TURNOS;
  }

  const resultado = {};
  Object.keys(TURNOS).forEach(function (id) {
    resultado[id] = (porTurno[id] && porTurno[id].length)
      ? Object.assign({}, TURNOS[id], { zonas: porTurno[id] })
      : TURNOS[id];
  });
  return resultado;
}

// Para el panel de edición: solo nombre + zonas de cada rol (nada de colores/códigos internos).
function obtenerZonasTurnoAdmin() {
  const turnos = turnosConZonas_();
  const resultado = {};
  Object.keys(turnos).forEach(function (id) {
    resultado[id] = { nombre: turnos[id].nombre, zonas: turnos[id].zonas.map(function (z) { return { nombre: z.nombre, descripcion: z.descripcion || "" }; }) };
  });
  return { ok: true, turnos: resultado };
}

// data = { turno_id, zonas: [{nombre, descripcion}, ...] } — reemplaza las zonas de ESE rol;
// los demás roles quedan tal y como estaban (por defecto o ya editados antes). Solo se escriben
// en la hoja los roles editados alguna vez: los que nunca se tocan siguen el valor de Config.gs.
function guardarZonasTurno(data) {
  Logger.log("📥 Guardar zonas de turno: " + (data && data.turno_id));
  if (!data) throw new Error("No se han recibido datos.");
  const turnoId = String(data.turno_id || "").trim();
  if (!TURNOS[turnoId]) throw new Error("Rol de turno no reconocido: " + turnoId);
  if (!Array.isArray(data.zonas) || !data.zonas.length) throw new Error("Añade al menos una zona.");
  if (data.zonas.length > TURNO_ZONAS_MAX_) throw new Error("Demasiadas zonas (máximo " + TURNO_ZONAS_MAX_ + ").");

  const zonasLimpias = data.zonas.map(function (z, i) {
    const nombre = String((z && z.nombre) || "").replace(/\s+/g, " ").trim();
    if (!nombre) throw new Error("La zona " + (i + 1) + " no tiene nombre.");
    if (nombre.length > TURNO_ZONA_NOMBRE_MAX_) throw new Error("El nombre de la zona " + (i + 1) + " es demasiado largo (máximo " + TURNO_ZONA_NOMBRE_MAX_ + " caracteres).");
    const descripcion = String((z && z.descripcion) || "").replace(/\s+/g, " ").trim().slice(0, TURNO_ZONA_DESC_MAX_);
    return { nombre: nombre, descripcion: descripcion };
  });

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  // Antes de coger el bloqueo: asegurarHojaPerezosa_ toma el suyo y el de Apps Script no es reentrante.
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_TURNO_ZONAS, CABECERAS_TURNO_ZONAS, prepararHojaTurnoZonas_);
  if (!sheet) return { success: false, error: "No se pudo preparar la hoja de zonas; inténtalo de nuevo." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }
  try {
    const porTurno = leerZonasHoja_(ss);
    porTurno[turnoId] = zonasLimpias;

    const filas = [];
    Object.keys(TURNOS).forEach(function (id) {
      (porTurno[id] || []).forEach(function (z, i) {
        filas.push([id, i + 1, z.nombre, z.descripcion || ""]);
      });
    });

    // Primero se escribe lo nuevo y después se limpia el sobrante: si algo falla a medias, la
    // hoja sigue con datos completos en vez de quedarse vacía (y volver todos los roles a defecto).
    const filasPrevias = Math.max(sheet.getLastRow() - 1, 0);
    sheet.getRange(2, 1, filas.length, 4).setValues(filas);
    if (filasPrevias > filas.length) {
      sheet.getRange(filas.length + 2, 1, filasPrevias - filas.length, 4).clearContent();
    }
    SpreadsheetApp.flush();
    return { success: true, zonas: zonasLimpias };
  } catch (e) {
    Logger.log("❌ Error guardando zonas de turno: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
