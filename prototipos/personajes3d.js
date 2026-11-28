/*
 * personajes3d.js · v3 · Nico y Alba, «animación 3D de película» en tiempo real (three.js r158).
 * Versiones anteriores con la misma API: personajes3d-v1.js (juguete) y personajes3d-v2.js.
 *
 * Script clásico: necesita window.THREE (vendor/three.min.js) cargado antes. Sin módulos ni import.
 * Opcional: cargar también luz/<cielo>_1k.js, que registra el cielo como data URL (necesario desde file://).
 *
 *   var pj = Personajes3D.crear(contenedor, 'nico' | 'alba', opciones?)   // null si no hay WebGL
 *   pj.estado('saludo' | 'espera' | 'habla' | 'explica' | 'animo' | 'celebra' | 'despedida' | 'pensando')
 *   pj.hablar(true | false)    // capa aparte: mueve la boca en cualquier estado
 *   pj.calma(true | false)     // movimiento reducido: sin balanceos ni saltos
 *   pj.estadoActual()
 *   pj.fotograma(estado, s)    // para pruebas: congela el gesto en el segundo s
 *   pj.listo                   // promesa: se cumple cuando la luz de entorno está cargada (o ha fallado)
 *   pj.destruir()
 *
 * Opciones (todas opcionales):
 *   encuadre: 'cuerpo' (por defecto) | 'retrato'
 *   giro:     grados de giro de reposo (por defecto Nico +14, Alba −10)
 *   fondo:    ruta de una imagen que se pone detrás (fondo CSS del contenedor); sin ella, transparente
 *   sombras:  true (por defecto: autosombras con el sol, mapa de 1024) | false (solo sombra de contacto)
 *   entorno:  ruta del cielo equirectangular (JPG «tonemapped» de Poly Haven). Por defecto
 *             luz/kloofendal_48d_partly_cloudy_puresky_1k.jpg. false = sin luz de entorno.
 *   solGiro:  grados: dónde queda el sol alrededor del personaje (0 = detrás de la cámara,
 *             negativo = a la izquierda). Por defecto −35. El cielo se gira para que coincida.
 *   suelo:    color del suelo para teñir la mitad inferior del cielo (por defecto '#8A7A5A').
 *
 * Arquitectura: todos los personajes comparten UN WebGLRenderer (un solo contexto WebGL en la tablet)
 * y el entorno PMREM se genera una vez por cielo. Cada contenedor tiene su propio canvas 2D, al que se
 * copia la imagen tras pintar. Brazos, piernas y mandíbula son SkinnedMesh (articulaciones suaves).
 */
