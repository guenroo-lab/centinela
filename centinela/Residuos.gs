// ============================================================
//  CENTINELA — RESIDUOS
// ============================================================

const TIPOS_CUBA = ["Escombros", "Madera", "Plástico", "Cartón"];

function procesarPeticionResiduos(data) {
  Logger.log("📥 Petición de residuos: " + (data && data.tipo));

  if (!data) throw new Error("No se han recibido datos.");
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  const esAveria = data.tipo === "Averia";
  if (!esAveria && TIPOS_CUBA.indexOf(data.tipo) === -1) {
    throw new Error("Tipo de cuba no válido: " + data.tipo);
  }
  const observacion = (data.observacion || "").trim();
  if (esAveria && observacion.length < 5) {
    throw new Error("Describe la avería.");
  }

  const ahora = new Date();
  const tz = Session.getScriptTimeZone();
  const fechaStr = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
  const horaStr = Utilities.formatDate(ahora, tz, "HH:mm:ss");

  const guardado = guardarPeticionResiduos_(data.jefe_equipo, data.tipo, observacion, fechaStr, horaStr);
  const emailOk = enviarEmailRecisur_(data.jefe_equipo, data.tipo, observacion, esAveria);

  const avisos = [];
  if (!guardado.ok) avisos.push("No se pudo guardar: " + guardado.error);
  if (!emailOk) avisos.push("El email a Recisur no se pudo enviar.");

  const success = guardado.ok || emailOk;
  return { success: success, error: success ? undefined : avisos.join(" | "), avisos: avisos };
}

function guardarPeticionResiduos_(jefe, tipo, observacion, fechaStr, horaStr) {
  const ss = abrirHojaCentinela_();
  if (!ss) return { ok: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  }

  try {
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_RESIDUOS);
    if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME_RESIDUOS);
    asegurarCabeceras_(sheet, CABECERAS_RESIDUOS);
    sheet.appendRow([fechaStr, horaStr, jefe, tipo, observacion]);
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    Logger.log("❌ Error guardando petición de residuos: " + e.message);
    return { ok: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Histórico visible para todos los jefes: las últimas peticiones, la más reciente primero.
const RESIDUOS_HISTORIAL_MAX_ = 5;

function obtenerUltimasPeticionesResiduos() {
  const ss = abrirHojaCentinela_();
  if (!ss) return [];
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_RESIDUOS);
  if (!sheet) return [];
  const ultima = sheet.getLastRow();
  if (ultima < 2) return [];
  const desde = Math.max(2, ultima - RESIDUOS_HISTORIAL_MAX_ + 1);
  // getDisplayValues: fecha y hora pueden estar guardadas como Date y google.script.run devolvería null.
  const filas = sheet.getRange(desde, 1, ultima - desde + 1, 5).getDisplayValues();
  const resultado = [];
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    if (!String(f[3]).trim() && !String(f[2]).trim()) continue;
    resultado.push({ fecha: f[0], hora: f[1], jefe: f[2], tipo: f[3], observacion: f[4] });
  }
  return resultado;
}

function enviarEmailRecisur_(jefe, tipo, observacion, esAveria) {
  try {
    const asunto = esAveria
      ? "[Centinela] Avería en residuos — Taisa"
      : "[Centinela] Cambio de cuba de " + tipo + " — Taisa";

    const cuerpoMensaje = esAveria
      ? "Buenos días,<br><br>Desde el equipo de Taisa Logistics os informamos de una avería relacionada con la gestión de residuos que necesita vuestra atención:"
      : "Buenos días,<br><br>Desde el equipo de Taisa Logistics solicitamos el <b>cambio de la cuba de " + escapeHtml(tipo) + "</b>.";

    const html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>" +
      "<body style=\"margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;background:#080a10;color:#f0f4ff;\">" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" bgcolor=\"#080a10\" style=\"background:#080a10;\">" +
      "<tr><td align=\"center\" style=\"padding:0;\">" +
      "<div style=\"max-width:560px;margin:0 auto;padding:32px 20px;text-align:left;\">" +
      "<div style=\"background:#0f1220;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;\">" +
      "<div style=\"display:inline-block;background:#ffffff;padding:12px 18px;border-radius:12px;margin-bottom:20px;\">" +
      "<img src=\"cid:logotaisa\" alt=\"Taisa Logistics\" width=\"130\" style=\"width:130px;height:auto;display:block;\"></div>" +
      "<h1 style=\"margin:0 0 16px;font-size:22px;color:#f0f4ff;\">" + (esAveria ? "Aviso de avería" : "Solicitud a Recisur") + "</h1>" +
      "<p style=\"margin:0 0 16px;font-size:15px;line-height:1.6;color:#c7cede;\">" + cuerpoMensaje + "</p>" +
      (observacion
        ? "<div style=\"background:#161b2e;border-radius:12px;padding:16px;margin-bottom:16px;\"><p style=\"margin:0;color:#a3b0cc;font-size:14px;line-height:1.6;\">" + escapeHtml(observacion) + "</p></div>"
        : "") +
      "<div style=\"background:#161b2e;border-left:3px solid #e30613;border-radius:10px;padding:16px;margin-bottom:16px;\">" +
      "<p style=\"margin:0;color:#f0f4ff;font-size:14px;font-weight:700;\">🕕 Horario de atención Taisa</p>" +
      "<p style=\"margin:6px 0 0;color:#a3b0cc;font-size:14px;\">Lunes a viernes, de 6:00 a 22:00.</p>" +
      "</div>" +
      "<p style=\"margin:0;color:#6b7899;font-size:13px;\">Solicitado por: <b style=\"color:#c7cede;\">" + escapeHtml(jefe) + "</b></p>" +
      "<div style=\"text-align:center;padding-top:24px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);color:#6b7899;font-size:12px;\">" +
      "Centinela — Taisa Logistics</div>" +
      "</div></div></td></tr></table></body></html>";

    const logoBlob = dataUriABlob(LOGO_TAISA_DATA_URI, "logo_taisa.png");
    const opciones = { to: CONFIG.RECISUR_PARA, cc: ccConResponsables_(CONFIG.RECISUR_PARA, CONFIG.RECISUR_CC), subject: asunto, htmlBody: htmlSeguro_(html), name: "Centinela — Taisa Logistics" };
    if (logoBlob) opciones.inlineImages = { logotaisa: logoBlob };

    GmailApp.sendEmail(CONFIG.RECISUR_PARA, asunto, "Solicitud enviada desde Centinela.", opciones);
    return true;
  } catch (e) {
    Logger.log("❌ Error enviando email a Recisur: " + e.message);
    return false;
  }
}
