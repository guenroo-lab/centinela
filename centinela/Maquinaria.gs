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
  const mp = hojaMesPrimero_(sheet);
  const maquinas = [];
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i].map(function (v) { return celdaSegura_(v, mp); });
    if (fila[0] === "" || fila[0] === null) continue;
    maquinas.push({
      id: fila[0], maquina: fila[1], propietaria: fila[2], designacion: fila[3],
      serial: fila[4], estado: fila[5], observacion: fila[6], fechaEnvioSat: fila[8]
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
  const mp = hojaMesPrimero_(sheet);
  const resultado = [];
  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i].map(function (v) { return celdaSegura_(v, mp); });
    if (fila[5] === "Fallas" || fila[5] === "Averiada" || fila[5] === "Revision") {
      resultado.push({
        id: fila[0], maquina: fila[1], serial: fila[4], estado: fila[5],
        observacion: fila[6], fechaEnvioSat: fila[8], presupuestado: fila[9], aceptado: fila[10],
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
  // Lo que Sheets convirtió en Date no se puede devolver (google.script.run daría null en silencio y el historial
  // saldría vacío): esas celdas se pasan a texto con su día/mes recuperado (celdaSegura_); el resto, tal como se ve.
  const rango = sheet.getDataRange();
  const valores = rango.getValues();
  const visibles = rango.getDisplayValues();
  const mp = hojaMesPrimero_(sheet);
  const celda = function (i, j) { return esFechaCelda_(valores[i][j]) ? celdaSegura_(valores[i][j], mp) : visibles[i][j]; };
  const resultado = [];
  for (let i = 1; i < visibles.length; i++) {
    if (String(visibles[i][0]).trim() === String(id).trim()) {
      resultado.push({
        estado: celda(i, 4), observacion: celda(i, 5), fechaInicio: celda(i, 6),
        fechaResuelto: celda(i, 7), presupuestado: celda(i, 8),
        aceptado: celda(i, 9), observacionesRevision: celda(i, 10),
        resueltoPor: celda(i, 11), fechaEnvioSat: celda(i, 12)
      });
    }
  }
  return resultado.reverse();
}

function procesarActualizacionMaquina(data) {
  Logger.log("📥 Actualizando maquina: " + (data && data.id));

  if (!data) throw new Error("No se han recibido datos.");
  if (!data.jefe_equipo) throw new Error("Falta indicar quién eres.");
  data.jefe_equipo = jefeVigente_(data.jefe_equipo);
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
        // Un Date que Sheets hubiera dejado en la fila se copia ya como texto (con su día/mes recuperado).
        const mp = hojaMesPrimero_(sheet);
        const filaHistorial = [
          actual[0], nombreMaquina, propietaria, serial, estadoAnterior, actual[6],
          actual[7], fechaStr, actual[9], actual[10], actual[11], data.jefe_equipo, actual[8]
        ].map(function (v) { return celdaSegura_(v, mp); });
        let hojaHist = ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
        if (!hojaHist) hojaHist = ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
        asegurarCabeceras_(hojaHist, CABECERAS_HISTORIAL_MAQUINARIA);
        // Sin appendRow: las columnas de texto y fechas (5 a 13) se ponen en «texto sin formato» ANTES de escribir; si no,
        // en una hoja con idioma mes/día «05/10/2026 09:30» se guardaría como Date del 10 de mayo.
        const filaH = hojaHist.getLastRow() + 1;
        if (filaH > hojaHist.getMaxRows()) hojaHist.insertRowsAfter(hojaHist.getMaxRows(), 1);
        hojaHist.getRange(filaH, 5, 1, 9).setNumberFormat("@");
        hojaHist.getRange(filaH, 1, 1, filaHistorial.length).setValues([filaHistorial]);
      }
      sheet.getRange(fila, 6, 1, 7).setValues([["OK", "", "", "", "", "", ""]]);
      SpreadsheetApp.flush();
      return { success: true, avisoSat: false };
    }

    // Fallas / Averiada / Revision
    const esNueva = (estadoAnterior === "OK");
    sheet.getRange(fila, 6, 1, 2).setValues([[estado, observacion]]);
    // Fecha Estado = inicio de la avería: solo se pone la primera vez (esNueva). Si se
    // sobrescribiera en cada cambio (p.ej. Fallas → Revision → Averiada) se perdería la
    // fecha real de inicio y el historial saldría con la fecha del último cambio, no la del inicio.
    if (esNueva) sheet.getRange(fila, 8, 1, 1).setNumberFormat("@").setValue(fechaStr);

    // "Revision" solo cambia la etiqueta (ya se revisó, sigue a falta de reparar): nunca manda avisoSat.
    // El correo al SAT ya lleva a los mandos en copia (ccConResponsables_) — no se manda aviso interno aparte.
    let avisoSat = false;
    if (estado !== "Revision" && esNueva) {
      avisoSat = enviarAvisoSat_(propietaria, actual[0], nombreMaquina, serial, observacion);
      // Fecha Envio SAT solo se pone si el correo realmente salió: si se deja puesta aunque
      // falle (propietaria desconocida, error de MailApp) no hay forma fiable de saber luego
      // si al SAT se le avisó de verdad o no.
      if (avisoSat) sheet.getRange(fila, 9, 1, 1).setNumberFormat("@").setValue(fechaStr);
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

    sheet.getRange(filaIdx + 1, 10, 1, 3).setNumberFormat("@").setValues([[
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
    MailApp.sendEmail({ to: para, cc: ccConResponsables_(para, cc), subject: asuntoSeguro_(asunto), htmlBody: htmlSeguro_("<h2>Aviso de avería</h2>" + html) });
    return true;
  } catch (e) {
    Logger.log("❌ Error enviando aviso SAT: " + e.message);
    return false;
  }
}
