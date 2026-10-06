// ============================================================
//  CENTINELA — TAREAS PROGRAMADAS (para el futuro)
//  El supervisor crea una tarea eligiendo el DÍA en que debe aplicarse. Queda guardada (y a la vista del
//  supervisor, que puede cancelarla) pero no llega a los jefes ni se les avisa hasta ese día: entonces la
//  generación automática (TareasRecurrentes.gs, tareasAutoGenerar_) la convierte en una tarea normal de la
//  hoja Tareas y manda el correo de "tarea programada, activa hoy". Si nadie abre la app justo ese día se
//  aplica en cuanto alguien la abra (fecha <= hoy), no se pierde.
//
//  Columnas de la hoja Tareas_Programadas (1-indexadas):
//  1 ID | 2 Titulo | 3 Descripcion | 4 Asignado a | 5 Prioridad | 6 Fecha Aplicar (dd/MM/yyyy) |
//  7 Fecha Limite (dd/MM/yyyy o vacío) | 8 Estado (Programada/Aplicada/Cancelada) | 9 Creada por |
//  10 Fecha Creacion | 11 Fecha Aplicada | 12 ID Tarea (la tarea real que se creó)
// ============================================================

const TPR_MAX_DIAS_ADELANTE_ = 366;
const TPR_RECIENTES_ = 10;

function tprObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_TAREAS_PROGRAMADAS, CABECERAS_TAREAS_PROGRAMADAS, prepararHojaTareasProgramadas_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Tareas Programadas; inténtalo de nuevo." };
  return { sheet: sheet };
}

function tprEstadoCanonico_(valor) {
  const s = tarNormalizar_(valor);
  if (s.indexOf("aplic") === 0) return "Aplicada";
  if (s.indexOf("cancel") === 0 || s.indexOf("anul") === 0) return "Cancelada";
  return "Programada";
}

// Lectura tolerante: una fila escrita a mano puede traer las fechas en otro formato.
function tprLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const idNum = parseInt(tarTexto_(f[0]), 10);
    const titulo = tarTexto_(f[1]);
    if (isNaN(idNum) || !titulo) continue;
    const aplicarClave = tarClaveFecha_(tarTexto_(f[5], "dd/MM/yyyy"));
    const limiteClave = tarClaveFecha_(tarTexto_(f[6], "dd/MM/yyyy"));
    filas.push({
      fila: i + 1,
      id: idNum,
      titulo: titulo,
      descripcion: tarTexto_(f[2]),
      asignadoA: tarNombreCanonico_(tarTexto_(f[3])),
      prioridad: tarPrioridadCanonica_(f[4]),
      aplicarClave: aplicarClave,
      aplicarTxt: aplicarClave !== null ? tarClaveATexto_(aplicarClave) : tarTexto_(f[5], "dd/MM/yyyy"),
      limiteClave: limiteClave,
      limiteTxt: limiteClave !== null ? tarClaveATexto_(limiteClave) : "",
      estado: tprEstadoCanonico_(f[7]),
      creadaPor: tarTexto_(f[8]),
      fechaCreacion: tarTexto_(f[9], "dd/MM/yyyy"),
      fechaAplicada: tarTexto_(f[10], "dd/MM/yyyy"),
      idTarea: tarTexto_(f[11])
    });
  }
  return filas;
}

// ¿Le toca aplicarse hoy (o le tocó antes y no se aplicó)? Una fecha ilegible nunca se aplica sola.
function tprDebeAplicar_(p, hoyClave) {
  return p.estado === "Programada" && p.aplicarClave !== null && p.aplicarClave <= hoyClave;
}

function tprParaCliente_(p) {
  return {
    id: p.id, titulo: p.titulo, descripcion: p.descripcion, asignadoA: p.asignadoA,
    global: p.asignadoA === TAREA_GLOBAL, prioridad: p.prioridad, aplicar: p.aplicarTxt, limite: p.limiteTxt,
    estado: p.estado, creadaPor: p.creadaPor, fechaCreacion: p.fechaCreacion, fechaAplicada: p.fechaAplicada, idTarea: p.idTarea
  };
}

// yyyymmdd + n días -> yyyymmdd
function tprClaveMasDias_(clave, dias) {
  const f = new Date(Date.UTC(Math.floor(clave / 10000), (Math.floor(clave / 100) % 100) - 1, (clave % 100) + dias));
  return f.getUTCFullYear() * 10000 + (f.getUTCMonth() + 1) * 100 + f.getUTCDate();
}

// ── API pública (google.script.run) ─────────────────────────

function obtenerTareasProgramadas() {
  const h = tprObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const todas = tprLeer_(h.sheet);
  const pendientes = todas.filter(function (p) { return p.estado === "Programada"; })
    .sort(function (a, b) {
      const ka = a.aplicarClave === null ? Infinity : a.aplicarClave, kb = b.aplicarClave === null ? Infinity : b.aplicarClave;
      return ka !== kb ? (ka < kb ? -1 : 1) : a.id - b.id;
    });
  const recientes = todas.filter(function (p) { return p.estado !== "Programada"; })
    .sort(function (a, b) { return b.fila - a.fila; }).slice(0, TPR_RECIENTES_);
  return { ok: true, pendientes: pendientes.map(tprParaCliente_), recientes: recientes.map(tprParaCliente_) };
}

