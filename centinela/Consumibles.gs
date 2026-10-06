// ============================================================
//  CENTINELA — PETICIÓN DE CONSUMIBLES
//  El jefe de equipo marca lo que falta (y de qué tiendas, en las etiquetas de pedido
//  cliente), añade un comentario y se manda un correo a José Lachambre y a Pedro Gil.
//  Cada petición se apunta en la hoja Peticiones_Consumibles: así se ve qué se pidió ya
//  y nadie duplica el aviso (mismo problema que con el SAT de Maquinaria).
//
//  El catálogo vive AQUÍ y el cliente lo recibe en obtenerPeticionesConsumibles():
//  para añadir un consumible basta una línea en CONS_CATALOGO_.
// ============================================================

const CONS_CATALOGO_ = [
  { id: "etiq_pc", nombre: "Etiquetas de pedido cliente", emoji: "🏷️", tiendas: true },
  { id: "film", nombre: "Film transparente", emoji: "🎞️" },
  { id: "cinta", nombre: "Cinta adhesiva", emoji: "📼" },
  { id: "burbujas", nombre: "Papel de burbujas", emoji: "🎈" },
  { id: "etiq_hodos", nombre: "Etiquetas de HODOS", emoji: "🔖" },
  { id: "etiq_recepcion", nombre: "Etiquetas de recepción", emoji: "📥" },
  { id: "otras", nombre: "Otras", emoji: "➕", texto: true }
];

// Tiendas a elegir en los consumibles con `tiendas: true` (se pueden marcar varias).
const CONS_TIENDAS_ = ["Granada", "Málaga", "Marbella", "Mijas"];

// A quién va la petición. Pedro Gil y José Antonio Alcaide (CORREOS_RESPONSABLES) van además
// en copia, como en cualquier correo de la app; ccConResponsables_ no repite a Pedro.
const CONS_DESTINATARIOS_ = ["jose-manuel.lachambre@leroymerlin.es", "Pedro.gil@ext.leroymerlin.es"];
const CONS_AVISA_A_ = "José Lachambre y Pedro Gil";

const CONS_MAX_OTRAS_ = 80;
const CONS_MAX_COMENTARIO_ = 500;
const CONS_MAX_RECIENTES_ = 15;
// Dos peticiones idénticas del mismo jefe con menos de esto entre ellas = doble pulsación, no un pedido nuevo.
const CONS_VENTANA_DUPLICADO_MS_ = 90 * 1000;

// ── Helpers privados ─────────────────────────────────────────

