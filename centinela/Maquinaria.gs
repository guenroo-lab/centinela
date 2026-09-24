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

function actualizarDatosMaquina(data) {
  if (!data || !data.id) throw new Error("Falta la máquina.");
  if (!data.maquina || !data.propietaria || !data.serial) {
    throw new Error("Tipo, propietaria y serial son obligatorios.");
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

    sheet.getRange(filaIdx + 1, 2, 1, 4).setValues([[
      data.maquina, data.propietaria, data.designacion || "", data.serial
    ]]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error actualizando datos de máquina: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function crearMaquina(data) {
  if (!data || !data.maquina || !data.propietaria || !data.serial) {
    throw new Error("Tipo, propietaria y serial son obligatorios.");
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
    let maxId = 0;
    for (let i = 1; i < datos.length; i++) {
      const n = parseInt(datos[i][0], 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
    const nuevoId = maxId + 1;
    sheet.appendRow([
      nuevoId, data.maquina, data.propietaria, data.designacion || "", data.serial,
      "OK", "", "", "", "", "", ""
    ]);
    SpreadsheetApp.flush();
    return { success: true, id: nuevoId };
  } catch (e) {
    Logger.log("❌ Error creando máquina: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
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
    if (fila[5] === "Fallas" || fila[5] === "Averiada" || fila[5] === "Revision") {
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
  // getDisplayValues: si Sheets convirtió una fecha de texto en Date, google.script.run
  // devolvería null en silencio y el historial saldría vacío.
  const datos = sheet.getDataRange().getDisplayValues();
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
  if (["OK", "Fallas", "Averiada", "Revision"].indexOf(estado) === -1) {
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

    // Fallas / Averiada / Revision
    const esNueva = (estadoAnterior === "OK");
    sheet.getRange(fila, 6, 1, 2).setValues([[estado, observacion]]);
    sheet.getRange(fila, 8, 1, 1).setValue(fechaStr);

    // "Revision" solo cambia la etiqueta (ya se revisó, sigue a falta de reparar):
    // nunca manda avisoSat ni el correo interno, aunque sea la primera vez que se marca.
    let avisoSat = false;
    if (estado !== "Revision") {
      if (esNueva) {
        sheet.getRange(fila, 9, 1, 1).setValue(fechaStr);
        avisoSat = enviarAvisoSat_(propietaria, actual[0], nombreMaquina, serial, observacion);
      }
      enviarAvisoInternoMaquinaria_(actual[0], nombreMaquina, estado, observacion, data.jefe_equipo);
    }

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
    MailApp.sendEmail({ to: para, cc: ccConResponsables_(para, cc), subject: asunto, htmlBody: "<h2>Aviso de avería</h2>" + html });
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
