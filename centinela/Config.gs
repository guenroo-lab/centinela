// ── ZONA COMÚN A TODOS LOS TURNOS ─────────────────
// Se fotografía en los 4 roles, siempre como última zona.
const ZONA_DISPOSITIVOS = {
  nombre: "Zona de dispositivos",
  descripcion: "Estado de la zona de dispositivos: carga, orden y disponibilidad"
};

// ── CONFIGURACIÓN DE TURNOS / ROLES ───────────────
const TURNOS = {
  expedicion_manana: {
    id: "expedicion_manana",
    codigo: "EXPM",
    nombre: "Expedición Mañana",
    color_email: "#e30613",
    zonas: [
      { nombre: "Zona siluetas", descripcion: "Estado general de la zona de siluetas" },
      { nombre: "Muelles", descripcion: "Estado de los muelles de carga" },
      { nombre: "Recepción de portada", descripcion: "Zona de recepción y portada" },
      ZONA_DISPOSITIVOS
    ]
  },

  pedido_cliente: {
    id: "pedido_cliente",
    codigo: "PEDC",
    nombre: "Pedido Cliente",
    color_email: "#00c2ff",
    zonas: [
      { nombre: "Zona tratamiento pedido cliente", descripcion: "Estado de la zona de tratamiento de pedidos" },
      { nombre: "Muelles correcaminos", descripcion: "Estado de los muelles correcaminos" },
      { nombre: "Jaulas de devoluciones", descripcion: "Estado de las jaulas de devoluciones" },
      { nombre: "Global pasillos pedido cliente", descripcion: "Estado general de pasillos de pedido cliente" },
      ZONA_DISPOSITIVOS
    ]
  },

  arrastres: {
    id: "arrastres",
    codigo: "ARRA",
    nombre: "Arrastres",
    color_email: "#f0b429",
    zonas: [
      { nombre: "Zona tratamiento arrastres", descripcion: "Estado de la zona de tratamiento de arrastres" },
      { nombre: "Zona inversa", descripcion: "Estado de la zona inversa" },
      { nombre: "Mercancía por tratar para Torija", descripcion: "Estado de mercancía pendiente para Torija" },
      ZONA_DISPOSITIVOS
    ]
  },

  expedicion_tarde: {
    id: "expedicion_tarde",
    codigo: "EXPT",
    nombre: "Expedición Tarde",
    color_email: "#22c55e",
    zonas: [
      { nombre: "Siluetas expediciones", descripcion: "Estado de siluetas de expediciones" },
      { nombre: "Muelles", descripcion: "Estado de los muelles" },
      { nombre: "Siluetas pedido cliente", descripcion: "Estado de siluetas de pedido cliente" },
      { nombre: "Inversa", descripcion: "Estado de la zona inversa" },
      { nombre: "Zona tratamiento pedido clientes", descripcion: "Estado de tratamiento de pedidos" },
      ZONA_DISPOSITIVOS
    ]
  }
};

const JEFES_EQUIPO = [
  "Dani Simo",
  "Daniel Arrastio",
  "Francisco Parada",
  "Sebastián Gelvis"
];

// Nombres escritos con una ortografía anterior que ya se corrigió (filas de las hojas que siguen con la vieja).
// Clave = nombre normalizado (sin tildes, minúsculas, espacios simples); valor = el nombre actual de JEFES_EQUIPO.
// Se tolera al LEER (tareas asignadas, «enterado» de notas); lo que se escribe ya lleva el nombre nuevo.
const JEFES_ALIAS = {
  "sebastian gelviz": "Sebastián Gelvis"
};

// Una página de la app abierta desde ANTES de un cambio de ortografía (p. ej. «Sebastián Gelviz» → «Gelvis») sigue
// mandando el nombre viejo: sin esto el servidor contesta «Jefe de equipo no reconocido» y ese jefe ve sus tareas
// pero no puede completarlas hasta recargar. Lleva el nombre (viejo, o con otras mayúsculas/tildes) al vigente;
// cualquier otra cosa se devuelve tal cual y la validación de siempre la rechaza.
function jefeVigente_(nombre) {
  const t = String(nombre == null ? "" : nombre).trim();
  if (!t) return nombre;
  const norm = function (x) { return String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase(); };   // sin depender de otros archivos
  const k = norm(t);
  for (let i = 0; i < JEFES_EQUIPO.length; i++) {
    if (norm(JEFES_EQUIPO[i]) === k) return JEFES_EQUIPO[i];
  }
  if (JEFES_ALIAS.hasOwnProperty(k)) return JEFES_ALIAS[k];
  return nombre;
}

// Correos en copia de todo lo que se manda a Recisur: los 4 jefes de equipo y los responsables.
const CORREOS_JEFES_EQUIPO = [
  "daniel.arrastio@ext.leroymerlin.es",
  "daniel.simo@ext.leroymerlin.es",
  "francisco-javier.camara@ext.leroymerlin.es",
  "sebastian.gelvis@ext.leroymerlin.es"
];
// Correo de cada jefe de equipo (para avisarles de las tareas que se les asignan). Mismas cuatro
// direcciones de CORREOS_JEFES_EQUIPO, pero por nombre: aquel array va en otro orden.
const CORREOS_JEFES_POR_NOMBRE = {
  "Dani Simo": "daniel.simo@ext.leroymerlin.es",
  "Daniel Arrastio": "daniel.arrastio@ext.leroymerlin.es",
  "Francisco Parada": "francisco-javier.camara@ext.leroymerlin.es",
  "Sebastián Gelvis": "sebastian.gelvis@ext.leroymerlin.es"
};
const CORREOS_RESPONSABLES = [
  "jose-antonio.alcaide@ext.leroymerlin.es",
  "pedro.gil@ext.leroymerlin.es"
];