// Valida lo que llega del cliente y lo deja limpio. Lanza Error con un mensaje para el usuario.
// data = { titulo, descripcion, asignado_a, prioridad, fecha_aplicar, fecha_limite (opcional) }
function tprValidarNueva_(data) {
  const titulo = String(data.titulo == null ? "" : data.titulo).replace(/\s+/g, " ").trim();
  if (!titulo) throw new Error("El título es obligatorio.");
  if (titulo.length > TAREA_MAX_TITULO) throw new Error("El título es demasiado largo (máximo " + TAREA_MAX_TITULO + " caracteres).");
  const descripcion = tarLimpiarLargo_(data.descripcion, TAREA_MAX_DESCRIPCION, "La descripción");

  if (!data.asignado_a) throw new Error("Elige a qué jefe de equipo se asigna.");
  if (data.asignado_a !== TAREA_GLOBAL && JEFES_EQUIPO.indexOf(data.asignado_a) === -1) {
    throw new Error("Jefe de equipo no reconocido: " + data.asignado_a);
  }
  const prioridad = data.prioridad || "Normal";
  if (prioridad !== "Normal" && prioridad !== "Alta") throw new Error("Prioridad no válida: " + prioridad);

  const hoy = tarHoyClave_();
  const aplicarClave = tarClaveFecha_(data.fecha_aplicar);
  if (aplicarClave === null) throw new Error("Elige el día en que se aplica la tarea.");
  if (aplicarClave <= hoy) throw new Error("El día de aplicación tiene que ser posterior a hoy (para hoy usa «Ahora»).");
  if (aplicarClave > tprClaveMasDias_(hoy, TPR_MAX_DIAS_ADELANTE_)) throw new Error("Ese día está demasiado lejos (máximo un año).");

  let limiteTxt = "";
  const limiteEntrada = String(data.fecha_limite == null ? "" : data.fecha_limite).trim();
  if (limiteEntrada) {
    const limiteClave = tarClaveFecha_(limiteEntrada);
    if (limiteClave === null) throw new Error("La fecha límite no es válida.");
    if (limiteClave < aplicarClave) throw new Error("La fecha límite no puede ser anterior al día en que se aplica.");
    limiteTxt = tarClaveATexto_(limiteClave);
  }
  return { titulo: titulo, descripcion: descripcion, asignadoA: data.asignado_a, prioridad: prioridad, aplicarTxt: tarClaveATexto_(aplicarClave), limiteTxt: limiteTxt };
}

function programarTarea(data) {
  Logger.log("📥 Nueva tarea programada");
  if (!data) throw new Error("No se han recibido datos.");
  const v = tprValidarNueva_(data);

  // Una tarea programada para TODOS los jefes de un mando espera el visto bueno del jefe de área.
  const perfil = perfilActual_();
  if (v.asignadoA === TAREA_GLOBAL && perfilNecesitaAprobacion_("globales", perfil)) {
    return apSolicitarYResponder_("programada_global", v.titulo,
      { titulo: v.titulo, descripcion: v.descripcion, asignado_a: v.asignadoA, prioridad: v.prioridad, fecha_aplicar: v.aplicarTxt, fecha_limite: v.limiteTxt }, "", perfil);
  }
  const r = tprGuardarValidada_(v, perfilCreador_(perfil, data.creador));
  if (r.success) actividadRegistrar_("programada", "Programada #" + r.id + " «" + v.titulo + "» para el " + v.aplicarTxt + " → " + (v.asignadoA === TAREA_GLOBAL ? "todos los jefes" : v.asignadoA), perfil);
  return r;
}

// Guarda la tarea programada ya validada (sin pedir aprobación: eso se decide antes).
function tprGuardarValidada_(v, creador) {
  const h = tprObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  try {
    let maxId = 0;
    tprLeer_(h.sheet).forEach(function (p) { if (p.id > maxId) maxId = p.id; });
    const nuevoId = maxId + 1;
    const hoyTxt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    h.sheet.appendRow([nuevoId, v.titulo, v.descripcion, v.asignadoA, v.prioridad, v.aplicarTxt, v.limiteTxt, "Programada", creador || "Supervisor", hoyTxt, "", ""]);
    SpreadsheetApp.flush();
    return { success: true, id: nuevoId, aplicar: v.aplicarTxt };
  } catch (e) {
    Logger.log("❌ Error programando tarea: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Cancela una tarea programada que aún no se ha aplicado. Una ya aplicada es una tarea normal: se anula desde Tareas.
function cancelarTareaProgramada(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") {
    throw new Error("Falta la tarea programada.");
  }
  const h = tprObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = tarTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; intentalo de nuevo." };
  try {
    const buscado = String(data.id).trim();
    const p = tprLeer_(h.sheet).filter(function (x) { return String(x.id) === buscado; })[0];
    if (!p) return { success: false, error: "Tarea programada no encontrada." };
    if (p.estado === "Aplicada") return { success: false, error: "Esta tarea ya se aplicó: anúlala desde la lista de tareas." };
    if (p.estado === "Cancelada") return { success: false, error: "Esta tarea programada ya estaba cancelada." };
    h.sheet.getRange(p.fila, 8).setValue("Cancelada");
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error cancelando tarea programada: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
