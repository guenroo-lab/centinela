// ============================================================
//  CENTINELA — RELEVO (cambio de turno entre jefes de equipo)
//  El jefe que termina deja un parte corto para el que entra: en qué muelles se queda y cómo han quedado
//  (siempre se da dato de los muelles 2, 3 y 4; el 1 es opcional), qué zonas quedan a medias, qué ha pasado y
//  de qué hay que estar pendiente. Sustituye al mensaje de WhatsApp: el parte queda guardado, el siguiente
//  marca «Enterado» y cada punto de «estar pendiente de» sigue ABIERTO hasta que alguien lo marca «Hecho»
//  (con su nombre y la hora), aunque el parte sea de hace días.
//
//  Reglas:
//   · Escribe cualquier jefe de equipo (sin modo supervisor); lo leen todos. El supervisor (cliente) y las
//     cuentas de jefe de área / mando pueden retirar cualquier relevo.
//   · El autor puede corregir o retirar su relevo durante REL_EDITAR_MIN minutos. Al corregirlo se borran los
//     «Enterado» de los demás (tienen que volver a leerlo) y queda marcado como editado.
//   · El muro enseña los últimos REL_DIAS_MURO días; los puntos abiertos de relevos más viejos salen aparte.
//   · La foto (opcional) se guarda troceada en la hoja Notas_Fotos con el id «R<id>» (mismos ayudantes que Notas).
//   · Nada de aquí envía correos (eso queda para una segunda fase).
//
//  Hoja «Relevo» (1-indexadas):
//  1 ID | 2 Fecha (yyyy-MM-dd) | 3 Turno (M/T/P o vacío) | 4 Autor | 5 Publicado (yyyy-MM-dd HH:mm) |
//  6 Muelles (JSON {"2":"texto",…}) | 7 Zonas | 8 Que paso | 9 Enterados ("Jefe=yyyy-MM-dd HH:mm;…") |
//  10 Estado (Activo/Retirado) | 11 Foto (Sí/vacío) | 12 Editado (yyyy-MM-dd HH:mm o vacío)
//  Hoja «Relevo_Pendientes»:
//  1 ID | 2 Parte (ID del relevo) | 3 Texto | 4 Cuando (texto libre) | 5 Estado (Abierto/Hecho/Retirado) |
//  6 Creado por | 7 Creado (yyyy-MM-dd HH:mm) | 8 Hecho por | 9 Hecho el
//  Todo va como TEXTO (las celdas se formatean antes de escribir) y la respuesta al navegador no lleva ningún Date.
//  El supervisor es un filtro de CLIENTE (igual que Notas/Tareas): el servidor valida datos, no quién llama.
// ============================================================

const REL_MUELLES = [1, 2, 3, 4];
const REL_MUELLES_DEFECTO = [2, 3, 4];
const REL_MAX_MUELLE = 300;
const REL_MAX_ZONAS = 600;
const REL_MAX_PASO = 800;
const REL_MAX_PENDIENTES = 10;
const REL_MAX_PEND_TEXTO = 160;
const REL_MAX_PEND_CUANDO = 40;
const REL_DIAS_MURO = 7;
const REL_EDITAR_MIN = 30;
const REL_DUPLICADO_MS = 2 * 60 * 1000;
const REL_TURNOS = { M: "Mañana", T: "Tarde", P: "Partido" };

function relObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_RELEVO, CABECERAS_RELEVO, prepararHojaRelevo_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Relevo; inténtalo de nuevo." };
  return { sheet: sheet };
}

function relObtenerHojaPend_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_RELEVO_PENDIENTES, CABECERAS_RELEVO_PENDIENTES, prepararHojaRelevoPendientes_);
  if (!sheet) return { error: "No se pudo preparar la hoja de puntos a vigilar; inténtalo de nuevo." };
  return { sheet: sheet };
}

function relTomarLock_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return lock;
  } catch (e) {
    return null;
  }
}

function relTexto_(v) {
  if (v === null || v === undefined) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  }
  return String(v).trim();
}

