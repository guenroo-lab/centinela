// ============================================================
//  CENTINELA — CONTROL DE TURNO
// ============================================================

// ── PROCESAR REGISTRO ─────────────────────────────────────────
function procesarRegistro(data) {
  Logger.log("📥 Procesando registro de: " + (data && data.jefe_equipo));

  // Validación de entrada (antes se asumía que todo llegaba bien).
  if (!data) throw new Error("No se han recibido datos del formulario.");
  if (!data.jefe_equipo) throw new Error("Falta el jefe de equipo.");
  data.jefe_equipo = jefeVigente_(data.jefe_equipo);
  if (JEFES_EQUIPO.indexOf(data.jefe_equipo) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.jefe_equipo);
  }
  if (!data.turno_id) throw new Error("Falta el rol de turno.");

  const turno = turnosConZonas_()[data.turno_id];
  if (!turno) throw new Error("Rol de turno no encontrado: " + data.turno_id);

  if (!Array.isArray(data.zonas) || data.zonas.length === 0) {
    throw new Error("El informe no contiene ninguna zona.");
  }
  if (data.zonas.length > Math.max(TURNO_ZONAS_MAX_, turno.zonas.length)) {
    throw new Error("El informe tiene demasiadas zonas (" + data.zonas.length + ").");
  }

  // El supervisor puede cambiar las zonas de un rol mientras un jefe ya está haciendo el control con
  // las anteriores (la pantalla las cargó al abrirse). Rechazar el envío haría perder todas las
  // fotos, así que se acepta lo que el jefe fotografió y se le avisa. Los nombres vienen del cliente:
  // se normalizan igual que al guardarlos en el editor.
  const avisos = [];
  if (data.zonas.length !== turno.zonas.length) {
    Logger.log("⚠️ Zonas recibidas (" + data.zonas.length + ") distintas a las configuradas (" +
      turno.zonas.length + ") para " + data.turno_id);
    avisos.push("Las zonas de este rol se han modificado mientras hacías el control. El informe recoge las que fotografiaste.");
  }
  data.zonas = data.zonas.map(function (z) {
    const zona = (z && typeof z === "object") ? z : {};
    const nombre = String(zona.nombre || "").replace(/\s+/g, " ").trim().slice(0, TURNO_ZONA_NOMBRE_MAX_);
    return Object.assign({}, zona, { nombre: nombre || "Zona sin nombre" });
  });

  const ahora = new Date();
  const tz = Session.getScriptTimeZone();
  const fechaStr = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
  const horaStr = Utilities.formatDate(ahora, tz, "HH:mm:ss");

  const estados = data.zonas.map(z => clampEstado(z.estado));
  const puntuacionGlobal = Math.round((estados.reduce((a, b) => a + b, 0) / estados.length) * 10) / 10;
  const puntuacionStr = puntuacionGlobal.toFixed(1);

  let calificacion = "CRITICO";
  if (puntuacionGlobal >= CONFIG.UMBRAL_VERDE) calificacion = "OPTIMO";
  else if (puntuacionGlobal >= CONFIG.UMBRAL_AMARILLO) calificacion = "ACEPTABLE";

  const idRegistro = "CT-" + turno.codigo + "-" +
                     Utilities.formatDate(ahora, tz, "yyyyMMdd-HHmmss");

  const meta = {
    idRegistro, fechaStr, horaStr,
    puntuacionGlobal, puntuacionStr, calificacion, estados
  };

  // El email es el entregable crítico y no depende de la hoja:
  // se envía primero para que un fallo de Sheets no lo bloquee.
  const emailOk = enviarInformeEmail(data, turno, meta);

  const guardado = guardarEnHoja(data, turno, meta, emailOk);

  if (!emailOk) avisos.push("El email no se pudo enviar. Avisa a Pedro Gil.");
  if (!guardado.ok) avisos.push("No se pudo guardar en la hoja: " + guardado.error);

  // Exito real solo si al menos el email o la hoja quedaron registrados;
  // si ambos fallan no hay ningun rastro del control y no se puede llamar "success".
  const success = emailOk || guardado.ok;

  return {
    success,
    error: success ? undefined : avisos.join(" | "),
    idRegistro,
    fechaStr,
    horaStr,
    turno: turno.nombre,
    jefe: data.jefe_equipo,
    puntuacionGlobal: puntuacionStr,
    calificacion,
    emailEnviado: emailOk ? "Enviado" : "No enviado",
    guardadoOk: guardado.ok,
    avisos,
    numZonas: data.zonas.length
  };
}


