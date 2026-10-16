// Pestaña «Ocupación SIE» de Centinela (solo lectura): servidor (OcupacionSie.gs) y pantalla (OcupacionSieUI.html).
//   node --test test/ocupacionSie.test.js        (desde Desktop\Proyectos\Centinela)
// Se carga el código REAL; solo se sustituyen UrlFetchApp, la caché y ScriptApp.
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.CENTINELA_DIR || path.join(__dirname, '..', 'centinela');
const leer = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const ID_MOTOR = 'AKfycbw1ssfsAFEHBS1mm0ya_pE3nNOJALrqPqfXbK0lmQ9uQVZJVk2OqOF2lzV98VdPcTRZ1g';
const URL_MOTOR = 'https://script.google.com/macros/s/' + ID_MOTOR + '/exec';

// ───────────────────────── Servidor ─────────────────────────
function servidor(opciones) {
  opciones = opciones || {};
  const respuestas = (opciones.respuestas || []).slice();
  const llamadas = [];
  const cache = new Map();
  const ctx = {
    console, JSON, Date, Math, Number, String, Object, Array, isFinite, Error, Logger: { log: () => {} },
    CONFIG: { OCUPACION_SIE_URL: URL_MOTOR },
    ScriptApp: {
      getOAuthToken: () => 'TOKEN-JEFE',
      AuthMode: { FULL: 'FULL' }, AuthorizationStatus: { REQUIRED: 'REQUIRED' },
      getAuthorizationInfo: () => ({
        getAuthorizationStatus: () => (opciones.permisoFalta ? 'REQUIRED' : 'NOT_REQUIRED'),
        getAuthorizationUrl: () => 'https://accounts.google.com/autorizar',
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => { cache.set(k, v); },
        remove: (k) => { cache.delete(k); },
      }),
    },
    UrlFetchApp: {
      fetch: (url, op) => {
        llamadas.push({ url, op });
        const r = respuestas.shift();
        if (r === undefined) throw new Error('Llamada inesperada');
        if (r instanceof Error) throw r;
        return { getContentText: () => (typeof r === 'string' ? r : JSON.stringify(r)), getResponseCode: () => 200 };
      },
    },
  };
  vm.createContext(ctx);
  ['HodosPendientes.gs', 'OcupacionSie.gs'].forEach((f) => vm.runInContext(leer(f), ctx, { filename: f }));
  return { ctx, llamadas, cache };
}
const plano = (x) => JSON.parse(JSON.stringify(x));
const MOTOR = { ok: true, ahora: '16/10/2026 09:00', hoy: '16/10/2026', modoTest: false, config: { totalMijas: 915, totalMarbella: 2106 }, historial: [] };

test('la URL del motor de Config.gs es la del deployment de producción de Ocupación Tiendas SIE', () => {
  assert.match(leer('Config.gs'), new RegExp('OCUPACION_SIE_URL: "' + URL_MOTOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
});

test('lee del motor con GET ?accion=ocupacion y el token de quien abre la app', () => {
  const s = servidor({ respuestas: [MOTOR] });
  const r = plano(s.ctx.obtenerOcupacionSie());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.origen, 'vivo');
  assert.strictEqual(r.config.totalMarbella, 2106);
  assert.strictEqual(s.llamadas[0].url, URL_MOTOR + '?accion=ocupacion');
  assert.strictEqual(s.llamadas[0].op.method, 'get');
  assert.strictEqual(s.llamadas[0].op.headers.Authorization, 'Bearer TOKEN-JEFE');
  assert.strictEqual(s.llamadas[0].op.payload, undefined, 'solo lectura: nunca manda datos');
});

test('caché de 60 s: no vuelve a llamar; «forzar» sí', () => {
  const s = servidor({ respuestas: [MOTOR, MOTOR] });
  s.ctx.obtenerOcupacionSie(false);
  s.ctx.obtenerOcupacionSie(false);
  assert.strictEqual(s.llamadas.length, 1);
  s.ctx.obtenerOcupacionSie(true);
  assert.strictEqual(s.llamadas.length, 2);
});

test('si el motor falla después de haber contestado una vez, enseña la última copia y lo avisa', () => {
  const s = servidor({ respuestas: [MOTOR, new Error('Servicio no disponible')] });
  s.ctx.obtenerOcupacionSie(false);
  const r = plano(s.ctx.obtenerOcupacionSie(true));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.origen, 'copia');
  assert.strictEqual(r.copia, true);
  assert.match(r.errorMotor, /Servicio no disponible/);
});

