// ============================================================
//  CENTINELA — CASCARÓN
// ============================================================

function doGet(e) {
  const output = HtmlService.createTemplateFromFile('ShellUI').evaluate()
    .setTitle("Centinela")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  // El favicon es decorativo: una URL no admitida nunca debe impedir que la
  // aplicacion cargue. setFaviconUrl valida la URL de forma sincrona y puede
  // lanzar una excepcion (por ejemplo, con una data: URI).
  if (FAVICON_TAISA_URL) {
    try {
      output.setFaviconUrl(FAVICON_TAISA_URL);
    } catch (error) {
      console.warn("No se pudo configurar el favicon de Centinela: " + error);
    }
  }

  return output;
}
