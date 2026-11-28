/*
 * personajes3d.js · Nico y Alba, los guías del juego, hechos con primitivas de three.js (r158).
 *
 * Script clásico: necesita window.THREE (vendor/three.min.js) cargado antes. Sin módulos ni import,
 * para que funcione desde file:// dentro de la app Android.
 *
 *   var pj = Personajes3D.crear(contenedor, 'nico' | 'alba', opciones?)   // null si no hay WebGL
 *   pj.estado('saludo' | 'espera' | 'habla' | 'explica' | 'animo' | 'celebra' | 'despedida' | 'pensando')
 *   pj.hablar(true | false)   // capa aparte: mueve la boca en cualquier estado
 *   pj.calma(true | false)    // movimiento reducido: sin balanceos ni saltos
 *   pj.destruir()
 *
 * Opciones (todas opcionales):
 *   encuadre: 'cuerpo' (por defecto) | 'retrato' (solo cabeza, para iconos pequeños)
 *   giro: grados de giro de reposo del cuerpo (por defecto Nico +14, Alba -10: se miran entre sí)
 *
 * Los gestos de un solo golpe (saludo, animo, celebra, despedida, pensando) vuelven solos a 'espera'.
 * 'habla' y 'explica' se mantienen hasta que se pida otro estado. 'habla' ya mueve la boca por sí solo.
 *
 * Contorno: técnica de casco invertido. En lugar de duplicar cada malla, se pinta la escena dos veces:
 * primero solo las piezas con contorno (capa 1), con un material tinta en BackSide que empuja cada
 * vértice a lo largo de su normal; luego la escena normal encima. Mismo resultado, la mitad de mallas.
 */
