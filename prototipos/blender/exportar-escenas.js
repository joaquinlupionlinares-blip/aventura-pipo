/*
 * exportar-escenas.js · Vuelca cada lugar de prototipos/escenarios.js (three.js) a JSON para reconstruirlo en Blender.
 * Así los fondos v2 conservan exactamente la composición de los v1 (posiciones, formas, colores y cámara).
 *
 * Uso: node prototipos/blender/exportar-escenas.js [lugar ...]
 * Salida: prototipos/blender/escenas/<lugar>-h.json y <lugar>-v.json (generados; ignorados por git)
 *
 * Contenido: cámara, niebla, luces, geometrías (Float32/Uint32 en base64, coordenadas three.js),
 * mallas con su matriz de mundo, mallas instanciadas con sus matrices y colores, y las posiciones de la
 * hierba y las flores de three.js (Blender las usa como mapa de dónde poner hierba y flores de verdad).
 */
'use strict';
var path = require('path');
var fs = require('fs');
var pw = require('C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

var RAIZ = path.resolve(__dirname, '..', '..');
var SALIDA = path.join(__dirname, 'escenas');

function exportarEnPagina(o) {
  var THREE = window.THREE;
  var scene = new THREE.Scene();
  var info = window.Escenarios.construir(scene, o.lugar, { vertical: o.vertical });
  scene.updateMatrixWorld(true);

  function b64(arr) {
    var u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), s = '', paso = 0x8000;
    for (var i = 0; i < u8.length; i += paso) s += String.fromCharCode.apply(null, u8.subarray(i, i + paso));
    return btoa(s);
  }
  function lin(c) { return [c.r, c.g, c.b]; } // three guarda los colores ya en lineal
  var geos = [], geoId = new Map(), texs = {}, mats = [], matId = new Map();

  function geo(g) {
    if (geoId.has(g)) return geoId.get(g);
    var a = g.attributes, d = { tipo: g.type, params: {}, n: a.position.count };
    for (var k in (g.parameters || {})) { var v = g.parameters[k]; if (typeof v === 'number' || typeof v === 'boolean') d.params[k] = v; }
    d.pos = b64(new Float32Array(a.position.array));
    if (a.normal) d.nor = b64(new Float32Array(a.normal.array));
    if (a.color) { d.col = b64(new Float32Array(a.color.array)); d.colTam = a.color.itemSize; }
    if (a.uv) d.uv = b64(new Float32Array(a.uv.array));
    if (g.index) d.idx = b64(new Uint32Array(g.index.array));
    geos.push(d); geoId.set(g, geos.length - 1);
    return geos.length - 1;
  }
  function material(m) {
    if (matId.has(m)) return matId.get(m);
    var d = { tipo: m.type, color: m.color ? lin(m.color) : [1, 1, 1], rug: m.roughness === undefined ? 1 : m.roughness, metal: m.metalness || 0,
      emisivo: m.emissive ? lin(m.emissive) : [0, 0, 0], brillo: m.emissiveIntensity === undefined ? 0 : m.emissiveIntensity,
      opacidad: m.transparent ? m.opacity : 1, doble: m.side === THREE.DoubleSide, atras: m.side === THREE.BackSide,
      vcol: !!m.vertexColors, niebla: m.fog !== false, aditivo: m.blending === THREE.AdditiveBlending, plano: !!m.flatShading };
    if (m.map && m.map.image && m.map.image.toDataURL) {
      if (!texs[m.map.uuid]) texs[m.map.uuid] = m.map.image.toDataURL('image/png');
      d.mapa = m.map.uuid;
    }
    mats.push(d); matId.set(m, mats.length - 1);
    return mats.length - 1;
  }

  var out = { lugar: o.lugar, vertical: o.vertical, camara: info.camara, exposicion: info.exposicion,
    niebla: scene.fog ? { color: lin(scene.fog.color), cerca: scene.fog.near, lejos: scene.fog.far } : null,
    mallas: [], instancias: [], luces: [], hierba: [], flores: [] };
  var m4 = new THREE.Matrix4(), c = new THREE.Color(), p = new THREE.Vector3();

  scene.traverse(function (ob) {
    if (ob.isInstancedMesh) {
      var g = ob.geometry, pr = g.parameters || {};
      // hierba de three.js (conos de 3 lados): solo interesa dónde está → mapa de hierba en Blender
      if (g.type === 'ConeGeometry' && pr.radialSegments === 3) {
        for (var i = 0; i < ob.count; i++) { ob.getMatrixAt(i, m4); m4.premultiply(ob.matrixWorld); p.setFromMatrixPosition(m4); out.hierba.push(+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)); }
        return;
      }
      // tallos de flor: se sustituyen por flores de Blender
      if (g.type === 'CylinderGeometry' && pr.radiusTop === 0.02) return;
      // cabezas de flor: posición y color
      if (g.type === 'IcosahedronGeometry' && Math.abs(pr.radius - 0.1) < 1e-6) {
        for (i = 0; i < ob.count; i++) {
          ob.getMatrixAt(i, m4); m4.premultiply(ob.matrixWorld); p.setFromMatrixPosition(m4); ob.getColorAt(i, c);
          out.flores.push(+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), +c.r.toFixed(4), +c.g.toFixed(4), +c.b.toFixed(4));
        }
        return;
      }
      var mats16 = new Float32Array(ob.count * 16), cols = new Float32Array(ob.count * 3);
      for (i = 0; i < ob.count; i++) {
        ob.getMatrixAt(i, m4); m4.premultiply(ob.matrixWorld); mats16.set(m4.elements, i * 16);
        if (ob.instanceColor) { ob.getColorAt(i, c); cols.set([c.r, c.g, c.b], i * 3); } else cols.set([1, 1, 1], i * 3);
      }
      out.instancias.push({ geo: geo(g), mat: material(ob.material), n: ob.count, matrices: b64(mats16), colores: b64(cols), sombra: ob.castShadow });
    } else if (ob.isMesh) {
      var gp = ob.geometry.parameters || {};
      if (gp.radius >= 1000) return; // cúpula de cielo de three.js: en Blender el cielo es un HDRI
      out.mallas.push({ geo: geo(ob.geometry), mat: material(ob.material), matriz: Array.from(ob.matrixWorld.elements), sombra: ob.castShadow, orden: ob.renderOrder });
    } else if (ob.isPointLight) {
      ob.getWorldPosition(p);
      out.luces.push({ tipo: 'punto', pos: [p.x, p.y, p.z], color: lin(ob.color), intensidad: ob.intensity, distancia: ob.distance });
    } else if (ob.isDirectionalLight) {
      var t = new THREE.Vector3(); ob.getWorldPosition(p); ob.target.getWorldPosition(t);
      out.luces.push({ tipo: 'sol', dir: p.sub(t).normalize().toArray(), color: lin(ob.color), intensidad: ob.intensity });
    } else if (ob.isHemisphereLight) {
      out.luces.push({ tipo: 'hemi', cielo: lin(ob.color), suelo: lin(ob.groundColor), intensidad: ob.intensity });
    } else if (ob.isSprite) {
      ob.getWorldPosition(p);
      out.luces.push({ tipo: 'resplandor', pos: [p.x, p.y, p.z], escala: [ob.scale.x, ob.scale.y] });
    }
  });
  out.geos = geos; out.materiales = mats; out.texturas = texs;
  return JSON.stringify(out);
}