function relNormalizar_(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// ms -> "yyyy-MM-dd HH:mm" en la zona del script
function relFechaTxt_(ms) {
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
}

// "yyyy-MM-dd HH:mm" -> ms, o null si no se entiende
function relParseMs_(txt) {
  const m = relTexto_(txt).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const f = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
  return isNaN(f.getTime()) ? null : f.getTime();
}

// Una sola línea (espacios sueltos fuera). Lanza si pasa del máximo.
function relLinea_(valor, max, etiqueta) {
  const t = String(valor == null ? "" : valor).replace(/\s+/g, " ").trim();
  if (t.length > max) throw new Error(etiqueta + " es demasiado largo (máximo " + max + " caracteres).");
  return t;
}

// Varias líneas permitidas.
function relBloque_(valor, max, etiqueta) {
  const t = String(valor == null ? "" : valor).replace(/\r\n?/g, "\n").split("\n").map(function (l) { return l.replace(/[ \t]+$/g, ""); }).join("\n").trim();
  if (t.length > max) throw new Error(etiqueta + " es demasiado largo (máximo " + max + " caracteres).");
  return t;
}

function relParseMuelles_(v) {
  const t = relTexto_(v);
  if (!t) return {};
  try {
    const o = JSON.parse(t);
    const res = {};
    if (o && typeof o === "object" && !Array.isArray(o)) {
      Object.keys(o).forEach(function (k) {
        const n = parseInt(k, 10);
        const s = o[k] === null || o[k] === undefined ? "" : String(o[k]).trim();
        if (REL_MUELLES.indexOf(n) > -1 && s) res[String(n)] = s;
      });
    }
    return res;
  } catch (e) {
    return {};
  }
}

// Lectura tolerante de la hoja Relevo (alguien puede haber escrito filas a mano).
function relLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const id = parseInt(relTexto_(f[0]), 10);
    if (isNaN(id)) continue;
    const turno = relTexto_(f[2]).toUpperCase();
    const pubTxt = relTexto_(f[4]);
    filas.push({
      fila: i + 1,
      id: id,
      fecha: relTexto_(f[1]).slice(0, 10),
      turno: REL_TURNOS[turno] ? turno : "",
      autor: notNombreJefe_(relTexto_(f[3])),
      publicadoTxt: pubTxt,
      publicadoMs: relParseMs_(pubTxt),
      muelles: relParseMuelles_(f[5]),
      zonas: relBloque_(relTexto_(f[6]), 100000, ""),
      paso: relBloque_(relTexto_(f[7]), 100000, ""),
      enterados: notParseEnterados_(f[8]),
      retirado: /^retirad/.test(relNormalizar_(f[9])),
      tieneFoto: relNormalizar_(f[10]) === "si",
      editadoTxt: relTexto_(f[11])
    });
  }
  return filas;
}

function relEstadoPend_(v) {
  const s = relNormalizar_(v);
  if (/^hech/.test(s)) return "hecho";
  if (/^retirad/.test(s)) return "retirado";
  return "abierto";           // lo que no se entienda se ve (mejor de más que perder un aviso)
}

function relLeerPend_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const id = parseInt(relTexto_(f[0]), 10);
    const parte = parseInt(relTexto_(f[1]), 10);
    const texto = relTexto_(f[2]);
    if (isNaN(id) || isNaN(parte) || !texto) continue;
    filas.push({
      fila: i + 1,
      id: id,
      parte: parte,
      texto: texto,
      cuando: relTexto_(f[3]),
      estado: relEstadoPend_(f[4]),
      creadoPor: notNombreJefe_(relTexto_(f[5])),
      creadoTxt: relTexto_(f[6]),
      hechoPor: relTexto_(f[7]),
      hechoTxt: relTexto_(f[8])
    });
  }
  return filas;
}