// Identidad que envía el cliente cuando el modo supervisor está activo y no se
// eligió ningún jefe (el supervisor no es uno de los 4 jefes de equipo).
// Solo la aceptan las pestañas que dejan actuar también al supervisor (Dispositivos).
const IDENTIDAD_SUPERVISOR = "Supervisor";

// ── CONFIGURACIÓN ──────────────────────────────────
const CONFIG = {
  EMAIL_RESPONSABLE: "Pedro.gil@ext.leroymerlin.es",
  UMBRAL_VERDE: 4,
  UMBRAL_AMARILLO: 3,
  SHEET_NAME_TURNO: "Registros_Turno",
  SHEET_NAME_SUGERENCIAS: "Sugerencias",
  SHEET_NAME_MAQUINARIA: "Maquinaria",
  SHEET_NAME_HISTORIAL_MAQUINARIA: "Historial_Maquinaria",
  SHEET_NAME_RESIDUOS: "Residuos",
  SHEET_NAME_PERSONAL: "Personal",
  SHEET_NAME_PERSONAL_HISTORIAL: "Personal_Historial",
  SHEET_NAME_DISPOSITIVOS: "Dispositivos",
  SHEET_NAME_HISTORIAL_DISPOSITIVOS: "Historial_Dispositivos",
  SHEET_NAME_TAREAS: "Tareas",
  SHEET_NAME_TAREAS_FOTOS: "Tareas_Fotos",
  SHEET_NAME_TAREAS_RECURRENTES: "Tareas_Recurrentes",
  SHEET_NAME_TURNO_ZONAS: "Turno_Zonas",
  SHEET_NAME_PETICIONES_CONSUMIBLES: "Peticiones_Consumibles",
  SHEET_NAME_TAREAS_PROGRAMADAS: "Tareas_Programadas",
  SHEET_NAME_NOTAS: "Notas",
  SHEET_NAME_NOTAS_FOTOS: "Notas_Fotos",
  SHEET_NAME_RELEVO: "Relevo",
  SHEET_NAME_RELEVO_PENDIENTES: "Relevo_Pendientes",
  SHEET_NAME_APROBACIONES: "Aprobaciones",
  SHEET_NAME_APROBACIONES_FOTOS: "Aprobaciones_Fotos",
  SHEET_NAME_ACTIVIDAD: "Actividad",
  // Enlace de la app (el deployment de producción) para el botón "Abrir Centinela" de los correos.
  APP_URL: "https://script.google.com/macros/s/AKfycbwmhHWgXRZ8f1PKM7Ko-VxFUMU2NW4A02vPFJ9oULMWhuYonML36X6hREma-sKe-6sqzw/exec",
  CARGAS_SPREADSHEET_ID: "1_6wZYmuzo3cUAzv8JjZCEyQ5ZcPVCHgupP2mWnCfaJQ",
  CARGAS_HOJA_CURSO: "EnCurso",
  CARGAS_HOJA_REG: "Registros",
  B2B_SHEET_ID: "1HIYNp2SSpXbIvwfRpFcHI7y4rqZqcrEUu8d-_4WTpeY",
  // "Cuadrante 2.0": Centinela solo LEE la hoja del mes en curso (pestaña Turnos).
  CUADRANTE_SHEET_ID: "15h2N9yeolUe1hH3dzMTzKlVbIXPNGmKfcUI9Jk5VXdU",
  // "UltimaMilla" (proyecto aparte lm_produccion, app "Última Milla"): Centinela
  // solo LEE la pestaña INCIDENCIAS (nunca escribe, no es su sistema).
  LM_INCIDENCIAS_SHEET_ID: "13TXO0gVJco1J-UC1s8hTJOcfCkHolhKZJj6x62djXtw",
  LM_INCIDENCIAS_HOJA: "INCIDENCIAS",
  B2B_PRIMERA_FILA_DATOS: 3,
  // HODOS (proyecto aparte, deployment de producción): Centinela solo LEE de él
  // (doGet?accion=pendientesTienda) para imprimir la "silueta" de la tienda.
  HODOS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbwpv1biSoYqG_OuhQx9_rC6izIEGqaz9vIdD8VTYFAU_qkJ-provc7fm61JslVO2XRQ/exec",
  // «Ocupación Tiendas SIE» (proyecto aparte, deployment de producción): Centinela solo LEE de ella
  // (doGet?accion=ocupacion) para enseñar los volúmenes de almacenamiento. Registrar se hace desde Kairos.
  OCUPACION_SIE_URL: "https://script.google.com/macros/s/AKfycbw1ssfsAFEHBS1mm0ya_pE3nNOJALrqPqfXbK0lmQ9uQVZJVk2OqOF2lzV98VdPcTRZ1g/exec",
  RECISUR_PARA: "info@recisur.com, rocio@recisur.com",
  RECISUR_CC: ["administracion.alm-malaga@leroymerlin.es"].concat(CORREOS_JEFES_EQUIPO, CORREOS_RESPONSABLES).join(", "),
  // Limite de bytes CRUDOS de fotos antes de adjuntarlas. Gmail permite 25 MB
  // por mensaje, pero al incrustarlas Apps Script las vuelve a codificar en
  // base64 (~x1.37 mas grandes) y suma cabeceras MIME: por eso el tope aqui
  // es bastante menor que 25 MB, no 25 MB directos.
  MAX_BYTES_FOTOS_EMAIL: 13 * 1024 * 1024
};

// ── LOGO CORPORATIVO ──────────────────────────────────────────
// URL publica HTTPS del favicon. Debe terminar en una extension de imagen
// reconocible (por ejemplo, https://static.example.com/centinela/favicon.png).
// Se deja vacia hasta publicar el PNG en un alojamiento estable; Shell.gs
// omite el favicon de forma segura mientras no haya URL.
const FAVICON_TAISA_URL = "";

