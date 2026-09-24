// ============================================================
//  CENTINELA — VISTA DE CARGAS/DESCARGAS
//  Lee la hoja de la app "Cargas/Descargas Plataforma Málaga"
//  (EnCurso + Registros) y el plan del día del B2B. Estas lecturas no
//  escriben nada; las escrituras en el B2B (anular / añadir transporte)
//  están en CargasGestion.gs.
// ============================================================

// EnCurso: ID|Muelle|Cargador|Tipo|Categoria|Destino|HoraEntrega|InicioISO|Foto|FechaCarga
// Registros: ID|Fecha|Muelle|Cargador|Tipo|Categoria|Destino|HoraInicio|HoraFin|Duracion|...

function obtenerVistaCargas(fechaStr) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.CARGAS_SPREADSHEET_ID);
    const tz = Session.getScriptTimeZone();

    const enCurso = [];
    const hCurso = ss.getSheetByName(CONFIG.CARGAS_HOJA_CURSO);
    if (hCurso) {
      const datos = hCurso.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        const f = datos[i];
        if (!f[0]) continue;
        enCurso.push({
          muelle: String(f[1]), cargador: String(f[2]), tipo: String(f[3]),
          destino: String(f[5]),
          horaEntrega: (f[6] instanceof Date) ? Utilities.formatDate(f[6], tz, "HH:mm") : String(f[6] || "")
        });
      }
    }

    const completadasHoy = [];
    const hReg = ss.getSheetByName(CONFIG.CARGAS_HOJA_REG);
    if (hReg) {
      const hoyStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
      const hoyD = new Date();
      const datos = hReg.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        const f = datos[i];
        if (!f[0] || !f[1]) continue;
        let esHoy = false;
        if (f[1] instanceof Date) {
          esHoy = f[1].getDate() === hoyD.getDate() && f[1].getMonth() === hoyD.getMonth() && f[1].getFullYear() === hoyD.getFullYear();
        } else {
          esHoy = String(f[1]).indexOf(hoyStr) !== -1;
        }
        if (!esHoy) continue;
        completadasHoy.push({
          muelle: String(f[2]), cargador: String(f[3]), tipo: String(f[4]), destino: String(f[6]),
          horaFin: (f[8] instanceof Date) ? Utilities.formatDate(f[8], tz, "HH:mm") : String(f[8] || "")
        });
      }
    }
    completadasHoy.reverse();

    // El plan puede pedirse de otro día (fechaStr dd/MM/yyyy); En curso / Completadas son siempre "hoy".
    const fechaObj = fechaStr ? fechaB2BDesdeTexto_(fechaStr) : new Date();
    const plan = fechaObj ? leerPlanB2B_(fechaObj) : { plan: [], error: "Fecha no válida." };
    return {
      ok: true, enCurso: enCurso, completadasHoy: completadasHoy,
      plan: plan.plan, planError: plan.error || "",
      fecha: Utilities.formatDate(fechaObj || new Date(), tz, "dd/MM/yyyy")
    };
  } catch (e) {
    Logger.log("❌ Error leyendo Cargas/Descargas: " + e.message);
    return { ok: false, error: e.message, enCurso: [], completadasHoy: [], plan: [] };
  }
}

// Solo el plan de un día (lo usa el formulario "Añadir transporte" al cambiar de fecha).
function obtenerPlanB2B(fechaStr) {
  const fechaObj = fechaB2BDesdeTexto_(fechaStr);
  if (!fechaObj) return { ok: false, error: "Fecha no válida.", plan: [] };
  const r = leerPlanB2B_(fechaObj);
  return { ok: !r.error, error: r.error || "", plan: r.plan, fecha: fechaStr };
}

// ── Plan del día desde el B2B externo (réplica de _leerPlanDelDiaB2B en el proyecto
//    Cargas/Descargas — mismas columnas, mismo criterio de estado). ──
const COL_B2B_ = {
  FECHA: 1, TIPO: 2, ORIGEN: 3, DESTINO: 4,
  HORA_CITA: 5, HORA_LLEGADA: 6, HORA_POSIC: 7, HORA_COMIENZO: 8, HORA_FIN: 9,
  FLUJO: 10, PALETS: 11, SIE_RECEP: 32, ESTADO_JEFE: 46
};
const MESES_B2B_ = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function esAnuladoB2B_(marcaJefe) {
  return String(marcaJefe || "").trim().indexOf("Anulado") === 0;
}

