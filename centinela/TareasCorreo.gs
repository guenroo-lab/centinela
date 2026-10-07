// ============================================================
//  CENTINELA — CORREO DE "TAREA NUEVA" A QUIEN LA RECIBE
//  Se manda en tres casos y siempre a la(s) persona(s) a quien va la tarea:
//    · "manual"     el supervisor crea una tarea y se le asigna al momento (crearTarea).
//    · "recurrente" la PRIMERA vez que una plantilla recurrente genera su tarea (los días siguientes,
//                   silencio: sería un correo diario por lo mismo).
//    · "programada" el día en que una tarea programada para el futuro entra en vigor.
//  Una tarea global (TODOS) va a los cuatro jefes en el mismo correo. Como en el resto de la app, José y
//  Pedro (ccConResponsables_) van en copia. Un fallo de correo nunca deshace la tarea: se devuelve false.
// ============================================================

// Direcciones a las que va una tarea asignada a `asignadoA` (nombre de jefe o "TODOS"). [] si no se conoce.
function tarDestinatariosCorreo_(asignadoA) {
  if (asignadoA === TAREA_GLOBAL) {
    return JEFES_EQUIPO.map(function (j) { return CORREOS_JEFES_POR_NOMBRE[j]; }).filter(Boolean);
  }
  const m = CORREOS_JEFES_POR_NOMBRE[asignadoA];
  return m ? [m] : [];
}

// t = { id, titulo, descripcion, asignadoA, prioridad, fechaLimite ("dd/MM/yyyy" o ""), tipo, creador,
//       dias (letras, solo recurrente), fotoUri (opcional), pide (dato que se pide al completarla, opcional),
//       deTarde (true si la plantilla se asigna cada día al jefe de tarde) }
function tarEnviarCorreoNueva_(t) {
  try {
    const para = tarDestinatariosCorreo_(t.asignadoA);
    if (!para.length) {
      Logger.log("⚠️ Correo de tarea nueva: no hay dirección para «" + t.asignadoA + "» (tarea #" + t.id + ").");
      return false;
    }
    const global = t.asignadoA === TAREA_GLOBAL;
    const alta = t.prioridad === "Alta";
    const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    const tipo = t.tipo || "manual";
    const titulo = String(t.titulo).replace(/\s+/g, " ").trim();
    const corto = titulo.length > 80 ? titulo.slice(0, 77) + "…" : titulo;
    const dias = t.dias ? trecDiasTexto_(t.dias) : "";

    let etiqueta, emoji, acento, subtitulo, prefijoAsunto, tipoChip, nota;
    if (tipo === "recurrente") {
      etiqueta = "Nueva tarea recurrente"; emoji = "🔁"; acento = "#8b5cf6"; prefijoAsunto = "♻️ Nueva tarea recurrente";   // ♻️
      subtitulo = "Es una tarea recurrente: se " + (global ? "asignará a todos los jefes" : (t.deTarde ? "asignará cada día al jefe de equipo que esté de tarde, y hoy eres tú," : "te asignará")) + " automáticamente " + dias + ". Este es el primer aviso; los siguientes días aparecerá en Centinela sin más correos.";
      tipoChip = { texto: "🔁 Se repite " + dias, tono: "info" };
    } else if (tipo === "programada") {
      etiqueta = "Tarea programada · ya activa"; emoji = "📅"; acento = "#14b8a6"; prefijoAsunto = "⏰ Tarea programada, activa hoy";   // ⏰
      subtitulo = "Estaba programada para hoy y ya la tienes en tu lista de Centinela.";
      tipoChip = { texto: "📅 Programada · hoy " + hoy, tono: "info" };
    } else {
      etiqueta = "Nueva tarea asignada"; emoji = "📌"; acento = "#4c7dff"; prefijoAsunto = "➕ Nueva tarea";   // ➕
      subtitulo = (t.creador || "Supervisor") + (global ? " ha asignado una tarea a todos los jefes de equipo." : " te ha asignado una tarea.");
      tipoChip = { texto: "📌 Tarea nueva", tono: "info" };
    }
    nota = global
      ? "Es una tarea global: en cuanto uno de los jefes la cierre, deja de aparecer a los demás."
      : "Ábrela en Centinela para marcarla como completada o indicar por qué no se ha podido hacer.";
    if (t.pide) nota += " Para completarla tendrás que anotar: " + t.pide + ".";

    const chips = [
      alta ? { texto: "🔥 Prioridad alta", tono: "alerta" } : { texto: "🟢 Prioridad normal", tono: "ok" },
      tipoChip
    ];
    if (global) chips.push({ texto: "🌐 Global · la cierra el primero", tono: "aviso" });

    const filas = [
      { icono: "👤", etiqueta: "Asignada a", valor: global ? "Todos los jefes de equipo" : t.asignadoA },
      { icono: "⏰", etiqueta: "Fecha límite", valor: t.fechaLimite || "Sin fecha límite" },
      { icono: "🗓️", etiqueta: "Asignada el", valor: hoy },
      { icono: tipo === "manual" ? "🙋" : "🤖", etiqueta: "Creada por", valor: tipo === "manual" ? (t.creador || "Supervisor") : (tipo === "recurrente" ? "Automática (plantilla recurrente)" : (t.creador ? t.creador + " (programada)" : "Programada")) }
    ];
    if (tipo === "recurrente") filas.push({ icono: "🔁", etiqueta: "Se repite", valor: dias });
    if (t.pide) filas.push({ icono: "📝", etiqueta: "Al completarla anota", valor: t.pide });

    const fotoBlob = t.fotoUri ? dataUriABlob(t.fotoUri, "foto_tarea.jpg") : null;
    const cfg = {
      acento: alta ? "#ff4d5a" : acento,
      emoji: emoji,
      etiqueta: etiqueta,
      titulo: titulo,
      subtitulo: subtitulo,
      preheader: (alta ? "Prioridad alta · " : "") + (t.fechaLimite ? "Límite " + t.fechaLimite + " · " : "") + (global ? "Tarea global" : t.asignadoA),
      chips: chips,
      filas: filas,
      bloques: t.descripcion ? [{ icono: "📝", titulo: "Descripción", texto: t.descripcion, acento: "#4c7dff" }] : [],
      fotos: fotoBlob ? [{ cid: "fototarea", blob: fotoBlob, titulo: "Foto de la tarea" }] : [],
      boton: { texto: "Abrir Centinela", url: CONFIG.APP_URL },
      nota: nota
    };
    return correoPremiumEnviar_({ para: para, asunto: prefijoAsunto + (global ? " (global)" : "") + " · " + corto, cfg: cfg });
  } catch (e) {
    Logger.log("❌ Error preparando el correo de tarea nueva: " + e.message);
    return false;
  }
}