// PNG de 349x144 incrustado en el propio código: la app y el email
// funcionan aunque el enlace de Google Drive cambie o deje de servirse.
const LOGO_TAISA_B64 = "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";
const LOGO_TAISA_DATA_URI = "data:image/png;base64," + LOGO_TAISA_B64;

const CABECERAS_TURNO = [
  "ID Registro",
  "Fecha",
  "Hora Cierre",
  "Jefe de Equipo",
  "Turno",
  "Num Zonas",
  "Datos Zonas (JSON)",
  "Comentario General",
  "Puntuación Global",
  "Calificación",
  "Email Enviado"
];

const CABECERAS_SUGERENCIAS = ["Fecha", "Hora", "Jefe de Equipo", "Sugerencia"];

const CABECERAS_RESIDUOS = ["Fecha", "Hora", "Jefe de Equipo", "Tipo", "Observacion"];

const CABECERAS_PERSONAL = ["ID", "Nombre"];
// Fecha/Hora = cuándo se registró; Fecha Hecho = cuándo ocurrió; Gravedad = 1 (leve) a 5 (muy grave).
const CABECERAS_PERSONAL_HISTORIAL = ["ID Operario", "Nombre", "Fecha", "Hora", "Reportado Por", "Texto", "Gravedad", "Tipo", "Medida", "Fecha Hecho"];

const CABECERAS_DISPOSITIVOS = ["ID", "Tipo", "Servicio", "Numero Serie", "Estado", "Observacion", "Fecha Estado"];
const CABECERAS_HISTORIAL_DISPOSITIVOS = [
  "Fecha", "Hora", "ID", "Tipo", "Numero Serie", "Estado Anterior", "Estado Nuevo", "Observacion", "Jefe"
];
// "Pide Dato" = etiqueta de un dato que hay que escribir para completar la tarea (p. ej. «Flete auditado»); vacío = no
// pide nada. "Dato" = lo que escribió quien la completó. Las hojas anteriores a estas dos columnas se amplían solas.
const CABECERAS_TAREAS = [
  "ID", "Titulo", "Descripcion", "Asignado a", "Prioridad", "Fecha Asignacion", "Fecha Limite",
  "Estado", "Feedback", "Fecha Cierre", "Cerrada por", "Correo Enviado", "Foto Tarea", "Foto Cierre",
  "Pide Dato", "Dato"
];

// Fotos de las tareas (opcionales, al crearla y al cerrarla). Sin Drive: la foto, ya reducida
// en el navegador, se guarda troceada en celdas de esta hoja (Sheets admite 50.000 caracteres por
// celda). Foto ID = "<id de tarea>-T" (la de la tarea) o "<id>-C" (la del cierre).
const CABECERAS_TAREAS_FOTOS = ["Foto ID", "Parte", "Total", "Datos"];

// Plantillas de tareas recurrentes: cada día activo genera una fila nueva en Tareas (ver
// TareasRecurrentes.gs). "Ultima Generada" evita duplicar si el disparador se ejecuta dos veces el mismo día.
// "Dias" = qué días de la semana se genera, en letras: L M X(miércoles) J V S D (p. ej. "LMXJV"). Vacío = L-V
// (así funcionaban todas las plantillas anteriores a esta columna).
// "Asignado a" puede ser un jefe, "TODOS" o "JEFE DE TARDE" (cada día va al jefe con turno de tarde en el cuadrante).
// "Pide Dato" = dato que hay que escribir para completar la tarea generada (p. ej. «Flete auditado»).
// "Desde" = primer día en que puede generar (dd/MM/yyyy); vacío = ya.
const CABECERAS_TAREAS_RECURRENTES = [
  "ID", "Titulo", "Descripcion", "Asignado a", "Prioridad", "Activa", "Creada por", "Fecha Creacion", "Ultima Generada", "Dias",
  "Pide Dato", "Desde"
];

// Tareas para el futuro: se crean ya, pero no llegan a los jefes (ni se les avisa) hasta su "Fecha Aplicar"
// (ver TareasProgramadas.gs). Estado: Programada / Aplicada / Cancelada. Al aplicarse se apunta el ID de la tarea real.
const CABECERAS_TAREAS_PROGRAMADAS = [
  "ID", "Titulo", "Descripcion", "Asignado a", "Prioridad", "Fecha Aplicar", "Fecha Limite", "Estado",
  "Creada por", "Fecha Creacion", "Fecha Aplicada", "ID Tarea"
];

// Cola de aprobaciones del jefe de área (ver Aprobaciones.gs). Lo que un mando pide y necesita su visto bueno
// queda aquí (Estado: Pendiente / Aprobada / Rechazada / Cancelada) con los datos en JSON; al aprobarse se
// ejecuta. "Foto" = "Sí" si lleva una foto guardada en Aprobaciones_Fotos (id "AP<id>"). "Resultado" = qué se
// creó al aprobar (o el error si no se pudo).
const CABECERAS_APROBACIONES = [
  "ID", "Tipo", "Resumen", "Solicitante", "Email Solicitante", "Fecha", "Hora", "Estado",
  "Resuelta por", "Fecha Resolucion", "Motivo", "Datos (JSON)", "Resultado", "Foto"
];
const CABECERAS_APROBACIONES_FOTOS = ["Foto ID", "Parte", "Total", "Datos"];
// Registro de lo que se crea desde los perfiles de gestión (quién, cuándo, qué): lo lee el jefe de área.
const CABECERAS_ACTIVIDAD = ["Fecha", "Hora", "Quien", "Rol", "Accion", "Detalle"];

