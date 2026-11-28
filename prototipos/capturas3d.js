/*
 * capturas3d.js · Capturas de revisión de Nico y Alba (v3), comparativa con la v2 y prueba pequeña.
 * Uso:  node prototipos/capturas3d.js
 * Salida (docs/creativo/3d/):
 *   v3/<quien>-<estado>.png     una por gesto (+ remate de «pensando» y agachado de «celebra»)
 *   hoja-estados-v3.png         los 16 estados
 *   caras-v3.png                primeros planos (expresiones)
 *   prueba-pequeno-v3.png       64 y 48 px, cuerpo y retrato, en color y en silueta
 *   comparativa-v2-v3.png       v2 y v3 en «espera» y «celebra» sobre bosque-letras-h y isla-hello-h
 *   pagina-prueba-v3.png        la página de prueba con un fondo real
 * Chromium se lanza con --allow-file-access-from-files para poder leer los .webp de fondos/ desde file://.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var pw = require('C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

var SALIDA = path.join(__dirname, '..', 'docs', 'creativo', '3d');
var SALIDA_V = path.join(SALIDA, 'v3');
var HTML = 'file:///' + path.join(__dirname, 'personajes3d.html').replace(/\\/g, '/');
var FONDOS = ['../fondos/bosque-letras-h.webp', '../fondos/isla-hello-h.webp'];

var MOMENTOS = { saludo: 0.55, espera: 1.0, habla: 0.3, explica: 0.9, animo: 0.38, celebra: 0.42, despedida: 0.7, pensando: 1.2 };
var ESTADOS = Object.keys(MOMENTOS);
var QUIENES = ['nico', 'alba'];
var ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'];

function dosFrames(page) {
  return page.evaluate(function () { return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); }); });
}
function b64(buf) { return 'data:image/png;base64,' + buf.toString('base64'); }

async function abrir(navegador, url, errores, etiqueta) {
  var page = await navegador.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', function (e) { errores.push(etiqueta + ' pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error' || (m.type() === 'warning' && /Personajes3D/.test(m.text()))) errores.push(etiqueta + ' ' + m.type() + ': ' + m.text()); });
  await page.goto(url);
  await page.evaluate(function () {
    var c = document.createElement('div');
    c.id = 'caja';
    c.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:440px;background-color:#CDEBFF;';
    document.body.appendChild(c);
  });
  return page;
}

async function foto(page, quien, estado, t, opciones, tam) {
  await page.evaluate(function (a) {
    var c = document.getElementById('caja');
    c.style.width = a.w + 'px'; c.style.height = a.h + 'px';
    if (window.pj) window.pj.destruir();
    window.pj = Personajes3D.crear(c, a.q, a.o);
    return Promise.resolve(window.pj.listo).then(function () { window.pj.fotograma(a.e, a.t); });
  }, { q: quien, e: estado, t: t, o: opciones || {}, w: tam ? tam[0] : 360, h: tam ? tam[1] : 440 });
  await dosFrames(page);
  return page.locator('#caja').screenshot();
}

async function hoja(navegador, archivo, titulo, filas, columnas, ancho, alto) {
  var p = await navegador.newPage({ viewport: { width: 200 + columnas * (ancho + 4), height: 400 }, deviceScaleFactor: 1 });
  var html = filas.map(function (f) {
    return '<h2>' + f.titulo + '</h2><div class="r">' + f.celdas.map(function (c) {
      return '<figure><img src="' + b64(c.img) + '"><figcaption>' + c.pie + '</figcaption></figure>';
    }).join('') + '</div>';
  }).join('');
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:16px;background:#fff;font-family:system-ui,sans-serif;color:#22306B}' +
    'h1{font-size:22px;margin:0 0 8px}h2{font-size:18px;margin:8px 0 4px}' +
    '.r{display:grid;grid-template-columns:repeat(' + columnas + ',' + ancho + 'px);gap:4px}' +
    'figure{margin:0}img{width:' + ancho + 'px;height:' + alto + 'px;display:block;border-radius:8px}' +
    'figcaption{text-align:center;font-size:14px;font-weight:600}</style></head><body><h1>' + titulo + '</h1>' + html + '</body></html>');
  await p.screenshot({ path: archivo, fullPage: true });
  await p.close();
}

(async function () {
  fs.mkdirSync(SALIDA_V, { recursive: true });
  var navegador = await pw.chromium.launch({ args: ARGS });
  var errores = [];

  var page = await abrir(navegador, HTML + '?vacio=1', errores, 'v3');
  var info = {}, fotos = {};
  for (var qi = 0; qi < QUIENES.length; qi++) {
    var q = QUIENES[qi];
    var lista = ESTADOS.map(function (e) { return [e, MOMENTOS[e], q + '-' + e]; });
    lista.push(['pensando', 2.85, q + '-pensando-remate']);
    lista.push(['celebra', 0.12, q + '-celebra-agachado']);
    for (var i = 0; i < lista.length; i++) {
      var buf = await foto(page, q, lista[i][0], lista[i][1]);
      fs.writeFileSync(path.join(SALIDA_V, lista[i][2] + '.png'), buf);
      fotos[lista[i][2]] = buf;
    }
    info[q] = await page.evaluate(function () { return window.pj.info; });
  }
  await hoja(navegador, path.join(SALIDA, 'hoja-estados-v3.png'), 'Nico y Alba · v3 · 8 estados',
    QUIENES.map(function (q) {
      return { titulo: q === 'nico' ? 'Nico' : 'Alba', celdas: ESTADOS.map(function (e) { return { img: fotos[q + '-' + e], pie: e }; }) };
    }), 8, 180, 220);

  var caras = {};
  for (qi = 0; qi < QUIENES.length; qi++) {
    caras[QUIENES[qi]] = [];
    for (i = 0; i < ESTADOS.length; i++) {
      var e = ESTADOS[i], t = e === 'despedida' ? 1.38 : MOMENTOS[e];
      caras[QUIENES[qi]].push({ img: await foto(page, QUIENES[qi], e, t, { encuadre: 'retrato' }, [320, 320]), pie: e });
    }
  }
  await hoja(navegador, path.join(SALIDA, 'caras-v3.png'), 'Caras v3', QUIENES.map(function (q) {
    return { titulo: q === 'nico' ? 'Nico' : 'Alba', celdas: caras[q] };
  }), 8, 200, 200);

  var pequenas = [];
  for (var ti = 0; ti < 2; ti++) {
    var tam = [64, 48][ti];
    for (qi = 0; qi < QUIENES.length; qi++) {
      for (var ei = 0; ei < 2; ei++) {
        var enc = ['cuerpo', 'retrato'][ei];
        var col = await foto(page, QUIENES[qi], 'espera', 0, { encuadre: enc }, [tam, tam]);
        await page.evaluate(function () {
          var c = document.getElementById('caja');
          c.style.background = '#FFFFFF'; c.querySelector('canvas').style.filter = 'brightness(0)';
        });
        await dosFrames(page);
        var sil = await page.locator('#caja').screenshot();
        await page.evaluate(function () { document.getElementById('caja').style.background = '#CDEBFF'; });
        pequenas.push({ t: tam, q: QUIENES[qi], e: enc, color: col, silueta: sil });
      }
    }
  }
  var pp = await navegador.newPage({ viewport: { width: 1150, height: 400 }, deviceScaleFactor: 1 });
  var html = '';
  [64, 48].forEach(function (t) {
    html += '<h2>' + t + ' px</h2><div class="f">';
    pequenas.filter(function (p) { return p.t === t; }).forEach(function (p) {
      html += '<figure><div class="par"><img src="' + b64(p.color) + '" style="width:' + t + 'px"><img src="' + b64(p.silueta) + '" style="width:' + t + 'px"></div>' +
              '<div class="par"><img class="x4" src="' + b64(p.color) + '" style="width:' + t * 4 + 'px"><img class="x4" src="' + b64(p.silueta) + '" style="width:' + t * 4 + 'px"></div>' +
              '<figcaption>' + p.q + ' · ' + p.e + '</figcaption></figure>';
    });
    html += '</div>';
  });
  await pp.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#fff;font-family:system-ui,sans-serif;color:#22306B}' +
    'h2{font-size:16px;margin:6px 0}.f{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0}.par{display:flex;gap:4px;align-items:flex-end;margin-bottom:4px}' +
    'img{display:block}.x4{image-rendering:pixelated}figcaption{font-size:13px}</style></head><body>' + html + '</body></html>');
  await pp.screenshot({ path: path.join(SALIDA, 'prueba-pequeno-v3.png'), fullPage: true });
  await pp.close();

  // comparativa v2 / v3 sobre los fondos reales
  var p2 = await abrir(navegador, HTML + '?v=2&vacio=1', errores, 'v2');
  var comp = [];
  for (qi = 0; qi < QUIENES.length; qi++) {
    var fila = { titulo: QUIENES[qi] === 'nico' ? 'Nico' : 'Alba', celdas: [] };
    for (var fi = 0; fi < FONDOS.length; fi++) {
      var fnd = FONDOS[fi], nom = fnd.replace(/^.*\//, '').replace('.webp', '');
      for (var si = 0; si < 2; si++) {
        var est = ['espera', 'celebra'][si], tt = MOMENTOS[est];
        fila.celdas.push({ img: await foto(p2, QUIENES[qi], est, tt, { fondo: fnd }), pie: 'v2 · ' + est + ' · ' + nom });
        fila.celdas.push({ img: await foto(page, QUIENES[qi], est, tt, { fondo: fnd }), pie: 'v3 · ' + est + ' · ' + nom });
      }
    }
    comp.push(fila);
  }
  await p2.close();
  await page.close();
  await hoja(navegador, path.join(SALIDA, 'comparativa-v2-v3.png'), 'Nico y Alba · v2 frente a v3 (luz de cielo HDRI)', comp, 8, 220, 269);

  var demo = await navegador.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
  demo.on('pageerror', function (e) { errores.push('demo pageerror: ' + e.message); });
  demo.on('console', function (m) { if (m.type() === 'error') errores.push('demo console: ' + m.text()); });
  await demo.goto(HTML + '?fondo=1&fondoUrl=' + encodeURIComponent('../fondos/valle-curioso-h.webp'));
  await demo.waitForTimeout(2500);
  await demo.screenshot({ path: path.join(SALIDA, 'pagina-prueba-v3.png') });
  var infoDemo = await demo.locator('#info').textContent();

  await navegador.close();
  console.log(JSON.stringify({ info: info, demo: infoDemo, errores: errores }, null, 1));
})().catch(function (e) { console.error(e); process.exit(1); });
