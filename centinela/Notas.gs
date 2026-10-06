// ============================================================
//  CENTINELA — NOTAS INFORMATIVAS
//  El supervisor publica avisos para los jefes de equipo: cambios operativos, información de valor,
//  cosas a tener en cuenta. Cada nota tiene un TIPO (color e icono), puede FIJARSE arriba y se ve durante
//  el tiempo que se elija (horas, días o semanas; o sin caducidad). Al pasar ese tiempo deja de verse sola.
//  Cada jefe marca «Enterado» y el supervisor ve quién la ha leído. Es solo lectura para los jefes.
//
//  Opciones por nota:
//   · DESTINATARIOS: todos los jefes (por defecto) o solo algunos. Un jefe solo ve, y solo puede marcar
//     «Enterado», las que van para él. El supervisor puede elegirlos a mano o con el cuadrante de HOY
//     (obtenerTurnosHoyJefes: quién tiene turno de mañana/tarde/partido); se guarda la lista de nombres.
//   · LECTURA OBLIGATORIA: el cliente la muestra a pantalla completa al abrir la app hasta que el jefe
//     pulse «Enterado» (en el servidor es solo una marca; el aviso lo pinta NotasUI.html).
//   · AVISAR POR CORREO (opcional): correo premium a los destinatarios (y responsables en copia). Un fallo
//     de correo nunca deshace la nota: queda apuntado «NO enviado» y se puede reenviar.
//   · FOTO (opcional): se reduce en el navegador y se guarda troceada en la hoja Notas_Fotos.
//
//  Columnas de la hoja Notas (1-indexadas):
//  1 ID | 2 Titulo | 3 Texto | 4 Tipo (cambio/info/atencion/urgente) | 5 Fijada (Sí/No) |
//  6 Publicada (yyyy-MM-dd HH:mm) | 7 Caduca (yyyy-MM-dd HH:mm, vacío = sin caducidad) | 8 Duracion (texto) |
//  9 Autor | 10 Estado (Activa/Retirada) | 11 Enterados ("Jefe=yyyy-MM-dd HH:mm;Jefe=…") |
//  12 Destinatarios ("" = todos, o "Jefe;Jefe") | 13 Obligatoria (Sí/No) | 14 Correo (No solicitado/Enviado/NO enviado) |
//  15 Foto (Sí / vacío). Las hojas creadas antes de las columnas 12-15 se migran solas (cabeceras) y sus filas
//  se leen como «para todos, no obligatoria, sin correo, sin foto».
//  El supervisor es un filtro de CLIENTE (igual que Tareas/Maquinaria): el servidor valida datos, no quién llama.
// ============================================================

const NOT_MAX_TITULO = 80;
const NOT_MAX_TEXTO = 1500;
const NOT_MAX_DIAS = 366;
const NOT_HISTORIAL = 15;
const NOT_DUPLICADO_MS = 2 * 60 * 1000;     // misma nota publicada dos veces seguidas (doble toque)
const NOT_FOTO_MAX_CHARS = 350000;          // data URI completa (~260 KB de imagen; el navegador la reduce antes)
const NOT_FOTO_TROZO = 40000;               // Sheets admite 50.000 caracteres por celda

// Orden de importancia al ordenar: lo urgente primero.
const NOT_TIPOS = { urgente: 0, atencion: 1, cambio: 2, info: 3 };
// Aspecto de cada tipo en el correo (la UI tiene los suyos).
const NOT_TIPOS_CORREO = {
  urgente: { nombre: "Urgente", emoji: "🚨", acento: "#ef4444", tono: "alerta" },
  atencion: { nombre: "A tener en cuenta", emoji: "⚠️", acento: "#f59e0b", tono: "aviso" },
  cambio: { nombre: "Cambio operativo", emoji: "🔄", acento: "#6366f1", tono: "info" },
  info: { nombre: "Información", emoji: "💡", acento: "#14b8a6", tono: "ok" }
};
const NOT_UNIDADES_MS = { horas: 3600 * 1000, dias: 24 * 3600 * 1000, semanas: 7 * 24 * 3600 * 1000 };
const NOT_UNIDAD_TEXTO = { horas: ["hora", "horas"], dias: ["día", "días"], semanas: ["semana", "semanas"] };
const NOT_TURNOS_NOMBRE = { M: "Mañana", T: "Tarde", P: "Partido" };