(function () {
  'use strict';

  var ESTADOS = ['saludo', 'espera', 'habla', 'explica', 'animo', 'celebra', 'despedida', 'pensando'];
  if (!window.THREE) {
    window.Personajes3D = { crear: function () { return null; }, estados: ESTADOS.slice() };
    return;
  }
  var THREE = window.THREE;
  var G = Math.PI / 180;
  var TRANSICION = 0.3;
  var DURACION = { saludo: 1.3, animo: 1.5, celebra: 1.2, despedida: 1.7, pensando: 3.4 };
  var BASE_SCRIPT = (function () {
    try { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, '') : ''; } catch (e) { return ''; }
  })();
  var ENTORNO_DEFECTO = 'luz/kloofendal_48d_partly_cloudy_puresky_1k.jpg';

  // ---------------------------------------------------------------- utilidades numéricas
  function lim01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function suave(x) { x = lim01(x); return x * x * (3 - 2 * x); }
  function rampa(t, a, b) { return suave((t - a) / (b - a)); }
  function campana(t, a, b) { return (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a)); }
  function meseta(t, a, b, c, d) { return rampa(t, a, b) * (1 - rampa(t, c, d)); }
  function onda(t, hz, fase) { return Math.sin(2 * Math.PI * hz * t + (fase || 0)); }
  function lerp(a, b, w) { return a + (b - a) * w; }
  function mezclarEn(P, Q, w) { if (w <= 0) return; for (var k in Q) P[k] = lerp(P[k], Q[k], w); }
  function azar(semilla) { var s = semilla; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  function hayWebGL() {
    try {
      if (!window.WebGLRenderingContext) return false;
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- geometría
  var V3 = THREE.Vector3;
  function color(hex) { return new THREE.Color(hex); }
  function matriz(p, r, s) {
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r ? r[0] : 0) * G, (r ? r[1] : 0) * G, (r ? r[2] : 0) * G));
    var e = s == null ? [1, 1, 1] : (typeof s === 'number' ? [s, s, s] : s);
    return new THREE.Matrix4().compose(new V3(p[0], p[1], p[2]), q, new V3(e[0], e[1], e[2]));
  }
  function suavizar(geo) {
    geo.computeVertexNormals();
    var p = geo.attributes.position, n = geo.attributes.normal, mapa = {}, i, k;
    for (i = 0; i < p.count; i++) {
      k = Math.round(p.getX(i) * 1e5) + '_' + Math.round(p.getY(i) * 1e5) + '_' + Math.round(p.getZ(i) * 1e5);
      (mapa[k] || (mapa[k] = [])).push(i);
    }
    var v = new V3();
    for (k in mapa) {
      var l = mapa[k];
      if (l.length < 2) continue;
      v.set(0, 0, 0);
      for (i = 0; i < l.length; i++) { v.x += n.getX(l[i]); v.y += n.getY(l[i]); v.z += n.getZ(l[i]); }
      v.normalize();
      for (i = 0; i < l.length; i++) n.setXYZ(l[i], v.x, v.y, v.z);
    }
    n.needsUpdate = true;
    return geo;
  }
  function deformar(geo, fn) {
    var p = geo.attributes.position, v = new V3();
    for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
    return suavizar(geo);
  }
  function pintar(geo, c) {
    var p = geo.attributes.position, arr = new Float32Array(p.count * 3), v = new V3(), out = new THREE.Color();
    var fijo = typeof c === 'function' ? null : color(c);
    for (var i = 0; i < p.count; i++) {
      if (fijo) out.copy(fijo); else { v.fromBufferAttribute(p, i); c(v, out, i); }
      arr[i * 3] = out.r; arr[i * 3 + 1] = out.g; arr[i * 3 + 2] = out.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  // Fusiona piezas [geo, matriz?, color?] en una geometría con color por vértice y UV.
  function fusionar(partes) {
    var pos = [], nor = [], col = [], uvs = [], idx = [], base = 0, v = new V3(), nm = new THREE.Matrix3();
    partes.forEach(function (pt) {
      var g = pt[0], m = pt[1] || new THREE.Matrix4();
      if (!g.attributes.color) pintar(g, pt[2] != null ? pt[2] : 0xffffff);
      var gp = g.attributes.position, gn = g.attributes.normal, gc = g.attributes.color, gu = g.attributes.uv, i;
      nm.getNormalMatrix(m);
      for (i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(gc.getX(i), gc.getY(i), gc.getZ(i));
        if (gu) uvs.push(gu.getX(i), gu.getY(i)); else uvs.push(0, 0);
      }
      if (g.index) { for (i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); }
      else { for (i = 0; i < gp.count; i++) idx.push(base + i); }
      base += gp.count;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(idx);
    out.computeBoundingSphere();
    return out;
  }
  function esfera(w, h) { return new THREE.SphereGeometry(1, w || 16, h || 12); }
  function capsula(r, l, rad) { return new THREE.CapsuleGeometry(r, l, 4, rad || 12); }
  function cilindro(rt, rb, h, rad, abierto) { return new THREE.CylinderGeometry(rt, rb, h, rad || 16, 1, !!abierto); }
  function toro(R, t, rs, ts, arco) { return new THREE.TorusGeometry(R, t, rs || 8, ts || 24, arco || Math.PI * 2); }
  // torno: perfil [radio, y] de abajo arriba
  function torno(perfil, seg, sz) {
    var g = new THREE.LatheGeometry(perfil.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg || 28);
    g.scale(1, 1, sz || 1);
    return suavizar(g);
  }
  function tubo(puntos, r, seg) {
    var curva = new THREE.CatmullRomCurve3(puntos.map(function (p) { return new V3(p[0], p[1], p[2]); }));
    return new THREE.TubeGeometry(curva, seg || 12, r, 6, false);
  }
  function tuboVariable(puntos, rfun, tubular, radial) {
    var curva = new THREE.CatmullRomCurve3(puntos);
    var g = new THREE.TubeGeometry(curva, tubular, 1, radial, false);
    var p = g.attributes.position, v = new V3(), c = new V3();
    for (var i = 0; i <= tubular; i++) {
      curva.getPointAt(i / tubular, c);
      var r = rfun(i / tubular);
      for (var j = 0; j <= radial; j++) {
        var k = i * (radial + 1) + j;
        v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
        p.setXYZ(k, v.x, v.y, v.z);
      }
    }
    return suavizar(g);
  }
  function perfilMechon(r0, rMax, pico) {
    return function (t) { return t < pico ? lerp(r0, rMax, suave(t / pico)) : rMax * Math.pow(Math.max(0, 1 - (t - pico) / (1 - pico)), 0.8) + 0.0003; };
  }

  // ---------------------------------------------------------------- texturas procedurales (≤ 512 px)
  function lienzo(n) { var c = document.createElement('canvas'); c.width = c.height = n; return c; }
  function texturaSombra() {
    var c = lienzo(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.45, 'rgba(0,0,0,0.36)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  // Iris: degradado radial, fibras, anillo límbico y pupila; alrededor, esclerótica.
  function texturaIris(irisHex, claroHex, semilla) {
    var N = 256, c = lienzo(N), x = c.getContext('2d'), rnd = azar(semilla), m = N / 2;
    var R = m * Math.sin(41 * G), Rp = m * Math.sin(16 * G);
    var gs = x.createRadialGradient(m, m, R, m, m, m);
    gs.addColorStop(0, '#F6F2EC'); gs.addColorStop(0.7, '#F1E8E2'); gs.addColorStop(1, '#E6D2CB');
    x.fillStyle = gs; x.fillRect(0, 0, N, N);
    var ci = new THREE.Color(irisHex), cc = new THREE.Color(claroHex);
    function css(c, k) { return 'rgb(' + Math.round(c.r * 255 * k) + ',' + Math.round(c.g * 255 * k) + ',' + Math.round(c.b * 255 * k) + ')'; }
    var gi = x.createRadialGradient(m, m, Rp, m, m, R);
    gi.addColorStop(0, css(cc, 1)); gi.addColorStop(0.45, css(ci, 1.05)); gi.addColorStop(0.85, css(ci, 0.75)); gi.addColorStop(1, css(ci, 0.35));
    x.fillStyle = gi; x.beginPath(); x.arc(m, m, R, 0, Math.PI * 2); x.fill();
    for (var i = 0; i < 140; i++) {                         // fibras del iris
      var a = rnd() * Math.PI * 2, r0 = Rp * (1 + rnd() * 0.2), r1 = R * (0.75 + rnd() * 0.22);
      x.strokeStyle = rnd() < 0.5 ? 'rgba(255,240,200,' + (0.08 + rnd() * 0.12) + ')' : 'rgba(20,10,0,' + (0.08 + rnd() * 0.14) + ')';
      x.lineWidth = 0.8 + rnd() * 1.2;
      x.beginPath(); x.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0); x.lineTo(m + Math.cos(a + 0.05) * r1, m + Math.sin(a + 0.05) * r1); x.stroke();
    }
    x.strokeStyle = 'rgba(15,8,4,0.55)'; x.lineWidth = 5; x.beginPath(); x.arc(m, m, R - 2.5, 0, Math.PI * 2); x.stroke();
    var gp = x.createRadialGradient(m, m, Rp * 0.8, m, m, Rp * 1.12);
    gp.addColorStop(0, '#060403'); gp.addColorStop(1, 'rgba(6,4,3,0)');
    x.fillStyle = gp; x.beginPath(); x.arc(m, m, Rp * 1.12, 0, Math.PI * 2); x.fill();
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // Mapa de normales de tejido: 'punto' (sudadera, camiseta) o 'sarga' (peto).
  function texturaTejido(tipo) {
    var N = 256, c = lienzo(N), x = c.getContext('2d'), h = new Float32Array(N * N), rnd = azar(tipo === 'punto' ? 3 : 7), i, j;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var v;
      if (tipo === 'punto') {
        var u = (i % 8) / 8, w = (j % 8) / 8;
        v = 0.5 + 0.5 * Math.cos((w + Math.abs(u - 0.5)) * 2 * Math.PI);   // uves de punto
        v *= 0.55 + 0.45 * Math.sin(u * Math.PI);
      } else {
        v = 0.5 + 0.5 * Math.sin(2 * Math.PI * (i + j * 2) / 7);           // diagonales de sarga
      }
      h[j * N + i] = v + (rnd() - 0.5) * 0.15;
    }
    var img = x.createImageData(N, N), d = img.data, k = 2.2;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var dx = h[j * N + (i + 1) % N] - h[j * N + (i + N - 1) % N], dy = h[((j + 1) % N) * N + i] - h[((j + N - 1) % N) * N + i];
      var nx = -dx * k, ny = dy * k, nz = 1, l = Math.sqrt(nx * nx + ny * ny + 1), o = (j * N + i) * 4;
      d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (ny / l * 0.5 + 0.5) * 255; d[o + 2] = (nz / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(tipo === 'punto' ? 14 : 10, tipo === 'punto' ? 14 : 10);
    return t;
  }

  // ---------------------------------------------------------------- motor compartido y luz de entorno
  var MOTOR = null;
  function motor() {
    if (MOTOR) { MOTOR.usos++; return MOTOR; }
    var r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    if (!r.getContext()) throw new Error('sin contexto');
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.06;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    MOTOR = { r: r, usos: 1, W: 0, H: 0, entornos: {}, pmrem: null, texturas: {} };
    return MOTOR;
  }
  function soltarMotor() {
    if (!MOTOR || --MOTOR.usos > 0) return;
    for (var k in MOTOR.entornos) if (MOTOR.entornos[k].textura) MOTOR.entornos[k].textura.dispose();
    for (k in MOTOR.texturas) MOTOR.texturas[k].dispose();
    if (MOTOR.pmrem) MOTOR.pmrem.dispose();
    MOTOR.r.dispose();
    if (MOTOR.r.forceContextLoss) MOTOR.r.forceContextLoss();
    MOTOR = null;
  }
  // texturas procedurales compartidas entre personajes (mismo contexto)
  function texturaCompartida(clave, crearla) {
    if (!MOTOR.texturas[clave]) MOTOR.texturas[clave] = crearla();
    return MOTOR.texturas[clave];
  }
  function pintarEn(M, escena, camara, w, h, ctx) {
    if (w > M.W || h > M.H) { M.W = Math.max(M.W, w); M.H = Math.max(M.H, h); M.r.setSize(M.W, M.H, false); }
    M.r.setViewport(0, 0, w, h);
    M.r.setScissor(0, 0, w, h);
    M.r.setScissorTest(true);
    M.r.clear();
    M.r.render(escena, camara);
    M.r.setScissorTest(false);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(M.r.domElement, 0, M.H - h, w, h, 0, 0, w, h);
  }

  function resolverEntorno(url) {
    var reg = window.Personajes3DEntornos || {};
    if (reg[url]) return reg[url];
    for (var k in reg) if (url.slice(-k.length) === k) return reg[k];
    return /^(data:|blob:|https?:|file:|\/)/.test(url) ? url : BASE_SCRIPT + url;
  }
  // Carga el cielo, lo gira para que el sol quede donde se pide, tiñe el suelo y genera el PMREM (una vez).
  function entorno(M, url, solGiro, suelo) {
    var clave = url + '|' + solGiro + '|' + suelo;
    if (M.entornos[clave]) return M.entornos[clave];
    var reg = { textura: null, sol: null, listo: null };
    M.entornos[clave] = reg;
    reg.listo = new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        try {
          var W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
          var x = c.getContext('2d');
          x.drawImage(img, 0, 0, W, H);
          // buscar el sol: centro de los píxeles más brillantes de la mitad superior
          var px = x.getImageData(0, 0, W, H / 2).data, max = 0, i, sx = 0, sy = 0, n = 0;
          for (i = 0; i < px.length; i += 16) { var l = px[i] + px[i + 1] + px[i + 2]; if (l > max) max = l; }
          for (i = 0; i < px.length; i += 4) {
            if (px[i] + px[i + 1] + px[i + 2] >= max - 6) { var q = i / 4; sx += q % W; sy += Math.floor(q / W); n++; }
          }
          var u = n ? sx / n / W : 0.5, vTop = n ? sy / n / H : 0.25;
          var elev = (0.5 - vTop) * Math.PI;                       // elevación del sol
          // three: u = atan2(z, x)/(2π) + 0.5 → queremos el sol en (sin g, ·, cos g)
          var g = solGiro * G, uObj = Math.atan2(Math.cos(g), Math.sin(g)) / (2 * Math.PI) + 0.5;
          var desp = Math.round(((uObj - u) % 1 + 1) % 1 * W);
          var c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
          var y = c2.getContext('2d');
          y.drawImage(c, desp, 0); y.drawImage(c, desp - W, 0);
          // suelo: la mitad inferior de un cielo «puro» es azulada; se tiñe con el color del suelo
          var gr = y.createLinearGradient(0, H / 2, 0, H);
          var cs = new THREE.Color(suelo), rgb = Math.round(cs.r * 255) + ',' + Math.round(cs.g * 255) + ',' + Math.round(cs.b * 255);
          gr.addColorStop(0, 'rgba(' + rgb + ',0.1)'); gr.addColorStop(0.12, 'rgba(' + rgb + ',0.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0.6)');
          y.fillStyle = gr; y.fillRect(0, H / 2, W, H / 2);
          var tex = new THREE.CanvasTexture(c2);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.mapping = THREE.EquirectangularReflectionMapping;
          if (!M.pmrem) M.pmrem = new THREE.PMREMGenerator(M.r);
          reg.textura = M.pmrem.fromEquirectangular(tex).texture;
          tex.dispose();
          reg.sol = new V3(Math.cos(elev) * Math.sin(g), Math.sin(Math.max(elev, 20 * G)), Math.cos(elev) * Math.cos(g)).normalize();
        } catch (e) {
          if (window.console) console.warn('Personajes3D: no se pudo preparar el cielo (¿imagen de otro origen desde file://?)', e);
        }
        ok(reg);
      };
      img.onerror = function () { if (window.console) console.warn('Personajes3D: no se encontró el cielo ' + url); ok(reg); };
      img.src = resolverEntorno(url);
    });
    return reg;
  }

  // ---------------------------------------------------------------- taller: materiales y mallas
  function Taller(sombras) { this.mats = {}; this.geos = []; this.mallas = 0; this.tris = 0; this.sombras = sombras; }
  Taller.prototype.mat = function (tipo, cfg) {
    if (this.mats[tipo]) return this.mats[tipo];
    var m, P = THREE.MeshPhysicalMaterial, S = THREE.MeshStandardMaterial;
    var piel = { vertexColors: true, roughness: 0.62, specularIntensity: 0.35, sheen: 0.35, sheenRoughness: 0.55, sheenColor: color(0xFFCDB8),
                 emissive: color(0x5A2416), emissiveIntensity: 0.55 };
    switch (tipo) {
      case 'piel': m = new P(piel); break;
      case 'parpado': m = new P(Object.assign({}, piel, { side: THREE.DoubleSide })); break;
      case 'tela': m = new P({ vertexColors: true, roughness: 0.88, sheen: 0.55, sheenRoughness: 0.8, sheenColor: color(0xFFFFFF),
                               normalMap: texturaCompartida('punto', function () { return texturaTejido('punto'); }), normalScale: new THREE.Vector2(0.45, 0.45) }); break;
      case 'sarga': m = new P({ vertexColors: true, roughness: 0.85, sheen: 0.45, sheenRoughness: 0.8, sheenColor: color(0xFFFFFF),
                                normalMap: texturaCompartida('sarga', function () { return texturaTejido('sarga'); }), normalScale: new THREE.Vector2(0.4, 0.4) }); break;
      case 'brillo': m = new S({ vertexColors: true, roughness: 0.38 }); break;
      case 'pelo': m = new P({ vertexColors: true, roughness: 0.42, sheen: 0.6, sheenRoughness: 0.35, sheenColor: color(0xFFDDBB), specularIntensity: 0.6 }); break;
      case 'cornea': m = new P({ color: 0x000000, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.38, specularIntensity: 1,
                                 transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); break;
      case 'boca': m = new S({ vertexColors: true, roughness: 0.55 }); break;
      case 'metal': m = new S({ vertexColors: true, roughness: 0.28, metalness: 0.8 }); break;
      case 'papel': m = new S({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }); break;
      case 'cristal': m = new P({ color: 0xEAF6FF, roughness: 0.04, transparent: true, opacity: 0.3, depthWrite: false, clearcoat: 1 }); break;
      case 'brillito': m = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }); break;
    }
    this.mats[tipo] = m;
    return m;
  };
  Taller.prototype.registrar = function (m, proyecta, recibe) {
    if (this.sombras) { m.castShadow = !!proyecta; m.receiveShadow = recibe !== false && !!proyecta; }
    this.geos.push(m.geometry);
    this.mallas++;
    var g = m.geometry;
    this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    return m;
  };
  Taller.prototype.malla = function (geo, tipo, padre, proyecta, recibe) {
    var m = new THREE.Mesh(geo, this.mat(tipo));
    padre.add(m);
    return this.registrar(m, proyecta, recibe);
  };
  Taller.prototype.liberar = function () {
    this.geos.forEach(function (g) { g.dispose(); });
    for (var k in this.mats) this.mats[k].dispose();
  };
  function grupo(padre, x, y, z) { var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (padre) padre.add(g); return g; }

  // ---------------------------------------------------------------- extremidad continua con esqueleto
  // perfil: [[d, radio, colorHex?], ...] con d = distancia hacia abajo desde la articulación superior
  // (negativa en el remate de arriba). Huesos: base (fija) → 1 (hombro/cadera) → 2 (codo/rodilla) → 3 (muñeca/tobillo).
  function extremidad(T, tipo, padre, pos, L1, L2, perfil, opt) {
    opt = opt || {};
    var pts = perfil.slice().reverse().map(function (p) { return new THREE.Vector2(Math.max(0, p[1]), -p[0]); });
    var g = new THREE.LatheGeometry(pts, opt.radial || 18);
    // color por tramo (puños, piel...) interpolando el perfil
    pintar(g, function (v, out) {
      var d = -v.y, c = perfil[0][2] || opt.color;
      for (var i = 0; i < perfil.length; i++) if (perfil[i][0] <= d + 1e-6 && perfil[i][2] != null) c = perfil[i][2];
      out.copy(color(c != null ? c : opt.color));
    });
    if (opt.forma) deformar(g, opt.forma); else { g.scale(1, 1, opt.sz || 0.92); suavizar(g); }
    // pesos
    var p = g.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    var b1 = opt.b1 || 0.026, b2 = opt.b2 || 0.012;
    for (var i = 0; i < n; i++) {
      var d = -p.getY(i);
      var wb = lim01(-d / 0.04) * 0.65;
      var a = suave((d - (L1 - b1)) / (2 * b1));
      var c3 = suave((d - (L1 + L2 - b2)) / (2 * b2)) * (opt.m3 == null ? 0.85 : opt.m3);
      var w3 = c3, w2 = a * (1 - c3), w1 = (1 - a) * (1 - c3);
      si.set([0, 1, 2, 3], i * 4);
      sw.set([wb, w1 * (1 - wb), w2 * (1 - wb), w3 * (1 - wb)], i * 4);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.translate(pos[0], pos[1], pos[2]);
    var base = new THREE.Bone(), h1 = new THREE.Bone(), h2 = new THREE.Bone(), h3 = new THREE.Bone();
    base.position.set(pos[0], pos[1], pos[2]);
    h2.position.y = -L1; h3.position.y = -L2;
    h1.rotation.order = 'ZXY'; h2.rotation.order = 'ZXY'; h3.rotation.order = 'YXZ';
    base.add(h1); h1.add(h2); h2.add(h3);
    var m = new THREE.SkinnedMesh(g, T.mat(tipo));
    m.add(base);
    m.bind(new THREE.Skeleton([base, h1, h2, h3]));
    m.frustumCulled = false;
    padre.add(m);
    T.registrar(m, true);
    return { malla: m, h1: h1, h2: h2, h3: h3 };
  }

  // ---------------------------------------------------------------- cabeza
  function formaCabeza(d, c) {
    var x = d.x, y = d.y, z = d.z;
    var bajo = suave((0.15 - y) / 1.05);
    x *= 1 - c.mand * bajo * bajo;
    z *= z > 0 ? 1 - 0.05 * bajo : 1 - 0.3 * bajo;
    if (z < 0) z *= 1 + 0.07 * (1 - bajo);
    var mej = Math.exp(-((y + 0.32) * (y + 0.32)) / 0.05) * Math.max(0, z);
    x *= 1 + 0.06 * mej;
    if (y < -0.5) y = -0.5 + (y + 0.5) * 0.8;
    return new V3(x * c.ancho * c.R, y * c.alto * c.R, z * c.fondo * c.R);
  }
  function buscadorCara(c) {
    var cache = [];
    for (var i = 0; i <= 50; i++) for (var j = 0; j <= 50; j++) {
      var az = (-75 + 150 * i / 50) * G, el = (-75 + 150 * j / 50) * G;
      cache.push({ az: az, el: el, p: formaCabeza(new V3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)), c) });
    }
    function punto(az, el) { return formaCabeza(new V3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)), c); }
    return function (x, y) {
      var mejor = null, dm = 1e9;
      cache.forEach(function (o) { var d = (o.p.x - x) * (o.p.x - x) + (o.p.y - y) * (o.p.y - y); if (d < dm) { dm = d; mejor = o; } });
      var az = mejor.az, el = mejor.el, paso = 3 * G;
      for (var it = 0; it < 30; it++) {
        var cand = [[az, el], [az + paso, el], [az - paso, el], [az, el + paso], [az, el - paso]], best = cand[0], bd = 1e9;
        cand.forEach(function (ca) { var p = punto(ca[0], ca[1]); var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = ca; } });
        if (best === cand[0]) paso *= 0.5; az = best[0]; el = best[1];
      }
      var p0 = punto(az, el), pa = punto(az + 0.01, el), pe = punto(az, el + 0.01);
      var n = new V3().crossVectors(pa.sub(p0), pe.sub(p0)).normalize();
      if (n.z < 0) n.negate();
      return { pos: p0, n: n };
    };
  }

  function construirCabeza(T, r, cfg) {
    var c = cfg.cab, col = cfg.color, piel = color(col.piel), rubor = color(col.rubor);
    var zonas = [[new V3(0.5, -0.3, 0.81).normalize(), 0.035, 0.45], [new V3(-0.5, -0.3, 0.81).normalize(), 0.035, 0.45],
                 [new V3(0, -0.38, 0.92).normalize(), 0.012, 0.3], [new V3(0, 0.55, 0.83).normalize(), 0.05, -0.06]];
    var gc = esfera(48, 36), linea = curvaPelo(cfg.pelo.linea), cpelo = color(cfg.pelo.color);
    pintar(gc, function (v, out) {
      out.copy(piel);
      zonas.forEach(function (z) { out.lerp(z[2] > 0 ? rubor : color(0xFFE6D0), Math.abs(z[2]) * Math.exp(-v.distanceToSquared(z[0]) / z[1])); });
      // línea del pelo natural: la piel se oscurece un poco justo debajo del pelo (raíces)
      var az = Math.atan2(v.x, v.z) / G, el = Math.asin(Math.max(-1, Math.min(1, v.y))) / G, h = linea(az);
      out.lerp(cpelo, 0.32 * suave((el - (h - 7)) / 7));
    });
    deformar(gc, function (v) { v.copy(formaCabeza(v.clone().normalize(), c)); });
    var cara = buscadorCara(c);
    r.buscar = cara;
    var nariz = cara(0, cfg.nariz.y), puente = cara(0, cfg.nariz.y + 0.017);
    var partes = [[gc]];
    partes.push([esfera(18, 14), matriz(nariz.pos.clone().addScaledVector(nariz.n, 0.004).toArray(), [-12, 0, 0], cfg.nariz.esc), col.nariz]);
    partes.push([esfera(12, 10), matriz(puente.pos.clone().addScaledVector(puente.n, -0.0035).toArray(), [-25, 0, 0], [0.0055, 0.012, 0.005]), col.piel]);
    [1, -1].forEach(function (s) {
      var ox = s * (c.R * c.ancho * 0.94), oy = cfg.oreja.y;
      partes.push([esfera(18, 14), matriz([ox, oy, -0.01], [0, s * 62, s * -8], [0.0155, 0.025, 0.008]), col.oreja]);
      partes.push([esfera(12, 10), matriz([ox + s * 0.004, oy - 0.001, -0.0055], [0, s * 62, s * -8], [0.0095, 0.017, 0.004]), col.rubor2]);
    });
    var g = fusionar(partes);
    // mandíbula: los vértices por debajo de la boca siguen al hueso «mandíbula» (el mentón baja al hablar)
    var p = g.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    var corte = cfg.boca.y - 0.004;
    for (var i = 0; i < n; i++) {
      var y = p.getY(i), z = p.getZ(i), x = p.getX(i);
      var w = suave((corte - y) / 0.022) * suave((z + 0.03) / 0.05) * (1 - suave((Math.abs(x) - 0.07) / 0.03));
      si.set([0, 1, 0, 0], i * 4); sw.set([1 - w, w, 0, 0], i * 4);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    var craneo = new THREE.Bone(), mand = new THREE.Bone();
    mand.position.set(0, -0.012, -0.03);
    craneo.add(mand);
    var mh = new THREE.SkinnedMesh(g, T.mat('piel'));
    mh.add(craneo);
    mh.bind(new THREE.Skeleton([craneo, mand]));
    r.cara.add(mh);
    T.registrar(mh, true);
    r.mandibula = mand;
    construirOjos(T, r, cfg, cara);
    construirCejas(T, r, cfg, cara);
    r.boca = new Boca(T, r.cara, cfg, cara);
  }

  // ---------------------------------------------------------------- ojos
  function construirOjos(T, r, cfg, cara) {
    var o = cfg.ojo;
    var mapa = texturaCompartida('iris-' + cfg.quien, function () { return texturaIris(o.iris, o.irisClaro, cfg.quien === 'nico' ? 21 : 33); });
    r.ojos = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var sup = cara(s * o.x, o.y);
      var base = grupo(r.cara);
      base.position.copy(sup.pos).addScaledVector(sup.n, -o.r * 0.5);
      base.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(s * 0.12, 0.02, 1).normalize());
      var globo = grupo(base);
      // globo ocular con el polo hacia delante y UV plana: el iris es una textura de degradado radial
      var ge = new THREE.SphereGeometry(1, 28, 22); ge.rotateX(Math.PI / 2);
      var uv = ge.attributes.uv, pp = ge.attributes.position;
      for (var i = 0; i < pp.count; i++) {
        var x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        if (z < 0) { var l = Math.sqrt(x * x + y * y) || 1; x = x / l; y = y / l; }
        uv.setXY(i, 0.5 + x * 0.5, 0.5 + y * 0.5);
      }
      ge.scale(o.r, o.r, o.r);
      if (!T.mats.ojo) T.mats.ojo = new THREE.MeshStandardMaterial({ map: mapa, roughness: 0.4 });
      var mo = new THREE.Mesh(ge, T.mats.ojo);
      globo.add(mo); T.registrar(mo, false);
      // córnea: casquete transparente con barniz (clearcoat) que refleja el cielo y el sol
      var gco = new THREE.SphereGeometry(o.r * 1.025, 22, 10, 0, Math.PI * 2, 0, 1.05); gco.rotateX(Math.PI / 2);
      deformar(gco, function (v) { var k = Math.max(0, v.z / (o.r * 1.025)); v.z += o.r * 0.06 * Math.pow(k, 6); });
      var cornea = T.malla(gco, 'cornea', globo, false);
      // brillo fijo pequeño (arriba a la izquierda) para que la mirada siempre tenga vida
      var gb = esfera(8, 6); gb.scale(o.r * 0.12, o.r * 0.12, o.r * 0.05);
      var br = T.malla(pintar(gb, 0xffffff), 'brillito', base, false);
      br.position.set(-o.r * 0.3, o.r * 0.32, o.r * 1.05);
      // párpado superior + pestañas (tiras finas) + línea del párpado
      var sup1 = new THREE.SphereGeometry(o.r * 1.018, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      pintar(sup1, cfg.color.parpado);
      var lin = toro(o.r * 1.025, o.r * 0.06, 6, 22, Math.PI); lin.rotateX(Math.PI / 2);
      var pest = pestanas(o.r, s, cfg.pestanaLargo);
      var parpS = grupo(base);
      T.malla(fusionar([[sup1], [lin, null, cfg.color.pestana], [pest, null, cfg.color.pestana]]), 'parpado', parpS, false, true);
      var inf = new THREE.SphereGeometry(o.r * 1.012, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      var parpI = grupo(base);
      T.malla(pintar(inf, cfg.color.parpado), 'parpado', parpI, false, true);
      r.ojos[lado] = { globo: globo, sup: parpS, inf: parpI, brillo: br, cornea: cornea };
    });
  }
  // Tira de pestañas sobre el borde del párpado (plano XZ del párpado); más largas hacia fuera.
  function pestanas(r, s, largo) {
    var N = 16, pos = [], idx = [];
    for (var i = 0; i <= N; i++) {
      var a = (-85 + 170 * i / N) * G, fuera = lim01((s * Math.sin(a) + 0.2) / 1.2);
      var R = r * 1.03, bx = Math.sin(a) * R, bz = Math.cos(a) * R;
      var L = r * largo * (0.45 + 0.75 * fuera) * Math.sin((i / N) * Math.PI * 0.9 + 0.15);
      pos.push(bx, 0, bz, bx * (1 + 0.5 * L / R) + s * L * 0.15 * fuera, L * 0.7, bz * (1 + 0.6 * L / R));
      if (i < N) { var k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function construirCejas(T, r, cfg, cara) {
    r.cejas = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var sup = cara(s * cfg.ceja.x, cfg.ceja.y);
      var base = grupo(r.cara);
      base.position.copy(sup.pos).addScaledVector(sup.n, 0.001);
      base.quaternion.setFromUnitVectors(new V3(0, 0, 1), sup.n);
      var arco = 1.05, R = 0.03;
      var g = new THREE.TorusGeometry(R, cfg.ceja.grosor, 7, 16, arco);
      g.rotateZ(Math.PI / 2 - arco / 2); g.translate(0, -R, 0); g.scale(1, 1, 0.55);
      deformar(g, function (v) { var k = 1 + 0.4 * (-s * v.x / 0.016); v.y *= Math.max(0.6, 0.9 + 0.1 * k); v.z *= Math.max(0.5, k); });
      var ce = grupo(base);
      var m = T.malla(pintar(g, cfg.color.ceja), 'pelo', ce, false);
      m.rotation.z = s * -4 * G;
      r.cejas[lado] = ce;
    });
  }

  // ---------------------------------------------------------------- boca paramétrica
  function Boca(T, padre, cfg, cara) {
    var sup = cara(0, cfg.boca.y);
    this.base = grupo(padre);
    this.base.position.copy(sup.pos).addScaledVector(sup.n, 0.0015);
    this.base.quaternion.setFromUnitVectors(new V3(0, 0, 1), sup.n);
    this.cfg = cfg.boca;
    this.N = 15; this.M = 7; this.L = 2 * (this.N - 1); this.K = 13;
    var L = this.L, M = this.M, K = this.K, i, j;
    var gl = new THREE.BufferGeometry(), idx = [];
    gl.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L * M * 3), 3));
    gl.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(L * M * 3), 3));
    for (i = 0; i < L; i++) for (j = 0; j < M; j++) {
      var a = i * M + j, b = ((i + 1) % L) * M + j, c2 = ((i + 1) % L) * M + (j + 1) % M, d = i * M + (j + 1) % M;
      idx.push(a, b, d, b, c2, d);
    }
    gl.setIndex(idx);
    pintar(gl, cfg.color.labios);
    this.labios = T.malla(gl, 'piel', this.base, false);
    var gi = new THREE.BufferGeometry(); idx = [];
    gi.setAttribute('position', new THREE.BufferAttribute(new Float32Array(K * 6 * 3), 3));
    var nor = new Float32Array(K * 6 * 3); for (i = 0; i < K * 6; i++) nor[i * 3 + 2] = 1;
    gi.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    var cols = new Float32Array(K * 6 * 3), cd = color(0xF2EEE6), co = color(0x3E1418), cl = color(0xC45C66);
    for (i = 0; i < K; i++) {
      [cd, cd, co, co, cl, cl].forEach(function (cc, q) { cols.set([cc.r, cc.g, cc.b], (i * 6 + q) * 3); });
      if (i < K - 1) [0, 2, 4].forEach(function (q) {
        var a = i * 6 + q, b = a + 1, c3 = (i + 1) * 6 + q, d = c3 + 1;
        idx.push(a, b, c3, b, d, c3);
      });
    }
    gi.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    gi.setIndex(idx);
    this.interior = T.malla(gi, 'boca', this.base, false);
    this.clave = '';
    this.actualizar({ abre: 0, sonr: 0.5, O: 0, lado: 0, torc: 0 });
  }
  Boca.prototype.curvas = function (u, p) {
    var c = this.cfg, w = c.ancho * (1 - 0.42 * p.O) * (1 + 0.14 * Math.max(0, p.sonr - 0.5));
    var x = u * w + p.lado, q = Math.sqrt(Math.max(0, 1 - u * u));
    var ys = p.sonr * c.curva * u * u - p.sonr * c.curva * 0.25 + p.torc * 0.005 * u;
    var h = p.abre * c.alto * (1 - 0.3 * p.O) + p.O * c.alto * 0.45;
    return { x: x, yU: ys + h * (0.22 + 0.3 * p.O) * q, yL: ys - h * (0.78 - 0.1 * p.O) * q, z: -(x * x) / (2 * c.curvatura) };
  };
  Boca.prototype.actualizar = function (p) {
    var clave = [p.abre, p.sonr, p.O, p.lado, p.torc].map(function (v) { return Math.round(v * 400); }).join(',');
    if (clave === this.clave) return;
    this.clave = clave;
    var N = this.N, M = this.M, L = this.L, K = this.K, c = this.cfg, i, j;
    var lazo = [];
    for (i = 0; i < N; i++) { var u = -1 + 2 * i / (N - 1), k = this.curvas(u, p), q = Math.sqrt(1 - u * u);
      lazo.push({ x: k.x, y: k.yU, z: k.z, r: c.labioSup * (0.38 + 0.62 * Math.pow(q, 0.7)) }); }
    for (i = N - 2; i >= 1; i--) { var u2 = -1 + 2 * i / (N - 1), k2 = this.curvas(u2, p), q2 = Math.sqrt(1 - u2 * u2);
      lazo.push({ x: k2.x, y: k2.yL, z: k2.z, r: c.labioInf * (0.35 + 0.65 * Math.pow(q2, 0.7)) }); }
    var pos = this.labios.geometry.attributes.position;
    for (i = 0; i < L; i++) {
      var a = lazo[(i - 1 + L) % L], b = lazo[(i + 1) % L], o = lazo[i];
      var tx = b.x - a.x, ty = b.y - a.y, tl = Math.sqrt(tx * tx + ty * ty) || 1;
      var nx = -ty / tl, ny = tx / tl;
      for (j = 0; j < M; j++) {
        var be = 2 * Math.PI * j / M, cb = Math.cos(be), sb = Math.sin(be);
        pos.setXYZ(i * M + j, o.x + o.r * cb * nx, o.y + o.r * cb * ny, o.z + 0.0022 + o.r * sb * 1.1);
      }
    }
    pos.needsUpdate = true;
    this.labios.geometry.computeVertexNormals();
    this.labios.geometry.computeBoundingSphere();
    var pi = this.interior.geometry.attributes.position, hueco = p.abre > 0.02 || p.O > 0.05;
    this.interior.visible = hueco;
    if (hueco) {
      for (i = 0; i < K; i++) {
        var uu = -1 + 2 * i / (K - 1), kk = this.curvas(uu * 0.97, p), gap = kk.yU - kk.yL;
        var dientes = p.abre > 0.18 ? gap * 0.26 : 0, lengua = gap * 0.32, z = kk.z + 0.0016;
        var ys = [kk.yU, kk.yU - dientes, kk.yU - dientes, kk.yL + lengua, kk.yL + lengua, kk.yL];
        for (j = 0; j < 6; j++) pi.setXYZ(i * 6 + j, kk.x, ys[j], z);
      }
      pi.needsUpdate = true;
      this.interior.geometry.computeBoundingSphere();
    }
  };

  // ---------------------------------------------------------------- pelo
  function dirAzEl(az, el) { return new V3(Math.cos(el * G) * Math.sin(az * G), Math.sin(el * G), Math.cos(el * G) * Math.cos(az * G)); }
  function curvaPelo(claves) {
    return function (az) {
      az = Math.abs(((az + 540) % 360) - 180);
      for (var i = 0; i < claves.length - 1; i++) {
        if (az <= claves[i + 1][0]) return lerp(claves[i][1], claves[i + 1][1], suave((az - claves[i][0]) / (claves[i + 1][0] - claves[i][0])));
      }
      return claves[claves.length - 1][1];
    };
  }
  function puntoPelo(cfg, az, el, extra) {
    var base = formaCabeza(dirAzEl(az, el), cfg.cab), n = base.clone().normalize();
    var gro = cfg.pelo.grosor + cfg.pelo.volumen * Math.max(0, Math.sin(el * G)) + (extra || 0);
    return { p: base.addScaledVector(n, gro), n: n };
  }
  function tonoPelo(cfg, rnd) {
    var p = cfg.pelo, a = color(p.color), b = color(rnd() < 0.5 ? p.claro : p.oscuro);
    return a.lerp(b, 0.3 + 0.7 * rnd()).getHex(THREE.LinearSRGBColorSpace) & 0xffffff;
  }
  function mechonSup(cfg, m, rnd) {
    var pts = [], n = 7, ruta = m.medio ? [m.de, m.medio, m.a] : [m.de, m.a];
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1), az, el;
      if (ruta.length === 3) {
        var u = t * 2, a = u < 1 ? ruta[0] : ruta[1], b = u < 1 ? ruta[1] : ruta[2], w = u < 1 ? u : u - 1;
        az = lerp(a[0], b[0], w); el = lerp(a[1], b[1], w);
      } else { az = lerp(ruta[0][0], ruta[1][0], t); el = lerp(ruta[0][1], ruta[1][1], t); }
      var alza = lerp(m.alza ? m.alza[0] : 0, m.alza ? m.alza[1] : 0, t * t);
      pts.push(puntoPelo(cfg, az, el, m.r * 0.15 + alza).p);
    }
    var g = tuboVariable(pts, perfilMechon(m.r * 0.6, m.r, 0.25), 12, 6);
    // color: un tono por mechón, la punta algo más clara
    var c0 = color(0), c1 = new THREE.Color();
    if (m.color != null) c0.set(m.color); else c0.setHex(tonoPelo(cfg, rnd), THREE.LinearSRGBColorSpace);
    c1.copy(c0).lerp(color(cfg.pelo.claro), 0.25);
    var uv = g.attributes.uv;
    pintar(g, function (v, out, i) { out.copy(c0).lerp(c1, uv.getX(i)); });
    return [g];
  }
  function construirPelo(T, r, cfg) {
    var p = cfg.pelo, linea = curvaPelo(p.linea), c = cfg.cab, rnd = azar(cfg.quien === 'nico' ? 17 : 29);
    var cas = new THREE.SphereGeometry(1, 48, 34);
    var pos = cas.attributes.position, v = new V3(), cols = new Float32Array(pos.count * 3), cb = color(p.color), cl = color(p.claro), tmp = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var az = Math.atan2(v.x, v.z) / G, el = Math.asin(Math.max(-1, Math.min(1, v.y))) / G, h = linea(az), gro;
      // línea del pelo: borde irregular suave (pequeñas ondas) y metido bajo la piel
      h += 1.6 * Math.sin(az * 0.35 * G * 12) + 0.8 * Math.sin(az * G * 23);
      if (el < h) { el = h; gro = -0.004; }
      else gro = lerp(-0.004, p.grosor + p.volumen * Math.max(0, Math.sin(el * G)), suave((el - h) / 9));
      var base = formaCabeza(dirAzEl(az, el), c), n = base.clone().normalize();
      base.addScaledVector(n, gro);
      pos.setXYZ(i, base.x, base.y, base.z);
      tmp.copy(cb).lerp(cl, 0.3 * Math.max(0, Math.sin(el * G)));
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    cas.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    suavizar(cas);
    var partes = [[cas]];
    p.mechones.forEach(function (m) { partes.push(mechonSup(cfg, m, rnd)); });
    T.malla(fusionar(partes), 'pelo', r.cara, true);
  }

  // ---------------------------------------------------------------- brazos y manos
  function construirBrazos(T, r, cfg) {
    var b = cfg.brazo, col = cfg.color;
    r.brazos = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var L1 = b.L1, L2 = b.L2, perfil;
      if (b.mangaLarga) {
        // manga de sudadera: hombro, brazo, pliegues en el codo, antebrazo y puño de canalé
        perfil = [[-0.034, 0], [-0.03, 0.017], [-0.022, 0.028], [-0.01, 0.0345], [0.01, 0.036], [0.04, 0.035], [0.08, 0.033], [0.11, 0.031],
                  [0.125, 0.031], [0.13, 0.0325], [0.135, 0.0305], [0.14, 0.0322], [0.145, 0.0303], [0.15, 0.0315], [0.16, 0.03], [0.18, 0.0302],
                  [0.205, 0.029], [0.23, 0.027], [0.245, 0.0262, col.sudaderaOsc], [0.25, 0.0285, col.sudaderaOsc], [0.258, 0.029, col.sudaderaOsc],
                  [0.266, 0.028, col.sudaderaOsc], [0.27, 0.018, col.sudaderaOsc], [0.273, 0, col.sudaderaOsc]];
        perfil[0][2] = col.sudadera;
      } else {
        perfil = [[-0.03, 0], [-0.026, 0.015], [-0.018, 0.025], [-0.005, 0.03], [0.02, 0.0315], [0.06, 0.03], [0.1, 0.027], [0.125, 0.025],
                  [0.138, 0.0245], [0.15, 0.0255], [0.17, 0.0265], [0.2, 0.025], [0.23, 0.022], [0.252, 0.0195], [0.262, 0.017], [0.27, 0.01], [0.272, 0]];
        perfil[0][2] = col.piel;
      }
      var ex = extremidad(T, b.mangaLarga ? 'tela' : 'piel', r.cuerpo, [s * b.hombroX, b.hombroY, 0], L1, L2, perfil,
        { color: b.mangaLarga ? col.sudadera : col.piel, sz: 0.9, b1: 0.03, b2: 0.014, radial: 18 });
      var hombro = ex.h1, codo = ex.h2, mun = ex.h3;
      if (!b.mangaLarga) {
        // manga corta abullonada (tapa la unión del hombro)
        var gm = torno([[0.033, -0.054], [0.0375, -0.05], [0.041, -0.04], [0.0425, -0.025], [0.042, -0.01], [0.039, 0.005], [0.034, 0.017], [0.026, 0.027], [0.015, 0.033], [0, 0.035]], 26, 0.95);
        T.malla(fusionar([[gm, null, col.camiseta], [toro(0.036, 0.0045, 6, 22), matriz([0, -0.051, 0], [90, 0, 0]), col.camisetaOsc]]), 'tela', hombro, true);
      }
      // mano: palma redondeada + índice + tres dedos + pulgar (dedos con puntas redondas)
      var gp = esfera(20, 16);
      deformar(gp, function (v) {
        var y = v.y; v.x *= 0.0225 * (1 + 0.15 * (-y)); v.y *= 0.028; v.z *= 0.0115 * (1 - 0.25 * Math.max(0, y)); v.y -= 0.027;
      });
      T.malla(pintar(gp, col.piel), 'piel', mun, true);
      var nud = -0.049;
      var ind = grupo(mun, s * 0.0135, nud, 0);
      var dedo = function (r0, l) { var g = capsula(r0, l, 10); deformar(g, function (v) { var t = lim01(-v.y / l + 0.5); v.x *= 1 - 0.12 * t; v.z *= 0.92 - 0.1 * t; }); g.translate(0, -l / 2 - r0 * 0.6, 0); return g; };
      T.malla(pintar(dedo(0.0062, 0.021), col.piel), 'piel', ind, true);
      var tres = grupo(mun, 0, nud, 0);
      T.malla(fusionar([
        [dedo(0.0062, 0.024), matriz([s * 0.0035, 0, 0]), col.piel],
        [dedo(0.0058, 0.021), matriz([-s * 0.0062, 0.001, 0]), col.piel],
        [dedo(0.0052, 0.016), matriz([-s * 0.015, 0.003, 0]), col.piel]
      ]), 'piel', tres, true);
      var pul = grupo(mun, s * 0.019, -0.014, 0.004);
      T.malla(pintar(dedo(0.007, 0.017), col.piel), 'piel', pul, true);
      var qRelax = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), new V3(s * 0.55, -0.75, 0.38).normalize());
      var qRecog = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), new V3(-s * 0.55, -0.45, 0.7).normalize());
      r.brazos[lado] = { s: s, hombro: hombro, codo: codo, mano: mun, indice: ind, tres: tres, pulgar: pul, qRelax: qRelax, qRecog: qRecog };
    });
  }

  // ---------------------------------------------------------------- piernas y calzado
  function construirPiernas(T, r, cfg, calzado) {
    var p = cfg.pierna, col = cfg.color;
    r.piernas = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1, k = p.k;
      // pierna continua: muslo ancho, rodilla suave, gemelo y tobillo fino
      var perfil = [[-0.03, 0], [-0.024, 0.03 * k], [-0.01, 0.044 * k], [0.03, 0.047 * k], [0.08, 0.044 * k], [0.13, 0.04 * k], [0.17, 0.036 * k],
                    [0.2, 0.0345 * k], [0.225, 0.036 * k], [0.25, 0.0395 * k], [0.275, 0.04 * k], [0.31, 0.0365 * k], [0.35, 0.03 * k],
                    [0.38, 0.026 * k], [0.4, 0.025 * k], [0.415, 0.02], [0.42, 0]];
      var ex = extremidad(T, 'piel', r.cuerpo, [s * p.caderaX, p.caderaY, 0], p.L1, p.L2, perfil, {
        color: col.piel, b1: 0.035, b2: 0.016, m3: 0.6, radial: 18,
        forma: function (v) { v.z *= 0.95; if (v.z < 0 && v.y < -0.24 && v.y > -0.36) v.z *= 1.08; }
      });
      var cadera = ex.h1, rodilla = ex.h2, tobillo = ex.h3;
      // pernera del pantalón corto (tapa la unión de la cadera), con dobladillo
      var gpn = torno([[p.rPernera * 1.07, -p.largoPernera], [p.rPernera * 1.06, -p.largoPernera + 0.01], [p.rPernera, -0.04], [p.rPernera * 0.97, 0.01], [0, 0.012]], 24, 0.96);
      T.malla(fusionar([[gpn, null, col.pantalon], [toro(p.rPernera * 1.07, 0.0045, 6, 24), matriz([0, -p.largoPernera + 0.004, 0], [90, 0, 0], [1, 0.96, 1]), col.pantalonOsc]]),
        p.tela || 'tela', cadera, true);
      T.malla(calzado(s), 'brillo', tobillo, true);
      r.piernas[lado] = { cadera: cadera, rodilla: rodilla, tobillo: tobillo };
    });
  }
  function zapatilla(col) {
    return function () {
      var g = esfera(26, 18);
      deformar(g, function (v) {
        var del = Math.max(0, v.z);
        v.x *= 0.035 * (1 + 0.1 * del); v.y *= 0.029 * (1 - 0.35 * del); v.z *= 0.069;
        if (v.y < -0.012) v.y = -0.012 + (v.y + 0.012) * 0.3;
        v.y += -0.026; v.z += 0.022;
      });
      pintar(g, function (v, out) { out.copy(color(v.y < -0.033 ? col.suela : (Math.abs(v.y + 0.026) < 0.004 && v.x > 0.02 ? col.franja : col.zapatilla))); });
      var suela = esfera(22, 10);
      deformar(suela, function (v) { v.x *= 0.038; v.y *= 0.008; v.z *= 0.073; v.y -= 0.045; v.z += 0.022; });
      var cal = cilindro(0.029, 0.03, 0.034, 18, true);
      var borde = toro(0.029, 0.0045, 6, 18);
      var cordones = [];
      for (var i = 0; i < 3; i++) cordones.push([new THREE.BoxGeometry(0.022, 0.003, 0.004), matriz([0, -0.006 - i * 0.004, 0.034 + i * 0.011], [-35, 0, 0]), col.franja]);
      return fusionar([[g], [suela, null, col.suela],
        [cal, matriz([0, 0.01, 0]), col.calcetin], [borde, matriz([0, 0.026, 0], [90, 0, 0]), col.calcetin],
        [toro(0.03, 0.0035, 6, 18, Math.PI), matriz([0, -0.008, 0.02], [90, 0, 0], [0.9, 1, 1]), col.franja]].concat(cordones));
    };
  }
  function bota(col) {
    return function () {
      var cana = torno([[0.034, -0.02], [0.035, 0.03], [0.037, 0.06], [0.039, 0.075], [0, 0.076]], 22, 1);
      var pie = esfera(26, 18);
      deformar(pie, function (v) {
        var del = Math.max(0, v.z);
        v.x *= 0.036 * (1 + 0.08 * del); v.y *= 0.029 * (1 - 0.3 * del); v.z *= 0.067;
        if (v.y < -0.01) v.y = -0.01 + (v.y + 0.01) * 0.3;
        v.y += -0.026; v.z += 0.02;
      });
      var suela = esfera(22, 10);
      deformar(suela, function (v) { v.x *= 0.039; v.y *= 0.009; v.z *= 0.071; v.y -= 0.045; v.z += 0.02; });
      return fusionar([[cana, null, col.bota], [pie, null, col.bota], [suela, null, col.botaSuela],
        [toro(0.039, 0.005, 6, 22), matriz([0, 0.072, 0], [90, 0, 0]), col.botaSuela],
        [toro(0.0355, 0.0022, 4, 22), matriz([0, 0.03, 0], [90, 0, 0]), col.botaSuela]]);
    };
  }

  // ---------------------------------------------------------------- NICO
  var NICO = {
    quien: 'nico', giroBase: 14, manoSaludo: 'r', pestanaLargo: 0.32,
    cuelloY: 0.754, craneoY: 0.85,
    cab: { R: 0.105, ancho: 0.93, alto: 1.0, fondo: 1.0, mand: 0.22 },
    ojo: { x: 0.036, y: -0.013, r: 0.0192, iris: 0x6B4426, irisClaro: 0xB78445 },
    ceja: { x: 0.039, y: 0.023, grosor: 0.0048 },
    nariz: { y: -0.041, esc: [0.0092, 0.008, 0.0085] },
    oreja: { y: -0.012 },
    boca: { y: -0.066, ancho: 0.024, alto: 0.027, curva: 0.009, curvatura: 0.055, labioSup: 0.003, labioInf: 0.0041 },
    brazo: { hombroX: 0.1, hombroY: 0.702, L1: 0.14, L2: 0.125, mangaLarga: true },
    pierna: { caderaX: 0.051, caderaY: 0.455, L1: 0.2, L2: 0.2, rPernera: 0.058, largoPernera: 0.12, k: 1.0 },
    mapaW: 0.12,
    color: {
      piel: 0xE3AE86, rubor: 0xEC8A7A, rubor2: 0xD98C74, nariz: 0xE6A283, oreja: 0xE8A88A, parpado: 0xD9A07C, pestana: 0x2A1A12,
      labios: 0xB86A5C, ceja: 0x4A2A18,
      sudadera: 0x3FA55B, sudaderaOsc: 0x2F8A49, pantalon: 0x2C6A45, pantalonOsc: 0x235A3A,
      mochila: 0xFF8A3D, mochilaOsc: 0xE0702A, zapatilla: 0xFFF6E8, suela: 0xD9D2C6, franja: 0xFF8A3D, calcetin: 0xFFFFFF,
      oro: 0xE2B23C, esfera: 0xFFF6E8, aguja: 0xE23B3B, mapa: 0xF2DCA6, hoja: 0xF8EBC6, cinta: 0xE23B3B, cordon: 0x5A3A22
    },
    pelo: {
      color: 0x5A3420, claro: 0x7C4C2D, oscuro: 0x3F2414, grosor: 0.008, volumen: 0.008, lineaFina: 40, pasoFino: 8,
      linea: [[0, 42], [35, 36], [58, 14], [68, 2], [76, 18], [100, 16], [130, -10], [180, -40]],
      mechones: (function () {
        var m = [], rnd = azar(11);
        // pelo corto despeinado: muchos mechones desde la coronilla, puntas algo levantadas
        for (var i = 0; i < 26; i++) {
          var az = -175 + i * (350 / 25) + (rnd() - 0.5) * 8, a = Math.abs(az);
          var fin = a < 50 ? 46 : a < 110 ? 24 + rnd() * 6 : a < 150 ? 6 : -14;
          m.push({ de: [az * 0.3, 84 - rnd() * 4], medio: [az * 0.8, (84 + fin) / 2 + 6], a: [az + (rnd() - 0.5) * 22, fin],
                   r: 0.011 + rnd() * 0.005, alza: [0, 0.004 + rnd() * 0.011] });
        }
        m.push({ de: [-20, 70], a: [-34, 45], r: 0.013, alza: [0, 0.012] });
        m.push({ de: [24, 72], a: [36, 46], r: 0.012, alza: [0, 0.011] });
        m.push({ de: [-5, 76], a: [-14, 47], r: 0.011, alza: [0, 0.01] });
        return m;
      })()
    }
  };

  function construirNico(T, r) {
    var c = NICO, col = c.color;
    construirCabeza(T, r, c);
    construirPelo(T, r, c);
    // tupé: mechones gruesos que suben hacia arriba y adelante (con rebote)
    var pie = puntoPelo(c, 0, 44).p;
    r.tupe = grupo(r.cara, pie.x, pie.y, pie.z);
    var rnd = azar(5);
    function rizo(dx, esc, rMax, inclina) {
      var pts = [[dx * 0.3, -0.014, -0.024], [dx * 0.6, 0.006, -0.006], [dx, 0.03, 0.004], [dx * 1.15, 0.048, 0.02], [dx * 1.1, 0.054, 0.036 + inclina]]
        .map(function (p) { return new V3(p[0], p[1] * esc, p[2] * esc); });
      var g = tuboVariable(pts, perfilMechon(0.012, rMax, 0.3), 14, 8);
      var c0 = new THREE.Color().setHex(tonoPelo(c, rnd), THREE.LinearSRGBColorSpace);
      return [pintar(g, function (v, out) { out.copy(c0); })];
    }
    T.malla(fusionar([rizo(0, 1, 0.024, 0), rizo(-0.019, 0.82, 0.018, -0.004), rizo(0.018, 0.78, 0.017, -0.006),
      rizo(-0.008, 0.9, 0.014, 0.004), rizo(0.009, 0.88, 0.013, 0.006)]), 'pelo', r.tupe, true);

    T.malla(pintar(cilindro(0.04, 0.043, 0.09, 16), c.color.piel), 'piel', r.cuerpo, true, false).position.y = 0.75;
    // sudadera: cuerpo con pliegues sobre la cintura, canalé, bolsillo canguro, capucha, cordón
    var tor = torno([[0, 0.488], [0.087, 0.488], [0.097, 0.5], [0.1, 0.53], [0.098, 0.57], [0.099, 0.61], [0.104, 0.65], [0.106, 0.68], [0.1, 0.703], [0.082, 0.722], [0.052, 0.736], [0.034, 0.74], [0, 0.74]], 32, 0.67);
    deformar(tor, function (v) {
      var a = Math.atan2(v.x, v.z), pl = Math.exp(-Math.pow((v.y - 0.52) / 0.018, 2));
      var k = 1 + 0.035 * pl * (0.5 + 0.5 * Math.sin(a * 9 + 1.3));
      v.x *= k; v.z *= k;
    });
    pintar(tor, col.sudadera);
    r.torso = T.malla(fusionar([
      [tor],
      [toro(0.098, 0.009, 8, 36), matriz([0, 0.497, 0], [90, 0, 0], [1, 0.68, 1]), col.sudaderaOsc],
      [toro(0.036, 0.0075, 8, 24), matriz([0, 0.737, 0.004], [96, 0, 0], [1, 0.85, 1]), col.sudaderaOsc],
      [esfera(20, 12), matriz([0, 0.565, 0.058], [-6, 0, 0], [0.062, 0.036, 0.014]), col.sudaderaOsc],
      [toro(0.062, 0.0022, 4, 28, Math.PI), matriz([0, 0.562, 0.068], [0, 0, 0], [1, 0.58, 1]), col.sudadera],
      [esfera(20, 12), matriz([0, 0.735, -0.05], [20, 0, 0], [0.068, 0.028, 0.036]), col.sudadera],
      [toro(0.039, 0.0018, 4, 24), matriz([0, 0.742, 0.008], [100, 0, 0], [1, 0.95, 1]), col.cordon],
      [tubo([[0, 0.742, 0.042], [0, 0.71, 0.066], [0, 0.676, 0.072]], 0.0017, 6), null, col.cordon],
      [torno([[0, 0.43], [0.074, 0.43], [0.094, 0.45], [0.099, 0.48], [0.096, 0.51], [0, 0.51]], 28, 0.72), null, col.pantalon],
      [toro(0.099, 0.004, 6, 30), matriz([0, 0.47, 0], [90, 0, 0], [1, 0.71, 1]), col.pantalonOsc]
    ]), 'tela', r.cuerpo, true);
    r.torso.geometry.translate(0, -0.6, 0); r.torso.position.y = 0.6;

    var mo = esfera(28, 20);
    deformar(mo, function (v) { if (v.z > 0) v.z *= 0.4; v.x *= 0.09; v.y *= 0.11; v.z *= 0.06; v.x *= 1 - 0.1 * v.y / 0.11; });
    pintar(mo, col.mochila);
    var bol = esfera(20, 12); bol.scale(0.062, 0.05, 0.022);
    T.malla(fusionar([
      [mo, matriz([0, 0.6, -0.083])],
      [bol, matriz([0, 0.56, -0.13]), col.mochilaOsc],
      [toro(0.062, 0.003, 4, 26, Math.PI), matriz([0, 0.56, -0.142], [0, 0, 0], [1, 0.8, 1]), col.mochilaOsc],
      [tubo([[0.05, 0.585, 0.07], [0.055, 0.66, 0.07], [0.056, 0.724, 0.034], [0.056, 0.73, -0.03], [0.05, 0.68, -0.074]], 0.0085, 16), null, col.mochila],
      [tubo([[-0.05, 0.585, 0.07], [-0.055, 0.66, 0.07], [-0.056, 0.724, 0.034], [-0.056, 0.73, -0.03], [-0.05, 0.68, -0.074]], 0.0085, 16), null, col.mochila]
    ]), 'brillo', r.cuerpo, true);
    var bru = grupo(r.cuerpo, 0, 0.66, 0.072); bru.rotation.x = -10 * G;
    var gcaja = cilindro(0.019, 0.019, 0.008, 24); gcaja.rotateX(Math.PI / 2);
    T.malla(fusionar([[gcaja, null, col.oro], [toro(0.019, 0.0022, 6, 24), matriz([0, 0, 0.004]), col.oro], [toro(0.004, 0.0014, 6, 12), matriz([0, 0.021, 0]), col.oro]]), 'metal', bru, true);
    var gesf = cilindro(0.0155, 0.0155, 0.002, 24); gesf.rotateX(Math.PI / 2);
    var gag = new THREE.ConeGeometry(0.0028, 0.022, 4); gag.scale(1, 1, 0.3);
    T.malla(fusionar([[gesf, matriz([0, 0, 0.0042]), col.esfera], [gag, matriz([0, 0.004, 0.0056], [0, 0, -25]), col.aguja]]), 'brillo', bru, false);
    var vid = cilindro(0.016, 0.016, 0.001, 24); vid.rotateX(Math.PI / 2);
    T.malla(vid, 'cristal', bru, false).position.z = 0.0068;

    construirBrazos(T, r, c);
    construirPiernas(T, r, c, zapatilla(col));

    r.mapa = grupo(r.brazos.r.mano, 0, -0.03, 0.012);
    var mc = grupo(r.mapa, 0, 0.045, 0);
    T.malla(fusionar([[cilindro(0.0145, 0.0145, 0.15, 16), null, col.mapa],
      [toro(0.0152, 0.0036, 6, 16), matriz([0, 0.036, 0], [90, 0, 0]), col.cinta]]), 'papel', mc, true);
    r.hoja = grupo(mc);
    var gh = new THREE.BoxGeometry(1, 0.135, 0.0025); gh.translate(0.5, 0, 0);
    var mk = [[new THREE.BoxGeometry(0.026, 0.006, 0.001), matriz([0.03, -0.018, 0.0018], [0, 0, 45]), col.cinta],
      [new THREE.BoxGeometry(0.026, 0.006, 0.001), matriz([0.03, -0.018, 0.0018], [0, 0, -45]), col.cinta],
      [new THREE.BoxGeometry(0.016, 0.004, 0.001), matriz([-0.03, 0.025, 0.0018], [0, 0, -30]), col.cinta],
      [new THREE.BoxGeometry(0.016, 0.004, 0.001), matriz([-0.008, 0.01, 0.0018], [0, 0, -40]), col.cinta],
      [esfera(10, 6), matriz([-0.025, -0.02, 0.0015], null, [0.016, 0.011, 0.001]), 0x7FB069]];
    T.malla(fusionar([[gh, null, col.hoja]]), 'papel', r.hoja, true);
    r.marcas = T.malla(fusionar(mk), 'papel', mc, false);
    r.rolloB = T.malla(fusionar([[cilindro(0.012, 0.012, 0.138, 14), null, col.mapa]]), 'papel', mc, true);
    r.hoja.visible = r.rolloB.visible = r.marcas.visible = false;
  }

  function extraNico(r, P, muelle) {
    var c = NICO;
    r.tupe.rotation.x = muelle * 0.7;
    var m = P.mapa;
    r.hoja.visible = r.rolloB.visible = m > 0.03;
    r.hoja.scale.x = Math.max(0.03, m) * c.mapaW;
    r.rolloB.position.x = c.mapaW * m;
    r.marcas.visible = m > 0.75;
    r.marcas.position.x = c.mapaW * m * 0.5;
    r.raiz.updateMatrixWorld(true);
    var inv = r.mapa.parent.getWorldQuaternion(_qa).invert();
    _qb.setFromEuler(_eu.set(8 * G, 0, 12 * G));
    _qc.setFromEuler(_eu.set(-6 * G, 8 * G, 0));
    _qb.slerp(_qc, suave(m));
    r.mapa.quaternion.copy(inv).multiply(_qb);
  }

  // ---------------------------------------------------------------- ALBA
  var ALBA = {
    quien: 'alba', giroBase: -10, manoSaludo: 'l', pestanaLargo: 0.38,
    cuelloY: 0.752, craneoY: 0.848,
    cab: { R: 0.103, ancho: 0.95, alto: 1.0, fondo: 1.0, mand: 0.24 },
    ojo: { x: 0.036, y: -0.014, r: 0.0192, iris: 0x4E7D46, irisClaro: 0xA7B865 },
    ceja: { x: 0.039, y: 0.022, grosor: 0.004 },
    nariz: { y: -0.042, esc: [0.0085, 0.0075, 0.008] },
    oreja: { y: -0.012 },
    boca: { y: -0.066, ancho: 0.023, alto: 0.027, curva: 0.009, curvatura: 0.055, labioSup: 0.0033, labioInf: 0.0044 },
    brazo: { hombroX: 0.1, hombroY: 0.703, L1: 0.138, L2: 0.123, mangaLarga: false },
    pierna: { caderaX: 0.05, caderaY: 0.455, L1: 0.2, L2: 0.2, rPernera: 0.056, largoPernera: 0.09, k: 0.93, tela: 'sarga' },
    color: {
      piel: 0xF0BE98, rubor: 0xF2887E, rubor2: 0xE3967E, nariz: 0xF0AE90, oreja: 0xF2B294, parpado: 0xE5AE88, pestana: 0x2A1A12,
      labios: 0xC96A64, ceja: 0x7A3818,
      camiseta: 0xFFC83D, camisetaOsc: 0xEBAE22, peto: 0xE8502F, petoOsc: 0xC9401F, pantalon: 0xE8502F, pantalonOsc: 0xC9401F,
      boton: 0xFFC83D, bota: 0x7B5CD6, botaSuela: 0x5A3FB0, morado: 0x7B5CD6, coletero: 0xFFC83D
    },
    pelo: {
      color: 0x9B4A22, claro: 0xB8632F, oscuro: 0x7E3A1A, grosor: 0.006, volumen: 0.005, lineaFina: 64, pasoFino: 8,
      linea: [[0, 40], [40, 32], [65, 16], [85, 10], [110, 2], [140, -18], [180, -36]],
      mechones: (function () {
        var m = [], rnd = azar(23);
        [1, -1].forEach(function (s) {
          var tie = [s * 108, 22];
          // pelo recogido: mechones desde la raya y desde la nuca hacia cada coleta
          for (var i = 0; i < 7; i++) {
            var t = i / 6, de = [lerp(22, s * 170, t) + (rnd() - 0.5) * 8, lerp(86, 22, t * t)];
            m.push({ de: de, medio: [lerp(de[0], tie[0], 0.55), lerp(de[1], tie[1], 0.5) + 10 * (1 - t)], a: [tie[0] + (rnd() - 0.5) * 6, tie[1] + (rnd() - 0.5) * 6], r: 0.01 + rnd() * 0.004 });
          }
          m.push({ de: [s * 75, 12], medio: [s * 92, 16], a: tie, r: 0.009 });
        });
        return m;
      })()
    }
  };

  function construirAlba(T, r) {
    var c = ALBA, col = c.color, rnd = azar(41);
    construirCabeza(T, r, c);
    construirPelo(T, r, c);
    // flequillo de lado: mechones desde la raya que caen hacia su derecha (izquierda de la pantalla)
    T.malla(fusionar([
      mechonSup(c, { de: [24, 70], medio: [2, 50], a: [-42, 30], r: 0.015, alza: [0, 0.002] }, rnd),
      mechonSup(c, { de: [30, 62], medio: [10, 44], a: [-22, 28], r: 0.014, alza: [0, 0.002] }, rnd),
      mechonSup(c, { de: [18, 76], medio: [-12, 54], a: [-62, 34], r: 0.014, alza: [0, 0.002] }, rnd),
      mechonSup(c, { de: [36, 56], medio: [24, 42], a: [4, 31], r: 0.012, alza: [0, 0.002] }, rnd),
      mechonSup(c, { de: [44, 50], a: [26, 34], r: 0.011, alza: [0, 0.001] }, rnd),
      mechonSup(c, { de: [27, 66], medio: [-2, 47], a: [-33, 27], r: 0.009, alza: [0, 0.004] }, rnd),
      mechonSup(c, { de: [20, 72], medio: [-22, 52], a: [-52, 30], r: 0.009, alza: [0, 0.004] }, rnd)
    ]), 'pelo', r.cara, true);
    r.coletas = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var raiz = puntoPelo(c, s * 108, 22).p;
      var g = grupo(r.cara, raiz.x, raiz.y, raiz.z);
      function coleta(dz, esc, rMax, dx) {
        var pts = [[-s * 0.006, 0.002, 0], [s * (0.03 + dx), -0.004, dz * 0.5], [s * (0.056 + dx), -0.03, dz], [s * (0.066 + dx), -0.07, dz], [s * (0.058 + dx), -0.112, dz * 0.6]]
          .map(function (p) { return new V3(p[0] * esc, p[1] * esc, p[2]); });
        var gg = tuboVariable(pts, function (t) { return t < 0.3 ? lerp(0.012, rMax, suave(t / 0.3)) : rMax * Math.pow(Math.max(0, 1 - (t - 0.3) / 0.7), 0.55) + 0.0005; }, 18, 10);
        var c0 = new THREE.Color().setHex(tonoPelo(c, rnd), THREE.LinearSRGBColorSpace);
        return [pintar(gg, function (v, out) { out.copy(c0); })];
      }
      T.malla(fusionar([coleta(0, 1, 0.03, 0), coleta(0.014, 0.92, 0.022, 0.004), coleta(-0.013, 0.9, 0.021, -0.002),
        coleta(0.006, 0.97, 0.016, 0.01), coleta(-0.004, 0.86, 0.015, -0.008), coleta(0.0, 1.04, 0.012, 0.006)]), 'pelo', g, true);
      var goma = toro(0.0145, 0.0058, 8, 18); goma.rotateY(Math.PI / 2);
      T.malla(pintar(goma, col.coletero), 'brillo', g, true).position.set(s * 0.006, 0.0005, 0);
      r.coletas[lado] = g;
    });

    T.malla(pintar(cilindro(0.037, 0.04, 0.09, 16), col.piel), 'piel', r.cuerpo, true, false).position.y = 0.747;
    var tor = torno([[0, 0.5], [0.084, 0.5], [0.09, 0.53], [0.088, 0.58], [0.09, 0.62], [0.096, 0.66], [0.099, 0.683], [0.094, 0.702], [0.076, 0.72], [0.046, 0.733], [0.032, 0.736], [0, 0.736]], 30, 0.67);
    pintar(tor, col.camiseta);
    r.torso = T.malla(fusionar([
      [tor],
      [toro(0.033, 0.0058, 8, 24), matriz([0, 0.733, 0.003], [96, 0, 0], [1, 0.85, 1]), col.camisetaOsc]
    ]), 'tela', r.cuerpo, true);
    r.torso.geometry.translate(0, -0.6, 0); r.torso.position.y = 0.6;
    var frente = function (x) { return 0.67 * Math.sqrt(Math.max(0, 0.0985 * 0.0985 - x * x)); };
    var babero = new THREE.BoxGeometry(0.1, 0.1, 0.007, 10, 4, 1);
    deformar(babero, function (v) { v.z += frente(v.x) + 0.0045; v.y += 0.64; v.x *= 1 - 0.12 * (v.y - 0.59) / 0.1; });
    var bolsillo = new THREE.BoxGeometry(0.045, 0.03, 0.004, 6, 2, 1);
    deformar(bolsillo, function (v) { v.z += frente(v.x) + 0.0095; v.y += 0.632; });
    var petoAbajo = torno([[0, 0.43], [0.072, 0.43], [0.093, 0.45], [0.1, 0.49], [0.098, 0.54], [0.095, 0.6], [0.092, 0.612], [0, 0.612]], 30, 0.7);
    deformar(petoAbajo, function (v) {     // pliegues suaves de la tela en la cintura
      var a = Math.atan2(v.x, v.z), pl = Math.exp(-Math.pow((v.y - 0.585) / 0.02, 2));
      var k = 1 + 0.03 * pl * (0.5 + 0.5 * Math.sin(a * 8));
      v.x *= k; v.z *= k;
    });
    T.malla(fusionar([
      [petoAbajo, null, col.peto],
      [toro(0.094, 0.0045, 6, 30), matriz([0, 0.606, 0], [90, 0, 0], [1, 0.7, 1]), col.petoOsc],
      [babero, null, col.peto], [bolsillo, null, col.petoOsc],
      [tubo([[0.042, 0.686, 0.064], [0.05, 0.712, 0.05], [0.054, 0.733, 0.0], [0.05, 0.712, -0.05], [0.044, 0.64, -0.064]], 0.0065, 14), null, col.peto],
      [tubo([[-0.042, 0.686, 0.064], [-0.05, 0.712, 0.05], [-0.054, 0.733, 0.0], [-0.05, 0.712, -0.05], [-0.044, 0.64, -0.064]], 0.0065, 14), null, col.peto],
      [esfera(12, 8), matriz([0.041, 0.682, frente(0.041) + 0.009], null, [0.0072, 0.0072, 0.004]), col.boton],
      [esfera(12, 8), matriz([-0.041, 0.682, frente(0.041) + 0.009], null, [0.0072, 0.0072, 0.004]), col.boton]
    ]), 'sarga', r.cuerpo, true);

    construirBrazos(T, r, c);
    construirPiernas(T, r, c, bota(col));

    r.lupa = grupo(null);
    T.malla(fusionar([[cilindro(0.0068, 0.0075, 0.05, 12), null, col.morado],
      [toro(0.027, 0.0065, 10, 28), matriz([0, 0.052, 0]), col.morado],
      [esfera(10, 8), matriz([0, -0.027, 0], null, 0.0085), col.morado]]), 'brillo', r.lupa, true);
    var gcr = cilindro(0.026, 0.026, 0.002, 24); gcr.rotateX(Math.PI / 2); gcr.translate(0, 0.052, 0);
    T.malla(gcr, 'cristal', r.lupa, false);
    r.anclaCadera = grupo(r.cuerpo, 0.1, 0.475, 0.035);
    r.anclaCadera.rotation.set(0, -20 * G, 168 * G);
    r.anclaMano = grupo(r.brazos.l.mano, 0, -0.03, 0.01);
    r.anclaCadera.add(r.lupa);
  }

  function extraAlba(r, P, muelle) {
    var phi = muelle * 0.9;
    r.coletas.l.rotation.z = phi;
    r.coletas.r.rotation.z = -phi;
    var enMano = P.lupaMano >= 0.5;
    if (enMano) {
      if (r.lupa.parent !== r.anclaMano) r.anclaMano.add(r.lupa);
      r.raiz.updateMatrixWorld(true);
      var qp = r.anclaMano.getWorldQuaternion(_qa).invert();
      _qb.setFromEuler(_eu.set(-10 * G, -25 * G, -12 * G)); qp.multiply(_qb);
      r.lupa.quaternion.copy(qp);
    } else if (r.lupa.parent !== r.anclaCadera) {
      r.anclaCadera.add(r.lupa);
      r.lupa.quaternion.identity();
    }
  }

  var _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _eu = new THREE.Euler();

  function construir(T, cfg) {
    var r = { cfg: cfg };
    r.raiz = grupo(null);
    r.cuerpo = grupo(r.raiz);
    r.cabeza = grupo(r.cuerpo, 0, cfg.cuelloY, 0);
    r.cabeza.rotation.order = 'YXZ';
    r.cara = grupo(r.cabeza, 0, cfg.craneoY - cfg.cuelloY, 0);
    if (cfg.quien === 'nico') construirNico(T, r); else construirAlba(T, r);
    return r;
  }

  // ---------------------------------------------------------------- poses (igual que la v2)
  function reposo(cfg, giroBase) {
    var nico = cfg.quien === 'nico';
    return {
      y: 0, z: 0, giro: 0, cx: 0, cy: -giroBase * 0.6, cz: 0, encoger: 0, agacha: 0, punta: 0,
      lA: 9, lF: 5, lC: 18, lCz: 0, lM: 80, lMx: 0, lPu: 0.35, lAp: 0,
      rA: 9, rF: 5, rC: nico ? 24 : 18, rCz: 0, rM: nico ? 10 : 80, rMx: 0, rPu: nico ? 0.85 : 0.35, rAp: 0,
      ojoX: 0, ojoY: 0, feliz: 0, guinoL: 0, guinoR: 0, cierre: 0, parp: 0,
      cejaL: 0, cejaR: 0, cejaInc: 0, boca: 0, bocaO: 0, bocaLado: 0, torcida: 0, sonr: 0.5,
      mapa: 0, lupaMano: 0
    };
  }
  function apuntar(P, lado, giroTotal, dir) {
    var th = -giroTotal * G;
    var x = dir[0] * Math.cos(th) + dir[2] * Math.sin(th);
    var z = -dir[0] * Math.sin(th) + dir[2] * Math.cos(th);
    var y = dir[1], n = Math.sqrt(x * x + y * y + z * z);
    x /= n; y /= n; z /= n;
    var s = lado === 'l' ? 1 : -1;
    P[lado + 'F'] = Math.asin(z) / G;
    P[lado + 'A'] = Math.atan2(s * x, -y) / G;
  }
  function feliz(P, w) { P.feliz = Math.max(P.feliz, w); P.sonr = lerp(P.sonr, 1, w); }

  var POSES = {
    espera: function (P, t, x) {
      P.cy += 4 * onda(t, 1 / 6) * x.m;
      if (x.alba) P.cz += 2.5 * onda(t, 1 / 4) * x.m;
      P.ojoX += 6 * onda(t, 1 / 9) * x.m;
    },
    saludo: function (P, t, x) {
      var l = x.cfg.manoSaludo, sg = l === 'r' ? 1 : -1, nico = !x.alba;
      var env = meseta(t, 0.2, 0.35, 1.05, 1.25) * x.k;
      P[l + 'A'] = 128 + 6 * onda(t, 3) * env;
      P[l + 'F'] = 14; P[l + 'C'] = 10;
      P[l + 'Cz'] = 32 + 22 * onda(t, 3, 1.2) * env;
      P[l + 'M'] = 0; P[l + 'Mx'] = -10;
      if (!nico) P[l + 'Pu'] = 0.05;
      P.y = 0.018 * campana(t, 0.1, 0.42) * x.m;
      P.cz = 7 * sg; P.cejaL = P.cejaR = 0.006;
      P.boca = 0.45;
      feliz(P, 0.5 + 0.4 * campana(t, 0.3, 1.0));
    },
    habla: function (P, t, x) {
      P.lA = P.rA = 14;
      P.lF = 24 + 9 * onda(t, 1.1) * x.k;
      P.rF = 24 + 9 * onda(t, 1.1, 2) * x.k;
      P.lC = 55 + 8 * onda(t, 1.1, 0.5) * x.k;
      P.rC = 55 + 8 * onda(t, 1.1, 2.5) * x.k;
      P.lM = 45; if (x.alba) { P.rM = 45; P.rPu = P.lPu = 0.2; } else P.lPu = 0.2;
      P.cx = (x.alba ? 3.5 : 3) * onda(t, 0.7) * x.k;
      P.cejaL = P.cejaR = 0.003;
    },
    explica: function (P, t, x) {
      P.giro = x.alba ? 20 : 15;
      var gt = x.giroBase + P.giro;
      apuntar(P, 'l', gt, [0.95, 0.08, 0.3]);
      P.lC = 0; P.lCz = 0; P.lPu = 1; P.lAp = 1; P.lM = 90; P.lMx = 0;
      var mira = 1 - rampa(t, 1.3, 1.7);
      P.cy = (x.alba ? 22 : 18) * mira - gt * 0.75 * (1 - mira);
      P.ojoX = 12 * mira;
      P.cejaL = 0.009; P.cejaR = 0.003;
      P.sonr = 0.8;
    },
    animo: function (P, t, x) {
      var botes = (campana(t, 0.25, 0.5) + campana(t, 0.6, 0.85));
      P.y = 0.012 * botes * x.m;
      if (x.alba) {
        P.lA = P.rA = 14; P.lF = P.rF = 42 + 8 * botes * x.k; P.lC = P.rC = 108;
        P.lPu = P.rPu = 1; P.lM = P.rM = 70;
        P.cz = 10; P.cejaInc = 16 * meseta(t, 0, 0.1, 0.35, 0.55);
      } else {
        P.lA = 78; P.lF = 22; P.lC = 0; P.lCz = 84 + 10 * botes * x.k; P.lPu = 1; P.lM = 20;
        P.cz = -6; P.cejaInc = 14 * meseta(t, 0, 0.15, 0.6, 0.9);
      }
      P.cx = 7 * (campana(t, 0.25, 0.55) + campana(t, 0.65, 0.95)) * x.k;
      P.cejaL = P.cejaR = 0.004; P.sonr = 0.95; P.boca = 0.15;
    },
    celebra: function (P, t, x) {
      if (x.m) {
        var u = (t - 0.22) / 0.4;
        P.agacha = 30 * campana(t, 0, 0.3) + 22 * campana(t, 0.6, 0.85);
        P.y = (u > 0 && u < 1) ? 0.075 * 4 * u * (1 - u) : 0;
        P.punta = 18 * campana(t, 0.22, 0.62);
      }
      P.lA = P.rA = 140; P.lF = P.rF = 12; P.lC = P.rC = 10; P.lCz = P.rCz = 16;
      P.lM = 0; if (x.alba) { P.rM = 0; P.rPu = 0.1; } P.lPu = 0.1;
      P.cx = -8; feliz(P, 1); P.boca = 1; P.cejaL = P.cejaR = 0.01;
    },
    despedida: function (P, t, x) {
      var l = x.cfg.manoSaludo, sg = l === 'r' ? 1 : -1, hz = x.alba ? 2 : 1.5;
      var env = meseta(t, 0.25, 0.4, 1.1, 1.35) * x.k;
      P[l + 'A'] = 124 + 5 * onda(t, hz) * env;
      P[l + 'F'] = 12; P[l + 'C'] = 10;
      P[l + 'Cz'] = 30 + 18 * onda(t, hz, 1) * env;
      P[l + 'M'] = 0; P[l + 'Mx'] = -10;
      if (x.alba) P[l + 'Pu'] = 0.05;
      P.z = -0.04 * rampa(t, 0, 0.5) * x.m;
      P.cz = x.alba ? -9 * sg : 6 * sg;
      P.sonr = 0.95; feliz(P, 0.35); P.cejaL = P.cejaR = 0.004;
      if (x.alba) P.guinoL = campana(t, 1.2, 1.55); else P.cierre = campana(t, 1.15, 1.6);
    },
    pensando: function (P, t, x) {
      var rem = rampa(t, 2.05, 2.4);
      if (x.alba) {
        P.rA = 4; P.rF = 48; P.rC = 124; P.rCz = 34; P.rPu = 0.7; P.rM = 60; P.rMx = 10;
        P.lA = 18; P.lF = 45; P.lC = 75; P.lPu = 0.9; P.lM = 60; P.lupaMano = 1;
        P.cz = 9; P.cx = -8; P.cy += 6;
        P.ojoX = 10; P.ojoY = 13;
        P.cejaL = 0.011; P.cejaR = -0.004;
        P.bocaO = 1; P.bocaLado = 0.006; P.sonr = 0.1;
        mezclarEn(P, { rA: 34, rF: 34, rC: 55, rPu: 0.2, rM: 0, lA: 30, lF: 38, lC: 60, encoger: 0.012, cx: 0, cz: 7,
                       ojoX: 0, ojoY: 4, cejaL: 0.008, cejaR: 0.008, bocaO: 0, bocaLado: 0, boca: 0.3, sonr: 0.7 }, rem);
      } else {
        var rasca = meseta(t, 0.5, 0.6, 1.8, 1.95) * x.k;
        P.rA = 26; P.rF = 14; P.rC = 78; P.rM = 10;
        P.mapa = rampa(t, 0.15, 0.55);
        P.lA = 148 + 4 * onda(t, 4) * rasca; P.lF = 14; P.lC = 12; P.lCz = 76 + 6 * onda(t, 4, 1) * rasca;
        P.lPu = 0.55; P.lM = 30;
        P.encoger = 0.008;
        P.cx = 9; P.cy = -16; P.cz = -5;
        P.ojoX = -10; P.ojoY = -12;
        P.cejaL = 0.011; P.cejaR = -0.003;
        P.torcida = 1; P.sonr = 0.2;
        mezclarEn(P, { rA: 34, rF: 34, rC: 50, lA: 34, lF: 34, lC: 50, lCz: 0, lPu: 0.2, lM: 0, encoger: 0.014, cx: 0, cy: -8, cz: 7,
                       ojoX: 0, ojoY: 4, cejaL: 0.008, cejaR: 0.008, torcida: 0, boca: 0.3, sonr: 0.7, mapa: 0 }, rem);
      }
    }
  };

  // ---------------------------------------------------------------- creación
  function crear(contenedor, quien, opciones) {
    try { return crearInterno(contenedor, quien, opciones || {}); }
    catch (e) { if (window.console) console.warn('Personajes3D: no se pudo crear', e); return null; }
  }

  function crearInterno(contenedor, quien, op) {
    if (!contenedor) return null;
    quien = String(quien || '').toLowerCase();
    if (quien !== 'nico' && quien !== 'alba') return null;
    if (!hayWebGL()) return null;
    var M;
    try { M = motor(); } catch (e) { return null; }

    var sombras = op.sombras !== false;
    var lienzo2d = document.createElement('canvas');
    lienzo2d.style.display = 'block'; lienzo2d.style.width = '100%'; lienzo2d.style.height = '100%';
    var ctx = lienzo2d.getContext('2d');
    contenedor.appendChild(lienzo2d);
    var fondoPrevio = null;
    if (op.fondo) {
      fondoPrevio = [contenedor.style.backgroundImage, contenedor.style.backgroundSize, contenedor.style.backgroundPosition];
      contenedor.style.backgroundImage = 'url("' + String(op.fondo).replace(/"/g, '%22') + '")';
      contenedor.style.backgroundSize = 'cover';
      contenedor.style.backgroundPosition = 'center bottom';
    }

    var cfg = quien === 'nico' ? NICO : ALBA;
    var giroBase = typeof op.giro === 'number' ? op.giro : cfg.giroBase;
    var T = new Taller(sombras);
    var rig = construir(T, cfg);
    var extra = quien === 'nico' ? extraNico : extraAlba;

    var escena = new THREE.Scene();
    escena.add(rig.raiz);
    // luz: sol (clave cálida, con sombra) colocado donde está el sol del cielo; el cielo da el relleno
    var hemi = new THREE.HemisphereLight(0xBFE3FF, 0x8A7A5A, 1.1);       // solo mientras carga el cielo
    var sol = new THREE.DirectionalLight(0xFFF1DC, 2.4);
    sol.position.set(-1.2, 1.95, 2.5);
    sol.target.position.set(0, 0.55, 0);
    var borde = new THREE.DirectionalLight(0xE8F4FF, 0.6);
    borde.position.set(1.5, 1.4, -1.8);
    borde.target.position.set(0, 0.55, 0);
    escena.add(hemi, sol, sol.target, borde, borde.target);
    if (sombras) {
      sol.castShadow = true;
      sol.shadow.mapSize.set(1024, 1024);
      var sc = sol.shadow.camera;
      sc.left = -0.62; sc.right = 0.62; sc.top = 0.68; sc.bottom = -0.68; sc.near = 1.5; sc.far = 5;
      sc.updateProjectionMatrix();
      sol.shadow.bias = -0.0004;
      sol.shadow.normalBias = 0.0045;
    }
    var texSombra = texturaSombra();
    var geoSombra = new THREE.PlaneGeometry(1, 1); geoSombra.rotateX(-Math.PI / 2);
    var matSombra = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, toneMapped: false, color: 0x1A1410 });
    var sombra = new THREE.Mesh(geoSombra, matSombra);
    sombra.position.y = 0.001; sombra.renderOrder = -1;
    escena.add(sombra);
    var camara = new THREE.PerspectiveCamera(20, 1, 0.1, 30);

    // luz de entorno (cielo HDRI de Poly Haven → PMREM, compartido)
    var listo = Promise.resolve(null);
    if (op.entorno !== false) {
      var reg = entorno(M, op.entorno || ENTORNO_DEFECTO, typeof op.solGiro === 'number' ? op.solGiro : -35, op.suelo || '#8A7A5A');
      listo = reg.listo.then(function (rg) {
        if (destruido || !rg.textura) return rg;
        escena.environment = rg.textura;
        hemi.intensity = 0.15;
        if (rg.sol) sol.position.copy(rg.sol).multiplyScalar(3).add(sol.target.position);
        ultimo = 0; if (congelado) pintarEscena(); else pedirFrame();
        return rg;
      });
    }

    // ---- estado interno
    var ctxP = { cfg: cfg, giroBase: giroBase, alba: quien === 'alba', m: 1, k: 1 };
    var estado = 'espera', tEstado = 0, trans = 1, vida = 0;
    var snap = reposo(cfg, giroBase), actual = reposo(cfg, giroBase), final = reposo(cfg, giroBase);
    var hablando = false, calmado = false, hablaVal = 0, hablaObj = 0, hablaReloj = 0;
    var proxParpadeo = 0, iniParpadeo = -10, doble = false, parpadeando = false;
    var muelle = { x: 0, v: 0 }, yPrev = 0, vyPrev = 0;
    var raf = 0, temporizador = 0, ultimo = 0, lento = false, congelado = false, destruido = false;
    var anchoPx = 0, altoPx = 0;

    function ahoraS() { return (window.performance && performance.now ? performance.now() : Date.now()) / 1000; }
    proxParpadeo = ahoraS() + 1.5 + Math.random() * 2;
    function copiar(dst, src) { for (var k in src) dst[k] = src[k]; return dst; }
    function objetivo(nombre, t) { var P = reposo(cfg, giroBase); POSES[nombre](P, t, ctxP); return P; }
    function cambiar(nombre) { copiar(snap, actual); estado = nombre; tEstado = 0; trans = 0; }

    function capas(P, dt) {
      P.resp = calmado ? 0 : (1 - Math.cos(2 * Math.PI * vida / 3)) / 2;
      var activa = hablando || estado === 'habla';
      if (activa) {
        hablaReloj -= dt;
        if (hablaReloj <= 0) {
          if (Math.random() < 0.12) { hablaObj = 0; hablaReloj = 0.16 + Math.random() * 0.14; }
          else { hablaObj = [0.18, 0.45, 0.85][Math.floor(Math.random() * 3)]; hablaReloj = 1 / (8 + Math.random() * 4); }
        }
      } else hablaObj = 0;
      hablaVal += (hablaObj - hablaVal) * (1 - Math.exp(-dt / 0.035));
      if (activa || hablaVal > 0.01) {
        P.boca = Math.max(hablaVal, P.feliz > 0.8 ? 0.35 : 0);
        P.bocaO *= 0.2; P.torcida *= 0.3;
        P.cejaL += 0.004 * hablaVal * hablaVal; P.cejaR += 0.004 * hablaVal * hablaVal;
      }
      return activa;
    }
    function parpadeo() {
      var a = ahoraS();
      if (a >= proxParpadeo) { iniParpadeo = a; doble = Math.random() < 0.25; proxParpadeo = a + 2.5 + Math.random() * 2.5 + (doble ? 0.3 : 0); }
      var tp = a - iniParpadeo, c = 0;
      if (tp < 0.14) c = campana(tp, 0, 0.14);
      else if (doble && tp > 0.22 && tp < 0.36) c = campana(tp, 0.22, 0.36);
      parpadeando = tp < (doble ? 0.37 : 0.15);
      return c;
    }
    function muelles(P, dt) {
      dt = Math.min(dt, 0.04);
      var vy = (P.y - yPrev) / dt, ay = (vy - vyPrev) / dt;
      yPrev = P.y; vyPrev = vy;
      ay = Math.max(-60, Math.min(60, ay));
      muelle.v += (-247 * muelle.x - 7.5 * muelle.v + 4 * ay) * dt;
      muelle.x = Math.max(-0.45, Math.min(0.45, muelle.x + muelle.v * dt));
      return Math.abs(muelle.x) > 0.002 || Math.abs(muelle.v) > 0.02;
    }

    var bocaPrm = { abre: 0, sonr: 0.5, O: 0, lado: 0, torc: 0 };
    function aplicar(P, cierre) {
      var r = rig, a = P.agacha * G, pl = cfg.pierna;
      var baja = (pl.L1 + pl.L2) * (1 - Math.cos(a));
      r.raiz.position.set(0, P.y - baja, P.z);
      r.cuerpo.rotation.y = (giroBase + P.giro) * G;
      r.torso.scale.set(1 + 0.008 * P.resp, 1 + 0.012 * P.resp, 1 + 0.012 * P.resp);
      r.cabeza.position.y = cfg.cuelloY + 0.002 * P.resp;
      r.cabeza.rotation.set(P.cx * G, P.cy * G, P.cz * G);
      r.mandibula.rotation.x = (7 * P.boca + 3 * P.bocaO) * G;
      ['l', 'r'].forEach(function (l) {
        var b = r.brazos[l];
        b.hombro.position.y = P.encoger + 0.0015 * P.resp;
        b.hombro.rotation.set(-P[l + 'F'] * G, 0, b.s * P[l + 'A'] * G);
        b.codo.rotation.set(-P[l + 'C'] * G, 0, b.s * P[l + 'Cz'] * G);
        b.mano.rotation.set(P[l + 'Mx'] * G, -b.s * P[l + 'M'] * G, 0);
        var pu = lim01(P[l + 'Pu']);
        b.tres.rotation.x = -pu * 100 * G;
        b.indice.rotation.x = -pu * (1 - lim01(P[l + 'Ap'])) * 100 * G;
        b.pulgar.quaternion.copy(b.qRelax).slerp(b.qRecog, pu);
        var pi = r.piernas[l];
        pi.cadera.rotation.x = -a;
        pi.rodilla.rotation.x = 2 * a;
        pi.tobillo.rotation.x = -a + P.punta * G;
        var o = r.ojos[l];
        o.globo.rotation.set(-P.ojoY * G, P.ojoX * G, 0);
        var g = l === 'l' ? P.guinoL : P.guinoR;
        var cerr = Math.max(cierre, P.cierre, g, 0.1 * P.feliz + P.parp);
        o.sup.rotation.x = (-40 + 78 * lim01(cerr) - 0.35 * P.ojoY) * G;
        o.inf.rotation.x = (37 - 21 * P.feliz - 0.15 * P.ojoY) * G;
        o.brillo.visible = cerr < 0.7;
        o.cornea.visible = cerr < 0.5;     // la córnea abombada no debe asomar por el párpado cerrado
        // cejas con más recorrido que en la v2 para que se lean a tamaño de juego
        var ce = r.cejas[l];
        ce.position.y = (l === 'l' ? P.cejaL : P.cejaR) * 1.7;
        ce.rotation.z = (l === 'l' ? -1 : 1) * P.cejaInc * 1.4 * G;
      });
      bocaPrm.abre = P.boca; bocaPrm.sonr = P.sonr; bocaPrm.O = P.bocaO; bocaPrm.lado = P.bocaLado; bocaPrm.torc = P.torcida;
      r.boca.actualizar(bocaPrm);
      sombra.position.x = 0; sombra.position.z = P.z + 0.01;
      var sal = Math.max(0, P.y);
      sombra.scale.set(0.36 * (1 - sal * 2.5), 1, 0.26 * (1 - sal * 2.5));
      matSombra.opacity = 1 - sal * 6;
      extra(r, P, muelle.x);
    }

    function actualizar(dt) {
      vida += dt; tEstado += dt;
      if (DURACION[estado] && tEstado >= DURACION[estado]) cambiar('espera');
      var obj = objetivo(estado, tEstado), enTrans = trans < 1;
      if (enTrans) {
        trans = Math.min(1, trans + dt / TRANSICION);
        var w = suave(trans);
        for (var k in obj) actual[k] = lerp(snap[k], obj[k], w);
      } else copiar(actual, obj);
      copiar(final, actual);
      var habla = capas(final, dt);
      var c = parpadeo();
      var mov = muelles(final, dt);
      aplicar(final, c);
      var dinamico = !calmado || !!DURACION[estado] || estado === 'habla' || (estado === 'explica' && tEstado < 2);
      lento = !enTrans && estado === 'espera' && !habla && hablaVal < 0.01 && !parpadeando && !mov;
      return enTrans || dinamico || habla || hablaVal > 0.01 || parpadeando || mov;
    }

    function pintarEscena() { if (!destruido && anchoPx > 0) pintarEn(M, escena, camara, anchoPx, altoPx, ctx); }
    function pedirFrame() {
      if (temporizador) { clearTimeout(temporizador); temporizador = 0; }
      if (!raf && !destruido && !congelado && !document.hidden) raf = requestAnimationFrame(tick);
    }
    function dormir() {
      var espera = Math.max(0.05, proxParpadeo - ahoraS());
      temporizador = setTimeout(function () { temporizador = 0; pedirFrame(); }, espera * 1000);
    }
    function tick(ms) {
      raf = 0;
      if (destruido || congelado || document.hidden) return;
      var ahora = ms / 1000;
      if (ultimo && lento && ahora - ultimo < 0.031) { pedirFrame(); return; }
      var dt = ultimo ? Math.min(0.1, Math.max(0.001, ahora - ultimo)) : 1 / 60;
      ultimo = ahora;
      var vivo = actualizar(dt);
      pintarEscena();
      if (vivo) pedirFrame(); else { ultimo = 0; dormir(); }
    }

    function ajustar() {
      if (destruido) return;
      var w = contenedor.clientWidth || 300, h = contenedor.clientHeight || 300;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      anchoPx = Math.max(1, Math.round(w * dpr)); altoPx = Math.max(1, Math.round(h * dpr));
      lienzo2d.width = anchoPx; lienzo2d.height = altoPx;
      var asp = w / h, retrato = op.encuadre === 'retrato';
      var cy = retrato ? cfg.craneoY - 0.02 : 0.56;
      var mitadH = Math.max(retrato ? 0.17 : 0.6, (retrato ? 0.2 : 0.46) / asp);
      var d = mitadH / Math.tan(10 * G);
      camara.aspect = asp;
      camara.position.set(0, cy + (retrato ? 0.03 : 0.1), d);
      camara.lookAt(0, cy, 0);
      camara.updateProjectionMatrix();
      if (congelado) pintarEscena(); else pedirFrame();
    }
    function alVisibilidad() {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
      else { ultimo = 0; pedirFrame(); }
    }
    document.addEventListener('visibilitychange', alVisibilidad);
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(ajustar); ro.observe(contenedor); }
    else window.addEventListener('resize', ajustar);

    ajustar();
    actualizar(1 / 60);
    pintarEscena();
    pedirFrame();

    return {
      estado: function (nombre) {
        if (destruido || ESTADOS.indexOf(nombre) < 0) return;
        congelado = false;
        if (nombre !== estado || DURACION[nombre]) cambiar(nombre);
        ultimo = 0; pedirFrame();
      },
      estadoActual: function () { return estado; },
      hablar: function (si) {
        if (destruido) return;
        hablando = !!si; if (hablando) hablaReloj = 0;
        congelado = false; ultimo = 0; pedirFrame();
      },
      calma: function (si) {
        if (destruido) return;
        si = !!si;
        if (si === calmado) return;
        calmado = si; ctxP.m = si ? 0 : 1; ctxP.k = si ? 0.35 : 1;
        copiar(snap, actual); trans = 0;
        congelado = false; ultimo = 0; pedirFrame();
      },
      fotograma: function (nombre, t) {
        if (destruido || ESTADOS.indexOf(nombre) < 0) return;
        congelado = true;
        if (raf) cancelAnimationFrame(raf); raf = 0;
        estado = nombre; tEstado = t || 0; trans = 1;
        copiar(actual, objetivo(nombre, tEstado)); copiar(snap, actual); copiar(final, actual);
        final.resp = 0;
        if (nombre === 'habla' || hablando) { final.boca = 0.6; final.bocaO = 0; final.torcida = 0; }
        muelle.x = muelle.v = 0; yPrev = final.y; vyPrev = 0;
        aplicar(final, 0);
        pintarEscena();
      },
      listo: listo,
      info: { mallas: T.mallas, triangulos: Math.round(T.tris), sombras: sombras },
      destruir: function () {
        if (destruido) return;
        destruido = true;
        if (raf) cancelAnimationFrame(raf);
        if (temporizador) clearTimeout(temporizador);
        document.removeEventListener('visibilitychange', alVisibilidad);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', ajustar);
        escena.environment = null;
        T.liberar(); geoSombra.dispose(); matSombra.dispose(); texSombra.dispose();
        sol.dispose && sol.dispose();
        if (lienzo2d.parentNode) lienzo2d.parentNode.removeChild(lienzo2d);
        if (fondoPrevio) {
          contenedor.style.backgroundImage = fondoPrevio[0];
          contenedor.style.backgroundSize = fondoPrevio[1];
          contenedor.style.backgroundPosition = fondoPrevio[2];
        }
        soltarMotor();
      }
    };
  }

  window.Personajes3D = { crear: crear, estados: ESTADOS.slice(), version: 3 };
})();
