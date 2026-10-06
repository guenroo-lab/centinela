// ============================================================
//  CENTINELA — PERSONAL
//  Contenido sensible: TODAS las funciones que devuelven o guardan datos de
//  personal exigen el código de acceso y lo comprueban aquí, en el servidor.
//  Sin el código correcto no sale ni un nombre: la pantalla de bloqueo del
//  cliente no es la protección, solo pide el código.
// ============================================================

const PERSONAL_CODIGO_DEFECTO_ = "Taisa";
const PERSONAL_MAX_FALLOS_ = 5;
const PERSONAL_BLOQUEO_SEG_ = 300;
// El supervisor (pulsación larga + 467 en el cascarón, ShellUI.html) ya pasó su propio filtro;
// PersonalUI.html se lo salta y manda este token fijo en vez del código real de Personal, para
// no pedir el código dos veces. El "modo supervisor" en Centinela es solo del cliente (igual que
// en Maquinaria/Turno/Tareas, sin comprobación real en el servidor) — aceptar este token aquí baja
// Personal al MISMO nivel de confianza que esas otras pestañas, ya NO es una segunda barrera real
// para quien sepa activar el modo supervisor. Decisión explícita del usuario (29/09/2026).
const PERSONAL_TOKEN_SUPERVISOR_ = "SUPERVISOR_467";

// El código se puede cambiar sin tocar el código fuente: propiedad de script PERSONAL_CODIGO.
function personalCodigo_() {
  const p = PropertiesService.getScriptProperties().getProperty("PERSONAL_CODIGO");
  return (p && p.trim()) ? p.trim() : PERSONAL_CODIGO_DEFECTO_;
}

function normalizarCodigoPersonal_(c) {
  return String(c == null ? "" : c).trim().toLowerCase();
}

// La caché solo cuenta intentos fallidos: si no está disponible se sigue comprobando el código igual.
function cachePersonal_(accion, clave, valor) {
  try {
    const c = CacheService.getScriptCache();
    if (accion === "get") return c.get(clave);
    if (accion === "put") c.put(clave, valor, PERSONAL_BLOQUEO_SEG_);
    if (accion === "remove") c.remove(clave);
  } catch (e) { /* sin caché: sin límite de intentos, pero el código se sigue validando */ }
  return null;
}

// Lanza "ACCESO_DENEGADO" (la UI la reconoce y vuelve a bloquear) o "DEMASIADOS_INTENTOS".
function exigirAccesoPersonal_(codigo) {
  if (codigo === PERSONAL_TOKEN_SUPERVISOR_) return;
  const fallos = parseInt(cachePersonal_("get", "personal_fallos") || "0", 10) || 0;
  if (fallos >= PERSONAL_MAX_FALLOS_) throw new Error("DEMASIADOS_INTENTOS");
  const esperado = normalizarCodigoPersonal_(personalCodigo_());
  const recibido = normalizarCodigoPersonal_(codigo);
  // Comparación sin cortocircuito para no filtrar cuántas letras coinciden.
  let dif = esperado.length ^ recibido.length;
  for (let i = 0; i < Math.max(esperado.length, recibido.length); i++) {
    dif |= (esperado.charCodeAt(i) || 0) ^ (recibido.charCodeAt(i) || 0);
  }
  if (dif !== 0 || !esperado) {
    cachePersonal_("put", "personal_fallos", String(fallos + 1));
    throw new Error("ACCESO_DENEGADO");
  }
  if (fallos > 0) cachePersonal_("remove", "personal_fallos");
}

// Pantalla de bloqueo: comprueba el código sin devolver datos.
function desbloquearPersonal(codigo) {
  try {
    exigirAccesoPersonal_(codigo);
    return { ok: true };
  } catch (e) {
    if (e.message === "DEMASIADOS_INTENTOS") return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
    return { ok: false, error: "Código incorrecto." };
  }
}

// Campos de cada incidencia. Gravedad: 1 (leve) a 5 (muy grave). Tipo y medida son opcionales.
const PERSONAL_GRAVEDAD_MIN_ = 1;
const PERSONAL_GRAVEDAD_MAX_ = 5;
const PERSONAL_TIPOS_ = ["Puntualidad / Asistencia", "Seguridad / EPI", "Calidad / Errores", "Actitud / Trato", "Rendimiento", "Otro"];
const PERSONAL_MEDIDAS_ = ["Sin medida", "Advertencia verbal", "Advertencia escrita"];

function obtenerOperarios(codigo) {
  exigirAccesoPersonal_(codigo);
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL);
  if (!sheet) return [];
  const datos = sheet.getDataRange().getValues();

  // Resumen para la cabecera de cada ficha: nº de incidencias, la más grave y la última fecha.
  const resumen = {};
  const sheetHist = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
  if (sheetHist && sheetHist.getLastRow() > 1) {
    const hist = sheetHist.getDataRange().getDisplayValues();
    for (let i = 1; i < hist.length; i++) {
      const clave = String(hist[i][0]).trim();
      if (!clave) continue;
      const r = resumen[clave] || (resumen[clave] = { incidencias: 0, gravedadMax: 0, ultima: "" });
      r.incidencias++;
      const g = parseInt(hist[i][6], 10);
      if (g > r.gravedadMax) r.gravedadMax = g;
      r.ultima = hist[i][2];
    }
  }

  const operarios = [];
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === "" || datos[i][0] === null) continue;
    const r = resumen[String(datos[i][0]).trim()] || { incidencias: 0, gravedadMax: 0, ultima: "" };
    operarios.push({ id: datos[i][0], nombre: datos[i][1], incidencias: r.incidencias, gravedadMax: r.gravedadMax, ultima: r.ultima });
  }
  return operarios;
}