function notObtenerHoja_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_NOTAS, CABECERAS_NOTAS, prepararHojaNotas_);
  if (!sheet) return { error: "No se pudo preparar la hoja de Notas; inténtalo de nuevo." };
  return { sheet: sheet };
}

// Hoja de fotos lista para usar (se crea la primera vez). Llamar ANTES de coger el bloqueo de escritura.
function notObtenerHojaFotos_() {
  const ss = abrirHojaCentinela_();
  if (!ss) return { error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_NOTAS_FOTOS, CABECERAS_NOTAS_FOTOS, prepararHojaNotasFotos_);
  if (!sheet) return { error: "No se pudo preparar la hoja de fotos; inténtalo de nuevo." };
  return { sheet: sheet };
}

function notTomarLock_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return lock;
  } catch (e) {
    return null;
  }
}

function notTexto_(valor) {
  if (valor === null || valor === undefined) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return isNaN(valor.getTime()) ? "" : Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  }
  return String(valor).trim();
}

function notNormalizar_(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// ms -> "yyyy-MM-dd HH:mm" en la zona del script
function notFechaTxt_(ms) {
  return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
}

// "yyyy-MM-dd HH:mm" (o "yyyy-MM-dd") -> ms, o null si no se entiende
function notParseMs_(txt) {
  const s = notTexto_(txt);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const f = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
  return isNaN(f.getTime()) ? null : f.getTime();
}

// { valor, unidad } -> { ms, texto }. Lanza si no es válida o pasa de un año.
function notDuracion_(valor, unidad) {
  const v = Number(valor);
  if (!isFinite(v) || v < 1 || Math.floor(v) !== v) throw new Error("La duración tiene que ser un número entero de 1 en adelante.");
  if (!NOT_UNIDADES_MS[unidad]) throw new Error("La unidad de la duración no es válida (horas, días o semanas).");
  const ms = v * NOT_UNIDADES_MS[unidad];
  if (ms > NOT_MAX_DIAS * NOT_UNIDADES_MS.dias) throw new Error("La duración es demasiado larga (máximo un año).");
  const nombres = NOT_UNIDAD_TEXTO[unidad];
  return { ms: ms, texto: v + " " + (v === 1 ? nombres[0] : nombres[1]) };
}

// Datos -> { caducaTxt, duracionTxt }. data.sin_caducidad = true (o sin duración) => no caduca.
function notResolverVisibilidad_(data, ahoraMs) {
  if (data.sin_caducidad === true) return { caducaTxt: "", duracionTxt: "Sin caducidad" };
  if (!data.duracion) throw new Error("Elige durante cuánto tiempo se verá la nota (o marca «Sin caducidad»).");
  const d = notDuracion_(data.duracion.valor, data.duracion.unidad);
  return { caducaTxt: notFechaTxt_(ahoraMs + d.ms), duracionTxt: d.texto };
}

function notTipoCanonico_(valor) {
  const s = notNormalizar_(valor);
  return NOT_TIPOS.hasOwnProperty(s) ? s : "info";
}

// Nombre de jefe tal como está hoy en JEFES_EQUIPO (tolera la ortografía vieja de JEFES_ALIAS y mayúsculas/tildes).
function notNombreJefe_(crudo) {
  const k = notNormalizar_(crudo);
  for (let i = 0; i < JEFES_EQUIPO.length; i++) {
    if (notNormalizar_(JEFES_EQUIPO[i]) === k) return JEFES_EQUIPO[i];
  }
  if (JEFES_ALIAS.hasOwnProperty(k)) return JEFES_ALIAS[k];
  return String(crudo == null ? "" : crudo).trim();
}

function notParseEnterados_(txt) {
  const res = [];
  notTexto_(txt).split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i < 1) return;
    const jefe = notNombreJefe_(p.slice(0, i));
    if (jefe) res.push({ jefe: jefe, fecha: p.slice(i + 1).trim() });
  });
  return res;
}

