/*
 * render-fondos.js · «Fotografía» cada lugar de escenarios.js y guarda los fondos del juego.
 *
 * Uso:
 *   node prototipos/render-fondos.js                 → los 7 lugares, horizontal y vertical, y las dos hojas
 *   node prototipos/render-fondos.js bosque-letras   → solo ese lugar; las hojas se rehacen con los WebP en disco
 *   node prototipos/render-fondos.js --rapido ...    → a mitad de resolución, sin superresolución, en %TEMP%/fondos-prueba
 *
 * Salida:
 *   fondos/<lugar>-h.webp (1920×1200) y fondos/<lugar>-v.webp (1200×1920), WebP calidad ~0,82, ≤ 350 KB
 *   docs/creativo/fondos/hoja-fondos.png y docs/creativo/fondos/prueba-legibilidad.png
 *
 * Se renderiza al doble de tamaño y se reduce en un canvas 2D (suavizado de bordes).
 * En headless, WebGL va por software (SwiftShader): es lento, pero solo se hace una vez.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var pw = require('C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

var RAIZ = path.resolve(__dirname, '..');
var FONDOS = path.join(RAIZ, 'fondos');
var DOCS = path.join(RAIZ, 'docs', 'creativo', 'fondos');
var THREE_JS = path.join(RAIZ, 'vendor', 'three.min.js');
var ESC_JS = path.join(__dirname, 'escenarios.js');
var MAX_BYTES = 350 * 1024;
var PRUEBAS = process.env.FONDOS_PRUEBA || path.join(require('os').tmpdir(), 'fondos-prueba');

var args = process.argv.slice(2);
var rapido = args.indexOf('--rapido') >= 0;
var elegidos = args.filter(function (a) { return a.indexOf('--') !== 0; });

// Se ejecuta dentro de la página: construye, renderiza al doble, reduce y codifica en WebP.
function renderEnPagina(o) {
  var THREE = window.THREE;
  var W = o.ancho * o.escala, H = o.alto * o.escala;
  var lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  var renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var info = window.Escenarios.construir(scene, o.lugar, { vertical: o.alto > o.ancho });
  renderer.toneMappingExposure = info.exposicion;
  var cam = new THREE.PerspectiveCamera(info.camara.fov, o.ancho / o.alto, 0.5, 4000);
  cam.position.fromArray(info.camara.pos);
  cam.lookAt(new THREE.Vector3().fromArray(info.camara.mira));
  var t0 = performance.now();
  renderer.render(scene, cam);
  var ms = Math.round(performance.now() - t0);

  // reducción en dos pasos de ×2 (mejor que un único drawImage con mucho factor)
  var c2 = document.createElement('canvas');
  c2.width = o.ancho; c2.height = o.alto;
  var x = c2.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(lienzo, 0, 0, o.ancho, o.alto);

  var q = o.calidad, url, bytes;
  for (;;) {
    url = c2.toDataURL('image/webp', q);
    bytes = Math.floor((url.length - url.indexOf(',') - 1) * 3 / 4);
    if (bytes <= o.maxBytes || q <= 0.5) break;
    q = Math.round((q - 0.03) * 100) / 100;
  }
  var res = { webp: url, bytes: bytes, calidad: q, ms: ms, objetos: 0 };
  scene.traverse(function () { res.objetos++; });
  // limpieza
  scene.traverse(function (ob) {
    if (ob.geometry) ob.geometry.dispose();
    if (ob.material) [].concat(ob.material).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return res;
}

(async function () {
  fs.mkdirSync(FONDOS, { recursive: true });
  fs.mkdirSync(DOCS, { recursive: true });
  if (rapido) fs.mkdirSync(PRUEBAS, { recursive: true });
  var navegador = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  var page = await navegador.newPage({ viewport: { width: 800, height: 600 } });
  var errores = [];
  page.on('pageerror', function (e) { errores.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') errores.push('console: ' + m.text()); });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"></body></html>');
  await page.addScriptTag({ path: THREE_JS });
  await page.addScriptTag({ path: ESC_JS });
  var lugares = await page.evaluate(function () { return window.Escenarios.lugares; });
  var todosLugares = lugares.slice();
  if (elegidos.length) lugares = lugares.filter(function (l) { return elegidos.indexOf(l) >= 0; });

  var resultados = {};
  var formatos = [['h', 1920, 1200], ['v', 1200, 1920]];
  for (var i = 0; i < lugares.length; i++) {
    for (var f = 0; f < formatos.length; f++) {
      var lugar = lugares[i], fm = formatos[f];
      var o = { lugar: lugar, ancho: rapido ? fm[1] / 2 : fm[1], alto: rapido ? fm[2] / 2 : fm[2], escala: rapido ? 1 : 2, calidad: 0.82, maxBytes: MAX_BYTES };
      var t0 = Date.now();
      var res = await page.evaluate(renderEnPagina, o);
      var nombre = lugar + '-' + fm[0] + '.webp';
      var destino = rapido ? path.join(PRUEBAS, nombre) : path.join(FONDOS, nombre);
      fs.writeFileSync(destino, Buffer.from(res.webp.split(',')[1], 'base64'));
      resultados[lugar + '-' + fm[0]] = res;
      console.log(nombre + ': ' + o.ancho + 'x' + o.alto + ' · ' + (res.bytes / 1024).toFixed(0) + ' KB · calidad ' + res.calidad +
        ' · render ' + res.ms + ' ms · total ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + res.objetos + ' objetos');
    }
  }
  if (errores.length) { console.log('Avisos/errores de la página:'); errores.slice(0, 20).forEach(function (e) { console.log('  ' + e); }); }

  if (!rapido) {
    // las hojas se montan siempre con los 14 WebP que hay en disco (así basta con re-renderizar un lugar)
    lugares = todosLugares;
    resultados = {};
    lugares.forEach(function (l) {
      ['h', 'v'].forEach(function (f) {
        var buf = fs.readFileSync(path.join(FONDOS, l + '-' + f + '.webp'));
        resultados[l + '-' + f] = { webp: 'data:image/webp;base64,' + buf.toString('base64'), bytes: buf.length };
      });
    });
    // hoja con los 14 fondos
    var hoja = await navegador.newPage({ viewport: { width: 1800, height: 400 }, deviceScaleFactor: 1 });
    var celdas = '';
    lugares.forEach(function (l) {
      celdas += '<div class="fila"><h2>' + l + '</h2><div class="par">' +
        '<img class="h" src="' + resultados[l + '-h'].webp + '"><img class="v" src="' + resultados[l + '-v'].webp + '"></div>' +
        '<p>H ' + (resultados[l + '-h'].bytes / 1024).toFixed(0) + ' KB · V ' + (resultados[l + '-v'].bytes / 1024).toFixed(0) + ' KB</p></div>';
    });
    await hoja.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{margin:0;padding:18px;background:#F7F4EE;font-family:system-ui,sans-serif;color:#22306B}' +
      'h1{font-size:24px;margin:0 0 10px}.rejilla{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}' +
      'h2{font-size:17px;margin:0 0 6px}.par{display:flex;gap:8px;align-items:flex-start}' +
      'img{border-radius:8px;display:block;box-shadow:0 2px 6px rgba(0,0,0,.15)}.h{width:592px;height:370px}.v{width:231px;height:370px}' +
      'p{margin:4px 0 0;font-size:13px;opacity:.7}</style></head><body>' +
      '<h1>Fondos de los lugares · horizontal 1920×1200 y vertical 1200×1920</h1><div class="rejilla">' + celdas + '</div></body></html>');
    await hoja.screenshot({ path: path.join(DOCS, 'hoja-fondos.png'), fullPage: true });

    // prueba de legibilidad: maqueta de actividad encima de 3 fondos
    var prueba = await navegador.newPage({ viewport: { width: 1640, height: 400 }, deviceScaleFactor: 1 });
    var tarjetas = '';
    [['bosque-letras', 'A'], ['isla-hello', 'B'], ['cueva-eco', 'M']].forEach(function (d) {
      tarjetas += '<div class="caja"><img src="' + resultados[d[0] + '-h'].webp + '"><div class="ui">' +
        '<div class="tarjeta">' + d[1] + '</div><div class="botones"><div class="bot">🍎</div><div class="bot">⭐</div><div class="bot">🐟</div></div></div>' +
        '<p>' + d[0] + ' · horizontal</p></div>';
    });
    [['valle-curioso', '3'], ['lago-colores', 'O'], ['montana-numeros', '5']].forEach(function (d) {
      tarjetas += '<div class="caja cv"><img src="' + resultados[d[0] + '-v'].webp + '"><div class="ui">' +
        '<div class="tarjeta">' + d[1] + '</div><div class="botones"><div class="bot">🍎</div><div class="bot">⭐</div><div class="bot">🐟</div></div></div>' +
        '<p>' + d[0] + ' · vertical</p></div>';
    });
    await prueba.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{margin:0;padding:18px;background:#F7F4EE;font-family:system-ui,sans-serif;color:#22306B}h1{font-size:22px;margin:0 0 12px}' +
      '.fila{display:flex;gap:16px;flex-wrap:wrap}.caja{position:relative;width:520px;height:325px}.caja img{width:100%;height:100%;border-radius:10px;display:block}' +
      '.cv{width:280px;height:448px}' +
      '.ui{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5%}' +
      '.tarjeta{background:#fff;border-radius:18px;width:40%;aspect-ratio:1/0.8;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:800;color:#22306B;box-shadow:0 6px 18px rgba(34,48,107,.22);margin-top:6%}' +
      '.cv .tarjeta{width:62%;font-size:84px}' +
      '.botones{display:flex;gap:4%;width:70%;justify-content:center}.bot{background:#fff;border-radius:16px;width:24%;aspect-ratio:1.4/1;display:flex;align-items:center;justify-content:center;font-size:34px;box-shadow:0 4px 12px rgba(34,48,107,.2)}' +
      '.cv .botones{width:90%}.cv .bot{width:28%;font-size:28px}' +
      'p{position:absolute;left:8px;top:-2px;margin:0;font-size:12px;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:6px}</style></head><body>' +
      '<h1>Prueba de legibilidad · maqueta de actividad sobre los fondos</h1><div class="fila">' + tarjetas + '</div></body></html>');
    await prueba.screenshot({ path: path.join(DOCS, 'prueba-legibilidad.png'), fullPage: true });
    console.log('Hojas guardadas en ' + DOCS);
  }
  await navegador.close();
})().catch(function (e) { console.error(e); process.exit(1); });
