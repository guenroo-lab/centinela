// ============================================================
//  CENTINELA — CORREOS "PREMIUM"
//  Un solo constructor para que todos los correos nuevos de la app tengan el mismo aspecto:
//  cabecera con logo, insignia con emoji, etiqueta + título, chips, filas con icono, bloques
//  destacados (comentarios, descripciones), fotos, botón y pie. Tabla + estilos en línea (los
//  clientes de correo no entienden nada más moderno) y todo el texto dinámico se escapa aquí,
//  así que quien lo use pasa TEXTO PLANO, nunca HTML.
//
//  cfg = {
//    acento: "#e30613",                      // color de la franja, la insignia y el botón
//    emoji: "📦", etiqueta: "PETICIÓN DE CONSUMIBLES", titulo: "…", subtitulo: "…" (opcional),
//    preheader: "…" (opcional: lo que se ve en la bandeja junto al asunto),
//    chips:   [{ texto: "👤 Sebastián", tono: "neutro|ok|aviso|alerta|info" }],
//    filas:   [{ icono: "🏷️", etiqueta: "Etiquetas", valor: "texto plano", pills: [{texto, color}] (opcional) }],
//    bloques: [{ icono: "💬", titulo: "Comentario", texto: "…", acento: "#4c7dff" (opcional) }],
//    fotos:   [{ cid: "foto1", blob: Blob, titulo: "…" }],
//    boton:   { texto: "Abrir Centinela", url: "https://…" } (opcional),
//    nota: "…" (opcional: línea final antes del pie)
//  }
//  correoPremium_(cfg) -> { html, texto, imagenes }        correoPremiumEnviar_({ para, cc, asunto, cfg }) -> true/false
// ============================================================

const CP_FONDO_ = "#070a12";
const CP_TARJETA_ = "#0e1320";
const CP_PANEL_ = "#141b2d";
const CP_LINEA_ = "#1e2740";
const CP_TEXTO_ = "#f0f4ff";
const CP_TEXTO_SUAVE_ = "#a3b0cc";
const CP_TEXTO_TENUE_ = "#6b7899";
const CP_FUENTE_ = "'Segoe UI',Helvetica,Arial,sans-serif";
const CP_TONOS_ = {
  neutro: { fondo: "#1a2236", texto: "#c7cede" },
  ok: { fondo: "#11301f", texto: "#4ade80" },
  aviso: { fondo: "#3a2c0b", texto: "#f0b429" },
  alerta: { fondo: "#3b1218", texto: "#ff6b78" },
  info: { fondo: "#12233f", texto: "#7fb0ff" }
};

