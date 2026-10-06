// ============================================================
//  CENTINELA — TAREAS ASIGNADAS
// ============================================================
//
// El responsable (modo supervisor) asigna tareas a UN jefe de equipo, o una tarea
// GLOBAL a todos ("Asignado a" = "TODOS"): la ven todos los jefes y la cierra el
// primero que la complete o la marque como no realizada (queda cerrada para los demás).
// Cada jefe ve solo las suyas y las cierra de dos formas: completada (con feedback breve)
// o no realizada (con el motivo por el que no se pudo hacer); el responsable recibe un
// correo-informe en los dos casos. Ojo: identidad y modo supervisor son un filtro de
// cliente (no hay login personal); lo que sí se hace en servidor es no entregar nunca a
// un jefe las tareas de otro (obtenerTareasDeJefe filtra por jefe validado) y que el
// cierre sea atómico (bloqueo).
//
// Columnas de la hoja Tareas (1-indexadas, para getRange):
// 1 ID | 2 Titulo | 3 Descripcion | 4 Asignado a | 5 Prioridad | 6 Fecha Asignacion |
// 7 Fecha Limite | 8 Estado (Pendiente/Completada/No realizada/Anulada) | 9 Feedback (o el
// motivo, si no se pudo realizar) | 10 Fecha Cierre | 11 Cerrada por | 12 Correo Enviado |
// 13 Foto Tarea ("Sí" si la tarea se creó con foto) | 14 Foto Cierre ("Sí" si se cerró con foto).
// Las fotos en sí están en la hoja Tareas_Fotos (ver tarGuardarFoto_).

const TAREA_GLOBAL = "TODOS";
const TAREA_MAX_TITULO = 120;
const TAREA_MAX_DESCRIPCION = 1000;
const TAREA_MIN_FEEDBACK = 5;
const TAREA_MAX_FEEDBACK = 500;
const TAREA_MIN_MOTIVO = 5;
const TAREA_MAX_MOTIVO = 500;
const TAREA_COMPLETADAS_JEFE = 10;
const TAREA_NO_REALIZADAS_JEFE = 10;
const TAREA_CERRADAS_SUPERVISOR = 200;
const TAREA_FOTO_MAX_CHARS = 350000;   // data URI completa: ~260 KB de imagen (el navegador la reduce antes)
const TAREA_FOTO_TROZO = 40000;        // Sheets admite 50.000 caracteres por celda

// ── Helpers privados: texto y fechas ─────────────────────────

function tarNormalizar_(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

// Celda -> texto. Nunca devuelve un Date (google.script.run lo entregaría como null).
function tarTexto_(valor, formatoFecha) {
  if (valor === null || valor === undefined) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (isNaN(valor.getTime())) return "";
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), formatoFecha || "dd/MM/yyyy HH:mm");
  }
  return String(valor).trim();
}

function tarPad_(n) {
  return (n < 10 ? "0" : "") + n;
}

// Locales de Sheets que leen "05/10/2026" como mes/día (10 de mayo) en vez de día/mes (5 de octubre).
const TAR_LOCALE_MES_PRIMERO_ = /^(en|es)_(US|PR|PH)$/;

function tarSheetMesPrimero_(sheet) {
  try {
    return TAR_LOCALE_MES_PRIMERO_.test(sheet.getParent().getSpreadsheetLocale());
  } catch (e) {
    return false;
  }
}

// Como tarTexto_, pero para las columnas de fecha. Si la hoja no tenía formato «texto» en esa celda y su
// idioma es mes/día, Sheets convirtió nuestro "05/10/2026" en el Date del 10 de mayo: aquí se le da la
// vuelta para recuperar lo que se escribió. Solo se toca un Date cuyo "día" cabe como mes (≤ 12): un
// "25/10/2026" jamás se habría convertido en Date, así que un Date con día > 12 es una fecha real de verdad.
function tarTextoFecha_(valor, conHora, mesPrimero) {
  if (mesPrimero && Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    const tz = Session.getScriptTimeZone();
    const mes = parseInt(Utilities.formatDate(valor, tz, "M"), 10);
    const dia = parseInt(Utilities.formatDate(valor, tz, "d"), 10);
    if (dia <= 12) {
      return tarPad_(mes) + "/" + tarPad_(dia) + "/" + Utilities.formatDate(valor, tz, "yyyy") +
        (conHora ? " " + Utilities.formatDate(valor, tz, "HH:mm") : "");
    }
  }
  return tarTexto_(valor, conHora ? undefined : "dd/MM/yyyy");
}

// Texto de fecha -> número yyyymmdd (comparable), o null si no es una fecha real.
// Acepta dd/MM/yyyy (también con - o .) y yyyy-MM-dd, con hora opcional detrás.
function tarClaveFecha_(texto) {
  const s = String(texto == null ? "" : texto).trim();
  let a, m, d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (r) {
    a = +r[1]; m = +r[2]; d = +r[3];
  } else {
    r = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+.*)?$/);
    if (!r) return null;
    d = +r[1]; m = +r[2]; a = +r[3];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return a * 10000 + m * 100 + d;
}

function tarClaveATexto_(clave) {
  const a = Math.floor(clave / 10000);
  const m = Math.floor(clave / 100) % 100;
  const d = clave % 100;
  return tarPad_(d) + "/" + tarPad_(m) + "/" + a;
}

// Fecha y hora -> número yyyymmddHHmm para ordenar los cierres; 0 si no se entiende.
function tarClaveOrden_(texto) {
  const clave = tarClaveFecha_(texto);
  if (clave === null) return 0;
  const h = String(texto).match(/(\d{1,2}):(\d{2})/);
  return clave * 10000 + (h ? (+h[1]) * 100 + (+h[2]) : 0);
}

function tarHoyClave_() {
  return parseInt(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd"), 10);
}

function tarEstadoCanonico_(valor) {
  const s = tarNormalizar_(valor);
  // Comprobar "no ..." antes que "completada": si no, "no completada" caería en la rama de abajo.
  if (/^no (realiz|complet|se pudo|pudo|hech)/.test(s)) return "No realizada";
  if (s.indexOf("complet") === 0 || s.indexOf("cerrad") === 0 || s.indexOf("hech") === 0) return "Completada";
  if (s.indexOf("anul") === 0) return "Anulada";
  return "Pendiente";
}

// Estados en los que la tarea ya está cerrada (no admite otro cierre).
function tarEstaCerrada_(estado) {
  return estado === "Completada" || estado === "No realizada" || estado === "Anulada";
}

function tarPrioridadCanonica_(valor) {
  const s = tarNormalizar_(valor);
  return (s.indexOf("alt") === 0 || s.indexOf("urgent") === 0) ? "Alta" : "Normal";
}

// "TODOS" (y variantes escritas a mano) = tarea global.
function tarEsGlobalClave_(clave) {
  return clave === "todos" || clave === "todos los jefes" || clave === "global";
}

// Nombre tal como está en JEFES_EQUIPO (una fila a mano puede traerlo en minúsculas),
// o "TODOS" para las globales; si no se reconoce se deja el texto original.
function tarNombreCanonico_(texto) {
  const k = tarNormalizar_(texto);
  if (tarEsGlobalClave_(k)) return TAREA_GLOBAL;
  for (let i = 0; i < JEFES_EQUIPO.length; i++) {
    if (tarNormalizar_(JEFES_EQUIPO[i]) === k) return JEFES_EQUIPO[i];
  }
  if (JEFES_ALIAS.hasOwnProperty(k)) return JEFES_ALIAS[k];
  return String(texto == null ? "" : texto).trim();
}

function tarTomarLock_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return lock;
  } catch (e) {
    return null;
  }
}

