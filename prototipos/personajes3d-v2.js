/*
 * personajes3d.js · v2 · Nico y Alba en estilo «animación 3D estilizada-realista» (three.js r158).
 * La v1 (estilo juguete con contorno) está guardada en personajes3d-v1.js con la misma API.
 *
 * Script clásico: necesita window.THREE (vendor/three.min.js) cargado antes. Sin módulos ni import.
 *
 *   var pj = Personajes3D.crear(contenedor, 'nico' | 'alba', opciones?)   // null si no hay WebGL
 *   pj.estado('saludo' | 'espera' | 'habla' | 'explica' | 'animo' | 'celebra' | 'despedida' | 'pensando')
 *   pj.hablar(true | false)    // capa aparte: mueve la boca en cualquier estado
 *   pj.calma(true | false)     // movimiento reducido: sin balanceos ni saltos
 *   pj.estadoActual()
 *   pj.fotograma(estado, s)    // para pruebas: congela el gesto en el segundo s
 *   pj.destruir()
 *
 * Opciones (todas opcionales):
 *   encuadre: 'cuerpo' (por defecto) | 'retrato' (cabeza y hombros, para iconos)
 *   giro: grados de giro de reposo (por defecto Nico +14, Alba −10: se miran entre sí)
 *   fondo: ruta de una imagen que se pone detrás del canvas (fondo CSS del contenedor).
 *          Sin esta opción el canvas es transparente.
 *   sombras: true (por defecto) | false. Con true, autosombras con un foco y mapa de 1024;
 *            con false solo queda la sombra de contacto (más barato para tabletas justas).
 *
 * Los gestos de un solo golpe (saludo, animo, celebra, despedida, pensando) vuelven solos a 'espera'.
 * 'habla' y 'explica' se mantienen hasta que se pida otro estado. 'habla' ya mueve la boca por sí solo.
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

  // ---------------------------------------------------------------- utilidades numéricas
  function lim01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function suave(x) { x = lim01(x); return x * x * (3 - 2 * x); }
  function rampa(t, a, b) { return suave((t - a) / (b - a)); }
  function campana(t, a, b) { return (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a)); }
  function meseta(t, a, b, c, d) { return rampa(t, a, b) * (1 - rampa(t, c, d)); }
  function onda(t, hz, fase) { return Math.sin(2 * Math.PI * hz * t + (fase || 0)); }
  function lerp(a, b, w) { return a + (b - a) * w; }
  function mezclarEn(P, Q, w) { if (w <= 0) return; for (var k in Q) P[k] = lerp(P[k], Q[k], w); }

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
  function color(hex) { return new THREE.Color(hex); }       // en espacio lineal (gestión de color activa)

  function matriz(p, r, s) {
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r ? r[0] : 0) * G, (r ? r[1] : 0) * G, (r ? r[2] : 0) * G));
    var e = s == null ? [1, 1, 1] : (typeof s === 'number' ? [s, s, s] : s);
    return new THREE.Matrix4().compose(new V3(p[0], p[1], p[2]), q, new V3(e[0], e[1], e[2]));
  }
  // matriz con el eje largo (z local) a lo largo de «dir» y la normal (y local) según «arriba»
  function matrizEjes(pos, dir, arriba, esc) {
    var z = dir.clone().normalize(), x = new V3().crossVectors(arriba, z).normalize(), y = new V3().crossVectors(z, x);
    var m = new THREE.Matrix4().makeBasis(x, y, z);
    m.scale(new V3(esc[0], esc[1], esc[2]));
    m.setPosition(pos);
    return m;
  }

  // Normales suaves también en las costuras (esferas, tornos): promedia vértices que coinciden.
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
    for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
    return suavizar(geo);
  }
  // color por vértice: hex fijo o función (posición, colorSalida)
  function pintar(geo, c) {
    var p = geo.attributes.position, arr = new Float32Array(p.count * 3), v = new V3(), out = new THREE.Color();
    var fijo = typeof c === 'function' ? null : color(c);
    for (var i = 0; i < p.count; i++) {
      if (fijo) out.copy(fijo); else { v.fromBufferAttribute(p, i); c(v, out); }
      arr[i * 3] = out.r; arr[i * 3 + 1] = out.g; arr[i * 3 + 2] = out.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  // Fusiona piezas [geo, matriz?, color?] en una sola geometría con color por vértice.
  function fusionar(partes) {
    var pos = [], nor = [], col = [], idx = [], base = 0, v = new V3(), nm = new THREE.Matrix3();
    partes.forEach(function (pt) {
      var g = pt[0], m = pt[1] || new THREE.Matrix4();
      if (!g.attributes.color) pintar(g, pt[2] != null ? pt[2] : 0xffffff);
      var gp = g.attributes.position, gn = g.attributes.normal, gc = g.attributes.color, i;
      nm.getNormalMatrix(m);
      for (i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(gc.getX(i), gc.getY(i), gc.getZ(i));
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
    out.setIndex(idx);
    out.computeBoundingSphere();
    return out;
  }
  function esfera(w, h) { return new THREE.SphereGeometry(1, w || 16, h || 12); }
  function capsula(r, l, rad) { return new THREE.CapsuleGeometry(r, l, 4, rad || 12); }
  function cilindro(rt, rb, h, rad, abierto) { return new THREE.CylinderGeometry(rt, rb, h, rad || 16, 1, !!abierto); }
  function toro(R, t, rs, ts, arco) { return new THREE.TorusGeometry(R, t, rs || 8, ts || 24, arco || Math.PI * 2); }
  function torno(perfil, seg, sz) {
    var g = new THREE.LatheGeometry(perfil.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg || 28);
    g.scale(1, 1, sz || 1);
    return suavizar(g);
  }
  function tubo(puntos, r, seg) {
    var curva = new THREE.CatmullRomCurve3(puntos.map(function (p) { return new V3(p[0], p[1], p[2]); }));
    return new THREE.TubeGeometry(curva, seg || 12, r, 6, false);
  }
  // generador pseudoaleatorio con semilla (el pelo sale siempre igual)
  function azar(semilla) { var s = semilla; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  // textura de la sombra de contacto (disco difuminado dibujado en un canvas 2D)
  function texturaSombra() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.45, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    return t;
  }

  // ---------------------------------------------------------------- taller: materiales compartidos
  function Taller(sombras) { this.mats = {}; this.geos = []; this.mallas = 0; this.tris = 0; this.sombras = sombras; }
  Taller.prototype.mat = function (tipo) {
    if (this.mats[tipo]) return this.mats[tipo];
    var m, P = THREE.MeshPhysicalMaterial, S = THREE.MeshStandardMaterial;
    switch (tipo) {
      // piel: un leve emisivo cálido imita la luz que atraviesa la piel y evita sombras grises (efecto «barba»)
      case 'piel': m = new P({ vertexColors: true, roughness: 0.55, sheen: 0.25, sheenRoughness: 0.5, sheenColor: color(0xFFD9C9), emissive: color(0x3A1C10), emissiveIntensity: 0.55 }); break;
      case 'parpado': m = new P({ vertexColors: true, roughness: 0.55, sheen: 0.25, sheenRoughness: 0.5, sheenColor: color(0xFFD9C9), emissive: color(0x3A1C10), emissiveIntensity: 0.55, side: THREE.DoubleSide }); break;
      case 'tela': m = new P({ vertexColors: true, roughness: 0.85, sheen: 0.5, sheenRoughness: 0.75, sheenColor: color(0xFFFFFF) }); break;
      case 'brillo': m = new S({ vertexColors: true, roughness: 0.42 }); break;
      case 'pelo': m = new P({ vertexColors: true, roughness: 0.5, sheen: 0.35, sheenRoughness: 0.4, sheenColor: color(0xFFE2C4) }); break;
      case 'ojo': m = new S({ vertexColors: true, roughness: 0.16 }); break;
      case 'boca': m = new S({ vertexColors: true, roughness: 0.6 }); break;
      case 'metal': m = new S({ vertexColors: true, roughness: 0.3, metalness: 0.75 }); break;
      case 'papel': m = new S({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }); break;
      case 'cristal': m = new S({ color: 0xEAF6FF, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }); break;
      case 'brillito': m = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }); break;
    }
    this.mats[tipo] = m;
    return m;
  };
  Taller.prototype.malla = function (geo, tipo, padre, proyecta, recibe) {
    this.geos.push(geo);
    var m = new THREE.Mesh(geo, this.mat(tipo));
    if (this.sombras) { m.castShadow = !!proyecta; m.receiveShadow = recibe !== false && !!proyecta; }
    padre.add(m);
    this.mallas++;
    this.tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    return m;
  };
  Taller.prototype.liberar = function () {
    this.geos.forEach(function (g) { g.dispose(); });
    for (var k in this.mats) this.mats[k].dispose();
  };
  function grupo(padre, x, y, z) { var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (padre) padre.add(g); return g; }

  // ---------------------------------------------------------------- cabeza
  // Esfera deformada: cráneo redondo, mandíbula más estrecha, mofletes llenos.
  function formaCabeza(d, c) {
    var x = d.x, y = d.y, z = d.z;
    var bajo = suave((0.15 - y) / 1.05);
    x *= 1 - c.mand * bajo * bajo;
    z *= z > 0 ? 1 - 0.05 * bajo : 1 - 0.3 * bajo;
    if (z < 0) z *= 1 + 0.07 * (1 - bajo);
    var mej = Math.exp(-((y + 0.32) * (y + 0.32)) / 0.05) * Math.max(0, z);
    x *= 1 + 0.06 * mej;
    if (y < -0.5) y = -0.5 + (y + 0.5) * 0.8;            // barbilla algo más corta
    return new V3(x * c.ancho * c.R, y * c.alto * c.R, z * c.fondo * c.R);
  }

  // Punto de la superficie de la cara en (x, y) (coordenadas de la cabeza) y su normal.
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
      for (var it = 0; it < 30; it++) {           // refinado local
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
    var mej = [new V3(0.5, -0.3, 0.81).normalize(), new V3(-0.5, -0.3, 0.81).normalize()];
    var gc = esfera(48, 36);
    pintar(gc, function (v, out) {
      var w = 0;
      mej.forEach(function (m) { w = Math.max(w, Math.exp(-v.distanceToSquared(m) / 0.035)); });
      out.copy(piel).lerp(rubor, 0.45 * w);
    });
    deformar(gc, function (v) { v.copy(formaCabeza(v.clone().normalize(), c)); });
    var cara = buscadorCara(c);
    r.cara.userData.buscar = cara;
    var nariz = cara(0, cfg.nariz.y), puente = cara(0, cfg.nariz.y + 0.017);
    var partes = [[gc]];
    partes.push([esfera(16, 12), matriz(nariz.pos.clone().addScaledVector(nariz.n, 0.004).toArray(), [-12, 0, 0], cfg.nariz.esc), col.nariz]);
    partes.push([esfera(12, 10), matriz(puente.pos.clone().addScaledVector(puente.n, -0.0035).toArray(), [-25, 0, 0], [0.0055, 0.012, 0.005]), col.piel]);
    [1, -1].forEach(function (s) {
      var ox = s * (c.R * c.ancho * 0.94), oy = cfg.oreja.y;
      partes.push([esfera(16, 12), matriz([ox, oy, -0.01], [0, s * 62, s * -8], [0.015, 0.024, 0.008]), col.piel]);
      partes.push([esfera(12, 10), matriz([ox + s * 0.004, oy - 0.001, -0.006], [0, s * 62, s * -8], [0.009, 0.016, 0.004]), col.rubor2]);
    });
    T.malla(fusionar(partes), 'piel', r.cara, true);
    construirOjos(T, r, cfg, cara);
    construirCejas(T, r, cfg, cara);
    r.boca = new Boca(T, r.cara, cfg, cara);
  }

  // ---------------------------------------------------------------- ojos (esclerótica, iris, pupila, párpados)
  function construirOjos(T, r, cfg, cara) {
    var o = cfg.ojo, iris = color(o.iris), irisOsc = color(o.iris).multiplyScalar(0.45), irisClaro = color(o.irisClaro);
    var blanco = color(0xF4F1EC), pupila = color(0x0E0A08);
    r.ojos = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var sup = cara(s * o.x, o.y);
      var base = grupo(r.cara);
      base.position.copy(sup.pos).addScaledVector(sup.n, -o.r * 0.42);
      var mira = new V3(s * 0.12, 0.02, 1).normalize();
      base.quaternion.setFromUnitVectors(new V3(0, 0, 1), mira);
      // globo ocular con el polo hacia delante: los anillos del iris quedan como círculos limpios
      var ge = new THREE.SphereGeometry(1, 26, 22); ge.rotateX(Math.PI / 2);
      pintar(ge, function (v, out) {
        var a = Math.acos(Math.max(-1, Math.min(1, v.z))) / G;
        if (a < o.pupila) out.copy(pupila);
        else if (a < o.irisA) {
          var u = (a - o.pupila) / (o.irisA - o.pupila);
          out.copy(irisClaro).lerp(iris, suave(u * 1.6)).lerp(irisOsc, suave((u - 0.7) / 0.3));
        } else out.copy(blanco).lerp(color(0xEADBD3), suave((a - 70) / 40));
      });
      ge.scale(o.r, o.r, o.r);
      var globo = grupo(base);
      T.malla(ge, 'ojo', globo, false);
      // brillo fijo (arriba a la izquierda, del lado de la luz clave)
      var gb = esfera(8, 6); gb.scale(o.r * 0.17, o.r * 0.17, o.r * 0.08);
      var br = T.malla(pintar(gb, 0xffffff), 'brillito', base, false);
      br.position.set(-o.r * 0.32, o.r * 0.36, o.r * 0.94);
      // párpado superior con la línea de pestañas (una sola malla)
      var sup1 = new THREE.SphereGeometry(o.r * 1.09, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      pintar(sup1, col(cfg.color.parpado));
      var lin = toro(o.r * 1.1, o.r * 0.13, 6, 20, Math.PI); lin.rotateX(Math.PI / 2);
      lin.scale(1, 0.7, 1);
      var parpS = grupo(base);
      T.malla(fusionar([[sup1], [lin, null, cfg.color.pestana]]), 'parpado', parpS, false, true);
      var inf = new THREE.SphereGeometry(o.r * 1.06, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      var parpI = grupo(base);
      T.malla(pintar(inf, cfg.color.parpado), 'parpado', parpI, false, true);
      // ojo feliz: no hay malla extra; se cierra con párpados (sube el inferior, baja el superior)
      r.ojos[lado] = { globo: globo, sup: parpS, inf: parpI, brillo: br };
    });
    function col(h) { return h; }
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
      var g = new THREE.TorusGeometry(R, cfg.ceja.grosor, 6, 14, arco);
      g.rotateZ(Math.PI / 2 - arco / 2); g.translate(0, -R, 0); g.scale(1, 1, 0.55);
      // más gruesa por dentro que por fuera
      deformar(g, function (v) { var k = 1 + 0.35 * (-s * v.x / 0.016); v.y *= 1; v.z *= Math.max(0.5, k); });
      var ce = grupo(base);
      var m = T.malla(pintar(g, cfg.color.ceja), 'pelo', ce, false);
      m.rotation.z = s * -4 * G;
      r.cejas[lado] = ce;
    });
  }

  // ---------------------------------------------------------------- boca paramétrica (labios + interior)
  function Boca(T, padre, cfg, cara) {
    var sup = cara(0, cfg.boca.y);
    this.base = grupo(padre);
    this.base.position.copy(sup.pos).addScaledVector(sup.n, 0.0015);
    this.base.quaternion.setFromUnitVectors(new V3(0, 0, 1), sup.n);
    this.cfg = cfg.boca;
    this.N = 13; this.M = 6; this.L = 2 * (this.N - 1); this.K = 11;
    var L = this.L, M = this.M, K = this.K, i, j;
    // labios: tubo cerrado alrededor de la boca
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
    // interior: dientes, fondo oscuro y lengua en bandas
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
    var c = this.cfg, w = c.ancho * (1 - 0.42 * p.O);
    var x = u * w + p.lado, q = Math.sqrt(Math.max(0, 1 - u * u));
    var ys = p.sonr * c.curva * u * u - p.sonr * c.curva * 0.25 + p.torc * 0.004 * u;
    var h = p.abre * c.alto * (1 - 0.3 * p.O) + p.O * c.alto * 0.45;
    return { x: x, yU: ys + h * (0.22 + 0.3 * p.O) * q, yL: ys - h * (0.78 - 0.1 * p.O) * q, z: -(x * x) / (2 * c.curvatura) };
  };
  Boca.prototype.actualizar = function (p) {
    var clave = [p.abre, p.sonr, p.O, p.lado, p.torc].map(function (v) { return Math.round(v * 400); }).join(',');
    if (clave === this.clave) return;
    this.clave = clave;
    var N = this.N, M = this.M, L = this.L, K = this.K, c = this.cfg, i, j;
    // bucle: labio de arriba de izquierda a derecha y el de abajo de vuelta
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
    // interior
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

  // ---------------------------------------------------------------- pelo (casquete + mechones)
  function dirAzEl(az, el) { return new V3(Math.cos(el * G) * Math.sin(az * G), Math.sin(el * G), Math.cos(el * G) * Math.cos(az * G)); }
  // Línea del pelo: elevación (grados) en función del azimut (0 delante, ±90 orejas, 180 nuca).
  function curvaPelo(claves) {
    return function (az) {
      az = Math.abs(((az + 540) % 360) - 180);
      for (var i = 0; i < claves.length - 1; i++) {
        if (az <= claves[i + 1][0]) return lerp(claves[i][1], claves[i + 1][1], suave((az - claves[i][0]) / (claves[i + 1][0] - claves[i][0])));
      }
      return claves[claves.length - 1][1];
    };
  }
  // Punto sobre la capa de pelo en una dirección (con el grosor del pelo) y su normal aproximada.
  function puntoPelo(cfg, az, el, extra) {
    var base = formaCabeza(dirAzEl(az, el), cfg.cab), n = base.clone().normalize();
    var gro = cfg.pelo.grosor + cfg.pelo.volumen * Math.max(0, Math.sin(el * G)) + (extra || 0);
    return { p: base.addScaledVector(n, gro), n: n };
  }
  // Tubo que sigue una curva con radio variable (mechones, coletas, tupé): sin «salchichas».
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
    return function (t) { return t < pico ? lerp(r0, rMax, suave(t / pico)) : rMax * Math.pow(Math.max(0, 1 - (t - pico) / (1 - pico)), 0.8) + 0.0004; };
  }
  // Mechón pegado a la cabeza: de [az, el] a [az, el], pasando opcionalmente por un punto medio.
  function mechonSup(cfg, m) {
    var pts = [], n = 7, ruta = m.medio ? [m.de, m.medio, m.a] : [m.de, m.a];
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1), az, el;
      if (ruta.length === 3) {
        var u = t * 2, a = u < 1 ? ruta[0] : ruta[1], b = u < 1 ? ruta[1] : ruta[2], w = u < 1 ? u : u - 1;
        az = lerp(a[0], b[0], w); el = lerp(a[1], b[1], w);
      } else { az = lerp(ruta[0][0], ruta[1][0], t); el = lerp(ruta[0][1], ruta[1][1], t); }
      var alza = lerp(m.alza ? m.alza[0] : 0, m.alza ? m.alza[1] : 0, t * t);
      var pp = puntoPelo(cfg, az, el, m.r * 0.15 + alza);
      pts.push(pp.p);
    }
    var g = tuboVariable(pts, perfilMechon(m.r * 0.6, m.r, 0.25), 14, 7);
    return [g, null, m.color || cfg.pelo.color];
  }

  function construirPelo(T, r, cfg) {
    var p = cfg.pelo, linea = curvaPelo(p.linea), c = cfg.cab;
    var cas = new THREE.SphereGeometry(1, 48, 34);
    var pos = cas.attributes.position, v = new V3(), cols = new Float32Array(pos.count * 3), cb = color(p.color), cl = color(p.claro), tmp = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var az = Math.atan2(v.x, v.z) / G, el = Math.asin(Math.max(-1, Math.min(1, v.y))) / G, h = linea(az), gro;
      // por debajo de la línea del pelo los vértices se pegan a la línea y se meten bajo la piel:
      // el borde queda liso aunque la malla sea de baja resolución
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
    p.mechones.forEach(function (m) { partes.push(mechonSup(cfg, m)); });
    T.malla(fusionar(partes), 'pelo', r.cara, true);
  }

  // ---------------------------------------------------------------- brazos y manos
  function construirBrazos(T, r, cfg) {
    var b = cfg.brazo, col = cfg.color;
    r.brazos = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var hombro = grupo(r.cuerpo, s * b.hombroX, b.hombroY, 0); hombro.rotation.order = 'ZXY';
      var codo = grupo(hombro, 0, -b.L1, 0); codo.rotation.order = 'ZXY';
      var mun = grupo(codo, 0, -b.L2, 0); mun.rotation.order = 'YXZ';
      // brazo (manga)
      var g1 = capsula(b.r1, b.L1 - 0.01, 12); g1.translate(0, -b.L1 / 2, 0);
      var partesB = [[esfera(16, 12), matriz([0, -0.004, 0], null, b.rHombro), b.mangaLarga ? col.sudadera : col.camiseta]];
      if (b.mangaLarga) partesB.push([g1, null, col.sudadera]);
      else {
        partesB.push([g1, null, col.piel]);
        partesB.push([cilindro(b.rHombro * 0.98, b.rHombro * 0.92, 0.05, 16, true), matriz([0, -0.022, 0]), col.camiseta]);
        partesB.push([toro(b.rHombro * 0.92, 0.0045, 6, 20), matriz([0, -0.047, 0], [90, 0, 0]), col.camisetaOsc]);
      }
      if (b.mangaLarga) {
        // manga: los tramos con tela van con material de tela y la piel aparte (aquí todo es tela)
        T.malla(fusionar(partesB), 'tela', hombro, true);
      } else {
        // manga corta: tela + brazo de piel en mallas separadas para que cada una tenga su material
        T.malla(fusionar([partesB[0], partesB[2], partesB[3]]), 'tela', hombro, true);
        T.malla(fusionar([partesB[1]]), 'piel', hombro, true);
      }
      // antebrazo
      var g2 = capsula(b.r2, b.L2 - 0.012, 12); g2.translate(0, -b.L2 / 2, 0);
      deformar(g2, function (v) { var k = lerp(1.0, 0.78, lim01(-v.y / b.L2)); v.x *= k; v.z *= k * 0.92; });
      if (b.mangaLarga) {
        T.malla(fusionar([[g2, null, col.sudadera], [toro(b.r2 + 0.002, 0.0062, 8, 22), matriz([0, -b.L2 + 0.012, 0], [90, 0, 0]), col.sudaderaOsc]]), 'tela', codo, true);
      } else {
        T.malla(fusionar([[g2, null, col.piel]]), 'piel', codo, true);
      }
      // mano: palma + índice + tres dedos juntos + pulgar
      var gp = esfera(18, 14);
      deformar(gp, function (v) {
        var y = v.y; v.x *= 0.022 * (1 + 0.15 * (-y)); v.y *= 0.027; v.z *= 0.0105 * (1 - 0.25 * Math.max(0, y)); v.y -= 0.028;
      });
      T.malla(pintar(gp, col.piel), 'piel', mun, true);
      var nud = -0.05;
      var ind = grupo(mun, s * 0.0135, nud, 0);
      var gi = capsula(0.0058, 0.02, 8); gi.translate(0, -0.0158, 0);
      T.malla(pintar(gi, col.piel), 'piel', ind, true);
      var tres = grupo(mun, 0, nud, 0);
      T.malla(fusionar([
        [capsula(0.0058, 0.023, 8), matriz([s * 0.0035, -0.0175, 0]), col.piel],
        [capsula(0.0055, 0.02, 8), matriz([-s * 0.006, -0.016, 0]), col.piel],
        [capsula(0.005, 0.015, 8), matriz([-s * 0.0148, -0.013, 0]), col.piel]
      ]), 'piel', tres, true);
      var pul = grupo(mun, s * 0.019, -0.014, 0.004);
      var gpu = capsula(0.0066, 0.018, 8); gpu.translate(0, -0.015, 0);
      T.malla(pintar(gpu, col.piel), 'piel', pul, true);
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
      var s = lado === 'l' ? 1 : -1;
      var cadera = grupo(r.cuerpo, s * p.caderaX, p.caderaY, 0);
      var rodilla = grupo(cadera, 0, -p.L1, 0);
      var tobillo = grupo(rodilla, 0, -p.L2, 0);
      // muslo: pernera (tela) + muslo de piel
      T.malla(fusionar([
        [cilindro(p.rPernera, p.rPernera * 1.06, p.largoPernera, 18, true), matriz([0, -p.largoPernera / 2 + 0.01, 0]), col.pantalon],
        [toro(p.rPernera * 1.06, 0.0045, 6, 22), matriz([0, -p.largoPernera + 0.01, 0], [90, 0, 0]), col.pantalonOsc],
        [cilindro(p.rPernera * 0.97, p.rPernera * 0.97, 0.01, 18), matriz([0, -0.002, 0]), col.pantalon]
      ]), 'tela', cadera, true);
      var gm = capsula(p.rMuslo, p.L1 - 0.02, 12); gm.translate(0, -p.L1 / 2, 0);
      deformar(gm, function (v) { var k = lerp(1.0, 0.86, lim01(-v.y / p.L1)); v.x *= k; v.z *= k; });
      var gr = esfera(12, 10); gr.scale(p.rPierna * 0.92, p.rPierna * 0.9, p.rPierna * 0.92);
      T.malla(fusionar([[gm, null, col.piel], [gr, matriz([0, -p.L1 + 0.004, 0.002]), col.piel]]), 'piel', cadera, true);
      // espinilla
      var gs = capsula(p.rPierna, p.L2 - 0.02, 12); gs.translate(0, -p.L2 / 2 + 0.008, 0);
      deformar(gs, function (v) {
        var t = lim01(-v.y / p.L2), k = lerp(0.98, 0.7, t) * (1 + 0.14 * Math.exp(-(t - 0.3) * (t - 0.3) / 0.02));
        v.x *= k; v.z *= v.z < 0 ? k * 1.06 : k * 0.95;
      });     // gemelo y tobillo
      T.malla(pintar(gs, col.piel), 'piel', rodilla, true);
      T.malla(calzado(s), 'brillo', tobillo, true);
      r.piernas[lado] = { cadera: cadera, rodilla: rodilla, tobillo: tobillo };
    });
  }

  function zapatilla(col) {
    return function () {
      var g = esfera(24, 16);
      deformar(g, function (v) {
        var del = Math.max(0, v.z);
        v.x *= 0.034 * (1 + 0.1 * del); v.y *= 0.028 * (1 - 0.35 * del); v.z *= 0.068;
        if (v.y < -0.012) v.y = -0.012 + (v.y + 0.012) * 0.3;
        v.y += -0.026; v.z += 0.022;
      });
      pintar(g, function (v, out) { out.copy(color(v.y < -0.033 ? col.suela : (Math.abs(v.y + 0.026) < 0.004 && v.x > 0.02 ? col.franja : col.zapatilla))); });
      var suela = esfera(20, 10);
      deformar(suela, function (v) { v.x *= 0.037; v.y *= 0.008; v.z *= 0.072; v.y -= 0.045; v.z += 0.022; });
      var cal = cilindro(0.031, 0.032, 0.03, 16, true);
      var borde = toro(0.031, 0.004, 6, 18);
      return fusionar([[g], [suela, null, col.suela],
        [cal, matriz([0, 0.008, 0]), col.calcetin], [borde, matriz([0, 0.022, 0], [90, 0, 0]), col.calcetin],
        [toro(0.03, 0.0035, 6, 18, Math.PI), matriz([0, -0.008, 0.02], [90, 0, 0], [0.9, 1, 1]), col.franja]]);
    };
  }
  function bota(col) {
    return function () {
      var cana = cilindro(0.038, 0.035, 0.085, 18);
      var pie = esfera(24, 16);
      deformar(pie, function (v) {
        var del = Math.max(0, v.z);
        v.x *= 0.035 * (1 + 0.08 * del); v.y *= 0.028 * (1 - 0.3 * del); v.z *= 0.066;
        if (v.y < -0.01) v.y = -0.01 + (v.y + 0.01) * 0.3;
        v.y += -0.026; v.z += 0.02;
      });
      var suela = esfera(20, 10);
      deformar(suela, function (v) { v.x *= 0.038; v.y *= 0.009; v.z *= 0.07; v.y -= 0.045; v.z += 0.02; });
      return fusionar([[cana, matriz([0, 0.012, 0]), col.bota], [pie, null, col.bota], [suela, null, col.botaSuela],
        [toro(0.039, 0.005, 6, 20), matriz([0, 0.054, 0], [90, 0, 0]), col.botaSuela]]);
    };
  }

  // ---------------------------------------------------------------- NICO
  var NICO = {
    quien: 'nico', giroBase: 14, manoSaludo: 'r',
    cuelloY: 0.754, craneoY: 0.85,
    cab: { R: 0.105, ancho: 0.93, alto: 1.0, fondo: 1.0, mand: 0.22 },
    ojo: { x: 0.036, y: -0.013, r: 0.0192, iris: 0x6B4426, irisClaro: 0xA8773F, irisA: 41, pupila: 17 },
    ceja: { x: 0.039, y: 0.023, grosor: 0.0046 },
    nariz: { y: -0.041, esc: [0.0092, 0.008, 0.0085] },
    oreja: { y: -0.012 },
    boca: { y: -0.066, ancho: 0.024, alto: 0.026, curva: 0.0075, curvatura: 0.055, labioSup: 0.003, labioInf: 0.004 },
    brazo: { hombroX: 0.1, hombroY: 0.702, L1: 0.14, L2: 0.125, r1: 0.034, r2: 0.03, rHombro: 0.034, mangaLarga: true },
    pierna: { caderaX: 0.051, caderaY: 0.455, L1: 0.2, L2: 0.2, rPernera: 0.056, largoPernera: 0.12, rMuslo: 0.044, rPierna: 0.037 },
    mapaW: 0.12,
    color: {
      piel: 0xE3AE86, rubor: 0xE9897A, rubor2: 0xCC8A70, nariz: 0xE0A27F, parpado: 0xE3AE86, pestana: 0x2E1C14,
      labios: 0xB86A5C, ceja: 0x4A2A18,
      sudadera: 0x3FA55B, sudaderaOsc: 0x2F8A49, pantalon: 0x2C6A45, pantalonOsc: 0x235A3A,
      mochila: 0xFF8A3D, mochilaOsc: 0xE0702A, zapatilla: 0xFFF6E8, suela: 0xD9D2C6, franja: 0xFF8A3D, calcetin: 0xFFFFFF,
      oro: 0xE2B23C, esfera: 0xFFF6E8, aguja: 0xE23B3B, mapa: 0xF2DCA6, hoja: 0xF8EBC6, cinta: 0xE23B3B, cordon: 0x5A3A22
    },
    pelo: {
      color: 0x5A3420, claro: 0x74462A, grosor: 0.008, volumen: 0.008,
      linea: [[0, 42], [35, 36], [58, 14], [68, 2], [76, 18], [100, 16], [130, -10], [180, -40]],
      // pelo corto despeinado: mechones que salen de la coronilla y levantan un poco la punta
      mechones: (function () {
        var m = [], rnd = azar(11);
        [-160, -125, -95, -68, -40, 40, 68, 95, 125, 160, 180].forEach(function (az, i) {
          var a = Math.abs(az), fin = a < 50 ? 48 : a < 110 ? 26 : a < 150 ? 8 : -12;
          m.push({ de: [az * 0.3, 84], medio: [az * 0.8, (84 + fin) / 2 + 6], a: [az + (rnd() - 0.5) * 24, fin],
                   r: 0.013 + rnd() * 0.004, alza: [0, 0.006 + rnd() * 0.01], color: i % 2 ? 0x74462A : 0x5A3420 });
        });
        m.push({ de: [-20, 70], a: [-34, 46], r: 0.013, alza: [0, 0.012] });
        m.push({ de: [24, 72], a: [34, 47], r: 0.012, alza: [0, 0.011], color: 0x74462A });
        return m;
      })()
    }
  };

  function construirNico(T, r) {
    var c = NICO, col = c.color;
    construirCabeza(T, r, c);
    construirPelo(T, r, c);
    // tupé: mechones gruesos que suben hacia arriba y adelante desde la frente (con rebote)
    var pie = puntoPelo(c, 0, 44).p;
    r.tupe = grupo(r.cara, pie.x, pie.y, pie.z);
    function rizo(dx, esc, rMax, inclina) {
      var pts = [[dx * 0.3, -0.014, -0.024], [dx * 0.6, 0.006, -0.006], [dx, 0.03, 0.004], [dx * 1.15, 0.048, 0.02], [dx * 1.1, 0.054, 0.036 + inclina]]
        .map(function (p) { return new V3(p[0], p[1] * esc, p[2] * esc); });
      return tuboVariable(pts, perfilMechon(0.012, rMax, 0.3), 16, 9);
    }
    T.malla(fusionar([[rizo(0, 1, 0.024, 0), null, c.pelo.color], [rizo(-0.019, 0.82, 0.018, -0.004), null, c.pelo.claro],
      [rizo(0.018, 0.78, 0.017, -0.006), null, c.pelo.claro]]), 'pelo', r.tupe, true);

    // cuello
    T.malla(pintar(cilindro(0.04, 0.043, 0.09, 16), c.color.piel), 'piel', r.cuerpo, true, false).position.y = 0.75;
    // sudadera (torso, bolsillo canguro, capucha, puño de cintura, cuello) + pantalón corto + cordón de la brújula
    var tor = torno([[0, 0.488], [0.087, 0.488], [0.097, 0.5], [0.1, 0.53], [0.098, 0.57], [0.099, 0.61], [0.104, 0.65], [0.106, 0.68], [0.1, 0.703], [0.082, 0.722], [0.052, 0.736], [0.034, 0.74], [0, 0.74]], 28, 0.67);
    pintar(tor, col.sudadera);
    r.torso = T.malla(fusionar([
      [tor],
      [toro(0.098, 0.009, 8, 32), matriz([0, 0.497, 0], [90, 0, 0], [1, 0.68, 1]), col.sudaderaOsc],
      [toro(0.036, 0.0075, 8, 24), matriz([0, 0.737, 0.004], [96, 0, 0], [1, 0.85, 1]), col.sudaderaOsc],
      [esfera(20, 12), matriz([0, 0.565, 0.058], [-6, 0, 0], [0.062, 0.036, 0.014]), col.sudaderaOsc],
      [esfera(20, 12), matriz([0, 0.735, -0.05], [20, 0, 0], [0.068, 0.028, 0.036]), col.sudadera],
      [toro(0.039, 0.0018, 4, 24), matriz([0, 0.742, 0.008], [100, 0, 0], [1, 0.95, 1]), col.cordon],
      [tubo([[0, 0.742, 0.042], [0, 0.71, 0.066], [0, 0.676, 0.072]], 0.0017, 6), null, col.cordon],
      [torno([[0, 0.43], [0.074, 0.43], [0.094, 0.45], [0.099, 0.48], [0.096, 0.51], [0, 0.51]], 24, 0.72), null, col.pantalon],
      [toro(0.099, 0.004, 6, 30), matriz([0, 0.47, 0], [90, 0, 0], [1, 0.71, 1]), col.pantalonOsc]
    ]), 'tela', r.cuerpo, true);
    r.torso.geometry.translate(0, -0.6, 0); r.torso.position.y = 0.6;      // pivote a media altura para respirar

    // mochila redonda + tirantes (naranja, algo brillante)
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
    // brújula colgada: caja dorada + esfera con aguja
    var bru = grupo(r.cuerpo, 0, 0.66, 0.072); bru.rotation.x = -10 * G;
    var gcaja = cilindro(0.019, 0.019, 0.008, 24); gcaja.rotateX(Math.PI / 2);
    T.malla(fusionar([[gcaja, null, col.oro], [toro(0.019, 0.0022, 6, 24), matriz([0, 0, 0.004]), col.oro], [toro(0.004, 0.0014, 6, 12), matriz([0, 0.021, 0]), col.oro]]), 'metal', bru, true);
    var gesf = cilindro(0.0155, 0.0155, 0.002, 24); gesf.rotateX(Math.PI / 2);
    var gag = new THREE.ConeGeometry(0.0028, 0.022, 4); gag.scale(1, 1, 0.3);
    T.malla(fusionar([[gesf, matriz([0, 0, 0.0042]), col.esfera], [gag, matriz([0, 0.004, 0.0056], [0, 0, -25]), col.aguja]]), 'brillo', bru, false);

    construirBrazos(T, r, c);
    construirPiernas(T, r, c, zapatilla(col));

    // mapa enrollado en la mano derecha (izquierda de la pantalla), se despliega al pensar
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
    // el mapa se orienta en el mundo: enrollado y derecho, o abierto y de cara a cámara
    r.raiz.updateMatrixWorld(true);
    var inv = r.mapa.parent.getWorldQuaternion(_qa).invert();
    _qb.setFromEuler(_eu.set(8 * G, 0, 12 * G));
    _qc.setFromEuler(_eu.set(-6 * G, 8 * G, 0));
    _qb.slerp(_qc, suave(m));
    r.mapa.quaternion.copy(inv).multiply(_qb);
  }

  // ---------------------------------------------------------------- ALBA
  var ALBA = {
    quien: 'alba', giroBase: -10, manoSaludo: 'l',
    cuelloY: 0.752, craneoY: 0.848,
    cab: { R: 0.103, ancho: 0.95, alto: 1.0, fondo: 1.0, mand: 0.24 },
    ojo: { x: 0.036, y: -0.014, r: 0.0192, iris: 0x4E7D46, irisClaro: 0x9DB062, irisA: 41, pupila: 17 },
    ceja: { x: 0.039, y: 0.022, grosor: 0.0038 },
    nariz: { y: -0.042, esc: [0.0085, 0.0075, 0.008] },
    oreja: { y: -0.012 },
    boca: { y: -0.066, ancho: 0.023, alto: 0.026, curva: 0.0075, curvatura: 0.055, labioSup: 0.0033, labioInf: 0.0043 },
    brazo: { hombroX: 0.1, hombroY: 0.703, L1: 0.138, L2: 0.123, r1: 0.031, r2: 0.0275, rHombro: 0.037, mangaLarga: false },
    pierna: { caderaX: 0.05, caderaY: 0.455, L1: 0.2, L2: 0.2, rPernera: 0.054, largoPernera: 0.09, rMuslo: 0.041, rPierna: 0.035 },
    color: {
      piel: 0xF0BE98, rubor: 0xF08A80, rubor2: 0xDB9278, nariz: 0xEDB08F, parpado: 0xF0BE98, pestana: 0x2E1C14,
      labios: 0xC96A64, ceja: 0x7A3818,
      camiseta: 0xFFC83D, camisetaOsc: 0xEBAE22, peto: 0xE8502F, petoOsc: 0xC9401F, pantalon: 0xE8502F, pantalonOsc: 0xC9401F,
      boton: 0xFFC83D, bota: 0x7B5CD6, botaSuela: 0x5A3FB0, morado: 0x7B5CD6, coletero: 0xFFC83D
    },
    pelo: {
      color: 0x9B4A22, claro: 0xB0592A, grosor: 0.006, volumen: 0.005,
      linea: [[0, 40], [40, 32], [65, 16], [85, 10], [110, 2], [140, -18], [180, -36]],
      mechones: (function () {
        // pelo recogido: mechones que van de la raya hacia cada coleta
        var m = [];
        [1, -1].forEach(function (s) {
          var tie = [s * 108, 22];
          m.push({ de: [22, 86], medio: [s * 62, 58], a: tie, r: 0.012 });
          m.push({ de: [s * 40, 72], medio: [s * 82, 46], a: tie, r: 0.011, color: 0xB0592A });
          m.push({ de: [s * 150, 62], medio: [s * 128, 40], a: tie, r: 0.012 });
          m.push({ de: [s * 178, 25], medio: [s * 145, 18], a: tie, r: 0.012, color: 0xB0592A });
          m.push({ de: [s * 75, 12], medio: [s * 92, 16], a: tie, r: 0.01 });
        });
        return m;
      })()
    }
  };

  function construirAlba(T, r) {
    var c = ALBA, col = c.color;
    construirCabeza(T, r, c);
    construirPelo(T, r, c);
    // flequillo de lado: mechones que salen de la raya y caen hacia su derecha (izquierda de la pantalla)
    T.malla(fusionar([
      mechonSup(c, { de: [24, 70], medio: [2, 50], a: [-42, 30], r: 0.015, alza: [0, 0.002] }),
      mechonSup(c, { de: [30, 62], medio: [10, 44], a: [-22, 28], r: 0.014, alza: [0, 0.002], color: c.pelo.claro }),
      mechonSup(c, { de: [18, 76], medio: [-12, 54], a: [-62, 34], r: 0.014, alza: [0, 0.002] }),
      mechonSup(c, { de: [36, 56], medio: [24, 42], a: [4, 31], r: 0.012, alza: [0, 0.002], color: c.pelo.claro }),
      mechonSup(c, { de: [44, 50], a: [26, 34], r: 0.011, alza: [0, 0.001] })
    ]), 'pelo', r.cara, true);
    // coletas: goma amarilla + mechones gruesos que salen hacia fuera y caen (silueta horizontal), con rebote
    r.coletas = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var raiz = puntoPelo(c, s * 108, 22).p;
      var g = grupo(r.cara, raiz.x, raiz.y, raiz.z);
      function coleta(dz, esc, rMax) {
        var pts = [[-s * 0.006, 0.002, 0], [s * 0.03, -0.004, dz * 0.5], [s * 0.056, -0.03, dz], [s * 0.066, -0.07, dz], [s * 0.058, -0.112, dz * 0.6]]
          .map(function (p) { return new V3(p[0] * esc, p[1] * esc, p[2]); });
        return tuboVariable(pts, function (t) { return t < 0.3 ? lerp(0.012, rMax, suave(t / 0.3)) : rMax * Math.pow(Math.max(0, 1 - (t - 0.3) / 0.7), 0.55) + 0.0005; }, 20, 12);
      }
      T.malla(fusionar([[coleta(0, 1, 0.03), null, c.pelo.color], [coleta(0.014, 0.92, 0.022), null, c.pelo.claro],
        [coleta(-0.013, 0.9, 0.021), null, c.pelo.claro]]), 'pelo', g, true);
      var goma = toro(0.0145, 0.0058, 8, 18); goma.rotateY(Math.PI / 2);
      T.malla(pintar(goma, col.coletero), 'brillo', g, true).position.set(s * 0.006, 0.0005, 0);
      r.coletas[lado] = g;
    });

    T.malla(pintar(cilindro(0.037, 0.04, 0.09, 16), col.piel), 'piel', r.cuerpo, true, false).position.y = 0.747;
    // camiseta amarilla + peto coral (cintura, babero con bolsillo, tirantes, botones)
    var tor = torno([[0, 0.5], [0.084, 0.5], [0.09, 0.53], [0.088, 0.58], [0.09, 0.62], [0.096, 0.66], [0.099, 0.683], [0.094, 0.702], [0.076, 0.72], [0.046, 0.733], [0.032, 0.736], [0, 0.736]], 28, 0.67);
    pintar(tor, col.camiseta);
    var frente = function (x) { return 0.67 * Math.sqrt(Math.max(0, 0.0985 * 0.0985 - x * x)); };
    var babero = new THREE.BoxGeometry(0.1, 0.1, 0.007, 10, 4, 1);
    deformar(babero, function (v) { v.z += frente(v.x) + 0.0045; v.y += 0.64; v.x *= 1 - 0.12 * (v.y - 0.59) / 0.1; });
    var bolsillo = new THREE.BoxGeometry(0.045, 0.03, 0.004, 6, 2, 1);
    deformar(bolsillo, function (v) { v.z += frente(v.x) + 0.0095; v.y += 0.632; });
    r.torso = T.malla(fusionar([
      [tor],
      [toro(0.033, 0.0058, 8, 24), matriz([0, 0.733, 0.003], [96, 0, 0], [1, 0.85, 1]), col.camisetaOsc],
      [torno([[0, 0.43], [0.072, 0.43], [0.093, 0.45], [0.1, 0.49], [0.098, 0.54], [0.095, 0.6], [0.092, 0.612], [0, 0.612]], 28, 0.7), null, col.peto],
      [toro(0.094, 0.0045, 6, 30), matriz([0, 0.606, 0], [90, 0, 0], [1, 0.7, 1]), col.petoOsc],
      [babero, null, col.peto], [bolsillo, null, col.petoOsc],
      [tubo([[0.042, 0.686, 0.064], [0.05, 0.712, 0.05], [0.054, 0.733, 0.0], [0.05, 0.712, -0.05], [0.044, 0.64, -0.064]], 0.0065, 14), null, col.peto],
      [tubo([[-0.042, 0.686, 0.064], [-0.05, 0.712, 0.05], [-0.054, 0.733, 0.0], [-0.05, 0.712, -0.05], [-0.044, 0.64, -0.064]], 0.0065, 14), null, col.peto],
      [esfera(12, 8), matriz([0.041, 0.682, frente(0.041) + 0.009], null, [0.0072, 0.0072, 0.004]), col.boton],
      [esfera(12, 8), matriz([-0.041, 0.682, frente(0.041) + 0.009], null, [0.0072, 0.0072, 0.004]), col.boton]
    ]), 'tela', r.cuerpo, true);
    r.torso.geometry.translate(0, -0.6, 0); r.torso.position.y = 0.6;

    construirBrazos(T, r, c);
    construirPiernas(T, r, c, bota(col));

    // lupa morada: origen en el mango, aro arriba
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

  // ---------------------------------------------------------------- poses
  // Ángulos en grados. Brazos: A = abducción (hacia fuera), F = hacia delante, C = codo,
  // Cz = codo en el plano frontal, M = giro de muñeca, Mx = flexión, Pu = puño (0 abierta, 1 cerrada),
  // Ap = el índice se estira aunque la mano esté cerrada (señalar).
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

  function feliz(P, w) {
    P.feliz = Math.max(P.feliz, w);
    P.sonr = lerp(P.sonr, 1, w);
  }

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
      P.cz = 7 * sg; P.cejaL = P.cejaR = 0.004;
      P.boca = 0.4;
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
      P.cejaL = P.cejaR = 0.0015;
    },
    explica: function (P, t, x) {
      P.giro = x.alba ? 20 : 15;
      var gt = x.giroBase + P.giro;
      apuntar(P, 'l', gt, [0.95, 0.08, 0.3]);
      P.lC = 0; P.lCz = 0; P.lPu = 1; P.lAp = 1; P.lM = 90; P.lMx = 0;
      var mira = 1 - rampa(t, 1.3, 1.7);
      P.cy = (x.alba ? 22 : 18) * mira - gt * 0.75 * (1 - mira);
      P.ojoX = 12 * mira;
      P.cejaL = 0.006; P.cejaR = 0.002;
      P.sonr = 0.75;
    },
    animo: function (P, t, x) {
      var botes = (campana(t, 0.25, 0.5) + campana(t, 0.6, 0.85));
      P.y = 0.012 * botes * x.m;
      if (x.alba) {
        P.lA = P.rA = 14; P.lF = P.rF = 42 + 8 * botes * x.k; P.lC = P.rC = 108;
        P.lPu = P.rPu = 1; P.lM = P.rM = 70;
        P.cz = 10; P.cejaInc = 12 * meseta(t, 0, 0.1, 0.35, 0.55);
      } else {
        // «¡tú puedes!»: brazo de fuerza, puño junto a la cabeza
        P.lA = 78; P.lF = 22; P.lC = 0; P.lCz = 84 + 10 * botes * x.k; P.lPu = 1; P.lM = 20;
        P.cz = -6; P.cejaInc = 10 * meseta(t, 0, 0.15, 0.6, 0.9);
      }
      P.cx = 7 * (campana(t, 0.25, 0.55) + campana(t, 0.65, 0.95)) * x.k;
      P.cejaL = P.cejaR = 0.002; P.sonr = 0.85;
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
      P.cx = -8; feliz(P, 1); P.boca = 0.95; P.cejaL = P.cejaR = 0.006;
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
      P.sonr = 0.9; feliz(P, 0.3);
      if (x.alba) P.guinoL = campana(t, 1.2, 1.55); else P.cierre = campana(t, 1.15, 1.6);
    },
    pensando: function (P, t, x) {
      var rem = rampa(t, 2.05, 2.4);
      if (x.alba) {
        // mano derecha en la barbilla; la lupa en la otra mano
        P.rA = 4; P.rF = 48; P.rC = 124; P.rCz = 34; P.rPu = 0.7; P.rM = 60; P.rMx = 10;
        P.lA = 18; P.lF = 45; P.lC = 75; P.lPu = 0.9; P.lM = 60; P.lupaMano = 1;
        P.cz = 9; P.cx = -8; P.cy += 6;
        P.ojoX = 10; P.ojoY = 13;
        P.cejaL = 0.007; P.cejaR = -0.003;
        P.bocaO = 1; P.bocaLado = 0.006; P.sonr = 0.1;
        mezclarEn(P, { rA: 34, rF: 34, rC: 55, rPu: 0.2, rM: 0, lA: 30, lF: 38, lC: 60, encoger: 0.012, cx: 0, cz: 7,
                       ojoX: 0, ojoY: 4, cejaL: 0.005, cejaR: 0.005, bocaO: 0, bocaLado: 0, boca: 0.25, sonr: 0.6 }, rem);
      } else {
        // despliega el mapa con la derecha y se rasca la cabeza con la izquierda
        var rasca = meseta(t, 0.5, 0.6, 1.8, 1.95) * x.k;
        P.rA = 26; P.rF = 14; P.rC = 78; P.rM = 10;
        P.mapa = rampa(t, 0.15, 0.55);
        P.lA = 148 + 4 * onda(t, 4) * rasca; P.lF = 14; P.lC = 12; P.lCz = 76 + 6 * onda(t, 4, 1) * rasca;
        P.lPu = 0.55; P.lM = 30;
        P.encoger = 0.008;
        P.cx = 9; P.cy = -16; P.cz = -5;
        P.ojoX = -10; P.ojoY = -12;
        P.cejaL = 0.007; P.cejaR = -0.002;
        P.torcida = 1; P.sonr = 0.2;
        mezclarEn(P, { rA: 34, rF: 34, rC: 50, lA: 34, lF: 34, lC: 50, lCz: 0, lPu: 0.2, lM: 0, encoger: 0.014, cx: 0, cy: -8, cz: 7,
                       ojoX: 0, ojoY: 4, cejaL: 0.005, cejaR: 0.005, torcida: 0, boca: 0.25, sonr: 0.6, mapa: 0 }, rem);
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

    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' }); }
    catch (e) { return null; }
    if (!renderer.getContext()) return null;
    var sombras = op.sombras !== false;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = sombras;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var lienzo = renderer.domElement;
    lienzo.style.display = 'block'; lienzo.style.width = '100%'; lienzo.style.height = '100%';
    contenedor.appendChild(lienzo);

    // fondo opcional: imagen CSS detrás del canvas (el canvas sigue transparente)
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
    // luz: clave cálida arriba a la izquierda (con sombra), relleno frío de cielo/suelo y un contraluz suave
    var hemi = new THREE.HemisphereLight(0xBFE3FF, 0x8A7A5A, 1.15);
    var clave = new THREE.DirectionalLight(0xFFF1DC, 2.5);
    clave.position.set(-1.2, 1.95, 2.5);
    clave.target.position.set(0, 0.55, 0);
    var borde = new THREE.DirectionalLight(0xE8F4FF, 1.1);
    borde.position.set(1.5, 1.4, -1.8);
    borde.target.position.set(0, 0.55, 0);
    escena.add(hemi, clave, clave.target, borde, borde.target);
    if (sombras) {
      clave.castShadow = true;
      clave.shadow.mapSize.set(1024, 1024);
      var sc = clave.shadow.camera;
      sc.left = -0.62; sc.right = 0.62; sc.top = 0.68; sc.bottom = -0.68; sc.near = 1.5; sc.far = 5;
      sc.updateProjectionMatrix();
      clave.shadow.bias = -0.0004;
      clave.shadow.normalBias = 0.0045;
    }
    // sombra de contacto bajo los pies
    var texSombra = texturaSombra();
    var geoSombra = new THREE.PlaneGeometry(1, 1); geoSombra.rotateX(-Math.PI / 2);
    var matSombra = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, toneMapped: false, color: 0x1A1410 });
    var sombra = new THREE.Mesh(geoSombra, matSombra);
    sombra.position.y = 0.001; sombra.renderOrder = -1;
    escena.add(sombra);
    var camara = new THREE.PerspectiveCamera(20, 1, 0.1, 30);

    // ---- estado interno (igual que la v1)
    var ctx = { cfg: cfg, giroBase: giroBase, alba: quien === 'alba', m: 1, k: 1 };
    var estado = 'espera', tEstado = 0, trans = 1, vida = 0;
    var snap = reposo(cfg, giroBase), actual = reposo(cfg, giroBase), final = reposo(cfg, giroBase);
    var hablando = false, calmado = false, hablaVal = 0, hablaObj = 0, hablaReloj = 0;
    var proxParpadeo = 0, iniParpadeo = -10, doble = false, parpadeando = false;
    var muelle = { x: 0, v: 0 }, yPrev = 0, vyPrev = 0;
    var raf = 0, temporizador = 0, ultimo = 0, lento = false, congelado = false, destruido = false;

    function ahoraS() { return (window.performance && performance.now ? performance.now() : Date.now()) / 1000; }
    proxParpadeo = ahoraS() + 1.5 + Math.random() * 2;
    function copiar(dst, src) { for (var k in src) dst[k] = src[k]; return dst; }
    function objetivo(nombre, t) { var P = reposo(cfg, giroBase); POSES[nombre](P, t, ctx); return P; }
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
        P.cejaL += 0.003 * hablaVal * hablaVal; P.cejaR += 0.003 * hablaVal * hablaVal;
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
      ['l', 'r'].forEach(function (l) {
        var b = r.brazos[l];
        b.hombro.position.y = cfg.brazo.hombroY + P.encoger + 0.0015 * P.resp;
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
        // ojos y párpados
        var o = r.ojos[l];
        o.globo.rotation.set(-P.ojoY * G, P.ojoX * G, 0);
        var g = l === 'l' ? P.guinoL : P.guinoR;
        var cerr = Math.max(cierre, P.cierre, g, 0.1 * P.feliz + P.parp);
        o.sup.rotation.x = (-40 + 78 * lim01(cerr) - 0.35 * P.ojoY) * G;
        o.inf.rotation.x = (37 - 31 * P.feliz - 0.15 * P.ojoY) * G;
        o.brillo.visible = cerr < 0.7;
        var ce = r.cejas[l];
        ce.position.y = l === 'l' ? P.cejaL : P.cejaR;
        ce.rotation.z = (l === 'l' ? -1 : 1) * P.cejaInc * G;
      });
      bocaPrm.abre = P.boca; bocaPrm.sonr = P.sonr; bocaPrm.O = P.bocaO; bocaPrm.lado = P.bocaLado; bocaPrm.torc = P.torcida;
      r.boca.actualizar(bocaPrm);
      // sombra de contacto: se encoge y aclara al saltar
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

    function pintarEscena() { renderer.render(escena, camara); }
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
      if (ultimo && lento && ahora - ultimo < 0.031) { pedirFrame(); return; }   // la espera va a ~30 fps
      // hasta 100 ms por paso: en un equipo lento los gestos duran lo mismo (a saltos), no van a cámara lenta
      var dt = ultimo ? Math.min(0.1, Math.max(0.001, ahora - ultimo)) : 1 / 60;
      ultimo = ahora;
      var vivo = actualizar(dt);
      pintarEscena();
      if (vivo) pedirFrame(); else { ultimo = 0; dormir(); }
    }

    function ajustar() {
      if (destruido) return;
      var w = contenedor.clientWidth || 300, h = contenedor.clientHeight || 300;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      var asp = w / h, retrato = op.encuadre === 'retrato';
      // cuerpo: de y −0,04 a 1,16 (cabe el salto y los brazos arriba)
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
        calmado = si; ctx.m = si ? 0 : 1; ctx.k = si ? 0.35 : 1;
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
      info: { mallas: T.mallas, triangulos: Math.round(T.tris), sombras: sombras },
      destruir: function () {
        if (destruido) return;
        destruido = true;
        if (raf) cancelAnimationFrame(raf);
        if (temporizador) clearTimeout(temporizador);
        document.removeEventListener('visibilitychange', alVisibilidad);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', ajustar);
        T.liberar(); geoSombra.dispose(); matSombra.dispose(); texSombra.dispose();
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        if (lienzo.parentNode) lienzo.parentNode.removeChild(lienzo);
        if (fondoPrevio) {
          contenedor.style.backgroundImage = fondoPrevio[0];
          contenedor.style.backgroundSize = fondoPrevio[1];
          contenedor.style.backgroundPosition = fondoPrevio[2];
        }
      }
    };
  }

  window.Personajes3D = { crear: crear, estados: ESTADOS.slice(), version: 2 };
})();
