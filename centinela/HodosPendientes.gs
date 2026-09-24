// ============================================================
//  CENTINELA — PENDIENTES DE HODOS (solo lectura)
//  Pide a HODOS los soportes "vivos" de una tienda (REGISTRADO, aún no
//  cargados en ningún camión) para imprimir su "silueta" junto a la
//  plantilla de carga. No escribe nada en HODOS.
//  Contraparte en HODOS: IntegracionCentinela.gs (doGet?accion=pendientesTienda).
// ============================================================

// Las únicas tiendas que gestiona HODOS (mismas grafías que HODOS).
const TIENDAS_HODOS_ = ["Málaga", "Marbella", "Mijas", "Granada"];

function normalizarTiendaHodos_(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Si al usuario le falta algún permiso (p. ej. desmarcó una casilla en la pantalla de
// permisos), Apps Script no vuelve a preguntar solo: hay que darle el enlace para repetirlo.
function infoAutorizacion_() {
  try {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    const falta = info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
    return { falta: falta, url: falta ? (info.getAuthorizationUrl() || "") : "" };
  } catch (e) {
    return { falta: false, url: "", error: e.message };
  }
}

function obtenerPendientesHodos(tienda) {
  const r = obtenerPendientesHodosBruto_(tienda);
  if (!r.ok && !r.sinTienda) {
    const a = infoAutorizacion_();
    r.permisoFalta = a.falta;
    if (a.url) r.autorizarUrl = a.url;
  }
  return r;
}

function obtenerPendientesHodosBruto_(tienda) {
  try {
    const buscada = normalizarTiendaHodos_(tienda);
    const t = TIENDAS_HODOS_.filter(function (x) { return normalizarTiendaHodos_(x) === buscada; })[0];
    if (!t) return { ok: false, sinTienda: true, error: 'HODOS no gestiona la tienda "' + tienda + '"' };

    const resp = UrlFetchApp.fetch(CONFIG.HODOS_WEBAPP_URL + "?accion=pendientesTienda&tienda=" + encodeURIComponent(t), {
      method: "get",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
      followRedirects: true
    });
    const texto = resp.getContentText();
    let json;
    try {
      json = JSON.parse(texto);
    } catch (eParse) {
      return { ok: false, error: "HODOS no respondió con datos (código " + resp.getResponseCode() + "). Puede faltar el permiso o la versión nueva de HODOS." };
    }
    if (!json || !json.ok) return { ok: false, error: (json && json.error) || "HODOS devolvió un error" };
    return json;
  } catch (err) {
    Logger.log("❌ obtenerPendientesHodos: " + err.message);
    return { ok: false, error: err.message };
  }
}

// Los permisos están declarados a mano en appsscript.json (oauthScopes). Con clasp, Apps Script NO
// recalcula los permisos automáticos al subir el código, así que sin esa lista la llamada a
// UrlFetchApp falla con "No tienes permiso para llamar a UrlFetchApp.fetch". drive.readonly
// va ahí porque el web app de HODOS (acceso solo dominio) exige un token con permiso de Drive.