// Escribe filas nuevas al final con las columnas 2.. en «texto sin formato» ANTES de escribir (nada de appendRow:
// una celda sin ese formato convertiría un texto con aspecto de fecha en otra fecha según el idioma de la hoja).
function relEscribirFilas_(sheet, filas) {
  if (!filas.length) return;
  const ancho = filas[0].length;
  const primera = sheet.getLastRow() + 1;
  const ultima = primera + filas.length - 1;
  if (ultima > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), ultima - sheet.getMaxRows());
  sheet.getRange(primera, 2, filas.length, ancho - 1).setNumberFormat("@");
  sheet.getRange(primera, 1, filas.length, ancho).setValues(filas);
}

function relMaxId_(lista) {
  let max = 0;
  lista.forEach(function (x) { if (x.id > max) max = x.id; });
  return max;
}

function relComparar_(a, b) {
  const pa = a.publicadoMs === null ? 0 : a.publicadoMs, pb = b.publicadoMs === null ? 0 : b.publicadoMs;
  if (pa !== pb) return pb - pa;
  return b.id - a.id;
}

function relPendParaCliente_(d) {
  return { id: d.id, texto: d.texto, cuando: d.cuando, estado: d.estado, creadoPor: d.creadoPor, creado: d.creadoTxt, hechoPor: d.hechoPor, hecho: d.hechoTxt };
}

function relParteParaCliente_(p, pendientes) {
  return {
    id: p.id, fecha: p.fecha, turno: p.turno, turnoNombre: REL_TURNOS[p.turno] || "", autor: p.autor,
    publicado: p.publicadoTxt, publicadoMs: p.publicadoMs, muelles: p.muelles, zonas: p.zonas, paso: p.paso,
    enterados: p.enterados, tieneFoto: p.tieneFoto, editado: p.editadoTxt,
    pendientes: pendientes.map(relPendParaCliente_)
  };
}

// ── Validación de lo que llega del navegador ─────────────────

// data = { jefe, turno, muelles: {"2": "texto"}, zonas, paso, pendientes: [{ id?, texto, cuando }], foto }
// Devuelve los datos limpios; lanza Error con un mensaje para el usuario.
function relValidar_(data) {
  if (!data || typeof data !== "object") throw new Error("No se han recibido datos.");
  const jefe = jefeVigente_(String(data.jefe == null ? "" : data.jefe).trim());
  if (JEFES_EQUIPO.indexOf(jefe) === -1) throw new Error("Solo un jefe de equipo puede escribir el relevo: elige tu nombre al abrir la app.");
  const turno = String(data.turno == null ? "" : data.turno).trim().toUpperCase();
  if (turno && !REL_TURNOS[turno]) throw new Error("El turno no es válido.");

  const muelles = {};
  const crudos = data.muelles && typeof data.muelles === "object" && !Array.isArray(data.muelles) ? data.muelles : {};
  Object.keys(crudos).forEach(function (k) {
    const n = parseInt(k, 10);
    if (String(n) !== String(k).trim() || REL_MUELLES.indexOf(n) === -1) throw new Error("Muelle no válido: " + k + ".");
    const t = relLinea_(crudos[k], REL_MAX_MUELLE, "El texto del muelle " + n);
    if (t) muelles[String(n)] = t;
  });
  const zonas = relBloque_(data.zonas, REL_MAX_ZONAS, "El texto de las zonas pendientes");
  const paso = relBloque_(data.paso, REL_MAX_PASO, "El texto de lo que ha pasado");

  const lista = data.pendientes === undefined || data.pendientes === null ? [] : data.pendientes;
  if (!Array.isArray(lista)) throw new Error("Los puntos a vigilar no son válidos.");
  const pendientes = [];
  const vistos = {};
  lista.forEach(function (p) {
    if (!p || typeof p !== "object") throw new Error("Los puntos a vigilar no son válidos.");
    const texto = relLinea_(p.texto, REL_MAX_PEND_TEXTO, "Un punto a vigilar");
    const cuando = relLinea_(p.cuando, REL_MAX_PEND_CUANDO, "El «para cuándo»");
    if (!texto) {
      if (cuando) throw new Error("Falta el texto de un punto a vigilar (tiene «para cuándo» pero no qué vigilar).");
      return;                                           // fila vacía: se ignora
    }
    const id = p.id === undefined || p.id === null || p.id === "" ? 0 : parseInt(p.id, 10);
    if (id !== 0 && !(id > 0)) throw new Error("Un punto a vigilar no es válido.");
    if (id) {
      if (vistos[id]) throw new Error("Un punto a vigilar está repetido.");
      vistos[id] = true;
    }
    pendientes.push({ id: id, texto: texto, cuando: cuando });
  });
  if (pendientes.length > REL_MAX_PENDIENTES) throw new Error("Máximo " + REL_MAX_PENDIENTES + " puntos a vigilar por relevo.");

  const foto = notValidarFoto_(data.foto);
  return { jefe: jefe, turno: turno, muelles: muelles, zonas: zonas, paso: paso, pendientes: pendientes, foto: foto };
}

