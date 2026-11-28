/*
 * capturas3d.js · Saca una captura por gesto y personaje, la hoja resumen y la prueba a 64/48 px.
 * Uso:  node prototipos/capturas3d.js
 * Salida: docs/creativo/3d/
 */
'use strict';
var path = require('path');
var fs = require('fs');
var pw = require('C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

var RAIZ = path.resolve(__dirname, '..');
var SALIDA = path.join(RAIZ, 'docs', 'creativo', '3d');
var PAGINA = 'file:///' + path.join(__dirname, 'personajes3d.html').replace(/\\/g, '/') + '?vacio=1';

// segundo del gesto que mejor lo resume
var MOMENTOS = { saludo: 0.55, espera: 1.0, habla: 0.3, explica: 0.9, animo: 0.38, celebra: 0.42, despedida: 0.7, pensando: 1.2 };
var ESTADOS = Object.keys(MOMENTOS);
var QUIENES = ['nico', 'alba'];

function dosFrames(page) {
  return page.evaluate(function () { return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); }); });
}

(async function () {
  fs.mkdirSync(SALIDA, { recursive: true });
  var navegador = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  var page = await navegador.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  var errores = [];
  page.on('pageerror', function (e) { errores.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  await page.goto(PAGINA);

  // contenedor de captura (fondo cielo del juego)
  await page.evaluate(function () {
    var c = document.createElement('div');
    c.id = 'caja';
    c.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:440px;background:#CDEBFF;';
    document.body.appendChild(c);
  });

  var info = {};
  var fotos = {};
  for (var qi = 0; qi < QUIENES.length; qi++) {
    var quien = QUIENES[qi];
    var ok = await page.evaluate(function (q) {
      window.pj = Personajes3D.crear(document.getElementById('caja'), q);
      return window.pj ? window.pj.info : null;
    }, quien);
    if (!ok) throw new Error('crear devolvió null para ' + quien + ' (¿sin WebGL?)');
    info[quien] = ok;
    var lista = ESTADOS.map(function (e) { return [e, MOMENTOS[e], quien + '-' + e + '.png']; });
    lista.push(['pensando', 2.85, quien + '-pensando-remate.png']);
    lista.push(['celebra', 0.08, quien + '-celebra-agachado.png']);
    for (var i = 0; i < lista.length; i++) {
      await page.evaluate(function (a) { window.pj.fotograma(a[0], a[1]); }, lista[i]);
      await dosFrames(page);
      var buf = await page.locator('#caja').screenshot({ path: path.join(SALIDA, lista[i][2]) });
      fotos[lista[i][2]] = buf.toString('base64');
    }
    await page.evaluate(function () { window.pj.destruir(); window.pj = null; });
  }

  // prueba a tamaño pequeño: 64 y 48 px, cuerpo entero y retrato, en color y en silueta
  var pequenas = [];
  var tamanos = [64, 48];
  for (var ti = 0; ti < tamanos.length; ti++) {
    for (var qj = 0; qj < QUIENES.length; qj++) {
      var encuadres = ['cuerpo', 'retrato'];
      for (var ei = 0; ei < encuadres.length; ei++) {
        var tam = tamanos[ti], q2 = QUIENES[qj], enc = encuadres[ei];
        await page.evaluate(function (a) {
          var c = document.getElementById('caja');
          c.style.width = a.t + 'px'; c.style.height = a.t + 'px';
          window.pj = Personajes3D.crear(c, a.q, { encuadre: a.e });
          window.pj.fotograma('espera', 0);
        }, { t: tam, q: q2, e: enc });
        await dosFrames(page);
        var color = await page.locator('#caja').screenshot();
        await page.evaluate(function () {
          var c = document.getElementById('caja');
          c.style.background = '#FFFFFF';
          c.querySelector('canvas').style.filter = 'brightness(0)';
        });
        await dosFrames(page);
        var silueta = await page.locator('#caja').screenshot();
        await page.evaluate(function () {
          window.pj.destruir(); window.pj = null;
          document.getElementById('caja').style.background = '#CDEBFF';
        });
        pequenas.push({ t: tam, q: q2, e: enc, color: color.toString('base64'), silueta: silueta.toString('base64') });
      }
    }
  }
  await page.evaluate(function () { var c = document.getElementById('caja'); c.style.width = '360px'; c.style.height = '440px'; });

  // hoja resumen de los 16 estados
  var hoja = await navegador.newPage({ viewport: { width: 1480, height: 400 }, deviceScaleFactor: 1 });
  var celdas = '';
  QUIENES.forEach(function (q) {
    celdas += '<div class="fila"><h2>' + (q === 'nico' ? 'Nico' : 'Alba') + '</h2><div class="rejilla">';
    ESTADOS.forEach(function (e) {
      celdas += '<figure><img src="data:image/png;base64,' + fotos[q + '-' + e + '.png'] + '"><figcaption>' + e + '</figcaption></figure>';
    });
    celdas += '</div></div>';
  });
  await hoja.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:16px;background:#fff;font-family:system-ui,sans-serif;color:#22306B}' +
    'h1{font-size:22px;margin:0 0 8px}h2{font-size:18px;margin:8px 0 4px}' +
    '.rejilla{display:grid;grid-template-columns:repeat(8,180px);gap:4px}' +
    'figure{margin:0}img{width:180px;height:220px;display:block;border-radius:8px}' +
    'figcaption{text-align:center;font-size:14px;font-weight:600}</style></head><body>' +
    '<h1>Nico y Alba · 8 estados</h1>' + celdas + '</body></html>');
  await hoja.screenshot({ path: path.join(SALIDA, 'hoja-estados.png'), fullPage: true });

  // composición de la prueba pequeña: tamaño real y ampliado ×4 (píxel a píxel)
  var html = '';
  tamanos.forEach(function (t) {
    html += '<h2>' + t + ' px</h2><div class="f">';
    pequenas.filter(function (p) { return p.t === t; }).forEach(function (p) {
      html += '<figure><div class="par"><img src="data:image/png;base64,' + p.color + '" style="width:' + t + 'px">' +
              '<img src="data:image/png;base64,' + p.silueta + '" style="width:' + t + 'px"></div>' +
              '<div class="par"><img class="x4" src="data:image/png;base64,' + p.color + '" style="width:' + t * 4 + 'px">' +
              '<img class="x4" src="data:image/png;base64,' + p.silueta + '" style="width:' + t * 4 + 'px"></div>' +
              '<figcaption>' + p.q + ' · ' + p.e + '</figcaption></figure>';
    });
    html += '</div>';
  });
  await hoja.setViewportSize({ width: 1150, height: 400 });
  await hoja.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:12px;background:#fff;font-family:system-ui,sans-serif;color:#22306B}' +
    'h2{font-size:16px;margin:6px 0}.f{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0}' +
    '.par{display:flex;gap:4px;align-items:flex-end;margin-bottom:4px}img{display:block}.x4{image-rendering:pixelated}' +
    'figcaption{font-size:13px}</style></head><body>' + html + '</body></html>');
  await hoja.screenshot({ path: path.join(SALIDA, 'prueba-pequeno.png'), fullPage: true });

  // la página de prueba tal cual (los dos a la vez), por si falla algo al crearlos juntos
  var demo = await navegador.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
  demo.on('pageerror', function (e) { errores.push('demo pageerror: ' + e.message); });
  demo.on('console', function (m) { if (m.type() === 'error') errores.push('demo console: ' + m.text()); });
  await demo.goto(PAGINA.replace('?vacio=1', ''));
  await demo.waitForTimeout(800);
  await demo.screenshot({ path: path.join(SALIDA, 'pagina-prueba.png') });
  var infoDemo = await demo.locator('#info').textContent();

  await navegador.close();
  console.log(JSON.stringify({ mallas: info, demo: infoDemo, errores: errores }, null, 1));
})().catch(function (e) { console.error(e); process.exit(1); });