test('sin copia y con el motor caído: error claro, sin HTML en el mensaje', () => {
  const s = servidor({ respuestas: ['<!DOCTYPE html><html>Inicia sesión</html>'] });
  const r = plano(s.ctx.obtenerOcupacionSie(true));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no respondió con datos \(código 200\)/);
  assert.doesNotMatch(r.error, /Inicia sesión/);
  const n = servidor({ respuestas: ['null'] });
  assert.strictEqual(plano(n.ctx.obtenerOcupacionSie(true)).ok, false);
  const e = servidor({ respuestas: [{ ok: false, error: 'Hoja Registro Semanal no encontrada.' }] });
  assert.match(plano(e.ctx.obtenerOcupacionSie(true)).error, /Hoja Registro Semanal/);
});

test('si falta un permiso del jefe, devuelve el enlace para autorizarlo; si no falta, no', () => {
  const con = servidor({ respuestas: [new Error('No tienes permiso para llamar a UrlFetchApp.fetch')], permisoFalta: true });
  const a = plano(con.ctx.obtenerOcupacionSie(true));
  assert.strictEqual(a.ok, false);
  assert.strictEqual(a.permisoFalta, true);
  assert.strictEqual(a.autorizarUrl, 'https://accounts.google.com/autorizar');
  const sin = servidor({ respuestas: [new Error('Red caída')] });
  const b = plano(sin.ctx.obtenerOcupacionSie(true));
  assert.strictEqual(b.permisoFalta, false);
  assert.strictEqual(b.autorizarUrl, undefined);
});

// ───────────────────────── Pantalla ─────────────────────────
function pantalla() {
  const html = leer('OcupacionSieUI.html');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'el fragmento tiene su <script>');
  const ctx = {
    console, JSON, Date, Math, Number, String, Object, Array, isFinite, RegExp, Error,
    document: { getElementById: () => null },
    window: { addEventListener: () => {} },
    google: { script: { run: {} } },
  };
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx, { filename: 'OcupacionSieUI.html' });
  return (expr) => vm.runInContext(expr, ctx);
}
function fila(extra) {
  return Object.assign({
    fila: 2, semana: 41, fecha: '13/10/2026', hora: '10:12', ts: 1, libresMijas: 57, libresMarbella: 103,
    ocupadosMijas: 858, ocupadosMarbella: 2003, pctMijas: 93.8, pctMarbella: 95.1, nivelMijas: 'critico', nivelMarbella: 'critico',
    estado: 'ENVIADO', registradoPor: 'Pedro', origen: 'Kairos operario',
  }, extra);
}
const D = { config: { totalMijas: 915, totalMarbella: 2106 }, historial: [] };

test('formatos: porcentaje con coma, miles con punto, diferencia en puntos', () => {
  const p = pantalla();
  assert.strictEqual(p('ocsPct(93.84)'), '93,8 %');
  assert.strictEqual(p('ocsNum(2106)'), '2.106');
  assert.strictEqual(p('ocsNum(915)'), '915');
  assert.match(p('ocsPp(2.64)'), /class="sube">▲ \+2,6 pp</);
  assert.match(p('ocsPp(-1.26)'), /class="baja">▼ -1,3 pp</);
  assert.match(p('ocsPp(0.1)'), /class="">= \+0,1 pp</);
});

test('tarjeta de una tienda: %, nivel, ocupados/libres/capacidad, variaciones y color de la tienda', () => {
  const p = pantalla();
  const html = p('ocsTarjeta(' + JSON.stringify(D) + ', OCS_TIENDAS[1], ' + JSON.stringify(fila()) + ', ' + JSON.stringify(fila({ pctMarbella: 90.1 })) + ', ' + JSON.stringify(fila({ pctMarbella: 96 })) + ')');
  assert.match(html, /ocs-t-marbella/);
  assert.match(html, /Marbella/); assert.match(html, /Crítica/); assert.match(html, /95,1 %/);
  assert.match(html, /2\.003 ocupados · 103 libres · de 2\.106 huecos/);
  assert.match(html, /Frente al registro anterior: <b class="sube">▲ \+5,0 pp/);
  assert.match(html, /Frente a 4 registros atrás: <b class="baja">▼ -0,9 pp/);
  assert.match(html, /width:95\.1%/);
  const sola = p('ocsTarjeta(' + JSON.stringify(D) + ', OCS_TIENDAS[0], ' + JSON.stringify(fila()) + ', null, null)');
  assert.doesNotMatch(sola, /Frente al registro anterior/);
});