(function () {
  'use strict';

  var ESTADOS = ['saludo', 'espera', 'habla', 'explica', 'animo', 'celebra', 'despedida', 'pensando'];
  if (!window.THREE) {
    // sin three.js no hay personajes, pero tampoco errores
    window.Personajes3D = { crear: function () { return null; }, estados: ESTADOS.slice() };
    return;
  }
  var THREE = window.THREE;
  var G = Math.PI / 180;
  var TINTA = [0x22 / 255, 0x30 / 255, 0x6B / 255];
  var TRANSICION = 0.3;          // segundos de fundido entre gestos
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
      if (ext) ext.loseContext();          // liberamos el contexto de prueba enseguida
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- geometría
  function matriz(p, r, s) {
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r ? r[0] : 0) * G, (r ? r[1] : 0) * G, (r ? r[2] : 0) * G));
    var esc = s == null ? [1, 1, 1] : (typeof s === 'number' ? [s, s, s] : s);
    return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(esc[0], esc[1], esc[2]));
  }

  // Fusiona varias piezas del mismo color y el mismo padre en una sola malla (menos llamadas de dibujo).
  function fusionar(partes) {
    var pos = [], nor = [], idx = [], base = 0, v = new THREE.Vector3(), nm = new THREE.Matrix3();
    partes.forEach(function (pt) {
      var g = pt[0], m = pt[1] || new THREE.Matrix4();
      var gp = g.attributes.position, gn = g.attributes.normal, i;
      nm.getNormalMatrix(m);
      for (i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      }
      if (g.index) { for (i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); }
      else { for (i = 0; i < gp.count; i++) idx.push(base + i); }
      base += gp.count;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    out.computeBoundingSphere();
    return out;
  }

  function esfera(w, h) { return new THREE.SphereGeometry(1, w || 14, h || 10); }
  function capsula(r, l, rad) { return new THREE.CapsuleGeometry(r, l, 3, rad || 10); }
  function cilindro(rt, rb, h, rad) { return new THREE.CylinderGeometry(rt, rb, h, rad || 14); }

  // Punto de la superficie de la cabeza (elipsoide R·sx, R, R) y orientación según su normal.
  function sobreCabeza(R, sx, x, y, fuera) {
    var zz = 1 - (x * x) / (R * R * sx * sx) - (y * y) / (R * R);
    var z = R * Math.sqrt(Math.max(0, zz));
    var n = new THREE.Vector3(x / (sx * sx), y, z).normalize();
    return { pos: new THREE.Vector3(x, y, z).addScaledVector(n, fuera || 0),
             quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) };
  }

  // ---------------------------------------------------------------- taller de piezas
  function Taller(gradiente) { this.grad = gradiente; this.mats = {}; this.geos = []; this.mallas = 0; this.conContorno = 0; }
  Taller.prototype.toon = function (hex, doble) {
    var k = hex + (doble ? 'd' : '');
    if (!this.mats[k]) this.mats[k] = new THREE.MeshToonMaterial({ color: hex, gradientMap: this.grad, side: doble ? THREE.DoubleSide : THREE.FrontSide });
    return this.mats[k];
  };
  Taller.prototype.plano = function (hex) {
    var k = 'b' + hex;
    if (!this.mats[k]) this.mats[k] = new THREE.MeshBasicMaterial({ color: hex });
    return this.mats[k];
  };
  Taller.prototype.malla = function (geo, mat, padre, contorno) {
    this.geos.push(geo);
    var m = new THREE.Mesh(geo, mat);
    if (contorno) { m.layers.enable(1); this.conContorno++; }
    padre.add(m); this.mallas++;
    return m;
  };
  Taller.prototype.liberar = function () {
    this.geos.forEach(function (g) { g.dispose(); });
    for (var k in this.mats) this.mats[k].dispose();
  };

  function grupo(padre, x, y, z) { var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (padre) padre.add(g); return g; }

  // ---------------------------------------------------------------- esqueleto común
  // Cara y brazos son iguales en los dos (misma familia visual); cambian medidas y colores.
  function esqueletoComun(T, cfg) {
    var r = { cfg: cfg };
    r.raiz = grupo(null);
    r.cuerpo = grupo(r.raiz);
    r.cabeza = grupo(r.cuerpo, 0, cfg.cuelloY, 0);
    r.cabeza.rotation.order = 'YXZ';
    r.cara = grupo(r.cabeza, 0, cfg.cabezaY - cfg.cuelloY, 0);

    // brazos: hombro (abducción z, adelante x) → codo → mano
    r.brazos = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var hombro = grupo(r.cuerpo, s * cfg.hombroX, cfg.hombroY, 0);
      hombro.rotation.order = 'ZXY';
      var codo = grupo(hombro, 0, -cfg.brazoL, 0);
      codo.rotation.order = 'ZXY';
      var mano = grupo(codo, 0, -cfg.antebrazoL, 0);
      var g1 = capsula(cfg.brazoR, cfg.brazoL, 10); g1.translate(0, -cfg.brazoL / 2, 0);
      T.malla(g1, T.toon(cfg.color.manga), hombro, true);
      var g2 = capsula(cfg.brazoR * 0.95, cfg.antebrazoL, 10); g2.translate(0, -cfg.antebrazoL / 2, 0);
      T.malla(g2, T.toon(cfg.color.antebrazo), codo, true);
      var m = T.malla(esfera(12, 9), T.toon(cfg.color.piel), mano, true);
      m.scale.setScalar(cfg.manoR); m.position.y = -cfg.manoR * 0.55;
      r.brazos[lado] = { s: s, hombro: hombro, codo: codo, mano: mano };
    });
    // dedo índice: solo se ve al señalar (mano izquierda, la de la derecha de la pantalla)
    var gd = capsula(cfg.dedoR, 0.03, 8); gd.translate(0, -0.03 / 2 - cfg.dedoR, 0);
    r.dedo = T.malla(gd, T.toon(cfg.color.piel), r.brazos.l.mano, true);
    r.dedo.position.set(0, -cfg.manoR * 1.25, cfg.manoR * 0.15);
    r.dedo.visible = false;

    // ojos: óvalo oscuro con dos brillos; ojos felices en arco (∩)
    var R = cfg.cabezaR, SX = cfg.cabezaSX;
    r.ojos = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var sup = sobreCabeza(R, SX, s * cfg.ojo.x, cfg.ojo.y, -0.004);
      var base = grupo(r.cara); base.position.copy(sup.pos); base.quaternion.copy(sup.quat);
      var ojo = grupo(base);
      var mo = T.malla(esfera(12, 10), T.plano(cfg.color.ojo), ojo, false);
      mo.scale.set(cfg.ojo.rx, cfg.ojo.ry, cfg.ojo.rz);
      var gb = fusionar([[esfera(8, 6), matriz([0.34 * cfg.ojo.rx, 0.4 * cfg.ojo.ry, cfg.ojo.rz * 0.75], null, cfg.ojo.rx * 0.36)],
                         [esfera(6, 5), matriz([-0.3 * cfg.ojo.rx, -0.38 * cfg.ojo.ry, cfg.ojo.rz * 0.7], null, cfg.ojo.rx * 0.17)]]);
      T.malla(gb, T.plano(0xFFFFFF), ojo, false);
      var gf = new THREE.TorusGeometry(cfg.ojo.rx * 0.95, cfg.ojo.rx * 0.26, 6, 12, Math.PI);
      var feliz = T.malla(gf, T.plano(cfg.color.ojo), base, false);
      feliz.scale.z = 0.5; feliz.position.y = -cfg.ojo.ry * 0.25; feliz.visible = false;
      r.ojos[lado] = { ojo: ojo, feliz: feliz };
    });

    // cejas
    r.cejas = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var sup = sobreCabeza(R, SX, s * cfg.ceja.x, cfg.ceja.y, -0.003);
      var base = grupo(r.cara); base.position.copy(sup.pos); base.quaternion.copy(sup.quat);
      var gc = capsula(cfg.ceja.r, cfg.ceja.l, 6); gc.rotateZ(Math.PI / 2);
      var c = T.malla(gc, T.toon(cfg.color.pelo), base, false);
      c.scale.z = 0.6;
      r.cejas[lado] = c;
    });

    // boca: sonrisa cerrada (∪) y boca abierta en «D» con lengua
    var supB = sobreCabeza(R, SX, 0, cfg.boca.y, -0.002);
    var bocaBase = grupo(r.cara); bocaBase.position.copy(supB.pos); bocaBase.quaternion.copy(supB.quat);
    r.boca = grupo(bocaBase);
    var gs = new THREE.TorusGeometry(cfg.boca.w * 0.5, cfg.boca.tubo, 6, 14, Math.PI); gs.rotateZ(Math.PI);
    r.sonrisa = T.malla(gs, T.toon(cfg.color.boca), r.boca, false);
    r.sonrisa.scale.z = 0.6;
    r.bocaAbierta = grupo(r.boca);
    T.malla(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), T.toon(cfg.color.boca), r.bocaAbierta, false);
    var lengua = T.malla(esfera(10, 6), T.toon(0xE8707E), r.bocaAbierta, false);
    lengua.position.set(0, -0.68, 0.3); lengua.scale.set(0.58, 0.36, 0.5);
    r.bocaAbierta.visible = false;

    // mofletes (sin contorno), color ya mezclado con la piel para no usar transparencias
    var rubor = new THREE.Color(cfg.color.piel).lerp(new THREE.Color(cfg.color.rubor), 0.7).getHex();
    var mof = [];
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var sup = sobreCabeza(R, SX, s * cfg.moflete.x, cfg.moflete.y, -0.004);
      var m = new THREE.Matrix4().compose(sup.pos, sup.quat, new THREE.Vector3(cfg.moflete.r * 1.25, cfg.moflete.r * 0.8, 0.006));
      mof.push([esfera(10, 6), m]);
    });
    T.malla(fusionar(mof), T.toon(rubor), r.cara, false);
    return r;
  }

  // ---------------------------------------------------------------- NICO
  var NICO = {
    quien: 'nico', giroBase: 14, manoSaludo: 'r',
    cabezaY: 0.775, cuelloY: 0.58, cabezaR: 0.215, cabezaSX: 1,
    hombroX: 0.148, hombroY: 0.535, brazoR: 0.045, brazoL: 0.085, antebrazoL: 0.075, manoR: 0.05, dedoR: 0.015,
    ojo: { x: 0.076, y: 0.012, rx: 0.042, ry: 0.056, rz: 0.02 },
    ceja: { x: 0.078, y: 0.098, r: 0.012, l: 0.045 },
    boca: { y: -0.088, w: 0.075, tubo: 0.009, h: 0.07 },
    moflete: { x: 0.135, y: -0.05, r: 0.03 },
    mapaW: 0.2,
    color: {
      piel: 0xE8B48A, pelo: 0x5A3420, ojo: 0x2A1A14, boca: 0x7A2E2E, rubor: 0xFF9E9E,
      sudadera: 0x3FA55B, pantalon: 0x2C6A45, mochila: 0xFF8A3D, zapatilla: 0xFFF6E8,
      brujula: 0xFFD23F, esfera: 0xFFF6E8, mapa: 0xF2DCA6, hoja: 0xF8EBC6, cinta: 0xE23B3B,
      manga: 0x3FA55B, antebrazo: 0x3FA55B
    }
  };

  function construirNico(T) {
    var c = NICO, col = c.color, r = esqueletoComun(T, c);
    var R = c.cabezaR;

    // cabeza + orejas (piel) y nariz
    T.malla(fusionar([
      [esfera(22, 16), matriz([0, 0, 0], null, R)],
      [esfera(10, 8), matriz([0.207, -0.012, -0.005], [0, 0, 0], [0.04, 0.05, 0.026])],
      [esfera(10, 8), matriz([-0.207, -0.012, -0.005], [0, 0, 0], [0.04, 0.05, 0.026])]
    ]), T.toon(col.piel), r.cara, true);
    var nariz = T.malla(esfera(10, 8), T.toon(0xD9966A), r.cara, false);
    nariz.scale.setScalar(0.02); nariz.position.copy(sobreCabeza(R, 1, 0, -0.03, 0.004).pos);

    // pelo: esfera mayor desplazada atrás y arriba (la cara asoma por delante) + mechones laterales
    T.malla(fusionar([
      [esfera(22, 16), matriz([0, 0.04, -0.04], [0, 0, 0], [0.226, 0.215, 0.222])],
      [esfera(12, 8), matriz([0.105, 0.17, 0.03], [10, 0, -32], [0.055, 0.04, 0.05])],
      [esfera(12, 8), matriz([-0.105, 0.17, 0.03], [10, 0, 32], [0.055, 0.04, 0.05])]
    ]), T.toon(col.pelo), r.cara, true);
    // tupé (con rebote): perfil de gota con la punta redondeada; pivote en la base
    r.tupe = grupo(r.cara, 0, 0.185, 0.07);
    var perfil = [[0, 0], [0.074, 0], [0.08, 0.035], [0.068, 0.08], [0.047, 0.118], [0.026, 0.146], [0.01, 0.162], [0, 0.165]]
      .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    T.malla(new THREE.LatheGeometry(perfil, 12), T.toon(col.pelo), r.tupe, true);

    // tronco: sudadera, pantalón corto, piernas y zapatillas
    r.torso = T.malla(capsula(0.13, 0.12, 14), T.toon(col.sudadera), r.cuerpo, true);
    r.torso.position.y = 0.45;
    var pant = T.malla(cilindro(0.128, 0.14, 0.1, 16), T.toon(col.pantalon), r.cuerpo, true);
    pant.position.y = 0.3;
    T.malla(fusionar([
      [capsula(0.052, 0.1, 10), matriz([0.065, 0.16, 0])],
      [capsula(0.052, 0.1, 10), matriz([-0.065, 0.16, 0])]
    ]), T.toon(col.piel), r.cuerpo, true);
    T.malla(fusionar([
      [esfera(14, 10), matriz([0.07, 0.045, 0.025], null, [0.075, 0.05, 0.105])],
      [esfera(14, 10), matriz([-0.07, 0.045, 0.025], null, [0.075, 0.05, 0.105])]
    ]), T.toon(col.zapatilla), r.cuerpo, true);

    // mochila redonda + tirantes por delante (naranja)
    T.malla(fusionar([
      [capsula(0.13, 0.08, 14), matriz([0, 0.47, -0.15], null, [1.2, 1, 0.8])],
      [capsula(0.019, 0.15, 8), matriz([0.072, 0.47, 0.107], [-6, 0, -4])],
      [capsula(0.019, 0.15, 8), matriz([-0.072, 0.47, 0.107], [-6, 0, 4])]
    ]), T.toon(col.mochila), r.cuerpo, true);

    // brújula colgada: aro amarillo + esfera crema + aguja roja
    var bru = grupo(r.cuerpo, 0, 0.415, 0.125);
    bru.rotation.x = -8 * G;
    var gbr = cilindro(0.04, 0.04, 0.016, 16); gbr.rotateX(Math.PI / 2);
    T.malla(gbr, T.toon(col.brujula), bru, true);
    var gbe = cilindro(0.029, 0.029, 0.01, 16); gbe.rotateX(Math.PI / 2); gbe.translate(0, 0, 0.006);
    T.malla(gbe, T.toon(col.esfera), bru, false);
    var gag = new THREE.ConeGeometry(0.009, 0.042, 4); gag.translate(0, 0.008, 0.013); gag.scale(1, 1, 0.35);
    var ag = T.malla(gag, T.plano(col.cinta), bru, false);
    ag.rotation.z = -20 * G;

    // mapa enrollado en la mano derecha (pantalla izquierda): rollo + cinta, y hoja que se despliega
    // El grupo r.mapa se orienta en el mundo (siempre derecho); su contenido va algo subido
    // para que la mano lo coja por el tercio de abajo.
    r.mapa = grupo(r.brazos.r.mano, 0, -c.manoR * 0.55, 0.02);
    var mc = grupo(r.mapa, 0, 0.055, 0);
    T.malla(cilindro(0.028, 0.028, 0.19, 12), T.toon(col.mapa), mc, true);
    var gci = new THREE.TorusGeometry(0.03, 0.009, 6, 14); gci.rotateX(Math.PI / 2); gci.translate(0, 0.045, 0);
    T.malla(gci, T.toon(col.cinta), mc, false);
    r.hoja = grupo(mc);
    var gh = new THREE.BoxGeometry(1, 0.17, 0.006); gh.translate(0.5, 0, 0);
    T.malla(gh, T.toon(col.hoja), r.hoja, true);
    // marcas del mapa: un camino y una X roja (en la cara que mira a cámara)
    r.marcas = T.malla(fusionar([
      [new THREE.BoxGeometry(0.05, 0.013, 0.004), matriz([0.035, -0.03, 0.005], [0, 0, 45])],
      [new THREE.BoxGeometry(0.05, 0.013, 0.004), matriz([0.035, -0.03, 0.005], [0, 0, -45])],
      [new THREE.BoxGeometry(0.03, 0.01, 0.004), matriz([-0.055, 0.045, 0.005], [0, 0, -30])],
      [new THREE.BoxGeometry(0.03, 0.01, 0.004), matriz([-0.02, 0.02, 0.005], [0, 0, -40])]
    ]), T.plano(col.cinta), mc, false);
    r.rolloB = T.malla(cilindro(0.022, 0.022, 0.17, 10), T.toon(col.mapa), mc, true);
    r.hoja.visible = false; r.rolloB.visible = false; r.marcas.visible = false;
    return r;
  }

  function extraNico(r, P, muelle) {
    var c = NICO;
    r.tupe.rotation.x = 32 * G + muelle * 0.8;
    var m = P.mapa;
    r.hoja.visible = r.rolloB.visible = m > 0.03;
    r.hoja.scale.x = Math.max(0.03, m) * c.mapaW;
    r.rolloB.position.x = c.mapaW * m;
    r.marcas.visible = m > 0.75;
    r.marcas.position.x = c.mapaW * m * 0.5;
    // El mapa se orienta en el mundo: enrollado, derecho y algo inclinado hacia fuera;
    // abierto, vertical y de cara a la cámara. Así se lee igual sea cual sea la pose del brazo.
    r.raiz.updateMatrixWorld(true);
    var inv = r.mapa.parent.getWorldQuaternion(_qa).invert();
    _qb.setFromEuler(_eu.set(0, 0, 14 * G));
    _qc.setFromEuler(_eu.set(-4 * G, 10 * G, 0));
    _qb.slerp(_qc, suave(m));
    r.mapa.quaternion.copy(inv).multiply(_qb);
  }

  // ---------------------------------------------------------------- ALBA
  var ALBA = {
    quien: 'alba', giroBase: -10, manoSaludo: 'l',
    cabezaY: 0.77, cuelloY: 0.575, cabezaR: 0.21, cabezaSX: 1.05,
    hombroX: 0.13, hombroY: 0.53, brazoR: 0.036, brazoL: 0.08, antebrazoL: 0.072, manoR: 0.042, dedoR: 0.013,
    ojo: { x: 0.077, y: -0.006, rx: 0.042, ry: 0.056, rz: 0.02 },
    ceja: { x: 0.078, y: 0.076, r: 0.011, l: 0.048 },
    boca: { y: -0.092, w: 0.066, tubo: 0.008, h: 0.065 },
    moflete: { x: 0.125, y: -0.062, r: 0.03 },
    color: {
      piel: 0xF4C29A, pelo: 0x9B4A22, ojo: 0x2A1A14, boca: 0x7A2630, rubor: 0xFF9C8A,
      camiseta: 0xFFC83D, peto: 0xE8502F, morado: 0x7B5CD6, cristal: 0xE8F7FF, coletero: 0xFFC83D,
      manga: 0xF4C29A, antebrazo: 0xF4C29A
    }
  };

  function construirAlba(T) {
    var c = ALBA, col = c.color, r = esqueletoComun(T, c);
    var R = c.cabezaR;

    T.malla(fusionar([
      [esfera(22, 16), matriz([0, 0, 0], null, [R * c.cabezaSX, R, R])],
      [esfera(10, 8), matriz([0.214, -0.01, 0], null, [0.032, 0.036, 0.022])],
      [esfera(10, 8), matriz([-0.214, -0.01, 0], null, [0.032, 0.036, 0.022])]
    ]), T.toon(col.piel), r.cara, true);

    // pelo: casquete (esfera mayor desplazada) + flequillo de lado
    T.malla(fusionar([
      [esfera(22, 16), matriz([0, 0.035, -0.035], null, [0.23, 0.212, 0.218])],
      // flequillo de lado: baja desde el centro hacia su sien derecha (izquierda de la pantalla)
      [esfera(14, 10), matriz([-0.07, 0.14, 0.132], [-38, -12, 22], [0.105, 0.044, 0.032])]
    ]), T.toon(col.pelo), r.cara, true);

    // coletas con rebote, hacia los lados (silueta horizontal)
    r.coletas = {};
    ['l', 'r'].forEach(function (lado) {
      var s = lado === 'l' ? 1 : -1;
      var g = grupo(r.cara, s * 0.2, 0.04, -0.04);
      var gc = capsula(0.062, 0.1, 12); gc.translate(0, -0.11, 0);
      T.malla(gc, T.toon(col.pelo), g, true);
      var ga = new THREE.TorusGeometry(0.034, 0.013, 6, 14); ga.rotateX(Math.PI / 2); ga.translate(0, -0.035, 0);
      T.malla(ga, T.toon(col.coletero), g, true);
      r.coletas[lado] = g;
    });

    // camiseta amarilla con mangas
    r.torso = T.malla(fusionar([
      [capsula(0.12, 0.1, 14), matriz([0, 0, 0])],
      [esfera(12, 9), matriz([0.118, 0.08, 0], null, 0.052)],
      [esfera(12, 9), matriz([-0.118, 0.08, 0], null, 0.052)]
    ]), T.toon(col.camiseta), r.cuerpo, true);
    r.torso.position.y = 0.45;

    // peto coral: cuerpo, babero, tirantes y pantalón corto en una sola malla
    T.malla(fusionar([
      [cilindro(0.125, 0.136, 0.15, 18), matriz([0, 0.4, 0])],
      [cilindro(0.12, 0.118, 0.06, 16), matriz([0, 0.31, 0])],
      [new THREE.BoxGeometry(0.12, 0.085, 0.024), matriz([0, 0.49, 0.112])],
      [capsula(0.014, 0.075, 6), matriz([0.052, 0.555, 0.095], [-38, 0, -10])],
      [capsula(0.014, 0.075, 6), matriz([-0.052, 0.555, 0.095], [-38, 0, 10])],
      [cilindro(0.056, 0.058, 0.1, 12), matriz([0.056, 0.285, 0])],
      [cilindro(0.056, 0.058, 0.1, 12), matriz([-0.056, 0.285, 0])]
    ]), T.toon(col.peto), r.cuerpo, true);
    T.malla(fusionar([
      [esfera(8, 6), matriz([0.04, 0.515, 0.126], null, 0.012)],
      [esfera(8, 6), matriz([-0.04, 0.515, 0.126], null, 0.012)]
    ]), T.toon(col.camiseta), r.cuerpo, false);

    // piernas y botas moradas (caña + puntera)
    T.malla(fusionar([
      [capsula(0.036, 0.1, 10), matriz([0.056, 0.15, 0])],
      [capsula(0.036, 0.1, 10), matriz([-0.056, 0.15, 0])]
    ]), T.toon(col.piel), r.cuerpo, true);
    T.malla(fusionar([
      [cilindro(0.048, 0.05, 0.075, 14), matriz([0.058, 0.055, 0])],
      [esfera(12, 8), matriz([0.058, 0.035, 0.03], null, [0.05, 0.036, 0.065])],
      [cilindro(0.048, 0.05, 0.075, 14), matriz([-0.058, 0.055, 0])],
      [esfera(12, 8), matriz([-0.058, 0.035, 0.03], null, [0.05, 0.036, 0.065])]
    ]), T.toon(col.morado), r.cuerpo, true);

    // lupa morada: origen en el mango; aro arriba
    r.lupa = grupo(null);
    T.malla(fusionar([
      [cilindro(0.013, 0.013, 0.08, 8), matriz([0, 0, 0])],
      [new THREE.TorusGeometry(0.05, 0.013, 8, 18), matriz([0, 0.09, 0])]
    ]), T.toon(col.morado), r.lupa, true);
    var gcr = cilindro(0.05, 0.05, 0.006, 16); gcr.rotateX(Math.PI / 2); gcr.translate(0, 0.09, 0);
    T.malla(gcr, T.toon(col.cristal), r.lupa, false);
    var gbr = esfera(8, 6); gbr.scale(0.014, 0.022, 0.004); gbr.translate(-0.02, 0.105, 0.005);
    T.malla(gbr, T.plano(0xFFFFFF), r.lupa, false);
    // anclajes: colgada de la cadera izquierda o en la mano izquierda
    r.anclaCadera = grupo(r.cuerpo, 0.142, 0.335, 0.035);
    r.anclaCadera.rotation.set(0, -15 * G, 162 * G);
    r.anclaMano = grupo(r.brazos.l.mano, 0, -c.manoR * 0.55, 0.01);
    r.anclaCadera.add(r.lupa);
    return r;
  }

  function extraAlba(r, P, muelle) {
    var phi = 55 * G - muelle;
    r.coletas.l.rotation.z = phi;
    r.coletas.r.rotation.z = -phi;
    var enMano = P.lupaMano >= 0.5;
    if (enMano) {
      if (r.lupa.parent !== r.anclaMano) r.anclaMano.add(r.lupa);
      r.lupa.quaternion.identity();
      r.raiz.updateMatrixWorld(true);
      var qp = r.anclaMano.getWorldQuaternion(_qa).invert();
      _qb.setFromEuler(_eu.set(-12 * G, -25 * G, -10 * G)); qp.multiply(_qb);
      r.lupa.quaternion.copy(qp);
    } else if (r.lupa.parent !== r.anclaCadera) {
      r.anclaCadera.add(r.lupa);
      r.lupa.quaternion.identity();
    }
  }

  var _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _eu = new THREE.Euler();

  // ---------------------------------------------------------------- poses
  function reposo(cfg, giroBase) {
    return {
      y: 0, z: 0, sx: 1, sy: 1, giro: 0, cx: 0, cy: -giroBase * 0.6, cz: 0, encoger: 0,
      lA: 13, lF: 3, lC: 12, lCz: 0, lT: 0,
      rA: 13, rF: 3, rC: cfg.quien === 'nico' ? 22 : 12, rCz: 0, rT: 0,
      ojoX: 0, ojoY: 0, feliz: 0, guinoL: 0, guinoR: 0, cierre: 0,
      cejaL: 0, cejaR: 0, cejaInc: 0, boca: 0, bocaO: 0, bocaLado: 0, torcida: 0,
      dedo: 0, mapa: 0, lupaMano: 0
    };
  }

  // Calcula ángulos de hombro para que el brazo apunte en una dirección del mundo.
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

  var POSES = {
    espera: function (P, t, x) {
      P.cy += 4 * onda(t, 1 / 6) * x.m;
      if (x.alba) P.cz += 3 * onda(t, 1 / 4) * x.m;
      P.ojoX += 0.006 * onda(t, 1 / 9) * x.m;
    },
    saludo: function (P, t, x) {
      var l = x.cfg.manoSaludo, sg = l === 'r' ? 1 : -1;
      var env = meseta(t, 0.2, 0.35, 1.05, 1.25) * x.k;
      P[l + 'A'] = 128 + 6 * onda(t, 3) * env;
      P[l + 'F'] = 12; P[l + 'C'] = 8;
      P[l + 'Cz'] = 30 + 24 * onda(t, 3, 1.2) * env;
      P.y = 0.03 * campana(t, 0.1, 0.42) * x.m;
      P.cz = (x.alba ? 10 : 8) * sg;
      P.cejaL = P.cejaR = 0.01;
      P.boca = x.alba ? 0.7 : 0.6;
      if (x.alba) P.feliz = campana(t, 0.3, 1.0);
    },
    habla: function (P, t, x) {
      P.lA = P.rA = 17;
      P.lF = 20 + 9 * onda(t, 1.1) * x.k;
      P.rF = 20 + 9 * onda(t, 1.1, 2) * x.k;
      P.lC = 48 + 8 * onda(t, 1.1, 0.5) * x.k;
      P.rC = 48 + 8 * onda(t, 1.1, 2.5) * x.k;
      P.cx = (x.alba ? 4 : 3) * onda(t, 0.7) * x.k;
      P.cejaL = P.cejaR = 0.003;
    },
    explica: function (P, t, x) {
      P.giro = x.alba ? 20 : 15;
      var gt = x.giroBase + P.giro;
      apuntar(P, 'l', gt, [0.95, 0.07, 0.3]);
      P.lC = 0; P.lCz = 0; P.dedo = 1;
      var mira = 1 - rampa(t, 1.3, 1.7);
      P.cy = (x.alba ? 22 : 18) * mira - gt * 0.75 * (1 - mira);
      P.ojoX = 0.012 * mira;
      P.cejaL = 0.014; P.cejaR = 0.004;
    },
    animo: function (P, t, x) {
      var botes = (campana(t, 0.25, 0.5) + campana(t, 0.6, 0.85));
      P.y = 0.016 * botes * x.m;
      if (x.alba) {
        P.lA = P.rA = 20; P.lF = P.rF = 45 + 8 * botes * x.k; P.lC = P.rC = 95;
        P.cz = 12; P.cejaInc = 14 * meseta(t, 0, 0.1, 0.35, 0.55);
      } else {
        // «¡tú puedes!»: brazo de fuerza, puño junto a la cabeza
        P.lA = 78; P.lF = 18; P.lC = 0; P.lCz = 82 + 10 * botes * x.k;
        P.cz = -6; P.cejaInc = 10 * meseta(t, 0, 0.15, 0.6, 0.9);
      }
      P.cx = 8 * (campana(t, 0.25, 0.55) + campana(t, 0.65, 0.95)) * x.k;
      P.cejaL = P.cejaR = 0.004;
    },
    celebra: function (P, t, x) {
      if (x.m) {
        var ag = campana(t, 0, 0.26), u = (t - 0.2) / 0.42, est = campana(t, 0.2, 0.45), aterr = campana(t, 0.6, 0.8);
        P.y = (u > 0 && u < 1) ? 0.08 * 4 * u * (1 - u) : 0;
        P.sy = 1 - 0.1 * ag - 0.07 * aterr + 0.06 * est;
        P.sx = 1 + 0.05 * ag + 0.04 * aterr - 0.02 * est;
      }
      P.lA = P.rA = 138; P.lF = P.rF = 10; P.lC = P.rC = 10; P.lCz = P.rCz = 18;
      P.cx = -8; P.feliz = 1; P.boca = 1; P.cejaL = P.cejaR = 0.016;
    },
    despedida: function (P, t, x) {
      var l = x.cfg.manoSaludo, sg = l === 'r' ? 1 : -1, hz = x.alba ? 2 : 1.5;
      var env = meseta(t, 0.25, 0.4, 1.1, 1.35) * x.k;
      P[l + 'A'] = 124 + 5 * onda(t, hz) * env;
      P[l + 'F'] = 10; P[l + 'C'] = 8;
      P[l + 'Cz'] = 30 + 18 * onda(t, hz, 1) * env;
      P.z = -0.05 * rampa(t, 0, 0.5) * x.m;
      P.cz = x.alba ? -10 * sg : 6 * sg;
      if (x.alba) P.guinoL = campana(t, 1.2, 1.55); else P.cierre = campana(t, 1.15, 1.6);
    },
    pensando: function (P, t, x) {
      var rem = rampa(t, 2.05, 2.4);
      if (x.alba) {
        // mano derecha en la barbilla; la lupa en la otra mano
        P.rA = -6; P.rF = 72; P.rC = 118; P.rCz = 0;
        P.lA = 24; P.lF = 52; P.lC = 72; P.lupaMano = 1;
        P.cz = 12; P.cx = -10; P.cy += 6;
        P.ojoX = 0.01; P.ojoY = 0.014;
        P.cejaL = 0.02; P.cejaR = -0.008;
        P.bocaO = 1; P.bocaLado = 0.016;
        mezclarEn(P, { rA: 36, rF: 35, rC: 50, lA: 34, lF: 38, lC: 55, encoger: 0.022, cx: 0, cz: 8,
                       ojoX: 0, ojoY: 0.006, cejaL: 0.012, cejaR: 0.012, bocaO: 0, bocaLado: 0, boca: 0.3 }, rem);
      } else {
        // despliega el mapa con la derecha y se rasca la cabeza con la izquierda
        var rasca = meseta(t, 0.5, 0.6, 1.8, 1.95) * x.k;
        P.rA = 34; P.rF = 50; P.rC = 50;
        P.mapa = rampa(t, 0.15, 0.55);
        P.lA = 160 + 5 * onda(t, 4) * rasca; P.lF = 28; P.lC = 4;
        P.lCz = 8 + 8 * onda(t, 4, 1) * rasca;
        P.encoger = 0.012;
        P.cx = 9; P.cy = -18; P.cz = -6;
        P.ojoX = -0.012; P.ojoY = -0.008;
        P.cejaL = 0.017; P.cejaR = -0.003;
        P.torcida = 1;
        mezclarEn(P, { rA: 36, rF: 35, rC: 45, lA: 36, lF: 35, lC: 45, lCz: 0, encoger: 0.024, cx: 0, cy: -8, cz: 8,
                       ojoX: 0, ojoY: 0.006, cejaL: 0.012, cejaR: 0.012, torcida: 0, boca: 0.3, mapa: 0 }, rem);
      }
    }
  };

  // ---------------------------------------------------------------- material de contorno
  function materialTinta() {
    return new THREE.ShaderMaterial({
      uniforms: { grosor: { value: 0.01 }, tinta: { value: new THREE.Vector3(TINTA[0], TINTA[1], TINTA[2]) } },
      vertexShader: [
        'uniform float grosor;',
        'void main() {',
        '  vec3 n = normalize(normalMatrix * normal);',
        '  vec4 p = modelViewMatrix * vec4(position, 1.0);',
        '  p.xyz += n * grosor;',
        '  gl_Position = projectionMatrix * p;',
        '}'
      ].join('\n'),
      fragmentShader: 'uniform vec3 tinta;\nvoid main() { gl_FragColor = vec4(tinta, 1.0); }',
      side: THREE.BackSide
    });
  }

  // ---------------------------------------------------------------- creación
  function crear(contenedor, quien, opciones) {
    try { return crearInterno(contenedor, quien, opciones || {}); }
    catch (e) { if (window.console) console.warn('Personajes3D: no se pudo crear', e); return null; }
  }

  function crearInterno(contenedor, quien, op) {
    if (!window.THREE || !contenedor) return null;
    quien = String(quien || '').toLowerCase();
    if (quien !== 'nico' && quien !== 'alba') return null;
    if (!hayWebGL()) return null;

    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    var lienzo = renderer.domElement;
    lienzo.style.display = 'block'; lienzo.style.width = '100%'; lienzo.style.height = '100%';
    contenedor.appendChild(lienzo);

    // gradiente toon de 3 tonos
    var grad = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 120, 120, 120, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;

    var cfg = quien === 'nico' ? NICO : ALBA;
    var giroBase = typeof op.giro === 'number' ? op.giro : cfg.giroBase;
    var T = new Taller(grad);
    var rig = quien === 'nico' ? construirNico(T) : construirAlba(T);
    var extra = quien === 'nico' ? extraNico : extraAlba;

    var escena = new THREE.Scene();
    escena.add(rig.raiz);
    var amb = new THREE.AmbientLight(0xffffff, 0.56 * Math.PI);
    var sol = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI);
    sol.position.set(-1.2, 2.2, 2.6);
    amb.layers.enableAll(); sol.layers.enableAll();
    escena.add(amb, sol);
    var tinta = materialTinta();
    var camara = new THREE.PerspectiveCamera(20, 1, 0.1, 30);

    // ---- estado interno
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

    function objetivo(nombre, t) {
      var P = reposo(cfg, giroBase);
      POSES[nombre](P, t, ctx);
      return P;
    }

    function cambiar(nombre) {
      copiar(snap, actual);
      estado = nombre; tEstado = 0; trans = 0;
    }

    function capas(P, dt, quieto) {
      // respiración (capa continua, fuera del fundido)
      P.resp = calmado ? 0 : (1 - Math.cos(2 * Math.PI * vida / 3)) / 2;
      // boca al hablar
      var activa = hablando || estado === 'habla';
      if (!quieto) {
        if (activa) {
          hablaReloj -= dt;
          if (hablaReloj <= 0) {
            if (Math.random() < 0.12) { hablaObj = 0; hablaReloj = 0.16 + Math.random() * 0.14; }
            else { hablaObj = [0.18, 0.5, 1][Math.floor(Math.random() * 3)]; hablaReloj = 1 / (8 + Math.random() * 4); }
          }
        } else hablaObj = 0;
        hablaVal += (hablaObj - hablaVal) * (1 - Math.exp(-dt / 0.035));
      }
      if (activa || hablaVal > 0.01) {
        P.boca = Math.max(hablaVal, P.feliz > 0.5 ? 0.4 : 0);
        P.bocaO *= 0.2; P.torcida *= 0.3;
        P.cejaL += 0.008 * hablaVal * hablaVal; P.cejaR += 0.008 * hablaVal * hablaVal;
      }
      return activa;
    }

    function parpadeo() {
      var a = ahoraS();
      if (a >= proxParpadeo) {
        iniParpadeo = a; doble = Math.random() < 0.25;
        proxParpadeo = a + 2.5 + Math.random() * 2.5 + (doble ? 0.3 : 0);
      }
      var tp = a - iniParpadeo, c = 0;
      if (tp < 0.12) c = campana(tp, 0, 0.12);
      else if (doble && tp > 0.2 && tp < 0.32) c = campana(tp, 0.2, 0.32);
      parpadeando = tp < (doble ? 0.33 : 0.13);
      return c;
    }

    function muelles(P, dt) {
      var vy = (P.y - yPrev) / dt, ay = (vy - vyPrev) / dt;
      yPrev = P.y; vyPrev = vy;
      ay = Math.max(-60, Math.min(60, ay));
      muelle.v += (-247 * muelle.x - 7.5 * muelle.v + 5 * ay) * dt;
      muelle.x = Math.max(-0.5, Math.min(0.5, muelle.x + muelle.v * dt));
      return Math.abs(muelle.x) > 0.002 || Math.abs(muelle.v) > 0.02;
    }

    function aplicar(P, cierre) {
      var r = rig;
      r.raiz.position.set(0, P.y, P.z);
      r.raiz.scale.set(P.sx, P.sy, P.sx);
      r.cuerpo.rotation.y = (giroBase + P.giro) * G;
      r.torso.scale.set(1 + 0.01 * P.resp, 1 + 0.022 * P.resp, 1 + 0.01 * P.resp);
      r.cabeza.position.y = cfg.cuelloY + 0.004 * P.resp;
      r.cabeza.rotation.set(P.cx * G, P.cy * G, P.cz * G);
      ['l', 'r'].forEach(function (l) {
        var b = r.brazos[l];
        b.hombro.position.y = cfg.hombroY + P.encoger + 0.003 * P.resp;
        b.hombro.rotation.set(-P[l + 'F'] * G, b.s * P[l + 'T'] * G, b.s * P[l + 'A'] * G);
        b.codo.rotation.set(-P[l + 'C'] * G, 0, b.s * P[l + 'Cz'] * G);
        var o = r.ojos[l];
        o.ojo.position.set(P.ojoX, P.ojoY, 0);
        var g = l === 'l' ? P.guinoL : P.guinoR;
        o.ojo.scale.y = Math.max(0.08, 1 - 0.92 * Math.max(cierre, P.cierre, g));
        o.ojo.visible = P.feliz < 0.5;
        o.feliz.visible = P.feliz >= 0.5;
        var ce = r.cejas[l];
        ce.position.y = l === 'l' ? P.cejaL : P.cejaR;
        ce.rotation.z = (l === 'l' ? -1 : 1) * P.cejaInc * G;
      });
      // boca
      var abierta = P.boca > 0.12 || P.bocaO > 0.3;
      r.sonrisa.visible = !abierta;
      r.bocaAbierta.visible = abierta;
      r.boca.position.x = P.bocaLado;
      r.boca.rotation.z = 15 * G * P.torcida;
      r.boca.scale.x = 1 - 0.4 * P.torcida;
      if (abierta) {
        var w = cfg.boca.w * 0.5, h = cfg.boca.h * Math.max(0.18, P.boca);
        r.bocaAbierta.scale.set(lerp(w, w * 0.62, P.bocaO), lerp(h, w * 0.9, P.bocaO), 0.022);
      }
      r.dedo.visible = P.dedo > 0.05;
      r.dedo.scale.setScalar(Math.max(0.05, P.dedo));
      extra(r, P, muelle.x);
    }

    function actualizar(dt) {
      vida += dt; tEstado += dt;
      if (DURACION[estado] && tEstado >= DURACION[estado]) cambiar('espera');
      var obj = objetivo(estado, tEstado);
      var enTrans = trans < 1;
      if (enTrans) {
        trans = Math.min(1, trans + dt / TRANSICION);
        var w = suave(trans);
        for (var k in obj) actual[k] = lerp(snap[k], obj[k], w);
      } else copiar(actual, obj);
      copiar(final, actual);
      var habla = capas(final, dt, false);
      var c = parpadeo();
      var mov = muelles(final, dt);
      aplicar(final, c);
      var dinamico = !calmado || !!DURACION[estado] || estado === 'habla' || (estado === 'explica' && tEstado < 2);
      lento = !enTrans && estado === 'espera' && !habla && hablaVal < 0.01 && !parpadeando && !mov;
      return enTrans || dinamico || habla || hablaVal > 0.01 || parpadeando || mov;
    }

    function pintar() {
      renderer.clear();
      camara.layers.set(1); escena.overrideMaterial = tinta;
      renderer.render(escena, camara);
      camara.layers.set(0); escena.overrideMaterial = null;
      renderer.render(escena, camara);
    }

    function pedirFrame() {
      if (temporizador) { clearTimeout(temporizador); temporizador = 0; }
      if (!raf && !destruido && !congelado && !document.hidden) raf = requestAnimationFrame(tick);
    }

    function dormir() {
      // nada se mueve: no pintamos hasta el siguiente parpadeo
      var espera = Math.max(0.05, proxParpadeo - ahoraS());
      temporizador = setTimeout(function () { temporizador = 0; pedirFrame(); }, espera * 1000);
    }

    function tick(ms) {
      raf = 0;
      if (destruido || congelado || document.hidden) return;
      var ahora = ms / 1000;
      if (ultimo && lento && ahora - ultimo < 0.031) { pedirFrame(); return; }   // la espera va a ~30 fps
      var dt = ultimo ? Math.min(0.05, Math.max(0.001, ahora - ultimo)) : 1 / 60;
      ultimo = ahora;
      var vivo = actualizar(dt);
      pintar();
      if (vivo) pedirFrame(); else { ultimo = 0; dormir(); }
    }

    function ajustar() {
      if (destruido) return;
      var w = contenedor.clientWidth || 300, h = contenedor.clientHeight || 300;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      var asp = w / h, retrato = op.encuadre === 'retrato';
      // cuerpo: de y −0,05 a 1,27 (cabe el salto de «celebra» con el tupé estirado)
      var cy = retrato ? cfg.cabezaY + 0.04 : 0.61;
      var mitadH = Math.max(retrato ? 0.3 : 0.66, (retrato ? 0.44 : 0.46) / asp);
      var d = mitadH / Math.tan(10 * G);
      camara.aspect = asp;
      camara.position.set(0, cy + 0.12, d);
      camara.lookAt(0, cy, 0);
      camara.updateProjectionMatrix();
      tinta.uniforms.grosor.value = Math.max(0.0095, 1.25 * (2 * mitadH / h));
      if (congelado) pintar(); else pedirFrame();
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
    pintar();
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
        copiar(snap, actual); trans = 0;      // fundido también al cambiar de modo
        congelado = false; ultimo = 0; pedirFrame();
      },
      // Ayuda para pruebas y capturas: deja quieto el fotograma del gesto en el segundo t.
      fotograma: function (nombre, t) {
        if (destruido || ESTADOS.indexOf(nombre) < 0) return;
        congelado = true;
        if (raf) cancelAnimationFrame(raf); raf = 0;
        estado = nombre; tEstado = t || 0; trans = 1;
        copiar(actual, objetivo(nombre, tEstado)); copiar(snap, actual); copiar(final, actual);
        final.resp = 0;
        if (nombre === 'habla' || hablando) { final.boca = 0.65; final.bocaO = 0; final.torcida = 0; }
        muelle.x = muelle.v = 0; yPrev = final.y; vyPrev = 0;
        aplicar(final, 0);
        pintar();
      },
      info: { mallas: T.mallas, conContorno: T.conContorno },
      destruir: function () {
        if (destruido) return;
        destruido = true;
        if (raf) cancelAnimationFrame(raf);
        if (temporizador) clearTimeout(temporizador);
        document.removeEventListener('visibilitychange', alVisibilidad);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', ajustar);
        T.liberar(); tinta.dispose(); grad.dispose();
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        if (lienzo.parentNode) lienzo.parentNode.removeChild(lienzo);
      }
    };
  }

  window.Personajes3D = { crear: crear, estados: ESTADOS.slice() };
})();
