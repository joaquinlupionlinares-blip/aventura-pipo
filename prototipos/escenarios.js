/*
 * escenarios.js · Fondos 3D de «Las aventuras de Nico y Alba».
 * Script clásico: necesita window.THREE (three.js r158, vendor/three.min.js). Sin módulos ni complementos.
 *
 * Uso:
 *   var info = Escenarios.construir(scene, 'bosque-letras', { vertical: false });
 *   // info.camara = { pos:[x,y,z], mira:[x,y,z], fov }, info.exposicion
 *
 * Reglas de composición (comunes a todos los lugares):
 *   - Los protagonistas van a los lados y al fondo; el centro queda tranquilo y con poco contraste,
 *     porque ahí irá la tarjeta de la actividad. La mitad inferior también se tapa con botones.
 *   - En vertical, la vista es más estrecha: las posiciones laterales se comprimen con L(x).
 *   - Todo es determinista (semilla fija): cada render del mismo lugar sale igual.
 */
(function () {
  'use strict';
  var T = window.THREE;
  var PI = Math.PI;

  // ---------------------------------------------------------------- azar y ruido
  var rnd = Math.random;
  function semilla(s) {
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function r(a, b) { return a + (b - a) * rnd(); }
  function elegir(l) { return l[Math.floor(rnd() * l.length)]; }
  function hash(i, j) {
    var h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function suave(t) { return t * t * (3 - 2 * t); }
  function paso(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return suave(t); }
  function ruido(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = suave(x - ix), fz = suave(z - iz);
    var a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    var ab = a + (b - a) * fx, cd = c + (d - c) * fx;
    return ab + (cd - ab) * fz;
  }
  function fbm(x, z, oct) {
    var s = 0, amp = 0.5, f = 1, n = oct || 4, tot = 0;
    for (var i = 0; i < n; i++) { s += amp * ruido(x * f + i * 17.3, z * f - i * 9.1); tot += amp; f *= 2.03; amp *= 0.5; }
    return s / tot; // 0..1
  }
  function colina(x, z, cx, cz, rx, rz, h) {
    var dx = (x - cx) / rx, dz = (z - cz) / rz;
    return h * Math.exp(-(dx * dx + dz * dz) * 2.2);
  }

  // ---------------------------------------------------------------- contexto del lugar en construcción
  var E = null;
  function C(hex) { return new T.Color(hex); }
  function V(x, y, z) { return new T.Vector3(x, y, z); }
  function L(x) { return x * E.K; } // comprime lo lateral en vertical
  function alt(x, z) { return E.alt ? E.alt(x, z) : 0; }
  function mitadAncho(z) { return (E.cam[2] - z) * E.tanH; } // media anchura visible a la profundidad z

  function mat(color, o) {
    o = o || {};
    var m = new T.MeshStandardMaterial({ color: color, roughness: o.rug === undefined ? 0.75 : o.rug, metalness: o.metal || 0 });
    if (o.emisivo) { m.emissive = C(o.emisivo); m.emissiveIntensity = o.brillo === undefined ? 0.6 : o.brillo; }
    if (o.opacidad !== undefined) { m.transparent = true; m.opacity = o.opacidad; }
    if (o.doble) m.side = T.DoubleSide;
    if (o.plano) m.flatShading = true;
    if (o.sinNiebla) m.fog = false;
    return m;
  }
  function malla(geo, material, sombra) {
    var m = new T.Mesh(geo, material);
    m.castShadow = sombra !== false; m.receiveShadow = true;
    return m;
  }
  function sombras(obj, emite) {
    obj.traverse(function (o) { if (o.isMesh) { o.castShadow = emite !== false; o.receiveShadow = true; } });
    return obj;
  }
  function poner(obj, x, z, dy) { obj.position.set(x, alt(x, z) + (dy || 0), z); E.scene.add(obj); return obj; }
  function mirarX(obj, extra) { obj.rotation.y = Math.atan2(-(E.cam[2] - obj.position.z), E.cam[0] - obj.position.x) + (extra || 0); return obj; }
  function mirarCamara(obj, extra) { obj.rotation.y = Math.atan2(E.cam[0] - obj.position.x, E.cam[2] - obj.position.z) + (extra || 0); return obj; }

  function instancias(geo, material, lista, sombra) {
    if (!lista.length) return null;
    var m = new T.InstancedMesh(geo, material, lista.length), o = new T.Object3D(), c = new T.Color();
    for (var i = 0; i < lista.length; i++) {
      var it = lista[i];
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      if (typeof it.s === 'number') o.scale.setScalar(it.s); else o.scale.set(it.s[0], it.s[1], it.s[2]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(it.c || '#FFFFFF'));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = !!sombra; m.receiveShadow = true; m.frustumCulled = false;
    E.scene.add(m);
    return m;
  }

  // esfera abollada (copas, nubes, rocas): indexada para que el sombreado sea suave
  function bolaGeo(abollado, segA, segB) {
    var g = new T.SphereGeometry(1, segA || 16, segB || 12), p = g.attributes.position, v = new T.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      var k = 1 + abollado * (ruido(v.x * 2.1 + 5 + v.y * 1.3, v.z * 2.1 - v.y * 1.7) - 0.5) * 2;
      p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- cielo, luz y terreno
  function cielo(o) {
    var g = new T.SphereGeometry(1500, 48, 32), p = g.attributes.position, cols = [], c = new T.Color(), v = new T.Vector3();
    var ca = C(o.arriba), cm = C(o.medio), ch = C(o.horizonte), cs = C(o.halo || '#FFF3D6');
    var sd = V(-0.6, 0.32, -0.74).normalize();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      var t = Math.max(0, v.y);
      if (t < 0.16) c.copy(ch).lerp(cm, suave(t / 0.16)); else c.copy(cm).lerp(ca, Math.pow((t - 0.16) / 0.84, 0.65));
      c.lerp(cs, Math.pow(Math.max(0, v.dot(sd)), 7) * (o.fuerzaHalo === undefined ? 0.6 : o.fuerzaHalo));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    var m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10;
    E.scene.add(m);
    E.scene.fog = new T.Fog(C(o.niebla || o.horizonte), o.cerca || 45, o.lejos || 300);
  }

  function luces(o) {
    o = o || {};
    var hemi = new T.HemisphereLight(C(o.cielo || '#BFE3FF'), C(o.suelo || '#8A7A5A'), o.hemi === undefined ? 0.95 : o.hemi);
    E.scene.add(hemi);
    var sol = new T.DirectionalLight(C(o.sol || '#FFF1DC'), (o.fuerza === undefined ? 2.7 : o.fuerza) * 1.25);
    var obj = o.objetivo || [0, 0, -8];
    var dir = o.dir || [-0.62, 0.72, 0.32]; // arriba a la izquierda, algo hacia la cámara
    sol.position.set(obj[0] + dir[0] * 90, obj[1] + dir[1] * 90, obj[2] + dir[2] * 90);
    sol.target.position.set(obj[0], obj[1], obj[2]);
    sol.castShadow = true;
    sol.shadow.mapSize.set(4096, 4096);
    var s = o.alcanceSombra || 46;
    sol.shadow.camera.left = -s; sol.shadow.camera.right = s; sol.shadow.camera.top = s; sol.shadow.camera.bottom = -s;
    sol.shadow.camera.near = 10; sol.shadow.camera.far = 220;
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.04; sol.shadow.radius = 4;
    E.scene.add(sol); E.scene.add(sol.target);
    return sol;
  }

  // terreno: rejilla más densa cerca de la cámara y más ancha a lo lejos
  function terreno(o) {
    var nx = o.nx || 240, nz = o.nz || 200, zc = o.cerca === undefined ? 40 : o.cerca, zf = o.lejos === undefined ? -520 : o.lejos;
    var g = new T.PlaneGeometry(1, 1, nx, nz), p = g.attributes.position, cols = [], c = new T.Color();
    for (var i = 0; i < p.count; i++) {
      var u = p.getX(i) + 0.5, w = p.getY(i) + 0.5;
      var z = zc - (zc - zf) * Math.pow(w, 2.1);
      var ancho = 90 + (zc - z) * 2.6;
      var x = (u - 0.5) * ancho;
      var y = o.alt(x, z);
      p.setXYZ(i, x, y, z);
      o.color(x, y, z, c);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    var m = new T.Mesh(g, o.material || new T.MeshStandardMaterial({ vertexColors: true, roughness: o.rug || 0.95 }));
    m.receiveShadow = true;
    E.scene.add(m);
    return m;
  }

  function camino(z, x0, x1, z0, z1, ond) { // centro de un camino serpenteante
    var t = paso(z0, z1, z);
    return x0 + (x1 - x0) * t + Math.sin(z * 0.16) * (ond === undefined ? 1.6 : ond) * (1 - t * 0.6);
  }

  // ---------------------------------------------------------------- vegetación
  function pradera(o) {
    var hierba = [], flores = [], tallos = [];
    var cols = o.hierba || ['#6CBB55', '#78C35E', '#86CB66', '#62B252', '#93D16A'];
    var fcol = o.flores || ['#FF7A8A', '#FFD23F', '#FFFFFF', '#B58CFF', '#FF9F43', '#6EC6FF'];
    var z0 = o.zCerca === undefined ? 24 : o.zCerca, z1 = o.zLejos === undefined ? -30 : o.zLejos;
    var i, x, z, y, hw;
    for (i = 0; i < (o.nHierba || 3500); i++) {
      z = z0 - Math.pow(rnd(), 1.4) * (z0 - z1);
      hw = mitadAncho(z) + 3;
      x = r(-hw, hw);
      if (o.evitar && o.evitar(x, z)) continue;
      y = alt(x, z);
      var s = r(0.5, 1.0) * (1 + (E.cam[2] - z) * 0.02);
      hierba.push({ x: x, y: y - 0.05, z: z, ry: r(0, 6.3), rx: r(-0.25, 0.25), rz: r(-0.25, 0.25), s: [s, s * r(0.6, 1.1), s], c: elegir(cols) });
    }
    for (i = 0; i < (o.nFlores || 700); i++) {
      z = Math.min(z0, 19) - Math.pow(rnd(), 1.2) * (Math.min(z0, 19) - z1);
      hw = mitadAncho(z) + 2;
      // más flores en los lados que en el centro
      var lado = rnd() < 0.5 ? -1 : 1, f = Math.pow(rnd(), 0.6);
      x = lado * (o.centroLibre === undefined ? 3 : o.centroLibre) * E.K + lado * f * hw;
      if (o.evitar && o.evitar(x, z)) continue;
      y = alt(x, z);
      var h = r(0.16, 0.3), sc = r(0.6, 0.95) * (1 + (E.cam[2] - z) * 0.022);
      var col = o.colorFlor ? o.colorFlor(x, z) : elegir(fcol);
      flores.push({ x: x, y: y + h * sc, z: z, ry: r(0, 6), rx: r(-0.3, 0.3), s: [sc, sc * 0.6, sc], c: col });
      tallos.push({ x: x, y: y, z: z, s: [sc, h * sc, sc], c: '#4F9A45' });
    }
    var gH = new T.ConeGeometry(0.075, 0.38, 3, 1); gH.translate(0, 0.17, 0);
    instancias(gH, mat('#FFFFFF', { rug: 0.9 }), hierba, false);
    var gF = new T.IcosahedronGeometry(0.1, 1);
    instancias(gF, mat('#FFFFFF', { rug: 0.6 }), flores, false);
    var gT = new T.CylinderGeometry(0.02, 0.025, 1, 4); gT.translate(0, 0.5, 0);
    instancias(gT, mat('#FFFFFF'), tallos, false);
  }

  var GEO = {};
  function geoCopa() { return GEO.copa || (GEO.copa = bolaGeo(0.1, 18, 14)); }
  function arboles(lista, o) {
    o = o || {};
    var troncos = [], copas = [];
    lista.forEach(function (a) {
      var y = alt(a.x, a.z), h = a.h || 5, rc = a.r || h * 0.42;
      troncos.push({ x: a.x, y: y - 0.2, z: a.z, s: [rc * 0.32, h * 0.72, rc * 0.32], ry: r(0, 6), c: a.tronco || '#8A5A3B' });
      var base = C(a.c || '#5DAE4F'), n = a.bolas || 5;
      copas.push({ x: a.x, y: y + h * 0.62 + rc * 0.55, z: a.z, s: [rc, rc * 0.9, rc], ry: r(0, 6), c: base.clone().offsetHSL(0, 0, r(-0.03, 0.03)) });
      for (var i = 0; i < n; i++) {
        var ang = i / n * PI * 2 + r(-0.3, 0.3), d = rc * r(0.55, 0.75);
        var s = rc * r(0.55, 0.75);
        copas.push({ x: a.x + Math.cos(ang) * d, y: y + h * 0.62 + rc * r(0.1, 0.75), z: a.z + Math.sin(ang) * d,
          s: [s, s * 0.9, s], ry: r(0, 6), c: base.clone().offsetHSL(r(-0.015, 0.015), r(-0.05, 0.05), r(-0.06, 0.05)) });
      }
      copas.push({ x: a.x + r(-0.3, 0.3) * rc, y: y + h * 0.62 + rc * 1.25, z: a.z, s: rc * 0.6, ry: r(0, 6), c: base.clone().offsetHSL(0, 0, 0.05) });
    });
    var gT = new T.CylinderGeometry(0.75, 1, 1, 8); gT.translate(0, 0.5, 0);
    instancias(gT, mat('#FFFFFF', { rug: 0.9 }), troncos, o.sombra !== false);
    instancias(geoCopa(), mat('#FFFFFF', { rug: 0.85 }), copas, o.sombra !== false);
  }

  function pinos(lista, o) {
    o = o || {};
    var troncos = [], conos = [];
    lista.forEach(function (a) {
      var y = alt(a.x, a.z), h = a.h || 5, base = C(a.c || '#3F8F5A');
      troncos.push({ x: a.x, y: y - 0.1, z: a.z, s: [h * 0.06, h * 0.3, h * 0.06], c: '#7A5236' });
      for (var k = 0; k < 3; k++) {
        var rr = h * (0.34 - k * 0.08), hh = h * (0.42 - k * 0.06);
        conos.push({ x: a.x, y: y + h * 0.22 + k * h * 0.22, z: a.z, s: [rr, hh, rr], ry: r(0, 6), c: base.clone().offsetHSL(0, 0, k * 0.035 + r(-0.02, 0.02)) });
      }
    });
    var gT = new T.CylinderGeometry(0.7, 1, 1, 6); gT.translate(0, 0.5, 0);
    instancias(gT, mat('#FFFFFF'), troncos, o.sombra !== false);
    var gC = new T.ConeGeometry(1, 1, 10, 1); gC.translate(0, 0.5, 0);
    instancias(gC, mat('#FFFFFF', { rug: 0.85 }), conos, o.sombra !== false);
  }

  function arbustos(lista) {
    var bolas = [];
    lista.forEach(function (a) {
      var y = alt(a.x, a.z), s = a.s || 1, base = C(a.c || '#4FA04A');
      for (var i = 0; i < 4; i++) {
        var q = s * r(0.5, 0.85);
        bolas.push({ x: a.x + r(-0.8, 0.8) * s, y: y + q * 0.45, z: a.z + r(-0.5, 0.5) * s, s: [q, q * 0.8, q], ry: r(0, 6), c: base.clone().offsetHSL(0, 0, r(-0.05, 0.05)) });
      }
    });
    instancias(geoCopa(), mat('#FFFFFF', { rug: 0.85 }), bolas, true);
  }

  function piedras(lista) {
    var g = GEO.piedra || (GEO.piedra = bolaGeo(0.22, 10, 8));
    var l = lista.map(function (p) {
      var s = p.s || 1;
      return { x: p.x, y: alt(p.x, p.z) + s * 0.15, z: p.z, s: [s * r(0.9, 1.3), s * r(0.45, 0.7), s * r(0.8, 1.1)], ry: r(0, 6), c: p.c || elegir(['#B9B2A6', '#A8A196', '#C7C0B3', '#9E978C']) };
    });
    instancias(g, mat('#FFFFFF', { rug: 0.9 }), l, true);
  }

  function nube(x, y, z, s, o) {
    o = o || {};
    var g = new T.Group(), m = mat('#FFFFFF', { rug: 1, emisivo: o.tinte || '#E4F1FF', brillo: 0.55, sinNiebla: true });
    var geo = GEO.nube || (GEO.nube = bolaGeo(0.06, 20, 14));
    [[0, 0, 0, 1], [1.15, -0.22, 0.1, 0.78], [-1.1, -0.28, 0.05, 0.72], [0.45, 0.5, -0.1, 0.72], [-0.55, 0.38, 0, 0.66],
      [2.0, -0.45, 0, 0.5], [-1.95, -0.5, 0, 0.45], [0.2, -0.45, 0.4, 0.6]].forEach(function (b) {
      var q = new T.Mesh(geo, m); q.position.set(b[0], b[1], b[2]); q.scale.set(b[3], b[3] * 0.86, b[3] * 0.9); g.add(q);
    });
    g.position.set(x, y, z); g.scale.set(s * (o.ancho || 1), s, s);
    E.scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- letras y números (Shape + ExtrudeGeometry)
  function trazo(x0, y0, x1, y1, t) {
    var dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * t / 2, ny = dx / l * t / 2, ex = dx / l * t * 0.3, ey = dy / l * t * 0.3;
    var s = new T.Shape();
    s.moveTo(x0 - ex + nx, y0 - ey + ny); s.lineTo(x1 + ex + nx, y1 + ey + ny); s.lineTo(x1 + ex - nx, y1 + ey - ny); s.lineTo(x0 - ex - nx, y0 - ey - ny);
    s.closePath();
    return s;
  }
  function arco(cx, cy, rx, ry, t, a0, a1) {
    var s = new T.Shape(), n = 28, i, a;
    for (i = 0; i <= n; i++) { a = a0 + (a1 - a0) * i / n; var x = cx + Math.cos(a) * (rx + t / 2), y = cy + Math.sin(a) * (ry + t / 2); if (i) s.lineTo(x, y); else s.moveTo(x, y); }
    for (i = n; i >= 0; i--) { a = a0 + (a1 - a0) * i / n; s.lineTo(cx + Math.cos(a) * (rx - t / 2), cy + Math.sin(a) * (ry - t / 2)); }
    s.closePath();
    return s;
  }
  function anillo(cx, cy, rx, ry, t) {
    var s = new T.Shape(); s.absellipse(cx, cy, rx + t / 2, ry + t / 2, 0, PI * 2, false);
    var h = new T.Path(); h.absellipse(cx, cy, rx - t / 2, ry - t / 2, 0, PI * 2, true);
    s.holes.push(h);
    return s;
  }
  var GLIFOS = {
    A: function () { // una sola pieza con vértice plano (sin picos de trazos cruzados) y hueco triangular
      var s = new T.Shape();
      [[0, 0], [0.22, 0], [0.281, 0.25], [0.519, 0.25], [0.58, 0], [0.8, 0], [0.5, 1], [0.3, 1]].forEach(function (q, i) { if (i) s.lineTo(q[0], q[1]); else s.moveTo(q[0], q[1]); });
      s.closePath();
      var h = new T.Path(); h.moveTo(0.325, 0.43); h.lineTo(0.4, 0.74); h.lineTo(0.475, 0.43); h.closePath();
      s.holes.push(h);
      return [s];
    },
    E: function (t) { return [trazo(0.1, 0, 0.1, 1, t), trazo(0.1, 1, 0.66, 1, t), trazo(0.1, 0.52, 0.56, 0.52, t), trazo(0.1, 0, 0.68, 0, t)]; },
    I: function (t) { return [trazo(0.1, 0, 0.1, 1, t)]; },
    O: function (t) { return [anillo(0.4, 0.5, 0.31, 0.39, t)]; },
    U: function (t) { return [trazo(0.1, 1, 0.1, 0.4, t), trazo(0.64, 1, 0.64, 0.4, t), arco(0.37, 0.4, 0.27, 0.29, t, PI, 2 * PI)]; },
    M: function (t) { return [trazo(0.05, 0, 0.05, 1, t), trazo(0.05, 1, 0.42, 0.42, t), trazo(0.42, 0.42, 0.79, 1, t), trazo(0.79, 1, 0.79, 0, t)]; },
    C: function (t) { return [arco(0.42, 0.5, 0.32, 0.39, t, PI * 0.27, PI * 1.73)]; },
    S: function (t) { return [arco(0.38, 0.75, 0.24, 0.22, t, PI * 0.1, PI * 1.5), arco(0.38, 0.29, 0.26, 0.25, t, PI * 0.5, -PI * 0.95)]; },
    '1': function (t) { return [trazo(0.42, 0, 0.42, 1, t), trazo(0.42, 1, 0.14, 0.76, t), trazo(0.14, 0, 0.7, 0, t)]; },
    '2': function (t) { return [arco(0.38, 0.7, 0.26, 0.26, t, PI * 0.95, -PI * 0.25), trazo(0.565, 0.52, 0.1, 0, t), trazo(0.08, 0, 0.72, 0, t)]; },
    '3': function (t) { return [arco(0.35, 0.75, 0.25, 0.23, t, PI * 0.85, -PI * 0.5), arco(0.35, 0.27, 0.28, 0.27, t, PI * 0.5, -PI * 0.85)]; },
    '4': function (t) { return [trazo(0.56, 0, 0.56, 1, t), trazo(0.56, 1, 0.05, 0.32, t), trazo(0.05, 0.32, 0.78, 0.32, t)]; },
    '5': function (t) { return [trazo(0.16, 1, 0.68, 1, t), trazo(0.16, 1, 0.13, 0.56, t), arco(0.37, 0.32, 0.28, 0.31, t, PI * 0.78, -PI * 0.82)]; },
    '7': function (t) { return [trazo(0.05, 1, 0.72, 1, t), trazo(0.72, 1, 0.28, 0, t)]; },
    '0': function (t) { return [anillo(0.38, 0.5, 0.29, 0.39, t)]; }
  };
  function glifoGeo(ch, alto, prof, grosor) {
    var g = new T.ExtrudeGeometry(GLIFOS[ch](grosor || 0.22), { depth: prof / alto, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 3, curveSegments: 14 });
    g.computeBoundingBox();
    var bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.scale(alto, alto, alto);
    return g;
  }
  function glifo(ch, alto, prof, color, o) {
    o = o || {};
    return malla(glifoGeo(ch, alto, prof, o.grosor), mat(color, { rug: o.rug === undefined ? 0.5 : o.rug, emisivo: o.emisivo, brillo: o.brillo }));
  }

  function cajaRedonda(w, h, d, rr) {
    var s = new T.Shape(), a = w / 2 - rr, b = h / 2 - rr;
    s.moveTo(-a, -h / 2); s.lineTo(a, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -b); s.lineTo(w / 2, b);
    s.quadraticCurveTo(w / 2, h / 2, a, h / 2); s.lineTo(-a, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, b);
    s.lineTo(-w / 2, -b); s.quadraticCurveTo(-w / 2, -h / 2, -a, -h / 2);
    var g = new T.ExtrudeGeometry(s, { depth: Math.max(0.01, d - rr * 1.2), bevelEnabled: true, bevelThickness: rr * 0.6, bevelSize: rr * 0.5, bevelSegments: 3, curveSegments: 6 });
    g.center();
    return g;
  }

  // ---------------------------------------------------------------- piezas reutilizables
  function ojos(g, x, y, z, sep, tam, dir) { // ojitos negros con brillo
    var mN = mat('#2A2230', { rug: 0.3 }), mB = mat('#FFFFFF', { emisivo: '#FFFFFF', brillo: 0.5 });
    [-1, 1].forEach(function (k) {
      var o = new T.Mesh(new T.SphereGeometry(tam, 10, 8), mN);
      if (dir === 'x') o.position.set(x, y, z + k * sep); else o.position.set(x + k * sep, y, z);
      g.add(o);
      var b = new T.Mesh(new T.SphereGeometry(tam * 0.35, 6, 6), mB);
      b.position.copy(o.position).add(V(dir === 'x' ? tam * 0.75 : -tam * 0.3, tam * 0.4, dir === 'x' ? 0 : tam * 0.75));
      g.add(b);
    });
  }

  function seta(x, z, s, cap) {
    var g = new T.Group();
    var pie = malla(new T.CylinderGeometry(0.22, 0.3, 0.9, 10), mat('#FFF4DF', { rug: 0.8 })); pie.position.y = 0.45; g.add(pie);
    var som = malla(new T.SphereGeometry(0.7, 20, 12, 0, PI * 2, 0, PI * 0.5), mat(cap || '#E8553F', { rug: 0.45 }));
    som.position.y = 0.82; som.scale.y = 0.75; g.add(som);
    var base = malla(new T.CircleGeometry(0.7, 20), mat('#FFF0D8')); base.rotation.x = PI / 2; base.position.y = 0.83; g.add(base);
    var mP = mat('#FFFFFF', { rug: 0.6 });
    for (var i = 0; i < 7; i++) {
      var a = i * 2.4 + r(0, 0.4), e = r(0.35, 1.05), p = malla(new T.SphereGeometry(0.1 + r(0, 0.05), 8, 6), mP, false);
      p.position.set(Math.cos(a) * Math.sin(e) * 0.7, 0.82 + Math.cos(e) * 0.7 * 0.75, Math.sin(a) * Math.sin(e) * 0.7); p.scale.y = 0.5;
      p.lookAt(V(0, 0.4, 0)); g.add(p);
    }
    g.scale.setScalar(s || 1); g.rotation.y = r(0, 6); g.rotation.z = r(-0.12, 0.12);
    return poner(g, x, z, -0.05);
  }

  function brillitos(lista, color, tam) { // motas de luz (luciérnagas, magia)
    var l = lista.map(function (p) { return { x: p[0], y: p[1], z: p[2], s: (tam || 0.09) * r(0.7, 1.3), c: color }; });
    var m = new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, fog: false });
    return instancias(new T.IcosahedronGeometry(1, 1), m, l, false);
  }

  function estrella(rad, prof, color, o) {
    var s = new T.Shape();
    for (var i = 0; i < 10; i++) { var a = PI / 2 + i * PI / 5, rr = i % 2 ? rad * 0.48 : rad; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    var g = new T.ExtrudeGeometry(s, { depth: prof, bevelEnabled: true, bevelThickness: prof * 0.5, bevelSize: rad * 0.12, bevelSegments: 3 });
    g.center();
    return malla(g, mat(color, o || { rug: 0.5 }));
  }

  // ================================================================ LUGARES
  var LUGARES = {};

  // ---------------------------------------------------------------- portada: Colina del Viento + Mapa Mágico
  LUGARES['inicio'] = function () {
    var hx = L(24), hz = -66;
    cielo({ arriba: '#4EA8EA', medio: '#94D0F6', horizonte: '#FCEFD8', cerca: 50, lejos: 320 });
    luces({ alcanceSombra: 50 });
    var cx = function (z) { return camino(z, 0.5, hx - 1.5, 18, hz + 6, 1.4); };
    E.alt = function (x, z) {
      var y = (fbm(x * 0.05, z * 0.05) - 0.5) * 1.4 + colina(x, z, hx, hz, 32, 26, 12.5) + colina(x, z, -48, -95, 46, 32, 11)
        + colina(x, z, 55, -125, 60, 34, 15) + colina(x, z, -5, -190, 120, 50, 22) + colina(x, z, L(-26), -30, 18, 16, 3.2);
      return y;
    };
    var cPrado = C('#7CC766'), cPrado2 = C('#5DAF57'), cAlto = C('#B8DC86'), cCam = C('#EED9A6');
    terreno({ alt: E.alt, color: function (x, y, z, c) {
      c.copy(cPrado2).lerp(cPrado, fbm(x * 0.08, z * 0.08)).lerp(cAlto, paso(4, 16, y) * 0.55 + fbm(x * 0.02 + 3, z * 0.02) * 0.2);
      var d = Math.abs(x - cx(z)), ancho = 1.3 + Math.max(0, z - hz) * 0.035;
      if (z > hz - 1) c.lerp(cCam, (1 - paso(ancho * 0.7, ancho, d)) * 0.9);
    } });

    // molino de la Colina del Viento
    var mol = new T.Group();
    var cuerpo = malla(new T.CylinderGeometry(1.25, 1.65, 5.2, 20), mat('#FFF6E8', { rug: 0.8 })); cuerpo.position.y = 2.6; mol.add(cuerpo);
    var tejado = malla(new T.ConeGeometry(1.75, 2.0, 20), mat('#E8684F', { rug: 0.6 })); tejado.position.y = 6.15; mol.add(tejado);
    var pta = malla(cajaRedonda(0.85, 1.4, 0.2, 0.12), mat('#8C5A3C')); pta.position.set(0, 0.75, 1.6); mol.add(pta);
    var ven = malla(new T.CircleGeometry(0.3, 16), mat('#7FC8F0', { emisivo: '#BFE6FF', brillo: 0.3 })); ven.position.set(0, 3.6, 1.36); mol.add(ven);
    var eje = new T.Group(); eje.position.set(0, 4.7, 1.55);
    var buje = malla(new T.SphereGeometry(0.32, 14, 10), mat('#FFD23F', { rug: 0.4 })); eje.add(buje);
    ['#FF8A3D', '#3E8E5A', '#FF7F6E', '#8E6BD8'].forEach(function (cl, i) {
      var aspa = new T.Group(); aspa.rotation.z = i * PI / 2 + 0.35;
      var palo = malla(new T.BoxGeometry(0.12, 3.6, 0.1), mat('#8C5A3C')); palo.position.y = 1.9; aspa.add(palo);
      var vela = malla(cajaRedonda(0.8, 2.6, 0.06, 0.05), mat(cl, { rug: 0.7 })); vela.position.set(0.36, 2.2, 0.03); aspa.add(vela);
      [1.2, 2.2, 3.2].forEach(function (yy) { var trv = malla(new T.BoxGeometry(0.95, 0.07, 0.08), mat('#8C5A3C')); trv.position.set(0.36, yy, 0.08); aspa.add(trv); });
      eje.add(aspa);
    });
    mol.add(eje);
    mol.scale.setScalar(1.9);
    poner(mol, hx + 0.5, hz - 2.5, -0.3); mirarCamara(mol, -0.15);

    // guirnalda con las seis banderas de los lugares
    var p0 = V(hx - 11, alt(hx - 11, hz + 4) + 4.2, hz + 4), p1 = V(hx - 2.6, alt(hx - 2.6, hz) + 6.4, hz);
    [p0, p1].forEach(function (p) { var m = malla(new T.CylinderGeometry(0.08, 0.1, p.y - alt(p.x, p.z) + 0.2, 6), mat('#8C5A3C')); m.position.set(p.x, (p.y + alt(p.x, p.z)) / 2, p.z); E.scene.add(m); });
    var colsB = ['#5DBB63', '#9A8F86', '#F2C14E', '#4FC3E8', '#FF7FA8', '#9B7BE0'];
    var mid = p0.clone().lerp(p1, 0.5); mid.y -= 0.6;
    var curva = new T.QuadraticBezierCurve3(p0, mid, p1);
    E.scene.add(malla(new T.TubeGeometry(curva, 20, 0.025, 4), mat('#FFF6E8'), false));
    colsB.forEach(function (cl, i) {
      var p = curva.getPoint((i + 0.8) / 7.2), s = new T.Shape(); s.moveTo(-0.45, 0); s.lineTo(0.45, 0); s.lineTo(0, -1.05); s.closePath();
      var b = malla(new T.ShapeGeometry(s), mat(cl, { doble: true, rug: 0.6 })); b.position.copy(p); b.rotation.y = 0.35; E.scene.add(b);
    });

    // cometa sobre la colina
    var com = new T.Group(), q = [[0, 1.4], [0.95, 0], [0, -1.8], [-0.95, 0]];
    ['#FF7F6E', '#FFD23F', '#8E6BD8', '#FF8A3D'].forEach(function (cl, i) {
      var s = new T.Shape(); s.moveTo(0, 0); s.lineTo(q[i][0], q[i][1]); s.lineTo(q[(i + 1) % 4][0], q[(i + 1) % 4][1]); s.closePath();
      com.add(malla(new T.ShapeGeometry(s), mat(cl, { doble: true, rug: 0.6, sinNiebla: true })));
    });
    var cola = new T.CatmullRomCurve3([V(0, -1.8, 0), V(0.5, -3, 0), V(-0.3, -4.2, 0), V(0.6, -5.6, 0), V(0.2, -6.8, 0)]);
    com.add(malla(new T.TubeGeometry(cola, 30, 0.03, 4), mat('#FFF6E8', { sinNiebla: true }), false));
    ['#FF7F6E', '#4FC3E8', '#FFD23F', '#5DBB63'].forEach(function (cl, i) {
      var p = cola.getPoint((i + 1) / 5);
      [-1, 1].forEach(function (k) { var lazo = malla(new T.ConeGeometry(0.22, 0.45, 4), mat(cl, { sinNiebla: true })); lazo.position.copy(p).add(V(k * 0.2, 0, 0)); lazo.rotation.z = -k * PI / 2; com.add(lazo); });
    });
    com.position.set(L(E.v ? 9 : 25), E.v ? 25 : 18.5, -40); com.rotation.z = -0.35; com.scale.setScalar(1.3);
    E.scene.add(com);
    var hilo = new T.CatmullRomCurve3([com.position.clone().add(V(0, -0.5, 0)), V(L(22), 12, -46), V(hx - 3, alt(hx - 3, hz + 4) + 1, hz + 4)]);
    E.scene.add(malla(new T.TubeGeometry(hilo, 30, 0.02, 3), mat('#FFFFFF', { sinNiebla: true, opacidad: 0.7 }), false));

    // el Viento Despistado: nube grande con cara de sueño que sopla una brisa suave
    var vx = L(E.v ? -10 : -22), vy = E.v ? 27 : 19.5, vz = -38;
    var vien = nube(vx, vy, vz, 4.2, { ancho: 1.1, tinte: '#E8F2FF' });
    var cara = new T.Group(); cara.position.set(vx + 0.4, vy - 0.3, vz + 4.3); E.scene.add(cara);
    var mCara = mat('#4A5682', { rug: 0.5, sinNiebla: true });
    [-1, 1].forEach(function (k) {
      var ojo = new T.Mesh(new T.TorusGeometry(0.42, 0.09, 8, 20, PI), mCara); ojo.rotation.z = PI; ojo.position.set(k * 1.25, 0.5, 0); cara.add(ojo);
      var mej = new T.Mesh(new T.SphereGeometry(0.45, 14, 10), mat('#FFB3C1', { emisivo: '#FF9FB2', brillo: 0.35, sinNiebla: true })); mej.scale.set(1, 0.6, 0.3); mej.position.set(k * 1.95, -0.35, -0.2); cara.add(mej);
    });
    var boca = new T.Mesh(new T.TorusGeometry(0.3, 0.1, 8, 18), mat('#E07A8E', { sinNiebla: true })); boca.position.set(0.9, -0.55, 0.05); cara.add(boca);
    // brisa: remolinos blancos que salen de la boca
    var mBrisa = new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.75, fog: false });
    [[0, 0.3], [-1.6, 0.8], [1.4, 0.6]].forEach(function (d, i) {
      var pts = [], x0 = vx + 4, y0 = vy - 1 + d[0];
      for (var k = 0; k <= 40; k++) {
        var t = k / 40, x = x0 + t * (E.v ? 9 : 15) * (1 - i * 0.12), y = y0 + Math.sin(t * 5 + i) * 0.5;
        if (t > 0.72) { var a = (t - 0.72) / 0.28 * PI * 1.6; x = x0 + 0.72 * (E.v ? 9 : 15) * (1 - i * 0.12) + Math.sin(a) * 1.0; y = y0 + Math.sin(0.72 * 5 + i) * 0.5 + 1.0 - Math.cos(a) * 1.0; }
        pts.push(V(x, y, vz + 3.5));
      }
      E.scene.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 80, 0.07 * d[1] + 0.04, 5), mBrisa));
    });

    // el Mapa Mágico en su caballete (izquierda)
    var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 760;
    var x2 = cv.getContext('2d');
    var gr = x2.createRadialGradient(512, 380, 120, 512, 380, 640); gr.addColorStop(0, '#FBF0D2'); gr.addColorStop(1, '#E7CD96');
    x2.fillStyle = gr; x2.fillRect(0, 0, 1024, 760);
    function mancha(cx0, cy0, rr, cl) { x2.fillStyle = cl; x2.beginPath(); for (var i = 0; i <= 24; i++) { var a = i / 24 * PI * 2, k = rr * (0.82 + 0.18 * Math.sin(a * 3 + cx0)); x2[i ? 'lineTo' : 'moveTo'](cx0 + Math.cos(a) * k * 1.2, cy0 + Math.sin(a) * k); } x2.fill(); }
    x2.fillStyle = '#8FD3EE'; x2.beginPath(); x2.ellipse(800, 560, 220, 150, 0, 0, PI * 2); x2.fill();
    var lug = [[220, 200, 110, '#7CC766'], [500, 150, 100, '#B9A994'], [760, 230, 100, '#A6DB7E'], [820, 560, 80, '#F3DC9A'], [480, 470, 100, '#B8E0F5'], [190, 520, 95, '#C4A8E8']];
    lug.forEach(function (l) { mancha(l[0], l[1], l[2], l[3]); });
    x2.strokeStyle = '#C0563F'; x2.lineWidth = 12; x2.setLineDash([18, 22]); x2.lineCap = 'round'; x2.beginPath();
    x2.moveTo(220, 200); x2.bezierCurveTo(330, 90, 420, 110, 500, 150); x2.bezierCurveTo(620, 200, 660, 260, 760, 230);
    x2.bezierCurveTo(820, 380, 840, 430, 820, 560); x2.bezierCurveTo(700, 620, 560, 560, 480, 470); x2.bezierCurveTo(360, 420, 260, 470, 190, 520); x2.stroke(); x2.setLineDash([]);
    // iconos sencillos: árboles, montaña, olas, arcoíris, cristal
    x2.fillStyle = '#3E8E5A'; [[180, 190], [230, 160], [260, 215]].forEach(function (p) { x2.beginPath(); x2.arc(p[0], p[1], 26, 0, PI * 2); x2.fill(); });
    x2.fillStyle = '#857565'; x2.beginPath(); x2.moveTo(430, 190); x2.lineTo(500, 70); x2.lineTo(570, 190); x2.fill();
    x2.fillStyle = '#FFFFFF'; x2.beginPath(); x2.moveTo(480, 104); x2.lineTo(500, 70); x2.lineTo(520, 104); x2.fill();
    ['#FF6B6B', '#FFB347', '#FFE066', '#6FD08C', '#5BC0EB', '#9B7BE0'].forEach(function (cl, i) { x2.strokeStyle = cl; x2.lineWidth = 10; x2.beginPath(); x2.arc(480, 500, 80 - i * 10, PI, 2 * PI); x2.stroke(); });
    x2.fillStyle = '#9B7BE0'; x2.beginPath(); x2.moveTo(190, 470); x2.lineTo(220, 520); x2.lineTo(190, 580); x2.lineTo(160, 520); x2.fill();
    x2.fillStyle = '#3E8E5A'; x2.beginPath(); x2.arc(830, 540, 20, 0, PI * 2); x2.fill(); x2.fillStyle = '#A9744F'; x2.fillRect(826, 540, 8, 40);
    x2.fillStyle = '#FFFFFF'; [[700, 260], [760, 300], [800, 250]].forEach(function (p) { x2.beginPath(); x2.arc(p[0], p[1], 14, 0, PI * 2); x2.fill(); });
    // rosa de los vientos
    x2.save(); x2.translate(905, 110); x2.fillStyle = '#C0563F'; for (var k = 0; k < 4; k++) { x2.rotate(PI / 2); x2.beginPath(); x2.moveTo(0, -62); x2.lineTo(14, 0); x2.lineTo(-14, 0); x2.fill(); } x2.restore();
    x2.strokeStyle = 'rgba(140,100,50,0.35)'; x2.lineWidth = 18; x2.strokeRect(9, 9, 1006, 742);
    var tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;

    var mapa = new T.Group();
    var hoja = malla(new T.PlaneGeometry(4.2, 3.1, 8, 4), new T.MeshStandardMaterial({ map: tex, roughness: 0.9, side: T.DoubleSide }));
    var ph = hoja.geometry.attributes.position; for (var i = 0; i < ph.count; i++) ph.setZ(i, Math.sin((ph.getX(i) + 2.1) * 1.2) * 0.06); hoja.geometry.computeVertexNormals();
    mapa.add(hoja);
    [1.62, -1.62].forEach(function (y) { var rol = malla(new T.CylinderGeometry(0.15, 0.15, 4.5, 14), mat('#E3C68C', { rug: 0.85 })); rol.rotation.z = PI / 2; rol.position.set(0, y, 0.02); mapa.add(rol);
      [-1, 1].forEach(function (k) { var pom = malla(new T.SphereGeometry(0.17, 10, 8), mat('#C0563F')); pom.position.set(k * 2.3, y, 0.02); mapa.add(pom); }); });
    mapa.rotation.x = -0.18;
    var cab = new T.Group();
    var mMad = mat('#9C6A44', { rug: 0.8 });
    [[-1.4, 0.22], [1.4, -0.22]].forEach(function (d) { var pata = malla(new T.CylinderGeometry(0.09, 0.11, 5.4, 8), mMad); pata.position.set(d[0], 2.55, 0.2); pata.rotation.z = d[1]; cab.add(pata); });
    var trasera = malla(new T.CylinderGeometry(0.09, 0.11, 5.2, 8), mMad); trasera.position.set(0, 2.4, -0.9); trasera.rotation.x = -0.38; cab.add(trasera);
    var balda = malla(new T.BoxGeometry(3.4, 0.14, 0.4), mMad); balda.position.set(0, 1.45, 0.45); cab.add(balda);
    mapa.position.set(0, 3.15, 0.5); cab.add(mapa);
    cab.scale.setScalar(E.v ? 0.8 : 1.0);
    var mx = L(-7.6), mz = 8;
    poner(cab, mx, mz, -0.1); mirarCamara(cab, 0.12);
    brillitos([[mx - 2.6, 5.9, mz + 0.6], [mx + 2.4, 6.3, mz + 0.4], [mx + 2.9, 3.9, mz + 1], [mx - 3.2, 3.4, mz + 0.8], [mx, 6.8, mz + 0.4], [mx - 1.3, 6.5, mz + 0.5]].map(function (q) { return [mx + (q[0] - mx) * E.K / (E.v ? 0.8 : 1) * (E.v ? 0.8 : 1), q[1] * (E.v ? 0.85 : 1), q[2]]; }), '#FFF1A8', 0.1);
    [[mx - 2.8, 6.1, mz + 0.7, 0.22], [mx + 2.7, 5.7, mz + 0.7, 0.18], [mx + 0.1, 6.95, mz + 0.4, 0.16]].forEach(function (e) {
      var st = estrella(e[3], 0.06, '#FFE066', { emisivo: '#FFD23F', brillo: 0.9 }); st.position.set(mx + (e[0] - mx) * (E.v ? 0.8 : 1), e[1] * (E.v ? 0.85 : 1), e[2]); E.scene.add(st);
    });

    // árboles, arbustos y flores en los lados
    var ar = [];
    [[-15.5, -6, 6.5], [-21, -14, 7.5], [-12.5, -20, 5.5], [-30, -26, 8], [-13.5, 10, 7], [12.8, 6, 7.2], [16.5, -5, 6.4], [12.5, -15, 4.8], [24, -18, 7], [-8, -42, 4], [-20, -50, 5], [36, -40, 6]].forEach(function (a) {
      ar.push({ x: L(a[0]), z: a[1], h: a[2], c: elegir(['#5DAE4F', '#6CBB55', '#4F9E4B', '#7CC45A']) });
    });
    for (var t = 0; t < 26; t++) { var zz = r(-70, -110), xx = r(-90, 90); if (Math.abs(xx - hx) < 10) continue; ar.push({ x: xx, z: zz, h: r(3, 5), c: elegir(['#6CB85A', '#5AA552', '#86C567']) }); }
    arboles(ar);
    arbustos([[L(-5.5), 11, 1.0], [L(-12), 2, 1.4], [L(9), 10, 1.3], [L(9.5), 2, 1], [L(7), 14, 1.3], [L(-14), -1, 1.5]].map(function (a) { return { x: a[0], z: a[1], s: a[2] }; }));
    piedras([[L(-10), 8, 0.9], [L(-7.5), 12, 0.6], [L(10.5), 11, 0.8], [L(14), 2, 0.7], [L(-18), 11, 1.1], [hx - 4, hz + 6, 1.2]].map(function (a) { return { x: a[0], z: a[1], s: a[2] }; }));
    pradera({ nHierba: 3600, nFlores: 700, zLejos: -34, evitar: function (x, z) { return Math.abs(x - cx(z)) < (1.3 + Math.max(0, z - hz) * 0.035) * 0.9; } });
    nube(L(30), 24, -110, 5, {}); nube(L(-55), 15, -160, 6, {}); nube(L(60), 34, -190, 7, {}); nube(L(4), 36, -260, 6, { ancho: 1.4 });
    return { camara: { pos: [0, 3.4, 26], mira: [0, 4.4, 0] }, exposicion: 1.05 };
  };

  // ---------------------------------------------------------------- Bosque de las Letras
  LUGARES['bosque-letras'] = function () {
    cielo({ arriba: '#5DB4EA', medio: '#A4DAF5', horizonte: '#EAF6DC', niebla: '#E3F1D6', cerca: 26, lejos: 170, fuerzaHalo: 0.7 });
    luces({ hemi: 1.3, fuerza: 2.8 });
    var cx = function (z) { return camino(z, 0.6, -2, 20, -60, 1.8); };
    E.alt = function (x, z) {
      return (fbm(x * 0.07, z * 0.07) - 0.5) * 1.2 + colina(x, z, L(-22), -16, 16, 20, 2.5) + colina(x, z, L(22), -20, 16, 20, 2.8)
        + colina(x, z, -40, -90, 50, 40, 9) + colina(x, z, 45, -100, 50, 40, 11) + colina(x, z, 0, -150, 90, 40, 12);
    };
    var cA = C('#6DB85A'), cB = C('#8FCB6A'), cH = C('#C7B866'), cCam = C('#E8D3A2');
    terreno({ alt: E.alt, color: function (x, y, z, c) {
      c.copy(cA).lerp(cB, fbm(x * 0.1, z * 0.1)).lerp(cH, paso(0.62, 0.8, fbm(x * 0.15 + 9, z * 0.15)) * 0.45);
      c.lerp(cCam, (1 - paso(1.0, 1.9, Math.abs(x - cx(z)))) * 0.85 * paso(-70, -10, z));
    } });
    // piedras planas del camino
    var losas = [];
    for (var z = 18; z > -40; z -= 2.1) { var x = cx(z) + r(-0.4, 0.4); losas.push({ x: x, y: alt(x, z) + 0.02, z: z, s: [r(0.55, 0.75), 0.08, r(0.45, 0.6)], ry: r(0, 3), c: elegir(['#D9CFBF', '#CFC4B2', '#E2D9C9']) }); }
    instancias(new T.CylinderGeometry(1, 1, 1, 10), mat('#FFFFFF', { rug: 0.9 }), losas, false);

    // árboles: grandes enmarcando, un anillo medio y un bosque de fondo
    var verdes = ['#4FA04A', '#5DAE4F', '#3F9149', '#6DBA55', '#7BC35A'];
    var ar = [
      { x: L(-16), z: 4, h: 9, r: 3.6, c: '#4FA04A' }, { x: L(-19), z: -5, h: 10, r: 4, c: '#5DAE4F' }, { x: L(-14), z: -13, h: 7, r: 3, c: '#6DBA55' },
      { x: L(15.5), z: 1, h: 9.5, r: 3.7, c: '#5DAE4F' }, { x: L(19), z: -8, h: 10, r: 4, c: '#3F9149' }, { x: L(15), z: -15, h: 7.5, r: 3.2, c: '#7BC35A' },
      { x: L(-25), z: 8, h: 10, r: 4.2, c: '#3F9149' }, { x: L(25), z: 6, h: 10, r: 4.2, c: '#4FA04A' }
    ];
    for (var i = 0; i < 40; i++) {
      var zz = r(-22, -55), lim = mitadAncho(zz), xx = r(-lim * 1.1, lim * 1.1);
      if (Math.abs(xx) < (zz > -38 ? 9 : 4) * E.K) continue;
      
      ar.push({ x: xx, z: zz, h: r(5, 8), r: r(2, 3), c: elegir(verdes) });
    }
    for (i = 0; i < 70; i++) { var z2 = r(-60, -120), x2 = r(-120, 120); ar.push({ x: x2, z: z2, h: r(6, 10), r: r(3, 4.5), c: elegir(verdes) }); }
    arboles(ar);
    var pn = [];
    for (i = 0; i < 18; i++) { var z3 = r(-30, -70), l3 = mitadAncho(z3); var x3 = (rnd() < 0.5 ? -1 : 1) * r(0.35, 1.1) * l3; pn.push({ x: x3, z: z3, h: r(6, 9), c: elegir(['#2F7F55', '#3B8C5A']) }); }
    pinos(pn);

    // las cinco vocales, cada una sobre su peana. La x se da como fracción del ancho visible a esa profundidad:
    // así quedan dentro del encuadre en horizontal y en vertical, separadas entre sí y sin nada delante.
    var vocales = [
      // f: horizontal · fv: vertical (en vertical las letras ocupan más ancho relativo y se separan más)
      { ch: 'A', f: -0.46, fv: -0.40, z: 0, h: 3.2, cl: '#FFBE45', giro: 0.3 },
      { ch: 'E', f: -0.72, fv: -0.78, z: -6, h: 2.7, cl: '#9580E6', giro: 0.25 },
      { ch: 'O', f: 0.44, fv: 0.36, z: -4, h: 3.0, cl: '#FF8466', giro: -0.35 },
      { ch: 'U', f: 0.69, fv: 0.62, z: -9, h: 2.7, cl: '#47BFC0', giro: -0.3 },
      { ch: 'I', f: 0.86, fv: 0.86, z: 2, h: 2.4, cl: '#FF7FA8', giro: -0.2 }
    ];
    vocales.forEach(function (v) {
      v.x = (E.v ? v.fv : v.f) * mitadAncho(v.z);
      var geo = glifoGeo(v.ch, v.h, v.h * 0.28); geo.computeBoundingBox();
      v.w = geo.boundingBox.max.x - geo.boundingBox.min.x;
      var g = new T.Group();
      var peana = malla(cajaRedonda(v.w + 0.8, 0.75, v.h * 0.28 + 0.9, 0.18), mat('#E6D8BE', { rug: 0.85 }));
      peana.position.y = 0.22; g.add(peana);
      var borde = malla(cajaRedonda(v.w + 1.0, 0.18, v.h * 0.28 + 1.1, 0.08), mat('#7FBF63', { rug: 0.9 }));
      borde.position.y = -0.05; g.add(borde);
      var m = malla(geo, mat(v.cl, { rug: 0.5 })); m.position.y = 0.6; g.add(m);
      g.position.set(v.x, alt(v.x, v.z), v.z); mirarCamara(g, v.giro); E.scene.add(g);
    });
    // claro delante y alrededor de cada vocal: ahí no crece nada que pueda tapar sus trazos
    function claro(x, z) {
      for (var k = 0; k < vocales.length; k++) {
        var v = vocales[k], dz = z - v.z;
        if (Math.abs(x - v.x) < v.w / 2 + 1.3 && dz > -3.5 && dz < 11) return true;
      }
      return false;
    }
    function fuera(lista) { return lista.filter(function (a) { return !claro(a.x, a.z); }); }
    // setas junto a los troncos (nunca delante de una letra)
    fuera([[-11, 5, 0.9, '#FF8A3D'], [9.8, -2.5, 0.75, '#E8553F'], [6.5, -3, 0.5, '#FF8A3D'], [-15, -3, 1.1, '#E8553F'], [15.5, -4, 0.9, '#E8553F'],
      [-11, -18, 0.6, '#B98CFF'], [12, -20, 0.7, '#FF8A3D'], [-4.6, -3.5, 0.55, '#E8553F'], [5, -12, 0.6, '#E8553F']]
      .map(function (s) { return { x: L(s[0]), z: s[1], s: s[2], c: s[3] }; }))
      .forEach(function (s) { seta(s.x, s.z, s.s, s.c); });
    arbustos(fuera([[-9, 7, 1.3], [-16, 9, 1.8], [9, 7, 1.2], [16, 10, 1.9], [-5.5, -9, 0.9], [6, -10, 0.9], [-12, -6, 1.2], [10, -9, 1.1]].map(function (a) { return { x: L(a[0]), z: a[1], s: a[2], c: elegir(['#3F9149', '#4FA04A', '#5DAE4F']) }; })));
    piedras(fuera([[-6, 6, 0.7], [7, 5, 0.6], [-10, -6, 1], [12, -6, 0.9]].map(function (a) { return { x: L(a[0]), z: a[1], s: a[2], c: elegir(['#A7B59A', '#B8C3A8']) }; })));
    pradera({ nHierba: 5200, nFlores: 650, zLejos: -34, flores: ['#FFFFFF', '#FFD23F', '#FF9FB2', '#B58CFF'], hierba: ['#4E9E46', '#5FAE4E', '#6FBF57', '#3E8E3E'], evitar: function (x, z) { return Math.abs(x - cx(z)) < 1.2 || claro(x, z); } });

    // luz entre los árboles: rayos suaves y motas brillantes
    var motas = [];
    for (i = 0; i < 40; i++) { var zm = r(-25, 8), lm = mitadAncho(zm); var xm = (rnd() < 0.5 ? -1 : 1) * r(0.4, 1) * lm;
      // ninguna mota delante (ni muy cerca) de una vocal
      if (vocales.some(function (v) { return Math.abs(xm - v.x) < v.w / 2 + 2 && zm > v.z - 3; })) continue;
      motas.push([xm, r(1, 6), zm]); }
    brillitos(motas, '#FFF3B0', 0.07);
    nube(L(-30), 30, -150, 6, {}); nube(L(40), 36, -170, 7, {});
    return { camara: { pos: [0, 3.3, 26], mira: [0, 4.6, 0] }, exposicion: 1.08 };
  };

  // ---------------------------------------------------------------- Montaña de los Números
  LUGARES['montana-numeros'] = function () {
    cielo({ arriba: '#4AA6EC', medio: '#8FCDF7', horizonte: '#E4F3FF', cerca: 60, lejos: 380 });
    luces({ fuerza: 2.9 });
    var px = L(10), pz = -170;
    var cx = function (z) { return camino(z, 1, px * 0.6, 18, -80, 2.2); };
    E.alt = function (x, z) {
      var dx = (x - px) / 60, dz = (z - pz) / 42, d = Math.sqrt(dx * dx + dz * dz);
      var mont = 78 * Math.pow(Math.max(0, 1 - d), 1.6) * (0.85 + 0.3 * fbm(x * 0.04, z * 0.04));
      var dx2 = (x + 70) / 48, dz2 = (z + 200) / 36, d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
      var mont2 = 52 * Math.pow(Math.max(0, 1 - d2), 1.5) * (0.85 + 0.3 * fbm(x * 0.05 + 4, z * 0.05));
      var dx3 = (x - 95) / 45, dz3 = (z + 230) / 35, d3 = Math.sqrt(dx3 * dx3 + dz3 * dz3);
      var mont3 = 45 * Math.pow(Math.max(0, 1 - d3), 1.5);
      return (fbm(x * 0.06, z * 0.06) - 0.5) * 1.6 + colina(x, z, L(-19), -12, 15, 22, 8.5) + colina(x, z, L(20), -20, 14, 18, 6.5)
        + colina(x, z, -30, -75, 40, 30, 12) + colina(x, z, 40, -85, 36, 28, 10) + mont + mont2 + mont3;
    };
    var cG = C('#78C262'), cG2 = C('#5FAE57'), cR = C('#B5A592'), cR2 = C('#9C8F80'), cN = C('#FAFCFF'), cCam = C('#E9D6A8');
    terreno({ alt: E.alt, color: function (x, y, z, c) {
      c.copy(cG2).lerp(cG, fbm(x * 0.08, z * 0.08));
      var roca = paso(12, 26, y + (fbm(x * 0.1, z * 0.1) - 0.5) * 8);
      c.lerp(cR.clone().lerp(cR2, fbm(x * 0.2, z * 0.2)), roca);
      c.lerp(cN, paso(44, 52, y + (fbm(x * 0.15 + 2, z * 0.15) - 0.5) * 10));
      if (z > -85) c.lerp(cCam, (1 - paso(0.9, 1.8, Math.abs(x - cx(z)))) * 0.8);
    } });

    // escalones con números tallados (1-5) subiendo la loma de la izquierda
    var colsN = ['#FF8A3D', '#FFD23F', '#5DBB63', '#4FC3E8', '#9B7BE0'];
    for (var i = 0; i < 5; i++) {
      var sx = L(-5.8 - i * 2.4), sz = 9 - i * 4.6, sy = alt(sx, sz);
      var bl = malla(cajaRedonda(2.0, 1.5 + i * 0.05, 1.6, 0.22), mat(elegir(['#CFC4B2', '#C7BBA6', '#D8CEBD']), { rug: 0.85 }));
      bl.position.set(sx, sy + 0.55, sz); mirarCamara(bl, 0.25); E.scene.add(bl);
      var n = glifo(String(i + 1), 1.05, 0.18, colsN[i], { rug: 0.45, grosor: 0.24 });
      n.position.set(0, -0.48, 0.9); bl.add(n);
    }
    // gran roca con un 7 tallado a la derecha
    var roca = malla(bolaGeo(0.18, 18, 12), mat('#BDB09C', { rug: 0.9 }));
    roca.scale.set(3.4, 2.8, 2.4); var rx = L(12.5), rz = -6;
    roca.position.set(rx, alt(rx, rz) + 1.6, rz); E.scene.add(roca);
    var siete = glifo('7', 2.2, 0.25, '#FF7F6E', { grosor: 0.26 }); siete.position.set(rx - 0.3, alt(rx, rz) + 0.9, rz + 2.45); mirarCamara(siete); E.scene.add(siete);
    // banderín en la loma derecha y en la cima
    function bandera(x, z, h, cl) {
      var y = alt(x, z), palo = malla(new T.CylinderGeometry(0.06, 0.08, h, 6), mat('#8C5A3C')); palo.position.set(x, y + h / 2, z); E.scene.add(palo);
      var s = new T.Shape(); s.moveTo(0, 0); s.lineTo(1.3, -0.4); s.lineTo(0, -0.85); s.closePath();
      var b = malla(new T.ShapeGeometry(s), mat(cl, { doble: true })); b.position.set(x, y + h, z); b.rotation.y = -0.4; E.scene.add(b);
    }
    bandera(L(20), -20, 3.2, '#FF7F6E');
    var cimaY = alt(px, pz); var bc = malla(new T.CylinderGeometry(0.4, 0.5, 9, 6), mat('#8C5A3C')); bc.position.set(px, cimaY + 3, pz); E.scene.add(bc);
    var s = new T.Shape(); s.moveTo(0, 0); s.lineTo(6, -2); s.lineTo(0, -4); s.closePath(); var bf = malla(new T.ShapeGeometry(s), mat('#FF8A3D', { doble: true })); bf.position.set(px, cimaY + 7.5, pz); E.scene.add(bf);

    // pinos y abetos
    var pn = [];
    [[-14, 5, 6.5], [-20, -15, 7], [-25, -8, 8], [-14, -20, 6], [-26, -24, 7], [12.5, 5, 6.5], [19, -4, 7], [23, -14, 8], [15.5, -17, 6], [28, -22, 6.5]].forEach(function (a) { pn.push({ x: L(a[0]), z: a[1], h: a[2], c: elegir(['#3F8F5A', '#2F7F55', '#4A9A5E']) }); });
    for (i = 0; i < 60; i++) { var z4 = r(-35, -110), x4 = r(-110, 110); if (Math.abs(x4 - cx(z4)) < 6) continue; if (z4 > -60 && Math.abs(x4) < 10) continue; pn.push({ x: x4, z: z4, h: r(4, 8), c: elegir(['#3F8F5A', '#2F7F55', '#4A9A5E']) }); }
    pinos(pn);
    // cabra montesa con bufanda de rayas, en la loma derecha
    var cab = new T.Group(), mB = mat('#F4EEE4', { rug: 0.9 });
    var cu = malla(new T.CapsuleGeometry(0.42, 0.8, 6, 12), mB); cu.rotation.z = PI / 2; cu.position.y = 1.0; cab.add(cu);
    var ca = malla(new T.SphereGeometry(0.34, 14, 10), mB); ca.position.set(0.85, 1.5, 0); ca.scale.set(1.2, 1, 0.9); cab.add(ca);
    [-1, 1].forEach(function (k) { var cu2 = malla(new T.TorusGeometry(0.22, 0.06, 6, 12, PI * 1.1), mat('#9C7A5A')); cu2.position.set(0.7, 1.85, k * 0.14); cu2.rotation.set(0, 0, 0.6); cab.add(cu2); });
    var bu = malla(new T.TorusGeometry(0.3, 0.12, 8, 16), mat('#FF7F6E')); bu.position.set(0.55, 1.25, 0); bu.rotation.y = PI / 2; cab.add(bu);
    [[0.45, 0.2], [0.45, -0.2], [-0.45, 0.2], [-0.45, -0.2]].forEach(function (p) { var pa = malla(new T.CylinderGeometry(0.07, 0.06, 0.65, 6), mat('#D8CFC2')); pa.position.set(p[0], 0.32, p[1]); cab.add(pa); });
    ojos(cab, 1.15, 1.6, 0, 0.17, 0.05, 'x');
    cab.scale.setScalar(1.1);
    poner(cab, L(16.5), -9.5, 0); cab.rotation.y = -2.3;
    piedras([[-8, 12, 0.8], [8, 10, 0.9], [10, 2, 1.1], [-17, 4, 1.3], [21, -8, 1.5], [-26, -10, 1.6], [4, -30, 1.4], [-6, -45, 2], [12, -50, 2]].map(function (a) { return { x: L(a[0]), z: a[1], s: a[2] }; }));
    pradera({ nHierba: 4800, nFlores: 600, zLejos: -30, flores: ['#FFFFFF', '#FFD23F', '#B58CFF', '#6EC6FF'], evitar: function (x, z) { return Math.abs(x - cx(z)) < 1.1; } });
    nube(px - 22, 46, pz + 28, 7, { ancho: 1.4 }); nube(L(-40), 30, -140, 6, {}); nube(L(50), 40, -150, 6, {}); nube(L(-10), 52, -260, 8, { ancho: 1.5 });
    return { camara: { pos: [0, 3.5, 26], mira: [0, 4.8, 0] }, exposicion: 1.05 };
  };

  // ---------------------------------------------------------------- Valle Curioso
  function vaca() {
    var g = new T.Group(), mB = mat('#FBF7F0', { rug: 0.8 }), mN = mat('#3B3434', { rug: 0.7 });
    var cu = malla(new T.CapsuleGeometry(0.55, 1.0, 6, 14), mB); cu.rotation.z = PI / 2; cu.position.y = 1.25; g.add(cu);
    [[0.2, 1.62, 0.25, 0.32], [-0.5, 1.4, 0.45, 0.28], [-0.2, 1.1, -0.5, 0.3], [0.5, 1.3, -0.4, 0.22]].forEach(function (p) {
      var m = malla(new T.SphereGeometry(1, 12, 8), mN); m.position.set(p[0], p[1], p[2]); m.scale.set(p[3], p[3] * 0.8, 0.12); m.lookAt(V(p[0] * 0.3, 1.25, 0)); g.add(m);
    });
    var ca = malla(new T.SphereGeometry(0.42, 16, 12), mB); ca.position.set(1.15, 1.6, 0); g.add(ca);
    var ho = malla(new T.SphereGeometry(0.3, 14, 10), mat('#F4B1A6')); ho.scale.set(0.8, 0.75, 1.1); ho.position.set(1.45, 1.45, 0); g.add(ho);
    [-1, 1].forEach(function (k) {
      var ore = malla(new T.SphereGeometry(0.16, 10, 8), mB); ore.scale.set(0.6, 0.4, 1.2); ore.position.set(1.0, 1.85, k * 0.45); g.add(ore);
      var cue = malla(new T.ConeGeometry(0.07, 0.25, 8), mat('#F2E2B8')); cue.position.set(1.08, 2.02, k * 0.22); cue.rotation.x = k * 0.4; g.add(cue);
    });
    ojos(g, 1.42, 1.75, 0, 0.2, 0.06, 'x');
    [[0.55, 0.3], [0.55, -0.3], [-0.55, 0.3], [-0.55, -0.3]].forEach(function (p) { var pa = malla(new T.CylinderGeometry(0.13, 0.12, 0.85, 8), mB); pa.position.set(p[0], 0.42, p[1]); g.add(pa);
      var pz = malla(new T.CylinderGeometry(0.13, 0.13, 0.12, 8), mN); pz.position.set(p[0], 0.06, p[1]); g.add(pz); });
    var cola = malla(new T.CylinderGeometry(0.04, 0.04, 0.8, 5), mB); cola.position.set(-1.1, 1.1, 0); cola.rotation.z = -0.3; g.add(cola);
    return g;
  }
  function oveja() {
    var g = new T.Group(), mL = mat('#FFFDF6', { rug: 1 }), mN = mat('#4A3F3A', { rug: 0.7 });
    var geo = GEO.lana || (GEO.lana = bolaGeo(0.08, 12, 10));
    for (var i = 0; i < 12; i++) { var b = malla(geo, mL); var a = i / 12 * PI * 2; b.position.set(Math.cos(a) * 0.55, 1.0 + r(-0.15, 0.25), Math.sin(a) * 0.35); b.scale.setScalar(r(0.32, 0.42)); g.add(b); }
    var cen = malla(geo, mL); cen.position.y = 1.15; cen.scale.set(0.7, 0.5, 0.5); g.add(cen);
    var ca = malla(new T.SphereGeometry(0.28, 14, 10), mN); ca.scale.set(1.2, 1, 0.9); ca.position.set(0.85, 1.15, 0); g.add(ca);
    [-1, 1].forEach(function (k) { var o = malla(new T.SphereGeometry(0.1, 8, 6), mN); o.scale.set(0.6, 0.4, 1.4); o.position.set(0.75, 1.3, k * 0.28); g.add(o); });
    ojos(g, 1.12, 1.22, 0, 0.12, 0.045, 'x');
    [[0.35, 0.2], [0.35, -0.2], [-0.35, 0.2], [-0.35, -0.2]].forEach(function (p) { var pa = malla(new T.CylinderGeometry(0.07, 0.06, 0.7, 6), mN); pa.position.set(p[0], 0.35, p[1]); g.add(pa); });
    return g;
  }
  function cerdo() {
    var g = new T.Group(), mR = mat('#F7A9B6', { rug: 0.6 });
    var cu = malla(new T.SphereGeometry(0.62, 18, 14), mR); cu.scale.set(1.3, 0.95, 0.95); cu.position.y = 0.8; g.add(cu);
    var ca = malla(new T.SphereGeometry(0.42, 16, 12), mR); ca.position.set(0.8, 1.0, 0); g.add(ca);
    var ho = malla(new T.CylinderGeometry(0.2, 0.2, 0.16, 14), mat('#F28B9C')); ho.rotation.z = PI / 2; ho.position.set(1.2, 0.95, 0); g.add(ho);
    [-1, 1].forEach(function (k) { var n = malla(new T.SphereGeometry(0.04, 6, 6), mat('#B5576A')); n.position.set(1.28, 0.96, k * 0.07); g.add(n);
      var o = malla(new T.ConeGeometry(0.14, 0.26, 8), mR); o.position.set(0.7, 1.4, k * 0.25); o.rotation.set(k * 0.3, 0, -0.3); g.add(o); });
    ojos(g, 1.12, 1.15, 0, 0.17, 0.05, 'x');
    [[0.45, 0.28], [0.45, -0.28], [-0.45, 0.28], [-0.45, -0.28]].forEach(function (p) { var pa = malla(new T.CylinderGeometry(0.11, 0.1, 0.4, 8), mR); pa.position.set(p[0], 0.2, p[1]); g.add(pa); });
    var cola = malla(new T.TorusGeometry(0.1, 0.03, 6, 12, PI * 1.6), mR); cola.position.set(-0.82, 0.95, 0); cola.rotation.y = PI / 2; g.add(cola);
    return g;
  }
  function gallina(cl) {
    var g = new T.Group(), mB = mat(cl || '#FFFFFF', { rug: 0.8 });
    var cu = malla(new T.SphereGeometry(0.32, 14, 10), mB); cu.scale.set(1.2, 1, 0.95); cu.position.y = 0.5; g.add(cu);
    var ca = malla(new T.SphereGeometry(0.2, 12, 10), mB); ca.position.set(0.28, 0.82, 0); g.add(ca);
    var cr = malla(new T.SphereGeometry(0.08, 8, 6), mat('#E8453C')); cr.scale.set(1.2, 1, 0.5); cr.position.set(0.28, 1.03, 0); g.add(cr);
    var pi = malla(new T.ConeGeometry(0.06, 0.16, 6), mat('#FFA62B')); pi.rotation.z = -PI / 2; pi.position.set(0.5, 0.8, 0); g.add(pi);
    var co = malla(new T.ConeGeometry(0.18, 0.35, 8), mB); co.position.set(-0.38, 0.68, 0); co.rotation.z = 0.7; g.add(co);
    ojos(g, 0.43, 0.88, 0, 0.1, 0.03, 'x');
    [-1, 1].forEach(function (k) { var pa = malla(new T.CylinderGeometry(0.025, 0.025, 0.28, 4), mat('#FFA62B')); pa.position.set(0, 0.14, k * 0.1); g.add(pa); });
    return g;
  }

  LUGARES['valle-curioso'] = function () {
    cielo({ arriba: '#55B0EE', medio: '#9AD4F6', horizonte: '#F6F4DC', cerca: 50, lejos: 320 });
    luces({ fuerza: 2.8 });
    var cx = function (z) { return camino(z, 0, 3, 18, -70, 1.2); };
    E.alt = function (x, z) {
      return (fbm(x * 0.05, z * 0.05) - 0.5) * 1.0 + colina(x, z, L(-30), -15, 20, 40, 4.5) + colina(x, z, L(32), -18, 20, 40, 5)
        + colina(x, z, -55, -110, 50, 40, 14) + colina(x, z, 60, -120, 55, 40, 16) + colina(x, z, 0, -200, 140, 60, 20);
    };
    var cG = C('#84CB68'), cG2 = C('#68B85A'), cCam = C('#EBD7A6');
    var parcelas = ['#CFE07E', '#9FD27A', '#EDD67C', '#B79A70', '#7FC46A', '#DDE89A', '#A9D86F'].map(C);
    terreno({ alt: E.alt, color: function (x, y, z, c) {
      c.copy(cG2).lerp(cG, fbm(x * 0.07, z * 0.07));
      if (z < -28) { // mosaico de campos al fondo
        var u = x * 0.95 + z * 0.3, w = z - x * 0.12;
        var id = Math.floor(u / 16) * 7 + Math.floor(w / 11) * 3;
        var p = parcelas[((id % 7) + 7) % 7];
        c.lerp(p, 0.75 * paso(-28, -45, z));
        if (((id % 7) + 7) % 7 === 3) c.lerp(C('#9C8060'), (Math.sin(w * 3.0) * 0.5 + 0.5) * 0.25);
      }
      c.lerp(cCam, (1 - paso(1.0, 1.8, Math.abs(x - cx(z)))) * 0.85 * paso(-75, -20, z));
    } });

    // granero rojo a la izquierda
    var gr = new T.Group();
    var cuerpo = malla(new T.BoxGeometry(5, 3.6, 4.2), mat('#D9534A', { rug: 0.75 })); cuerpo.position.y = 1.8; gr.add(cuerpo);
    var tej = new T.Shape(); tej.moveTo(-2.9, 0); tej.lineTo(0, 2.3); tej.lineTo(2.9, 0); tej.closePath();
    var tg = malla(new T.ExtrudeGeometry(tej, { depth: 4.6, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 }), mat('#7A5A4A', { rug: 0.7 })); tg.position.set(0, 3.55, -2.3); gr.add(tg);
    var fr = new T.Shape(); fr.moveTo(-2.5, 0); fr.lineTo(0, 2.0); fr.lineTo(2.5, 0); fr.closePath();
    var fg = malla(new T.ShapeGeometry(fr), mat('#D9534A')); fg.position.set(0, 3.6, 2.11); gr.add(fg);
    var mBl = mat('#FFF6E8');
    var pu = malla(new T.BoxGeometry(2.0, 2.4, 0.1), mat('#B8433C')); pu.position.set(0, 1.2, 2.12); gr.add(pu);
    [[0, 1.2, 2.2, 0.16, 2.6, 0], [0, 1.2, 2.2, 0.16, 2.9, 0.88], [0, 1.2, 2.2, 0.16, 2.9, -0.88], [0, 2.45, 2.2, 2.2, 0.16, 0], [-1.05, 1.2, 2.2, 0.16, 2.5, 0], [1.05, 1.2, 2.2, 0.16, 2.5, 0]].forEach(function (b) {
      var m = malla(new T.BoxGeometry(b[3], b[4], 0.08), mBl); m.position.set(b[0], b[1], b[2]); m.rotation.z = b[5]; gr.add(m); });
    var ve = malla(new T.CircleGeometry(0.45, 18), mat('#FFF6E8')); ve.position.set(0, 4.3, 2.14); gr.add(ve);
    var ve2 = malla(new T.CircleGeometry(0.34, 18), mat('#7B5A3A')); ve2.position.set(0, 4.3, 2.16); gr.add(ve2);
    gr.scale.setScalar(1.05);
    poner(gr, L(-15), -9, -0.1); mirarCamara(gr, 0.25);
    // valla
    var postes = [], tablas = [];
    for (var i = 0; i < 9; i++) { var vx = L(-19 + i * 1.6), vz = -2.5 + i * 0.25; postes.push({ x: vx, y: alt(vx, vz), z: vz, s: [0.14, 1.2, 0.14], c: '#F3E6CF' }); }
    for (i = 0; i < 8; i++) { var ax = L(-19 + i * 1.6 + 0.8), az = -2.5 + i * 0.25 + 0.12; [0.45, 0.9].forEach(function (h) { tablas.push({ x: ax, y: alt(ax, az) + h, z: az, ry: -Math.atan2(0.25, 1.6 * E.K), s: [1.7 * E.K + 0.1, 0.12, 0.06], c: '#F3E6CF' }); }); }
    var gp = new T.BoxGeometry(1, 1, 1); gp.translate(0, 0.5, 0);
    instancias(gp, mat('#FFFFFF'), postes, true); instancias(new T.BoxGeometry(1, 1, 1), mat('#FFFFFF'), tablas, true);

    // animales
    var v1 = vaca(); poner(v1, L(-8.2), 2.5, 0); mirarX(v1, 0.7); v1.scale.setScalar(1.1);
    var ov = [[-11, -5.5, 0.9], [-13.5, -4.2, 1.6], [-9, -6.8, 0.4]];
    ov.forEach(function (o) { var m = oveja(); poner(m, L(o[0]), o[1], 0); mirarX(m, o[2] - 0.9); });
    var ce = cerdo(); poner(ce, L(7.6), 6, 0); mirarX(ce, -0.6);
    [[9.2, -1.2, -0.5, '#FFFFFF'], [10.6, -0.3, 0.4, '#E9A25A'], [8.1, -0.1, 0.9, '#FFFFFF']].forEach(function (o) { var m = gallina(o[3]); poner(m, L(o[0]), o[1], 0); mirarX(m, o[2]); m.scale.setScalar(1.3); });

    // huerto a la derecha: coles, calabazas y zanahorias en filas
    var coles = [], calab = [], hojas = [], surcos = [];
    for (var f = 0; f < 4; f++) {
      for (var k = 0; k < 7; k++) {
        var hx = L(9 + k * 1.5 + f * 0.3), hz = -3 - f * 2.2;
        surcos.push({ x: hx, y: alt(hx, hz) - 0.05, z: hz, s: [0.9, 0.18, 0.7], c: '#9C7656' });
        if (f % 2 === 0) coles.push({ x: hx, y: alt(hx, hz) + 0.3, z: hz, s: [0.42, 0.36, 0.42], ry: r(0, 6), c: elegir(['#7CC45A', '#6CB85A', '#94D16A']) });
        else if (k % 2) calab.push({ x: hx, y: alt(hx, hz) + 0.32, z: hz, s: [0.5, 0.38, 0.5], c: elegir(['#FF9A3D', '#FFA94D']) });
        else for (var h = 0; h < 3; h++) hojas.push({ x: hx + r(-0.15, 0.15), y: alt(hx, hz) + 0.1, z: hz + r(-0.1, 0.1), rx: r(-0.4, 0.4), rz: r(-0.4, 0.4), s: [0.6, 1, 0.6], c: '#5DAE4F' });
      }
    }
    instancias(bolaGeo(0.05, 10, 8), mat('#FFFFFF', { rug: 0.9 }), surcos, false);
    instancias(bolaGeo(0.12, 14, 10), mat('#FFFFFF', { rug: 0.7 }), coles, true);
    var gCal = new T.SphereGeometry(1, 16, 10); var pc = gCal.attributes.position; for (i = 0; i < pc.count; i++) { var vv = V(pc.getX(i), pc.getY(i), pc.getZ(i)); var ang = Math.atan2(vv.z, vv.x); var kk = 1 + 0.06 * Math.cos(ang * 8); pc.setXYZ(i, vv.x * kk, vv.y, vv.z * kk); } gCal.computeVertexNormals();
    instancias(gCal, mat('#FFFFFF', { rug: 0.5 }), calab, true);
    var gHo = new T.ConeGeometry(0.06, 0.6, 4); gHo.translate(0, 0.3, 0);
    instancias(gHo, mat('#FFFFFF'), hojas, false);
    // girasoles
    [[11.6, 3.4], [12.6, 1.6], [13.2, 4.6], [11.2, 0.4], [14.2, 2.6]].forEach(function (p, j) {
      var gx = L(p[0]), gz = p[1], gy = alt(gx, gz), hh = 2.4 + j * 0.25;
      var t = malla(new T.CylinderGeometry(0.06, 0.08, hh, 6), mat('#5DA04A')); t.position.set(gx, gy + hh / 2, gz); E.scene.add(t);
      var fl = new T.Group(); fl.position.set(gx, gy + hh, gz);
      var cen = malla(new T.CylinderGeometry(0.32, 0.32, 0.12, 16), mat('#7A4A26')); cen.rotation.x = PI / 2; fl.add(cen);
      for (var q = 0; q < 14; q++) { var pet = malla(new T.SphereGeometry(0.2, 8, 6), mat('#FFC93C', { rug: 0.6 })); var aa = q / 14 * PI * 2; pet.position.set(Math.cos(aa) * 0.46, Math.sin(aa) * 0.46, -0.02); pet.scale.set(1, 0.45, 0.2); pet.rotation.z = aa; fl.add(pet); }
      mirarCamara(fl, -0.3); fl.rotation.x = -0.15; E.scene.add(fl);
    });
    // manzano y árboles
    var ar = [{ x: L(15), z: -13, h: 6, r: 3, c: '#5DAE4F' }, { x: L(-22), z: -18, h: 6.5, r: 3, c: '#6CBB55' }, { x: L(24), z: -4, h: 7, r: 3.4, c: '#4F9E4B' }, { x: L(-24), z: 6, h: 7, r: 3.4, c: '#5DAE4F' }];
    for (i = 0; i < 40; i++) { var z5 = r(-45, -110), x5 = r(-120, 120); if (Math.abs(x5) < 15 && z5 > -70) continue; ar.push({ x: x5, z: z5, h: r(3, 5), r: r(1.5, 2.4), c: elegir(['#5DAE4F', '#6CBB55', '#4F9E4B']) }); }
    arboles(ar);
    var manz = [];
    for (i = 0; i < 16; i++) { var a = r(0, PI * 2), e = r(0.2, 1.3), mx = L(15) + Math.cos(a) * Math.sin(e) * 3.1, mz = -13 + Math.sin(a) * Math.sin(e) * 3.1 + 1.2; manz.push({ x: mx, y: alt(L(15), -13) + 6 * 0.62 + 3 * 0.6 + Math.cos(e) * 2.2, z: mz, s: 0.24, c: '#E8453C' }); }
    instancias(new T.SphereGeometry(1, 10, 8), mat('#FFFFFF', { rug: 0.35 }), manz, false);
    // casitas lejanas (Mi ciudad)
    [[42, -78], [50, -84], [58, -76], [46, -92], [64, -88]].forEach(function (p, j) {
      var cs = new T.Group(); var b = malla(new T.BoxGeometry(3, 2.6, 3), mat(elegir(['#FFF3E0', '#FFE6C2', '#F7EFE6']))); b.position.y = 1.3; cs.add(b);
      var t = malla(new T.ConeGeometry(2.5, 1.8, 4), mat(elegir(['#E8684F', '#D9534A', '#C96A4A']))); t.position.y = 3.5; t.rotation.y = PI / 4; cs.add(t);
      poner(cs, L(p[0]), p[1], 0); cs.rotation.y = r(-0.4, 0.4);
    });
    arbustos([[-6, 9, 1.1], [7, 10, 1.2], [-22, -4, 1.5], [21, 8, 1.5]].map(function (a) { return { x: L(a[0]), z: a[1], s: a[2] }; }));
    pradera({ nHierba: 5200, nFlores: 800, zLejos: -26, evitar: function (x, z) { return Math.abs(x - cx(z)) < 1.2 || (x > L(8) && x < L(20) && z < -1.5 && z > -11); } });
    nube(L(-34), 26, -120, 6, {}); nube(L(30), 30, -140, 6.5, {}); nube(L(-5), 42, -230, 8, { ancho: 1.4 });
    return { camara: { pos: [0, 5.0, 26], mira: [0, 4.9, 0] }, exposicion: 1.05 };
  };

  // ---------------------------------------------------------------- Isla Hello
  function palmera(x, z, alto, incl, giro) {
    var g = new T.Group(), pts = [];
    for (var i = 0; i <= 6; i++) { var t = i / 6; pts.push(V(Math.sin(t * 1.3) * incl * alto * 0.35, t * alto, 0)); }
    var curva = new T.CatmullRomCurve3(pts);
    g.add(malla(new T.TubeGeometry(curva, 24, 0.2, 8), mat('#B88A5C', { rug: 0.9 })));
    for (i = 1; i < 10; i++) { var p = curva.getPoint(i / 10), an = malla(new T.TorusGeometry(0.21, 0.05, 5, 12), mat('#9E7448')); an.position.copy(p); an.rotation.x = PI / 2; g.add(an); }
    var cima = curva.getPoint(1);
    var geo = GEO.hoja;
    if (!geo) {
      geo = GEO.hoja = new T.PlaneGeometry(1, 1, 12, 2);
      var ps = geo.attributes.position;
      for (i = 0; i < ps.count; i++) { var u = ps.getX(i) + 0.5, w = ps.getY(i); ps.setXYZ(i, u * 3.2, -u * u * 1.4 + u * 0.5 + Math.abs(w) * 0.25, w * 0.95 * Math.sin(PI * Math.min(1, u * 1.05 + 0.08))); }
      geo.computeVertexNormals();
    }
    var mH = mat('#4DAA4A', { doble: true, rug: 0.7 }), mH2 = mat('#62BC52', { doble: true, rug: 0.7 });
    for (i = 0; i < 8; i++) { var h = malla(geo, i % 2 ? mH : mH2); h.position.copy(cima); h.rotation.y = i / 8 * PI * 2 + r(-0.2, 0.2); h.rotation.z = r(-0.1, 0.25); h.scale.setScalar(r(0.9, 1.1)); g.add(h); }
    for (i = 0; i < 3; i++) { var co = malla(new T.SphereGeometry(0.2, 10, 8), mat('#7A5230')); co.position.copy(cima).add(V(Math.cos(i * 2.1) * 0.25, -0.25, Math.sin(i * 2.1) * 0.25)); g.add(co); }
    g.rotation.y = giro || 0;
    return poner(g, x, z, -0.1);
  }

  LUGARES['isla-hello'] = function () {
    cielo({ arriba: '#3FA3EA', medio: '#86CDF6', horizonte: '#D8F0FA', cerca: 50, lejos: 300, fuerzaHalo: 0.5 });
    luces({ fuerza: 3.0, hemi: 1.3 });
    var ix = L(15), iz = -18;
    E.alt = function (x, z) {
      var playa = -2.2 + paso(4, 15, z) * 2.9 + (fbm(x * 0.08, z * 0.08) - 0.5) * 0.3;
      var isla = colina(x, z, ix, iz, 20, 14, 5.5) + colina(x, z, ix + 2, iz - 2, 9, 7, 2.5);
      var islote = colina(x, z, L(-26), -62, 16, 10, 5) + colina(x, z, 70, -140, 30, 14, 6);
      return Math.max(playa, -2.2 + isla + islote);
    };
    var cA = C('#F6E2B0'), cAH = C('#E3C68E'), cV = C('#6CC25A'), cV2 = C('#4FA94C');
    terreno({ alt: E.alt, color: function (x, y, z, c) {
      c.copy(cA).lerp(cAH, paso(0.5, -0.1, y) * 0.8);
      c.lerp(cV2.clone().lerp(cV, fbm(x * 0.1, z * 0.1)), paso(1.2, 2.2, y + (fbm(x * 0.2, z * 0.2) - 0.5) * 1.2) * (z < 0 ? 1 : 0));
    } });
    // mar: color según la profundidad, espuma en la orilla
    var nx = 200, nz = 150, g = new T.PlaneGeometry(1, 1, nx, nz), p = g.attributes.position, cols = [], c = new T.Color();
    var cT = C('#5ED6D2'), cM = C('#2E9AD6'), cP = C('#2479C2'), cE = C('#F4FFFF'), cH = C('#9FD8F2');
    for (var i = 0; i < p.count; i++) {
      var u = p.getX(i) + 0.5, w = p.getY(i) + 0.5, z = 20 - 560 * Math.pow(w, 2.1), x = (u - 0.5) * (90 + (20 - z) * 2.6);
      var prof = -E.alt(x, z), y = Math.sin(x * 0.6 + z * 0.3) * 0.04 + Math.sin(x * 0.17 - z * 0.5) * 0.05;
      p.setXYZ(i, x, y, z);
      c.copy(cT).lerp(cM, paso(0.1, 1.9, prof)).lerp(cP, paso(-40, -140, z) * 0.5).lerp(cH, paso(-110, -300, z) * 0.85);
      c.lerp(cE, (1 - paso(0.0, 0.22, prof)) * 0.85);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    var mar = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 })); mar.receiveShadow = true; E.scene.add(mar);
    // destellos sobre el agua
    var dest = [];
    for (i = 0; i < 160; i++) { var dz = r(-120, 2), dl = mitadAncho(dz); dest.push({ x: r(-dl, dl), y: 0.08, z: dz, ry: r(0, 3), s: [r(0.3, 0.9) * (1 + (20 - dz) * 0.02), 1, 0.06 * (1 + (20 - dz) * 0.02)], c: '#FFFFFF' }); }
    instancias(new T.BoxGeometry(1, 0.01, 1), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55 }), dest, false);

    // isla de la derecha: palmeras, cabaña y carteles en blanco
    palmera(ix - 3.5, iz + 3, 7.5, 0.5, 0.3); palmera(ix + 1.5, iz + 1, 9, -0.25, 2.8); palmera(ix + 6, iz - 3, 7, 0.45, -0.6); palmera(L(-26) + 1, -62, 7, -0.4, 1);
    var cab = new T.Group();
    var pa = malla(new T.CylinderGeometry(1.6, 1.7, 2.2, 14), mat('#E9C48A', { rug: 0.9 })); pa.position.y = 1.1; cab.add(pa);
    var te = malla(new T.ConeGeometry(2.4, 1.9, 14), mat('#D6A04A', { rug: 0.95 })); te.position.y = 3.0; cab.add(te);
    var pu = malla(cajaRedonda(0.9, 1.4, 0.15, 0.15), mat('#8C5A3C')); pu.position.set(0, 0.75, 1.62); cab.add(pu);
    poner(cab, ix + 5, iz + 1, 0); mirarCamara(cab);
    function cartel(x, z, giro, cl) {
      var gc = new T.Group(), y = 0;
      var po = malla(new T.CylinderGeometry(0.09, 0.11, 2.6, 8), mat('#8C5A3C')); po.position.y = 1.3; gc.add(po);
      var ta = malla(cajaRedonda(1.9, 0.75, 0.14, 0.12), mat(cl || '#F3DDB0', { rug: 0.8 })); ta.position.set(0, 2.25, 0.1); gc.add(ta);
      poner(gc, x, z, y); mirarCamara(gc, giro || 0); return gc;
    }
    cartel(ix - 6.5, iz + 7.5, -0.2); cartel(ix - 3.5, iz + 9.5, -0.35, '#FFE7A8');
    // faro de rayas en el islote de la izquierda
    var faro = new T.Group();
    for (var fi = 0; fi < 4; fi++) { var tr = malla(new T.CylinderGeometry(0.9 - fi * 0.1 - 0.1, 0.9 - fi * 0.1, 1.2, 16), mat(fi % 2 ? '#FFFFFF' : '#E8553F', { rug: 0.6 })); tr.position.y = 0.6 + fi * 1.2; faro.add(tr); }
    var lin = malla(new T.CylinderGeometry(0.5, 0.5, 0.8, 12), mat('#FFF3B0', { emisivo: '#FFE27A', brillo: 0.9 })); lin.position.y = 5.2; faro.add(lin);
    var gor = malla(new T.ConeGeometry(0.7, 0.8, 12), mat('#E8553F')); gor.position.y = 6.0; faro.add(gor);
    faro.scale.setScalar(1.3); poner(faro, L(-26) - 4, -63, -0.3);
    // loro en la palmera
    var lo = new T.Group(); var lc = malla(new T.SphereGeometry(0.32, 12, 10), mat('#E8453C')); lc.scale.set(0.9, 1.25, 0.9); lo.add(lc);
    var lca = malla(new T.SphereGeometry(0.22, 12, 10), mat('#E8453C')); lca.position.set(0, 0.42, 0.06); lo.add(lca);
    var ala = malla(new T.SphereGeometry(0.2, 10, 8), mat('#2E8FD6')); ala.scale.set(0.5, 1.2, 0.8); ala.position.set(0.25, -0.05, -0.05); lo.add(ala);
    var col2 = malla(new T.ConeGeometry(0.1, 0.6, 6), mat('#FFD23F')); col2.position.set(0, -0.6, -0.1); col2.rotation.x = PI; lo.add(col2);
    var pico = malla(new T.ConeGeometry(0.07, 0.18, 6), mat('#FFD23F')); pico.rotation.x = PI / 2 + 0.6; pico.position.set(0, 0.36, 0.28); lo.add(pico);
    ojos(lo, 0, 0.5, 0.2, 0.1, 0.035);
    lo.position.set(ix - 3.5 + 1.1, alt(ix - 3.5, iz + 3) + 5.2, iz + 3.4); lo.scale.setScalar(0.9); mirarCamara(lo); E.scene.add(lo);
    // barquita con vela a la izquierda
    var bar = new T.Group();
    var cas = malla(new T.SphereGeometry(1, 24, 12, 0, PI * 2, PI * 0.5, PI * 0.5), mat('#FF7F6E', { rug: 0.5, doble: true })); cas.scale.set(2.3, 0.9, 1.0); bar.add(cas);
    var bor = malla(new T.TorusGeometry(1, 0.08, 6, 30), mat('#FFF6E8')); bor.rotation.x = PI / 2; bor.scale.set(2.3, 1.0, 1); bor.position.y = 0.02; bar.add(bor);
    var cu = malla(new T.CircleGeometry(1, 24), mat('#C98A55')); cu.rotation.x = -PI / 2; cu.scale.set(2.2, 0.95, 1); cu.position.y = -0.15; bar.add(cu);
    var mas = malla(new T.CylinderGeometry(0.06, 0.07, 3.8, 6), mat('#8C5A3C')); mas.position.y = 1.8; bar.add(mas);
    var vs = new T.Shape(); vs.moveTo(0, 0); vs.quadraticCurveTo(1.2, 1.6, 0, 3.3); vs.lineTo(0, 0);
    var vel = malla(new T.ShapeGeometry(vs, 12), mat('#FFFDF5', { doble: true, rug: 0.8 })); vel.position.set(0.1, 0.35, 0); bar.add(vel);
    var vs2 = new T.Shape(); vs2.moveTo(0, 0); vs2.lineTo(-1.6, 0); vs2.lineTo(0, 2.5); vs2.closePath();
    var vel2 = malla(new T.ShapeGeometry(vs2), mat('#FFD23F', { doble: true, rug: 0.8, emisivo: '#FFC21F', brillo: 0.25 })); vel2.position.set(-0.1, 0.45, 0); bar.add(vel2);
    var fla = new T.Shape(); fla.moveTo(0, 0); fla.lineTo(0.7, -0.2); fla.lineTo(0, -0.45); fla.closePath();
    var fl = malla(new T.ShapeGeometry(fla), mat('#4FC3E8', { doble: true })); fl.position.set(0, 3.7, 0); bar.add(fl);
    bar.scale.setScalar(1.35); bar.position.set(L(-10.5), 0.55, -9); bar.rotation.y = 0.5; bar.rotation.z = 0.04; E.scene.add(bar);
    // ondas alrededor de la barca
    [1.0, 1.35].forEach(function (k) { var o = new T.Mesh(new T.TorusGeometry(2.6 * k, 0.04, 4, 40), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5 })); o.rotation.x = PI / 2; o.scale.set(1.2, 0.7, 1); o.position.set(L(-11), 0.08, -9); E.scene.add(o); });
    // ballena a lo lejos echando agua
    var ba = new T.Group(); var lomo = malla(new T.SphereGeometry(2.2, 16, 12, 0, PI * 2, 0, PI * 0.5), mat('#4A78B8', { rug: 0.4 })); lomo.scale.set(2, 0.7, 1); ba.add(lomo);
    var cola = malla(new T.SphereGeometry(0.8, 10, 8), mat('#4A78B8')); cola.scale.set(0.4, 0.6, 1.6); cola.position.set(-4.6, 1, 0); cola.rotation.x = 0.3; ba.add(cola);
    for (i = 0; i < 6; i++) { var gt = malla(new T.SphereGeometry(0.45, 10, 8), mat('#FFFFFF', { emisivo: '#E6F6FF', brillo: 0.4 })); var aa = -PI / 2 + (i - 2.5) * 0.35; gt.position.set(1 + Math.cos(aa + PI) * 0.3 * i * 0, 2.4 + Math.sin(i * 1.7) * 0.2 + (i % 3) * 0.35, 0); gt.position.x = 1 + (i - 2.5) * 0.45; gt.position.y = 2.2 + 0.9 - Math.abs(i - 2.5) * 0.35; ba.add(gt); }
    var ch = malla(new T.CylinderGeometry(0.15, 0.25, 1.6, 8), mat('#FFFFFF', { emisivo: '#E6F6FF', brillo: 0.4 })); ch.position.set(1, 1.7, 0); ba.add(ch);
    ba.scale.setScalar(1.3); ba.position.set(L(-24), -0.1, -72); ba.rotation.y = 0.3; E.scene.add(ba);
    // gaviotas
    var mG = mat('#FFFFFF', { sinNiebla: true, rug: 0.6 });
    [[L(-14), 17, -30, 1], [L(-9), 19.5, -40, 0.8], [L(18), 21, -45, 0.9]].forEach(function (gv) {
      var gg = new T.Group();
      [-1, 1].forEach(function (k) { var a = malla(new T.TorusGeometry(0.6, 0.08, 6, 12, PI * 0.55), mG, false); a.position.x = k * 0.55; a.rotation.z = k > 0 ? PI * 0.2 : PI * 0.25; a.rotation.y = k > 0 ? 0 : PI; gg.add(a); });
      gg.position.set(gv[0], gv[1], gv[2]); gg.scale.setScalar(gv[3] * 1.4); E.scene.add(gg);
    });
    // playa en primer plano: estrellas de mar y conchas en los lados
    [[-5.5, 14, '#FF8466'], [5, 15.5, '#FFB347'], [-3.4, 18.5, '#FF7FA8'], [6.6, 12, '#FF8466']].forEach(function (s) {
      var st = estrella(0.5, 0.1, s[2], { rug: 0.6 }); st.rotation.x = -PI / 2; st.rotation.z = r(0, 3); st.position.set(L(s[0]), alt(L(s[0]), s[1]) + 0.07, s[1]); E.scene.add(st);
    });
    var conchas = [];
    for (i = 0; i < 26; i++) { var cz = r(6, 20), cl = mitadAncho(cz), cxx = (rnd() < 0.5 ? -1 : 1) * r(0.3, 1) * cl; conchas.push({ x: cxx, y: alt(cxx, cz) + 0.03, z: cz, ry: r(0, 6), s: [0.22, 0.1, 0.18], c: elegir(['#FFE9E0', '#FFD6C9', '#FFF4E0', '#F7C6D8']) }); }
    instancias(new T.SphereGeometry(1, 10, 6, 0, PI * 2, 0, PI / 2), mat('#FFFFFF', { rug: 0.4, emisivo: '#FFD9CC', brillo: 0.15 }), conchas, true);
    piedras([[-15, 8, 1.4], [-12.5, 6, 0.9], [15, 6, 1.2], [ix / E.K - 9, iz + 6, 1.1]].map(function (a) { return { x: L(a[0]), z: a[1], s: a[2], c: elegir(['#BDB2A2', '#A89E90']) }; }));
    arbustos([[ix - 1, iz + 5, 1.2], [ix + 8, iz + 3, 1.4], [ix - 8, iz + 3, 1.0]].map(function (a) { return { x: a[0], z: a[1], s: a[2], c: '#4FA94C' }; }));
    var fls = [];
    for (i = 0; i < 40; i++) { var fx = ix + r(-9, 9), fz = iz + r(-5, 6); if (E.alt(fx, fz) < 1.5) continue; fls.push({ x: fx, y: E.alt(fx, fz) + 0.15, z: fz, s: 0.8, c: elegir(['#FF7FA8', '#FFD23F', '#FF8A3D', '#FFFFFF']) }); }
    instancias(new T.IcosahedronGeometry(0.15, 1), mat('#FFFFFF'), fls, false);
    nube(L(-30), 22, -120, 5.5, {}); nube(L(25), 28, -150, 6.5, {}); nube(L(-70), 30, -220, 8, { ancho: 1.3 }); nube(L(60), 18, -200, 6, {});
    return { camara: { pos: [0, 3.6, 26], mira: [0, 4.0, 0] }, exposicion: 1.02 };
  };

  // ---------------------------------------------------------------- Lago de los Colores
  LUGARES['lago-colores'] = function () {
    cielo({ arriba: '#62B6EE', medio: '#A7D8F7', horizonte: '#FFF0F0', niebla: '#F4EEF2', cerca: 50, lejos: 330, halo: '#FFF0E0' });
    luces({ fuerza: 2.8 });
    var lz = -15;
    E.alt = function (x, z) {
      var dx = x / L(25), dz = (z - lz) / 19, d = Math.sqrt(dx * dx + dz * dz);
      var lago = -2.6 * (1 - paso(0.75, 1.05, d));
      return 0.55 + lago + (fbm(x * 0.06, z * 0.06) - 0.5) * 0.8 + colina(x, z, L(-30), -24, 18, 26, 5) + colina(x, z, L(32), -26, 20, 24, 6)
        + colina(x, z, -45, -95, 45, 30, 12) + colina(x, z, 40, -100, 45, 30, 13) + colina(x, z, 0, -170, 120, 50, 18);
    };
    var cG = C('#80CA66'), cG2 = C('#63B65A'), cOr = C('#D9C99A');
    var franjas = ['#FF6B7A', '#FFA34D', '#FFD84D', '#B58CFF', '#FF8FC8'].map(C);
    terreno({ alt: E.alt, color: function (x, y, z, c) {
      c.copy(cG2).lerp(cG, fbm(x * 0.08, z * 0.08));
      c.lerp(cOr, paso(0.6, 0.1, y) * 0.9);
      // campos de flores a franjas en las colinas del fondo
      if (z < -40 && z > -130 && y > 3) { var k = Math.floor((z + x * 0.25) / 5); c.lerp(franjas[((k % 5) + 5) % 5], 0.55 * paso(3, 6, y)); }
    } });
    // agua: refleja el cielo; más clara en la orilla
    var g = new T.CircleGeometry(1, 64, 0, PI * 2); g.rotateX(-PI / 2);
    var cols = [], p = g.attributes.position, cc = new T.Color(), cAz = C('#8ED3F2'), cTu = C('#6CCFD8'), cRo = C('#C9E8F6');
    var tintes = ['#FFB3CF', '#D3B8FF', '#9FE0F0', '#A8EDC8', '#FFE7A0'].map(C), ct = new T.Color();
    for (var i = 0; i < p.count; i++) { var rr = Math.hypot(p.getX(i), p.getZ(i)); cc.copy(cTu).lerp(cAz, paso(0.9, 0.3, rr)).lerp(cRo, paso(0.3, -0.6, p.getZ(i)) * 0.5);
      var u = (p.getX(i) + 1) / 2 * 3.999, ki = Math.floor(u); ct.copy(tintes[ki]).lerp(tintes[Math.min(4, ki + 1)], u - ki); cc.lerp(ct, 0.38 * paso(0.15, 0.85, rr)); cols.push(cc.r, cc.g, cc.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    var agua = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.1 }));
    agua.scale.set(L(27), 1, 21); agua.position.set(0, 0.02, lz); agua.receiveShadow = true; E.scene.add(agua);

    // arcoíris al fondo (translúcido, para no cargar el centro)
    var arco7 = ['#FF5E6C', '#FF9F43', '#FFDD57', '#6FD08C', '#4FC3E8', '#6C8CFF', '#B07BE6'];
    arco7.forEach(function (cl, j) {
      var tor = new T.Mesh(new T.TorusGeometry(78 - j * 3.1, 1.6, 8, 90, PI), new T.MeshBasicMaterial({ color: cl, transparent: true, opacity: 0.52, fog: false, depthWrite: false }));
      tor.position.set(L(14), -6, -230); E.scene.add(tor);
    });
    // reflejo suave del arcoíris en el agua
    arco7.forEach(function (cl, j) {
      var tor = new T.Mesh(new T.TorusGeometry(1 - j * 0.04, 0.022, 4, 60, PI), new T.MeshBasicMaterial({ color: cl, transparent: true, opacity: 0.18, fog: false, depthWrite: false }));
      tor.rotation.z = PI; tor.scale.set(L(17), 4.5, 1); tor.position.set(L(7), 0.06, -40); tor.rotation.x = -0.08; tor.renderOrder = 2; E.scene.add(tor);
    });
    // nenúfares con flores rosas en los lados del lago
    var gN = new T.CircleGeometry(1, 20, 0.3, PI * 2 - 0.6); gN.rotateX(-PI / 2);
    var nen = [];
    [[-11, -1], [-8.5, -4], [-13, -6], [-6.5, 0], [8, -2], [12.5, -9], [7, -6], [14, -3], [-12, -12], [13, -14], [-5.5, -7], [6, -11]].forEach(function (n) { nen.push({ x: L(n[0]), y: 0.06, z: n[1], ry: r(0, 6), s: r(0.8, 1.25), c: elegir(['#5DB04E', '#6CBF57', '#4FA04A']) }); });
    instancias(gN, mat('#FFFFFF', { rug: 0.5, doble: true }), nen, false);
    function loto(x, z, cl) {
      var f = new T.Group();
      for (var k = 0; k < 2; k++) for (var q = 0; q < 7; q++) { var pe = malla(new T.SphereGeometry(0.28, 10, 8), mat(k ? '#FFFFFF' : cl, { rug: 0.5 })); var a = q / 7 * PI * 2 + k * 0.4; pe.scale.set(0.45, 0.25, 1); pe.position.set(Math.cos(a) * 0.25 * (1 - k * 0.4), 0.18 + k * 0.1, Math.sin(a) * 0.25 * (1 - k * 0.4)); pe.rotation.y = -a + PI / 2; pe.rotation.x = -0.6 - k * 0.3; f.add(pe); }
      var ce = malla(new T.SphereGeometry(0.12, 8, 6), mat('#FFD23F')); ce.position.y = 0.3; f.add(ce);
      f.position.set(x, 0.05, z); f.scale.setScalar(1.3); E.scene.add(f);
    }
    loto(L(-10.6), -1.4, '#FF8FC8'); loto(L(-12.6), -6.4, '#FF8FC8'); loto(L(8.3), -2.5, '#FF7FA8'); loto(L(13.7), -3.4, '#C9A0FF'); loto(L(-5.8), -7.4, '#FFB3D1');
    // árboles de colores alrededor del lago
    var arc = ['#FF9FC0', '#FFC4DA', '#C9A0FF', '#FFD36E', '#7CC45A', '#FFA566', '#6CBB55'];
    var ar = [{ x: L(-15), z: 4, h: 7, r: 3.2, c: '#FF9FC0' }, { x: L(-23), z: -12, h: 7.5, r: 3.4, c: '#C9A0FF' }, { x: L(15), z: 2, h: 7, r: 3.2, c: '#FFD36E' }, { x: L(24), z: -14, h: 8, r: 3.6, c: '#FF9FC0' },
      { x: L(-12), z: 13, h: 8, r: 3.6, c: '#6CBB55' }, { x: L(12), z: 12, h: 8, r: 3.6, c: '#FFA566' }, { x: L(-30), z: -26, h: 7, r: 3.2, c: '#FFD36E' }, { x: L(31), z: -30, h: 7, r: 3.2, c: '#C9A0FF' }];
    for (i = 0; i < 30; i++) { var zz = r(-38, -70), xx = r(-70, 70); if (Math.abs(xx) < 12 && zz > -50) continue; ar.push({ x: xx, z: zz, h: r(4, 6.5), r: r(1.8, 2.8), c: elegir(arc) }); }
    arboles(ar);
    // caballete con un cuadro de manchas de colores y botes de pintura (izquierda)
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 400; var x2 = cv.getContext('2d');
    x2.fillStyle = '#FFFDF6'; x2.fillRect(0, 0, 512, 400);
    x2.fillStyle = '#BDE6FA'; x2.fillRect(0, 0, 512, 250); x2.fillStyle = '#8DD07A'; x2.beginPath(); x2.ellipse(256, 400, 360, 170, 0, 0, PI * 2); x2.fill();
    ['#FF5E6C', '#FF9F43', '#FFDD57', '#6FD08C', '#4FC3E8', '#B07BE6'].forEach(function (cl, j) { x2.strokeStyle = cl; x2.lineWidth = 16; x2.beginPath(); x2.arc(256, 300, 200 - j * 16, PI, 2 * PI); x2.stroke(); });
    x2.fillStyle = '#FFD23F'; x2.beginPath(); x2.arc(420, 70, 38, 0, PI * 2); x2.fill();
    var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
    var cab = new T.Group(), mMad = mat('#9C6A44');
    [[-0.9, 0.2], [0.9, -0.2]].forEach(function (d) { var pt = malla(new T.CylinderGeometry(0.07, 0.09, 3.8, 6), mMad); pt.position.set(d[0], 1.8, 0.15); pt.rotation.z = d[1]; cab.add(pt); });
    var tr = malla(new T.CylinderGeometry(0.07, 0.09, 3.6, 6), mMad); tr.position.set(0, 1.7, -0.6); tr.rotation.x = -0.35; cab.add(tr);
    var lie = malla(new T.BoxGeometry(2.3, 1.85, 0.1), new T.MeshStandardMaterial({ map: tx, roughness: 0.9 })); lie.position.set(0, 2.5, 0.3); lie.rotation.x = -0.15; cab.add(lie);
    var ba = malla(new T.BoxGeometry(2.4, 0.1, 0.35), mMad); ba.position.set(0, 1.5, 0.4); cab.add(ba);
    poner(cab, L(-8.8), 8, 0); mirarCamara(cab, 0.25);
    ['#FF5E6C', '#FFDD57', '#4FC3E8', '#B07BE6'].forEach(function (cl, j) {
      var bo = new T.Group(); var cu = malla(new T.CylinderGeometry(0.32, 0.3, 0.55, 14), mat('#EDEDED', { rug: 0.4, metal: 0.3 })); cu.position.y = 0.27; bo.add(cu);
      var pi = malla(new T.CylinderGeometry(0.29, 0.29, 0.05, 14), mat(cl, { rug: 0.3 })); pi.position.y = 0.53; bo.add(pi);
      var go = malla(new T.SphereGeometry(0.12, 8, 6), mat(cl, { rug: 0.3 })); go.scale.set(1, 1.6, 0.6); go.position.set(0.3, 0.38, 0.12); bo.add(go);
      poner(bo, L(-6.8 + (j % 2) * 0.8), 9.2 + Math.floor(j / 2) * 0.8 + (j % 2) * 0.2, 0);
    });
    // juncos en la orilla derecha
    var junc = [];
    for (i = 0; i < 40; i++) { var jx = L(r(8.5, 13)), jz = r(3, 7); junc.push({ x: jx, y: alt(jx, jz) - 0.2, z: jz, rx: r(-0.15, 0.15), rz: r(-0.15, 0.15), s: [1, r(1.4, 2.4), 1], c: elegir(['#5DA04A', '#6CB85A', '#4F9244']) }); }
    var gJ = new T.CylinderGeometry(0.03, 0.05, 1, 4); gJ.translate(0, 0.5, 0); instancias(gJ, mat('#FFFFFF'), junc, true);
    var esp = junc.filter(function (j, k) { return k % 3 === 0; }).map(function (j) { return { x: j.x, y: j.y + j.s[1] - 0.15, z: j.z, s: [0.09, 0.35, 0.09], c: '#8C5A3C' }; });
    instancias(new T.CapsuleGeometry(1, 1, 4, 8), mat('#FFFFFF'), esp, false);
    // flamenco en el agua (derecha) y patitos (izquierda)
    var fla = new T.Group(), mR = mat('#FF9EB5', { rug: 0.6 });
    var fc = malla(new T.SphereGeometry(0.5, 14, 10), mR); fc.scale.set(1.3, 0.85, 0.8); fc.position.y = 2.1; fla.add(fc);
    var cuello = new T.CatmullRomCurve3([V(0.5, 2.3, 0), V(0.75, 3.0, 0), V(0.45, 3.5, 0), V(0.7, 3.95, 0)]);
    fla.add(malla(new T.TubeGeometry(cuello, 16, 0.09, 8), mR));
    var fca = malla(new T.SphereGeometry(0.2, 12, 10), mR); fca.position.set(0.75, 4.0, 0); fla.add(fca);
    var pic = malla(new T.ConeGeometry(0.08, 0.32, 8), mat('#3A3030')); pic.position.set(0.98, 3.9, 0); pic.rotation.z = -PI / 2 - 0.5; fla.add(pic);
    ojos(fla, 0.88, 4.06, 0, 0.12, 0.03, 'x');
    var pata = malla(new T.CylinderGeometry(0.04, 0.04, 2.0, 5), mat('#F27A97')); pata.position.set(0, 1.0, 0); fla.add(pata);
    var pata2 = malla(new T.CylinderGeometry(0.04, 0.04, 0.8, 5), mat('#F27A97')); pata2.position.set(-0.2, 1.55, 0); pata2.rotation.z = 1.2; fla.add(pata2);
    fla.scale.setScalar(1.3); fla.position.set(L(10.5), -0.3, -6); mirarX(fla, 0.5); E.scene.add(fla);
    [[-7, -15, 0.6], [-5.5, -16.5, 0.45], [-4.6, -15.6, 0.45]].forEach(function (d) {
      var pa = new T.Group(), mA = mat('#FFE45C', { rug: 0.6 });
      var cu = malla(new T.SphereGeometry(0.5, 14, 10), mA); cu.scale.set(1.2, 0.8, 0.9); cu.position.y = 0.2; pa.add(cu);
      var ca = malla(new T.SphereGeometry(0.33, 12, 10), mA); ca.position.set(0.45, 0.72, 0); pa.add(ca);
      var pi2 = malla(new T.SphereGeometry(0.14, 8, 6), mat('#FF9A3D')); pi2.scale.set(1.4, 0.5, 1); pi2.position.set(0.78, 0.66, 0); pa.add(pi2);
      ojos(pa, 0.68, 0.82, 0, 0.15, 0.04, 'x');
      pa.position.set(L(d[0]), 0, d[1]); pa.scale.setScalar(d[2] * 1.5); pa.rotation.y = 0.5; E.scene.add(pa);
    });
    // mariposas de colores
    [[-9, 3.5, -2, '#FF7FA8'], [-14, 5.5, 1, '#FFD23F'], [12, 4.2, -1, '#B07BE6'], [15, 6, 2, '#4FC3E8'], [-17, 7, -6, '#FF9F43']].forEach(function (m) {
      var mp = new T.Group();
      [-1, 1].forEach(function (k) { var al = malla(new T.CircleGeometry(0.32, 12), mat(m[3], { doble: true, rug: 0.5 })); al.position.x = k * 0.3; al.rotation.y = k * 0.6; al.scale.set(1, 1.3, 1); mp.add(al); });
      mp.position.set(L(m[0]), m[1], m[2]); mp.rotation.z = r(-0.3, 0.3); E.scene.add(mp);
    });
    // flores de todos los colores en las orillas
    var arcoF = ['#FF5E6C', '#FF9F43', '#FFDD57', '#6FD08C', '#4FC3E8', '#6C8CFF', '#B07BE6', '#FF8FC8', '#FFFFFF'];
    pradera({ nHierba: 3200, nFlores: 1300, zLejos: -45, centroLibre: 2, flores: arcoF, colorFlor: function (x, z) { return arcoF[((Math.floor((x * 0.35 + z * 0.15)) % arcoF.length) + arcoF.length) % arcoF.length]; },
      evitar: function (x, z) { return E.alt(x, z) < 0.15; } });
    nube(L(-34), 30, -140, 6, {}); nube(L(-60), 24, -200, 7, {}); nube(L(55), 40, -190, 7, {});
    return { camara: { pos: [0, 3.5, 26], mira: [0, 4.3, 0] }, exposicion: 1.05 };
  };

  // ---------------------------------------------------------------- Cueva del Eco
  LUGARES['cueva-eco'] = function () {
    cielo({ arriba: '#FFD7A6', medio: '#FFE2BC', horizonte: '#FFEBD2', niebla: '#E8D3DD', cerca: 30, lejos: 170, fuerzaHalo: 0 });
    var hemi = new T.HemisphereLight(C('#FFE8D0'), C('#9A7A8A'), 1.15); E.scene.add(hemi);
    var sol = luces({ hemi: 0, fuerza: 1.5, cielo: '#FFE8D0', objetivo: [0, 0, -10], dir: [-0.5, 0.8, 0.35] });
    E.alt = function (x, z) {
      var borde = Math.abs(x) / (16 * (E.v ? 0.64 : 1) * (z > -40 ? 1 : 1 - paso(-40, -70, z) * 0.55));
      return (fbm(x * 0.12, z * 0.12) - 0.5) * 0.5 + Math.pow(paso(0.42, 1.1, borde), 1.3) * 8 * paso(-80, -66, z) + colina(x, z, L(9), -4, 6, 5, 0.6) + colina(x, z, 8, -150, 70, 30, 14) + colina(x, z, -40, -120, 40, 25, 8);
    };
    var cS = C('#E8C9A8'), cS2 = C('#D6B091'), cL = C('#C9B4D6'), cV = C('#A8D98A'), cV2 = C('#86C46E');
    terreno({ alt: E.alt, nx: 160, nz: 140, lejos: -260, color: function (x, y, z, c) {
      c.copy(cS2).lerp(cS, fbm(x * 0.15, z * 0.15)).lerp(cL, paso(0.6, 0.85, fbm(x * 0.07 + 3, z * 0.07)) * 0.5);
      c.lerp(C('#B98C84').lerp(C('#A88AA4'), fbm(x * 0.1, z * 0.1)), paso(0.6, 4.5, y) * paso(-76, -64, z));
      c.lerp(cV2.clone().lerp(cV, fbm(x * 0.05, z * 0.05)), paso(-64, -76, z));
    } });
    // paredes y techo: un túnel abollado que se estrecha hacia la boca luminosa del fondo
    var tun = new T.CylinderGeometry(1, 1, 1, 96, 80, true), p = tun.attributes.position, cols = [], c = new T.Color();
    var cP = ['#C39283', '#B3899C', '#CC9C82', '#AE8AA6', '#C9977F'].map(C), cClaro = C('#EBCDB8');
    for (var i = 0; i < p.count; i++) {
      var a = Math.atan2(p.getZ(i), p.getX(i)), t = p.getY(i) + 0.5; // t = 0 cerca, 1 fondo
      var z = 30 - t * 100, rad = 17 * (1 - paso(0.45, 1.0, t) * 0.62);
      var ca = Math.cos(a), sa = Math.sin(a);
      var n = fbm(ca * 2.6 + 10 + z * 0.02, z * 0.07 + sa * 2.6, 3), n2 = fbm(ca * 7 + z * 0.12, sa * 7 - z * 0.14, 3);
      var rr = rad * (0.84 + n * 0.34 + n2 * 0.14);
      var x = ca * rr * (E.v ? 0.78 : 1.25), y = 5 + sa * rr * 0.9;
      p.setXYZ(i, x, y, z);
      var k = fbm(ca * 1.2 + 3 + sa, z * 0.02 + sa, 2) * 4.99;
      c.copy(cP[Math.floor(k)]).lerp(cP[(Math.floor(k) + 1) % 5], k % 1).multiplyScalar(0.74 + paso(0.25, 0.8, n2) * 0.45).lerp(cClaro, paso(0.55, 0.98, t) * 0.7);
      cols.push(c.r, c.g, c.b);
    }
    tun.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); tun.computeVertexNormals();
    var pared = new T.Mesh(tun, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: T.DoubleSide }));
    pared.receiveShadow = true; E.scene.add(pared);
    sol.castShadow = false;
    // boca luminosa al fondo: se ve el prado de fuera y un resplandor cálido
    var cvb = document.createElement('canvas'); cvb.width = cvb.height = 256; var xb = cvb.getContext('2d');
    var gb = xb.createRadialGradient(128, 128, 0, 128, 128, 128); gb.addColorStop(0, 'rgba(255,246,226,0.95)'); gb.addColorStop(0.35, 'rgba(255,236,205,0.45)'); gb.addColorStop(1, 'rgba(255,230,200,0)');
    xb.fillStyle = gb; xb.fillRect(0, 0, 256, 256);
    var txb = new T.CanvasTexture(cvb); txb.colorSpace = T.SRGBColorSpace;
    var resp = new T.Sprite(new T.SpriteMaterial({ map: txb, transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending, opacity: 0.18 }));
    resp.scale.set(34, 26, 1); resp.position.set(0, 5, -62); resp.renderOrder = 5; E.scene.add(resp);
    var luzBoca = new T.PointLight(C('#FFE7C4'), 180, 80, 1.6); luzBoca.position.set(0, 6, -50); E.scene.add(luzBoca);

    // cristales de colores que brillan, a los lados
    function cristales(x, z, cl, n, esc, y0) {
      var g = new T.Group(), m = mat(cl, { rug: 0.12, metal: 0.05, emisivo: cl, brillo: 0.55 });
      for (var k = 0; k < n; k++) {
        var h = r(0.9, 2.3) * esc * (k === 0 ? 1.4 : 1), rd = r(0.2, 0.36) * esc;
        var cr = new T.Group();
        var cu = malla(new T.CylinderGeometry(rd, rd * 1.05, h, 6), m); cu.position.y = h / 2; cr.add(cu);
        var pu = malla(new T.ConeGeometry(rd, rd * 1.8, 6), m); pu.position.y = h + rd * 0.9; cr.add(pu);
        cr.position.set(k ? r(-0.7, 0.7) * esc : 0, 0, k ? r(-0.5, 0.5) * esc : 0); cr.rotation.set(k ? r(-0.5, 0.5) : 0.05, r(0, 6), k ? r(-0.55, 0.55) : -0.08);
        g.add(cr);
      }
      poner(g, x, z, (y0 || 0) - 0.1);
      var luz = new T.PointLight(C(cl), 45 * esc, 16, 2); luz.position.set(x, alt(x, z) + 1.8 * esc, z + 1); E.scene.add(luz);
      return g;
    }
    cristales(L(-11), 2, '#B07BE6', 6, 1.3); cristales(L(-14.5), -6, '#4FC3E8', 5, 1.5); cristales(L(-9), -16, '#FF8FC8', 4, 1.1);
    cristales(L(11.5), 1, '#4FD8C4', 6, 1.3); cristales(L(14), -8, '#FFB347', 5, 1.5); cristales(L(8.5), -18, '#8E9BFF', 4, 1.1);
    cristales(L(-17), 9, '#FF8FC8', 4, 1.2); cristales(L(17), 9, '#B07BE6', 4, 1.2);
    // cristales en el techo, a los lados
    [[-12, 13, -4, '#4FC3E8'], [12, 12.5, -10, '#FF8FC8'], [-8, 14.5, -22, '#FFD36E']].forEach(function (d) {
      var g = new T.Group(), m = mat(d[3], { rug: 0.15, emisivo: d[3], brillo: 0.6 });
      for (var k = 0; k < 4; k++) { var cu = malla(new T.ConeGeometry(0.3, r(1.2, 2.2), 6), m); cu.rotation.x = PI; cu.position.set(r(-0.6, 0.6), 0, r(-0.5, 0.5)); g.add(cu); }
      g.position.set(L(d[0]), d[1], d[2]); E.scene.add(g);
    });
    // estalagmitas redondeadas
    var est = [];
    [[-7.5, -2, 1.4], [-6.6, -1, 0.9], [7.5, -4, 1.3], [6.8, -3, 0.8], [-12, -26, 2.5], [10, -28, 2.2], [-9, -36, 1.6], [9, -40, 1.8], [-12, 7, 1.6], [12, 6, 1.8]].forEach(function (d) {
      est.push({ x: L(d[0]), y: alt(L(d[0]), d[1]) - 0.1, z: d[1], s: [d[2] * 0.6, d[2] * 1.7, d[2] * 0.6], c: elegir(['#D6A889', '#C99A86', '#BFA0B8']) });
    });
    var gE = new T.LatheGeometry([V(0, 0, 0), V(1, 0, 0), V(0.92, 0.2, 0), V(0.72, 0.45, 0), V(0.48, 0.7, 0), V(0.3, 0.88, 0), V(0.16, 0.98, 0), V(0, 1.02, 0)].map(function (q) { return new T.Vector2(q.x, q.y); }), 14);
    instancias(gE, mat('#FFFFFF', { rug: 0.85 }), est, true);
    // farolillos colgados a lo largo de las dos paredes
    var mCu = mat('#FFF1DC', { sinNiebla: false });
    [-1, 1].forEach(function (lado) {
      var pts = [];
      for (var k = 0; k <= 8; k++) { var zz = 14 - k * 6; pts.push(V(L(lado * (12.5 - k * 0.45)), 11.2 - Math.abs(Math.sin(k * PI / 2)) * 1.1 - k * 0.12, zz)); }
      var cu = new T.CatmullRomCurve3(pts);
      E.scene.add(malla(new T.TubeGeometry(cu, 80, 0.03, 4), mat('#6B4A3A'), false));
      for (k = 0; k < 15; k++) {
        var pp = cu.getPoint((k + 0.5) / 15), cl = ['#FFB347', '#FF8A80', '#FFE27A', '#FFC4DA', '#B9F0C4'][k % 5];
        var fa = new T.Group();
        var gl = malla(new T.SphereGeometry(0.42, 16, 12), mat(cl, { emisivo: cl, brillo: 1.0, rug: 0.6 }), false); gl.scale.set(1, 1.2, 1); fa.add(gl);
        [0.5, -0.5].forEach(function (yy) { var tp = malla(new T.CylinderGeometry(0.22, 0.22, 0.1, 10), mat('#6B4A3A'), false); tp.position.y = yy; fa.add(tp); });
        fa.position.copy(pp).add(V(0, -0.65, 0)); E.scene.add(fa);
        if (k % 3 === 1) { var lz2 = new T.PointLight(C(cl), 20, 10, 2); lz2.position.copy(fa.position); E.scene.add(lz2); }
      }
    });
    // ondas del eco: arcos que salen de los cristales grandes
    function ondas(x, y, z, dir, cl) {
      for (var k = 0; k < 4; k++) {
        var to = new T.Mesh(new T.TorusGeometry(1.1 + k * 0.85, 0.09, 8, 40, PI * 0.55), new T.MeshBasicMaterial({ color: cl, transparent: true, opacity: 0.8 - k * 0.16, fog: false }));
        to.rotation.z = dir > 0 ? -PI * 0.275 : PI - PI * 0.275 + 0; to.position.set(x, y, z); mirarCamara(to); to.rotation.z = dir > 0 ? -PI * 0.275 : PI * 0.725; E.scene.add(to);
      }
    }
    ondas(L(-10), 7.5, -4, 1, '#FFFFFF'); ondas(L(10.5), 7.8, -6, -1, '#FFFFFF');
    // notas musicales flotando cerca de los farolillos
    function nota(x, y, z, cl, s) {
      var sh = new T.Shape(); sh.absellipse(0, 0, 0.36, 0.27, 0, PI * 2, false);
      var palo = new T.Shape(); palo.moveTo(0.26, 0.05); palo.lineTo(0.38, 0.05); palo.lineTo(0.38, 1.35); palo.lineTo(0.26, 1.35); palo.closePath();
      var ban = new T.Shape(); ban.moveTo(0.3, 1.35); ban.quadraticCurveTo(0.95, 1.0, 0.75, 0.55); ban.quadraticCurveTo(0.8, 0.95, 0.3, 1.0); ban.closePath();
      var g = new T.ExtrudeGeometry([sh, palo, ban], { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
      var m = malla(g, mat(cl, { emisivo: cl, brillo: 0.5, rug: 0.4 }), false); m.position.set(x, y, z); m.scale.setScalar(s || 1); m.rotation.z = r(-0.25, 0.25); mirarCamara(m); E.scene.add(m);
    }
    nota(L(-14), 9, 2, '#FFD36E', 1.1); nota(L(13.5), 9.4, 0, '#FF8FC8', 1.1); nota(L(-6.5), 12, -12, '#9FE3FF', 0.9); nota(L(7), 12.3, -14, '#C9A0FF', 0.9);
    // charca brillante con ondas a la derecha
    var ch = new T.Mesh(new T.CircleGeometry(1, 32), mat('#7FE0E0', { rug: 0.1, emisivo: '#5FD0D8', brillo: 0.35 })); ch.rotation.x = -PI / 2; ch.scale.set(L(3.6), 2.0, 1); ch.position.set(L(6.8), alt(L(6.8), 7) + 0.1, 7); E.scene.add(ch);
    [0.5, 0.8].forEach(function (k) { var o = new T.Mesh(new T.TorusGeometry(1, 0.012, 4, 40), new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.6 })); o.rotation.x = PI / 2; o.scale.set(L(3.6) * k, 2.0 * k, 1); o.position.copy(ch.position).add(V(0, 0.03, 0)); E.scene.add(o); });
    // setitas luminosas y piedrecitas
    [[-6, 8, 0.45, '#9FE3FF'], [-5, 9.5, 0.32, '#9FE3FF'], [6.2, 10, 0.4, '#FFC4DA'], [-9, -8, 0.5, '#B9F0C4'], [8, -10, 0.45, '#FFE27A']].forEach(function (s) {
      var st = seta(L(s[0]), s[1], s[2], s[3]); st.children[1].material.emissive = C(s[3]); st.children[1].material.emissiveIntensity = 0.7;
    });
    piedras([[-8, 12, 0.8], [8.5, 13, 0.7], [-4, -6, 0.6], [4, -8, 0.5], [-10, -12, 1.2], [9, -14, 1.1]].map(function (a) { return { x: L(a[0]), z: a[1], s: a[2], c: elegir(['#C9A894', '#B9A0B4', '#D8B79E']) }; }));
    brillitos((function () { var l = []; for (var k = 0; k < 50; k++) { var zz = r(-40, 12), xx = (rnd() < 0.5 ? -1 : 1) * r(4, 14) * E.K; l.push([xx, r(1, 12), zz]); } return l; })(), '#FFF1C8', 0.06);
    return { camara: { pos: [0, 3.6, 24], mira: [0, 5.0, 0] }, exposicion: 1.08 };
  };

  // ================================================================ API
  window.Escenarios = {
    lugares: ['inicio', 'bosque-letras', 'montana-numeros', 'valle-curioso', 'isla-hello', 'lago-colores', 'cueva-eco'],
    construir: function (scene, lugar, opciones) {
      opciones = opciones || {};
      if (!LUGARES[lugar]) throw new Error('Lugar desconocido: ' + lugar);
      var vertical = !!opciones.vertical;
      var fovH = 38, fovV = 60;
      var tanH = vertical ? Math.tan(fovV / 2 * PI / 180) * 0.625 : Math.tan(fovH / 2 * PI / 180) * 1.6;
      E = { scene: scene, v: vertical, K: vertical ? 0.655 : 1, tanH: tanH, cam: [0, 3.4, 26], alt: null };
      GEO = {};
      var n = 0; for (var i = 0; i < lugar.length; i++) n = (n * 31 + lugar.charCodeAt(i)) | 0;
      rnd = semilla(n);
      var info = LUGARES[lugar]() || {};
      info.camara = info.camara || { pos: [0, 3.4, 26], mira: [0, 4.4, 0] };
      info.camara.fov = vertical ? fovV : fovH;
      if (vertical) {
        var cv = info.camaraV || { subir: 0.8, bajar: 3.0 };
        info.camara.pos[1] += cv.subir;
        info.camara.mira[1] = info.camara.pos[1] - cv.bajar;
      }
      info.exposicion = info.exposicion || 1.05;
      E = null;
      return info;
    }
  };
})();
