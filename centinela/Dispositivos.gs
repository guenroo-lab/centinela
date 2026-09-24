// ============================================================
//  CENTINELA — DISPOSITIVOS
// ============================================================

// Columnas de la hoja Dispositivos (1-indexadas, para getRange):
// 1 ID | 2 Tipo | 3 Servicio | 4 Numero Serie | 5 Estado | 6 Observacion | 7 Fecha Estado
//
// Columnas de Historial_Dispositivos:
// 1 Fecha | 2 Hora | 3 ID | 4 Tipo | 5 Numero Serie | 6 Estado Anterior | 7 Estado Nuevo |
// 8 Observacion | 9 Jefe

const ESTADOS_DISPOSITIVO = ["Operativo", "Averiado", "En reparación", "Baja"];
const DIS_MAX_CAMPO = 60;
const DIS_MAX_OBSERVACION = 500;
const DIS_MAX_HISTORIAL = 30;

// ── Helpers privados ─────────────────────────────────────────

function dispSinAcentos_(texto) {
  return String(texto == null ? "" : texto).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Celda -> texto. Nunca devuelve un Date (google.script.run lo entregaría como null).
function dispTexto_(valor, formatoFecha) {
  if (valor === null || valor === undefined) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (isNaN(valor.getTime())) return "";
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), formatoFecha || "dd/MM/yyyy HH:mm");
  }
  return String(valor).trim();
}

// El número de serie puede haberse escrito a mano como número: se muestra siempre como texto.
function dispSerieTexto_(valor) {
  if (typeof valor === "number") return isFinite(valor) ? String(Math.round(valor)) : "";
  return dispTexto_(valor);
}

// Estado tolerante a mayúsculas/acentos; vacío o desconocido = Operativo.
function dispEstadoCanonico_(valor) {
  const s = dispSinAcentos_(valor).trim().toLowerCase();
  if (s.indexOf("repar") !== -1) return "En reparación";
  if (s.indexOf("averi") === 0) return "Averiado";
  if (s.indexOf("baja") === 0) return "Baja";
  return "Operativo";
}

// Solo un jefe de equipo identificado o el supervisor pueden modificar dispositivos.
function dispValidarIdentidad_(nombre) {
  if (!nombre) throw new Error("Falta indicar quién eres.");
  if (JEFES_EQUIPO.indexOf(nombre) === -1 && nombre !== IDENTIDAD_SUPERVISOR) {
    throw new Error("Jefe de equipo no reconocido: " + nombre);
  }
  return nombre;
}

// Campo de una línea: colapsa espacios y rechaza (no recorta en silencio) el exceso.
function dispLimpiarCampo_(valor, max, etiqueta) {
  const t = String(valor == null ? "" : valor).replace(/\s+/g, " ").trim();
  if (t.length > max) throw new Error(etiqueta + " es demasiado largo (máximo " + max + " caracteres).");
  return t;
}

function dispLimpiarObservacion_(valor) {
  const t = String(valor == null ? "" : valor).replace(/\r\n?/g, "\n").trim();
  if (t.length > DIS_MAX_OBSERVACION) {
    throw new Error("La observación es demasiado larga (máximo " + DIS_MAX_OBSERVACION + " caracteres).");
  }
  return t;
}

// Servicios a los que se asigna un dispositivo. Si se escribe con otra grafía (minúsculas, sin
// tilde...) se guarda con la de esta lista; un valor antiguo que no esté aquí se respeta tal cual.
const DIS_SERVICIOS = ["Carga/Descarga", "Recepción", "Pedido Cliente", "Arrastre", "SIE"];

function dispServicioCanonico_(texto) {
  const k = dispSinAcentos_(texto).replace(/\s+/g, "").toLowerCase();
  for (let i = 0; i < DIS_SERVICIOS.length; i++) {
    if (dispSinAcentos_(DIS_SERVICIOS[i]).replace(/\s+/g, "").toLowerCase() === k) return DIS_SERVICIOS[i];
  }
  return texto;
}

// Número de serie (en un móvil, el IMEI que sale con *#06#): letras, números y . - / _ ; de 3 a 40
// caracteres; vacío permitido (algún dispositivo puede no tenerlo). Se guarda en mayúsculas.
function dispValidarSerie_(valor) {
  const s = String(valor == null ? "" : valor).replace(/\s+/g, " ").trim().toUpperCase();
  if (s === "") return "";
  if (!/^[A-Z0-9][A-Z0-9 ._\/\-]{1,38}[A-Z0-9]$/.test(s)) {
    throw new Error("El número de serie debe tener de 3 a 40 caracteres (letras, números y . - / _) o quedar vacío.");
  }
  return s;
}

function dispTomarLock_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return lock;
  } catch (e) {
    return null;
  }
}

