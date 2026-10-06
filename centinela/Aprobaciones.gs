// ============================================================
//  CENTINELA — APROBACIONES DEL JEFE DE ÁREA + REGISTRO DE ACTIVIDAD
//  Cuando un mando (no el jefe de área) hace algo que las reglas de Perfil.gs marcan —una tarea recurrente, una
//  tarea para TODOS los jefes, una nota urgente u obligatoria— no se ejecuta: queda como PETICIÓN en la hoja
//  Aprobaciones, el jefe de área recibe un correo y una insignia, y al APROBARLA se ejecuta exactamente igual
//  que si la hubiera creado él (con quien la pidió como autor); si la RECHAZA, el mando recibe el motivo por
//  correo. Un mando puede cancelar sus peticiones pendientes. El jefe de área nunca pasa por aquí.
//
//  Flujo de aprobar: 1) con el bloqueo se «reclama» la fila (Estado=Aprobada: dos clics seguidos no ejecutan dos
//  veces), 2) SIN bloqueo se ejecuta (cada ejecutor toma los suyos: los de Apps Script no son reentrantes),
//  3) si la ejecución falla se devuelve la petición a Pendiente con el error en «Resultado» y el jefe de área lo ve.
//
//  Además, actividadRegistrar_ apunta en la hoja Actividad quién (mando) ha creado qué y cuándo; el jefe de área lo
//  lee en su panel (obtenerActividad).
// ============================================================

const AP_TIPOS_ = {
  recurrente: { etiqueta: "Tarea recurrente", emoji: "🔁" },
  tarea_global: { etiqueta: "Tarea para todos los jefes", emoji: "🌐" },
  programada_global: { etiqueta: "Tarea global programada", emoji: "🗓️" },
  nota_urgente: { etiqueta: "Nota urgente u obligatoria", emoji: "⚠️" }
};
const AP_MAX_DATOS_ = 40000;
const AP_RECIENTES_ = 15;
const AP_MAX_MOTIVO_ = 500;
const ACT_LEIDAS_ = 400;       // filas del final de la hoja Actividad que se leen para el panel
const ACT_LISTA_ = 40;         // últimas acciones que se enseñan

// ── Hojas ────────────────────────────────────────────────────

function apObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_APROBACIONES, CABECERAS_APROBACIONES, prepararHojaAprobaciones_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Aprobaciones; inténtalo de nuevo." };
  return { sheet: sheet };
}

function apObtenerHojaFotos_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_APROBACIONES_FOTOS, CABECERAS_APROBACIONES_FOTOS, prepararHojaAprobacionesFotos_);
  if (!sheet) return { error: "No se pudo preparar la hoja de fotos de Aprobaciones; inténtalo de nuevo." };
  return { sheet: sheet };
}

function actObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_ACTIVIDAD, CABECERAS_ACTIVIDAD, prepararHojaActividad_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Actividad." };
  return { sheet: sheet };
}