// Devuelve { sheet } o { error }. Crea la hoja la primera vez que se usa.
function tarObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_TAREAS, CABECERAS_TAREAS, prepararHojaTareas_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Tareas; inténtalo de nuevo." };
  return { sheet: sheet };
}

// Lee la hoja de forma tolerante: una tarea escrita a mano puede no tener ID,
// estado, prioridad, fecha de asignación... o traer las fechas en otro formato.
function tarLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const mesPrimero = tarSheetMesPrimero_(sheet);
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    let titulo = tarTexto_(f[1]);
    const descripcion = tarTexto_(f[2]);
    if (titulo === "" && descripcion === "") continue;
    if (titulo === "") titulo = descripcion.split("\n")[0].slice(0, 80);

    const idNum = parseInt(tarTexto_(f[0]), 10);
    const asignadoA = tarNombreCanonico_(tarTexto_(f[3]));
    const textoLimite = tarTextoFecha_(f[6], false, mesPrimero);
    const limiteClave = tarClaveFecha_(textoLimite);
    const textoAsignacion = tarTextoFecha_(f[5], false, mesPrimero);
    const asigClave = tarClaveFecha_(textoAsignacion);
    const textoCierre = tarTextoFecha_(f[9], true, mesPrimero);

    filas.push({
      fila: i + 1,
      id: isNaN(idNum) ? null : idNum,
      titulo: titulo,
      descripcion: descripcion,
      asignadoA: asignadoA,
      asignadoClave: tarNormalizar_(asignadoA),
      global: asignadoA === TAREA_GLOBAL,
      prioridad: tarPrioridadCanonica_(f[4]),
      fechaAsignacion: asigClave !== null ? tarClaveATexto_(asigClave) : textoAsignacion,
      fechaLimite: limiteClave !== null ? tarClaveATexto_(limiteClave) : textoLimite,
      limiteClave: limiteClave,
      estado: tarEstadoCanonico_(f[7]),
      feedback: tarTexto_(f[8]),
      fechaCierre: textoCierre,
      cierreOrden: tarClaveOrden_(textoCierre),
      cerradaPor: tarTexto_(f[10]),
      correoEnviado: tarTexto_(f[11]),
      fotoTarea: tarTexto_(f[12]) !== "",
      fotoCierre: tarTexto_(f[13]) !== ""
    });
  }
  return filas;
}

// Asigna ID (max+1) a las tareas apuntadas a mano sin él, y rellena estado,
// prioridad y fecha de asignación si estaban vacíos. Bajo bloqueo.
function tarRepararIds_(sheet) {
  const lock = tarTomarLock_();
  if (!lock) return false;
  try {
    const datos = sheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < datos.length; i++) {
      const n = parseInt(tarTexto_(datos[i][0]), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
    const hoyTxt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    for (let i = 1; i < datos.length; i++) {
      const f = datos[i];
      if (tarTexto_(f[1]) === "" && tarTexto_(f[2]) === "") continue;
      if (!isNaN(parseInt(tarTexto_(f[0]), 10))) continue;
      maxId++;
      sheet.getRange(i + 1, 1).setValue(maxId);
      if (tarTexto_(f[4]) === "") sheet.getRange(i + 1, 5).setValue("Normal");
      if (tarTexto_(f[5]) === "") sheet.getRange(i + 1, 6).setNumberFormat("@").setValue(hoyTxt);
      if (tarTexto_(f[7]) === "") sheet.getRange(i + 1, 8).setValue("Pendiente");
    }
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    Logger.log("❌ Error reparando IDs de tareas: " + e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

function tarLeerReparando_(sheet) {
  let filas = tarLeer_(sheet);
  if (filas.some(function (t) { return t.id === null; })) {
    tarRepararIds_(sheet);
    filas = tarLeer_(sheet);
  }
  return filas;
}

// Pendientes: primero las de prioridad Alta, luego por fecha límite (las que no
// tienen, al final) y por último por ID.
function tarCompararPendientes_(a, b) {
  if (a.prioridad !== b.prioridad) return a.prioridad === "Alta" ? -1 : 1;
  const la = a.limiteClave === null ? Infinity : a.limiteClave;
  const lb = b.limiteClave === null ? Infinity : b.limiteClave;
  if (la !== lb) return la < lb ? -1 : 1;
  return (a.id || 0) - (b.id || 0);
}

// Cerradas: las más recientes primero.
function tarCompararCerradas_(a, b) {
  if (a.cierreOrden !== b.cierreOrden) return b.cierreOrden - a.cierreOrden;
  return b.fila - a.fila;
}

function tarParaCliente_(t, hoyClave, vistaJefe) {
  const pendiente = t.estado === "Pendiente";
  let aTiempo = null;
  if (t.estado === "Completada" && t.limiteClave !== null && t.cierreOrden > 0) {
    aTiempo = Math.floor(t.cierreOrden / 10000) <= t.limiteClave;
  }
  const r = {
    id: t.id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    global: t.global,
    prioridad: t.prioridad,
    fechaAsignacion: t.fechaAsignacion,
    fechaLimite: t.fechaLimite,
    vencida: pendiente && t.limiteClave !== null && t.limiteClave < hoyClave,
    venceHoy: pendiente && t.limiteClave !== null && t.limiteClave === hoyClave,
    feedback: t.feedback,
    fechaCierre: t.fechaCierre,
    aTiempo: aTiempo,
    fotoTarea: t.fotoTarea,
    fotoCierre: t.fotoCierre
  };
  if (!vistaJefe) {
    r.asignadoA = t.asignadoA;
    r.estado = t.estado;
    r.cerradaPor = t.cerradaPor;
    r.correoEnviado = t.correoEnviado;
  }
  return r;
}

// Texto libre multilínea: normaliza saltos de línea y comprueba el máximo.
function tarLimpiarLargo_(valor, max, etiqueta) {
  const t = String(valor == null ? "" : valor).replace(/\r\n?/g, "\n").trim();
  if (t.length > max) throw new Error(etiqueta + " es demasiado largo (máximo " + max + " caracteres).");
  return t;
}

// ── Fotos (opcionales) ───────────────────────────────────────
// Foto ID = "<id>-T" (foto de la tarea, la sube quien la crea) o "<id>-C" (foto del cierre).

// "" si no hay foto; lanza error si no es una imagen válida o es demasiado grande.
function tarValidarFoto_(foto) {
  if (foto === undefined || foto === null || foto === "") return "";
  const f = String(foto);
  if (f.length > TAREA_FOTO_MAX_CHARS) throw new Error("La foto es demasiado grande.");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+={0,2}$/.test(f)) throw new Error("La foto no es válida.");
  return f;
}

// Hoja de fotos lista para usar (se crea la primera vez). Llamar ANTES de coger el bloqueo de escritura.
function tarObtenerHojaFotos_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_TAREAS_FOTOS, CABECERAS_TAREAS_FOTOS, prepararHojaTareasFotos_);
  if (!sheet) return { error: "No se pudo preparar la hoja de fotos; inténtalo de nuevo." };
  return { sheet: sheet };
}

// Guarda la foto troceada en filas contiguas [Foto ID, Parte, Total, Datos]. Va DENTRO del bloqueo del llamador.
function tarGuardarFoto_(sheet, fotoId, dataUri) {
  const filas = [];
  for (let i = 0; i < dataUri.length; i += TAREA_FOTO_TROZO) filas.push([fotoId, 0, 0, dataUri.slice(i, i + TAREA_FOTO_TROZO)]);
  filas.forEach(function (fila, i) { fila[1] = i + 1; fila[2] = filas.length; });
  sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, 4).setValues(filas);
  SpreadsheetApp.flush();
}

