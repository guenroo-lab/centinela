// ============================================================
//  CENTINELA — GESTIÓN DE TRANSPORTES EN EL B2B (escribe en el B2B)
//  Anular un transporte y añadir un transporte EXTRA. Réplica de
//  jefeAnularEnB2B / jefeAnadirAlB2B de la app "Cargas/Descargas
//  Plataforma Málaga" (proyecto_cargas: B2B.gs + GestionJefe.gs), con
//  la misma marca en la columna AT, el mismo tachado y el mismo correo
//  a administración.
//
//  OJO: Centinela se ejecuta con la cuenta de quien lo usa, así que esa
//  cuenta necesita permiso de EDICIÓN en el documento B2B.
// ============================================================

// Copia de CONFIG_CORREO de GestionJefe.gs (proyecto_cargas). Si allí cambia la lista, cambiarla aquí.
const CARGAS_CORREOS_ = {
  ADMINISTRACION: [
    "Pedro.gil@ext.leroymerlin.es",
    "david.delcampo@ext.leroymerlin.es",
    "jose-manuel.lachambre@leroymerlin.es",
    "jose-antonio.alcaide@ext.leroymerlin.es",
    "administracion.alm-malaga@leroymerlin.es",
    "daniel.simo@ext.leroymerlin.es",
    "daniel.arrastio@ext.leroymerlin.es",
    "francisco-javier.camara@ext.leroymerlin.es",
    "sebastian.gelvis@ext.leroymerlin.es"
  ],
  EXTRA_POR_DESTINO: {
    "marbella": [
      "pedcliente.marbella@leroymerlin.es", "miguel-angel.gonzalez5@leroymerlin.es", "jose-maria.marandino@leroymerlin.es",
      "logistica.marbella@leroymerlin.es", "francisco-damian.sedeno@leroymerlin.es", "david.jimenez2@leroymerlin.es",
      "francisco.alvarez2@leroymerlin.es"
    ],
    "malaga": [
      "adolfo.garcia@leroymerlin.es", "javier.navarro@leroymerlin.es", "pedcliente.malaga@leroymerlin.es",
      "logistica.malaga@leroymerlin.es", "ivan.perez2@leroymerlin.es", "samuel.guerrero@leroymerlin.es"
    ],
    "mijas": [
      "salvador.gonzalez2@leroymerlin.es", "pedcliente.mijas@leroymerlin.es", "logistica.mijas@leroymerlin.es",
      "hector.andres@leroymerlin.es", "david.jimenez2@leroymerlin.es"
    ]
  },
  REMITENTE_NOMBRE: "Plataforma Málaga - TAISA"
};

const B2B_MARCA_ANADIDO_ = "Añadido";
const B2B_TEXTO_EXTRA_ = "Extra";

// ── Utilidades ──
function autorGestionB2B_(autor) {
  const a = String(autor || "").trim();
  if (JEFES_EQUIPO.indexOf(a) >= 0 || a === IDENTIDAD_SUPERVISOR) return a;
  throw new Error("Identifícate (jefe de equipo o supervisor) para gestionar transportes.");
}

function mensajeErrorB2B_(e) {
  const m = String((e && e.message) || e);
  if (/permission|permiso|access denied|acceso denegado|not have access|no tienes acceso/i.test(m)) {
    return "Tu cuenta no tiene permiso de edición en el documento B2B. Pide acceso de edición a quien lo administra.";
  }
  return m;
}

// "HH:mm" → fracción de día (0.25 = 06:00), o null
function horaAFraccionB2B_(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return (Number(m[1]) * 60 + Number(m[2])) / 1440;
}

