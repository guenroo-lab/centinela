// ============================================================
//  CENTINELA — INCIDENCIAS PEDIDO CLIENTE (solo lectura)
//  Muestra, dentro de Centinela, el estado de las incidencias que se registran
//  en la app "Última Milla" (proyecto aparte lm_produccion, hoja "UltimaMilla",
//  pestañas INCIDENCIAS/INCIDENCIAS_COMENTARIOS/INCIDENCIAS_ARTICULOS). Es un
//  espejo de solo consulta: Centinela nunca escribe aquí, no gestiona el ciclo
//  de vida de la incidencia — solo enseña en qué estado está y qué pide.
//  Gestionar (comentar, cerrar, reabrir...) se sigue haciendo desde Última Milla.
//  Mismo patrón de resiliencia que Turnos/Cuadrante (TurnosSemana.gs): el
//  webapp ejecuta como USER_ACCESSING, así que si la cuenta de un jefe no
//  tiene acceso a la hoja de Última Milla, se cae a una copia guardada en
//  PropertiesService (la deja preparada el primero que SÍ tenga acceso).
// ============================================================

const INCPC_PROP_COPIA_ = "incpc_copia_v1";
const INCPC_COPIA_MAX_ = 480000; // límite real ~500KB por propiedad
const INCPC_RECARGA_MS_ = 5 * 60 * 1000;
const INCPC_TEXTO_MAX_ = 260; // recorte del texto de indicaciones en la tarjeta (detalle completo, en Última Milla)

// Estados/tipos reales de INCIDENCIAS.gs en lm_produccion — solo para pintar
// la etiqueta bonita en el cliente; un valor que no esté aquí se muestra tal cual.
const INCPC_ESTADOS_ = ["PENDIENTE", "EN_CURSO", "POSPUESTA", "RESUELTA", "CANCELADA"];

// dd/MM/yyyy HH:mm, igual que el resto de Centinela. Las fechas de INCIDENCIAS
// se escriben como ISO string (new Date().toISOString() en lm_produccion), pero
// Sheets puede haberlas autodetectado como fecha real -- se aceptan los dos
// casos (Date o texto) y SIEMPRE se devuelve una cadena ya formateada, nunca un
// Date crudo (google.script.run lo serializa mal, ver gotcha ya conocido aquí).
function incpcFormatoFecha_(valor, tz) {
  if (!valor) return "";
  const d = (valor instanceof Date) ? valor : new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  return Utilities.formatDate(d, tz, "dd/MM/yyyy HH:mm");
}

function incpcIndiceCabecera_(cabecera) {
  const idx = {};
  cabecera.forEach(function (nombre, i) { idx[nombre] = i; });
  return idx;
}

// idIncidencia -> texto del PRIMER comentario de admin (las indicaciones con
// las que se creó la incidencia, ver crearIncidencia en lm_produccion: el
// texto de alta se guarda como primer comentario, no hay columna aparte).
// INC_COMENTARIOS es append-only, así que el primero que aparece en la hoja
// para un idIncidencia YA es el más antiguo -- no hace falta ordenar por fecha.
function incpcLeerIndicaciones_(ss) {
  const mapa = {};
  const sheet = ss.getSheetByName("INCIDENCIAS_COMENTARIOS");
  if (!sheet || sheet.getLastRow() < 2) return mapa;
  const datos = sheet.getDataRange().getDisplayValues();
  const idx = incpcIndiceCabecera_(datos[0]);
  if (idx.idIncidencia === undefined || idx.rol === undefined || idx.texto === undefined) return mapa;
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const id = f[idx.idIncidencia];
    if (!id || mapa[id] !== undefined) continue; // ya tenemos el primero de esta incidencia
    if (String(f[idx.rol] || "") !== "admin") continue;
    mapa[id] = String(f[idx.texto] || "").trim();
  }
  return mapa;
}

// idIncidencia -> "3 artículos: 1 pendiente, 2 encontrados" (o '' si la
// incidencia no tiene checklist de artículos, p.ej. una SALDADA sin líneas).
function incpcLeerArticulosResumen_(ss) {
  const mapa = {};
  const sheet = ss.getSheetByName("INCIDENCIAS_ARTICULOS");
  if (!sheet || sheet.getLastRow() < 2) return mapa;
  const datos = sheet.getDataRange().getDisplayValues();
  const idx = incpcIndiceCabecera_(datos[0]);
  if (idx.idIncidencia === undefined || idx.estado === undefined) return mapa;
  const cuentas = {};
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const id = f[idx.idIncidencia];
    if (!id) continue;
    const c = cuentas[id] || (cuentas[id] = { total: 0, PENDIENTE: 0, ENCONTRADO: 0, NO_ENCONTRADO: 0 });
    c.total++;
    const estado = String(f[idx.estado] || "");
    if (c[estado] !== undefined) c[estado]++;
  }
  Object.keys(cuentas).forEach(function (id) {
    const c = cuentas[id];
    const partes = [];
    if (c.PENDIENTE) partes.push(c.PENDIENTE + " pendiente" + (c.PENDIENTE !== 1 ? "s" : ""));
    if (c.ENCONTRADO) partes.push(c.ENCONTRADO + " encontrado" + (c.ENCONTRADO !== 1 ? "s" : ""));
    if (c.NO_ENCONTRADO) partes.push(c.NO_ENCONTRADO + " no encontrado" + (c.NO_ENCONTRADO !== 1 ? "s" : ""));
    mapa[id] = c.total + " artículo" + (c.total !== 1 ? "s" : "") + (partes.length ? ": " + partes.join(", ") : "");
  });
  return mapa;
}

