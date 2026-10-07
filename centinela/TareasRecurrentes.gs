// ============================================================
//  CENTINELA — TAREAS RECURRENTES (se asignan solas)
//  El supervisor crea una PLANTILLA una vez (título, a quién, prioridad y QUÉ DÍAS DE LA SEMANA).
//  Cada día que toca y que la plantilla esté Activa se crea una tarea NORMAL en la hoja Tareas, con
//  fecha límite = ese día (misma pieza que crearTarea: tarInsertarEnLock_). A partir de ahí es una
//  tarea como cualquier otra: se completa, se marca "no realizada" o se anula igual.
//
//  CUÁNDO SE GENERAN — ya no dependen de un disparador:
//    · Al abrir la app (cualquier jefe o el supervisor): generarTareasPendientesHoy() mira si hoy
//      falta algo por generar y, si sí, lo hace. Es idempotente: "Ultima Generada" + un bloqueo
//      garantizan que una plantilla no genera dos veces el mismo día aunque abran la app a la vez.
//    · Al crear/activar una plantilla o cambiarle los días: se genera al momento si hoy toca.
//    · Opcional: un disparador diario (generarTareasRecurrentesDiarias) para que estén listas antes
//      de que nadie abra la app. NO lo instala activarTareasRecurrentes() por sí solo: a este proyecto
//      le falta el permiso "script.scriptapp" en appsscript.json (ver esa función). Se puede crear a
//      mano: editor de Apps Script > Activadores > Añadir activador > generarTareasRecurrentesDiarias,
//      "Basado en tiempo", "Temporizador diario", 5 a 6.
//
//  AVISO POR CORREO: solo la PRIMERA vez que una plantilla genera su tarea (Ultima Generada vacía).
//  Los días siguientes, silencio. Ver TareasCorreo.gs.
//
//  Columnas de la hoja Tareas_Recurrentes (1-indexadas):
//  1 ID | 2 Titulo | 3 Descripcion | 4 Asignado a | 5 Prioridad | 6 Activa (Sí/No) |
//  7 Creada por | 8 Fecha Creacion | 9 Ultima Generada (dd/MM/yyyy, vacío = nunca) |
//  10 Dias (letras L M X J V S D; vacío = L-V, como las plantillas anteriores a esta columna) |
//  11 Pide Dato (etiqueta del dato que hay que escribir para completar cada tarea generada, p. ej. «Flete auditado») |
//  12 Desde (dd/MM/yyyy; primer día en que puede generar; vacío = ya)
//
//  ASIGNADO A: un jefe, "TODOS" (global) o "JEFE DE TARDE" (TAREA_JEFE_TARDE): cada día se asigna al jefe de equipo que
//  tenga turno T en el cuadrante ese día (el partido P no cuenta). Si no hay exactamente uno con T, o no se puede
//  leer el cuadrante y no hay copia de hoy, la tarea de ese día va a TODOS. La copia (propiedad trec_tarde_v1) se
//  guarda cada vez que se lee el cuadrante: así, si abre la app primero una cuenta sin acceso al cuadrante, se
//  reparte igualmente bien.
// ============================================================

const TREC_DIAS_ = "LMXJVSD";                 // en el orden de la semana; X = miércoles
const TREC_DIAS_POR_DEFECTO_ = "LMXJV";
const TREC_DIAS_PLURAL_ = { L: "lunes", M: "martes", X: "miércoles", J: "jueves", V: "viernes", S: "sábados", D: "domingos" };
const TREC_PROP_ESTADO_ = "trec_estado_v1";      // resumen de la última pasada (lo enseña el panel del supervisor)
const TREC_PROP_DIA_OK_ = "trec_dia_ok_v1";      // yyyy-MM-dd del último día en que la pasada terminó sin fallos
const TREC_PROP_INTENTO_ = "trec_intento_v1";    // ms del último intento que falló (para no reintentar en bucle)
const TREC_REINTENTO_MS_ = 30 * 60 * 1000;
const TREC_PROP_TARDE_ = "trec_tarde_v1";        // copia de qué jefes tienen turno de tarde los próximos días (yyyy-MM-dd -> [jefes])
const TREC_TARDE_DIAS_COPIA_ = 14;               // cuántos días por delante se guardan en esa copia
const TREC_ALIAS_TARDE_ = ["jefe de tarde", "jefe tarde", "tarde", "jefe de equipo de tarde"];

// ── Días de la semana ────────────────────────────────────────

// Cualquier cosa (array o texto) -> letras válidas, sin repetir y en orden de semana. "" si no hay ninguna.
function trecDiasCanonicos_(valor) {
  const crudo = Array.isArray(valor) ? valor.join("") : String(valor == null ? "" : valor);
  const marcadas = {};
  crudo.toUpperCase().split("").forEach(function (c) { if (TREC_DIAS_.indexOf(c) > -1) marcadas[c] = true; });
  return TREC_DIAS_.split("").filter(function (c) { return marcadas[c]; }).join("");
}

// Los días de una plantilla; una celda vacía (plantillas de antes de la columna) = lunes a viernes.
function trecDiasDe_(valor) {
  return trecDiasCanonicos_(valor) || TREC_DIAS_POR_DEFECTO_;
}