function relTieneContenido_(v, conFoto) {
  return Object.keys(v.muelles).length > 0 || !!v.zonas || !!v.paso || v.pendientes.length > 0 || !!conFoto;
}

const REL_ERROR_VACIO_ = "El relevo está vacío: cuenta algo (un muelle, una zona, qué ha pasado o algo a vigilar).";

function relClave_(v) {
  return JSON.stringify([v.muelles, v.zonas, v.paso, v.pendientes.map(function (p) { return p.texto + "|" + p.cuando; })]);
}

// ¿Sigue el autor dentro del plazo para corregir o retirar su relevo?
function relDentroDeVentana_(p, ahoraMs) {
  return p.publicadoMs !== null && ahoraMs - p.publicadoMs <= REL_EDITAR_MIN * 60 * 1000;
}

function relEsGestion_(data) {
  if (data && data.supervisor === true) return true;                  // filtro de cliente, como en el resto de la app
  const perfil = perfilActual_();
  return perfil.rol === "area" || perfil.rol === "mando";
}

// ── API pública (google.script.run) ──────────────────────────

// data = {} (la vista es la misma para todos). Devuelve el muro de los últimos días y los puntos abiertos más antiguos.
function obtenerRelevo(data) {
  const h = relObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const hp = relObtenerHojaPend_();
  if (hp.error) return { ok: false, error: hp.error };
  const ahoraMs = Date.now();
  const limite = ahoraMs - REL_DIAS_MURO * 24 * 3600 * 1000;

  const activas = relLeer_(h.sheet).filter(function (p) { return !p.retirado; });
  const porId = {};
  activas.forEach(function (p) { porId[p.id] = p; });
  const pend = relLeerPend_(hp.sheet).filter(function (d) { return d.estado !== "retirado" && porId[d.parte]; });
  const porParte = {};
  pend.forEach(function (d) { (porParte[d.parte] = porParte[d.parte] || []).push(d); });

  const recientes = activas.filter(function (p) { return p.publicadoMs === null || p.publicadoMs >= limite; }).sort(relComparar_);
  const enMuro = {};
  recientes.forEach(function (p) { enMuro[p.id] = true; });

  const abiertosFuera = pend.filter(function (d) { return d.estado === "abierto" && !enMuro[d.parte]; })
    .sort(function (a, b) { return relComparar_(porId[a.parte], porId[b.parte]) || a.id - b.id; })
    .map(function (d) {
      const p = porId[d.parte];
      const o = relPendParaCliente_(d);
      o.parte = p.id; o.parteAutor = p.autor; o.parteTurno = p.turno; o.parteFecha = p.fecha; o.partePublicadoMs = p.publicadoMs;
      return o;
    });

  return {
    ok: true,
    ahoraMs: ahoraMs,
    jefes: JEFES_EQUIPO.slice(),
    muelles: REL_MUELLES.slice(),
    muellesDefecto: REL_MUELLES_DEFECTO.slice(),
    editarMin: REL_EDITAR_MIN,
    diasMuro: REL_DIAS_MURO,
    partes: recientes.map(function (p) { return relParteParaCliente_(p, porParte[p.id] || []); }),
    abiertosFuera: abiertosFuera
  };
}