function incpcLeerHojaExterna_(ss, tz) {
  const sheet = ss.getSheetByName(CONFIG.LM_INCIDENCIAS_HOJA);
  if (!sheet || sheet.getLastRow() < 2) return [];
  // getValues (no getDisplayValues): así creadoTs/actualizado/resueltoTs se
  // pueden formatear bien salga como Date real o como texto ISO -- ver
  // incpcFormatoFecha_. El resto de columnas se fuerzan a String() al leerlas,
  // así que da igual si Sheets autodetectó alguna como número/fecha: nunca sale
  // un valor crudo hacia el cliente.
  const datos = sheet.getDataRange().getValues();
  const idx = incpcIndiceCabecera_(datos[0]);
  // Columnas mínimas para que la vista tenga sentido; si faltan, la hoja de
  // origen cambió de forma más profunda de lo esperado — mejor avisar que
  // enseñar una tabla a medias.
  ["id", "ped", "tienda", "tipo", "prioridad", "estado"].forEach(function (col) {
    if (!(col in idx)) throw new Error('La hoja INCIDENCIAS de Última Milla no tiene la columna "' + col + '" — puede que haya cambiado de forma.');
  });

  const indicaciones = incpcLeerIndicaciones_(ss);
  const articulos = incpcLeerArticulosResumen_(ss);

  const txt = function (f, col) { return idx[col] !== undefined ? String(f[idx[col]] || "") : ""; };

  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const id = txt(f, "id");
    const ped = txt(f, "ped");
    if (!ped) continue;
    let texto = indicaciones[id] || "";
    if (texto.length > INCPC_TEXTO_MAX_) texto = texto.slice(0, INCPC_TEXTO_MAX_).trim() + "…";
    filas.push({
      ped: ped,
      tienda: txt(f, "tienda"),
      tipo: txt(f, "tipo"),
      prioridad: txt(f, "prioridad"),
      estado: txt(f, "estado"),
      asignado: txt(f, "asignado"),
      ubicacionManual: txt(f, "ubicacionManual"),
      texto: texto,
      articulosResumen: articulos[id] || "",
      creadoTs: incpcFormatoFecha_(f[idx.creadoTs], tz),
      actualizado: incpcFormatoFecha_(f[idx.actualizado], tz),
      resueltoTs: incpcFormatoFecha_(f[idx.resueltoTs], tz)
    });
  }
  // Más reciente primero: en INCIDENCIAS solo se hace appendRow (nunca se
  // reordena ni se borran filas), así que la última fila es la última creada.
  return filas.reverse();
}

function incpcResumen_(filas) {
  const resumen = {};
  INCPC_ESTADOS_.forEach(function (e) { resumen[e] = 0; });
  filas.forEach(function (f) { resumen[f.estado] = (resumen[f.estado] || 0) + 1; });
  return resumen;
}

function incpcLeerCopia_() {
  try {
    const crudo = PropertiesService.getScriptProperties().getProperty(INCPC_PROP_COPIA_);
    return crudo ? JSON.parse(crudo) : null;
  } catch (e) {
    return null;
  }
}

function incpcGuardarCopia_(copia) {
  try {
    const texto = JSON.stringify(copia);
    if (texto.length > INCPC_COPIA_MAX_) { Logger.log("⚠️ Copia de incidencias PC demasiado grande (" + texto.length + "): no se guarda."); return; }
    PropertiesService.getScriptProperties().setProperty(INCPC_PROP_COPIA_, texto);
  } catch (e) {
    Logger.log("⚠️ No se pudo guardar la copia de incidencias PC: " + e.message);
  }
}

function obtenerIncidenciasPC() {
  const tz = Session.getScriptTimeZone();
  let ss = null;
  try {
    ss = SpreadsheetApp.openById(CONFIG.LM_INCIDENCIAS_SHEET_ID);
  } catch (e) {
    Logger.log("⚠️ Sin acceso a la hoja de Última Milla: " + e.message);
  }

  if (ss) {
    try {
      const filas = incpcLeerHojaExterna_(ss, tz);
      const actualizado = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm");
      const copia = { actualizado: actualizado, filas: filas };
      incpcGuardarCopia_(copia);
      return { ok: true, origen: "directo", actualizado: actualizado, filas: filas, resumen: incpcResumen_(filas) };
    } catch (e) {
      Logger.log("❌ Error leyendo incidencias PC: " + e.message);
      // Sigue probando la copia antes de rendirse del todo.
    }
  }

  const copia = incpcLeerCopia_();
  if (copia) {
    return { ok: true, origen: "copia", actualizado: copia.actualizado, filas: copia.filas, resumen: incpcResumen_(copia.filas) };
  }
  return { ok: false, error: "Tu cuenta no puede abrir la hoja de Última Milla y todavía no hay copia guardada. Que abra esta pestaña alguien con acceso (Pedro, José…) y quedará disponible para todos." };
}