// "de lunes a viernes" / "todos los días" / "los lunes, miércoles y viernes"
function trecDiasTexto_(dias) {
  const d = trecDiasDe_(dias);
  if (d === TREC_DIAS_) return "todos los días";
  if (d === TREC_DIAS_POR_DEFECTO_) return "de lunes a viernes";
  const nombres = d.split("").map(function (c) { return TREC_DIAS_PLURAL_[c]; });
  const ultimo = nombres.pop();
  return "los " + (nombres.length ? nombres.join(", ") + " y " : "") + ultimo;
}

// Letra del día de la semana de `fecha` en la zona horaria del script.
function trecLetraDia_(fecha) {
  const n = parseInt(Utilities.formatDate(fecha, Session.getScriptTimeZone(), "u"), 10);   // 1 lunes … 7 domingo
  return TREC_DIAS_.charAt(n - 1);
}

// ── Hoja ─────────────────────────────────────────────────────

function trecObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_TAREAS_RECURRENTES, CABECERAS_TAREAS_RECURRENTES, prepararHojaTareasRecurrentes_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Tareas Recurrentes; inténtalo de nuevo." };
  return { sheet: sheet };
}

// Lectura tolerante (reutiliza los helpers de texto/nombre de Tareas.gs). "Activa" por
// defecto Sí: solo se considera inactiva si la celda dice explícitamente "No".
function trecLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const mesPrimero = tarSheetMesPrimero_(sheet);
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const idNum = parseInt(tarTexto_(f[0]), 10);
    const titulo = tarTexto_(f[1]);
    if (isNaN(idNum) || !titulo) continue;
    const desdeClave = tarClaveFecha_(tarTextoFecha_(f[11], false, mesPrimero));
    filas.push({
      fila: i + 1,
      id: idNum,
      titulo: titulo,
      descripcion: tarTexto_(f[2]),
      asignadoA: trecAsignado_(tarTexto_(f[3])),
      prioridad: tarPrioridadCanonica_(f[4]),
      activa: tarNormalizar_(f[5]) !== "no",
      creadaPor: tarTexto_(f[6]),
      fechaCreacion: tarTextoFecha_(f[7], false, mesPrimero),
      ultimaGenerada: tarTextoFecha_(f[8], false, mesPrimero),
      dias: trecDiasDe_(tarTexto_(f[9])),
      pide: tarTexto_(f[10]),
      desde: desdeClave === null ? "" : tarClaveATexto_(desdeClave),
      desdeClave: desdeClave
    });
  }
  return filas;
}

// "Asignado a" de una plantilla: un jefe (nombre canónico), "TODOS" o "JEFE DE TARDE" (también si lo escribieron a mano).
function trecAsignado_(texto) {
  if (TREC_ALIAS_TARDE_.indexOf(tarNormalizar_(texto)) > -1) return TAREA_JEFE_TARDE;
  return tarNombreCanonico_(texto);
}

function trecParaCliente_(r) {
  return {
    id: r.id, titulo: r.titulo, descripcion: r.descripcion, asignadoA: r.asignadoA,
    global: r.asignadoA === TAREA_GLOBAL, deTarde: r.asignadoA === TAREA_JEFE_TARDE, pide: r.pide, desde: r.desde,
    prioridad: r.prioridad, activa: r.activa,
    creadaPor: r.creadaPor, fechaCreacion: r.fechaCreacion, ultimaGenerada: r.ultimaGenerada,
    dias: r.dias, diasTexto: trecDiasTexto_(r.dias)
  };
}

// ── Estado de la última pasada (para que el supervisor vea qué ha pasado sin abrir el editor) ──

function trecGuardarEstado_(estado, completo, ahora) {
  try {
    const props = PropertiesService.getScriptProperties();
    const recorta = function (lista) {
      return lista.slice(0, 20).map(function (x) {
        const o = {};
        Object.keys(x).forEach(function (k) { o[k] = typeof x[k] === "string" ? x[k].slice(0, 140) : x[k]; });
        return o;
      });
    };
    props.setProperty(TREC_PROP_ESTADO_, JSON.stringify({
      dia: estado.dia, hora: estado.hora, origen: estado.origen, cuadrante: estado.cuadrante, error: estado.error,
      correos: estado.correos,
      nCreadas: estado.creadas.length, nSaltadas: estado.saltadas.length, nFallidas: estado.fallidas.length,
      creadas: recorta(estado.creadas), saltadas: recorta(estado.saltadas), fallidas: recorta(estado.fallidas)
    }));
    const hoyIso = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (completo) props.setProperty(TREC_PROP_DIA_OK_, hoyIso);
    else props.setProperty(TREC_PROP_INTENTO_, String(ahora.getTime()));
  } catch (e) {
    Logger.log("⚠️ No se pudo guardar el estado de las tareas recurrentes: " + e.message);
  }
}

function trecLeerEstado_() {
  try {
    const t = PropertiesService.getScriptProperties().getProperty(TREC_PROP_ESTADO_);
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return null;
  }
}

// ── API pública (google.script.run) ─────────────────────────