// Devuelve la data URI completa o "". No crea la hoja (se puede llamar dentro de un bloqueo).
function tarLeerFoto_(fotoId) {
  try {
    const ss = abrirHojaCentinela_();
    const sheet = ss ? ss.getSheetByName(CONFIG.SHEET_NAME_TAREAS_FOTOS) : null;
    if (!sheet) return "";
    const ultima = sheet.getLastRow();
    if (ultima < 2) return "";
    const ids = sheet.getRange(2, 1, ultima - 1, 3).getValues();
    let primera = -1, total = 0;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === fotoId && Number(ids[i][1]) === 1) { primera = i + 2; total = Number(ids[i][2]); break; }
    }
    if (primera < 0 || total < 1) return "";
    const partes = sheet.getRange(primera, 1, total, 4).getValues();
    let out = "";
    for (let j = 0; j < total; j++) {
      if (String(partes[j][0]) !== fotoId || Number(partes[j][1]) !== j + 1) return "";
      out += String(partes[j][3]);
    }
    return out;
  } catch (e) {
    Logger.log("⚠️ No se pudo leer la foto " + fotoId + ": " + e.message);
    return "";
  }
}

// ── API pública (google.script.run) ─────────────────────────

// Qué tareas ve un jefe (clave = su nombre normalizado):
//  - pendientes: las suyas y las GLOBALES (las de "TODOS") aún sin cerrar;
//  - completadas: las suyas y las globales que cerró ÉL (a los demás jefes una global
//    cerrada por otro les desaparece del todo);
//  - anuladas: nunca.
function tarVisibleParaJefe_(t, clave) {
  if (t.estado === "Pendiente") return t.global || t.asignadoClave === clave;
  if (t.estado === "Completada" || t.estado === "No realizada") {
    return t.global ? tarNormalizar_(t.cerradaPor) === clave : t.asignadoClave === clave;
  }
  return false;
}

// Vista del jefe: SOLO sus tareas y las globales (filtradas aquí, en el servidor).
function obtenerTareasDeJefe(jefe) {
  if (!jefe) throw new Error("Falta indicar quién eres.");
  jefe = jefeVigente_(jefe);
  if (JEFES_EQUIPO.indexOf(jefe) === -1) throw new Error("Jefe de equipo no reconocido: " + jefe);

  const h = tarObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };

  const clave = tarNormalizar_(jefe);
  const hoy = tarHoyClave_();
  const visibles = tarLeerReparando_(h.sheet).filter(function (t) { return tarVisibleParaJefe_(t, clave); });

  const pendientes = visibles
    .filter(function (t) { return t.estado === "Pendiente"; })
    .sort(tarCompararPendientes_)
    .map(function (t) { return tarParaCliente_(t, hoy, true); });
  const completadas = visibles
    .filter(function (t) { return t.estado === "Completada"; })
    .sort(tarCompararCerradas_)
    .slice(0, TAREA_COMPLETADAS_JEFE)
    .map(function (t) { return tarParaCliente_(t, hoy, true); });
  const noRealizadas = visibles
    .filter(function (t) { return t.estado === "No realizada"; })
    .sort(tarCompararCerradas_)
    .slice(0, TAREA_NO_REALIZADAS_JEFE)
    .map(function (t) { return tarParaCliente_(t, hoy, true); });

  return { ok: true, pendientes: pendientes, completadas: completadas, noRealizadas: noRealizadas };
}

// Vista del supervisor: todas las tareas (las cerradas, acotadas a las más recientes).
function obtenerTodasLasTareas() {
  const h = tarObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };

  const hoy = tarHoyClave_();
  const todas = tarLeerReparando_(h.sheet);
  const pendientes = todas.filter(function (t) { return t.estado === "Pendiente"; }).sort(tarCompararPendientes_);
  const completadas = todas.filter(function (t) { return t.estado === "Completada"; }).sort(tarCompararCerradas_);
  const noRealizadas = todas.filter(function (t) { return t.estado === "No realizada"; }).sort(tarCompararCerradas_);
  const anuladas = todas.filter(function (t) { return t.estado === "Anulada"; }).sort(tarCompararCerradas_);

  const resumen = {
    pendientes: pendientes.length,
    vencidas: pendientes.filter(function (t) { return t.limiteClave !== null && t.limiteClave < hoy; }).length,
    completadas: completadas.length,
    noRealizadas: noRealizadas.length,
    anuladas: anuladas.length
  };
  const cerradas = completadas.concat(noRealizadas, anuladas).sort(tarCompararCerradas_).slice(0, TAREA_CERRADAS_SUPERVISOR);
  const tareas = pendientes.concat(cerradas).map(function (t) { return tarParaCliente_(t, hoy, false); });
  return { ok: true, tareas: tareas, resumen: resumen };
}