function guardarEnHoja(data, turno, meta, emailOk) {
  const ss = abrirHojaCentinela_();
  if (!ss) {
    Logger.log("⚠️ SPREADSHEET_ID no configurado. Ejecuta setupSistemaCompleto() primero.");
    return { ok: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  }

  // Bloqueo para que dos jefes enviando a la vez no se pisen la fila.
  // Si no se consigue, se falla cerrado: mejor avisar que escribir sin proteccion.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    Logger.log("⚠️ No se pudo obtener el bloqueo para guardar.");
    return { ok: false, error: "No se pudo obtener el bloqueo para guardar; intentalo de nuevo." };
  }
  const bloqueado = true;

  try {
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_TURNO);
    if (!sheet) {
      // Antes caía en getActiveSheet(), que podía ser una hoja cualquiera.
      sheet = ss.insertSheet(CONFIG.SHEET_NAME_TURNO);
      escribirCabeceras(sheet, CABECERAS_TURNO);
    } else if (sheet.getLastRow() === 0 || !cabecerasOk(sheet, CABECERAS_TURNO)) {
      // La hoja existe pero le falta (o le borraron) la fila de cabeceras.
      escribirCabeceras(sheet, CABECERAS_TURNO);
    }

    const zonasParaSheet = data.zonas.map(z => ({
      nombre: z.nombre,
      estado: clampEstado(z.estado),
      comentario: z.comentario || "",
      foto: !z.foto ? "[sin foto]" : (dataUriABlob(z.foto, "check.jpg") ? "[foto adjunta]" : "[foto corrupta]")
    }));

    const fila = [
      meta.idRegistro,
      meta.fechaStr,
      meta.horaStr,
      data.jefe_equipo,
      turno.nombre,
      data.zonas.length,
      JSON.stringify(zonasParaSheet),
      data.comentario_general || "",
      meta.puntuacionGlobal,
      meta.calificacion,
      emailOk ? "Enviado " + meta.horaStr : "Error al enviar"
    ];

    sheet.appendRow(fila);
    SpreadsheetApp.flush();

    const ultimaFila = sheet.getLastRow();
    const color = meta.puntuacionGlobal >= CONFIG.UMBRAL_VERDE ? "#d4edda" :
                  meta.puntuacionGlobal >= CONFIG.UMBRAL_AMARILLO ? "#fff3cd" : "#f8d7da";
    sheet.getRange(ultimaFila, 1, 1, fila.length).setBackground(color);

    Logger.log("✅ Registro guardado en la fila " + ultimaFila);
    return { ok: true, fila: ultimaFila };

  } catch (e) {
    Logger.log("❌ Error guardando en Sheets: " + e.message);
    return { ok: false, error: e.message };
  } finally {
    if (bloqueado) lock.releaseLock();
  }
}


// ── ENVIAR INFORME POR EMAIL ──────────────────────────────────
function enviarInformeEmail(data, turno, meta) {
  try {
    const destinatario = CONFIG.EMAIL_RESPONSABLE;
    const asunto = `[Control Turno] ${turno.nombre} | ${meta.fechaStr} | ${data.jefe_equipo} | ${meta.calificacion}`;

    const email = generarHTMLEmail(data, turno, meta);

    const cuerpoTexto = [
      "Control de Turno - " + turno.nombre,
      "Fecha: " + meta.fechaStr + " " + meta.horaStr,
      "Jefe de equipo: " + data.jefe_equipo,
      "Puntuacion global: " + meta.puntuacionStr + "/5 (" + meta.calificacion + ")",
      "",
      "Zonas:"
    ]
      .concat(data.zonas.map(z =>
        " - " + z.nombre + ": " + clampEstado(z.estado) + "/5" +
        (z.comentario ? " | " + z.comentario : "")
      ))
      .concat(data.comentario_general ? ["", "Comentario general: " + data.comentario_general] : [])
      .join("\n");

    GmailApp.sendEmail(destinatario, asuntoSeguro_(asunto), sinAstrales_(cuerpoTexto), {
      cc: ccConResponsables_(destinatario),
      htmlBody: htmlSeguro_(email.html),
      inlineImages: email.inlineImages,
      name: "Sistema Control de Turno – Taisa"
    });

    Logger.log("✅ Email enviado correctamente a: " + destinatario);
    return true;

  } catch (e) {
    Logger.log("❌ ERROR al enviar email: " + e.message);
    Logger.log("   Stack: " + e.stack);
    return false;
  }
}


