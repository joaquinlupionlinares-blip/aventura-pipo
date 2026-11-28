/*
 * descargar-polyhaven.js · Descarga los recursos CC0 de Poly Haven que usan los fondos v2.
 * Uso: node prototipos/blender/descargar-polyhaven.js
 * Destino (fuera del repositorio): C:\Users\GAMER\Desktop\aventura-juanma-herramientas\polyhaven\
 * Solo usa la API pública (api.polyhaven.com) y su CDN de descargas (dl.polyhaven.org).
 * Comprueba el MD5 de cada archivo y escribe CREDITOS.md con id, URL, autores y licencia.
 */
'use strict';
var https = require('https');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DESTINO = 'C:/Users/GAMER/Desktop/aventura-juanma-herramientas/polyhaven';
var HDRIS = [
  ['kloofendal_48d_partly_cloudy_puresky', '4k'], // cielo con nubes altas, sol a ~48°
  ['kloofendal_43d_clear_puresky', '4k']          // cielo despejado, sol a ~43°
];
// textura → mapas (2k, jpg)
var TEXTURAS = ['leafy_grass', 'dirt', 'coast_sand_01', 'rock_face_03', 'rock_boulder_dry', 'bark_brown_02', 'palm_tree_bark', 'brown_planks_03', 'snow_02'];
var MAPAS = { Diffuse: 'diff', Rough: 'rough', nor_gl: 'nor_gl' };

function bajar(url) {
  return new Promise(function (ok, mal) {
    https.get(url, { headers: { 'User-Agent': 'fondos-juego-infantil/1.0' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return bajar(res.headers.location).then(ok, mal);
      if (res.statusCode !== 200) return mal(new Error(url + ' → HTTP ' + res.statusCode));
      var trozos = []; res.on('data', function (d) { trozos.push(d); }); res.on('end', function () { ok(Buffer.concat(trozos)); });
    }).on('error', mal);
  });
}
async function json(url) { return JSON.parse((await bajar(url)).toString('utf8')); }
async function guardar(info, destino) {
  if (fs.existsSync(destino) && crypto.createHash('md5').update(fs.readFileSync(destino)).digest('hex') === info.md5) return 'ya estaba';
  var b = await bajar(info.url);
  var md5 = crypto.createHash('md5').update(b).digest('hex');
  if (md5 !== info.md5) throw new Error('MD5 no coincide: ' + info.url);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, b);
  return (b.length / 1048576).toFixed(1) + ' MB';
}

(async function () {
  fs.mkdirSync(DESTINO, { recursive: true });
  var creditos = [];
  for (var i = 0; i < HDRIS.length; i++) {
    var id = HDRIS[i][0], res = HDRIS[i][1];
    var files = await json('https://api.polyhaven.com/files/' + id), info = await json('https://api.polyhaven.com/info/' + id);
    var f = files.hdri[res].hdr, dest = path.join(DESTINO, 'hdri', id + '_' + res + '.hdr');
    console.log(id + ': ' + await guardar(f, dest));
    creditos.push({ id: id, tipo: 'HDRI', nombre: info.name, autores: Object.keys(info.authors || {}).join(', '), archivos: [f.url] });
  }
  for (i = 0; i < TEXTURAS.length; i++) {
    id = TEXTURAS[i];
    files = await json('https://api.polyhaven.com/files/' + id); info = await json('https://api.polyhaven.com/info/' + id);
    var urls = [];
    for (var m in MAPAS) {
      f = files[m]['2k'].jpg;
      dest = path.join(DESTINO, 'texturas', id, id + '_' + MAPAS[m] + '_2k.jpg');
      console.log(id + ' ' + MAPAS[m] + ': ' + await guardar(f, dest));
      urls.push(f.url);
    }
    creditos.push({ id: id, tipo: 'Textura PBR 2k', nombre: info.name, autores: Object.keys(info.authors || {}).join(', '), archivos: urls });
  }
  var md = '# Créditos · recursos de Poly Haven\n\nTodos los recursos son de [Poly Haven](https://polyhaven.com) con licencia **CC0 1.0** (dominio público, ' +
    'https://polyhaven.com/license). No exigen atribución; se anotan por trazabilidad.\n\n' +
    '| id | tipo | nombre | autores | página | licencia |\n|---|---|---|---|---|---|\n' +
    creditos.map(function (c) { return '| `' + c.id + '` | ' + c.tipo + ' | ' + c.nombre + ' | ' + c.autores + ' | https://polyhaven.com/a/' + c.id + ' | CC0 1.0 |'; }).join('\n') +
    '\n\n## Archivos descargados\n\n' + creditos.map(function (c) { return c.archivos.map(function (u) { return '- ' + u; }).join('\n'); }).join('\n') +
    '\n\nDescargados con `prototipos/blender/descargar-polyhaven.js` (API pública https://api.polyhaven.com).\n';
  fs.writeFileSync(path.join(DESTINO, 'CREDITOS.md'), md);
  console.log('CREDITOS.md escrito');
})().catch(function (e) { console.error(e); process.exit(1); });