// Devuelve { sheet, hist } listas para usar (las crea si faltan), o null.
// Se llama ANTES de tomar el bloqueo de escritura: los bloqueos no son reentrantes.
function dispPrepararHojas_(ss) {
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_DISPOSITIVOS, CABECERAS_DISPOSITIVOS, prepararHojaDispositivos_);
  const hist = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_HISTORIAL_DISPOSITIVOS, CABECERAS_HISTORIAL_DISPOSITIVOS, prepararHojaHistorialDispositivos_);
  if (!sheet || !hist) return null;
  return { sheet: sheet, hist: hist };
}

// Lee la hoja de forma tolerante (filas a mano, nº de serie numérico, estados raros...).
function dispLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const idTxt = dispTexto_(f[0]);
    const tipo = dispTexto_(f[1]);
    const servicio = dispTexto_(f[2]);
    const serie = dispSerieTexto_(f[3]);
    if (idTxt === "" && tipo === "" && servicio === "" && serie === "") continue;
    const n = parseInt(idTxt, 10);
    filas.push({
      fila: i + 1,
      id: isNaN(n) ? null : n,
      tipo: tipo,
      servicio: servicio,
      serie: serie,
      estado: dispEstadoCanonico_(f[4]),
      observacion: dispTexto_(f[5]),
      fechaEstado: dispTexto_(f[6])
    });
  }
  return filas;
}