function crearOperario(data) {
  exigirAccesoPersonal_(data && data.codigo);
  if (!data || !data.nombre || !data.nombre.trim()) throw new Error("Falta el nombre.");

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }

  try {
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL);
    if (!sheet) return { success: false, error: "Hoja de Personal no encontrada." };
    const datos = sheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < datos.length; i++) {
      const n = parseInt(datos[i][0], 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
    const nuevoId = maxId + 1;
    sheet.appendRow([nuevoId, data.nombre.trim()]);
    SpreadsheetApp.flush();
    return { success: true, id: nuevoId };
  } catch (e) {
    Logger.log("❌ Error creando operario: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function obtenerIncidenciasOperario(id, codigo) {
  exigirAccesoPersonal_(codigo);
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
  if (!sheet) return [];
  // getDisplayValues: si Sheets convirtió fecha/hora de texto en Date, google.script.run
  // devolvería null en silencio y el historial saldría vacío.
  const datos = sheet.getDataRange().getDisplayValues();
  const resultado = [];
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(id).trim()) {
      const g = parseInt(datos[i][6], 10);
      resultado.push({
        fecha: datos[i][2], hora: datos[i][3], reportadoPor: datos[i][4], texto: datos[i][5],
        gravedad: (g >= PERSONAL_GRAVEDAD_MIN_ && g <= PERSONAL_GRAVEDAD_MAX_) ? g : 0,   // 0 = incidencia antigua, sin puntuar
        tipo: datos[i][7] || "", medida: datos[i][8] || "", fechaHecho: datos[i][9] || ""
      });
    }
  }
  return resultado.reverse();
}

function procesarIncidencia(data) {
  Logger.log("📥 Incidencia sobre operario: " + (data && data.operario_id));

  if (!data) throw new Error("No se han recibido datos.");
  exigirAccesoPersonal_(data.codigo);
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  data.jefe_equipo = jefeVigente_(data.jefe_equipo);
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  if (!data.operario_id) throw new Error("Falta el operario.");
  const texto = (data.texto || "").trim();
  if (texto.length < 5) throw new Error("Describe la incidencia.");
  const gravedad = parseInt(data.gravedad, 10);
  if (!(gravedad >= PERSONAL_GRAVEDAD_MIN_ && gravedad <= PERSONAL_GRAVEDAD_MAX_)) throw new Error("Puntúa la gravedad de 1 a 5.");
  const tipo = String(data.tipo || "").trim();
  if (tipo && PERSONAL_TIPOS_.indexOf(tipo) === -1) throw new Error("Tipo de incidencia no válido.");
  const medida = String(data.medida || "").trim();
  if (medida && PERSONAL_MEDIDAS_.indexOf(medida) === -1) throw new Error("Medida no válida.");

  const tz = Session.getScriptTimeZone();
  const ahora = new Date();
  const hoyIso = Utilities.formatDate(ahora, tz, "yyyy-MM-dd");
  // Cuándo ocurrió (el formulario lo manda como aaaa-mm-dd). Por defecto, hoy; nunca en el futuro.
  const hechoIso = String(data.fecha_hecho || "").trim() || hoyIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hechoIso)) throw new Error("Fecha del hecho no válida.");
  if (hechoIso > hoyIso) throw new Error("La fecha del hecho no puede ser futura.");
  const fechaHechoStr = hechoIso.slice(8, 10) + "/" + hechoIso.slice(5, 7) + "/" + hechoIso.slice(0, 4);

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }

  try {
    const sheetPersonal = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL);
    if (!sheetPersonal) return { success: false, error: "Hoja de Personal no encontrada." };
    const datosPersonal = sheetPersonal.getDataRange().getValues();
    let nombre = "";
    for (let i = 1; i < datosPersonal.length; i++) {
      if (String(datosPersonal[i][0]).trim() === String(data.operario_id).trim()) { nombre = datosPersonal[i][1]; break; }
    }
    if (!nombre) return { success: false, error: "Operario no encontrado." };

    let sheetHist = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
    if (!sheetHist) sheetHist = ss.insertSheet(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
    asegurarCabeceras_(sheetHist, CABECERAS_PERSONAL_HISTORIAL);

    const fechaStr = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
    const horaStr = Utilities.formatDate(ahora, tz, "HH:mm");

    sheetHist.appendRow([data.operario_id, nombre, fechaStr, horaStr, data.jefe_equipo, texto, gravedad, tipo, medida, fechaHechoStr]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error guardando incidencia: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
