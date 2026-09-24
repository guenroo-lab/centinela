// ============================================================
//  CENTINELA — TURNOS DE LA SEMANA (tiempo real)
//  Lee DIRECTAMENTE la pestaña "Turnos" del mismo Sheet "Cuadrante 2.0"
//  (CONFIG.CUADRANTE_SHEET_ID) que ya usa la app de Cuadrante de Turnos de
//  Pedro: esa pestaña es la fuente en tiempo real (clave "<idEmpleado>_<yyyy-mm-dd>"
//  -> código de turno), la misma que lee su propia interfaz — así no hay el
//  retraso del cuadrante visual mensual ("Sep 2026", "Oct 2026"…) que se leía antes.
//  Solo LEE, nunca escribe: ni aquí ni en su código. No toca Extras, Vacaciones,
//  Horas ni Config (datos de nómina de esa otra app) — solo Turnos + catálogo de
//  empleados (Empleados/Personal/EmpEdits/Ocultos), igual que hace su propia app
//  para saber nombre+turno de cada uno. Sin la sección de mandos: nunca se
//  muestran, estén donde estén.
//
//  Acceso: la lectura va con la cuenta de quien abre la pestaña. Si esa cuenta no
//  tiene permiso sobre el Sheet, se sirve la última copia de ESTA semana que dejó
//  alguien que sí lo tiene (propiedad de script TURNOS_COPIA, solo nombres+turnos).
// ============================================================

const TSEM_LETRAS_ = ["L", "M", "X", "J", "V", "S", "D"];
const TSEM_MESES_LARGO_ = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TSEM_PROP_COPIA_ = "TURNOS_COPIA";
const TSEM_COPIA_MAX_ = 8500;                        // las propiedades de script admiten ~9 KB por valor
const TSEM_COPIA_REFRESCO_MS_ = 20 * 60 * 1000;

// Catálogo base de Oficina + Almacén (sin Mandos — Centinela no los muestra nunca).
// Mismo id/nombre/rol/subgrupo que la app de Cuadrante; sus hojas Empleados/
// Personal/EmpEdits/Ocultos mandan por encima de esto, igual que en su propia app
// (así un cambio hecho ahí, sin tocar código, se refleja también aquí).
const TSEM_EMPLEADOS_BASE_ = {
  oficina: [
    { id: "O1", nombre: "Rocio", rol: "PC" },
    { id: "O2", nombre: "Auxi", rol: "PC" },
    { id: "O3", nombre: "Marina", rol: "PC" },
    { id: "O4", nombre: "Deybi", rol: "PC" },
    { id: "O5", nombre: "Ana", rol: "ADM" },
    { id: "O6", nombre: "Carmen", rol: "ADM" },
    { id: "O7", nombre: "Sagrario", rol: "ADM" },
    { id: "O8", nombre: "Marta", rol: "ADM" }
  ],
  almacen: [
    { id: "A1", nombre: "Alberto", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A2", nombre: "Rafa Perez", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A3", nombre: "David Planas", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A4", nombre: "Brunelli", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A5", nombre: "Francisco", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A6", nombre: "Jesus Seco", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A7", nombre: "JM Bonamigo", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A8", nombre: "Campana", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A9", nombre: "Carlos Gutierrez", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A10", nombre: "Salva", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A11", nombre: "Adonai", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A12", nombre: "C. Osuna", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A13", nombre: "A. Rios", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A14", nombre: "Jose Antonio", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A15", nombre: "Juan Luis", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A16", nombre: "Luciano", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A17", nombre: "Pablo", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A18", nombre: "Daniel Cano", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A19", nombre: "Juan Manuel Garcia", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A20", nombre: "Pablo 2", rol: "PC", subgrupo: "Pedido Cliente" },
    { id: "A21", nombre: "Cynthia", rol: "GDS", subgrupo: "SIE/REC/GDS" },
    { id: "A22", nombre: "Manuel", rol: "C/D", subgrupo: "Carga/Descarga" },
    { id: "A23", nombre: "Antonio Sanchez", rol: "C/D", subgrupo: "Carga/Descarga" },
    { id: "A24", nombre: "Sergio", rol: "C/D", subgrupo: "Carga/Descarga" },
    { id: "A25", nombre: "Suliman", rol: "C/D", subgrupo: "Carga/Descarga" },
    { id: "A26", nombre: "Angel", rol: "C/D", subgrupo: "Carga/Descarga" },
    { id: "A27", nombre: "Juanjo", rol: "C/D", subgrupo: "Carga/Descarga" },
    { id: "A28", nombre: "Paqui", rol: "REC", subgrupo: "SIE/REC/GDS" },
    { id: "A29", nombre: "Alejandro Giner", rol: "REC", subgrupo: "SIE/REC/GDS" },
    { id: "A30", nombre: "Pedro Serrano", rol: "SIE", subgrupo: "SIE/REC/GDS" },
    { id: "A31", nombre: "Edson", rol: "SIE", subgrupo: "SIE/REC/GDS" },
    { id: "A32", nombre: "Antonio M.", rol: "SIE", subgrupo: "SIE/REC/GDS" }
  ]
};

// Orden fijo de los grupos que se muestran (sin Mandos).
const TSEM_ORDEN_GRUPOS_ = ["Oficina", "Pedido Cliente", "Carga/Descarga", "SIE/REC/GDS"];

function tsemPad_(n) { return (n < 10 ? "0" : "") + n; }

// Los 7 días (lunes a domingo) de la semana que contiene a `hoyIso` ("yyyy-MM-dd").
function tsemDiasSemana_(hoyIso) {
  const p = String(hoyIso).split("-").map(Number);
  const hoyMs = Date.UTC(p[0], p[1] - 1, p[2]);
  const dow = new Date(hoyMs).getUTCDay();           // 0 = domingo
  const lunesMs = hoyMs - ((dow + 6) % 7) * 86400000;
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const ms = lunesMs + i * 86400000;
    const d = new Date(ms);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
    dias.push({ iso: y + "-" + tsemPad_(m) + "-" + tsemPad_(dd), letra: TSEM_LETRAS_[i], dia: dd, mes: m, anio: y, hoy: ms === hoyMs });
  }
  return dias;
}