// "Dani Simo;Francisco Parada" -> ["Dani Simo", "Francisco Parada"]. Vacío = [] = todos los jefes.
// Solo cuentan los nombres que son de verdad un jefe (en el orden de JEFES_EQUIPO); si una fila escrita a mano trae
// un texto que no reconoce a nadie, la nota va para todos (mejor que se vea de más que perder un aviso por un typo).
function notParseDestinatarios_(txt) {
  const pedidos = {};
  notTexto_(txt).split(";").forEach(function (p) { pedidos[notNombreJefe_(p)] = true; });
  const lista = JEFES_EQUIPO.filter(function (j) { return pedidos[j]; });
  return lista.length === JEFES_EQUIPO.length ? [] : lista;
}

// Lista del cliente -> lista validada, sin repetidos y en el orden de JEFES_EQUIPO. [] = todos
// (también cuando se marcan los cuatro). Lanza si alguno no es un jefe.
function notValidarDestinatarios_(lista) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista)) throw new Error("Los destinatarios no son válidos.");
  const pedidos = {};
  lista.forEach(function (j) {
    if (JEFES_EQUIPO.indexOf(j) === -1) throw new Error("Jefe de equipo no reconocido: " + j);
    pedidos[j] = true;
  });
  const ordenados = JEFES_EQUIPO.filter(function (j) { return pedidos[j]; });
  return ordenados.length === JEFES_EQUIPO.length ? [] : ordenados;
}

// ¿La nota va para este jefe? Sin destinatarios = para todos.
function notVisiblePara_(n, jefe) {
  return n.destinatarios.length === 0 || n.destinatarios.indexOf(jefe) > -1;
}

// Lectura tolerante de la hoja (alguien puede haber escrito filas a mano).
function notLeer_(sheet) {
  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    const idNum = parseInt(notTexto_(f[0]), 10);
    const titulo = notTexto_(f[1]);
    if (isNaN(idNum) || !titulo) continue;
    const publicadaTxt = notTexto_(f[5]);
    const caducaTxt = notTexto_(f[6]);
    const correoCrudo = notNormalizar_(f[13]);
    filas.push({
      fila: i + 1,
      id: idNum,
      titulo: titulo,
      texto: String(f[2] == null ? "" : f[2]).replace(/\r\n?/g, "\n").trim(),
      tipo: notTipoCanonico_(f[3]),
      fijada: notNormalizar_(f[4]) === "si",
      publicadaTxt: publicadaTxt,
      publicadaMs: notParseMs_(publicadaTxt),
      caducaTxt: caducaTxt,
      caducaMs: caducaTxt ? notParseMs_(caducaTxt) : null,
      duracion: notTexto_(f[7]),
      autor: notTexto_(f[8]),
      retirada: /^retirad/.test(notNormalizar_(f[9])),
      enterados: notParseEnterados_(f[10]),
      destinatarios: notParseDestinatarios_(f[11]),
      obligatoria: notNormalizar_(f[12]) === "si",
      correo: correoCrudo === "enviado" ? "Enviado" : (correoCrudo === "no enviado" ? "NO enviado" : "No solicitado"),
      tieneFoto: notNormalizar_(f[14]) === "si"
    });
  }
  return filas;
}

// Una nota se ve mientras no esté retirada y no haya pasado su hora de caducidad. Una caducidad ilegible
// no la esconde (mejor que se vea de más que perder un aviso por un dato mal escrito a mano).
function notEstaActiva_(n, ahoraMs) {
  if (n.retirada) return false;
  if (n.caducaTxt && n.caducaMs !== null && n.caducaMs <= ahoraMs) return false;
  return true;
}

function notParaCliente_(n, ahoraMs) {
  return {
    id: n.id, titulo: n.titulo, texto: n.texto, tipo: n.tipo, fijada: n.fijada,
    publicada: n.publicadaTxt, publicadaMs: n.publicadaMs, caduca: n.caducaTxt, caducaMs: n.caducaMs,
    sinCaducidad: !n.caducaTxt, duracion: n.duracion, autor: n.autor,
    estado: n.retirada ? "Retirada" : (notEstaActiva_(n, ahoraMs) ? "Activa" : "Caducada"),
    enterados: n.enterados,
    destinatarios: n.destinatarios, obligatoria: n.obligatoria, correo: n.correo, tieneFoto: n.tieneFoto
  };
}