function obtenerTareasRecurrentes() {
  const h = trecObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const filas = trecLeer_(h.sheet).sort(function (a, b) { return a.id - b.id; });
  return { ok: true, plantillas: filas.map(trecParaCliente_), estado: trecLeerEstado_() };
}

// Valida lo que llega del cliente y lo deja limpio. Lanza Error con un mensaje para el usuario.
function trecValidarNueva_(data) {
  const titulo = String(data.titulo == null ? "" : data.titulo).replace(/\s+/g, " ").trim();
  if (!titulo) throw new Error("El título es obligatorio.");
  if (titulo.length > TAREA_MAX_TITULO) throw new Error("El título es demasiado largo (máximo " + TAREA_MAX_TITULO + " caracteres).");
  const descripcion = tarLimpiarLargo_(data.descripcion, TAREA_MAX_DESCRIPCION, "La descripción");

  if (!data.asignado_a) throw new Error("Elige a qué jefe de equipo se asigna.");
  let asignadoA = data.asignado_a;
  if (TREC_ALIAS_TARDE_.indexOf(tarNormalizar_(asignadoA)) > -1) asignadoA = TAREA_JEFE_TARDE;
  if (asignadoA !== TAREA_GLOBAL && asignadoA !== TAREA_JEFE_TARDE && JEFES_EQUIPO.indexOf(asignadoA) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.asignado_a);
  }
  const pide = tarLimpiarPide_(data.pide);
  const prioridad = data.prioridad || "Normal";
  if (prioridad !== "Normal" && prioridad !== "Alta") throw new Error("Prioridad no válida: " + prioridad);
  // Días: los que manda el cliente; si no manda ninguno, lunes a viernes. Sin ningún día válido no tiene sentido.
  const dias = data.dias === undefined || data.dias === null ? TREC_DIAS_POR_DEFECTO_ : trecDiasCanonicos_(data.dias);
  if (!dias) throw new Error("Elige al menos un día de la semana.");
  // «Empieza el»: opcional. Una fecha que ya pasó (p. ej. una petición aprobada días después) equivale a empezar ya.
  let desde = "";
  const desdeEntrada = String(data.desde == null ? "" : data.desde).trim();
  if (desdeEntrada) {
    const clave = tarClaveFecha_(desdeEntrada);
    if (clave === null) throw new Error("La fecha en la que empieza no es válida.");
    if (Math.floor(clave / 10000) > Math.floor(tarHoyClave_() / 10000) + 1) throw new Error("La fecha en la que empieza está demasiado lejos.");
    if (clave >= tarHoyClave_()) desde = tarClaveATexto_(clave);
  }
  return { titulo: titulo, descripcion: descripcion, asignadoA: asignadoA, prioridad: prioridad, dias: dias, pide: pide, desde: desde };
}

function trecNombreDestino_(asignadoA) {
  if (asignadoA === TAREA_GLOBAL) return "todos los jefes";
  if (asignadoA === TAREA_JEFE_TARDE) return "el jefe de tarde";
  return asignadoA;
}

function crearTareaRecurrente(data) {
  Logger.log("📥 Nueva tarea recurrente");
  if (!data) throw new Error("No se han recibido datos.");
  const v = trecValidarNueva_(data);

  // Una plantilla recurrente de un mando espera el visto bueno del jefe de área (ver Aprobaciones.gs).
  const perfil = perfilActual_();
  if (perfilNecesitaAprobacion_("recurrentes", perfil)) {
    return apSolicitarYResponder_("recurrente", v.titulo,
      { titulo: v.titulo, descripcion: v.descripcion, asignado_a: v.asignadoA, prioridad: v.prioridad, dias: v.dias, pide: v.pide, desde: v.desde }, "", perfil);
  }
  const r = trecCrearValidada_(v, perfilCreador_(perfil, data.creador));
  if (r.success) actividadRegistrar_("recurrente", "Plantilla #" + r.id + " «" + v.titulo + "» → " + trecNombreDestino_(v.asignadoA) + " · " + trecDiasTexto_(v.dias) + (v.pide ? " · pide: " + v.pide : "") + (v.desde ? " · desde el " + v.desde : ""), perfil);
  return r;
}