// "21 al 27 de septiembre de 2026" / "28 de septiembre al 4 de octubre de 2026"
function tsemTitulo_(dias) {
  const a = dias[0], b = dias[6];
  if (a.anio !== b.anio) return a.dia + " de " + TSEM_MESES_LARGO_[a.mes - 1] + " de " + a.anio + " al " + b.dia + " de " + TSEM_MESES_LARGO_[b.mes - 1] + " de " + b.anio;
  if (a.mes !== b.mes) return a.dia + " de " + TSEM_MESES_LARGO_[a.mes - 1] + " al " + b.dia + " de " + TSEM_MESES_LARGO_[b.mes - 1] + " de " + b.anio;
  return a.dia + " al " + b.dia + " de " + TSEM_MESES_LARGO_[b.mes - 1] + " de " + b.anio;
}

// "JOSE ANTONIO ALCAIDE" -> "Jose Antonio Alcaide" (para overrides que llegan en mayúsculas)
function tsemNombrePropio_(texto) {
  return String(texto || "").replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/(^|[\s\-'’])([a-záéíóúüñ])/g, function (m, a, b) { return a + b.toUpperCase(); });
}

// Catálogo Oficina+Almacén ya con Ocultos/Empleados/EmpEdits/Personal aplicados,
// exactamente igual que hace la propia app de Cuadrante para pintar su tabla
// (getDatosIniciales en Webapp.js) — pero sin jornada/ett/bolsas, que no usamos.
function tsemCatalogoEmpleados_(ss) {
  const emp = { oficina: JSON.parse(JSON.stringify(TSEM_EMPLEADOS_BASE_.oficina)), almacen: JSON.parse(JSON.stringify(TSEM_EMPLEADOS_BASE_.almacen)) };

  const ocultos = {};
  const shOcultos = ss.getSheetByName("Ocultos");
  if (shOcultos && shOcultos.getLastRow() > 0) {
    shOcultos.getDataRange().getValues().forEach(function (r) { if (r[0]) ocultos[String(r[0]).trim()] = true; });
  }
  ["oficina", "almacen"].forEach(function (dept) { emp[dept] = emp[dept].filter(function (e) { return !ocultos[e.id]; }); });

  // Empleados añadidos desde la app (no están en el catálogo base de arriba).
  const shEmps = ss.getSheetByName("Empleados");
  if (shEmps && shEmps.getLastRow() > 0) {
    shEmps.getDataRange().getValues().forEach(function (r) {
      if (!r[0]) return;
      const id = String(r[0]).trim();
      if (!id || id === "id" || ocultos[id] || String(id).charAt(0) === "M") return; // "M*" = mando, nunca se muestra
      const dept = String(r[2] || "almacen").trim() === "oficina" ? "oficina" : "almacen";
      if (emp[dept].some(function (e) { return e.id === id; })) return;
      const e = { id: id, nombre: tsemNombrePropio_(r[1] || ""), rol: String(r[3] || "") };
      if (r[4]) e.subgrupo = String(r[4]);
      emp[dept].push(e);
    });
  }

  // EmpEdits: nombre/rol/subgrupo editados desde la app.
  const shEE = ss.getSheetByName("EmpEdits");
  if (shEE && shEE.getLastRow() > 1) {
    const edits = {};
    shEE.getDataRange().getValues().forEach(function (r, i) {
      if (i === 0 || !r[0]) return;
      edits[String(r[0]).trim()] = { nombre: r[1] || null, rol: r[2] || null, subgrupo: r[3] || null };
    });
    ["oficina", "almacen"].forEach(function (dept) {
      emp[dept].forEach(function (e) {
        const ed = edits[e.id];
        if (!ed) return;
        if (ed.nombre) e.nombre = tsemNombrePropio_(ed.nombre);
        if (ed.rol) e.rol = String(ed.rol);
        if (ed.subgrupo !== null && ed.subgrupo !== undefined) e.subgrupo = String(ed.subgrupo);
      });
    });
  }

  // Hoja "Personal": lo que se escriba ahí a mano manda sobre cualquier otro sitio.
  const shPersonal = ss.getSheetByName("Personal");
  if (shPersonal && shPersonal.getLastRow() > 1) {
    const GRUPOS_VALIDOS = { oficina: "oficina", almacen: "almacen", "almacén": "almacen" };
    const overrides = {};
    shPersonal.getRange(2, 1, shPersonal.getLastRow() - 1, 8).getValues().forEach(function (r) {
      const id = String(r[0]).trim();
      if (!id) return;
      overrides[id] = {
        nombre: r[1] ? tsemNombrePropio_(r[1]) : "",
        grupo: r[5] ? GRUPOS_VALIDOS[String(r[5]).trim().toLowerCase()] : null,
        subgrupo: r[6] ? String(r[6]).trim() : "",
        rol: r[7] ? String(r[7]).trim() : ""
      };
    });
    ["oficina", "almacen"].forEach(function (dept) {
      emp[dept].forEach(function (e) {
        const ov = overrides[e.id];
        if (!ov) return;
        if (ov.nombre) e.nombre = ov.nombre;
        if (ov.subgrupo) e.subgrupo = ov.subgrupo;
        if (ov.rol) e.rol = ov.rol;
      });
    });
    const mover = [];
    ["oficina", "almacen"].forEach(function (deptActual) {
      emp[deptActual].forEach(function (e) {
        const ov = overrides[e.id];
        if (ov && ov.grupo && ov.grupo !== deptActual) mover.push({ id: e.id, desde: deptActual, hacia: ov.grupo });
      });
    });
    mover.forEach(function (mv) {
      const idx = emp[mv.desde].findIndex(function (e) { return e.id === mv.id; });
      if (idx === -1) return;
      const e = emp[mv.desde].splice(idx, 1)[0];
      emp[mv.hacia].push(e);
    });
  }

  return emp;
}

// { "<idEmpleado>_<yyyy-mm-dd>": "M" | "T" | ... } — la pestaña "Turnos" no tiene cabecera.
function tsemLeerTurnos_(ss) {
  const mapa = {};
  const sh = ss.getSheetByName("Turnos");
  if (!sh || sh.getLastRow() < 1) return mapa;
  sh.getDataRange().getValues().forEach(function (r) {
    const clave = String(r[0] || "").trim();
    if (clave) mapa[clave] = r[1] == null ? "" : String(r[1]);
  });
  return mapa;
}

// Agrupa el catálogo (Oficina en un solo grupo, Almacén por subgrupo) y le pone el
// turno de cada día de la semana. Vacío/sin fila -> "·" (Libre), igual que antes.
function tsemConstruirSemanaV2_(dias, catalogo, turnosMapa) {
  const porTitulo = {};
  TSEM_ORDEN_GRUPOS_.forEach(function (t) { porTitulo[t] = { titulo: t, personas: [] }; });

  function turnosDe(id) {
    return dias.map(function (d) {
      const v = turnosMapa[id + "_" + d.iso];
      return v ? v : "·";
    });
  }

  catalogo.oficina.forEach(function (e) {
    porTitulo["Oficina"].personas.push({ nombre: e.nombre, rol: e.rol, turnos: turnosDe(e.id) });
  });
  catalogo.almacen.forEach(function (e) {
    const titulo = e.subgrupo || "Almacén";
    if (!porTitulo[titulo]) porTitulo[titulo] = { titulo: titulo, personas: [] };
    porTitulo[titulo].personas.push({ nombre: e.nombre, rol: e.rol, turnos: turnosDe(e.id) });
  });

  const ordenTitulos = TSEM_ORDEN_GRUPOS_.concat(Object.keys(porTitulo).filter(function (t) { return TSEM_ORDEN_GRUPOS_.indexOf(t) === -1; }));
  const grupos = ordenTitulos.map(function (t) { return porTitulo[t]; }).filter(function (g) { return g && g.personas.length; });
  return { grupos: grupos };
}

function tsemLeerCopia_(lunesIso) {
  try {
    const crudo = PropertiesService.getScriptProperties().getProperty(TSEM_PROP_COPIA_);
    if (!crudo) return null;
    const c = JSON.parse(crudo);
    return (c && c.lunes === lunesIso) ? c : null;
  } catch (e) {
    return null;
  }
}

// Guarda la copia (solo si cambió o tiene más de 20 min) para quien no tenga acceso al Sheet.
function tsemGuardarCopia_(copia) {
  try {
    const props = PropertiesService.getScriptProperties();
    const previo = tsemLeerCopia_(copia.lunes);
    const mismoContenido = previo && JSON.stringify(previo.grupos) === JSON.stringify(copia.grupos) && JSON.stringify(previo.avisos) === JSON.stringify(copia.avisos);
    if (mismoContenido && (Date.now() - previo.guardadoMs) < TSEM_COPIA_REFRESCO_MS_) return;
    const texto = JSON.stringify(copia);
    if (texto.length > TSEM_COPIA_MAX_) { Logger.log("⚠️ Copia de turnos demasiado grande (" + texto.length + "): no se guarda."); return; }
    props.setProperty(TSEM_PROP_COPIA_, texto);
  } catch (e) {
    Logger.log("⚠️ No se pudo guardar la copia de turnos: " + e.message);
  }
}

function obtenerTurnosSemana() {
  const tz = Session.getScriptTimeZone();
  const ahora = new Date();
  const dias = tsemDiasSemana_(Utilities.formatDate(ahora, tz, "yyyy-MM-dd"));
  const cabecera = { ok: true, titulo: tsemTitulo_(dias), dias: dias };

  let ss = null;
  try {
    ss = SpreadsheetApp.openById(CONFIG.CUADRANTE_SHEET_ID);
  } catch (e) {
    Logger.log("⚠️ Sin acceso al cuadrante: " + e.message);
  }

  if (ss) {
    const avisos = [];
    if (!ss.getSheetByName("Turnos")) avisos.push('No encuentro la pestaña «Turnos» en el cuadrante: los turnos saldrán vacíos.');
    const catalogo = tsemCatalogoEmpleados_(ss);
    const turnosMapa = tsemLeerTurnos_(ss);
    const semana = tsemConstruirSemanaV2_(dias, catalogo, turnosMapa);
    const actualizado = Utilities.formatDate(ahora, tz, "dd/MM/yyyy HH:mm");
    tsemGuardarCopia_({ lunes: dias[0].iso, guardadoMs: ahora.getTime(), actualizado: actualizado, grupos: semana.grupos, avisos: avisos });
    return Object.assign(cabecera, { origen: "directo", actualizado: actualizado, grupos: semana.grupos, avisos: avisos });
  }

  const copia = tsemLeerCopia_(dias[0].iso);
  if (copia) {
    return Object.assign(cabecera, { origen: "copia", actualizado: copia.actualizado, grupos: copia.grupos, avisos: copia.avisos || [] });
  }
  return { ok: false, sinAcceso: true, error: "Tu cuenta no puede abrir el cuadrante y todavía no hay copia de esta semana. Que abra esta pestaña alguien con acceso al cuadrante (Pedro, José…) y quedará disponible para todos." };
}