function notComparar_(a, b) {
  if (a.fijada !== b.fijada) return a.fijada ? -1 : 1;
  if (NOT_TIPOS[a.tipo] !== NOT_TIPOS[b.tipo]) return NOT_TIPOS[a.tipo] - NOT_TIPOS[b.tipo];
  const pa = a.publicadaMs === null ? 0 : a.publicadaMs, pb = b.publicadaMs === null ? 0 : b.publicadaMs;
  if (pa !== pb) return pb - pa;
  return b.id - a.id;
}

// ── Fotos ────────────────────────────────────────────────────

// "" si no hay foto; lanza error si no es una imagen válida o es demasiado grande.
function notValidarFoto_(foto) {
  if (foto === undefined || foto === null || foto === "") return "";
  const f = String(foto);
  if (f.length > NOT_FOTO_MAX_CHARS) throw new Error("La foto es demasiado grande.");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+={0,2}$/.test(f)) throw new Error("La foto no es válida.");
  return f;
}

// Guarda la foto troceada en filas contiguas [Foto ID, Parte, Total, Datos]. Va DENTRO del bloqueo del llamador.
function notGuardarFoto_(sheet, notaId, dataUri) {
  const filas = [];
  for (let i = 0; i < dataUri.length; i += NOT_FOTO_TROZO) filas.push([String(notaId), 0, 0, dataUri.slice(i, i + NOT_FOTO_TROZO)]);
  filas.forEach(function (fila, i) { fila[1] = i + 1; fila[2] = filas.length; });
  sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, 4).setValues(filas);
  SpreadsheetApp.flush();
}

// Devuelve la data URI completa o "". No crea la hoja (se puede llamar dentro de un bloqueo).
function notLeerFoto_(notaId) {
  try {
    const ss = abrirHojaCentinela_();
    const sheet = ss ? ss.getSheetByName(CONFIG.SHEET_NAME_NOTAS_FOTOS) : null;
    if (!sheet) return "";
    const ultima = sheet.getLastRow();
    if (ultima < 2) return "";
    const id = String(notaId);
    const ids = sheet.getRange(2, 1, ultima - 1, 3).getValues();
    let primera = -1, total = 0;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id && Number(ids[i][1]) === 1) { primera = i + 2; total = Number(ids[i][2]); break; }
    }
    if (primera < 0 || total < 1) return "";
    const partes = sheet.getRange(primera, 1, total, 4).getValues();
    let out = "";
    for (let j = 0; j < total; j++) {
      if (String(partes[j][0]) !== id || Number(partes[j][1]) !== j + 1) return "";
      out += String(partes[j][3]);
    }
    return out;
  } catch (e) {
    Logger.log("⚠️ No se pudo leer la foto de la nota " + notaId + ": " + e.message);
    return "";
  }
}

// ── Correo ───────────────────────────────────────────────────

// Direcciones de los destinatarios de la nota (todos los jefes si no hay lista). [] si no se conoce ninguna.
function notCorreosDestinatarios_(destinatarios) {
  const nombres = destinatarios.length ? destinatarios : JEFES_EQUIPO;
  return nombres.map(function (j) { return CORREOS_JEFES_POR_NOMBRE[j]; }).filter(Boolean);
}