function minutosDeHoraB2B_(txt) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(txt || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function destinatariosGestionB2B_(lugar) {
  const t = String(lugar || "").toLowerCase();
  let extras = [];
  if (t.indexOf("marbella") > -1) extras = CARGAS_CORREOS_.EXTRA_POR_DESTINO["marbella"];
  else if (t.indexOf("málaga") > -1 || t.indexOf("malaga") > -1) extras = CARGAS_CORREOS_.EXTRA_POR_DESTINO["malaga"];
  else if (t.indexOf("mijas") > -1) extras = CARGAS_CORREOS_.EXTRA_POR_DESTINO["mijas"];
  const vistos = {}, lista = [];
  CARGAS_CORREOS_.ADMINISTRACION.concat(extras).forEach(function (mail) {
    const k = String(mail).trim().toLowerCase();
    if (!vistos[k]) { vistos[k] = true; lista.push(mail); }
  });
  return lista;
}

// Correo "Transporte AÑADIDO / ANULADO" — mismo contenido y destinatarios que la app de Cargas/Descargas.
// Devuelve true/false (un fallo de correo nunca deshace el cambio ya hecho en el B2B).
function enviarCorreoGestionB2B_(accion, d) {
  try {
    const esAnular = (accion === "ANULADO");
    const color = esAnular ? "#e30613" : "#22c55e";
    const tz = Session.getScriptTimeZone();
    const sello = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy 'a las' HH:mm");
    const fila = function (label, valor) {
      return '<tr><td style="padding:8px 0;color:#6b7899;width:42%;border-bottom:1px solid #eef1f4">' + escapeHtml(label) + '</td>' +
        '<td style="padding:8px 0;font-weight:600;border-bottom:1px solid #eef1f4">' + escapeHtml(valor || "-") + "</td></tr>";
    };
    const asunto = "[Plataforma Málaga] Transporte " + accion + " · " + d.destino + " · " + (d.fechaTransporte || "") + " " + (d.hora || "");
    const html =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f6f8;padding:24px">' +
        '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
          '<div style="background:' + color + ';padding:18px 22px">' +
            '<h2 style="margin:0;color:#fff;font-size:18px">Transporte ' + accion + "</h2>" +
            '<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Plataforma Málaga · TAISA Logistics</p>' +
          "</div>" +
          '<div style="padding:22px"><table style="width:100%;border-collapse:collapse;font-size:14px;color:#1b2733">' +
            fila("Tipo", d.tipo) + fila("Destino / Origen", d.destino) + fila("Fecha del transporte", d.fechaTransporte) +
            fila(d.etiquetaHora || "Hora", d.hora) + fila("Flujo", d.flujos) + fila("Soportes", d.soportes) +
            fila("Notas", d.notas) + fila("Realizado por", d.autor) + fila("Registrado el", sello) +
          "</table>" +
          '<p style="margin:20px 0 0;padding:12px;background:#f0f4ff;border-radius:8px;font-size:13px;color:#38444f">' +
            (esAnular ? "Este transporte ha sido <b>anulado</b>. Por favor, realizad los trámites pertinentes de cancelación."
                      : "Se ha <b>añadido</b> un nuevo transporte. Por favor, realizad los trámites pertinentes.") +
          "</p></div></div>" +
        '<p style="text-align:center;color:#6b7899;font-size:11px;margin-top:14px">Mensaje automático de Centinela · No responder</p>' +
      "</div>";
    MailApp.sendEmail({
      to: destinatariosGestionB2B_(d.destino).join(","),
      subject: asunto, htmlBody: html, name: CARGAS_CORREOS_.REMITENTE_NOMBRE
    });
    return true;
  } catch (e) {
    Logger.log("⚠️ Correo de gestión B2B no enviado: " + e.message);
    return false;
  }
}

function tomarLockB2B_() {
  const lock = LockService.getScriptLock();
  return lock.tryLock(10000) ? lock : null;
}

function abrirHojaB2BDeFecha_(fechaObj) {
  const ss = SpreadsheetApp.openById(CONFIG.B2B_SHEET_ID);
  const nombre = nombreHojaB2BDeFecha_(fechaObj);
  const hoja = ss.getSheetByName(nombre);
  if (!hoja) throw new Error('No existe la hoja "' + nombre + '" en el B2B.');
  return hoja;
}

// ============================================================
//  ANULAR
// ============================================================

// Vuelve a buscar la fila por su CONTENIDO (fecha+tipo+lugar+hora) en el momento de anular: el número
// de fila que vio la pantalla puede haberse desplazado si alguien añadió un transporte (insertRowAfter).
// Nunca adivina: si hay ambigüedad real, falla cerrado.
function resolverFilaAnularB2B_(hoja, numFilaHint, esperado, fechaObj, tz) {
  const ultima = hoja.getLastRow();
  if (ultima < CONFIG.B2B_PRIMERA_FILA_DATOS) return { ok: false, mensaje: "No hay filas de datos en el B2B." };
  const nFilas = ultima - CONFIG.B2B_PRIMERA_FILA_DATOS + 1;
  const datos = hoja.getRange(CONFIG.B2B_PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B_.ESTADO_JEFE).getValues();

  const candidatas = [];
  for (let i = 0; i < datos.length; i++) {
    const f = datos[i];
    if (!mismaFechaB2B_(f[COL_B2B_.FECHA - 1], fechaObj)) continue;
    const tipoB2B = String(f[COL_B2B_.TIPO - 1]).trim();
    if (tipoB2B !== esperado.tipoB2B) continue;
    const esRecepcion = (tipoB2B === "Recepción");
    const lugarFila = esRecepcion ? String(f[COL_B2B_.ORIGEN - 1]).trim() : String(f[COL_B2B_.DESTINO - 1]).trim();
    if (lugarFila !== String(esperado.lugar || "").trim()) continue;
    if (horaFilaB2B_(f, esRecepcion, tz) !== String(esperado.hora || "")) continue;
    const estadoActual = estadoFilaB2B_(f);
    if (estadoActual !== "Pendiente" && estadoActual !== "En curso") continue;   // solo las activas
    candidatas.push({
      fila: CONFIG.B2B_PRIMERA_FILA_DATOS + i, estadoActual: estadoActual,
      flujo: String(f[COL_B2B_.FLUJO - 1] || ""), soportes: f[COL_B2B_.PALETS - 1] || ""
    });
  }

  if (candidatas.length === 0) {
    return { ok: false, mensaje: "Ese transporte ya no está disponible para anular (puede que ya lo hayan anulado o ya se haya completado). Refresca la pantalla." };
  }
  if (candidatas.length === 1) return { ok: true, fila: candidatas[0].fila };

  let restantes = candidatas.filter(function (c) { return c.estadoActual === esperado.estado; });
  if (restantes.length === 1) return { ok: true, fila: restantes[0].fila };
  if (restantes.length === 0) restantes = candidatas;
  const porFlujoSoportes = restantes.filter(function (c) {
    return c.flujo === String(esperado.flujo || "") && String(c.soportes) === String(esperado.soportes || "");
  });
  if (porFlujoSoportes.length === 1) return { ok: true, fila: porFlujoSoportes[0].fila };
  return { ok: false, mensaje: "Hay varios transportes idénticos ese día y no se puede identificar cuál anular con seguridad. Refresca la pantalla; si persiste, contacta con administración." };
}

// data = { fecha:"dd/MM/yyyy", fila, autor, esperado:{tipoB2B, lugar, hora, estado, flujo, soportes} }
function anularTransporteB2B(data) {
  try {
    if (!data) return { ok: false, mensaje: "No se han recibido datos." };
    const autor = autorGestionB2B_(data.autor);
    const fechaObj = fechaB2BDesdeTexto_(data.fecha);
    if (!fechaObj) return { ok: false, mensaje: "Fecha no válida." };
    const esp = data.esperado;
    if (!esp || !esp.tipoB2B || !esp.lugar || !esp.hora) {
      return { ok: false, mensaje: "Faltan datos del transporte. Recarga la pestaña e inténtalo de nuevo." };
    }
    const tz = Session.getScriptTimeZone();
    const hoja = abrirHojaB2BDeFecha_(fechaObj);

    const lock = tomarLockB2B_();
    if (!lock) return { ok: false, mensaje: "El sistema está ocupado con otro cambio en el B2B. Inténtalo de nuevo en unos segundos." };
    let filaFinal, datosFila;
    try {
      const res = resolverFilaAnularB2B_(hoja, data.fila, esp, fechaObj, tz);
      if (!res.ok) return res;
      filaFinal = res.fila;
      datosFila = hoja.getRange(filaFinal, 1, 1, COL_B2B_.SIE_RECEP).getValues()[0];
      // Marca con fecha/hora REAL de la anulación (distingue una anulación de hoy de una marca vieja copiada)
      hoja.getRange(filaFinal, COL_B2B_.ESTADO_JEFE).setValue("Anulado " + Utilities.formatDate(new Date(), tz, "dd/MM HH:mm"));
      hoja.getRange(filaFinal, 1, 1, COL_B2B_.SIE_RECEP).setFontLine("line-through").setFontColor("#999999");
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    const tipoB2B = String(datosFila[COL_B2B_.TIPO - 1]).trim();
    const esRecepcion = (tipoB2B === "Recepción");
    const correo = enviarCorreoGestionB2B_("ANULADO", {
      tipo: esRecepcion ? "Descarga (Recepción)" : "Carga (Expedición)",
      destino: esRecepcion ? String(datosFila[COL_B2B_.ORIGEN - 1]) : String(datosFila[COL_B2B_.DESTINO - 1]),
      hora: horaFilaB2B_(datosFila, esRecepcion, tz),
      fechaTransporte: Utilities.formatDate(fechaObj, tz, "dd/MM/yyyy"),
      flujos: String(datosFila[COL_B2B_.FLUJO - 1] || "-"), soportes: String(datosFila[COL_B2B_.PALETS - 1] || "-"),
      notas: "-", autor: autor
    });
    return {
      ok: true, correoEnviado: correo,
      mensaje: correo ? "✅ Transporte anulado en el B2B y notificado a administración."
                      : "✅ Transporte anulado en el B2B, pero el correo a administración NO se pudo enviar: avisadles."
    };
  } catch (e) {
    Logger.log("❌ Error anulando transporte: " + e.message);
    return { ok: false, mensaje: "Error: " + mensajeErrorB2B_(e) };
  }
}

// ============================================================
//  AÑADIR TRANSPORTE EXTRA
// ============================================================

// El "siguiente transporte" del mismo destino: el primero aún Pendiente (por orden de hoja); si no hay,
// el primero En curso; si no, el último activo; y si solo hay anulados, el último.
function elegirFilaBaseB2B_(candidatas) {
  const activas = candidatas.filter(function (c) { return c.estado !== "Anulado"; });
  const pend = activas.filter(function (c) { return c.estado === "Pendiente"; })[0];
  if (pend) return pend;
  const curso = activas.filter(function (c) { return c.estado === "En curso"; })[0];
  if (curso) return curso;
  if (activas.length) return activas[activas.length - 1];
  return candidatas[candidatas.length - 1];
}

// data = { fecha:"dd/MM/yyyy", tipo:"Carga"|"Descarga", lugar:"LM Marbella", horaLlegada:"HH:mm", autor }
// Inserta UNA fila justo debajo del siguiente transporte del mismo destino ese día y en ella:
//   A,B,C,D = copia de esa fila | E (hora de cita) = "Extra" | F (hora llegada) = la hora elegida | AT = "Añadido"
function anadirTransporteB2B(data) {
  try {
    if (!data) return { ok: false, mensaje: "No se han recibido datos." };
    const autor = autorGestionB2B_(data.autor);
    const fechaObj = fechaB2BDesdeTexto_(data.fecha);
    if (!fechaObj) return { ok: false, mensaje: "Fecha no válida." };
    const tz = Session.getScriptTimeZone();
    const hoy = fechaB2BDesdeTexto_(Utilities.formatDate(new Date(), tz, "dd/MM/yyyy"));
    if (fechaObj.getTime() < hoy.getTime()) return { ok: false, mensaje: "No se pueden añadir transportes en fechas pasadas." };
    if (data.tipo !== "Carga" && data.tipo !== "Descarga") return { ok: false, mensaje: "Tipo de transporte no válido." };
    const lugar = String(data.lugar || "").trim();
    if (!lugar) return { ok: false, mensaje: "Elige el destino." };
    const horaTxt = String(data.horaLlegada || "").trim();
    const fraccion = horaAFraccionB2B_(horaTxt);
    if (fraccion === null) return { ok: false, mensaje: "Indica la hora de llegada a tienda (HH:mm)." };
    const horaNorm = pad2B2B_(Math.floor(Math.round(fraccion * 1440) / 60)) + ":" + pad2B2B_(Math.round(fraccion * 1440) % 60);

    const esCarga = (data.tipo === "Carga");
    const tipoB2B = esCarga ? "Expedición" : "Recepción";
    const hoja = abrirHojaB2BDeFecha_(fechaObj);

    const lock = tomarLockB2B_();
    if (!lock) return { ok: false, mensaje: "El sistema está ocupado con otro cambio en el B2B. Inténtalo de nuevo en unos segundos." };
    let filaNueva, base, aviso = "";
    try {
      const ultima = hoja.getLastRow();
      if (ultima < CONFIG.B2B_PRIMERA_FILA_DATOS) return { ok: false, mensaje: "El B2B no tiene filas de datos en esa hoja." };
      const nFilas = ultima - CONFIG.B2B_PRIMERA_FILA_DATOS + 1;
      const datos = hoja.getRange(CONFIG.B2B_PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B_.ESTADO_JEFE).getValues();

      const candidatas = [];
      for (let i = 0; i < datos.length; i++) {
        const f = datos[i];
        if (!mismaFechaB2B_(f[COL_B2B_.FECHA - 1], fechaObj)) continue;
        if (String(f[COL_B2B_.TIPO - 1]).trim() !== tipoB2B) continue;
        const lugarFila = esCarga ? String(f[COL_B2B_.DESTINO - 1]).trim() : String(f[COL_B2B_.ORIGEN - 1]).trim();
        if (lugarFila !== lugar) continue;
        candidatas.push({ fila: CONFIG.B2B_PRIMERA_FILA_DATOS + i, estado: estadoFilaB2B_(f), datos: f });
      }
      if (candidatas.length === 0) {
        return { ok: false, mensaje: "No hay ningún transporte de " + lugar + " (" + data.tipo + ") el " + data.fecha + " en el B2B del que copiar los datos. Añádelo a mano en el B2B." };
      }

      // Anti doble pulsación: mismo día, mismo destino, ya hay un Extra activo a esa misma hora de llegada
      const duplicado = candidatas.filter(function (c) {
        return c.estado !== "Anulado" && esExtraB2B_(c.datos) && horaTxtB2B_(c.datos[COL_B2B_.HORA_LLEGADA - 1], tz) === horaNorm;
      })[0];
      if (duplicado) return { ok: false, mensaje: "Ya hay un transporte Extra de " + lugar + " con llegada a las " + horaNorm + " ese día (fila " + duplicado.fila + ")." };

      base = elegirFilaBaseB2B_(candidatas);
      hoja.insertRowAfter(base.fila);
      filaNueva = base.fila + 1;

      // Formato de la fila de origen (si estaba anulada, sin tachado ni gris)
      const rangoBase = hoja.getRange(base.fila, 1, 1, COL_B2B_.ESTADO_JEFE);
      const rangoNueva = hoja.getRange(filaNueva, 1, 1, COL_B2B_.ESTADO_JEFE);
      rangoBase.copyTo(rangoNueva, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      rangoNueva.setFontLine("none");
      if (base.estado === "Anulado") rangoNueva.setFontColor(null);

      // Columnas A, B, C, D copiadas; E = "Extra"; F = hora de llegada a tienda
      const d = base.datos;
      hoja.getRange(filaNueva, COL_B2B_.FECHA, 1, 6).setValues([[
        d[COL_B2B_.FECHA - 1], d[COL_B2B_.TIPO - 1], d[COL_B2B_.ORIGEN - 1], d[COL_B2B_.DESTINO - 1], B2B_TEXTO_EXTRA_, fraccion
      ]]);
      hoja.getRange(filaNueva, COL_B2B_.FECHA).setNumberFormat("dd/mm/yyyy");
      hoja.getRange(filaNueva, COL_B2B_.HORA_LLEGADA).setNumberFormat("hh:mm");
      hoja.getRange(filaNueva, COL_B2B_.ESTADO_JEFE).setValue(B2B_MARCA_ANADIDO_);
      SpreadsheetApp.flush();

      // Comprobación: se relee lo escrito
      const leido = hoja.getRange(filaNueva, 1, 1, 6).getValues()[0];
      const okAD = String(leido[COL_B2B_.TIPO - 1]).trim() === String(d[COL_B2B_.TIPO - 1]).trim() &&
        String(leido[COL_B2B_.ORIGEN - 1]).trim() === String(d[COL_B2B_.ORIGEN - 1]).trim() &&
        String(leido[COL_B2B_.DESTINO - 1]).trim() === String(d[COL_B2B_.DESTINO - 1]).trim() &&
        String(leido[COL_B2B_.HORA_CITA - 1]).trim() === B2B_TEXTO_EXTRA_;
      if (!okAD) return { ok: false, mensaje: "Se insertó la fila " + filaNueva + " pero no coincide con lo esperado. Revisa el B2B." };
      const minLeidos = minutosDeHoraB2B_(horaTxtB2B_(leido[COL_B2B_.HORA_LLEGADA - 1], tz));
      const minEsperados = minutosDeHoraB2B_(horaNorm);
      if (minLeidos === null || Math.abs(minLeidos - minEsperados) > 2) aviso = " (Revisa la hora de llegada en la fila " + filaNueva + " del B2B.)";
    } finally {
      lock.releaseLock();
    }

    const correo = enviarCorreoGestionB2B_("AÑADIDO", {
      tipo: esCarga ? "Carga (Expedición) · EXTRA" : "Descarga (Recepción) · EXTRA",
      destino: lugar, fechaTransporte: data.fecha, hora: horaNorm, etiquetaHora: "Hora de llegada a tienda",
      flujos: "(se define en la carga)", soportes: "(se define en la carga)",
      notas: "Transporte Extra añadido desde Centinela", autor: autor
    });
    return {
      ok: true, fila: filaNueva, correoEnviado: correo,
      mensaje: (correo ? "✅ Transporte Extra añadido al B2B (fila " + filaNueva + ") y notificado a administración."
                       : "✅ Transporte Extra añadido al B2B (fila " + filaNueva + "), pero el correo a administración NO se pudo enviar: avisadles.") + aviso
    };
  } catch (e) {
    Logger.log("❌ Error añadiendo transporte: " + e.message);
    return { ok: false, mensaje: "Error: " + mensajeErrorB2B_(e) };
  }
}
