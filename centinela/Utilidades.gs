function escapeHtml(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// La valoración siempre debe quedar entre 1 y 5, venga como venga del cliente.
function clampEstado(valor) {
  const n = parseInt(valor, 10);
  if (isNaN(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

function estadoLabel(val) {
  const labels = { 1: "Critico", 2: "Deficiente", 3: "Aceptable", 4: "Bueno", 5: "Excelente" };
  return labels[clampEstado(val)];
}

function colorPorPuntuacion(valor) {
  if (valor >= CONFIG.UMBRAL_VERDE) return "#22c55e";
  if (valor >= CONFIG.UMBRAL_AMARILLO) return "#f0b429";
  return "#e30613";
}

// GmailApp codifica mal los caracteres fuera del plano básico (emojis como 🕕, 🌐 o 😡) en el
// htmlBody cuando el correo lleva imágenes incrustadas: llegan como "������". Escritos como
// entidad numérica (&#128341;) el cliente de correo los pinta bien. Aplicar a todo htmlBody.
function htmlSeguro_(html) {
  return String(html == null ? "" : html).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function (par) {
    return "&#" + par.codePointAt(0) + ";";
  });
}

// Lo mismo pasa con el ASUNTO y con un cuerpo de TEXTO PLANO (htmlSeguro_ solo cubre el HTML): Gmail muestra un
// emoji fuera del plano básico como «������». Aquí se quitan (junto con los selectores de variación y uniones que
// los acompañan), sin tocar lo que sí es del plano básico. Esos SÍ se ven bien en Gmail, también como emoji a todo
// color: ⏰ ➕ ❗ ❕ ✅ ⭐ ⚡ ⚠️ ♻️ ✉️. Por eso los asuntos llevan esos y no 📌 🔁 📅 📦. Cubre también emojis
// tecleados por los jefes en títulos o textos libres que acaben en un asunto.
function sinAstrales_(texto) {
  return String(texto == null ? "" : texto)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF][︎️‍]*/g, "")   // el emoji astral y lo que le cuelga
    .replace(/[\uD800-\uDFFF]/g, "")                                          // un sustituto suelto (dato corrupto)
    .replace(/(^|\s)[︎️‍]+/g, "$1");                           // un selector huérfano al principio
}

// Asunto seguro: sin emojis astrales, en una sola línea y nunca vacío.
function asuntoSeguro_(asunto) {
  return sinAstrales_(asunto).replace(/\s+/g, " ").trim() || "Centinela";
}

// José y Pedro (CORREOS_RESPONSABLES) van en copia de TODO correo que genera la app.
// Devuelve el campo `cc` completo: los cc propios del correo + los responsables, sin repetir
// direcciones ni poner en copia a quien ya va en `para`. "" si no queda nadie.
function ccConResponsables_(para, cc) {
  const lista = function (x) {
    return (Array.isArray(x) ? x : String(x || "").split(/[,;]/)).map(function (m) { return String(m).trim(); }).filter(Boolean);
  };
  const vistos = {};
  lista(para).forEach(function (m) { vistos[m.toLowerCase()] = true; });
  const resultado = [];
  lista(cc).concat(CORREOS_RESPONSABLES).forEach(function (m) {
    const k = m.toLowerCase();
    if (!vistos[k]) { vistos[k] = true; resultado.push(m); }
  });
  return resultado.join(", ");
}

// Convierte un data-URI del navegador en Blob para adjuntarlo como imagen inline.
function dataUriABlob(dataUri, nombreArchivo) {
  if (!dataUri || typeof dataUri !== "string") return null;
  const partes = dataUri.match(/^data:(image\/[a-zA-Z0-9+.\-]+);base64,([\s\S]+)$/);
  if (!partes) return null;
  try {
    const bytes = Utilities.base64Decode(partes[2]);
    return Utilities.newBlob(bytes, partes[1], nombreArchivo);
  } catch (e) {
    Logger.log("⚠️ No se pudo decodificar la foto " + nombreArchivo + ": " + e.message);
    return null;
  }
}


// createHtmlOutputFromFile() NO evalua scriptlets <?!= ?> del archivo
// incluido — si el fragmento incluido tiene uno (p.ej. TurnoUI.html para
// inyectar TURNOS), hace falta createTemplateFromFile(...).evaluate() o se
// inserta el scriptlet tal cual como texto y rompe el <script> del navegador.
function include(nombreArchivo) {
  return HtmlService.createTemplateFromFile(nombreArchivo).evaluate().getContent();
}

// Escribe cabeceras genéricas en cualquier hoja (Turno, Sugerencias, o
// futuros módulos). `cabeceras` es el array de nombres de columna.
function escribirCabeceras(sheet, cabeceras) {
  const headerRange = sheet.getRange(1, 1, 1, cabeceras.length);
  headerRange.setValues([cabeceras]);
  headerRange.setBackground("#0f1220");
  headerRange.setFontColor("#f0f4ff");
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);
}

// Comprueba que la fila 1 sigue teniendo las cabeceras esperadas
// (alguien pudo borrarlas a mano sin borrar la hoja entera).
function cabecerasOk(sheet, cabeceras) {
  if (sheet.getLastRow() === 0) return false;
  const fila1 = sheet.getRange(1, 1, 1, cabeceras.length).getValues()[0];
  return cabeceras.every((h, i) => fila1[i] === h);
}

function asegurarCabeceras_(sheet, cabeceras) {
  if (!cabecerasOk(sheet, cabeceras)) escribirCabeceras(sheet, cabeceras);
}