// n = nota leída (notLeer_); fotoUri opcional. Devuelve true/false y nunca lanza.
function notEnviarCorreo_(n, fotoUri) {
  try {
    const para = notCorreosDestinatarios_(n.destinatarios);
    if (!para.length) {
      Logger.log("⚠️ Correo de nota: no hay dirección para los destinatarios de la nota #" + n.id + ".");
      return false;
    }
    const t = NOT_TIPOS_CORREO[n.tipo] || NOT_TIPOS_CORREO.info;
    const titulo = String(n.titulo).replace(/\s+/g, " ").trim();
    const corto = titulo.length > 80 ? titulo.slice(0, 77) + "…" : titulo;
    const dest = n.destinatarios.length ? n.destinatarios.join(", ") : "Todos los jefes de equipo";
    const chips = [{ texto: t.emoji + " " + t.nombre, tono: t.tono }];
    chips.push(n.caducaTxt ? { texto: "⏳ Se ve hasta el " + n.caducaTxt.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/, "$3/$2/$1 a las $4"), tono: "neutro" } : { texto: "♾️ Sin caducidad", tono: "neutro" });
    if (n.fijada) chips.push({ texto: "📌 Fijada arriba", tono: "neutro" });
    if (n.obligatoria) chips.push({ texto: "🔔 Lectura obligatoria", tono: "aviso" });
    const fotoBlob = fotoUri ? dataUriABlob(fotoUri, "foto_nota.jpg") : null;
    const cfg = {
      acento: t.acento,
      emoji: t.emoji,
      etiqueta: "Nota informativa · " + t.nombre,
      titulo: titulo,
      subtitulo: (n.autor || "Supervisor") + (n.destinatarios.length ? " ha publicado una nota para ti." : " ha publicado una nota para todos los jefes de equipo."),
      preheader: t.nombre + " · " + (n.texto.length > 110 ? n.texto.slice(0, 107) + "…" : n.texto),
      chips: chips,
      filas: [
        { icono: "👥", etiqueta: "Para", valor: dest },
        { icono: "🗓️", etiqueta: "Publicada", valor: n.publicadaTxt.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/, "$3/$2/$1 a las $4") || "Ahora" }
      ],
      bloques: [{ icono: "📝", titulo: "Nota", texto: n.texto, acento: t.acento }],
      fotos: fotoBlob ? [{ cid: "fotonota", blob: fotoBlob, titulo: "Foto adjunta" }] : [],
      boton: { texto: "Abrir Centinela", url: CONFIG.APP_URL },
      nota: n.obligatoria
        ? "Esta nota es de lectura obligatoria: al abrir Centinela te aparecerá hasta que pulses «Enterado»."
        : "Ábrela en Centinela (pestaña Notas) y pulsa «Enterado» cuando la hayas leído."
    };
    return correoPremiumEnviar_({ para: para, asunto: (n.tipo === "urgente" ? "⚠️ URGENTE" : "❕ Nota informativa") + " · " + corto, cfg: cfg });
  } catch (e) {
    Logger.log("❌ Error preparando el correo de la nota: " + e.message);
    return false;
  }
}

// ── Turnos de hoy (para dirigir una nota a «los de la mañana», etc.) ─────────────
// Lee el cuadrante (solo lectura, el mismo de Tareas recurrentes/Turnos). Devuelve los jefes que hoy tienen
// turno de mañana / tarde / partido. leido=false si la cuenta no puede abrir el cuadrante: entonces no se
// ofrece nada (el supervisor elige a mano). Nunca lanza.
function obtenerTurnosHoyJefes() {
  const hoyIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  try {
    const ss = SpreadsheetApp.openById(CONFIG.CUADRANTE_SHEET_ID);
    const ids = trecIdsJefesEnCuadrante_(ss);
    const turnosMapa = tsemLeerTurnos_(ss);
    const grupos = { M: [], T: [], P: [] };
    JEFES_EQUIPO.forEach(function (jefe) {
      const id = ids[jefe];
      if (!id) return;
      const codigo = trecPrimerToken_(turnosMapa[id + "_" + hoyIso]);
      if (grupos[codigo]) grupos[codigo].push(jefe);
    });
    const turnos = ["M", "T", "P"].filter(function (c) { return grupos[c].length; }).map(function (c) {
      return { codigo: c, nombre: NOT_TURNOS_NOMBRE[c], jefes: grupos[c] };
    });
    return { ok: true, leido: true, fecha: hoyIso, turnos: turnos };
  } catch (e) {
    Logger.log("⚠️ Notas: no se pudo leer el cuadrante de turnos (" + e.message + ").");
    return { ok: true, leido: false, fecha: hoyIso, turnos: [] };
  }
}

// ── API pública (google.script.run) ─────────────────────────