function consSinAcentos_(texto) {
  return String(texto == null ? "" : texto).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function consBuscarCatalogo_(id) {
  for (let i = 0; i < CONS_CATALOGO_.length; i++) {
    if (CONS_CATALOGO_[i].id === id) return CONS_CATALOGO_[i];
  }
  return null;
}

// "malaga", "MÁLAGA " ... -> "Málaga". null si no es una de las tiendas.
function consTiendaCanonica_(texto) {
  const k = consSinAcentos_(texto).trim().toLowerCase();
  for (let i = 0; i < CONS_TIENDAS_.length; i++) {
    if (consSinAcentos_(CONS_TIENDAS_[i]).toLowerCase() === k) return CONS_TIENDAS_[i];
  }
  return null;
}

// Valida y normaliza lo que manda el cliente (nunca se fía de él: ids del catálogo, tiendas de la
// lista, textos acotados). Devuelve { quien, items, comentario } o lanza Error con un mensaje para el usuario.
function consLimpiarPeticion_(data) {
  if (!data) throw new Error("No se han recibido datos.");
  const quien = jefeVigente_(data.jefe_equipo);
  if (!quien) throw new Error("Falta indicar quién eres.");
  if (JEFES_EQUIPO.indexOf(quien) === -1 && quien !== IDENTIDAD_SUPERVISOR) {
    throw new Error("Jefe de equipo no reconocido: " + quien);
  }

  const porId = {};
  (Array.isArray(data.items) ? data.items : []).forEach(function (it) {
    const def = it && typeof it.id === "string" ? consBuscarCatalogo_(it.id) : null;
    if (!def) throw new Error("Consumible no válido.");
    const limpio = porId[def.id] || (porId[def.id] = { id: def.id });
    if (def.tiendas) {
      const lista = limpio.tiendas || (limpio.tiendas = []);
      (Array.isArray(it.tiendas) ? it.tiendas : []).forEach(function (t) {
        const canon = consTiendaCanonica_(t);
        if (!canon) throw new Error("Tienda no válida: " + t);
        if (lista.indexOf(canon) === -1) lista.push(canon);
      });
    }
    if (def.texto) {
      const texto = String(it.texto == null ? "" : it.texto).replace(/\s+/g, " ").trim();
      if (texto.length > CONS_MAX_OTRAS_) {
        throw new Error("Lo que pides en «" + def.nombre + "» es demasiado largo (máximo " + CONS_MAX_OTRAS_ + " caracteres).");
      }
      if (texto) limpio.texto = texto;
    }
  });

  // En el orden del catálogo, con la regla de cada tipo.
  const items = [];
  CONS_CATALOGO_.forEach(function (def) {
    const l = porId[def.id];
    if (!l) return;
    if (def.tiendas) {
      if (!l.tiendas.length) throw new Error("Elige al menos una tienda para «" + def.nombre + "».");
      l.tiendas.sort(function (a, b) { return CONS_TIENDAS_.indexOf(a) - CONS_TIENDAS_.indexOf(b); });
    }
    if (def.texto && !l.texto) throw new Error("Escribe qué necesitas en «" + def.nombre + "».");
    items.push(l);
  });
  if (!items.length) throw new Error("Marca al menos un consumible.");

  const comentario = String(data.comentario == null ? "" : data.comentario).replace(/\r\n?/g, "\n").trim();
  if (comentario.length > CONS_MAX_COMENTARIO_) {
    throw new Error("El comentario es demasiado largo (máximo " + CONS_MAX_COMENTARIO_ + " caracteres).");
  }
  return { quien: quien, items: items, comentario: comentario };
}

// "Etiquetas de pedido cliente (Málaga, Mijas)" / "Otras: guantes" / "Film transparente"
function consEtiquetaItem_(it) {
  const def = consBuscarCatalogo_(it.id);
  const nombre = def ? def.nombre : String(it.id);
  if (it.tiendas && it.tiendas.length) return nombre + " (" + it.tiendas.join(", ") + ")";
  if (it.texto) return nombre + ": " + it.texto;
  return nombre;
}

function consResumen_(items) {
  return items.map(consEtiquetaItem_).join("; ");
}

// Cualquier cosa que haya en la celda de items -> lista limpia (nunca lanza: una fila escrita a mano no rompe la lista).
function consLeerItems_(texto) {
  try {
    const lista = JSON.parse(String(texto || "[]"));
    if (!Array.isArray(lista)) return [];
    return lista.filter(function (it) { return it && typeof it.id === "string"; }).map(function (it) {
      const o = { id: it.id };
      if (Array.isArray(it.tiendas)) o.tiendas = it.tiendas.map(String);
      if (typeof it.texto === "string") o.texto = it.texto;
      return o;
    });
  } catch (e) {
    return [];
  }
}

// Colores de tienda de siempre (los mismos que la pestaña): Málaga verde, Marbella azul, Mijas morado, Granada naranja.
const CONS_COLORES_TIENDA_ = { "Málaga": "#38b26e", "Marbella": "#3f9be0", "Mijas": "#9a6ee0", "Granada": "#e79338" };

function consEnviarCorreo_(jefe, items, comentario, fechaStr, horaStr) {
  const n = items.length;
  const filas = items.map(function (it) {
    const def = consBuscarCatalogo_(it.id);
    const f = { icono: (def && def.emoji) || "📦", etiqueta: def ? def.nombre : String(it.id) };
    if (it.tiendas && it.tiendas.length) {
      f.pills = it.tiendas.map(function (t) { return { texto: t, color: CONS_COLORES_TIENDA_[t] }; });
    } else {
      f.valor = it.texto ? it.texto : "Solicitado";
    }
    return f;
  });
  const resumen = consResumen_(items);
  const cfg = {
    acento: "#f59e0b",
    emoji: "📦",
    etiqueta: "Petición de consumibles",
    titulo: "Hace falta reposición",
    subtitulo: jefe + " solicita " + n + (n === 1 ? " artículo" : " artículos") + " para el almacén.",
    preheader: (resumen.length > 110 ? resumen.slice(0, 107) + "…" : resumen) + " — " + jefe,
    chips: [
      { texto: "👤 " + jefe, tono: "neutro" },
      { texto: "🕒 " + fechaStr + " · " + horaStr.slice(0, 5), tono: "info" },
      { texto: "📦 " + n + (n === 1 ? " artículo" : " artículos"), tono: "aviso" }
    ],
    filas: filas,
    bloques: comentario ? [{ icono: "💬", titulo: "Comentario de " + jefe, texto: comentario, acento: "#4c7dff" }] : [],
    nota: "Puedes contestar a este correo: la respuesta le llegará a quien ha hecho la petición."
  };
  const corto = resumen.length > 70 ? resumen.slice(0, 67) + "…" : resumen;
  return correoPremiumEnviar_({
    para: CONS_DESTINATARIOS_,
    asunto: "➕ Petición de consumibles · " + jefe + " · " + corto,      // ➕ (plano básico: se ve bien en Gmail)
    cfg: cfg
  });
}

// ¿Ya se mandó (bien) esta misma petición hace un instante? Solo mira las últimas filas y solo las
// que sí llegaron por correo: si el envío falló, volver a intentarlo tiene que estar permitido.
function consDuplicadaReciente_(sheet, quien, itemsJson, comentario, ahora) {
  const ultima = sheet.getLastRow();
  if (ultima < 2) return false;
  const desde = Math.max(2, ultima - 4);
  const filas = sheet.getRange(desde, 1, ultima - desde + 1, CABECERAS_PETICIONES_CONSUMIBLES.length).getDisplayValues();
  const tz = Session.getScriptTimeZone();
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    if (f[5] !== "Enviado" || f[2] !== quien || f[6] !== itemsJson || f[4] !== comentario) continue;
    try {
      const cuando = Utilities.parseDate(f[0] + " " + f[1], tz, "dd/MM/yyyy HH:mm:ss");
      if (ahora.getTime() - cuando.getTime() < CONS_VENTANA_DUPLICADO_MS_) return true;
    } catch (e) { /* fecha rara escrita a mano: no cuenta */ }
  }
  return false;
}