// Turno que le toca HOY a un jefe según el cuadrante, para dejarlo marcado al escribir el relevo.
// data = { jefe }. leido=false si la cuenta no puede abrir el cuadrante (entonces se elige a mano). Nunca lanza.
function obtenerTurnoRelevo(data) {
  const jefe = jefeVigente_(String(data && data.jefe != null ? data.jefe : "").trim());
  let turno = "";
  try {
    const r = obtenerTurnosHoyJefes();
    if (!r || !r.leido) return { ok: true, leido: false, turno: "" };
    (r.turnos || []).forEach(function (g) { if (g.jefes.indexOf(jefe) > -1) turno = g.codigo; });
    return { ok: true, leido: true, turno: turno };
  } catch (e) {
    return { ok: true, leido: false, turno: "" };
  }
}

// La foto de un relevo (aparte: el muro no la lleva para ser ligero). data = { id }.
function obtenerFotoRelevo(data) {
  const id = parseInt(data && data.id, 10);
  if (!(id > 0)) throw new Error("Falta el relevo.");
  const h = relObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const p = relLeer_(h.sheet).filter(function (x) { return x.id === id; })[0];
  if (!p || p.retirado) return { ok: false, error: "Relevo no encontrado." };
  if (!p.tieneFoto) return { ok: false, error: "Este relevo no tiene foto." };
  const foto = notLeerFoto_("R" + id);
  if (!foto) return { ok: false, error: "No se pudo leer la foto." };
  return { ok: true, foto: foto };
}