// data = { jefe, historial }.
//  · jefe: solo las notas que van para ese jefe (la vista de un jefe SIEMPRE lo manda). Sin jefe = todas (supervisor).
//  · historial: true (supervisor) añade las últimas notas caducadas o retiradas.
function obtenerNotas(data) {
  const jefe = data && data.jefe ? jefeVigente_(String(data.jefe)) : "";
  if (jefe && JEFES_EQUIPO.indexOf(jefe) === -1) throw new Error("Jefe de equipo no reconocido: " + jefe);
  const h = notObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const ahoraMs = Date.now();
  const todas = notLeer_(h.sheet).filter(function (n) { return !jefe || notVisiblePara_(n, jefe); });
  const activas = todas.filter(function (n) { return notEstaActiva_(n, ahoraMs); }).sort(notComparar_);
  const resp = { ok: true, ahoraMs: ahoraMs, jefes: JEFES_EQUIPO.slice(), notas: activas.map(function (n) { return notParaCliente_(n, ahoraMs); }) };
  if (data && data.historial) {
    resp.historial = todas.filter(function (n) { return !notEstaActiva_(n, ahoraMs); })
      .sort(function (a, b) { return b.id - a.id; }).slice(0, NOT_HISTORIAL)
      .map(function (n) { return notParaCliente_(n, ahoraMs); });
  }
  return resp;
}

// La foto de una nota (aparte: la lista no la lleva para que sea ligera). data = { id, jefe }.
function obtenerFotoNota(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la nota.");
  const jefe = data.jefe ? jefeVigente_(String(data.jefe)) : "";
  if (jefe && JEFES_EQUIPO.indexOf(jefe) === -1) throw new Error("Jefe de equipo no reconocido: " + jefe);
  const h = notObtenerHoja_();
  if (h.error) return { ok: false, error: h.error };
  const n = notLeer_(h.sheet).filter(function (x) { return String(x.id) === String(data.id).trim(); })[0];
  if (!n) return { ok: false, error: "Nota no encontrada." };
  if (jefe && !notVisiblePara_(n, jefe)) return { ok: false, error: "Esta nota no va dirigida a ti." };
  if (!n.tieneFoto) return { ok: false, error: "Esta nota no tiene foto." };
  const foto = notLeerFoto_(n.id);
  if (!foto) return { ok: false, error: "No se pudo leer la foto." };
  return { ok: true, foto: foto };
}

// data = { titulo, texto, tipo, fijada, duracion: { valor, unidad } | sin_caducidad: true, creador,
//          destinatarios: ["Jefe", …] (vacío/ausente = todos), obligatoria, avisar_correo, foto (data URI) }
// Valida y deja limpio lo que llega del cliente. Lanza Error con un mensaje para el usuario.
function notValidarNueva_(data) {
  const titulo = String(data.titulo == null ? "" : data.titulo).replace(/\s+/g, " ").trim();
  if (!titulo) throw new Error("El título es obligatorio.");
  if (titulo.length > NOT_MAX_TITULO) throw new Error("El título es demasiado largo (máximo " + NOT_MAX_TITULO + " caracteres).");
  const texto = String(data.texto == null ? "" : data.texto).replace(/\r\n?/g, "\n").trim();
  if (!texto) throw new Error("Escribe el texto de la nota.");
  if (texto.length > NOT_MAX_TEXTO) throw new Error("El texto es demasiado largo (máximo " + NOT_MAX_TEXTO + " caracteres).");
  if (!NOT_TIPOS.hasOwnProperty(data.tipo)) throw new Error("Elige el tipo de nota.");
  const creador = String(data.creador == null ? "" : data.creador).trim() || "Supervisor";
  const vis = notResolverVisibilidad_(data, Date.now());
  const destinatarios = notValidarDestinatarios_(data.destinatarios);
  const foto = notValidarFoto_(data.foto);
  return {
    titulo: titulo, texto: texto, tipo: data.tipo, fijada: data.fijada === true, creador: creador, vis: vis,
    destinatarios: destinatarios, foto: foto, obligatoria: data.obligatoria === true, avisar: data.avisar_correo === true
  };
}