// "dd/MM/yyyy" estricto → Date local (medianoche) o null
function fechaB2BDesdeTexto_(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getFullYear() !== Number(m[3]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
  return d;
}

function nombreHojaB2BDeFecha_(fechaObj) {
  return MESES_B2B_[fechaObj.getMonth()] + " " + fechaObj.getFullYear();
}

function mismaFechaB2B_(celda, fechaObj) {
  return celda instanceof Date &&
    celda.getDate() === fechaObj.getDate() && celda.getMonth() === fechaObj.getMonth() && celda.getFullYear() === fechaObj.getFullYear();
}

function pad2B2B_(n) { return (n < 10 ? "0" : "") + n; }

// Cualquier valor de hora del B2B → "HH:mm" (o el texto tal cual si no es una hora)
function horaTxtB2B_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, "HH:mm");
  if (typeof v === "number" && v >= 0 && v < 1) {
    const m = Math.round(v * 1440);
    return pad2B2B_(Math.floor(m / 60)) + ":" + pad2B2B_(m % 60);
  }
  return String(v == null ? "" : v).trim();
}

// Hora con la que se muestra/identifica un transporte: recepción → col E (cita), expedición →
// col G (posicionamiento). Los transportes EXTRA añadidos desde aquí llevan "Extra" en E y la
// hora de llegada a tienda en F: si la hora normal no es una hora, se usa F.
function horaFilaB2B_(f, esRecepcion, tz) {
  const esHora = function (t) { return /^\d{1,2}:\d{2}/.test(t); };
  const base = horaTxtB2B_(esRecepcion ? f[COL_B2B_.HORA_CITA - 1] : f[COL_B2B_.HORA_POSIC - 1], tz);
  if (esHora(base)) return base;
  const llegada = horaTxtB2B_(f[COL_B2B_.HORA_LLEGADA - 1], tz);
  return esHora(llegada) ? llegada : "";
}

function estadoFilaB2B_(f) {
  const vacio = function (v) { return v === "" || v === null || v === undefined; };
  if (esAnuladoB2B_(f[COL_B2B_.ESTADO_JEFE - 1])) return "Anulado";
  if (!vacio(f[COL_B2B_.HORA_FIN - 1])) return "Completado";
  if (!vacio(f[COL_B2B_.HORA_COMIENZO - 1])) return "En curso";
  return "Pendiente";
}

function esExtraB2B_(f) {
  return /^extra$/i.test(String(f[COL_B2B_.HORA_CITA - 1] || "").trim());
}

// Devuelve { plan: [...], error: "" }. Si el B2B no se puede abrir, lo dice (antes salía "sin plan").
function leerPlanB2B_(fechaObj) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.B2B_SHEET_ID);
    const tz = Session.getScriptTimeZone();
    const hoja = ss.getSheetByName(nombreHojaB2BDeFecha_(fechaObj));
    if (!hoja) return { plan: [], error: 'No existe la hoja "' + nombreHojaB2BDeFecha_(fechaObj) + '" en el B2B.' };

    const ultima = hoja.getLastRow();
    if (ultima < CONFIG.B2B_PRIMERA_FILA_DATOS) return { plan: [], error: "" };
    const nFilas = ultima - CONFIG.B2B_PRIMERA_FILA_DATOS + 1;
    const datos = hoja.getRange(CONFIG.B2B_PRIMERA_FILA_DATOS, 1, nFilas, COL_B2B_.ESTADO_JEFE).getValues();

    const plan = [];
    for (let i = 0; i < datos.length; i++) {
      const f = datos[i];
      if (!mismaFechaB2B_(f[COL_B2B_.FECHA - 1], fechaObj)) continue;
      const tipoB2B = String(f[COL_B2B_.TIPO - 1]).trim();
      if (!tipoB2B) continue;
      const esRecepcion = (tipoB2B === "Recepción");
      const origen = String(f[COL_B2B_.ORIGEN - 1] || "").trim();
      const destino = String(f[COL_B2B_.DESTINO - 1] || "").trim();
      plan.push({
        fila: CONFIG.B2B_PRIMERA_FILA_DATOS + i,
        tipo: esRecepcion ? "Descarga" : "Carga",
        tipoB2B: tipoB2B,
        origen: origen, destino: destino,
        lugar: esRecepcion ? origen : destino,     // la tienda/plataforma "de la otra punta"
        hora: horaFilaB2B_(f, esRecepcion, tz),
        flujo: String(f[COL_B2B_.FLUJO - 1] || ""),
        soportes: f[COL_B2B_.PALETS - 1] || "",
        estado: estadoFilaB2B_(f),
        extra: esExtraB2B_(f),
        anadido: String(f[COL_B2B_.ESTADO_JEFE - 1] || "").trim() === "Añadido"
      });
    }
    plan.sort(function (a, b) { return (a.hora || "99:99").localeCompare(b.hora || "99:99"); });
    return { plan: plan, error: "" };
  } catch (e) {
    Logger.log("❌ Error leyendo plan B2B: " + e.message);
    return { plan: [], error: "No se pudo leer el B2B (" + e.message + ")." };
  }
}