// Mezcla dos colores #rrggbb (t = 0 -> a, t = 1 -> b).
function cpMezclar_(a, b, t) {
  const p = function (h) {
    const s = String(h).replace("#", "");
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const x = p(a), y = p(b);
  const c = function (i) { return ("0" + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2); };
  return "#" + c(0) + c(1) + c(2);
}

// Texto blanco u oscuro según lo claro que sea el fondo (para el botón y las pastillas de color).
function cpTextoSobre_(hex) {
  const s = String(hex).replace("#", "");
  const l = (0.299 * parseInt(s.slice(0, 2), 16) + 0.587 * parseInt(s.slice(2, 4), 16) + 0.114 * parseInt(s.slice(4, 6), 16)) / 255;
  return l > 0.62 ? "#0b0f1a" : "#ffffff";
}

function cpColorValido_(c, defecto) {
  return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : defecto;
}

function cpSaltos_(texto) {
  return escapeHtml(texto).replace(/\n/g, "<br>");
}

function cpChip_(chip) {
  const tono = CP_TONOS_[chip.tono] || CP_TONOS_.neutro;
  return "<span style=\"display:inline-block;padding:6px 13px;margin:0 8px 8px 0;border-radius:50px;background:" + tono.fondo +
    ";color:" + tono.texto + ";font-size:12.5px;font-weight:700;line-height:1.2;\">" + escapeHtml(chip.texto) + "</span>";
}

function cpPill_(pill) {
  const color = cpColorValido_(pill.color, "#6b7899");
  return "<span style=\"display:inline-block;padding:4px 11px;margin:0 6px 4px 0;border-radius:50px;background:" + color +
    ";color:" + cpTextoSobre_(color) + ";font-size:12.5px;font-weight:800;line-height:1.2;\">" + escapeHtml(pill.texto) + "</span>";
}

function cpFila_(f, primera) {
  const valor = (f.pills && f.pills.length)
    ? f.pills.map(cpPill_).join("")
    : "<span style=\"font-size:15.5px;font-weight:600;color:" + CP_TEXTO_ + ";line-height:1.45;\">" + cpSaltos_(f.valor) + "</span>";
  return "<tr><td style=\"padding:14px 0;" + (primera ? "" : "border-top:1px solid " + CP_LINEA_ + ";") + "\">" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
    "<td width=\"44\" valign=\"top\" style=\"font-size:22px;line-height:1.2;\">" + escapeHtml(f.icono || "•") + "</td>" +
    "<td valign=\"top\"><div style=\"font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:" + CP_TEXTO_TENUE_ + ";margin-bottom:4px;\">" + escapeHtml(f.etiqueta) + "</div>" +
    valor + "</td></tr></table></td></tr>";
}

function cpBloque_(b, acentoDefecto) {
  const color = cpColorValido_(b.acento, acentoDefecto);
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 16px;\"><tr>" +
    "<td width=\"4\" bgcolor=\"" + color + "\" style=\"background:" + color + ";border-radius:4px;font-size:0;line-height:0;\">&nbsp;</td>" +
    "<td bgcolor=\"" + CP_PANEL_ + "\" style=\"background:" + CP_PANEL_ + ";border-radius:0 14px 14px 0;padding:16px 18px;\">" +
    "<div style=\"font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:" + CP_TEXTO_TENUE_ + ";margin-bottom:8px;\">" +
    escapeHtml((b.icono ? b.icono + "  " : "") + b.titulo) + "</div>" +
    "<div style=\"font-size:15px;line-height:1.65;color:" + CP_TEXTO_ + ";\">" + cpSaltos_(b.texto) + "</div></td></tr></table>";
}

function cpFoto_(f) {
  return "<div style=\"margin:0 0 16px;\"><div style=\"font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:" + CP_TEXTO_TENUE_ + ";margin-bottom:8px;\">📷  " + escapeHtml(f.titulo || "Foto") + "</div>" +
    "<img src=\"cid:" + escapeHtml(f.cid) + "\" alt=\"" + escapeHtml(f.titulo || "Foto") + "\" width=\"536\" style=\"max-width:100%;height:auto;border-radius:14px;display:block;border:1px solid " + CP_LINEA_ + ";\"></div>";
}

function correoPremium_(cfg) {
  const acento = cpColorValido_(cfg.acento, "#e30613");
  const acento2 = cpMezclar_(acento, "#4c7dff", 0.45);
  const tinte = cpMezclar_(acento, CP_TARJETA_, 0.78);
  const tz = Session.getScriptTimeZone();
  const ahora = new Date();
  const fechaHora = Utilities.formatDate(ahora, tz, "dd/MM/yyyy") + " a las " + Utilities.formatDate(ahora, tz, "HH:mm");
  const chips = cfg.chips || [], filas = cfg.filas || [], bloques = cfg.bloques || [], fotos = cfg.fotos || [];

  const imagenes = {};
  const logoBlob = dataUriABlob(LOGO_TAISA_DATA_URI, "logo_taisa.png");
  if (logoBlob) imagenes.logotaisa = logoBlob;
  fotos.forEach(function (f) { if (f && f.blob) imagenes[f.cid] = f.blob; });

  const marca = logoBlob
    ? "<span style=\"display:inline-block;background:#ffffff;padding:9px 15px;border-radius:12px;\"><img src=\"cid:logotaisa\" alt=\"Taisa Logistics\" width=\"112\" style=\"width:112px;height:auto;display:block;\"></span>"
    : "<span style=\"font-size:16px;font-weight:800;color:" + CP_TEXTO_ + ";\">Taisa Logistics</span>";

  let cuerpo = "";
  cuerpo += "<tr><td style=\"padding:32px 34px 6px;\">" +
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 18px;\"><tr>" +
    "<td width=\"60\" height=\"60\" align=\"center\" valign=\"middle\" bgcolor=\"" + tinte + "\" style=\"background:" + tinte + ";border:1px solid " + cpMezclar_(acento, CP_TARJETA_, 0.5) + ";border-radius:18px;font-size:30px;line-height:60px;\">" + escapeHtml(cfg.emoji || "📌") + "</td></tr></table>" +
    "<div style=\"font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:" + acento + ";margin-bottom:8px;\">" + escapeHtml(cfg.etiqueta || "") + "</div>" +
    "<h1 style=\"margin:0 0 " + (cfg.subtitulo ? "8" : "18") + "px;font-size:26px;line-height:1.25;font-weight:800;color:" + CP_TEXTO_ + ";\">" + escapeHtml(cfg.titulo || "") + "</h1>" +
    (cfg.subtitulo ? "<p style=\"margin:0 0 18px;font-size:15px;line-height:1.55;color:" + CP_TEXTO_SUAVE_ + ";\">" + cpSaltos_(cfg.subtitulo) + "</p>" : "") +
    (chips.length ? "<div style=\"margin:0 0 6px;\">" + chips.map(cpChip_).join("") + "</div>" : "") +
    "</td></tr>";

  if (filas.length) {
    cuerpo += "<tr><td style=\"padding:6px 34px 10px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" +
      filas.map(function (f, i) { return cpFila_(f, i === 0); }).join("") + "</table></td></tr>";
  }
  if (bloques.length || fotos.length) {
    cuerpo += "<tr><td style=\"padding:8px 34px 8px;\">" + bloques.map(function (b) { return cpBloque_(b, acento); }).join("") + fotos.map(cpFoto_).join("") + "</td></tr>";
  }
  if (cfg.boton && cfg.boton.url) {
    cuerpo += "<tr><td align=\"center\" style=\"padding:14px 34px 12px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
      "<td align=\"center\" bgcolor=\"" + acento + "\" style=\"background:" + acento + ";border-radius:50px;\">" +
      "<a href=\"" + escapeHtml(cfg.boton.url) + "\" target=\"_blank\" style=\"display:inline-block;padding:15px 38px;font-family:" + CP_FUENTE_ + ";font-size:15px;font-weight:800;color:" + cpTextoSobre_(acento) + ";text-decoration:none;border-radius:50px;\">" +
      escapeHtml(cfg.boton.texto || "Abrir") + "  →</a></td></tr></table></td></tr>";
  }
  cuerpo += "<tr><td style=\"padding:22px 34px 30px;\">" +
    (cfg.nota ? "<p style=\"margin:0 0 14px;font-size:13px;line-height:1.55;color:" + CP_TEXTO_SUAVE_ + ";text-align:center;\">" + cpSaltos_(cfg.nota) + "</p>" : "") +
    "<div style=\"border-top:1px solid " + CP_LINEA_ + ";padding-top:16px;text-align:center;font-size:12px;line-height:1.7;color:" + CP_TEXTO_TENUE_ + ";\">" +
    "<b style=\"color:" + CP_TEXTO_SUAVE_ + ";\">Centinela</b> · Taisa Logistics · Almacén Málaga<br>🕒 " + escapeHtml(fechaHora) + " · Mensaje automático</div></td></tr>";

  const preheader = String(cfg.preheader || cfg.titulo || "");
  const html = "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<meta name=\"color-scheme\" content=\"dark\"><meta name=\"supported-color-schemes\" content=\"dark\"><title>" + escapeHtml(cfg.titulo || "Centinela") + "</title></head>" +
    "<body style=\"margin:0;padding:0;background:" + CP_FONDO_ + ";font-family:" + CP_FUENTE_ + ";color:" + CP_TEXTO_ + ";\">" +
    "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;\">" + escapeHtml(preheader) + "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"" + CP_FONDO_ + "\" style=\"background:" + CP_FONDO_ + ";\"><tr><td align=\"center\" style=\"padding:26px 12px;\">" +
    "<table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;max-width:600px;\">" +
    "<tr><td style=\"padding:0 6px 16px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td align=\"left\">" + marca + "</td>" +
    "<td align=\"right\" style=\"font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:" + CP_TEXTO_TENUE_ + ";\">Centinela</td></tr></table></td></tr>" +
    "<tr><td><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"" + CP_TARJETA_ + "\" style=\"background:" + CP_TARJETA_ + ";border:1px solid " + CP_LINEA_ + ";border-radius:24px;overflow:hidden;\">" +
    "<tr><td height=\"6\" bgcolor=\"" + acento + "\" style=\"height:6px;background:" + acento + ";background-image:linear-gradient(90deg," + acento + "," + acento2 + ");font-size:0;line-height:0;\">&nbsp;</td></tr>" +
    cuerpo + "</table></td></tr></table></td></tr></table></body></html>";

  const lineas = [String(cfg.emoji || "") + " " + String(cfg.etiqueta || "").toUpperCase(), String(cfg.titulo || "")];
  if (cfg.subtitulo) lineas.push(String(cfg.subtitulo));
  if (chips.length) lineas.push("", chips.map(function (c) { return c.texto; }).join(" · "));
  if (filas.length) {
    lineas.push("");
    filas.forEach(function (f) {
      const v = (f.pills && f.pills.length) ? f.pills.map(function (p) { return p.texto; }).join(", ") : f.valor;
      lineas.push((f.icono ? f.icono + " " : "") + f.etiqueta + ": " + v);
    });
  }
  bloques.forEach(function (b) { lineas.push("", (b.icono ? b.icono + " " : "") + b.titulo + ":", String(b.texto)); });
  if (cfg.boton && cfg.boton.url) lineas.push("", (cfg.boton.texto || "Abrir") + ": " + cfg.boton.url);
  if (cfg.nota) lineas.push("", String(cfg.nota));
  lineas.push("", "— Centinela · Taisa Logistics · " + fechaHora);
  return { html: html, texto: lineas.join("\n"), imagenes: imagenes };
}

// Envía el correo. El HTML pasa por htmlSeguro_ (los emojis fuera del plano básico llegan rotos si el
// correo lleva imágenes incrustadas). Nunca lanza: devuelve false y lo deja en el log.
function correoPremiumEnviar_(o) {
  try {
    const c = correoPremium_(o.cfg);
    const opciones = { htmlBody: htmlSeguro_(c.html), name: "Centinela — Taisa Logistics" };
    // o.sinCopia: correos de gestión interna (aprobaciones) que NO llevan a los responsables en copia automática.
    const cc = o.sinCopia ? (Array.isArray(o.cc) ? o.cc.join(", ") : String(o.cc || "")) : ccConResponsables_(o.para, o.cc);
    if (cc) opciones.cc = cc;
    if (Object.keys(c.imagenes).length) opciones.inlineImages = c.imagenes;
    const para = Array.isArray(o.para) ? o.para.join(", ") : String(o.para);
    GmailApp.sendEmail(para, asuntoSeguro_(o.asunto), sinAstrales_(c.texto), opciones);
    return true;
  } catch (e) {
    Logger.log("❌ Error enviando correo «" + (o && o.asunto) + "»: " + e.message);
    return false;
  }
}