// Valida lo que manda el cliente y lo deja limpio. Lanza Error con un mensaje para el usuario.
// ajustarLimite: al ejecutar una petición aprobada días después, una fecha límite ya pasada se deja en hoy.
function tarValidarNueva_(data, ajustarLimite) {
  const titulo = String(data.titulo == null ? "" : data.titulo).replace(/\s+/g, " ").trim();
  if (!titulo) throw new Error("El título es obligatorio.");
  if (titulo.length > TAREA_MAX_TITULO) {
    throw new Error("El título es demasiado largo (máximo " + TAREA_MAX_TITULO + " caracteres).");
  }
  const descripcion = tarLimpiarLargo_(data.descripcion, TAREA_MAX_DESCRIPCION, "La descripción");

  if (!data.asignado_a) throw new Error("Elige a qué jefe de equipo se asigna.");
  if (data.asignado_a !== TAREA_GLOBAL && JEFES_EQUIPO.indexOf(data.asignado_a) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.asignado_a);
  }
  const prioridad = data.prioridad || "Normal";
  if (prioridad !== "Normal" && prioridad !== "Alta") throw new Error("Prioridad no válida: " + prioridad);

  let limiteTxt = "";
  const limiteEntrada = String(data.fecha_limite == null ? "" : data.fecha_limite).trim();
  if (limiteEntrada) {
    let clave = tarClaveFecha_(limiteEntrada);
    if (clave === null) throw new Error("La fecha límite no es válida.");
    if (clave < tarHoyClave_()) {
      if (!ajustarLimite) throw new Error("La fecha límite no puede ser anterior a hoy.");
      clave = tarHoyClave_();
    }
    limiteTxt = tarClaveATexto_(clave);
  }
  return { titulo: titulo, descripcion: descripcion, asignadoA: data.asignado_a, prioridad: prioridad, limiteTxt: limiteTxt, foto: tarValidarFoto_(data.foto) };
}

function crearTarea(data) {
  Logger.log("📥 Nueva tarea");
  if (!data) throw new Error("No se han recibido datos.");
  const v = tarValidarNueva_(data, false);

  // Una tarea para TODOS los jefes de un mando espera el visto bueno del jefe de área (ver Aprobaciones.gs).
  const perfil = perfilActual_();
  if (v.asignadoA === TAREA_GLOBAL && perfilNecesitaAprobacion_("globales", perfil)) {
    return apSolicitarYResponder_("tarea_global", v.titulo,
      { titulo: v.titulo, descripcion: v.descripcion, asignado_a: v.asignadoA, prioridad: v.prioridad, fecha_limite: v.limiteTxt }, v.foto, perfil);
  }
  const r = tarCrearValidada_(v, perfilCreador_(perfil, data.creador));
  if (r.success) actividadRegistrar_("tarea", "Tarea #" + r.id + " «" + v.titulo + "» → " + (v.asignadoA === TAREA_GLOBAL ? "todos los jefes" : v.asignadoA), perfil);
  return r;
}