function publicarNota(data) {
  Logger.log("📥 Nueva nota informativa");
  if (!data) throw new Error("No se han recibido datos.");
  const v = notValidarNueva_(data);

  // Una nota urgente o de lectura obligatoria de un mando espera el visto bueno del jefe de área.
  const perfil = perfilActual_();
  if ((v.tipo === "urgente" || v.obligatoria) && perfilNecesitaAprobacion_("urgentes", perfil)) {
    const datos = {
      titulo: v.titulo, texto: v.texto, tipo: v.tipo, fijada: v.fijada, destinatarios: v.destinatarios, obligatoria: v.obligatoria, avisar_correo: v.avisar,
      sin_caducidad: data.sin_caducidad === true
    };
    if (data.duracion) datos.duracion = data.duracion;
    return apSolicitarYResponder_("nota_urgente", v.titulo, datos, v.foto, perfil);
  }
  v.creador = perfilCreador_(perfil, data.creador);
  const r = notPublicarValidada_(v);
  if (r.success) actividadRegistrar_("nota", "Nota #" + r.id + " «" + v.titulo + "» (" + v.tipo + (v.obligatoria ? ", obligatoria" : "") + ")", perfil);
  return r;
}

// Publica la nota ya validada (sin pedir aprobación: eso se decide antes).
function notPublicarValidada_(v) {
  const ahoraMs = Date.now();
  const titulo = v.titulo, texto = v.texto, vis = v.vis, destinatarios = v.destinatarios, foto = v.foto, creador = v.creador;
  const obligatoria = v.obligatoria, avisar = v.avisar;

  const h = notObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  let hf = null;
  if (foto) {
    hf = notObtenerHojaFotos_();       // ANTES del bloqueo: los bloqueos de Apps Script no son reentrantes
    if (hf.error) return { success: false, error: hf.error };
  }
  const lock = notTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const existentes = notLeer_(h.sheet);
    const claveDest = destinatarios.join(";");
    const repetida = existentes.some(function (n) {
      return !n.retirada && n.publicadaMs !== null && ahoraMs - n.publicadaMs >= 0 && ahoraMs - n.publicadaMs < NOT_DUPLICADO_MS &&
        notNormalizar_(n.titulo) === notNormalizar_(titulo) && notNormalizar_(n.texto) === notNormalizar_(texto) && n.destinatarios.join(";") === claveDest;
    });
    if (repetida) return { success: false, error: "Esa misma nota ya se acaba de publicar." };
    let maxId = 0;
    existentes.forEach(function (n) { if (n.id > maxId) maxId = n.id; });
    const nuevoId = maxId + 1;
    const publicadaTxt = notFechaTxt_(ahoraMs);

    if (foto) notGuardarFoto_(hf.sheet, nuevoId, foto);       // si falla, no se crea la nota
    h.sheet.appendRow([nuevoId, titulo, texto, v.tipo, v.fijada ? "Sí" : "No", publicadaTxt, vis.caducaTxt, vis.duracionTxt, creador, "Activa", "",
      claveDest, obligatoria ? "Sí" : "No", "No solicitado", foto ? "Sí" : ""]);
    SpreadsheetApp.flush();

    let correo = "no";
    if (avisar) {
      const fila = h.sheet.getLastRow();
      const ok = notEnviarCorreo_({
        id: nuevoId, titulo: titulo, texto: texto, tipo: v.tipo, fijada: v.fijada, publicadaTxt: publicadaTxt,
        caducaTxt: vis.caducaTxt, autor: creador, destinatarios: destinatarios, obligatoria: obligatoria
      }, foto);
      correo = ok ? "enviado" : "fallo";
      try {
        h.sheet.getRange(fila, 14).setValue(ok ? "Enviado" : "NO enviado");
        SpreadsheetApp.flush();
      } catch (e) {
        Logger.log("⚠️ No se pudo apuntar el resultado del correo de la nota #" + nuevoId + ": " + e.message);
      }
    }
    return { success: true, id: nuevoId, caduca: vis.caducaTxt, duracion: vis.duracionTxt, correo: correo, destinatarios: destinatarios };
  } catch (e) {
    Logger.log("❌ Error publicando nota: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// data = { id, jefe }. Idempotente: si ya estaba enterado no cambia la hora. Solo las notas que van para ese jefe.
function marcarNotaEnterada(data) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la nota.");
  data.jefe = jefeVigente_(data.jefe);
  if (!data.jefe || JEFES_EQUIPO.indexOf(data.jefe) === -1) throw new Error("Jefe de equipo no reconocido.");
  const h = notObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = notTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const n = notLeer_(h.sheet).filter(function (x) { return String(x.id) === String(data.id).trim(); })[0];
    if (!n) return { success: false, error: "Nota no encontrada." };
    if (!notEstaActiva_(n, Date.now())) return { success: false, error: "Esta nota ya no está activa." };
    if (!notVisiblePara_(n, data.jefe)) return { success: false, error: "Esta nota no va dirigida a ti." };
    if (n.enterados.some(function (e) { return e.jefe === data.jefe; })) return { success: true, yaEstaba: true };
    const lista = n.enterados.concat([{ jefe: data.jefe, fecha: notFechaTxt_(Date.now()) }]);
    h.sheet.getRange(n.fila, 11).setValue(lista.map(function (e) { return e.jefe + "=" + e.fecha; }).join(";"));
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log("❌ Error marcando nota como enterada: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Busca una nota por ID y aplica `cambiar(n, hoja)` bajo bloqueo. Devuelve { success } o { success:false, error }.
function notModificar_(data, cambiar) {
  if (!data || data.id === undefined || data.id === null || String(data.id).trim() === "") throw new Error("Falta la nota.");
  const h = notObtenerHoja_();
  if (h.error) return { success: false, error: h.error };
  const lock = notTomarLock_();
  if (!lock) return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo." };
  try {
    const n = notLeer_(h.sheet).filter(function (x) { return String(x.id) === String(data.id).trim(); })[0];
    if (!n) return { success: false, error: "Nota no encontrada." };
    const r = cambiar(n, h.sheet);
    SpreadsheetApp.flush();
    return r;
  } catch (e) {
    Logger.log("❌ Error modificando nota: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// La nota deja de verse para todos (queda en el historial del supervisor).
function retirarNota(data) {
  return notModificar_(data, function (n, sheet) {
    if (n.retirada) return { success: false, error: "Esta nota ya estaba retirada." };
    sheet.getRange(n.fila, 10).setValue("Retirada");
    return { success: true };
  });
}

// Fija o desfija una nota (las fijadas salen arriba).
function fijarNota(data) {
  const fijada = !!(data && data.fijada === true);
  return notModificar_(data, function (n, sheet) {
    if (!notEstaActiva_(n, Date.now())) return { success: false, error: "Solo se pueden fijar notas activas." };
    sheet.getRange(n.fila, 5).setValue(fijada ? "Sí" : "No");
    return { success: true, fijada: fijada };
  });
}

// Vuelve a publicar una nota caducada o retirada (o alarga una activa): nueva caducidad contada desde AHORA.
// data = { id, duracion: { valor, unidad } | sin_caducidad: true }. Los «enterados» se conservan.
function renovarNota(data) {
  const ahoraMs = Date.now();
  const vis = notResolverVisibilidad_(data || {}, ahoraMs);
  return notModificar_(data, function (n, sheet) {
    sheet.getRange(n.fila, 7, 1, 2).setValues([[vis.caducaTxt, vis.duracionTxt]]);
    sheet.getRange(n.fila, 10).setValue("Activa");
    return { success: true, caduca: vis.caducaTxt, duracion: vis.duracionTxt };
  });
}

// Reenvía el correo de una nota activa (cuando salió «NO enviado», o para recordarla). data = { id }.
function reenviarCorreoNota(data) {
  return notModificar_(data, function (n, sheet) {
    if (!notEstaActiva_(n, Date.now())) return { success: false, error: "Solo se puede reenviar el correo de una nota activa." };
    const ok = notEnviarCorreo_(n, n.tieneFoto ? notLeerFoto_(n.id) : "");
    sheet.getRange(n.fila, 14).setValue(ok ? "Enviado" : "NO enviado");
    return ok ? { success: true, correo: "enviado" } : { success: false, error: "El correo no se pudo enviar. Inténtalo de nuevo en un rato." };
  });
}
