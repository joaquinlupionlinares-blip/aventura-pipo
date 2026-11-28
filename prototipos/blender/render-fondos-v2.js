/*
 * render-fondos-v2.js · Orquesta los fondos v2 (Blender Cycles) y las hojas de revisión.
 *
 * Uso:
 *   node prototipos/blender/render-fondos-v2.js                       → 7 lugares × (h, v) + luces + hojas
 *   node prototipos/blender/render-fondos-v2.js isla-hello cueva-eco  → solo esos lugares (las hojas se rehacen con lo que hay en disco)
 *   opciones: --muestras 128 --escala 100 --sin-luz --solo-hojas --exportar (vuelve a exportar las escenas de three.js)
 *
 * Requisitos: Blender 4.2 en la ruta de abajo, recursos de Poly Haven descargados (descargar-polyhaven.js)
 * y las escenas exportadas (exportar-escenas.js; se lanza solo si faltan).
 * Salidas: fondos/<lugar>-h.webp, fondos/<lugar>-v.webp, fondos/luz/<lugar>.jpg,
 *          docs/creativo/fondos/hoja-fondos.png, prueba-legibilidad.png y comparativa-v1-v2.png
 */
'use strict';
var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var pw = require('C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

var BLENDER = 'C:/Users/GAMER/Desktop/aventura-juanma-herramientas/blender-4.2.23-windows-x64/blender.exe';
var RAIZ = path.resolve(__dirname, '..', '..');
var FONDOS = path.join(RAIZ, 'fondos');
var DOCS = path.join(RAIZ, 'docs', 'creativo', 'fondos');
var TODOS = ['inicio', 'bosque-letras', 'montana-numeros', 'valle-curioso', 'isla-hello', 'lago-colores', 'cueva-eco'];

var args = process.argv.slice(2);
function opcion(n, d) { var i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
var muestras = opcion('--muestras', '128'), escala = opcion('--escala', '100');
var valores = [muestras, escala];
var lugares = args.filter(function (a, i) { return a.indexOf('--') !== 0 && valores.indexOf(a) < 0 && TODOS.indexOf(a) >= 0; });
if (!lugares.length) lugares = TODOS.slice();

function blender(lista) {
  var t0 = Date.now();
  var r = cp.spawnSync(BLENDER, ['-b', '--python-exit-code', '1', '-P', path.join(__dirname, 'fondo.py'), '--'].concat(lista), { encoding: 'utf8', maxBuffer: 1 << 28 });
  var lineas = (r.stdout || '').split('\n').filter(function (l) { return /\[fondo|Error|Traceback|error/i.test(l); });
  lineas.forEach(function (l) { console.log('   ' + l.trim()); });
  if (r.status !== 0) { console.error((r.stderr || '').slice(-3000)); throw new Error('Blender falló: ' + lista.join(' ')); }
  return (Date.now() - t0) / 1000;
}

(async function () {
  if (args.indexOf('--exportar') >= 0 || lugares.some(function (l) { return !fs.existsSync(path.join(__dirname, 'escenas', l + '-h.json')); })) {
    cp.execFileSync('node', [path.join(__dirname, 'exportar-escenas.js')].concat(lugares), { stdio: 'inherit' });
  }
  var tiempos = [];
  if (args.indexOf('--solo-hojas') < 0) {
    for (var i = 0; i < lugares.length; i++) {
      ['h', 'v'].forEach(function (o) {
        console.log('→ ' + lugares[i] + '-' + o);
        var s = blender([lugares[i], o, '--muestras', muestras, '--escala', escala, '--salida', path.join(FONDOS, lugares[i] + '-' + o + '.webp')]);
        tiempos.push(lugares[i] + '-' + o + ': ' + s.toFixed(0) + ' s');
      });
      if (args.indexOf('--sin-luz') < 0) {
        console.log('→ luz ' + lugares[i]);
        var s2 = blender([lugares[i], 'h', '--luz', path.join(FONDOS, 'luz', lugares[i] + '.jpg')]);
        tiempos.push('luz ' + lugares[i] + ': ' + s2.toFixed(0) + ' s');
      }
    }
    console.log('Tiempos (Blender completo, incluida la carga):\n  ' + tiempos.join('\n  '));
  }

  // ---------------------------------------------------------------- hojas
  function datos(ruta) { return 'data:image/webp;base64,' + fs.readFileSync(ruta).toString('base64'); }
  function kb(ruta) { return (fs.statSync(ruta).size / 1024).toFixed(0); }
  var nav = await pw.chromium.launch();
  fs.mkdirSync(DOCS, { recursive: true });
  var estilo = 'body{margin:0;padding:18px;background:#F7F4EE;font-family:system-ui,sans-serif;color:#22306B}h1{font-size:24px;margin:0 0 10px}';

  var celdas = TODOS.map(function (l) {
    var h = path.join(FONDOS, l + '-h.webp'), v = path.join(FONDOS, l + '-v.webp');
    return '<div><h2>' + l + '</h2><div class="par"><img class="h" src="' + datos(h) + '"><img class="v" src="' + datos(v) + '"></div>' +
      '<p>H ' + kb(h) + ' KB · V ' + kb(v) + ' KB</p></div>';
  }).join('');
  var p1 = await nav.newPage({ viewport: { width: 1800, height: 400 } });
  await p1.setContent('<!doctype html><meta charset="utf-8"><style>' + estilo + '.rejilla{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}' +
    'h2{font-size:17px;margin:0 0 6px}.par{display:flex;gap:8px}img{border-radius:8px;display:block;box-shadow:0 2px 6px rgba(0,0,0,.15)}' +
    '.h{width:592px;height:370px}.v{width:231px;height:370px}p{margin:4px 0 0;font-size:13px;opacity:.7}</style>' +
    '<h1>Fondos v2 (Blender Cycles) · horizontal 1920×1200 y vertical 1200×1920</h1><div class="rejilla">' + celdas + '</div>');
  await p1.screenshot({ path: path.join(DOCS, 'hoja-fondos.png'), fullPage: true });

  function maqueta(l, o, letra) {
    return '<div class="caja ' + (o === 'v' ? 'cv' : '') + '"><img src="' + datos(path.join(FONDOS, l + '-' + o + '.webp')) + '"><div class="ui"><div class="tarjeta">' + letra +
      '</div><div class="botones"><div class="bot">🍎</div><div class="bot">⭐</div><div class="bot">🐟</div></div></div><p>' + l + ' · ' + (o === 'v' ? 'vertical' : 'horizontal') + '</p></div>';
  }
  var p2 = await nav.newPage({ viewport: { width: 1640, height: 400 } });
  await p2.setContent('<!doctype html><meta charset="utf-8"><style>' + estilo + '.fila{display:flex;gap:16px;flex-wrap:wrap}.caja{position:relative;width:520px;height:325px}' +
    '.caja img{width:100%;height:100%;border-radius:10px;display:block}.cv{width:280px;height:448px}.ui{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5%}' +
    '.tarjeta{background:#fff;border-radius:18px;width:40%;aspect-ratio:1/0.8;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:800;color:#22306B;box-shadow:0 6px 18px rgba(34,48,107,.22);margin-top:6%}' +
    '.cv .tarjeta{width:62%;font-size:84px}.botones{display:flex;gap:4%;width:70%;justify-content:center}.bot{background:#fff;border-radius:16px;width:24%;aspect-ratio:1.4/1;display:flex;align-items:center;justify-content:center;font-size:34px;box-shadow:0 4px 12px rgba(34,48,107,.2)}' +
    '.cv .botones{width:90%}.cv .bot{width:28%;font-size:28px}p{position:absolute;left:8px;top:-2px;margin:0;font-size:12px;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:6px}</style>' +
    '<h1>Prueba de legibilidad v2 · maqueta de actividad sobre los fondos</h1><div class="fila">' +
    maqueta('bosque-letras', 'h', 'A') + maqueta('isla-hello', 'h', 'B') + maqueta('cueva-eco', 'h', 'M') +
    maqueta('valle-curioso', 'v', '3') + maqueta('lago-colores', 'v', 'O') + maqueta('montana-numeros', 'v', '5') + '</div>');
  await p2.screenshot({ path: path.join(DOCS, 'prueba-legibilidad.png'), fullPage: true });

  var comp = ['inicio', 'bosque-letras', 'cueva-eco'].map(function (l) {
    return '<div class="fila"><h2>' + l + '</h2><div class="par"><figure><img src="' + datos(path.join(FONDOS, 'v1', l + '-h.webp')) + '"><figcaption>v1 · three.js</figcaption></figure>' +
      '<figure><img src="' + datos(path.join(FONDOS, l + '-h.webp')) + '"><figcaption>v2 · Blender Cycles</figcaption></figure></div></div>';
  }).join('');
  var p3 = await nav.newPage({ viewport: { width: 1640, height: 400 } });
  await p3.setContent('<!doctype html><meta charset="utf-8"><style>' + estilo + 'h2{font-size:17px;margin:12px 0 6px}.par{display:flex;gap:16px}figure{margin:0}' +
    'img{width:792px;height:495px;border-radius:8px;display:block;box-shadow:0 2px 6px rgba(0,0,0,.15)}figcaption{font-size:14px;font-weight:600;margin-top:4px}</style>' +
    '<h1>Comparativa · antes (v1) y después (v2)</h1>' + comp);
  await p3.screenshot({ path: path.join(DOCS, 'comparativa-v1-v2.png'), fullPage: true });
  await nav.close();
  console.log('Hojas guardadas en ' + DOCS);
})().catch(function (e) { console.error(e); process.exit(1); });
