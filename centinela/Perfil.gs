// ============================================================
//  CENTINELA — PERFILES POR CUENTA DE GOOGLE
//  Tres niveles por encima del jefe de equipo, identificados por la CUENTA con la que se abre la app (la app
//  corre como quien la usa, así que Session.getActiveUser() es la persona real y no se puede falsificar desde el
//  navegador, a diferencia del «modo supervisor» de pulsación larga + 467, que es solo un filtro de pantalla):
//    · area  — Jefe de área de Operaciones (Pedro Gil): el único que APRUEBA. Lo que pide aprobación a los demás
//              lo hace él directamente.
//    · mando — el resto de mandos (David del Campo, José Antonio Alcaide): pueden gestionar como siempre, pero lo
//              que las reglas marquen (tareas recurrentes, tareas para todos los jefes, notas urgentes u
//              obligatorias) queda en espera de la aprobación del jefe de área.
//    · jefe  — un jefe de equipo con su cuenta (se reconoce, pero no recibe permisos extra).
//    · otro / desconocido — cualquier otra cuenta / no se pudo leer el correo.
//
//  Regla de oro de este módulo: si NO se puede identificar la cuenta (correo vacío) la app se comporta como antes
//  (sin aprobaciones): mejor perder el control un momento que bloquear a todos. En la pestaña Aprobaciones se ve
//  con qué cuenta te identifica el servidor, para detectarlo.
// ============================================================

const PERFIL_PERSONAS_ = {
  "pedro.gil@ext.leroymerlin.es": { nombre: "Pedro Gil", cargo: "Jefe de área de Operaciones", rol: "area" },
  "david.delcampo@ext.leroymerlin.es": { nombre: "David del Campo", cargo: "Jefe de área de Recepción", rol: "mando" },
  "jose-antonio.alcaide@ext.leroymerlin.es": { nombre: "José Antonio Alcaide", cargo: "Supervisor de la nave", rol: "mando" }
};

const PERFIL_PROP_REGLAS_ = "perfil_reglas_v1";
// Qué pide aprobación a un mando. Todo activado de entrada; el jefe de área lo cambia desde la pestaña Aprobaciones.
const PERFIL_REGLAS_DEFECTO_ = { recurrentes: true, globales: true, urgentes: true };
const PERFIL_REGLAS_TEXTO_ = {
  recurrentes: "Tareas recurrentes (nuevas plantillas, activarlas y cambiar sus días)",
  globales: "Tareas para todos los jefes (globales), ahora o programadas",
  urgentes: "Notas urgentes o de lectura obligatoria"
};

function perfilEmailActual_() {
  try {
    return String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  } catch (e) {
    return "";
  }
}

// { email, nombre, cargo, rol } de quien ejecuta. Nunca lanza.
function perfilActual_() {
  const email = perfilEmailActual_();
  if (!email) return { email: "", nombre: "", cargo: "", rol: "desconocido" };
  const p = PERFIL_PERSONAS_[email];
  if (p) return { email: email, nombre: p.nombre, cargo: p.cargo, rol: p.rol };
  for (let i = 0; i < JEFES_EQUIPO.length; i++) {
    if (String(CORREOS_JEFES_POR_NOMBRE[JEFES_EQUIPO[i]] || "").toLowerCase() === email) {
      return { email: email, nombre: JEFES_EQUIPO[i], cargo: "Jefe de equipo", rol: "jefe" };
    }
  }
  return { email: email, nombre: email, cargo: "", rol: "otro" };
}

// Quién consta como autor de lo que se crea: el nombre real si es el jefe de área o un mando (viene de su cuenta,
// no de lo que mande el navegador); si no, lo que diga el cliente o «Supervisor» (como siempre).
function perfilCreador_(perfil, crudo) {
  if (perfil && (perfil.rol === "area" || perfil.rol === "mando") && perfil.nombre) return perfil.nombre;
  return String(crudo == null ? "" : crudo).trim() || "Supervisor";
}

// Direcciones de quienes aprueban (hoy: el jefe de área).
function perfilCorreosArea_() {
  return Object.keys(PERFIL_PERSONAS_).filter(function (e) { return PERFIL_PERSONAS_[e].rol === "area"; });
}

function perfilNombreArea_() {
  const e = perfilCorreosArea_()[0];
  return e ? PERFIL_PERSONAS_[e].nombre : "el jefe de área";
}

function perfilReglas_() {
  const r = {};
  Object.keys(PERFIL_REGLAS_DEFECTO_).forEach(function (k) { r[k] = PERFIL_REGLAS_DEFECTO_[k]; });
  try {
    const t = PropertiesService.getScriptProperties().getProperty(PERFIL_PROP_REGLAS_);
    const g = t ? JSON.parse(t) : null;
    if (g && typeof g === "object") Object.keys(r).forEach(function (k) { if (typeof g[k] === "boolean") r[k] = g[k]; });
  } catch (e) {
    Logger.log("⚠️ No se pudieron leer las reglas de aprobación (se usan las de por defecto): " + e.message);
  }
  return r;
}

// ¿Lo que esta persona va a hacer necesita el visto bueno del jefe de área? `clave` = una de las reglas.
// El jefe de área nunca lo necesita, ni quien no se pueda identificar (la app se comporta como antes).
function perfilNecesitaAprobacion_(clave, perfil) {
  const p = perfil || perfilActual_();
  if (p.rol === "area" || p.rol === "desconocido") return false;
  return perfilReglas_()[clave] === true;
}

// Para la interfaz: quién eres según el servidor. Las reglas de aprobación solo las recibe el jefe de área.
function obtenerPerfil() {
  const p = perfilActual_();
  const resp = { ok: true, email: p.email, nombre: p.nombre, cargo: p.cargo, rol: p.rol, nombreArea: perfilNombreArea_() };
  if (p.rol === "area") {
    resp.reglas = perfilReglas_();
    resp.reglasTexto = PERFIL_REGLAS_TEXTO_;
  }
  return resp;
}

// Solo el jefe de área. data = { recurrentes, globales, urgentes } (booleanos).
function guardarReglasAprobacion(data) {
  const p = perfilActual_();
  if (p.rol !== "area") return { success: false, error: "Solo el jefe de área puede cambiar las reglas de aprobación." };
  if (!data || typeof data !== "object") throw new Error("No se han recibido datos.");
  const nuevas = perfilReglas_();
  Object.keys(PERFIL_REGLAS_DEFECTO_).forEach(function (k) {
    if (data[k] !== undefined) {
      if (typeof data[k] !== "boolean") throw new Error("Valor no válido para «" + k + "».");
      nuevas[k] = data[k];
    }
  });
  PropertiesService.getScriptProperties().setProperty(PERFIL_PROP_REGLAS_, JSON.stringify(nuevas));
  actividadRegistrar_("reglas", "Reglas de aprobación: " + Object.keys(nuevas).map(function (k) { return k + "=" + (nuevas[k] ? "sí" : "no"); }).join(", "), p);
  return { success: true, reglas: nuevas };
}