(async function () {
  fs.mkdirSync(SALIDA, { recursive: true });
  var navegador = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  var page = await navegador.newPage();
  page.on('pageerror', function (e) { console.error('pageerror: ' + e.message); });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ path: path.join(RAIZ, 'vendor', 'three.min.js') });
  await page.addScriptTag({ path: path.join(RAIZ, 'prototipos', 'escenarios.js') });
  // Los contornos cerrados con absellipse (la O, el 0, las notas) repiten el primer punto al final; el bisel de
  // ExtrudeGeometry calcula mal ese tramo de longitud cero y deja un surco. Se quita el punto repetido al exportar.
  await page.evaluate(function () {
    var orig = THREE.Shape.prototype.extractPoints;
    THREE.Shape.prototype.extractPoints = function (div) {
      var r = orig.call(this, div);
      function limpiar(a) { if (a.length > 3 && a[0].distanceTo(a[a.length - 1]) < 1e-6) a.pop(); return a; }
      limpiar(r.shape); r.holes.forEach(limpiar);
      return r;
    };
  });
  var lugares = await page.evaluate(function () { return window.Escenarios.lugares; });
  var pedidos = process.argv.slice(2);
  if (pedidos.length) lugares = lugares.filter(function (l) { return pedidos.indexOf(l) >= 0; });
  for (var i = 0; i < lugares.length; i++) {
    for (var v = 0; v < 2; v++) {
      var txt = await page.evaluate(exportarEnPagina, { lugar: lugares[i], vertical: !!v });
      var f = path.join(SALIDA, lugares[i] + '-' + (v ? 'v' : 'h') + '.json');
      fs.writeFileSync(f, txt);
      var d = JSON.parse(txt);
      console.log(path.basename(f) + ': ' + (txt.length / 1048576).toFixed(1) + ' MB · ' + d.mallas.length + ' mallas · ' + d.instancias.length + ' grupos instanciados · ' +
        (d.hierba.length / 3) + ' puntos de hierba · ' + (d.flores.length / 6) + ' flores · ' + d.luces.length + ' luces');
    }
  }
  await navegador.close();
})().catch(function (e) { console.error(e); process.exit(1); });