// Notas informativas del responsable para los jefes de equipo (ver Notas.gs). Publicada/Caduca van como texto
// "yyyy-MM-dd HH:mm" (Caduca vacía = sin caducidad). Estado: Activa / Retirada. "Enterados" = "Jefe=yyyy-MM-dd HH:mm;Jefe=…".
// Destinatarios vacío = todos los jefes; si no, "Jefe;Jefe". Obligatoria = Sí/No (aviso a pantalla hasta marcar «Enterado»).
// Correo = No solicitado / Enviado / NO enviado. Foto = Sí si hay foto en Notas_Fotos (vacío = no).
const CABECERAS_NOTAS = [
  "ID", "Titulo", "Texto", "Tipo", "Fijada", "Publicada", "Caduca", "Duracion", "Autor", "Estado", "Enterados",
  "Destinatarios", "Obligatoria", "Correo", "Foto"
];

// Fotos de las notas, troceadas como las de Tareas: [Foto ID (= ID de la nota), Parte, Total, Datos].
// La pestaña Relevo guarda aquí también las suyas, con el ID «R<id del relevo>».
const CABECERAS_NOTAS_FOTOS = ["Foto ID", "Parte", "Total", "Datos"];

// Relevo de turno entre jefes de equipo (ver Relevo.gs). Fecha y Publicado/Editado van como texto "yyyy-MM-dd[ HH:mm]".
// Muelles = JSON {"2":"texto",…}. Enterados = "Jefe=yyyy-MM-dd HH:mm;…". Estado: Activo / Retirado. Foto = Sí si hay foto en Notas_Fotos.
const CABECERAS_RELEVO = ["ID", "Fecha", "Turno", "Autor", "Publicado", "Muelles", "Zonas", "Que paso", "Enterados", "Estado", "Foto", "Editado"];
// Puntos «estar pendiente de» de cada relevo: siguen Abierto hasta que alguien los marca Hecho (Estado: Abierto / Hecho / Retirado).
const CABECERAS_RELEVO_PENDIENTES = ["ID", "Parte", "Texto", "Cuando", "Estado", "Creado por", "Creado", "Hecho por", "Hecho el"];

// Zonas a fotografiar por rol de turno, editables por el supervisor (ver TurnoConfig.gs).
// Vacía = todavía nadie ha editado nada: se usan las zonas por defecto de TURNOS (Config.gs).
const CABECERAS_TURNO_ZONAS = ["Turno ID", "Orden", "Nombre", "Descripcion"];

// Peticiones de consumibles (ver Consumibles.gs). "Correo" = "Enviado" / "NO enviado"; "Items (JSON)" es
// lo que se pidió en formato máquina ([{id, tiendas?, texto?}]) para avisar de peticiones repetidas.
const CABECERAS_PETICIONES_CONSUMIBLES = ["Fecha", "Hora", "Jefe de Equipo", "Peticion", "Comentario", "Correo", "Items (JSON)"];

const CABECERAS_MAQUINARIA = [
  "ID Interno", "Maquina", "Propietaria", "Designacion", "Serial", "Estado",
  "Observacion", "Fecha Estado", "Fecha Envio SAT", "Presupuestado",
  "Aceptado", "Observaciones Revision"
];

const CABECERAS_HISTORIAL_MAQUINARIA = [
  "ID Interno", "Maquina", "Propietaria", "Serial", "Estado", "Observacion",
  "Fecha Inicio", "Fecha Resuelto", "Presupuestado", "Aceptado",
  "Observaciones Revision", "Resuelto Por", "Fecha Envio SAT"
];

