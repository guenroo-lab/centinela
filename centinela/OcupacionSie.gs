// ============================================================
//  CENTINELA — OCUPACIÓN DEL ALMACÉN SIE (solo lectura)
//  Enseña a los jefes de equipo los volúmenes de almacenamiento de Mijas y Marbella: % de ocupación, huecos
//  libres y ocupados, evolución y últimos registros. Los datos los guarda la app «Ocupación Tiendas SIE»
//  (proyecto aparte, su Sheet «Registro Semanal»); los registran los operarios desde Kairos. Centinela
//  NUNCA escribe aquí. Contraparte: OcupacionTiendas/Api.js (doGet?accion=ocupacion).
//  Mismo patrón que HodosPendientes.gs: llamada con el token de quien abre la app (el web app del motor es solo
//  de dominio). Si el motor no contesta, se enseña la última copia buena (hasta 6 h) avisando de que es una copia.
// ============================================================

const OCUPACION_SIE_CACHE_FRESCA_ = "ocupacion_sie_fresca_v1";
const OCUPACION_SIE_CACHE_COPIA_ = "ocupacion_sie_copia_v1";
const OCUPACION_SIE_FRESCA_SEG_ = 60;
const OCUPACION_SIE_COPIA_SEG_ = 6 * 60 * 60;

function obtenerOcupacionSie(forzar) {
  const r = obtenerOcupacionSieBruto_(!!forzar);
  if (!r.ok && !r.copia) {
    const a = infoAutorizacion_();
    r.permisoFalta = a.falta;
    if (a.url) r.autorizarUrl = a.url;
  }
  return r;
}

function obtenerOcupacionSieBruto_(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) {
    try {
      const fresca = cache.get(OCUPACION_SIE_CACHE_FRESCA_);
      if (fresca) return JSON.parse(fresca);
    } catch (e) { /* sin caché se lee directo */ }
  }

  const r = leerOcupacionSieDelMotor_();
  if (r.ok) {
    r.origen = "vivo";
    try {
      const texto = JSON.stringify(r);
      cache.put(OCUPACION_SIE_CACHE_FRESCA_, texto, OCUPACION_SIE_FRESCA_SEG_);
      cache.put(OCUPACION_SIE_CACHE_COPIA_, texto, OCUPACION_SIE_COPIA_SEG_);
    } catch (e) { /* demasiado grande o sin caché: da igual */ }
    return r;
  }

  // El motor no ha contestado: la última copia buena, avisando de que lo es.
  try {
    const copia = cache.get(OCUPACION_SIE_CACHE_COPIA_);
    if (copia) {
      const c = JSON.parse(copia);
      c.origen = "copia";
      c.copia = true;
      c.errorMotor = r.error;
      return c;
    }
  } catch (e) { /* no hay copia utilizable */ }
  return r;
}

function leerOcupacionSieDelMotor_() {
  try {
    const resp = UrlFetchApp.fetch(CONFIG.OCUPACION_SIE_URL + "?accion=ocupacion", {
      method: "get",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
      followRedirects: true
    });
    let json;
    try {
      json = JSON.parse(resp.getContentText());
    } catch (eParse) {
      return { ok: false, error: "La app de Ocupación no respondió con datos (código " + resp.getResponseCode() + "). Puede faltar el permiso o su versión nueva." };
    }
    if (!json || typeof json !== "object") return { ok: false, error: "Respuesta no válida de la app de Ocupación." };
    if (!json.ok) return { ok: false, error: json.error || "La app de Ocupación devolvió un error." };
    return json;
  } catch (err) {
    Logger.log("❌ leerOcupacionSieDelMotor_: " + err.message);
    return { ok: false, error: err.message };
  }
}