// Un dispositivo apuntado a mano en la hoja puede no tener ID: se le asigna
// max+1 (y estado Operativo si no tenía). Bajo bloqueo; devuelve false si falla.
function dispRepararIds_(sheet) {
  const lock = dispTomarLock_();
  if (!lock) return false;
  try {
    const datos = sheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < datos.length; i++) {
      const n = parseInt(dispTexto_(datos[i][0]), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
    for (let i = 1; i < datos.length; i++) {
      const f = datos[i];
      const tieneContenido = dispTexto_(f[1]) !== "" || dispTexto_(f[2]) !== "" || dispSerieTexto_(f[3]) !== "";
      if (!tieneContenido || !isNaN(parseInt(dispTexto_(f[0]), 10))) continue;
      maxId++;
      sheet.getRange(i + 1, 1).setValue(maxId);
      if (dispTexto_(f[4]) === "") sheet.getRange(i + 1, 5).setValue("Operativo");
    }
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    Logger.log("❌ Error reparando IDs de dispositivos: " + e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function dispParaCliente_(f) {
  return {
    id: f.id, tipo: f.tipo, servicio: f.servicio, serie: f.serie,
    estado: f.estado, observacion: f.observacion, fechaEstado: f.fechaEstado
  };
}

function dispBuscarPorId_(filas, id) {
  const buscado = String(id).trim();
  for (let i = 0; i < filas.length; i++) {
    if (filas[i].id !== null && String(filas[i].id) === buscado) return filas[i];
  }
  return null;
}

// Devuelve el dispositivo que ya tiene ese número de serie (distinto de idExcluir) o null.
function dispDuplicadoSerie_(filas, serie, idExcluir) {
  if (!serie) return null;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (idExcluir !== undefined && f.id !== null && String(f.id) === String(idExcluir)) continue;
    if (f.serie.replace(/[\s-]/g, "").toUpperCase() === serie.replace(/[\s-]/g, "")) return f;
  }
  return null;
}

function dispMensajeDuplicado_(f) {
  return "Ese número de serie ya está registrado en el dispositivo " + f.id + " (" + (f.tipo || "sin tipo") + ").";
}

function dispSiguienteId_(filas) {
  let maxId = 0;
  filas.forEach(function (f) { if (f.id !== null && f.id > maxId) maxId = f.id; });
  return maxId + 1;
}

function dispAgregarHistorial_(hist, ahora, id, tipo, serie, anterior, nuevo, observacion, quien) {
  const tz = Session.getScriptTimeZone();
  hist.appendRow([
    Utilities.formatDate(ahora, tz, "dd/MM/yyyy"),
    Utilities.formatDate(ahora, tz, "HH:mm"),
    id, tipo, serie, anterior, nuevo, observacion, quien
  ]);
}

// ── API pública (google.script.run) ─────────────────────────

function obtenerDispositivos() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { ok: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_DISPOSITIVOS, CABECERAS_DISPOSITIVOS, prepararHojaDispositivos_);
  if (!sheet) return { ok: false, error: "No se pudo preparar la hoja de Dispositivos; inténtalo de nuevo." };

  let filas = dispLeer_(sheet);
  if (filas.some(function (f) { return f.id === null; })) {
    dispRepararIds_(sheet);
    filas = dispLeer_(sheet);
  }
  // Si la reparación falló (sin bloqueo) esas filas siguen sin ID: no se muestran
  // hasta que se pueda repararlas, porque no se podrían modificar.
  const dispositivos = filas
    .filter(function (f) { return f.id !== null; })
    .sort(function (a, b) { return a.id - b.id; })
    .map(dispParaCliente_);
  return { ok: true, dispositivos: dispositivos };
}

function crearDispositivo(data) {
  Logger.log("📥 Alta de dispositivo");
  if (!data) throw new Error("No se han recibido datos.");
  const quien = dispValidarIdentidad_(data.jefe_equipo);
  const tipo = dispLimpiarCampo_(data.tipo, DIS_MAX_CAMPO, "El tipo");
  if (!tipo) throw new Error("El tipo de dispositivo es obligatorio.");
  const servicio = dispServicioCanonico_(dispLimpiarCampo_(data.servicio, DIS_MAX_CAMPO, "El servicio"));
  const serie = dispValidarSerie_(data.serie);

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const hojas = dispPrepararHojas_(ss);
  if (!hojas) return { success: false, error: "No se pudo preparar la hoja de Dispositivos; inténtalo de nuevo." };

  const lock = dispTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  try {
    const filas = dispLeer_(hojas.sheet);
    const dup = dispDuplicadoSerie_(filas, serie);
    if (dup) return { success: false, error: dispMensajeDuplicado_(dup) };

    const ahora = new Date();
    const fechaStr = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    const nuevoId = dispSiguienteId_(filas);
    hojas.sheet.appendRow([nuevoId, tipo, servicio, serie, "Operativo", "", fechaStr]);
    dispAgregarHistorial_(hojas.hist, ahora, nuevoId, tipo, serie, "", "Operativo", "Alta del dispositivo", quien);
    SpreadsheetApp.flush();
    return { success: true, id: nuevoId };
  } catch (e) {
    Logger.log("❌ Error creando dispositivo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function actualizarDatosDispositivo(data) {
  Logger.log("📥 Edición de datos de dispositivo: " + (data && data.id));
  if (!data) throw new Error("No se han recibido datos.");
  dispValidarIdentidad_(data.jefe_equipo);
  if (data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta el dispositivo.");
  const tipo = dispLimpiarCampo_(data.tipo, DIS_MAX_CAMPO, "El tipo");
  if (!tipo) throw new Error("El tipo de dispositivo es obligatorio.");
  const servicio = dispServicioCanonico_(dispLimpiarCampo_(data.servicio, DIS_MAX_CAMPO, "El servicio"));
  const serie = dispValidarSerie_(data.serie);

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const hojas = dispPrepararHojas_(ss);
  if (!hojas) return { success: false, error: "No se pudo preparar la hoja de Dispositivos; inténtalo de nuevo." };

  const lock = dispTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  try {
    const filas = dispLeer_(hojas.sheet);
    const actual = dispBuscarPorId_(filas, data.id);
    if (!actual) return { success: false, error: "Dispositivo no encontrado." };
    const dup = dispDuplicadoSerie_(filas, serie, actual.id);
    if (dup) return { success: false, error: dispMensajeDuplicado_(dup) };

    hojas.sheet.getRange(actual.fila, 2, 1, 3).setValues([[tipo, servicio, serie]]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error actualizando datos de dispositivo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function procesarCambioEstadoDispositivo(data) {
  Logger.log("📥 Cambio de estado de dispositivo: " + (data && data.id));
  if (!data) throw new Error("No se han recibido datos.");
  const quien = dispValidarIdentidad_(data.jefe_equipo);
  if (data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta el dispositivo.");
  const estado = data.estado;
  if (ESTADOS_DISPOSITIVO.indexOf(estado) === -1) throw new Error("Estado no válido: " + estado);
  const observacion = dispLimpiarObservacion_(data.observacion);
  if (estado === "Averiado" && observacion.length < 5) {
    throw new Error("Describe la avería (mínimo 5 caracteres).");
  }

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const hojas = dispPrepararHojas_(ss);
  if (!hojas) return { success: false, error: "No se pudo preparar la hoja de Dispositivos; inténtalo de nuevo." };

  const lock = dispTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  try {
    const filas = dispLeer_(hojas.sheet);
    const actual = dispBuscarPorId_(filas, data.id);
    if (!actual) return { success: false, error: "Dispositivo no encontrado." };

    // Sin nada que cambiar no se ensucia el historial.
    if (actual.estado === estado && actual.observacion === observacion) {
      return { success: true, sinCambios: true };
    }

    const ahora = new Date();
    const fechaStr = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    hojas.sheet.getRange(actual.fila, 5, 1, 3).setValues([[estado, observacion, fechaStr]]);
    dispAgregarHistorial_(hojas.hist, ahora, actual.id, actual.tipo, actual.serie, actual.estado, estado, observacion, quien);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error cambiando estado de dispositivo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Más recientes primero. Solo lectura: la hoja de historial se crea en la primera escritura.
function obtenerHistorialDispositivo(id) {
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_DISPOSITIVOS);
  if (!sheet) return [];
  const datos = sheet.getDataRange().getValues();
  const buscado = String(id).trim();
  const resultado = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (dispTexto_(f[2]) !== buscado) continue;
    resultado.push({
      fecha: dispTexto_(f[0], "dd/MM/yyyy"),
      hora: dispTexto_(f[1], "HH:mm"),
      estadoAnterior: dispTexto_(f[5]),
      estadoNuevo: dispTexto_(f[6]),
      observacion: dispTexto_(f[7]),
      jefe: dispTexto_(f[8])
    });
  }
  return resultado.reverse().slice(0, DIS_MAX_HISTORIAL);
}