// Inventario real de partida (18 máquinas). Las #14 y #18 ya estaban
// Averiadas en el sistema viejo — se cargan con su observación/fecha real
// en vez de resetearlas a OK, y con Fecha Envio SAT puesta a la fecha en que
// ya se avisó al SAT entonces, para no volver a mandar ese correo al
// ejecutar setupSistemaCompleto().
const MAQUINAS_INICIALES = [
  [1, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05118", "OK", "", "", "", "", "", ""],
  [2, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05117", "OK", "", "", "", "", "", ""],
  [3, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P04995", "OK", "", "", "", "", "", ""],
  [4, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P04973", "OK", "", "", "", "", "", ""],
  [5, "TRANSPALETA ELECT 2.4", "Linde", "MOTO", "W4X131V08723", "OK", "", "", "", "", "", ""],
  [6, "ELEVADORA", "Still", "ELV", "EXV-SF16 / F20329X00058", "OK", "", "", "", "", "", ""],
  [7, "TRANSPALETA ELECT DOBLE", "Still", "MOTO", "EXH – SF20 / W42362X00664", "OK", "", "", "", "", "", ""],
  [8, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05085", "OK", "", "", "", "", "", ""],
  [9, "TORITO PEQUEÑO", "Linde", "TORO", "E16L / H21251R04660", "OK", "", "", "", "", "", ""],
  [10, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02353", "OK", "", "", "", "", "", ""],
  [11, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02292", "OK", "", "", "", "", "", ""],
  [12, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02301", "OK", "", "", "", "", "", ""],
  [13, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02282", "OK", "", "", "", "", "", ""],
  [14, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02341", "Averiada", "Averiada fallo t-222", "15/09/2026", "30/07/2026", "", "", ""],
  [15, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02364", "OK", "", "", "", "", "", ""],
  [16, "RETRÁCTIL LINDE", "Linde", "RT", "R14 / P21120R02368", "OK", "", "", "", "", "", ""],
  [17, "TRANSPALETA ELECT", "Still", "MOTO", "EXH – SF20 / W42362X00621", "OK", "", "", "", "", "", ""],
  [18, "TRANSPALETA ELECT", "Linde", "MOTO", "W41156P05010", "Averiada", "Cambiar ruedas, va muy muy mal", "15/09/2026", "20/07/2026", "", "", ""]
];

// ── FUNCIÓN DE CONFIGURACIÓN INICIAL ─────────────────────────
function setupSistemaCompleto() {
  Logger.log("🚀 Iniciando configuración de Centinela...");

  const ss = crearHojaCentinela_();

  const props = PropertiesService.getScriptProperties();
  props.setProperty("SPREADSHEET_ID", ss.getId());

  Logger.log("✅ Configuración completada.");
  Logger.log("📊 Spreadsheet ID: " + ss.getId());
  Logger.log("🌐 URL de la Hoja: " + ss.getUrl());

  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      "✅ Centinela Configurado",
      "El sistema está listo.\n\n📊 Hoja de registro: " + ss.getUrl() +
      "\n\nPara desplegar: Implementar > Nueva implementación > Aplicación web",
      ui.ButtonSet.OK
    );
  } catch (e) {
    Logger.log("ℹ️ UI no disponible (normal si se ejecuta desde el editor)");
  }
}

function crearHojaCentinela_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("SPREADSHEET_ID");

  if (existingId) {
    try {
      const ss = SpreadsheetApp.openById(existingId);
      Logger.log("📂 Usando hoja existente: " + existingId);
      asegurarPestanas_(ss);
      return ss;
    } catch (e) {
      Logger.log("⚠️ No se encontró la hoja anterior. Creando nueva...");
    }
  }

  const ss = SpreadsheetApp.create("Centinela");
  const primeraHoja = ss.getActiveSheet();
  primeraHoja.setName(CONFIG.SHEET_NAME_TURNO);
  escribirCabeceras(primeraHoja, CABECERAS_TURNO);

  const sugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
  escribirCabeceras(sugerencias, CABECERAS_SUGERENCIAS);

  const maquinaria = ss.insertSheet(CONFIG.SHEET_NAME_MAQUINARIA);
  escribirCabeceras(maquinaria, CABECERAS_MAQUINARIA);
  maquinaria.getRange(2, 1, MAQUINAS_INICIALES.length, CABECERAS_MAQUINARIA.length).setValues(MAQUINAS_INICIALES);

  const historialMaquinaria = ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
  escribirCabeceras(historialMaquinaria, CABECERAS_HISTORIAL_MAQUINARIA);
  historialMaquinaria.getRange(2, 1, HISTORIAL_INICIAL.length, CABECERAS_HISTORIAL_MAQUINARIA.length).setValues(historialInicialConCabeceras_());

  const residuos = ss.insertSheet(CONFIG.SHEET_NAME_RESIDUOS);
  escribirCabeceras(residuos, CABECERAS_RESIDUOS);

  const personal = ss.insertSheet(CONFIG.SHEET_NAME_PERSONAL);
  escribirCabeceras(personal, CABECERAS_PERSONAL);

  const personalHistorial = ss.insertSheet(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
  escribirCabeceras(personalHistorial, CABECERAS_PERSONAL_HISTORIAL);

  prepararHojaDispositivos_(ss.insertSheet(CONFIG.SHEET_NAME_DISPOSITIVOS));
  prepararHojaHistorialDispositivos_(ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_DISPOSITIVOS));
  prepararHojaTareas_(ss.insertSheet(CONFIG.SHEET_NAME_TAREAS));
  prepararHojaTareasFotos_(ss.insertSheet(CONFIG.SHEET_NAME_TAREAS_FOTOS));

  Logger.log("✅ Hoja Centinela creada: " + ss.getUrl());
  return ss;
}

// Se llama también cuando la hoja ya existía, por si falta alguna pestaña
// (p.ej. Sugerencias se añadió después de crear la hoja original).
function asegurarPestanas_(ss) {
  let hojaTurno = ss.getSheetByName(CONFIG.SHEET_NAME_TURNO);
  if (!hojaTurno) {
    hojaTurno = ss.insertSheet(CONFIG.SHEET_NAME_TURNO);
    escribirCabeceras(hojaTurno, CABECERAS_TURNO);
  }
  let hojaSugerencias = ss.getSheetByName(CONFIG.SHEET_NAME_SUGERENCIAS);
  if (!hojaSugerencias) {
    hojaSugerencias = ss.insertSheet(CONFIG.SHEET_NAME_SUGERENCIAS);
    escribirCabeceras(hojaSugerencias, CABECERAS_SUGERENCIAS);
  }
  let hojaMaquinaria = ss.getSheetByName(CONFIG.SHEET_NAME_MAQUINARIA);
  if (!hojaMaquinaria) {
    hojaMaquinaria = ss.insertSheet(CONFIG.SHEET_NAME_MAQUINARIA);
    escribirCabeceras(hojaMaquinaria, CABECERAS_MAQUINARIA);
    hojaMaquinaria.getRange(2, 1, MAQUINAS_INICIALES.length, CABECERAS_MAQUINARIA.length).setValues(MAQUINAS_INICIALES);
  }
  let hojaHistorialMaquinaria = ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
  if (!hojaHistorialMaquinaria) {
    hojaHistorialMaquinaria = ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_MAQUINARIA);
    escribirCabeceras(hojaHistorialMaquinaria, CABECERAS_HISTORIAL_MAQUINARIA);
    hojaHistorialMaquinaria.getRange(2, 1, HISTORIAL_INICIAL.length, CABECERAS_HISTORIAL_MAQUINARIA.length).setValues(historialInicialConCabeceras_());
  }
  let hojaResiduos = ss.getSheetByName(CONFIG.SHEET_NAME_RESIDUOS);
  if (!hojaResiduos) {
    hojaResiduos = ss.insertSheet(CONFIG.SHEET_NAME_RESIDUOS);
    escribirCabeceras(hojaResiduos, CABECERAS_RESIDUOS);
  }
  let hojaPersonal = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL);
  if (!hojaPersonal) {
    hojaPersonal = ss.insertSheet(CONFIG.SHEET_NAME_PERSONAL);
    escribirCabeceras(hojaPersonal, CABECERAS_PERSONAL);
  }
  let hojaPersonalHistorial = ss.getSheetByName(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
  if (!hojaPersonalHistorial) {
    hojaPersonalHistorial = ss.insertSheet(CONFIG.SHEET_NAME_PERSONAL_HISTORIAL);
    escribirCabeceras(hojaPersonalHistorial, CABECERAS_PERSONAL_HISTORIAL);
  }
  if (!ss.getSheetByName(CONFIG.SHEET_NAME_DISPOSITIVOS)) {
    prepararHojaDispositivos_(ss.insertSheet(CONFIG.SHEET_NAME_DISPOSITIVOS));
  }
  if (!ss.getSheetByName(CONFIG.SHEET_NAME_HISTORIAL_DISPOSITIVOS)) {
    prepararHojaHistorialDispositivos_(ss.insertSheet(CONFIG.SHEET_NAME_HISTORIAL_DISPOSITIVOS));
  }
  if (!ss.getSheetByName(CONFIG.SHEET_NAME_TAREAS)) {
    prepararHojaTareas_(ss.insertSheet(CONFIG.SHEET_NAME_TAREAS));
  }
  if (!ss.getSheetByName(CONFIG.SHEET_NAME_TAREAS_FOTOS)) {
    prepararHojaTareasFotos_(ss.insertSheet(CONFIG.SHEET_NAME_TAREAS_FOTOS));
  }
}

// ── HOJAS DE DISPOSITIVOS Y TAREAS ───────────────────────────
// Estas hojas se crean con formato "texto sin formato" en todas sus columnas de
// texto. Así Sheets no convierte las fechas en objetos Date (que google.script.run
// devolvería como null en silencio), no pierde ceros ni precisión en un número de serie de
// 15-16 dígitos y no interpreta como fórmula un texto que empiece por = + o -
// (p. ej. un feedback "- todo revisado"). Las columnas de ID se dejan en formato normal.
function formatoTextoColumnas_(sheet, columnas) {
  const filas = Math.max(sheet.getMaxRows(), 2);
  columnas.forEach(function (c) {
    sheet.getRange(1, c, filas, 1).setNumberFormat("@");
  });
}

function prepararHojaDispositivos_(sheet) {
  escribirCabeceras(sheet, CABECERAS_DISPOSITIVOS);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7]);
}

function prepararHojaHistorialDispositivos_(sheet) {
  escribirCabeceras(sheet, CABECERAS_HISTORIAL_DISPOSITIVOS);
  formatoTextoColumnas_(sheet, [1, 2, 4, 5, 6, 7, 8, 9]);
}

function prepararHojaTareas_(sheet) {
  escribirCabeceras(sheet, CABECERAS_TAREAS);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
}

function prepararHojaTareasFotos_(sheet) {
  escribirCabeceras(sheet, CABECERAS_TAREAS_FOTOS);
  formatoTextoColumnas_(sheet, [1, 4]);
}

function prepararHojaTareasRecurrentes_(sheet) {
  escribirCabeceras(sheet, CABECERAS_TAREAS_RECURRENTES);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}

function prepararHojaTareasProgramadas_(sheet) {
  escribirCabeceras(sheet, CABECERAS_TAREAS_PROGRAMADAS);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
}

function prepararHojaAprobaciones_(sheet) {
  escribirCabeceras(sheet, CABECERAS_APROBACIONES);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
}

function prepararHojaAprobacionesFotos_(sheet) {
  escribirCabeceras(sheet, CABECERAS_APROBACIONES_FOTOS);
  formatoTextoColumnas_(sheet, [1, 4]);
}

function prepararHojaActividad_(sheet) {
  escribirCabeceras(sheet, CABECERAS_ACTIVIDAD);
  formatoTextoColumnas_(sheet, [1, 2, 3, 4, 5, 6]);
}

function prepararHojaNotas_(sheet) {
  escribirCabeceras(sheet, CABECERAS_NOTAS);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
}

function prepararHojaNotasFotos_(sheet) {
  escribirCabeceras(sheet, CABECERAS_NOTAS_FOTOS);
  formatoTextoColumnas_(sheet, [1, 4]);
}

function prepararHojaRelevo_(sheet) {
  escribirCabeceras(sheet, CABECERAS_RELEVO);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}

function prepararHojaRelevoPendientes_(sheet) {
  escribirCabeceras(sheet, CABECERAS_RELEVO_PENDIENTES);
  formatoTextoColumnas_(sheet, [2, 3, 4, 5, 6, 7, 8, 9]);
}

function prepararHojaPeticionesConsumibles_(sheet) {
  escribirCabeceras(sheet, CABECERAS_PETICIONES_CONSUMIBLES);
  formatoTextoColumnas_(sheet, [1, 2, 3, 4, 5, 6, 7]);
}

function prepararHojaTurnoZonas_(sheet) {
  escribirCabeceras(sheet, CABECERAS_TURNO_ZONAS);
  formatoTextoColumnas_(sheet, [1, 3, 4]);
}

// Patrón "asegurar" perezoso: devuelve la hoja lista para usar; si no existe (o le
// borraron las cabeceras) la crea/repara bajo LockService, sin que nadie tenga que
// ejecutar ?setup=1. Falla cerrado: si no consigue el bloqueo devuelve null.
// OJO: los bloqueos de Apps Script no son reentrantes — llamar SIEMPRE antes de
// coger el propio bloqueo de escritura, nunca desde dentro de uno.
function asegurarHojaPerezosa_(ss, nombre, cabeceras, preparar) {
  let sheet = ss.getSheetByName(nombre);
  if (sheet && cabecerasOk(sheet, cabeceras)) return sheet;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    Logger.log("⚠️ No se pudo obtener el bloqueo para preparar la hoja " + nombre);
    return null;
  }
  try {
    sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      sheet = ss.insertSheet(nombre);
      preparar(sheet);
    } else if (!cabecerasOk(sheet, cabeceras)) {
      escribirCabeceras(sheet, cabeceras);
    }
    return sheet;
  } catch (e) {
    Logger.log("❌ Error preparando la hoja " + nombre + ": " + e.message);
    return null;
  } finally {
    lock.releaseLock();
  }
}

function abrirHojaCentinela_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty("SPREADSHEET_ID");
  if (!ssId) return null;
  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    return null;
  }
}

// Historial real importado del proyecto standalone viejo (76 registros).
// Nota: el sistema viejo no distinguia fecha de inicio vs fecha de resolucion
// (un log plano de cada cambio de estado) — aqui Fecha Inicio y Fecha Resuelto
// se ponen iguales a la fecha real del registro, no es una reconstruccion exacta
// del rango de la averia.
const HISTORIAL_INICIAL = [
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Fallas", "Ruedas en mal estado", "15/05/2026 07:06", "15/05/2026 07:06", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "Botonera", "19/05/2026 08:51", "19/05/2026 08:51", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Fallas", "Ruedas en mal estado", "26/05/2026 15:17", "26/05/2026 15:17", "", "", "", "pedro.gil@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Fallas", "Rueda en mal estado", "26/05/2026 15:18", "26/05/2026 15:18", "", "", "", "pedro.gil@ext.leroymerlin.es"],
  [7, "TRANSPALETA ELECT DOBLE", "Still", "EXH – SF20 / W42362X00664", "Averiada", "Se para constantemente", "28/05/2026 21:37", "28/05/2026 21:37", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "Rueda cuadrada", "03/06/2026 13:48", "03/06/2026 13:48", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [2, "TRANSPALETA ELECT", "Linde", "W41156P05117", "Fallas", "Rueda trasera en mal estado", "03/06/2026 15:42", "03/06/2026 15:42", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Fallas", "Rueda trasera en muy mal estado", "03/06/2026 15:43", "03/06/2026 15:43", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [18, "TRANSPALETA ELECT", "Linde", "W41156P05010", "Fallas", "Averia E280094, se para sola cuando va andando", "04/06/2026 09:52", "04/06/2026 09:52", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Averiada", "Fallo rueda", "10/06/2026 13:52", "10/06/2026 13:52", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [2, "TRANSPALETA ELECT", "Linde", "W41156P05117", "Averiada", "Fallo rueda", "10/06/2026 13:53", "10/06/2026 13:53", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "Fallo rueda", "10/06/2026 13:53", "10/06/2026 13:53", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Fallas", "No funciona el pito", "16/06/2026 12:46", "16/06/2026 12:46", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [6, "ELEVADORA", "Still", "EXV-SF16 / F20329X00058", "Averiada", "No anda", "22/06/2026 08:18", "22/06/2026 08:18", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Fallas", "Rueda trasera en muy mal estado", "24/06/2026 09:57", "24/06/2026 09:57", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [10, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02353", "Fallas", "Se para constantemente", "24/06/2026 13:27", "24/06/2026 13:27", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Averiada", "RUEDA EN MUY MAL ESTADO", "02/07/2026 11:19", "02/07/2026 11:19", "", "", "", "pedro.gil@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Averiada", "Rueda que no puede ni andar la maquina", "13/07/2026 06:23", "13/07/2026 06:23", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [2, "TRANSPALETA ELECT", "Linde", "W41156P05117", "Averiada", "No arranca saltan muchos fallos", "13/07/2026 06:30", "13/07/2026 06:30", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "Averiada", "No arranca", "13/07/2026 08:15", "13/07/2026 08:15", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "Averiada", "No arranca", "14/07/2026 10:43", "14/07/2026 10:43", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "No arranca 7 fallos", "14/07/2026 10:44", "14/07/2026 10:44", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "Averiada", "Rueda en muy mal estado", "15/07/2026 09:04", "15/07/2026 09:04", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Averiada", "Error E410673", "17/07/2026 16:03", "17/07/2026 16:03", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [18, "TRANSPALETA ELECT", "Linde", "W41156P05010", "Fallas", "Cambio rueda", "17/07/2026 21:26", "17/07/2026 21:26", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "Parada, error E501940", "20/07/2026 07:08", "20/07/2026 07:08", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Fallas", "Da error cuando trabajando con ella", "20/07/2026 07:12", "20/07/2026 07:12", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [7, "TRANSPALETA ELECT DOBLE", "Still", "EXH – SF20 / W42362X00664", "Averiada", "Parada, huele ha quemado", "24/07/2026 08:12", "24/07/2026 08:12", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [17, "TRANSPALETA ELECT", "Still", "EXH – SF20 / W42362X00621", "Averiada", "Se para y no anda", "27/07/2026 08:07", "27/07/2026 08:07", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [16, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02368", "Fallas", "Error T 226 , se para por fallo de soporte lateral", "29/07/2026 15:09", "29/07/2026 15:09", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [14, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02341", "Averiada", "Fallo no anda, T222 y L432. Paramos la maquina.", "29/07/2026 16:54", "29/07/2026 16:54", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "Fallas", "Rueda dañada", "30/07/2026 07:40", "30/07/2026 07:40", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Fallas", "Se le ha caído el protector pies", "30/07/2026 10:09", "30/07/2026 10:09", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "Fallas", "Se para andando", "30/07/2026 10:10", "30/07/2026 10:10", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Averiada", "Fallo de rueda, no debe de utilizarse", "30/07/2026 18:02", "30/07/2026 18:02", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Averiada", "Rota.", "30/07/2026 19:34", "30/07/2026 19:34", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "Averiada", "Rota.", "30/07/2026 19:35", "30/07/2026 19:35", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Fallas", "cambio rueda", "11/08/2026 07:52", "11/08/2026 07:52", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [2, "TRANSPALETA ELECT", "Linde", "W41156P05117", "Fallas", "cambio rueda", "11/08/2026 08:17", "11/08/2026 08:17", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [17, "TRANSPALETA ELECT", "Still", "EXH – SF20 / W42362X00621", "Fallas", "Se sigue parando aleatoriamente", "14/08/2026 06:00", "14/08/2026 06:00", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Fallas", "La pantalla marcaba fallas y ha dejado de funcionar.Esta parada no anda", "17/08/2026 08:06", "17/08/2026 08:06", "", "", "", "daniel.simo@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Averiada", "Muchos fallos en la maquina", "17/08/2026 21:45", "17/08/2026 21:45", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [10, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02353", "Averiada", "Tuberia del agua obstruida y no se puede cargar de agua", "18/08/2026 14:12", "18/08/2026 14:12", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "No anda diferentes fallos", "20/08/2026 07:27", "20/08/2026 07:27", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [17, "TRANSPALETA ELECT", "Still", "EXH – SF20 / W42362X00621", "Averiada", "Parada", "20/08/2026 07:29", "20/08/2026 07:29", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Fallas", "Da fallo y se para", "20/08/2026 08:24", "20/08/2026 08:24", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "Averiada", "No anda", "25/08/2026 07:06", "25/08/2026 07:06", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "falla y anda solo de vez en cuando", "25/08/2026 07:06", "25/08/2026 07:06", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [17, "TRANSPALETA ELECT", "Still", "EXH – SF20 / W42362X00621", "Averiada", "Se para en seco continuamente", "25/08/2026 07:28", "25/08/2026 07:28", "", "", "", "daniel.arrastio@ext.leroymerlin.es"],
  [16, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02368", "Fallas", "Tiene el frontal suelto y choca al subir el carro, es urgente", "31/08/2026 10:50", "31/08/2026 10:50", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Fallas", "Ruedas traseras en mal estafo", "31/08/2026 13:45", "31/08/2026 13:45", "", "", "", "david.delcampo@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "Averiada", "5 fallos y no se mueve", "07/09/2026 08:26", "07/09/2026 08:26", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [17, "TRANSPALETA ELECT", "Still", "EXH – SF20 / W42362X00621", "Averiada", "Anda 1 metro, y se para bruscamente", "07/09/2026 08:27", "07/09/2026 08:27", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [16, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02368", "Averiada", "Roto manguitos dd subir y bajar, no se puede utilizar", "09/09/2026 06:33", "09/09/2026 06:33", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [11, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02292", "Averiada", "No se puede recargar el agua de la maquina, roto el enganche para poder rellenarla", "10/09/2026 06:24", "10/09/2026 06:24", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [9, "TORITO PEQUEÑO", "Linde", "E16L / H21251R04660", "OK", "", "10/09/2026 06:33", "10/09/2026 06:33", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [18, "TRANSPALETA ELECT", "Linde", "W41156P05010", "Averiada", "Ruedas en muy mal estado", "14/09/2026 16:11", "14/09/2026 16:11", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [11, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02292", "OK", "", "15/09/2026 20:07", "15/09/2026 20:07", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [14, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02341", "Averiada", "Averiada fallo t-222", "15/09/2026 20:09", "15/09/2026 20:09", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [12, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02301", "OK", "", "15/09/2026 20:10", "15/09/2026 20:10", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [10, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02353", "OK", "", "15/09/2026 20:10", "15/09/2026 20:10", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [9, "TORITO PEQUEÑO", "Linde", "E16L / H21251R04660", "OK", "", "15/09/2026 20:12", "15/09/2026 20:12", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [2, "TRANSPALETA ELECT", "Linde", "W41156P05117", "OK", "", "15/09/2026 20:12", "15/09/2026 20:12", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [5, "TRANSPALETA ELECT 2.4", "Linde", "W4X131V08723", "OK", "", "15/09/2026 20:13", "15/09/2026 20:13", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [4, "TRANSPALETA ELECT", "Linde", "W41156P04973", "OK", "", "15/09/2026 20:13", "15/09/2026 20:13", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [8, "TRANSPALETA ELECT", "Linde", "W41156P05085", "OK", "", "15/09/2026 20:14", "15/09/2026 20:14", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "OK", "", "15/09/2026 20:15", "15/09/2026 20:15", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [16, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02368", "OK", "", "15/09/2026 20:16", "15/09/2026 20:16", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [15, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02364", "OK", "", "15/09/2026 20:17", "15/09/2026 20:17", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [13, "RETRÁCTIL LINDE", "Linde", "R14 / P21120R02282", "OK", "", "15/09/2026 20:18", "15/09/2026 20:18", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [17, "TRANSPALETA ELECT", "Still", "EXH – SF20 / W42362X00621", "OK", "", "15/09/2026 20:20", "15/09/2026 20:20", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [7, "TRANSPALETA ELECT DOBLE", "Still", "EXH – SF20 / W42362X00664", "OK", "", "15/09/2026 20:20", "15/09/2026 20:20", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [18, "TRANSPALETA ELECT", "Linde", "W41156P05010", "Averiada", "Cambiar ruedas, va muy muy mal", "15/09/2026 20:21", "15/09/2026 20:21", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [3, "TRANSPALETA ELECT", "Linde", "W41156P04995", "OK", "", "15/09/2026 20:23", "15/09/2026 20:23", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "Averiada", "Tuti.", "16/09/2026 14:31", "16/09/2026 14:31", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"],
  [1, "TRANSPALETA ELECT", "Linde", "W41156P05118", "OK", "", "16/09/2026 14:31", "16/09/2026 14:31", "", "", "", "francisco-javier.camara@ext.leroymerlin.es"]
];

// HISTORIAL_INICIAL es de antes de la columna "Fecha Envio SAT": rellena con "" las filas
// que tengan menos columnas que CABECERAS_HISTORIAL_MAQUINARIA, para que setValues() no falle.
function historialInicialConCabeceras_() {
  return HISTORIAL_INICIAL.map(function (fila) {
    const faltan = CABECERAS_HISTORIAL_MAQUINARIA.length - fila.length;
    return faltan > 0 ? fila.concat(new Array(faltan).fill("")) : fila;
  });
}