function publicarRelevo(data) {
  Logger.log("📥 Nuevo relevo");
  let v;
  try { v = relValidar_(data); } catch (e) { return { success: false, error: e.message }; }
  if (!relTieneContenido_(v, !!v.foto)) return { success: false, error: REL_ERROR_VACIO_ };

  const h = relObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const hp = relObtenerHojaPend_();
  if (hp.error) return { success: false, error: hp.error };
  let hf = null;
  if (v.foto) {
    hf = notObtenerHojaFotos_();          // ANTES del bloqueo: los bloqueos de Apps Script no son reentrantes
    if (hf.error) return { success: false, error: hf.error };
  }
  const lock = relTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const ahoraMs = Date.now();
    const existentes = relLeer_(h.sheet);
    const pendExistentes = relLeerPend_(hp.sheet);
    // Doble toque: el mismo autor con exactamente lo mismo en los últimos 2 minutos.
    const repetido = existentes.some(function (p) {
      if (p.retirado || p.autor !== v.jefe || p.publicadoMs === null) return false;
      if (ahoraMs - p.publicadoMs < 0 || ahoraMs - p.publicadoMs >= REL_DUPLICADO_MS || !v.foto !== !p.tieneFoto) return false;
      const suyos = pendExistentes.filter(function (d) { return d.parte === p.id && d.estado !== "retirado"; });
      return relClave_({ muelles: p.muelles, zonas: p.zonas, paso: p.paso, pendientes: suyos }) === relClave_(v);
    });
    if (repetido) return { success: false, error: "Ese mismo relevo ya se acaba de publicar." };
    const id = relMaxId_(existentes) + 1;
    const pubTxt = relFechaTxt_(ahoraMs);

    if (v.foto) notGuardarFoto_(hf.sheet, "R" + id, v.foto);     // si falla, no se crea el relevo
    relEscribirFilas_(h.sheet, [[id, pubTxt.slice(0, 10), v.turno, v.jefe, pubTxt, JSON.stringify(v.muelles), v.zonas, v.paso,
      v.jefe + "=" + pubTxt, "Activo", v.foto ? "Sí" : "", ""]]);
    if (v.pendientes.length) {
      let pid = relMaxId_(pendExistentes);
      relEscribirFilas_(hp.sheet, v.pendientes.map(function (p) {
        pid++;
        return [pid, id, p.texto, p.cuando, "Abierto", v.jefe, pubTxt, "", ""];
      }));
    }
    SpreadsheetApp.flush();
    return { success: true, id: id, pendientes: v.pendientes.length };
  } catch (e) {
    Logger.log("❌ Error publicando el relevo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Corrige un relevo propio dentro de la ventana. data = { id, jefe, … lo mismo que publicarRelevo }. El turno y la
// foto no cambian. Los puntos con id se actualizan, los que ya no vienen se retiran y los que no llevan id son nuevos.
function editarRelevo(data) {
  Logger.log("📥 Editar relevo");
  const id = parseInt(data && data.id, 10);
  if (!(id > 0)) return { success: false, error: "Falta el relevo." };
  let v;
  try { v = relValidar_(data); } catch (e) { return { success: false, error: e.message }; }

  const h = relObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const hp = relObtenerHojaPend_();
  if (hp.error) return { success: false, error: hp.error };
  const lock = relTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const ahoraMs = Date.now();
    const p = relLeer_(h.sheet).filter(function (x) { return x.id === id; })[0];
    if (!p || p.retirado) return { success: false, error: "Este relevo ya no existe." };
    if (p.autor !== v.jefe) return { success: false, error: "Solo quien escribió el relevo puede corregirlo." };
    if (!relDentroDeVentana_(p, ahoraMs)) return { success: false, error: "Ya han pasado más de " + REL_EDITAR_MIN + " minutos: escribe un relevo nuevo." };
    if (!relTieneContenido_(v, p.tieneFoto)) return { success: false, error: REL_ERROR_VACIO_ };

    const pendActuales = relLeerPend_(hp.sheet).filter(function (d) { return d.parte === id && d.estado !== "retirado"; });
    const actualPorId = {};
    pendActuales.forEach(function (d) { actualPorId[d.id] = d; });
    for (let i = 0; i < v.pendientes.length; i++) {
      if (v.pendientes[i].id && !actualPorId[v.pendientes[i].id]) return { success: false, error: "Un punto a vigilar ya no pertenece a este relevo; vuelve a abrirlo." };
    }

    const ahoraTxt = relFechaTxt_(ahoraMs);
    h.sheet.getRange(p.fila, 6, 1, 3).setNumberFormat("@").setValues([[JSON.stringify(v.muelles), v.zonas, v.paso]]);
    h.sheet.getRange(p.fila, 9, 1, 1).setNumberFormat("@").setValue(v.jefe + "=" + ahoraTxt);       // los demás tienen que volver a leerlo
    h.sheet.getRange(p.fila, 12, 1, 1).setNumberFormat("@").setValue(ahoraTxt);

    const mantenidos = {};
    v.pendientes.forEach(function (n) {
      if (!n.id) return;
      mantenidos[n.id] = true;
      const d = actualPorId[n.id];
      if (d.texto !== n.texto || d.cuando !== n.cuando) hp.sheet.getRange(d.fila, 3, 1, 2).setNumberFormat("@").setValues([[n.texto, n.cuando]]);
    });
    pendActuales.forEach(function (d) {
      if (!mantenidos[d.id]) hp.sheet.getRange(d.fila, 5, 1, 1).setNumberFormat("@").setValue("Retirado");
    });
    const nuevos = v.pendientes.filter(function (n) { return !n.id; });
    if (nuevos.length) {
      let pid = relMaxId_(relLeerPend_(hp.sheet));
      relEscribirFilas_(hp.sheet, nuevos.map(function (n) {
        pid++;
        return [pid, id, n.texto, n.cuando, "Abierto", v.jefe, ahoraTxt, "", ""];
      }));
    }
    SpreadsheetApp.flush();
    return { success: true, id: id };
  } catch (e) {
    Logger.log("❌ Error editando el relevo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// El relevo deja de verse para todos. Lo puede retirar su autor (dentro de la ventana) o la gestión
// (supervisor del cliente / cuenta de jefe de área o mando). data = { id, jefe, supervisor }.
function retirarRelevo(data) {
  const id = parseInt(data && data.id, 10);
  if (!(id > 0)) return { success: false, error: "Falta el relevo." };
  const jefe = jefeVigente_(String(data.jefe == null ? "" : data.jefe).trim());
  const h = relObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = relTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const p = relLeer_(h.sheet).filter(function (x) { return x.id === id; })[0];
    if (!p) return { success: false, error: "Relevo no encontrado." };
    if (p.retirado) return { success: false, error: "Este relevo ya estaba retirado." };
    const suyo = JEFES_EQUIPO.indexOf(jefe) > -1 && p.autor === jefe;
    if (!(suyo && relDentroDeVentana_(p, Date.now())) && !relEsGestion_(data)) {
      return { success: false, error: suyo ? "Ya han pasado más de " + REL_EDITAR_MIN + " minutos: pídele a un responsable que lo retire." : "Solo su autor (durante " + REL_EDITAR_MIN + " minutos) o un responsable puede retirar este relevo." };
    }
    h.sheet.getRange(p.fila, 10, 1, 1).setNumberFormat("@").setValue("Retirado");
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error retirando el relevo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// data = { id, jefe }. Idempotente: si ya estaba enterado no cambia la hora.
function marcarRelevoEnterado(data) {
  const id = parseInt(data && data.id, 10);
  if (!(id > 0)) return { success: false, error: "Falta el relevo." };
  const jefe = jefeVigente_(String(data.jefe == null ? "" : data.jefe).trim());
  if (JEFES_EQUIPO.indexOf(jefe) === -1) return { success: false, error: "Jefe de equipo no reconocido." };
  const h = relObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = relTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const p = relLeer_(h.sheet).filter(function (x) { return x.id === id; })[0];
    if (!p || p.retirado) return { success: false, error: "Este relevo ya no está disponible." };
    if (p.enterados.some(function (e) { return e.jefe === jefe; })) return { success: true, yaEstaba: true };
    const lista = p.enterados.concat([{ jefe: jefe, fecha: relFechaTxt_(Date.now()) }]);
    h.sheet.getRange(p.fila, 9, 1, 1).setNumberFormat("@").setValue(lista.map(function (e) { return e.jefe + "=" + e.fecha; }).join(";"));
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error marcando el relevo como enterado: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Marca un punto «estar pendiente de» como hecho (o lo reabre). data = { id, jefe, hecho (por defecto true), supervisor }.
function marcarPendienteRelevo(data) {
  const id = parseInt(data && data.id, 10);
  if (!(id > 0)) return { success: false, error: "Falta el punto." };
  let quien = jefeVigente_(String(data.jefe == null ? "" : data.jefe).trim());
  if (JEFES_EQUIPO.indexOf(quien) === -1) {
    if (data.supervisor !== true) return { success: false, error: "Elige tu nombre al abrir la app para marcarlo." };
    quien = perfilCreador_(perfilActual_(), "Supervisor");
  }
  const hecho = data.hecho !== false;
  const h = relObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const hp = relObtenerHojaPend_();
  if (hp.error) return { success: false, error: hp.error };
  const lock = relTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const d = relLeerPend_(hp.sheet).filter(function (x) { return x.id === id; })[0];
    if (!d || d.estado === "retirado") return { success: false, error: "Este punto ya no existe." };
    const p = relLeer_(h.sheet).filter(function (x) { return x.id === d.parte; })[0];
    if (!p || p.retirado) return { success: false, error: "El relevo de este punto se ha retirado." };
    if (hecho && d.estado === "hecho") return { success: true, yaEstaba: true, hechoPor: d.hechoPor };
    if (!hecho && d.estado === "abierto") return { success: true, yaEstaba: true };
    const ahoraTxt = relFechaTxt_(Date.now());
    hp.sheet.getRange(d.fila, 5, 1, 1).setNumberFormat("@").setValue(hecho ? "Hecho" : "Abierto");
    hp.sheet.getRange(d.fila, 8, 1, 2).setNumberFormat("@").setValues([[hecho ? quien : "", hecho ? ahoraTxt : ""]]);
    SpreadsheetApp.flush();
    return { success: true, hechoPor: hecho ? quien : "", hecho: hecho ? ahoraTxt : "" };
  } catch (e) {
    Logger.log("❌ Error marcando el punto del relevo: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