// Foto de una petición (troceada como las demás). "" si no hay o está incompleta.
function apLeerFoto_(fotoId) {
  try {
    const ss = abrirHojaCentinela_();
    const sheet = ss ? ss.getSheetByName(CONFIG.SHEET_NAME_APROBACIONES_FOTOS) : null;
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

// ── Lectura ──────────────────────────────────────────────────

function apEstadoCanonico_(valor) {
  const s = tarNormalizar_(valor);
  if (s.indexOf("aprob") === 0) return "Aprobada";
  if (s.indexOf("rechaz") === 0) return "Rechazada";
  if (s.indexOf("cancel") === 0) return "Cancelada";
  return "Pendiente";
}

function apParse_(texto) {
  try {
    const o = JSON.parse(String(texto || "{}"));
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

function apLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const id = parseInt(tarTexto_(f[0]), 10);
    if (isNaN(id)) continue;
    filas.push({
      fila: i + 1, id: id, tipo: tarTexto_(f[1]), resumen: tarTexto_(f[2]), solicitante: tarTexto_(f[3]),
      email: tarTexto_(f[4]).toLowerCase(), fecha: tarTexto_(f[5], "dd/MM/yyyy"), hora: tarTexto_(f[6], "HH:mm:ss").slice(0, 5),
      estado: apEstadoCanonico_(f[7]), resueltaPor: tarTexto_(f[8]), fechaRes: tarTexto_(f[9], "dd/MM/yyyy HH:mm"),
      motivo: tarTexto_(f[10]), datosTxt: tarTexto_(f[11]), resultado: tarTexto_(f[12]), tieneFoto: tarTexto_(f[13]) === "Sí"
    });
  }
  return filas;
}

function apNombreDestino_(asignado) {
  return asignado === TAREA_GLOBAL ? "Todos los jefes (global)" : String(asignado || "—");
}

// Qué se pide, en filas legibles (para la pantalla y para el correo). { filas: [{icono, etiqueta, valor}], texto }
function apDetalle_(tipo, d) {
  const filas = [];
  let texto = "";
  if (tipo === "recurrente") {
    filas.push({ icono: "👤", etiqueta: "Asignada a", valor: apNombreDestino_(d.asignado_a) });
    filas.push({ icono: "🔁", etiqueta: "Se repite", valor: trecDiasTexto_(d.dias) });
    filas.push({ icono: "🚦", etiqueta: "Prioridad", valor: d.prioridad || "Normal" });
    texto = d.descripcion || "";
  } else if (tipo === "tarea_global" || tipo === "programada_global") {
    filas.push({ icono: "🌐", etiqueta: "Asignada a", valor: apNombreDestino_(d.asignado_a) });
    if (tipo === "programada_global") filas.push({ icono: "🗓️", etiqueta: "Se aplica el", valor: d.fecha_aplicar || "—" });
    filas.push({ icono: "⏰", etiqueta: "Fecha límite", valor: d.fecha_limite || "Sin fecha límite" });
    filas.push({ icono: "🚦", etiqueta: "Prioridad", valor: d.prioridad || "Normal" });
    texto = d.descripcion || "";
  } else if (tipo === "nota_urgente") {
    const dest = Array.isArray(d.destinatarios) && d.destinatarios.length ? d.destinatarios.join(", ") : "Todos los jefes de equipo";
    filas.push({ icono: "📣", etiqueta: "Tipo", valor: d.tipo || "—" });
    filas.push({ icono: "👥", etiqueta: "Para", valor: dest });
    filas.push({ icono: "🔔", etiqueta: "Lectura obligatoria", valor: d.obligatoria ? "Sí" : "No" });
    filas.push({ icono: "⏳", etiqueta: "Visible", valor: d.sin_caducidad ? "Sin caducidad" : (d.duracion && d.duracion.valor ? d.duracion.valor + " " + d.duracion.unidad : "—") });
    filas.push({ icono: "✉️", etiqueta: "Avisar por correo", valor: d.avisar_correo ? "Sí" : "No" });
    texto = d.texto || "";
  }
  return { filas: filas, texto: texto };
}

function apParaCliente_(ap, perfil) {
  const def = AP_TIPOS_[ap.tipo] || { etiqueta: ap.tipo, emoji: "📌" };
  return {
    id: ap.id, tipo: ap.tipo, tipoEtiqueta: def.etiqueta, emoji: def.emoji, resumen: ap.resumen, solicitante: ap.solicitante,
    fecha: ap.fecha, hora: ap.hora, estado: ap.estado, resueltaPor: ap.resueltaPor, fechaRes: ap.fechaRes, motivo: ap.motivo,
    resultado: ap.resultado, tieneFoto: ap.tieneFoto, detalle: apDetalle_(ap.tipo, apParse_(ap.datosTxt)),
    propia: !!perfil.email && ap.email === perfil.email
  };
}

// ── Correos ──────────────────────────────────────────────────

function apCorreoSolicitud_(ap, fotoUri) {
  const def = AP_TIPOS_[ap.tipo];
  const det = apDetalle_(ap.tipo, apParse_(ap.datosTxt));
  const fotoBlob = fotoUri ? dataUriABlob(fotoUri, "foto_peticion.jpg") : null;
  const corto = ap.resumen.length > 70 ? ap.resumen.slice(0, 67) + "…" : ap.resumen;
  return correoPremiumEnviar_({
    para: perfilCorreosArea_(),
    sinCopia: true,
    asunto: "❗ Aprobación pendiente · " + def.etiqueta + " · " + corto,
    cfg: {
      acento: "#f59e0b",
      emoji: def.emoji,
      etiqueta: "Pendiente de tu aprobación",
      titulo: ap.resumen,
      subtitulo: ap.solicitante + " solicita: " + def.etiqueta.toLowerCase() + ". No se hará nada hasta que la apruebes.",
      preheader: def.etiqueta + " · " + ap.solicitante,
      chips: [{ texto: "👤 " + ap.solicitante, tono: "neutro" }, { texto: def.emoji + " " + def.etiqueta, tono: "aviso" }],
      filas: det.filas,
      bloques: det.texto ? [{ icono: "📝", titulo: "Detalle", texto: det.texto, acento: "#4c7dff" }] : [],
      fotos: fotoBlob ? [{ cid: "fotopeticion", blob: fotoBlob, titulo: "Foto adjunta" }] : [],
      boton: { texto: "Revisar en Centinela", url: CONFIG.APP_URL },
      nota: "Entra en la pestaña Aprobaciones de Centinela para aprobarla o rechazarla (con motivo)."
    }
  });
}

// Aviso al mando de lo que ha decidido el jefe de área.
function apCorreoResolucion_(ap, aprobada, motivo, perfil, resultado) {
  if (!ap.email) return false;
  const def = AP_TIPOS_[ap.tipo] || { etiqueta: ap.tipo, emoji: "📌" };
  const corto = ap.resumen.length > 70 ? ap.resumen.slice(0, 67) + "…" : ap.resumen;
  const filas = [{ icono: "👤", etiqueta: "Resuelta por", valor: perfil.nombre + (perfil.cargo ? " · " + perfil.cargo : "") }];
  if (aprobada && resultado) filas.push({ icono: "✅", etiqueta: "Resultado", valor: resultado });
  const bloques = [];
  if (motivo) bloques.push({ icono: "💬", titulo: aprobada ? "Comentario" : "Motivo", texto: motivo, acento: aprobada ? "#22c55e" : "#ff4d5a" });
  return correoPremiumEnviar_({
    para: [ap.email],
    sinCopia: true,
    asunto: (aprobada ? "✅ Aprobada · " : "⚠️ Rechazada · ") + corto,
    cfg: {
      acento: aprobada ? "#22c55e" : "#ff4d5a",
      emoji: aprobada ? "✅" : "⛔",
      etiqueta: aprobada ? "Petición aprobada" : "Petición rechazada",
      titulo: ap.resumen,
      subtitulo: aprobada ? "Tu petición ya está en marcha." : "Tu petición no se ha llevado a cabo.",
      preheader: (aprobada ? "Aprobada" : "Rechazada") + " · " + def.etiqueta,
      chips: [{ texto: def.emoji + " " + def.etiqueta, tono: "neutro" }, aprobada ? { texto: "✅ Aprobada", tono: "ok" } : { texto: "⛔ Rechazada", tono: "alerta" }],
      filas: filas,
      bloques: bloques,
      boton: { texto: "Abrir Centinela", url: CONFIG.APP_URL }
    }
  });
}

// ── Pedir aprobación ─────────────────────────────────────────

// Guarda la petición y avisa al jefe de área. Devuelve { id, duplicada?, correo } o { error }.
function apSolicitar_(tipo, resumen, datos, fotoUri, perfil) {
  if (!AP_TIPOS_[tipo]) throw new Error("Tipo de petición no válido.");
  const json = JSON.stringify(datos);
  if (json.length > AP_MAX_DATOS_) return { error: "La petición es demasiado larga." };
  const h = apObtenerHoja_();
  if (h.error) return { error: h.error };
  let hf = null;
  if (fotoUri) {
    hf = apObtenerHojaFotos_();      // ANTES del bloqueo: los bloqueos de Apps Script no son reentrantes
    if (hf.error) return { error: hf.error };
  }
  const lock = tarTomarLock_();
  if (!lock) return { error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  let ap;
  try {
    const filas = apLeer_(h.sheet);
    const dup = filas.filter(function (f) { return f.estado === "Pendiente" && f.email === perfil.email && f.tipo === tipo && f.datosTxt === json; })[0];
    if (dup) return { id: dup.id, duplicada: true };
    let maxId = 0;
    filas.forEach(function (f) { if (f.id > maxId) maxId = f.id; });
    const id = maxId + 1;
    const tz = Session.getScriptTimeZone();
    const ahora = new Date();
    const fechaTxt = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
    const horaTxt = Utilities.formatDate(ahora, tz, "HH:mm:ss");
    if (fotoUri) tarGuardarFoto_(hf.sheet, "AP" + id, fotoUri);       // si falla, no se crea la petición
    h.sheet.appendRow([id, tipo, resumen, perfil.nombre || perfil.email, perfil.email, fechaTxt, horaTxt, "Pendiente", "", "", "", json, "", fotoUri ? "Sí" : ""]);
    SpreadsheetApp.flush();
    ap = { id: id, tipo: tipo, resumen: resumen, solicitante: perfil.nombre || perfil.email, email: perfil.email, datosTxt: json };
  } catch (e) {
    Logger.log("❌ Error guardando la petición de aprobación: " + e.message);
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
  const correo = apCorreoSolicitud_(ap, fotoUri);
  actividadRegistrar_("peticion", "Petición #" + ap.id + " (" + AP_TIPOS_[tipo].etiqueta + ") «" + resumen + "» pendiente de aprobación", perfil);
  return { id: ap.id, correo: correo };
}

// Lo que devuelve crearTarea / crearTareaRecurrente / programarTarea / publicarNota cuando la acción se queda en espera.
function apSolicitarYResponder_(tipo, resumen, datos, fotoUri, perfil) {
  const s = apSolicitar_(tipo, resumen, datos, fotoUri, perfil);
  if (s.error) return { success: false, error: s.error };
  return {
    success: true, pendiente: true, aprobacionId: s.id, duplicada: !!s.duplicada, correoEnviado: s.correo === undefined ? null : s.correo,
    mensaje: s.duplicada
      ? "Esa petición ya estaba pendiente de aprobación de " + perfilNombreArea_() + "."
      : "📨 Pendiente de aprobación de " + perfilNombreArea_() + ". Te avisará por correo cuando la resuelva."
  };
}

// ── Aprobar / rechazar / cancelar ────────────────────────────

function apFechaHoraTxt_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
}

// Ejecuta lo pedido (ya aprobado). Devuelve { ok:true, texto } o { ok:false, error }; puede lanzar.
function apEjecutar_(ap, perfil) {
  const d = apParse_(ap.datosTxt);
  const quien = ap.solicitante + " (aprobada por " + perfil.nombre + ")";
  if (ap.tipo === "recurrente") {
    const r = trecCrearValidada_(trecValidarNueva_(d), quien);
    if (!r.success) return { ok: false, error: r.error };
    actividadRegistrar_("recurrente", "Plantilla #" + r.id + " «" + ap.resumen + "» creada por aprobación de la petición #" + ap.id, perfil);
    return { ok: true, texto: "Plantilla recurrente #" + r.id + " creada (" + r.diasTexto + ")" + (r.generadaHoy ? " · ya generó la tarea de hoy" : "") };
  }
  if (ap.tipo === "tarea_global") {
    const foto = ap.tieneFoto ? apLeerFoto_("AP" + ap.id) : "";
    if (ap.tieneFoto && !foto) return { ok: false, error: "No se pudo leer la foto de la petición." };
    const dd = {}; Object.keys(d).forEach(function (k) { dd[k] = d[k]; }); dd.foto = foto;
    const r = tarCrearValidada_(tarValidarNueva_(dd, true), quien);
    if (!r.success) return { ok: false, error: r.error };
    actividadRegistrar_("tarea", "Tarea #" + r.id + " «" + ap.resumen + "» creada por aprobación de la petición #" + ap.id, perfil);
    return { ok: true, texto: "Tarea #" + r.id + " creada para todos los jefes" + (r.correoEnviado ? " · correo enviado" : " · ⚠ el correo NO se pudo enviar") };
  }
  if (ap.tipo === "programada_global") {
    let v;
    try { v = tprValidarNueva_(d); }
    catch (e) {
      if (/posterior a hoy/.test(e.message)) throw new Error("El día en que debía aplicarse (" + d.fecha_aplicar + ") ya ha llegado o pasado. Recházala para que la vuelvan a programar.");
      throw e;
    }
    const r = tprGuardarValidada_(v, quien);
    if (!r.success) return { ok: false, error: r.error };
    actividadRegistrar_("programada", "Programada #" + r.id + " «" + ap.resumen + "» creada por aprobación de la petición #" + ap.id, perfil);
    return { ok: true, texto: "Tarea programada #" + r.id + " para el " + r.aplicar };
  }
  if (ap.tipo === "nota_urgente") {
    const foto = ap.tieneFoto ? apLeerFoto_("AP" + ap.id) : "";
    if (ap.tieneFoto && !foto) return { ok: false, error: "No se pudo leer la foto de la petición." };
    const dd = {}; Object.keys(d).forEach(function (k) { dd[k] = d[k]; }); dd.foto = foto;
    const v = notValidarNueva_(dd);
    v.creador = quien;
    const r = notPublicarValidada_(v);
    if (!r.success) return { ok: false, error: r.error };
    actividadRegistrar_("nota", "Nota #" + r.id + " «" + ap.resumen + "» publicada por aprobación de la petición #" + ap.id, perfil);
    return { ok: true, texto: "Nota #" + r.id + " publicada" + (r.correo === "enviado" ? " · correo enviado" : r.correo === "fallo" ? " · ⚠ el correo NO se pudo enviar" : "") };
  }
  return { ok: false, error: "Tipo de petición desconocido: " + ap.tipo };
}

// data = { id, accion: "aprobar" | "rechazar", motivo }. Solo el jefe de área.
function resolverAprobacion(data) {
  const perfil = perfilActual_();
  if (perfil.rol !== "area") return { success: false, error: "Solo el jefe de área puede aprobar o rechazar peticiones." };
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la petición.");
  if (data.accion !== "aprobar" && data.accion !== "rechazar") throw new Error("Acción no válida.");
  const motivo = String(data.motivo == null ? "" : data.motivo).replace(/\r\n?/g, "\n").trim();
  if (motivo.length > AP_MAX_MOTIVO_) throw new Error("El texto es demasiado largo (máximo " + AP_MAX_MOTIVO_ + " caracteres).");
  if (data.accion === "rechazar" && motivo.length < 3) return { success: false, error: "Escribe el motivo del rechazo (mínimo 3 caracteres)." };
  const aprobar = data.accion === "aprobar";

  const h = apObtenerHoja_();
  if (h.error) return { success: false, error: h.error };

  // 1) reclamar la petición bajo bloqueo
  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  let ap;
  try {
    ap = apLeer_(h.sheet).filter(function (x) { return String(x.id) === String(data.id).trim(); })[0];
    if (!ap) return { success: false, error: "Petición no encontrada." };
    if (ap.estado !== "Pendiente") return { success: false, error: "Esta petición ya estaba " + ap.estado.toLowerCase() + (ap.resueltaPor ? " (por " + ap.resueltaPor + ")" : "") + "." };
    h.sheet.getRange(ap.fila, 8, 1, 4).setValues([[aprobar ? "Aprobada" : "Rechazada", perfil.nombre, apFechaHoraTxt_(), motivo]]);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("❌ Error resolviendo la petición: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }

  if (!aprobar) {
    const correo = apCorreoResolucion_(ap, false, motivo, perfil, "");
    actividadRegistrar_("rechazo", "Petición #" + ap.id + " «" + ap.resumen + "» de " + ap.solicitante + " rechazada: " + motivo, perfil);
    return { success: true, estado: "Rechazada", correoEnviado: correo };
  }

  // 2) ejecutar SIN bloqueo (los ejecutores toman los suyos)
  let res;
  try {
    res = apEjecutar_(ap, perfil);
  } catch (e) {
    res = { ok: false, error: e.message };
  }
  if (!res.ok) {
    apDevolverAPendiente_(h.sheet, ap, res.error);
    return { success: false, error: "No se pudo ejecutar: " + res.error + " La petición sigue pendiente." };
  }
  try { h.sheet.getRange(ap.fila, 13).setValue(res.texto); SpreadsheetApp.flush(); } catch (e) { Logger.log("⚠️ No se pudo apuntar el resultado de la petición #" + ap.id + ": " + e.message); }
  const correo = apCorreoResolucion_(ap, true, motivo, perfil, res.texto);
  actividadRegistrar_("aprobacion", "Petición #" + ap.id + " «" + ap.resumen + "» de " + ap.solicitante + " aprobada → " + res.texto, perfil);
  return { success: true, estado: "Aprobada", resultado: res.texto, correoEnviado: correo };
}

// La ejecución falló: la petición vuelve a Pendiente con el error a la vista (Resultado) para poder reintentarla o rechazarla.
function apDevolverAPendiente_(sheet, ap, error) {
  const lock = tarTomarLock_();    // si no hay bloqueo se intenta igualmente: peor sería dejarla «Aprobada» sin haberse hecho
  try {
    sheet.getRange(ap.fila, 8, 1, 6).setValues([["Pendiente", "", "", "", ap.datosTxt, "ERROR al aprobar: " + String(error).slice(0, 300)]]);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("❌ No se pudo devolver la petición #" + ap.id + " a Pendiente: " + e.message);
  } finally {
    if (lock) lock.releaseLock();
  }
}

// data = { id }. La cancela quien la pidió (mientras esté pendiente) o el jefe de área.
function cancelarAprobacion(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la petición.");
  const perfil = perfilActual_();
  const h = apObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  let ap;
  try {
    ap = apLeer_(h.sheet).filter(function (x) { return String(x.id) === String(data.id).trim(); })[0];
    if (!ap) return { success: false, error: "Petición no encontrada." };
    if (perfil.rol !== "area" && !(perfil.email && perfil.email === ap.email)) return { success: false, error: "Solo quien la pidió o el jefe de área puede cancelar esta petición." };
    if (ap.estado !== "Pendiente") return { success: false, error: "Esta petición ya estaba " + ap.estado.toLowerCase() + "." };
    h.sheet.getRange(ap.fila, 8, 1, 3).setValues([["Cancelada", perfil.nombre || perfil.email, apFechaHoraTxt_()]]);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("❌ Error cancelando la petición: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
  actividadRegistrar_("cancelacion", "Petición #" + ap.id + " «" + ap.resumen + "» cancelada", perfil);
  return { success: true };
}

// ── API de lectura ───────────────────────────────────────────

// SOLO el jefe de área. Los mandos ya no ven esta sección (ni sus propias peticiones: se enteran por el aviso al pedir
// y por el correo cuando se resuelve). Cualquier otra cuenta, tampoco, y sin datos.
function obtenerAprobaciones() {
  const perfil = perfilActual_();
  if (perfil.rol !== "area") return { ok: false, error: "Esta sección es solo para el jefe de área." };
  const h = apObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const todas = apLeer_(h.sheet);
  const pendientes = todas.filter(function (f) { return f.estado === "Pendiente"; }).sort(function (a, b) { return a.id - b.id; });
  const recientes = todas.filter(function (f) { return f.estado !== "Pendiente"; }).sort(function (a, b) { return b.id - a.id; }).slice(0, AP_RECIENTES_);
  return {
    ok: true, rol: perfil.rol, nombre: perfil.nombre, cargo: perfil.cargo, email: perfil.email, nombreArea: perfilNombreArea_(),
    reglas: perfilReglas_(), reglasTexto: PERFIL_REGLAS_TEXTO_,
    pendientes: pendientes.map(function (f) { return apParaCliente_(f, perfil); }),
    recientes: recientes.map(function (f) { return apParaCliente_(f, perfil); })
  };
}

// La foto adjunta a una petición: solo el jefe de área. data = { id }
function obtenerFotoAprobacion(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la petición.");
  const perfil = perfilActual_();
  if (perfil.rol !== "area") return { ok: false, error: "Sin permiso." };
  const h = apObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const ap = apLeer_(h.sheet).filter(function (x) { return String(x.id) === String(data.id).trim(); })[0];
  if (!ap) return { ok: false, error: "Petición no encontrada." };
  if (!ap.tieneFoto) return { ok: false, error: "Esta petición no tiene foto." };
  const foto = apLeerFoto_("AP" + ap.id);
  return foto ? { ok: true, foto: foto } : { ok: false, error: "No se pudo leer la foto." };
}

// ── Registro de actividad ────────────────────────────────────

// Apunta qué ha hecho quién. Nunca lanza ni toma bloqueos (appendRow es atómico): NO llamarlo dentro de un
// bloqueo propio si la hoja pudiera no existir aún (asegurarHojaPerezosa_ toma el suyo).
function actividadRegistrar_(accion, detalle, perfil) {
  try {
    const p = perfil || perfilActual_();
    const h = actObtenerHoja_();
    if (h.error) return;
    const tz = Session.getScriptTimeZone();
    const ahora = new Date();
    h.sheet.appendRow([
      Utilities.formatDate(ahora, tz, "dd/MM/yyyy"), Utilities.formatDate(ahora, tz, "HH:mm:ss"),
      p.nombre || "(sin identificar)", p.rol || "", accion, String(detalle == null ? "" : detalle).slice(0, 300)
    ]);
  } catch (e) {
    Logger.log("⚠️ No se pudo registrar la actividad: " + e.message);
  }
}

// Solo el jefe de área. Últimas acciones + recuento por persona (7 y 30 días).
function obtenerActividad() {
  const perfil = perfilActual_();
  if (perfil.rol !== "area") return { ok: false, error: "Solo el jefe de área puede ver la actividad." };
  const h = actObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const ultima = h.sheet.getLastRow();
  const filas = [];
  if (ultima >= 2) {
    const desde = Math.max(2, ultima - ACT_LEIDAS_ + 1);
    h.sheet.getRange(desde, 1, ultima - desde + 1, CABECERAS_ACTIVIDAD.length).getValues().forEach(function (f) {
      if (tarTexto_(f[0]) === "" && tarTexto_(f[4]) === "") return;
      filas.push({ fecha: tarTexto_(f[0], "dd/MM/yyyy"), hora: tarTexto_(f[1], "HH:mm:ss").slice(0, 5), quien: tarTexto_(f[2]), rol: tarTexto_(f[3]), accion: tarTexto_(f[4]), detalle: tarTexto_(f[5]) });
    });
  }
  const hoy = tarHoyClave_();
  const dias = function (fecha) {
    const c = tarClaveFecha_(fecha);
    if (c === null) return Infinity;
    const a = new Date(Date.UTC(Math.floor(c / 10000), (Math.floor(c / 100) % 100) - 1, c % 100));
    const b = new Date(Date.UTC(Math.floor(hoy / 10000), (Math.floor(hoy / 100) % 100) - 1, hoy % 100));
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  };
  const grupo = { tarea: "tareas", programada: "tareas", recurrente: "recurrentes", nota: "notas", peticion: "peticiones" };
  const porPersona = {};
  filas.forEach(function (f) {
    const g = grupo[f.accion];
    if (!g) return;           // aprobaciones, rechazos, reglas… no son «mandar cosas»
    const d = dias(f.fecha);
    if (d > 30 || d < 0) return;
    const p = porPersona[f.quien] || (porPersona[f.quien] = { quien: f.quien, rol: f.rol, d7: { tareas: 0, recurrentes: 0, notas: 0, peticiones: 0 }, d30: { tareas: 0, recurrentes: 0, notas: 0, peticiones: 0 } });
    p.d30[g]++;
    if (d <= 7) p.d7[g]++;
  });
  const total = function (o) { return o.tareas + o.recurrentes + o.notas + o.peticiones; };
  const resumen = Object.keys(porPersona).map(function (k) { return porPersona[k]; }).sort(function (a, b) { return total(b.d30) - total(a.d30); });
  return { ok: true, ultimos: filas.slice(-ACT_LISTA_).reverse(), resumen: resumen };
}