test('la gráfica: una línea por tienda, solo 26 registros, ancho real, y un aviso con menos de dos', () => {
  const p = pantalla();
  const hist = Array.from({ length: 40 }, (_, i) => fila({ fila: i + 2 }));
  const svg = p('ocsGrafico(' + JSON.stringify({ historial: hist }) + ', 420)');
  assert.strictEqual((svg.match(/<polyline/g) || []).length, 2);
  assert.strictEqual(svg.match(/<polyline points="([^"]+)"/)[1].trim().split(' ').length, 26);
  assert.match(svg, /viewBox="0 0 420 200" width="420" height="200"/);
  assert.match(p('ocsGrafico(' + JSON.stringify({ historial: hist }) + ', 5)'), /viewBox="0 0 280 200"/, 'mínimo 280');
  assert.match(p('ocsGrafico(' + JSON.stringify({ historial: hist }) + ', 5000)'), /viewBox="0 0 1100 200"/, 'máximo 1100');
  assert.match(p('ocsGrafico(' + JSON.stringify({ historial: [fila()] }) + ', 400)'), /al menos dos registros/);
});

test('la tabla empieza por lo más reciente, enseña quién y el estado, y escapa lo que viene de la hoja', () => {
  const p = pantalla();
  const hist = [
    fila({ fila: 2, fecha: '09/10/2026', registradoPor: 'Luis' }),
    fila({ fila: 3, fecha: '13/10/2026', registradoPor: '<img src=x onerror=alert(1)>', estado: 'PENDIENTE' }),
  ];
  const html = p('ocsTabla(' + JSON.stringify({ historial: hist }) + ')');
  assert.ok(html.indexOf('13/10/2026') < html.indexOf('09/10/2026'));
  assert.match(html, /En cola · salen en unos minutos/);
  assert.match(html, /Informes enviados/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 3, 'cabecera + 2 registros');
});

test('estados de los informes', () => {
  const p = pantalla();
  assert.strictEqual(p("ocsEstado('ENVIADO').cls"), 'ok');
  assert.strictEqual(p("ocsEstado('PENDIENTE').cls"), 'aviso');
  assert.strictEqual(p("ocsEstado('ERROR').cls"), 'peligro');
  assert.strictEqual(p("ocsEstado('').txt"), '—');
});

test('es de solo lectura: la pantalla no llama a nada que escriba y no usa diálogos nativos', () => {
  const ui = leer('OcupacionSieUI.html');
  assert.doesNotMatch(ui, /registrarOcupacion|corregirOcupacion|\.guardar|method:\s*['"]post/i);
  assert.doesNotMatch(ui, /(^|[^.\w])(confirm|alert|prompt)\s*\(/);
  assert.match(ui, /\.obtenerOcupacionSie\(/);
});

test('ShellUI.html: panel, botón de la barra y gancho al mostrar la pestaña, con el mismo id en los tres sitios', () => {
  const shell = leer('ShellUI.html');
  assert.match(shell, /<div class="tab-panel" id="tab-ocupacionsie" data-tab="ocupacionsie">\s*<\?!= include\('OcupacionSieUI'\); \?>/);
  assert.match(shell, /<a href="#" data-tab="ocupacionsie" onclick="event\.preventDefault\(\); mostrarTab\('ocupacionsie'\)">/);
  assert.match(shell, /if \(id === 'ocupacionsie' && typeof ocupacionSieAlMostrar === 'function'\) ocupacionSieAlMostrar\(\);/);
  assert.ok(fs.existsSync(path.join(DIR, 'OcupacionSieUI.html')));
  assert.match(leer('OcupacionSieUI.html'), /function ocupacionSieAlMostrar\(\)/);
  assert.match(leer('OcupacionSieUI.html'), /getElementById\('tab-ocupacionsie'\)/);
});

test('el fragmento no lleva «<?» ni «?>» (ni en comentarios): include() los evaluaría como scriptlets', () => {
  assert.doesNotMatch(leer('OcupacionSieUI.html'), /<\?|\?>/);
});

test('ningún .gs y .html comparten nombre base (Apps Script los confunde)', () => {
  const nombres = fs.readdirSync(DIR);
  const gs = new Set(nombres.filter((n) => n.endsWith('.gs')).map((n) => n.slice(0, -3)));
  nombres.filter((n) => n.endsWith('.html')).forEach((n) => assert.ok(!gs.has(n.slice(0, -5)), n));
});