// ── GENERAR HTML DEL EMAIL ────────────────────────────────────
// Devuelve { html, inlineImages }. Las fotos van como imágenes inline (cid:)
// porque Gmail bloquea las imágenes en data-URI y no se verían.
function generarHTMLEmail(data, turno, meta) {
  const colorGlobal = colorPorPuntuacion(meta.puntuacionGlobal);
  const inlineImages = {};
  let bytesFotos = 0;

  // El logo también va inline: Gmail bloquea las imágenes en data-URI.
  const logoBlob = dataUriABlob(LOGO_TAISA_DATA_URI, "logo_taisa.png");
  if (logoBlob) {
    inlineImages["logotaisa"] = logoBlob;
    bytesFotos += logoBlob.getBytes().length;
  }
  const logoHtml = logoBlob
    ? `<img src="cid:logotaisa" alt="Taisa Logistics" width="150" style="width:150px;max-width:60%;height:auto;display:block;" />`
    : `<div style="font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#000;">TAISA LOGISTICS</div>`;

  const zonasHtml = data.zonas.map((z, idx) => {
    const est = clampEstado(z.estado);
    const color = colorPorPuntuacion(est);
    // Mismo color que el badge, pero mas claro cuando se usa como TEXTO
    // (no como fondo con letra negra): el rojo de marca es poco legible
    // como texto sobre fondo oscuro.
    const colorTexto = est < CONFIG.UMBRAL_AMARILLO ? "#ff4d5a" : color;
    const barras = "█".repeat(est) + "░".repeat(5 - est);

    let fotoHtml = `<div style="background:#161b2e;border:1px dashed rgba(255,255,255,0.1);border-radius:12px;padding:28px;text-align:center;color:#6b7899;margin-top:12px;font-size:13px;">[Sin foto adjunta]</div>`;

    if (z.foto) {
      const blob = dataUriABlob(z.foto, "zona_" + (idx + 1) + ".jpg");
      if (blob) {
        const tam = blob.getBytes().length;
        if (bytesFotos + tam <= CONFIG.MAX_BYTES_FOTOS_EMAIL) {
          bytesFotos += tam;
          const cid = "zona" + idx;
          inlineImages[cid] = blob;
          fotoHtml = `<img src="cid:${cid}" width="600" alt="${escapeHtml(z.nombre)}" style="max-width:100%;height:auto;border-radius:12px;margin-top:12px;border:1px solid rgba(255,255,255,0.1);" />`;
        } else {
          fotoHtml = `<div style="background:#161b2e;border:1px dashed rgba(255,255,255,0.1);border-radius:12px;padding:28px;text-align:center;color:#6b7899;margin-top:12px;font-size:13px;">[Foto omitida: informe demasiado pesado]</div>`;
        }
      } else {
        // Habia foto pero no se pudo decodificar: no es lo mismo que "no se hizo foto".
        fotoHtml = `<div style="background:#161b2e;border:1px dashed rgba(227,6,19,0.4);border-radius:12px;padding:28px;text-align:center;color:#ff8a93;margin-top:12px;font-size:13px;">[No se pudo procesar la foto - vuelve a intentarlo]</div>`;
      }
    }

    const comentarioHtml = z.comentario
      ? `<div style="background:#161b2e;border-radius:10px;padding:14px;margin-top:12px;"><p style="margin:0;color:#a3b0cc;font-size:14px;line-height:1.6;">${escapeHtml(z.comentario)}</p></div>`
      : "";

    return `
      <div style="background:#0f1220;border-radius:16px;padding:24px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.06);">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
          <tr>
            <td align="left" style="font-size:16px;color:#f0f4ff;font-weight:600;">${escapeHtml(z.nombre)}</td>
            <td align="right"><span style="background:${color};color:#000;padding:5px 14px;border-radius:50px;font-size:12px;font-weight:700;text-transform:uppercase;">${estadoLabel(z.estado)}</span></td>
          </tr>
        </table>
        <div style="font-family:monospace;color:${colorTexto};font-size:20px;margin:10px 0;">${barras} ${est}/5</div>
        ${comentarioHtml}
        ${fotoHtml}
      </div>`;
  }).join("");

  const filaResumen = (etiqueta, valor, conBorde) => `
        <tr>
          <td align="left" style="padding:12px 0;${conBorde ? "border-bottom:1px solid rgba(255,255,255,0.06);" : ""}color:#6b7899;font-size:14px;">${etiqueta}</td>
          <td align="right" style="padding:12px 0;${conBorde ? "border-bottom:1px solid rgba(255,255,255,0.06);" : ""}color:#f0f4ff;font-weight:700;font-size:14px;">${valor}</td>
        </tr>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;background:#080a10;color:#f0f4ff;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#080a10" style="background:#080a10;">
   <tr><td align="center" style="padding:0;">
    <div style="max-width:680px;margin:0 auto;padding:32px 20px;text-align:left;">

    <div style="background:#0f1220;border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:36px;margin-bottom:24px;text-align:center;">
      <div style="display:inline-block;background:#ffffff;padding:16px 24px;border-radius:12px;margin-bottom:24px;">
        ${logoHtml}
      </div>
      <h1 style="margin:0 0 8px;font-family:Impact,'Arial Narrow',sans-serif;font-size:36px;letter-spacing:2px;color:#f0f4ff;">${escapeHtml(turno.nombre)}</h1>
      <p style="margin:0;color:#6b7899;font-size:14px;">Control de Turno</p>
      <div style="width:50px;height:3px;background:${turno.color_email};border-radius:2px;margin:16px auto 0;"></div>
    </div>

    <div style="background:#0f1220;border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:28px;margin-bottom:24px;">
      <h2 style="margin:0 0 12px;font-family:Impact,'Arial Narrow',sans-serif;font-size:18px;color:#6b7899;text-transform:uppercase;letter-spacing:2px;">Resumen del Turno</h2>

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
${filaResumen("ID Registro", escapeHtml(meta.idRegistro), true)}
${filaResumen("Fecha", escapeHtml(meta.fechaStr), true)}
${filaResumen("Hora Cierre", escapeHtml(meta.horaStr), true)}
${filaResumen("Rol / Turno", escapeHtml(turno.nombre), true)}
${filaResumen("Jefe de Equipo", escapeHtml(data.jefe_equipo), false)}
      </table>

      <div style="background:${colorGlobal};border-radius:16px;padding:28px;text-align:center;margin-top:24px;">
        <div style="font-size:11px;color:rgba(0,0,0,0.6);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Puntuacion Global</div>
        <div style="font-family:Impact,'Arial Narrow',sans-serif;font-size:56px;font-weight:900;color:#000;line-height:1;">${meta.puntuacionStr}<span style="font-size:28px;">/5</span></div>
        <div style="font-size:18px;color:#000;margin-top:6px;font-weight:700;">${meta.calificacion}</div>
      </div>
    </div>

    <h2 style="font-family:Impact,'Arial Narrow',sans-serif;font-size:18px;color:#6b7899;text-transform:uppercase;letter-spacing:2px;margin:0 0 18px;">Estado por Zonas (${data.zonas.length})</h2>
    ${zonasHtml}

    ${data.comentario_general ? `
    <div style="background:#1a0e12;border-left:3px solid #e30613;border-radius:12px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 10px;font-size:15px;color:#ff4d5a;font-weight:700;text-transform:uppercase;">Comentario General</h3>
      <p style="margin:0;color:#f0f4ff;font-size:14px;line-height:1.6;">${escapeHtml(data.comentario_general)}</p>
    </div>` : ""}

    <div style="text-align:center;padding:24px 0;color:#6b7899;font-size:12px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0;">Informe generado automaticamente - Sistema de Control de Turno Taisa v3.2</p>
      <p style="margin:8px 0 0;">&copy; Nave Industrial - ${escapeHtml(meta.fechaStr)}</p>
    </div>
    </div>
   </td></tr>
  </table>
</body>
</html>`;

  return { html, inlineImages };
}