// Crea la plantilla ya validada (sin pedir aprobación: eso se decide antes) y, si hoy toca, genera su tarea.
function trecCrearValidada_(v, creador) {
  const h = trecObtenerHoja_();
  if (h.error) return { success: false, error: h.error };

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  let nuevoId;
  try {
    const filas = trecLeer_(h.sheet);
    let maxId = 0;
    filas.forEach(function (r) { if (r.id > maxId) maxId = r.id; });
    nuevoId = maxId + 1;
    const hoyTxt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    // Sin appendRow: la fila se pone en «texto sin formato» ANTES de escribirla (si no, en una hoja con idioma mes/día
    // «08/10/2026» se guardaría como fecha del 10 de agosto).
    const filaN = h.sheet.getLastRow() + 1;
    if (filaN > h.sheet.getMaxRows()) h.sheet.insertRowsAfter(h.sheet.getMaxRows(), 1);
    h.sheet.getRange(filaN, 2, 1, 11).setNumberFormat("@");
    h.sheet.getRange(filaN, 1, 1, 12).setValues([[nuevoId, v.titulo, v.descripcion, v.asignadoA, v.prioridad, "Sí", creador || "Supervisor", hoyTxt, "", v.dias, v.pide || "", v.desde || ""]]);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("❌ Error creando tarea recurrente: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }

  // Si hoy es uno de sus días, se genera ya (y se avisa por correo): así no hay que esperar a mañana.
  const gen = tareasAutoGenerar_("plantilla");
  return trecRespuestaConGeneracion_({ success: true, id: nuevoId, dias: v.dias, diasTexto: trecDiasTexto_(v.dias), desde: v.desde || "" }, gen, nuevoId);
}

// Añade a la respuesta de una acción sobre la plantilla `id` lo que pasó al generar: si generó hoy,
// si el correo salió y, si no generó, por qué (para que el mensaje al supervisor sea exacto).
function trecRespuestaConGeneracion_(resp, gen, id) {
  const propia = gen.creadas.filter(function (c) { return c.plantilla === id; })[0];
  resp.generadaHoy = !!propia;
  if (propia) {
    resp.correoEnviado = propia.correo === undefined ? null : propia.correo;   // true/false; null = no tocaba avisar (ya había generado otros días)
  } else {
    const saltada = gen.saltadas.filter(function (s) { return s.plantilla === id; })[0];
    if (saltada) resp.motivoNoHoy = saltada.motivo;
    const fallida = gen.fallidas.filter(function (s) { return s.plantilla === id; })[0];
    if (fallida) resp.errorGenerando = fallida.error;
  }
  if (gen.error) resp.errorGenerando = gen.error;
  return resp;
}

// Activa/desactiva una plantilla. No se borra (queda como historial de lo que existió);
// desactivada deja de generar tareas nuevas pero las ya generadas siguen su curso normal.
function activarDesactivarTareaRecurrente(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") {
    throw new Error("Falta la tarea recurrente.");
  }
  // Desactivar (parar el ruido) puede hacerlo cualquier mando; ACTIVAR, solo el jefe de área.
  if (data.activa === true || data.activa === "Sí") {
    const bloqueo = trecBloqueoMando_("activar plantillas recurrentes");
    if (bloqueo) return bloqueo;
  }
  const h = trecObtenerHoja_();
  if (h.error) return { success: false, error: h.error };

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  let idNum, activa;
  try {
    const buscado = String(data.id).trim();
    const r = trecLeer_(h.sheet).filter(function (x) { return String(x.id) === buscado; })[0];
    if (!r) return { success: false, error: "Tarea recurrente no encontrada." };
    idNum = r.id;
    const nuevaActiva = (data.activa === true || data.activa === "Sí") ? "Sí" : "No";
    h.sheet.getRange(r.fila, 6).setValue(nuevaActiva);
    SpreadsheetApp.flush();
    activa = nuevaActiva === "Sí";
  } catch (e) {
    Logger.log("❌ Error activando/desactivando tarea recurrente: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
  actividadRegistrar_("recurrente", "Plantilla #" + idNum + (activa ? " activada" : " desactivada"));
  const resp = { success: true, activa: activa };
  if (!activa) return resp;
  return trecRespuestaConGeneracion_(resp, tareasAutoGenerar_("plantilla"), idNum);
}

// Si quien llama es un mando (no el jefe de área) y la regla de recurrentes está activa, no puede cambiar plantillas
// ya aprobadas: devuelve la respuesta de error lista para enviar; "" si puede seguir.
function trecBloqueoMando_(que) {
  if (!perfilNecesitaAprobacion_("recurrentes")) return "";
  return { success: false, error: "Solo " + perfilNombreArea_() + " (jefe de área) puede " + que + ". Si hace falta, pídeselo o crea una plantilla nueva (irá a su aprobación)." };
}

// Cambia los días de la semana de una plantilla ya creada. data = { id, dias: ["L","X"] o "LX" }
function actualizarDiasTareaRecurrente(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") {
    throw new Error("Falta la tarea recurrente.");
  }
  const dias = trecDiasCanonicos_(data.dias);
  if (!dias) throw new Error("Elige al menos un día de la semana.");
  const bloqueo = trecBloqueoMando_("cambiar los días de una plantilla recurrente");
  if (bloqueo) return bloqueo;
  const h = trecObtenerHoja_();
  if (h.error) return { success: false, error: h.error };

  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  let idNum, activa;
  try {
    const buscado = String(data.id).trim();
    const r = trecLeer_(h.sheet).filter(function (x) { return String(x.id) === buscado; })[0];
    if (!r) return { success: false, error: "Tarea recurrente no encontrada." };
    idNum = r.id;
    activa = r.activa;
    h.sheet.getRange(r.fila, 10).setValue(dias);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log("❌ Error cambiando los días de una tarea recurrente: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
  actividadRegistrar_("recurrente", "Plantilla #" + idNum + ": días → " + trecDiasTexto_(dias));
  const resp = { success: true, dias: dias, diasTexto: trecDiasTexto_(dias) };
  if (!activa) return resp;
  return trecRespuestaConGeneracion_(resp, tareasAutoGenerar_("plantilla"), idNum);
}

// ── Sin vacaciones/bajas de los jefes ────────────────────────
// Se mira el mismo cuadrante de turnos que la pestaña Turnos (CONFIG.CUADRANTE_SHEET_ID,
// hoja "Turnos": tsemLeerTurnos_ de TurnosSemana.gs). Solo cuentan como "trabaja" los
// códigos de turno reales (M/T/P, con o sin "+2h" etc.): vacío, V, VV, B, A, PR o
// cualquier código que no reconozcamos = no trabaja. Un festivo no tiene código propio:
// simplemente ese día no hay turno para nadie, así que ya queda cubierto igual.
const TREC_CODIGOS_TRABAJA_ = ["M", "T", "P"];

function trecPrimerToken_(valor) {
  const t = String(valor == null ? "" : valor).trim();
  return t ? t.split(/\s+/)[0].toUpperCase() : "";
}

// El nombre en el cuadrante puede venir con algún apellido de más o alguna letra distinta
// (p.ej. "Gelvis" aquí y "GELVIS" o una grafía distinta allí): compara por los primeros 4 caracteres de cada palabra.
function trecNombreCoincide_(nombreJefe, nombreCuadrante) {
  const palabras = tarNormalizar_(nombreJefe).split(" ").filter(function (p) { return p; });
  const texto = tarNormalizar_(nombreCuadrante);
  return palabras.every(function (p) { return texto.indexOf(p.slice(0, Math.min(4, p.length))) > -1; });
}

// { "<nombre de JEFES_EQUIPO>": "<id en el cuadrante>" }, buscando por nombre en la hoja
// "Personal" del cuadrante (esa hoja SÍ incluye a los mandos; la de Centinela es otra distinta).
function trecIdsJefesEnCuadrante_(ss) {
  const sh = ss.getSheetByName("Personal");
  if (!sh || sh.getLastRow() < 2) return {};
  const filas = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();   // A=ID, B=Nombre Completo
  const mapa = {};
  JEFES_EQUIPO.forEach(function (jefe) {
    const fila = filas.filter(function (f) { return f[0] && trecNombreCoincide_(jefe, f[1]); })[0];
    if (fila) mapa[jefe] = String(fila[0]).trim();
  });
  return mapa;
}

// true si ese id tiene turno de trabajo real ese día; false si consta vacaciones/baja/
// asuntos/permiso/libre/vacío. `turnosMapa` = tsemLeerTurnos_(ss) (de TurnosSemana.gs).
function trecTrabajaEseDia_(turnosMapa, id, fechaIso) {
  const valor = turnosMapa[id + "_" + fechaIso];
  if (valor === undefined) return false;   // sin turno publicado ese día
  return TREC_CODIGOS_TRABAJA_.indexOf(trecPrimerToken_(valor)) > -1;
}

// Código de turno de ese id ese día ("M", "T", "P"…; "" si no hay), en mayúsculas y sin el «+2h».
function trecCodigoDia_(turnosMapa, id, fechaIso) {
  return trecPrimerToken_(turnosMapa[id + "_" + fechaIso]);
}

// yyyy-MM-dd + n días (sin zonas horarias: solo calendario).
function trecSumarDiasIso_(iso, n) {
  const p = String(iso).split("-");
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
}

// Qué jefes tienen turno de TARDE (T) cada uno de los próximos días, para repartir bien la tarea del «jefe de
// tarde» aunque la abra primero una cuenta que no puede leer el cuadrante. Solo se guardan los días con algún turno
// publicado para los jefes (si no, «nadie con T» no se distinguiría de «cuadrante aún sin publicar»).
function trecGuardarCopiaTarde_(ids, turnosMapa, hoyIso) {
  try {
    const dias = {};
    for (let k = 0; k < TREC_TARDE_DIAS_COPIA_; k++) {
      const iso = trecSumarDiasIso_(hoyIso, k);
      const codigos = JEFES_EQUIPO.map(function (j) { return ids[j] ? trecCodigoDia_(turnosMapa, ids[j], iso) : ""; });
      if (!codigos.some(function (c) { return c; })) continue;
      dias[iso] = JEFES_EQUIPO.filter(function (j) { return ids[j] && trecCodigoDia_(turnosMapa, ids[j], iso) === "T"; });
    }
    PropertiesService.getScriptProperties().setProperty(TREC_PROP_TARDE_, JSON.stringify({ dias: dias }));
  } catch (e) {
    Logger.log("⚠️ No se pudo guardar la copia de los turnos de tarde: " + e.message);
  }
}

// Jefes con turno de tarde ese día según la copia guardada, o null si no hay copia de ese día.
function trecLeerCopiaTarde_(iso) {
  try {
    const crudo = PropertiesService.getScriptProperties().getProperty(TREC_PROP_TARDE_);
    if (!crudo) return null;
    const c = JSON.parse(crudo);
    return c && c.dias && Array.isArray(c.dias[iso]) ? c.dias[iso] : null;
  } catch (e) {
    return null;
  }
}

// { porJefe, leido, tardes }. porJefe[jefe]: true trabaja, false consta ausente, null no se pudo saber
// (jefe no encontrado en el cuadrante — se genera igual, no se le penaliza por eso). leido=false si
// la cuenta que ejecuta no pudo abrir el cuadrante: entonces nadie se filtra. tardes = jefes con turno T hoy
// (solo si se leyó el cuadrante).
function trecEstadoJefesHoy_(fechaIso) {
  const porJefe = {};
  let leido = true;
  let tardes = [];
  try {
    const ss = SpreadsheetApp.openById(CONFIG.CUADRANTE_SHEET_ID);
    const ids = trecIdsJefesEnCuadrante_(ss);
    const turnosMapa = tsemLeerTurnos_(ss);
    JEFES_EQUIPO.forEach(function (jefe) {
      const id = ids[jefe];
      porJefe[jefe] = id ? trecTrabajaEseDia_(turnosMapa, id, fechaIso) : null;
    });
    tardes = JEFES_EQUIPO.filter(function (jefe) { return ids[jefe] && trecCodigoDia_(turnosMapa, ids[jefe], fechaIso) === "T"; });
    trecGuardarCopiaTarde_(ids, turnosMapa, fechaIso);
  } catch (e) {
    // Sin acceso al cuadrante: se genera para todos sin filtrar (mejor de más que dejar de avisar).
    Logger.log("⚠️ Tareas recurrentes: no se pudo leer el cuadrante de turnos (" + e.message + "); hoy se genera sin filtrar vacaciones/bajas.");
    JEFES_EQUIPO.forEach(function (jefe) { porJefe[jefe] = null; });
    leido = false;
    tardes = [];
  }
  return { porJefe: porJefe, leido: leido, tardes: tardes };
}

// A quién va hoy una plantilla «JEFE DE TARDE». { asignado, motivo }: el jefe con turno T si hay exactamente uno;
// si no (nadie, varios, cuadrante ilegible sin copia de hoy), TODOS y el motivo.
function trecResolverTarde_(cuad, hoyIso) {
  let tardes = null;
  if (cuad.leido) tardes = cuad.tardes;
  else tardes = trecLeerCopiaTarde_(hoyIso);
  if (!tardes) return { asignado: TAREA_GLOBAL, motivo: "no se pudo leer el cuadrante de turnos" };
  if (tardes.length === 1) return { asignado: tardes[0], motivo: "" };
  return { asignado: TAREA_GLOBAL, motivo: tardes.length ? "hay varios jefes con turno de tarde" : "ningún jefe tiene turno de tarde hoy" };
}

// Global (TODOS) y «jefe de tarde»: basta con que uno trabaje (o no se sepa de ninguno) para generarla.
// Un jefe concreto: se genera salvo que conste explícitamente ausente ese día.
function trecDebeGenerarHoy_(r, estadoJefes) {
  if (r.asignadoA === TAREA_GLOBAL || r.asignadoA === TAREA_JEFE_TARDE) {
    return Object.keys(estadoJefes).length === 0 || Object.keys(estadoJefes).some(function (j) { return estadoJefes[j] !== false; });
  }
  return estadoJefes[r.asignadoA] !== false;
}

// Plantillas que hoy hay que generar: activas, de un día que toca, que ya han empezado («Desde») y aún no generadas hoy.
function trecCandidatas_(plantillas, hoyTxt, letra, hoyClave) {
  return plantillas.filter(function (r) {
    return r.activa && r.ultimaGenerada !== hoyTxt && r.dias.indexOf(letra) > -1 && (r.desdeClave === null || r.desdeClave <= hoyClave);
  });
}

// ── Generación ───────────────────────────────────────────────
// Núcleo único: recurrentes de hoy + programadas que ya tocan. `origen`: "trigger" | "app" | "manual" |
// "plantilla" (solo para el log/estado). Lo llaman el disparador opcional, la app al abrirse y las acciones
// del supervisor sobre las plantillas. Devuelve el estado de la pasada (nunca lanza).
//
// Orden: hojas (crean bajo su propio bloqueo, por eso ANTES) -> cuadrante (lento, sin bloqueo) -> UN
// bloqueo que envuelve releer + insertar + marcar -> correos (fuera del bloqueo). Se marca la plantilla
// ANTES de insertar y se deshace si insertar falla: en el peor caso un día sin tarea, jamás dos.
function tareasAutoGenerar_(origen) {
  const tz = Session.getScriptTimeZone();
  const ahora = new Date();
  const hoyTxt = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
  const hoyIso = Utilities.formatDate(ahora, tz, "yyyy-MM-dd");
  const hoyClave = tarHoyClave_();
  const letra = trecLetraDia_(ahora);
  const estado = {
    dia: hoyTxt, hora: Utilities.formatDate(ahora, tz, "HH:mm"), origen: origen,
    creadas: [], saltadas: [], fallidas: [], correos: { ok: 0, fallo: 0 }, cuadrante: "", error: ""
  };
  const abortar = function (msg) {
    estado.error = msg;
    Logger.log("❌ Tareas automáticas: " + msg);
    trecGuardarEstado_(estado, false, ahora);
    return estado;
  };

  try {
    const hr = trecObtenerHoja_();
    if (hr.error) return abortar(hr.error);
    const ht = tarObtenerHoja_();
    if (ht.error) return abortar(ht.error);
    const hp = tprObtenerHoja_();
    if (hp.error) return abortar(hp.error);

    // ¿Hay algo que hacer? (lectura sin bloqueo; dentro se vuelve a comprobar)
    const hayRecurrentes = trecCandidatas_(trecLeer_(hr.sheet), hoyTxt, letra, hoyClave).length > 0;
    const hayProgramadas = tprLeer_(hp.sheet).some(function (p) { return tprDebeAplicar_(p, hoyClave); });
    if (!hayRecurrentes && !hayProgramadas) {
      trecGuardarEstado_(estado, true, ahora);
      return estado;
    }
    let cuad = { porJefe: {}, leido: true };
    if (hayRecurrentes) {
      cuad = trecEstadoJefesHoy_(hoyIso);
      estado.cuadrante = cuad.leido ? "ok" : "sin acceso: se genera sin filtrar vacaciones/bajas";
    }

    const lock = tarTomarLock_();
    if (!lock) return abortar("No se pudo obtener el bloqueo; se reintentará.");
    const aAvisar = [];
    try {
      trecCandidatas_(trecLeer_(hr.sheet), hoyTxt, letra, hoyClave).forEach(function (r) {
        const esTarde = r.asignadoA === TAREA_JEFE_TARDE;
        const resumen = { plantilla: r.id, titulo: r.titulo, asignadoA: r.asignadoA };
        if (!trecDebeGenerarHoy_(r, cuad.porJefe)) {
          estado.saltadas.push({ plantilla: r.id, titulo: r.titulo, motivo: ((r.asignadoA === TAREA_GLOBAL || esTarde) ? "ningún jefe" : r.asignadoA) + " no trabaja hoy según el cuadrante (vacaciones, baja o libre)" });
          Logger.log("⏭️ Tareas recurrentes: #" + r.id + " (" + r.titulo + ") no se genera hoy: " + r.asignadoA + " no trabaja.");
          return;
        }
        // «Jefe de tarde»: hoy va al jefe con turno T en el cuadrante (o a TODOS si no se puede saber quién).
        let asignadoHoy = r.asignadoA;
        if (esTarde) {
          const res = trecResolverTarde_(cuad, hoyIso);
          asignadoHoy = res.asignado;
          resumen.asignadoA = asignadoHoy;
          resumen.deTarde = true;
          if (res.motivo) resumen.motivoAsignacion = res.motivo;
        }
        const anterior = r.ultimaGenerada;
        try {
          hr.sheet.getRange(r.fila, 9).setNumberFormat("@").setValue(hoyTxt);
        } catch (e) {
          estado.fallidas.push({ plantilla: r.id, titulo: r.titulo, error: "No se pudo marcar la plantilla: " + e.message });
          return;
        }
        try {
          // ¿Es la primera vez que ESTA persona recibe esta tarea? (la plantilla puede ir rotando de jefe)
          const primeraParaEste = anterior === "" || (esTarde && !tarLeer_(ht.sheet).some(function (x) { return x.titulo === r.titulo && x.asignadoA === asignadoHoy; }));
          const idTarea = tarInsertarEnLock_(ht.sheet, null, { titulo: r.titulo, descripcion: r.descripcion, asignadoA: asignadoHoy, prioridad: r.prioridad, limiteTxt: hoyTxt, foto: "", pide: r.pide });
          resumen.tarea = idTarea;
          resumen.primera = primeraParaEste;
          estado.creadas.push(resumen);
          aAvisar.push({
            tipo: "recurrente", primera: primeraParaEste, plantilla: r.id, ref: resumen,
            t: { id: idTarea, titulo: r.titulo, descripcion: r.descripcion, asignadoA: asignadoHoy, prioridad: r.prioridad, fechaLimite: hoyTxt, tipo: "recurrente", dias: r.dias, pide: r.pide, deTarde: esTarde && asignadoHoy !== TAREA_GLOBAL }
          });
        } catch (e) {
          try { hr.sheet.getRange(r.fila, 9).setNumberFormat("@").setValue(anterior); } catch (e2) { Logger.log("⚠️ No se pudo deshacer la marca de la plantilla #" + r.id + ": " + e2.message); }
          estado.fallidas.push({ plantilla: r.id, titulo: r.titulo, error: e.message });
          Logger.log("❌ No se pudo generar la tarea recurrente #" + r.id + " (" + r.titulo + "): " + e.message);
        }
      });

      tprLeer_(hp.sheet).filter(function (p) { return tprDebeAplicar_(p, hoyClave); }).forEach(function (p) {
        const resumen = { programada: p.id, titulo: p.titulo, asignadoA: p.asignadoA };
        // Si el día límite ya pasó (se aplica tarde, p. ej. porque nadie abrió la app), vence hoy en vez de nacer vencida.
        const limiteTxt = (p.limiteClave !== null && p.limiteClave < hoyClave) ? hoyTxt : p.limiteTxt;
        try {
          hp.sheet.getRange(p.fila, 8).setValue("Aplicada");
        } catch (e) {
          estado.fallidas.push({ programada: p.id, titulo: p.titulo, error: "No se pudo marcar la tarea programada: " + e.message });
          return;
        }
        try {
          const idTarea = tarInsertarEnLock_(ht.sheet, null, { titulo: p.titulo, descripcion: p.descripcion, asignadoA: p.asignadoA, prioridad: p.prioridad, limiteTxt: limiteTxt, foto: "" });
          hp.sheet.getRange(p.fila, 11, 1, 2).setValues([[hoyTxt, idTarea]]);
          resumen.tarea = idTarea;
          estado.creadas.push(resumen);
          aAvisar.push({
            tipo: "programada", programada: p.id, ref: resumen,
            t: { id: idTarea, titulo: p.titulo, descripcion: p.descripcion, asignadoA: p.asignadoA, prioridad: p.prioridad, fechaLimite: limiteTxt, tipo: "programada", creador: p.creadaPor }
          });
        } catch (e) {
          try { hp.sheet.getRange(p.fila, 8).setValue("Programada"); } catch (e2) { Logger.log("⚠️ No se pudo deshacer la tarea programada #" + p.id + ": " + e2.message); }
          estado.fallidas.push({ programada: p.id, titulo: p.titulo, error: e.message });
          Logger.log("❌ No se pudo aplicar la tarea programada #" + p.id + " (" + p.titulo + "): " + e.message);
        }
      });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // Correos ya sin bloqueo. Una plantilla que ya generó otros días no vuelve a avisar.
    aAvisar.forEach(function (a) {
      if (a.tipo === "recurrente" && !a.primera) { a.ref.correo = null; return; }
      const ok = tarEnviarCorreoNueva_(a.t);
      a.ref.correo = ok;
      if (ok) estado.correos.ok++; else estado.correos.fallo++;
    });

    const completo = estado.fallidas.length === 0 && !estado.error;
    trecGuardarEstado_(estado, completo, ahora);
    Logger.log("🔁 Tareas automáticas " + hoyTxt + " (" + origen + "): " + estado.creadas.length + " creada(s), " + estado.saltadas.length + " saltada(s), " + estado.fallidas.length + " fallida(s); correos " + estado.correos.ok + " ok / " + estado.correos.fallo + " fallo.");
    return estado;
  } catch (e) {
    return abortar(e.message);
  }
}

// Lo llama la app al abrirse (jefes y supervisor): garantiza que hoy están generadas las tareas que tocan,
// aunque no exista disparador. Barato cuando ya está todo hecho (una propiedad); si algo falló, no reintenta
// más de una vez cada 30 min. data.forzar (botón del panel del supervisor) se salta esos atajos.
function generarTareasPendientesHoy(data) {
  const forzar = !!(data && data.forzar);
  const ahora = new Date();
  if (!forzar) {
    const props = PropertiesService.getScriptProperties();
    const hoyIso = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (props.getProperty(TREC_PROP_DIA_OK_) === hoyIso) return { ok: true, omitido: true, creadas: 0, saltadas: 0, fallidas: 0 };
    const ult = Number(props.getProperty(TREC_PROP_INTENTO_) || 0);
    const pasado = ahora.getTime() - ult;
    if (ult && pasado >= 0 && pasado < TREC_REINTENTO_MS_) return { ok: true, omitido: true, creadas: 0, saltadas: 0, fallidas: 0 };
  }
  const e = tareasAutoGenerar_(forzar ? "manual" : "app");
  const resp = {
    ok: !e.error,
    creadas: e.creadas.length, saltadas: e.saltadas.length, fallidas: e.fallidas.length, correosFallidos: e.correos.fallo
  };
  if (e.error) resp.error = e.error;     // solo si hay error: el cliente distingue ok/fallo y el test comprueba las claves exactas
  return resp;
}

// Punto de entrada del disparador diario OPCIONAL (ver la cabecera). Mismo trabajo que al abrir la app.
function generarTareasRecurrentesDiarias() {
  tareasAutoGenerar_("trigger");
}

// Instalador del disparador diario. OJO: necesita el permiso "script.scriptapp", que appsscript.json NO
// declara (lista los permisos a mano), así que ejecutarlo da "no tienes permiso para llamar a
// ScriptApp.getProjectTriggers". No hace falta: las tareas se generan al abrir la app. Si se quiere un
// disparador a las 5:00, crearlo a mano en Activadores (ver la cabecera). Añadir ese permiso al manifiesto
// obligaría a TODOS los usuarios a volver a autorizar la app, por eso no se ha hecho.
function activarTareasRecurrentes() {
  try {
    const existentes = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === "generarTareasRecurrentesDiarias";
    });
    existentes.forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger("generarTareasRecurrentesDiarias").timeBased().everyDays(1).atHour(5).nearMinute(0).create();
    Logger.log("✅ Disparador diario instalado: generarTareasRecurrentesDiarias se ejecutará todos los días sobre las 05:00.");
  } catch (e) {
    Logger.log("⚠️ No se pudo instalar el disparador (" + e.message + "). No es necesario: las tareas recurrentes se generan solas al abrir la app. " +
      "Si quieres uno a las 5:00, créalo a mano en Activadores > Añadir activador > generarTareasRecurrentesDiarias > Basado en tiempo > Temporizador diario.");
  }
}