// ── API pública (google.script.run) ─────────────────────────

// Catálogo + últimas peticiones. Si el historial no se puede leer, el catálogo llega igual
// (avisoHistorial lo explica) para que el formulario se pueda usar.
function obtenerPeticionesConsumibles() {
  const base = {
    ok: true,
    catalogo: CONS_CATALOGO_.map(function (d) { return { id: d.id, nombre: d.nombre, emoji: d.emoji || "", tiendas: !!d.tiendas, texto: !!d.texto }; }),
    tiendas: CONS_TIENDAS_.slice(),
    avisaA: CONS_AVISA_A_,
    peticiones: []
  };
  const ss = abrirHojaCentinela_();
  if (!ss) return { ok: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_PETICIONES_CONSUMIBLES, CABECERAS_PETICIONES_CONSUMIBLES, prepararHojaPeticionesConsumibles_);
  if (!sheet) {
    base.avisoHistorial = "No se pudo leer el historial de peticiones; inténtalo de nuevo en un momento.";
    return base;
  }
  try {
    const ultima = sheet.getLastRow();
    if (ultima >= 2) {
      const desde = Math.max(2, ultima - 59);
      const filas = sheet.getRange(desde, 1, ultima - desde + 1, CABECERAS_PETICIONES_CONSUMIBLES.length).getDisplayValues();
      for (let i = filas.length - 1; i >= 0 && base.peticiones.length < CONS_MAX_RECIENTES_; i--) {
        const f = filas[i];
        if (String(f[0]).trim() === "" && String(f[3]).trim() === "") continue;
        base.peticiones.push({
          fecha: String(f[0]).trim(),
          hora: String(f[1]).trim().slice(0, 5),
          jefe: String(f[2]).trim(),
          resumen: String(f[3]).trim(),
          comentario: String(f[4]).trim(),
          correoOk: f[5] === "Enviado",
          items: consLeerItems_(f[6])
        });
      }
    }
  } catch (e) {
    Logger.log("❌ Error leyendo peticiones de consumibles: " + e.message);
    base.peticiones = [];
    base.avisoHistorial = "No se pudo leer el historial de peticiones.";
  }
  return base;
}