// Crea la tarea ya validada (sin pedir aprobación: eso se decide antes) y avisa por correo.
function tarCrearValidada_(v, creador) {
  const h = tarObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  let hojaFotos = null;
  if (v.foto) {
    hojaFotos = tarObtenerHojaFotos_();
    if (hojaFotos.error) return { success: false, error: hojaFotos.error };
  }

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  let nuevoId;
  try {
    nuevoId = tarInsertarEnLock_(h.sheet, hojaFotos ? hojaFotos.sheet : null, {
      titulo: v.titulo, descripcion: v.descripcion, asignadoA: v.asignadoA, prioridad: v.prioridad, limiteTxt: v.limiteTxt, foto: v.foto
    });
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("❌ Error creando tarea: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }

  // Aviso por correo a quien recibe la tarea, FUERA del bloqueo y sin poder deshacer nada: si el correo
  // falla la tarea ya está creada y el supervisor lo ve en la respuesta (correoEnviado).
  const correoEnviado = tarEnviarCorreoNueva_({
    id: nuevoId, titulo: v.titulo, descripcion: v.descripcion, asignadoA: v.asignadoA, prioridad: v.prioridad,
    fechaLimite: v.limiteTxt, tipo: "manual", creador: creador || "Supervisor", fotoUri: v.foto
  });
  return { success: true, id: nuevoId, correoEnviado: correoEnviado };
}

// Siguiente ID de tarea (max + 1) mirando solo la columna A.
function tarSiguienteId_(sheet) {
  const ultima = sheet.getLastRow();
  let maxId = 0;
  if (ultima >= 2) {
    sheet.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (f) {
      const n = parseInt(tarTexto_(f[0]), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
  }
  return maxId + 1;
}

// Añade una tarea Pendiente a la hoja Tareas y devuelve su ID. EL LLAMADOR YA TIENE EL BLOQUEO (los de
// Apps Script no son reentrantes: por eso crearTarea y la generación automática comparten esta pieza en
// vez de llamarse entre sí). d = { titulo, descripcion, asignadoA, prioridad, limiteTxt, foto }.
function tarInsertarEnLock_(sheet, hojaFotos, d) {
  const nuevoId = tarSiguienteId_(sheet);
  const hoyTxt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  // La foto va primero: si no se puede guardar, la tarea no se crea a medias.
  if (d.foto) tarGuardarFoto_(hojaFotos, nuevoId + "-T", d.foto);
  // Sin appendRow: la fila nueva se pone en «texto sin formato» ANTES de escribirla. Si la celda no lo tiene (hoja
  // creada antes de esa regla, o filas añadidas por debajo de lo formateado) Sheets convierte "05/10/2026" en
  // fecha según su idioma (mes/día) y el día 5 de octubre pasa a ser el 10 de mayo.
  const fila = sheet.getLastRow() + 1;
  if (fila > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
  sheet.getRange(fila, 2, 1, 13).setNumberFormat("@");
  sheet.getRange(fila, 1, 1, 14).setValues([[nuevoId, d.titulo, d.descripcion, d.asignadoA, d.prioridad, hoyTxt, d.limiteTxt || "", "Pendiente", "", "", "", "", d.foto ? "Sí" : "", ""]]);
  return nuevoId;
}

// Anula una tarea que sigue pendiente (no toca las ya completadas).
function anularTarea(data) {
  Logger.log("📥 Anular tarea: " + (data && data.id));
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") {
    throw new Error("Falta la tarea.");
  }

  const h = tarObtenerHoja_();
  if (h.error) return { success: false, error: h.error };

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  try {
    const buscado = String(data.id).trim();
    const t = tarLeer_(h.sheet).filter(function (x) { return x.id !== null && String(x.id) === buscado; })[0];
    if (!t) return { success: false, error: "Tarea no encontrada." };
    if (t.estado === "Completada") return { success: false, error: "Esta tarea ya estaba completada." };
    if (t.estado === "Anulada") return { success: false, error: "Esta tarea ya estaba anulada." };

    const cierre = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    h.sheet.getRange(t.fila, 8, 1, 4).setNumberFormat("@").setValues([["Anulada", t.feedback, cierre, "Supervisor"]]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error anulando tarea: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// " a las 10:35" (o " el 21/09/2026 a las 10:35" si no fue hoy); "" si no hay hora.
function tarCuandoCerrada_(t) {
  const hm = (t.fechaCierre.match(/(\d{1,2}:\d{2})/) || [])[1];
  if (!hm) return "";
  const diaCierre = tarClaveFecha_(t.fechaCierre);
  return (diaCierre === null || diaCierre === tarHoyClave_())
    ? " a las " + hm
    : " el " + tarClaveATexto_(diaCierre) + " a las " + hm;
}

// "Ya la ha completado Dani Simo a las 10:35." (con la fecha si no fue hoy).
function tarMensajeYaCompletada_(t, jefe) {
  const cuando = tarCuandoCerrada_(t);
  if (t.cerradaPor && tarNormalizar_(t.cerradaPor) === tarNormalizar_(jefe)) {
    return "Ya la habías completado tú" + cuando + ".";
  }
  return "Ya la ha completado " + (t.cerradaPor || "otro jefe") + cuando + ".";
}

// "Ya la marcó Dani Simo como no realizada a las 10:35." (mismo patrón que la de arriba).
function tarMensajeYaNoRealizada_(t, jefe) {
  const cuando = tarCuandoCerrada_(t);
  if (t.cerradaPor && tarNormalizar_(t.cerradaPor) === tarNormalizar_(jefe)) {
    return "Ya la habías marcado tú como no realizada" + cuando + ".";
  }
  return "Ya la marcó " + (t.cerradaPor || "otro jefe") + " como no realizada" + cuando + ".";
}

// Cierra una tarea del jefe con su feedback y avisa por correo al responsable.
// Si el correo falla, la tarea queda cerrada igualmente (no se pierde el cierre)
// y se avisa; el éxito real es haber guardado el cierre.
// Una tarea GLOBAL la puede cerrar cualquier jefe, pero solo el primero: se comprueba
// el estado bajo bloqueo, así que dos cierres a la vez no pasan los dos.
function completarTarea(data) {
  Logger.log("📥 Completar tarea: " + (data && data.id));
  if (!data) throw new Error("No se han recibido datos.");
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  data.jefe_equipo = jefeVigente_(data.jefe_equipo);
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  if (data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la tarea.");
  const feedback = tarLimpiarLargo_(data.feedback, TAREA_MAX_FEEDBACK, "El feedback");
  if (feedback.length < TAREA_MIN_FEEDBACK) {
    throw new Error("Escribe un pequeño feedback (mínimo " + TAREA_MIN_FEEDBACK + " caracteres) para cerrar la tarea.");
  }
  const jefe = data.jefe_equipo;
  const foto = tarValidarFoto_(data.foto);

  const h = tarObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  let hojaFotos = null;
  if (foto) {
    hojaFotos = tarObtenerHojaFotos_();
    if (hojaFotos.error) return { success: false, error: hojaFotos.error };
  }

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  try {
    // Se relee bajo bloqueo: así dos cierres a la vez no pasan los dos por "Pendiente".
    const buscado = String(data.id).trim();
    const coincidencias = tarLeer_(h.sheet).filter(function (x) { return x.id !== null && String(x.id) === buscado; });
    // Un ID repetido en la hoja (apuntado a mano) no debe producir un rechazo absurdo («no está asignada a ti», «ya completada»):
    // se prefiere la fila PENDIENTE que este jefe sí puede cerrar; si no hay, la primera, para dar el motivo de siempre.
    const t = coincidencias.filter(function (x) { return x.estado === "Pendiente" && (x.global || x.asignadoClave === tarNormalizar_(jefe)); })[0] || coincidencias[0];
    // `refrescar: true` indica a la interfaz que su lista está desfasada y debe recargarla.
    if (!t) return { success: false, error: "Tarea no encontrada.", refrescar: true };
    if (!t.global && t.asignadoClave !== tarNormalizar_(jefe)) {
      return { success: false, error: "Esta tarea no está asignada a ti." };
    }
    if (t.estado === "Completada") {
      return {
        success: false, refrescar: true,
        error: t.global ? tarMensajeYaCompletada_(t, jefe) : "Esta tarea ya estaba completada."
      };
    }
    if (t.estado === "No realizada") {
      return {
        success: false, refrescar: true,
        error: t.global ? tarMensajeYaNoRealizada_(t, jefe) : "Esta tarea ya se había marcado como no realizada."
      };
    }
    if (t.estado === "Anulada") return { success: false, error: "Esta tarea ha sido anulada.", refrescar: true };

    const ahora = new Date();
    const tz = Session.getScriptTimeZone();
    const cierreTxt = Utilities.formatDate(ahora, tz, "dd/MM/yyyy HH:mm");
    const cierreDia = parseInt(Utilities.formatDate(ahora, tz, "yyyyMMdd"), 10);
    // La foto (si hay) va primero: si no se puede guardar, la tarea NO se cierra a medias.
    if (foto) tarGuardarFoto_(hojaFotos.sheet, t.id + "-C", foto);
    h.sheet.getRange(t.fila, 8, 1, 5).setNumberFormat("@").setValues([["Completada", feedback, cierreTxt, jefe, "No"]]);
    if (foto) h.sheet.getRange(t.fila, 14).setValue("Sí");
    SpreadsheetApp.flush();

    const aTiempo = t.limiteClave === null ? null : cierreDia <= t.limiteClave;
    const emailOk = tarEnviarCorreoCompletada_(t, jefe, feedback, cierreTxt, aTiempo, foto);
    if (emailOk) {
      try {
        h.sheet.getRange(t.fila, 12).setValue("Sí");
        SpreadsheetApp.flush();
      } catch (e) {
        Logger.log("⚠️ No se pudo marcar el correo como enviado: " + e.message);
      }
    }

    const avisos = [];
    if (!emailOk) avisos.push("La tarea se ha cerrado, pero el correo al responsable no se pudo enviar.");
    return { success: true, emailEnviado: emailOk, avisos: avisos };
  } catch (e) {
    Logger.log("❌ Error completando tarea: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Cierra una tarea del jefe SIN completarla, con el motivo por el que no se pudo hacer, y avisa
// por correo al responsable. Mismas reglas que completarTarea: una GLOBAL la cierra el primero
// (para bien o para mal) y el cierre es atómico bajo bloqueo.
function marcarTareaNoRealizada(data) {
  Logger.log("📥 Tarea no realizada: " + (data && data.id));
  if (!data) throw new Error("No se han recibido datos.");
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  data.jefe_equipo = jefeVigente_(data.jefe_equipo);
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  if (data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la tarea.");
  const motivo = tarLimpiarLargo_(data.motivo, TAREA_MAX_MOTIVO, "El motivo");
  if (motivo.length < TAREA_MIN_MOTIVO) {
    throw new Error("Explica el motivo (mínimo " + TAREA_MIN_MOTIVO + " caracteres) por el que no se pudo hacer.");
  }
  const jefe = data.jefe_equipo;
  const foto = tarValidarFoto_(data.foto);

  const h = tarObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  let hojaFotos = null;
  if (foto) {
    hojaFotos = tarObtenerHojaFotos_();
    if (hojaFotos.error) return { success: false, error: hojaFotos.error };
  }

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };

  try {
    // Se relee bajo bloqueo: así dos cierres a la vez no pasan los dos por "Pendiente".
    const buscado = String(data.id).trim();
    const coincidencias = tarLeer_(h.sheet).filter(function (x) { return x.id !== null && String(x.id) === buscado; });
    // Un ID repetido en la hoja (apuntado a mano) no debe producir un rechazo absurdo («no está asignada a ti», «ya completada»):
    // se prefiere la fila PENDIENTE que este jefe sí puede cerrar; si no hay, la primera, para dar el motivo de siempre.
    const t = coincidencias.filter(function (x) { return x.estado === "Pendiente" && (x.global || x.asignadoClave === tarNormalizar_(jefe)); })[0] || coincidencias[0];
    if (!t) return { success: false, error: "Tarea no encontrada.", refrescar: true };
    if (!t.global && t.asignadoClave !== tarNormalizar_(jefe)) {
      return { success: false, error: "Esta tarea no está asignada a ti." };
    }
    if (t.estado === "Completada") {
      return {
        success: false, refrescar: true,
        error: t.global ? tarMensajeYaCompletada_(t, jefe) : "Esta tarea ya estaba completada."
      };
    }
    if (t.estado === "No realizada") {
      return {
        success: false, refrescar: true,
        error: t.global ? tarMensajeYaNoRealizada_(t, jefe) : "Esta tarea ya se había marcado como no realizada."
      };
    }
    if (t.estado === "Anulada") return { success: false, error: "Esta tarea ha sido anulada.", refrescar: true };

    const ahora = new Date();
    const tz = Session.getScriptTimeZone();
    const cierreTxt = Utilities.formatDate(ahora, tz, "dd/MM/yyyy HH:mm");
    // La foto (si hay) va primero: si no se puede guardar, la tarea NO se cierra a medias.
    if (foto) tarGuardarFoto_(hojaFotos.sheet, t.id + "-C", foto);
    h.sheet.getRange(t.fila, 8, 1, 5).setNumberFormat("@").setValues([["No realizada", motivo, cierreTxt, jefe, "No"]]);
    if (foto) h.sheet.getRange(t.fila, 14).setValue("Sí");
    SpreadsheetApp.flush();

    const emailOk = tarEnviarCorreoNoRealizada_(t, jefe, motivo, cierreTxt, foto);
    if (emailOk) {
      try {
        h.sheet.getRange(t.fila, 12).setValue("Sí");
        SpreadsheetApp.flush();
      } catch (e) {
        Logger.log("⚠️ No se pudo marcar el correo como enviado: " + e.message);
      }
    }

    const avisos = [];
    if (!emailOk) avisos.push("La tarea se ha marcado como no realizada, pero el correo al responsable no se pudo enviar.");
    return { success: true, emailEnviado: emailOk, avisos: avisos };
  } catch (e) {
    Logger.log("❌ Error marcando tarea como no realizada: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ── Correo-informe al responsable ───────────────────────────

function tarEnviarCorreoCompletada_(t, jefe, feedback, cierreTxt, aTiempo, fotoCierre) {
  try {
    // Fotos opcionales: la de la tarea (subida al crearla) y la del cierre. Van incrustadas en el correo.
    const blobTarea = t.fotoTarea ? dataUriABlob(tarLeerFoto_(t.id + "-T"), "foto_tarea.jpg") : null;
    const blobCierre = fotoCierre ? dataUriABlob(fotoCierre, "foto_cierre.jpg") : null;
    const bloqueFoto = function (cid, titulo, blob) {
      if (!blob) return "";
      return "<div style=\"margin:0 0 16px;\"><p style=\"margin:0 0 6px;color:#6b7899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;\">" + escapeHtml(titulo) + "</p>" +
        "<img src=\"cid:" + cid + "\" alt=\"" + escapeHtml(titulo) + "\" width=\"480\" style=\"max-width:100%;height:auto;border-radius:12px;display:block;\"></div>";
    };
    const tituloLinea = String(t.titulo).replace(/\s+/g, " ").trim();
    const asunto = (t.global ? "✅ Tarea global completada · " : "✅ Tarea completada · ") + tituloLinea + " · " + jefe;
    const conSaltos = function (texto) { return escapeHtml(texto).replace(/\n/g, "<br>"); };

    const fila = function (etiqueta, valorHtml, conBorde) {
      const borde = conBorde ? "border-bottom:1px solid rgba(255,255,255,0.06);" : "";
      return "<tr><td style=\"padding:10px 0;" + borde + "color:#6b7899;font-size:13px;\">" + etiqueta + "</td>" +
        "<td align=\"right\" style=\"padding:10px 0;" + borde + "color:#f0f4ff;font-size:14px;font-weight:700;\">" + valorHtml + "</td></tr>";
    };
    const etiquetaAlta = "<span style=\"background:#e30613;color:#ffffff;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;text-transform:uppercase;\">Alta</span>";
    const prioridadHtml = t.prioridad === "Alta" ? etiquetaAlta : "Normal";
    let cierreHtml = escapeHtml(cierreTxt);
    if (aTiempo === true) {
      cierreHtml += " <span style=\"background:#22c55e;color:#000000;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;text-transform:uppercase;\">A tiempo</span>";
    } else if (aTiempo === false) {
      cierreHtml += " <span style=\"background:#f0b429;color:#000000;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;text-transform:uppercase;\">Con retraso</span>";
    }

    const html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>" +
      "<body style=\"margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;background:#080a10;color:#f0f4ff;\">" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" bgcolor=\"#080a10\" style=\"background:#080a10;\">" +
      "<tr><td align=\"center\" style=\"padding:0;\">" +
      "<div style=\"max-width:560px;margin:0 auto;padding:32px 20px;text-align:left;\">" +
      "<div style=\"background:#0f1220;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;\">" +
      "<div style=\"display:inline-block;background:#ffffff;padding:12px 18px;border-radius:12px;margin-bottom:20px;\">" +
      "<img src=\"cid:logotaisa\" alt=\"Taisa Logistics\" width=\"130\" style=\"width:130px;height:auto;display:block;\"></div>" +
      "<p style=\"margin:0 0 6px;color:#22c55e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;\">" + (t.global ? "Tarea global completada" : "Tarea completada") + "</p>" +
      "<h1 style=\"margin:0 0 20px;font-size:22px;line-height:1.3;color:#f0f4ff;\">" + escapeHtml(tituloLinea) + "</h1>" +
      (t.global
        ? "<div style=\"background:#161b2e;border-left:3px solid #4c7dff;border-radius:10px;padding:14px 16px;margin-bottom:16px;\">" +
          "<p style=\"margin:0;color:#c7cede;font-size:13px;line-height:1.6;\">🌐 Tarea <b>global</b>: estaba asignada a todos los jefes de equipo. La ha cerrado el primero en completarla: <b style=\"color:#f0f4ff;\">" + escapeHtml(jefe) + "</b>.</p></div>"
        : "") +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" style=\"border-collapse:collapse;margin-bottom:20px;\">" +
      fila(t.global ? "Completada por (el primero)" : "Jefe de equipo", escapeHtml(jefe), true) +
      (t.global ? fila("Asignada a", "Todos los jefes (global)", true) : "") +
      fila("Prioridad", prioridadHtml, true) +
      fila("Asignada", escapeHtml(t.fechaAsignacion || "—"), true) +
      fila("Fecha límite", escapeHtml(t.fechaLimite || "Sin fecha límite"), true) +
      fila("Cerrada", cierreHtml, false) +
      "</table>" +
      (t.descripcion
        ? "<div style=\"background:#161b2e;border-radius:12px;padding:16px;margin-bottom:16px;\">" +
          "<p style=\"margin:0 0 6px;color:#6b7899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;\">Descripción</p>" +
          "<p style=\"margin:0;color:#a3b0cc;font-size:14px;line-height:1.6;\">" + conSaltos(t.descripcion) + "</p></div>"
        : "") +
      bloqueFoto("fototarea", "Foto de la tarea", blobTarea) +
      "<div style=\"background:#161b2e;border-left:3px solid #22c55e;border-radius:10px;padding:16px;margin-bottom:8px;\">" +
      "<p style=\"margin:0 0 6px;color:#6b7899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;\">Feedback de " + escapeHtml(jefe) + "</p>" +
      "<p style=\"margin:0;color:#f0f4ff;font-size:14px;line-height:1.6;\">" + conSaltos(feedback) + "</p></div>" +
      bloqueFoto("fotocierre", "Foto de " + jefe, blobCierre) +
      "<div style=\"text-align:center;padding-top:24px;margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);color:#6b7899;font-size:12px;\">" +
      "Centinela — Taisa Logistics</div>" +
      "</div></div></td></tr></table></body></html>";

    const texto = [
      (t.global ? "Tarea GLOBAL completada: " : "Tarea completada: ") + tituloLinea,
      t.global ? "Tarea global (asignada a todos los jefes): la ha cerrado el primero en completarla." : "",
      (t.global ? "Completada por (el primero): " : "Jefe de equipo: ") + jefe,
      "Prioridad: " + t.prioridad,
      "Asignada: " + (t.fechaAsignacion || "—"),
      "Fecha límite: " + (t.fechaLimite || "sin fecha límite"),
      "Cerrada: " + cierreTxt + (aTiempo === true ? " (a tiempo)" : aTiempo === false ? " (con retraso)" : ""),
      t.descripcion ? "\nDescripción:\n" + t.descripcion : "",
      "\nFeedback:\n" + feedback
    ].filter(function (linea) { return linea !== ""; }).join("\n");

    const logoBlob = dataUriABlob(LOGO_TAISA_DATA_URI, "logo_taisa.png");
    const opciones = { cc: ccConResponsables_(CONFIG.EMAIL_RESPONSABLE), htmlBody: htmlSeguro_(html), name: "Centinela — Taisa Logistics" };
    const imagenes = {};
    if (logoBlob) imagenes.logotaisa = logoBlob;
    if (blobTarea) imagenes.fototarea = blobTarea;
    if (blobCierre) imagenes.fotocierre = blobCierre;
    if (Object.keys(imagenes).length) opciones.inlineImages = imagenes;

    GmailApp.sendEmail(CONFIG.EMAIL_RESPONSABLE, asuntoSeguro_(asunto), sinAstrales_(texto), opciones);
    return true;
  } catch (e) {
    Logger.log("❌ Error enviando correo de tarea completada: " + e.message);
    return false;
  }
}

// Mismo formato que el de completada, pero en ámbar/aviso y con el motivo en vez del feedback.
function tarEnviarCorreoNoRealizada_(t, jefe, motivo, cierreTxt, fotoCierre) {
  try {
    const blobTarea = t.fotoTarea ? dataUriABlob(tarLeerFoto_(t.id + "-T"), "foto_tarea.jpg") : null;
    const blobCierre = fotoCierre ? dataUriABlob(fotoCierre, "foto_cierre.jpg") : null;
    const bloqueFoto = function (cid, titulo, blob) {
      if (!blob) return "";
      return "<div style=\"margin:0 0 16px;\"><p style=\"margin:0 0 6px;color:#6b7899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;\">" + escapeHtml(titulo) + "</p>" +
        "<img src=\"cid:" + cid + "\" alt=\"" + escapeHtml(titulo) + "\" width=\"480\" style=\"max-width:100%;height:auto;border-radius:12px;display:block;\"></div>";
    };
    const tituloLinea = String(t.titulo).replace(/\s+/g, " ").trim();
    const asunto = (t.global ? "⚠️ Tarea global NO realizada · " : "⚠️ Tarea NO realizada · ") + tituloLinea + " · " + jefe;
    const conSaltos = function (texto) { return escapeHtml(texto).replace(/\n/g, "<br>"); };

    const fila = function (etiqueta, valorHtml, conBorde) {
      const borde = conBorde ? "border-bottom:1px solid rgba(255,255,255,0.06);" : "";
      return "<tr><td style=\"padding:10px 0;" + borde + "color:#6b7899;font-size:13px;\">" + etiqueta + "</td>" +
        "<td align=\"right\" style=\"padding:10px 0;" + borde + "color:#f0f4ff;font-size:14px;font-weight:700;\">" + valorHtml + "</td></tr>";
    };
    const etiquetaAlta = "<span style=\"background:#e30613;color:#ffffff;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;text-transform:uppercase;\">Alta</span>";
    const prioridadHtml = t.prioridad === "Alta" ? etiquetaAlta : "Normal";

    const html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>" +
      "<body style=\"margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;background:#080a10;color:#f0f4ff;\">" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" bgcolor=\"#080a10\" style=\"background:#080a10;\">" +
      "<tr><td align=\"center\" style=\"padding:0;\">" +
      "<div style=\"max-width:560px;margin:0 auto;padding:32px 20px;text-align:left;\">" +
      "<div style=\"background:#0f1220;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;\">" +
      "<div style=\"display:inline-block;background:#ffffff;padding:12px 18px;border-radius:12px;margin-bottom:20px;\">" +
      "<img src=\"cid:logotaisa\" alt=\"Taisa Logistics\" width=\"130\" style=\"width:130px;height:auto;display:block;\"></div>" +
      "<p style=\"margin:0 0 6px;color:#f0b429;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;\">" + (t.global ? "Tarea global NO realizada" : "Tarea NO realizada") + "</p>" +
      "<h1 style=\"margin:0 0 20px;font-size:22px;line-height:1.3;color:#f0f4ff;\">" + escapeHtml(tituloLinea) + "</h1>" +
      (t.global
        ? "<div style=\"background:#161b2e;border-left:3px solid #4c7dff;border-radius:10px;padding:14px 16px;margin-bottom:16px;\">" +
          "<p style=\"margin:0;color:#c7cede;font-size:13px;line-height:1.6;\">🌐 Tarea <b>global</b>: estaba asignada a todos los jefes de equipo. La ha cerrado el primero, marcándola como no realizada: <b style=\"color:#f0f4ff;\">" + escapeHtml(jefe) + "</b>.</p></div>"
        : "") +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" style=\"border-collapse:collapse;margin-bottom:20px;\">" +
      fila(t.global ? "Cerrada por (el primero)" : "Jefe de equipo", escapeHtml(jefe), true) +
      (t.global ? fila("Asignada a", "Todos los jefes (global)", true) : "") +
      fila("Prioridad", prioridadHtml, true) +
      fila("Asignada", escapeHtml(t.fechaAsignacion || "—"), true) +
      fila("Fecha límite", escapeHtml(t.fechaLimite || "Sin fecha límite"), true) +
      fila("Cerrada", escapeHtml(cierreTxt), false) +
      "</table>" +
      (t.descripcion
        ? "<div style=\"background:#161b2e;border-radius:12px;padding:16px;margin-bottom:16px;\">" +
          "<p style=\"margin:0 0 6px;color:#6b7899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;\">Descripción</p>" +
          "<p style=\"margin:0;color:#a3b0cc;font-size:14px;line-height:1.6;\">" + conSaltos(t.descripcion) + "</p></div>"
        : "") +
      bloqueFoto("fototarea", "Foto de la tarea", blobTarea) +
      "<div style=\"background:#161b2e;border-left:3px solid #f0b429;border-radius:10px;padding:16px;margin-bottom:8px;\">" +
      "<p style=\"margin:0 0 6px;color:#6b7899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;\">Motivo de " + escapeHtml(jefe) + "</p>" +
      "<p style=\"margin:0;color:#f0f4ff;font-size:14px;line-height:1.6;\">" + conSaltos(motivo) + "</p></div>" +
      bloqueFoto("fotocierre", "Foto de " + jefe, blobCierre) +
      "<div style=\"text-align:center;padding-top:24px;margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);color:#6b7899;font-size:12px;\">" +
      "Centinela — Taisa Logistics</div>" +
      "</div></div></td></tr></table></body></html>";

    const texto = [
      (t.global ? "Tarea GLOBAL NO realizada: " : "Tarea NO realizada: ") + tituloLinea,
      t.global ? "Tarea global (asignada a todos los jefes): la ha cerrado el primero, marcándola como no realizada." : "",
      (t.global ? "Cerrada por (el primero): " : "Jefe de equipo: ") + jefe,
      "Prioridad: " + t.prioridad,
      "Asignada: " + (t.fechaAsignacion || "—"),
      "Fecha límite: " + (t.fechaLimite || "sin fecha límite"),
      "Cerrada: " + cierreTxt,
      t.descripcion ? "\nDescripción:\n" + t.descripcion : "",
      "\nMotivo:\n" + motivo
    ].filter(function (linea) { return linea !== ""; }).join("\n");

    const logoBlob = dataUriABlob(LOGO_TAISA_DATA_URI, "logo_taisa.png");
    const opciones = { cc: ccConResponsables_(CONFIG.EMAIL_RESPONSABLE), htmlBody: htmlSeguro_(html), name: "Centinela — Taisa Logistics" };
    const imagenes = {};
    if (logoBlob) imagenes.logotaisa = logoBlob;
    if (blobTarea) imagenes.fototarea = blobTarea;
    if (blobCierre) imagenes.fotocierre = blobCierre;
    if (Object.keys(imagenes).length) opciones.inlineImages = imagenes;

    GmailApp.sendEmail(CONFIG.EMAIL_RESPONSABLE, asuntoSeguro_(asunto), sinAstrales_(texto), opciones);
    return true;
  } catch (e) {
    Logger.log("❌ Error enviando correo de tarea no realizada: " + e.message);
    return false;
  }
}

// Devuelve la foto de una tarea ("tarea" = la de su creación, "cierre" = la del cierre) SOLO a quien puede
// ver esa tarea (mismas reglas que obtenerTareasDeJefe); el supervisor las ve todas.
// data = { id, cual: "tarea"|"cierre", jefe }
function obtenerFotoTarea(data) {
  if (!data) throw new Error("No se han recibido datos.");
  const quien = jefeVigente_(String(data.jefe == null ? "" : data.jefe).trim());
  const esSupervisor = quien === IDENTIDAD_SUPERVISOR;
  if (!esSupervisor && JEFES_EQUIPO.indexOf(quien) === -1) throw new Error("Identifícate para ver la foto.");
  if (data.cual !== "tarea" && data.cual !== "cierre") throw new Error("Foto no válida.");
  if (data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la tarea.");

  const h = tarObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const buscado = String(data.id).trim();
  const t = tarLeer_(h.sheet).filter(function (x) { return x.id !== null && String(x.id) === buscado; })[0];
  if (!t) return { ok: false, error: "Tarea no encontrada." };
  if (!esSupervisor && !tarVisibleParaJefe_(t, tarNormalizar_(quien))) return { ok: false, error: "Esa tarea no es tuya." };
  if (data.cual === "tarea" ? !t.fotoTarea : !t.fotoCierre) return { ok: false, error: "Esa tarea no tiene foto." };

  const foto = tarLeerFoto_(t.id + (data.cual === "tarea" ? "-T" : "-C"));
  if (!foto) return { ok: false, error: "No se pudo leer la foto." };
  return { ok: true, foto: foto };
}
