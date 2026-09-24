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
      "<h2 style=\"margin:0 0 12px;\">Nueva sugerencia — Centinela</h2>" +
      "<p style=\"margin:0 0 4px;color:#8b96b8;\">" + escapeHtml(fechaStr) + " " + escapeHtml(horaStr) + " · " + escapeHtml(jefe) + "</p>" +
      "<div style=\"background:#0f1220;border-radius:12px;padding:16px;margin-top:12px;\">" +
      "<p style=\"margin:0;white-space:pre-wrap;\">" + escapeHtml(texto) + "</p></div></div>";

    GmailApp.sendEmail(CONFIG.EMAIL_RESPONSABLE, asunto, cuerpo, {
      cc: ccConResponsables_(CONFIG.EMAIL_RESPONSABLE),
      htmlBody: htmlSeguro_(html),
      name: "Centinela"
    });
    return true;
  } catch (e) {
    Logger.log("❌ ERROR al enviar email de sugerencia: " + e.message);
    return false;
  }
}