function procesarPeticionConsumibles(data) {
  Logger.log("📥 Petición de consumibles de: " + (data && data.jefe_equipo));
  let limpia;
  try {
    limpia = consLimpiarPeticion_(data);
  } catch (e) {
    return { success: false, error: e.message };
  }

  const ss = abrirHojaCentinela_();
  if (!ss) return { success: false, error: "SPREADSHEET_ID no configurado (ejecuta setupSistemaCompleto)." };
  // ANTES del bloqueo: asegurarHojaPerezosa_ toma el suyo y el de Apps Script no es reentrante.
  const sheet = asegurarHojaPerezosa_(ss, CONFIG.SHEET_NAME_PETICIONES_CONSUMIBLES, CABECERAS_PETICIONES_CONSUMIBLES, prepararHojaPeticionesConsumibles_);
  if (!sheet) return { success: false, error: "No se pudo preparar la hoja de peticiones; inténtalo de nuevo (no se ha enviado nada)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { success: false, error: "No se pudo obtener el bloqueo; inténtalo de nuevo (no se ha enviado nada)." };
  }

  try {
    const ahora = new Date();
    const tz = Session.getScriptTimeZone();
    const fechaStr = Utilities.formatDate(ahora, tz, "dd/MM/yyyy");
    const horaStr = Utilities.formatDate(ahora, tz, "HH:mm:ss");
    const itemsJson = JSON.stringify(limpia.items);

    if (consDuplicadaReciente_(sheet, limpia.quien, itemsJson, limpia.comentario, ahora)) {
      return { success: false, error: "Esa misma petición ya se acaba de enviar. No hace falta repetirla." };
    }

    const emailOk = consEnviarCorreo_(limpia.quien, limpia.items, limpia.comentario, fechaStr, horaStr);

    let guardado = true;
    try {
      sheet.appendRow([fechaStr, horaStr, limpia.quien, consResumen_(limpia.items), limpia.comentario, emailOk ? "Enviado" : "NO enviado", itemsJson]);
      SpreadsheetApp.flush();
    } catch (e) {
      Logger.log("❌ Error guardando la petición de consumibles: " + e.message);
      guardado = false;
    }

    const avisos = [];
    if (!emailOk) avisos.push("El correo NO se pudo enviar: avisa a " + CONS_AVISA_A_ + ".");
    if (!guardado) avisos.push("No se pudo apuntar en el historial de peticiones.");
    const success = emailOk || guardado;
    return {
      success: success,
      emailEnviado: emailOk,
      error: success ? undefined : avisos.join(" | "),
      avisos: avisos
    };
  } catch (e) {
    Logger.log("❌ Error procesando la petición de consumibles: " + e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
