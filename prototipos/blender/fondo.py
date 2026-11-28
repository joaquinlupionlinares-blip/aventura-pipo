# -*- coding: utf-8 -*-
"""
fondo.py · Fondos v2 («animación 3D de película») en Blender Cycles.

Reconstruye un lugar exportado de three.js (prototipos/blender/escenas/<lugar>-<h|v>.json, generado por
exportar-escenas.js) y lo renderiza con materiales PBR de Poly Haven, hierba densa con nodos de geometría,
flores, cielo HDRI con sol cálido alineado arriba a la izquierda, niebla de profundidad y desenfoque de campo.

Uso (Blender 4.2, sin interfaz):
  blender.exe -b -P prototipos/blender/fondo.py -- <lugar> <h|v> [--muestras 128] [--escala 100]
                                                    [--salida ruta.webp] [--max-kb 400] [--luz ruta.jpg] [--blend ruta.blend]
  --luz   en vez del fondo, guarda el cielo de iluminación del lugar (equirectangular 1024×512, LDR, JPEG)
"""
import bpy, sys, os, json, base64, math, time, random
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
PH = r'C:\Users\GAMER\Desktop\aventura-juanma-herramientas\polyhaven'
T0 = time.time()

def log(*a):
    print('[fondo %6.1fs]' % (time.time() - T0), *a, flush=True)

# ------------------------------------------------------------------ argumentos
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
LUGAR, ORI = argv[0], argv[1]
def opcion(nombre, defecto):
    return argv[argv.index(nombre) + 1] if nombre in argv else defecto
MUESTRAS = int(opcion('--muestras', '128'))
ESCALA = int(opcion('--escala', '100'))
SALIDA = opcion('--salida', os.path.join(RAIZ, 'fondos', '%s-%s.webp' % (LUGAR, ORI)))
MAX_KB = int(opcion('--max-kb', '400'))
LUZ = opcion('--luz', None)
BLEND = opcion('--blend', None)
VERTICAL = ORI == 'v'

# ------------------------------------------------------------------ dirección artística por lugar
TEX_BASE = {'verde': 'leafy_grass', 'arena': 'dirt', 'gris': 'rock_face_03', 'blanco': 'snow_02'}
LUGARES = {
    'inicio':          {'hdri': 'kloofendal_48d_partly_cloudy_puresky', 'tex': {}, 'exp': 0.0, 'cielo': 1.0},
    'bosque-letras':   {'hdri': 'kloofendal_43d_clear_puresky', 'tex': {}, 'exp': 0.1, 'cielo': 1.0},
    'montana-numeros': {'hdri': 'kloofendal_43d_clear_puresky', 'tex': {}, 'exp': 0.0, 'cielo': 1.0},
    'valle-curioso':   {'hdri': 'kloofendal_48d_partly_cloudy_puresky', 'tex': {}, 'exp': 0.0, 'cielo': 1.0},
    'isla-hello':      {'hdri': 'kloofendal_48d_partly_cloudy_puresky', 'tex': {'arena': 'coast_sand_01', 'gris': 'coast_sand_01'}, 'exp': -0.1, 'cielo': 1.0},
    'lago-colores':    {'hdri': 'kloofendal_48d_partly_cloudy_puresky', 'tex': {}, 'exp': 0.0, 'cielo': 1.0},
    'cueva-eco':       {'hdri': 'kloofendal_48d_partly_cloudy_puresky', 'tex': {'arena': 'coast_sand_01', 'gris': 'coast_sand_01'}, 'exp': 0.3, 'cielo': 1.0, 'interior': True},
}
CFG = LUGARES[LUGAR]
TEX = dict(TEX_BASE); TEX.update(CFG['tex'])
TAM_TEX = {'leafy_grass': 2.2, 'dirt': 3.0, 'coast_sand_01': 3.0, 'rock_face_03': 9.0, 'snow_02': 7.0}

# ------------------------------------------------------------------ utilidades de datos
def f32(s): return np.frombuffer(base64.b64decode(s), dtype=np.float32)
def u32(s): return np.frombuffer(base64.b64decode(s), dtype=np.uint32)
C3 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # three (y arriba) → Blender (z arriba)
C3I = C3.inverted()
def b(v): return Vector((v[0], -v[2], v[1]))
def a_blender(arr3):  # Nx3 numpy three → Blender
    return np.column_stack((arr3[:, 0], -arr3[:, 2], arr3[:, 1]))
def m_three(el):  # 16 floats column-major (three) → Matrix Blender
    m = Matrix([[el[0], el[4], el[8], el[12]], [el[1], el[5], el[9], el[13]], [el[2], el[6], el[10], el[14]], [el[3], el[7], el[11], el[15]]])
    return C3 @ m @ C3I
def srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)
def paso(a, b_, x):
    t = np.clip((x - a) / (b_ - a), 0, 1)
    return t * t * (3 - 2 * t)

# ------------------------------------------------------------------ escena vacía y datos
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
with open(os.path.join(AQUI, 'escenas', '%s-%s.json' % (LUGAR, ORI)), encoding='utf-8') as fh:
    D = json.load(fh)
log('escena cargada:', len(D['mallas']), 'mallas,', len(D['instancias']), 'grupos instanciados')

# ------------------------------------------------------------------ nodos: pequeñas ayudas
class Nodos:
    def __init__(self, arbol):
        self.t = arbol; self.n = arbol.nodes; self.l = arbol.links
    def nuevo(self, tipo, **props):
        nd = self.n.new(tipo)
        for k, v in props.items(): setattr(nd, k, v)
        return nd
    def link(self, a, b_): self.l.new(a, b_)
    def math(self, op, a, b_=None, clamp=False):
        nd = self.nuevo('ShaderNodeMath', operation=op, use_clamp=clamp)
        self._in(nd.inputs[0], a)
        if b_ is not None: self._in(nd.inputs[1], b_)
        return nd.outputs[0]
    def vmath(self, op, a, b_=None, escala=None):
        nd = self.nuevo('ShaderNodeVectorMath', operation=op)
        self._in(nd.inputs[0], a)
        if b_ is not None: self._in(nd.inputs[1], b_)
        if escala is not None: self._in(nd.inputs[3], escala)
        return nd.outputs[0] if op not in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else nd.outputs['Value']
    def mix(self, fac, a, b_, modo='MIX'):
        nd = self.nuevo('ShaderNodeMix', data_type='RGBA', blend_type=modo)
        self._in(nd.inputs[0], fac); self._in(nd.inputs[6], a); self._in(nd.inputs[7], b_)
        return nd.outputs[2]
    def _in(self, sock, val):
        if hasattr(val, 'is_linked') or hasattr(val, 'node'): self.link(val, sock)
        else:
            if isinstance(val, (tuple, list)) and len(sock.default_value) == 4 and len(val) == 3: val = tuple(val) + (1,)
            sock.default_value = val

IMG = {}
MEDIA = {}
def imagen(id_, mapa):
    clave = id_ + mapa
    if clave not in IMG:
        ruta = os.path.join(PH, 'texturas', id_, '%s_%s_2k.jpg' % (id_, mapa))
        im = bpy.data.images.load(ruta, check_existing=True)
        if mapa != 'diff': im.colorspace_settings.name = 'Non-Color'
        IMG[clave] = im
        if mapa == 'diff':
            px = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32); im.pixels.foreach_get(px)
            px = px.reshape(-1, 4)[::7, :3]
            lin = np.where(px <= 0.04045, px / 12.92, np.power((px + 0.055) / 1.055, 2.4))
            MEDIA[id_] = tuple(float(x) for x in lin.mean(axis=0))
    return IMG[clave]

def nodo_imagen(N, id_, mapa, vector, caja=False):
    t = N.nuevo('ShaderNodeTexImage'); t.image = imagen(id_, mapa)
    if caja: t.projection = 'BOX'; t.projection_blend = 0.25
    N.link(vector, t.inputs['Vector'])
    return t

def detalle(N, id_, vector, base, fuerza=0.85, caja=False):
    """color = base × (textura / media de la textura): conserva el color de la dirección de arte y añade el detalle real."""
    t = nodo_imagen(N, id_, 'diff', vector, caja)
    m = MEDIA[id_]
    norm = N.vmath('MULTIPLY', t.outputs['Color'], (1 / max(m[0], 1e-3), 1 / max(m[1], 1e-3), 1 / max(m[2], 1e-3)))
    d = N.mix(fuerza, (1, 1, 1, 1), norm)
    return N.mix(1.0, base, d, 'MULTIPLY'), t

# niebla de profundidad (solo rayos de cámara): como la niebla de three.js, pero con el color del horizonte del HDRI
NIEBLA = {'color': (0.8, 0.85, 0.9), 'cerca': 60.0, 'lejos': 320.0, 'max': 0.85}
def con_niebla(N, shader_out, salida):
    if not D.get('niebla'):
        N.link(shader_out, salida.inputs['Surface']); return
    lp = N.nuevo('ShaderNodeLightPath')
    mr = N.nuevo('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
    N.link(lp.outputs['Ray Length'], mr.inputs['Value'])
    mr.inputs['From Min'].default_value = NIEBLA['cerca']; mr.inputs['From Max'].default_value = NIEBLA['lejos']
    mr.inputs['To Max'].default_value = NIEBLA['max']
    f = N.math('MULTIPLY', mr.outputs['Result'], lp.outputs['Is Camera Ray'])
    em = N.nuevo('ShaderNodeEmission'); em.inputs['Color'].default_value = tuple(NIEBLA['color']) + (1,)
    ms = N.nuevo('ShaderNodeMixShader'); N.link(f, ms.inputs[0]); N.link(shader_out, ms.inputs[1]); N.link(em.outputs[0], ms.inputs[2])
    N.link(ms.outputs[0], salida.inputs['Surface'])

def mat_nuevo(nombre):
    m = bpy.data.materials.new(nombre); m.use_nodes = True
    N = Nodos(m.node_tree); N.n.clear()
    out = N.nuevo('ShaderNodeOutputMaterial')
    return m, N, out

# ------------------------------------------------------------------ cámara
cam_d = bpy.data.cameras.new('camara'); cam = bpy.data.objects.new('camara', cam_d); scene.collection.objects.link(cam); scene.camera = cam
pos = b(D['camara']['pos']); mira = b(D['camara']['mira'])
cam.location = pos
cam.rotation_euler = (mira - pos).to_track_quat('-Z', 'Y').to_euler()
cam_d.sensor_fit = 'VERTICAL'; cam_d.sensor_height = 24.0
cam_d.angle_y = math.radians(D['camara']['fov'])
cam_d.clip_start = 0.3; cam_d.clip_end = 3000
ANCHO, ALTO = (1200, 1920) if VERTICAL else (1920, 1200)
scene.render.resolution_x = ANCHO; scene.render.resolution_y = ALTO; scene.render.resolution_percentage = ESCALA
bpy.context.view_layer.update()

# ------------------------------------------------------------------ mundo: HDRI con el sol colocado arriba a la izquierda
ruta_hdri = os.path.join(PH, 'hdri', CFG['hdri'] + '_4k.hdr')
hdri = bpy.data.images.load(ruta_hdri, check_existing=True)
W, H = hdri.size
px = np.empty(W * H * 4, dtype=np.float32); hdri.pixels.foreach_get(px); px = px.reshape(H, W, 4)
lum = px[:, :, :3].mean(axis=2)
fila, col = np.unravel_index(np.argmax(lum), lum.shape)
u, v = (col + 0.5) / W, (fila + 0.5) / H
# convención de Blender para el mapa equirectangular: u = 0,5 − atan2(y, x) / 2π ; v = 0,5 + elevación / π
alfa, el = (0.5 - u) * 2 * math.pi, (v - 0.5) * math.pi
sol_hdri = Vector((math.cos(alfa) * math.cos(el), math.sin(alfa) * math.cos(el), math.sin(el)))
sol_luz = [l for l in D['luces'] if l['tipo'] == 'sol']
sol_dir = b(sol_luz[0]['dir']).normalized() if sol_luz else Vector((-0.62, -0.32, 0.72)).normalized()
# girar el HDRI para que su sol quede en el acimut del sol de la escena; el sol de la lámpara usa la altura del HDRI
giro = math.atan2(sol_hdri.y, sol_hdri.x) - math.atan2(sol_dir.y, sol_dir.x)
alt_sol = el
acim = math.atan2(sol_dir.y, sol_dir.x)
sol_final = Vector((math.cos(acim) * math.cos(alt_sol), math.sin(acim) * math.cos(alt_sol), math.sin(alt_sol)))
log('HDRI %s: sol a %.0f° de altura; giro %.0f°' % (CFG['hdri'], math.degrees(el), math.degrees(giro)))

def muestra_hdri(d):  # radiancia del HDRI en la dirección d (ya girada)
    dx, dy = math.cos(giro) * d.x - math.sin(giro) * d.y, math.sin(giro) * d.x + math.cos(giro) * d.y
    uu = (0.5 - math.atan2(dy, dx) / (2 * math.pi)) % 1.0; vv = math.atan2(d.z, math.hypot(dx, dy)) / math.pi + 0.5
    c_ = int(uu * W) % W; f_ = min(H - 1, max(0, int(vv * H)))
    return px[max(0, f_ - 3):f_ + 4, max(0, c_ - 12):c_ + 12, :3].reshape(-1, 3).mean(axis=0)

world = bpy.data.worlds.new('mundo'); scene.world = world; world.use_nodes = True
WN = Nodos(world.node_tree); WN.n.clear()
wo = WN.nuevo('ShaderNodeOutputWorld')
tc = WN.nuevo('ShaderNodeTexCoord'); mp = WN.nuevo('ShaderNodeMapping', vector_type='VECTOR')
mp.inputs['Rotation'].default_value = (0, 0, giro)
WN.link(tc.outputs['Generated'], mp.inputs['Vector'])
env = WN.nuevo('ShaderNodeTexEnvironment'); env.image = hdri; WN.link(mp.outputs['Vector'], env.inputs['Vector'])
recorte = WN.mix(1.0, env.outputs['Color'], (6.0, 6.0, 6.0), 'DARKEN')  # quita el disco solar: el sol lo pone la lámpara (sombras suaves)
bg = WN.nuevo('ShaderNodeBackground'); WN.link(recorte, bg.inputs['Color']); bg.inputs['Strength'].default_value = CFG['cielo']
WN.link(bg.outputs[0], wo.inputs['Surface'])

# color de la niebla = horizonte del cielo en la dirección de la cámara
fwd = (mira - pos); fwd.z = 0; fwd.normalize()
hz = muestra_hdri(Vector((fwd.x, fwd.y, 0.05)).normalized()) * CFG['cielo']
if D.get('niebla'):
    fc = D['niebla']['color']
    NIEBLA['color'] = tuple(float(0.75 * hz[i] + 0.25 * fc[i] * hz.mean() / max(np.mean(fc), 1e-3)) for i in range(3))
    NIEBLA['cerca'] = D['niebla']['cerca'] * 1.1; NIEBLA['lejos'] = D['niebla']['lejos'] * 1.25
    if CFG.get('interior'):
        NIEBLA['color'] = tuple(float(x) * 0.55 for x in fc); NIEBLA['max'] = 0.55

sol = bpy.data.lights.new('sol', 'SUN'); sol.energy = 4.2; sol.angle = math.radians(4.0)
sol.color = (1.0, 0.93, 0.84)
so = bpy.data.objects.new('sol', sol); scene.collection.objects.link(so)
so.rotation_euler = sol_final.to_track_quat('Z', 'Y').to_euler()

# ------------------------------------------------------------------ materiales
MATS = {}
def hsv(c):
    s = srgb(np.array(c, dtype=np.float64)); mx, mn = s.max(), s.min()
    h = 0.0
    if mx - mn > 1e-6:
        if mx == s[0]: h = ((s[1] - s[2]) / (mx - mn)) % 6
        elif mx == s[1]: h = (s[2] - s[0]) / (mx - mn) + 2
        else: h = (s[0] - s[1]) / (mx - mn) + 4
        h /= 6
    return h, (0 if mx == 0 else (mx - mn) / mx), mx

def fuente_color(N, md, fuente):
    base = tuple(md['color'])
    if fuente == 'instancia':
        at = N.nuevo('ShaderNodeAttribute', attribute_type='INSTANCER', attribute_name='col')
        return N.mix(1.0, base, at.outputs['Color'], 'MULTIPLY')
    if fuente == 'vertice' and md['vcol']:
        at = N.nuevo('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name='Col')
        return N.mix(1.0, base, at.outputs['Color'], 'MULTIPLY')
    return base

def coords_objeto(N, escala):
    tc_ = N.nuevo('ShaderNodeTexCoord')
    return N.vmath('MULTIPLY', tc_.outputs['Object'], (1 / escala, 1 / escala, 1 / escala))

def material_para(md, clase, fuente, nombre):
    clave = (id(md), clase, fuente)
    if clave in MATS: return MATS[clave]
    m, N, out = mat_nuevo(nombre)
    p = N.nuevo('ShaderNodeBsdfPrincipled')
    color = fuente_color(N, md, fuente)
    if md['tipo'] == 'MeshBasicMaterial' or md.get('aditivo'):
        # trazos de luz (brisa, ondas del eco, arcoíris, destellos): emisión translúcida que no ilumina ni da sombra
        em = N.nuevo('ShaderNodeEmission'); N._in(em.inputs['Color'], color); em.inputs['Strength'].default_value = 1.0
        tr = N.nuevo('ShaderNodeBsdfTransparent'); ms = N.nuevo('ShaderNodeMixShader')
        ms.inputs[0].default_value = md['opacidad']; N.link(tr.outputs[0], ms.inputs[1]); N.link(em.outputs[0], ms.inputs[2])
        N.link(ms.outputs[0], out.inputs['Surface']); m.blend_method = 'BLEND'
        MATS[clave] = m; return m
    rug = max(0.3, md['rug'])
    if clase == 'copa':
        vec = coords_objeto(N, 0.6)
        vo = N.nuevo('ShaderNodeTexVoronoi'); N.link(vec, vo.inputs['Vector'])
        nz = N.nuevo('ShaderNodeTexNoise'); N.link(vec, nz.inputs['Vector']); nz.inputs['Scale'].default_value = 1.2
        var = N.mix(0.25, color, N.mix(1.0, color, nz.outputs['Color'], 'OVERLAY'))
        oscuro = N.math('SUBTRACT', 1.0, N.math('MULTIPLY', vo.outputs['Distance'], 0.6))
        color = N.mix(1.0, var, N.vmath('MULTIPLY', (1, 1, 1), N.math('POWER', oscuro, 1.6)), 'MULTIPLY')
        bump = N.nuevo('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.65; bump.inputs['Distance'].default_value = 0.15
        N.link(vo.outputs['Distance'], bump.inputs['Height']); N.link(bump.outputs[0], p.inputs['Normal'])
        p.inputs['Sheen Weight'].default_value = 0.5; p.inputs['Sheen Tint'].default_value = (0.75, 1.0, 0.45, 1)
        rug = 0.75
    elif clase in ('tronco', 'madera', 'piedra', 'roca', 'palmera'):
        tid, tam = {'tronco': ('bark_brown_02', 1.2), 'madera': ('brown_planks_03', 1.5), 'piedra': ('rock_boulder_dry', 1.6),
                    'roca': ('rock_face_03', 7.0), 'palmera': ('palm_tree_bark', 1.2)}[clase]
        vec = coords_objeto(N, tam)
        color, t = detalle(N, tid, vec, color, 0.9, caja=True)
        r_ = nodo_imagen(N, tid, 'rough', vec, True); N.link(r_.outputs['Color'], p.inputs['Roughness'])
        bump = N.nuevo('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.5 if clase != 'roca' else 0.8
        N.link(t.outputs['Color'], bump.inputs['Height']); N.link(bump.outputs[0], p.inputs['Normal'])
        rug = None
    elif clase == 'nube':
        rug = 1.0; p.inputs['Emission Color'].default_value = (0.85, 0.9, 1.0, 1); p.inputs['Emission Strength'].default_value = 0.18
        p.inputs['Sheen Weight'].default_value = 0.6
    elif clase == 'cristal':
        p.inputs['Transmission Weight'].default_value = 0.55; p.inputs['IOR'].default_value = 1.5
        p.inputs['Coat Weight'].default_value = 0.5; rug = 0.12
    elif clase in ('agua', 'mar'):
        nz = N.nuevo('ShaderNodeTexNoise'); tcw = N.nuevo('ShaderNodeTexCoord')
        N.link(N.vmath('MULTIPLY', tcw.outputs['Object'], (1.5, 3.0, 1.5)), nz.inputs['Vector']); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 6
        bump = N.nuevo('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.05
        N.link(nz.outputs['Fac'], bump.inputs['Height']); N.link(bump.outputs[0], p.inputs['Normal'])
        color = N.mix(1.0, color, (0.85, 0.85, 0.85), 'MULTIPLY'); rug = 0.06
        p.inputs['IOR'].default_value = 1.33; p.inputs['Specular IOR Level'].default_value = 0.12 if clase == 'mar' else 0.45
        if clase == 'mar': color = N.mix(1.0, color, (0.75, 1.0, 1.1), 'MULTIPLY'); p.inputs['Coat Weight'].default_value = 0.0
    elif clase == 'pintado':
        # madera pintada / plástico mate de juguete grande: capa de barniz y una veta muy suave
        nz = N.nuevo('ShaderNodeTexNoise'); N.link(coords_objeto(N, 0.5), nz.inputs['Vector']); nz.inputs['Detail'].default_value = 8
        bump = N.nuevo('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08
        N.link(nz.outputs['Fac'], bump.inputs['Height']); N.link(bump.outputs[0], p.inputs['Normal'])
        p.inputs['Coat Weight'].default_value = 0.25; p.inputs['Coat Roughness'].default_value = 0.25
        rug = max(0.35, min(0.7, md['rug']))
    N._in(p.inputs['Base Color'], color)
    if rug is not None: p.inputs['Roughness'].default_value = rug
    p.inputs['Metallic'].default_value = md['metal']
    if md['brillo'] > 0 and max(md['emisivo']) > 0:
        N._in(p.inputs['Emission Color'], tuple(md['emisivo']))
        p.inputs['Emission Strength'].default_value = md['brillo'] * (3.0 if clase == 'luz' else 1.0)
    if md['opacidad'] < 1:
        p.inputs['Alpha'].default_value = md['opacidad']; m.blend_method = 'BLEND'
    if md['niebla']: con_niebla(N, p.outputs[0], out)
    else: N.link(p.outputs[0], out.inputs['Surface'])
    MATS[clave] = m
    return m

def clase_de(g, md, instanciado):
    t, pr = g['tipo'], g['params']
    if md['tipo'] == 'MeshBasicMaterial' or md.get('aditivo'): return 'luz_basica'
    if instanciado:
        if t == 'SphereGeometry' and pr.get('widthSegments') == 18: return 'copa'
        if t == 'CylinderGeometry' and pr.get('radialSegments') == 8 and abs(pr.get('radiusTop', 0) - 0.75) < 1e-6: return 'tronco'
        if t == 'CylinderGeometry' and pr.get('radialSegments') == 6 and abs(pr.get('radiusTop', 0) - 0.7) < 1e-6: return 'tronco'
        if t == 'ConeGeometry' and pr.get('radialSegments') == 10: return 'copa'
        if t == 'SphereGeometry' and pr.get('widthSegments') == 10 and pr.get('heightSegments') == 8: return 'piedra'
        if t == 'CylinderGeometry' and pr.get('radialSegments') == 10: return 'piedra'
    if t == 'PlaneGeometry' and g['n'] > 5000: return 'mar' if md['rug'] < 0.5 else 'terreno'
    if t == 'CircleGeometry' and md['vcol']: return 'agua'
    if t == 'CylinderGeometry' and pr.get('openEnded') and md['vcol']: return 'roca'
    if t == 'TubeGeometry' and md['color'][0] > 0.4 and 0.2 < md['color'][1] < 0.35: return 'palmera'
    if not md['niebla'] and md['brillo'] * max(md['emisivo']) > 0 and t == 'SphereGeometry' and pr.get('widthSegments') == 20: return 'nube'
    brillo_real = md['brillo'] * max(md['emisivo'])  # en three.js emissiveIntensity vale 1 aunque el emisivo sea negro
    if brillo_real >= 0.8: return 'luz'
    if brillo_real > 0 and md['opacidad'] < 1: return 'cristal'
    h, s, v = hsv(md['color'])
    if 0.03 < h < 0.11 and s > 0.4 and v < 0.66: return 'madera'
    if s < 0.18 and 0.45 < v < 0.85 and t == 'SphereGeometry': return 'piedra'
    return 'pintado'

# ------------------------------------------------------------------ mallas
def crear_malla(nombre, g):
    pos = a_blender(f32(g['pos']).reshape(-1, 3))
    idx = u32(g['idx']).reshape(-1, 3) if 'idx' in g else np.arange(len(pos), dtype=np.uint32).reshape(-1, 3)
    me = bpy.data.meshes.new(nombre)
    me.vertices.add(len(pos)); me.vertices.foreach_set('co', pos.astype(np.float32).ravel())
    nt = len(idx)
    me.loops.add(nt * 3); me.loops.foreach_set('vertex_index', idx.astype(np.int32).ravel())
    me.polygons.add(nt); me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(nt, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.polygons.foreach_set('use_smooth', np.ones(nt, dtype=bool))
    if 'nor' in g:
        nor = a_blender(f32(g['nor']).reshape(-1, 3))
        ln = nor[idx.ravel()]
        me.normals_split_custom_set([tuple(x) for x in ln])
    if 'col' in g:
        col = f32(g['col']).reshape(-1, g.get('colTam', 3))[:, :3]
        at = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        at.data.foreach_set('color', np.column_stack((col, np.ones(len(col)))).astype(np.float32).ravel())
    if 'uv' in g:
        uv = f32(g['uv']).reshape(-1, 2)
        ul = me.uv_layers.new(name='UVMap'); ul.data.foreach_set('uv', uv[idx.ravel()].astype(np.float32).ravel())
    return me

MALLAS = {}
def malla_de(i):
    if i not in MALLAS: MALLAS[i] = crear_malla('geo%d' % i, D['geos'][i])
    return MALLAS[i]

coleccion_base = bpy.data.collections.new('bases'); scene.collection.children.link(coleccion_base)
TERRENO = None
SIN_SOMBRA = ('luz_basica',)
OBJETOS_SUELO = []; HUELLAS = []
for k, ms in enumerate(D['mallas']):
    g, md = D['geos'][ms['geo']], D['materiales'][ms['mat']]
    clase = clase_de(g, md, False)
    if clase == 'terreno':
        me = crear_malla('terreno', g)  # malla propia: se le añaden atributos
    else:
        me = malla_de(ms['geo'])
    ob = bpy.data.objects.new('%s_%d' % (clase, k), me)
    ob.matrix_world = m_three(ms['matriz'])
    scene.collection.objects.link(ob)
    ob['geo_tipo'] = g['tipo']; ob['clase'] = clase
    if clase == 'terreno':
        TERRENO = ob; ob['clase'] = 'terreno'
        continue
    if md.get('mapa'):
        # textura pintada en canvas (mapa mágico, cuadro del caballete)
        ruta = os.path.join(bpy.app.tempdir, 'tex_%s.png' % md['mapa'])
        with open(ruta, 'wb') as fh: fh.write(base64.b64decode(D['texturas'][md['mapa']].split(',')[1]))
        m, N, out = mat_nuevo('mapa_%d' % k)
        t = N.nuevo('ShaderNodeTexImage'); t.image = bpy.data.images.load(ruta)
        p = N.nuevo('ShaderNodeBsdfPrincipled'); N.link(t.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.85
        p.inputs['Sheen Weight'].default_value = 0.3
        con_niebla(N, p.outputs[0], out)
    else:
        m = material_para(md, clase, 'vertice', '%s_%d' % (clase, k))
    me.materials.clear() if clase != 'terreno' and me.users == 1 else None
    if not me.materials: me.materials.append(m)
    else: ob.material_slots[0].link = 'OBJECT'; ob.material_slots[0].material = m
    if clase not in ('agua', 'mar', 'roca', 'luz_basica', 'nube', 'luz'): OBJETOS_SUELO.append(ob)
    if g['tipo'] == 'ExtrudeGeometry' and g['n'] > 300:
        # letras y números: en three.js son trazos solapados; se funden en una sola pieza (sin caras que se pisen)
        dims = [max(c_[i] for c_ in ob.bound_box) - min(c_[i] for c_ in ob.bound_box) for i in range(3)]
        rm = ob.modifiers.new('fundir', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = max(0.006, max(dims) / 200); rm.use_smooth_shade = True
        sm = ob.modifiers.new('suavizar', 'SMOOTH'); sm.factor = 0.8; sm.iterations = 12  # redondea la muesca de la costura (la O)
    if clase in SIN_SOMBRA:
        ob.visible_shadow = False; ob.visible_diffuse = False; ob.visible_glossy = False
    if clase == 'nube' or not md['niebla']:
        ob.visible_shadow = False  # nubes y elementos del cielo: sin manchas de sombra en el paisaje
    if clase == 'roca' and CFG.get('interior'):
        ob.visible_shadow = False  # paredes de la cueva: dejan pasar la luz (cueva acogedora, como en v1)

# instancias: una nube de puntos con nodos de geometría por grupo
def grupo_instancias():
    ng = bpy.data.node_groups.new('instanciar', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    so_ = ng.interface.new_socket('Objeto', in_out='INPUT', socket_type='NodeSocketObject')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = Nodos(ng)
    gi, go = N.nuevo('NodeGroupInput'), N.nuevo('NodeGroupOutput')
    oi = N.nuevo('GeometryNodeObjectInfo'); oi.inputs['As Instance'].default_value = True
    iop = N.nuevo('GeometryNodeInstanceOnPoints')
    r_ = N.nuevo('GeometryNodeInputNamedAttribute', data_type='FLOAT_VECTOR'); r_.inputs['Name'].default_value = 'rot'
    e_ = N.nuevo('GeometryNodeInputNamedAttribute', data_type='FLOAT_VECTOR'); e_.inputs['Name'].default_value = 'esc'
    N.link(gi.outputs[0], iop.inputs['Points']); N.link(gi.outputs[1], oi.inputs['Object'])
    N.link(oi.outputs['Geometry'], iop.inputs['Instance'])
    N.link(r_.outputs['Attribute'], iop.inputs['Rotation']); N.link(e_.outputs['Attribute'], iop.inputs['Scale'])
    N.link(iop.outputs['Instances'], go.inputs[0])
    return ng, so_.identifier
GI, GI_OBJ = grupo_instancias()

def nube_puntos(nombre, posiciones, atributos, base_ob):
    me = bpy.data.meshes.new(nombre); me.vertices.add(len(posiciones)); me.vertices.foreach_set('co', np.asarray(posiciones, dtype=np.float32).ravel())
    for an, (tipo, val) in atributos.items():
        at = me.attributes.new(an, tipo, 'POINT')
        at.data.foreach_set('vector' if tipo == 'FLOAT_VECTOR' else 'color', np.asarray(val, dtype=np.float32).ravel())
    ob = bpy.data.objects.new(nombre, me); scene.collection.objects.link(ob)
    mod = ob.modifiers.new('instancias', 'NODES'); mod.node_group = GI; mod[GI_OBJ] = base_ob
    return ob

for k, ins in enumerate(D['instancias']):
    g, md = D['geos'][ins['geo']], D['materiales'][ins['mat']]
    clase = clase_de(g, md, True)
    me = malla_de(ins['geo'])
    base = bpy.data.objects.new('base_%s_%d' % (clase, k), me); coleccion_base.objects.link(base)
    mt = material_para(md, clase, 'instancia', 'i_%s_%d' % (clase, k))
    if not me.materials: me.materials.append(mt)
    mats16 = f32(ins['matrices']).reshape(-1, 16); cols = f32(ins['colores']).reshape(-1, 3)
    P, R, S = [], [], []
    for el in mats16:
        mw = m_three(el); loc, q, sc = mw.decompose()
        P.append(tuple(loc)); R.append(tuple(q.to_euler())); S.append(tuple(sc))
    ob = nube_puntos('inst_%s_%d' % (clase, k), P, {'rot': ('FLOAT_VECTOR', R), 'esc': ('FLOAT_VECTOR', S),
                     'col': ('FLOAT_COLOR', np.column_stack((cols, np.ones(len(cols)))))}, base)
    if clase in SIN_SOMBRA: ob.visible_shadow = False; ob.visible_diffuse = False
coleccion_base.hide_render = True
log('geometría creada')

def bvh_terreno():
    bpy.context.view_layer.update()
    return BVHTree.FromObject(TERRENO, bpy.context.evaluated_depsgraph_get())

# objetos planos apoyados en el suelo (charca de la cueva y sus ondas): se adaptan al relieve, sin flotar
if TERRENO is not None:
    bvh_s = None
    for ob in list(scene.objects):
        if ob.type != 'MESH' or ob.get('geo_tipo') not in ('CircleGeometry', 'TorusGeometry') or ob.get('clase') in ('agua', 'mar'): continue
        esq = [ob.matrix_world @ Vector(c_) for c_ in ob.bound_box]
        if max(e.z for e in esq) - min(e.z for e in esq) > 0.15: continue
        bvh_s = bvh_s or bvh_terreno()
        c0 = sum(esq, Vector()) / 8
        h0 = bvh_s.ray_cast(Vector((c0.x, c0.y, c0.z + 30)), Vector((0, 0, -1)), 100)
        if h0[0] is None or abs(c0.z - h0[0].z) > 0.2: continue
        me_ = ob.data.copy(); me_.transform(ob.matrix_world); ob.data = me_; ob.matrix_world = Matrix.Identity(4)
        for v_ in me_.vertices:
            h_ = bvh_s.ray_cast(Vector((v_.co.x, v_.co.y, v_.co.z + 30)), Vector((0, 0, -1)), 100)
            if h_[0] is not None: v_.co.z = h_[0].z + 0.03
        me_.normals_split_custom_set_from_vertices([(0, 0, 1)] * len(me_.vertices)); me_.update()
        log('ajustado al suelo:', ob.name)

# luces puntuales de three.js
for l in D['luces']:
    if l['tipo'] != 'punto': continue
    ld = bpy.data.lights.new('punto', 'POINT'); ld.color = tuple(min(1.0, c) for c in l['color'])
    ld.energy = 4 * math.pi * l['intensidad'] * 0.6; ld.shadow_soft_size = 0.35
    lo = bpy.data.objects.new('punto', ld); lo.location = b(l['pos']); scene.collection.objects.link(lo)

# ------------------------------------------------------------------ terreno: masks, material y hierba

dg = bpy.context.evaluated_depsgraph_get()
if TERRENO is not None:
    me = TERRENO.data
    nv = len(me.vertices)
    co = np.empty(nv * 3, dtype=np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    if me.color_attributes.get('Col'):
        cc = np.empty(nv * 4, dtype=np.float32); me.color_attributes['Col'].data.foreach_get('color', cc); cc = cc.reshape(-1, 4)[:, :3]
    else: cc = np.full((nv, 3), 0.3, dtype=np.float32)
    s_ = srgb(cc); mx, mn = s_.max(axis=1), s_.min(axis=1); dl = np.maximum(mx - mn, 1e-6)
    hh = np.where(mx == s_[:, 0], ((s_[:, 1] - s_[:, 2]) / dl) % 6, np.where(mx == s_[:, 1], (s_[:, 2] - s_[:, 0]) / dl + 2, (s_[:, 0] - s_[:, 1]) / dl + 4)) / 6
    ss = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0); vv = mx
    verde = paso(0.13, 0.19, hh) * paso(0.52, 0.45, hh) * paso(0.12, 0.25, ss)
    flores_campo = paso(0.42, 0.55, ss) * (1 - paso(0.06, 0.09, hh) * paso(0.17, 0.14, hh))
    verde = np.maximum(verde, flores_campo * (1 - verde))
    blanco = paso(0.8, 0.9, vv) * paso(0.16, 0.08, ss) * (1 - verde)
    gris = paso(0.24, 0.14, ss) * (1 - blanco) * (1 - verde)
    arena = np.clip(1 - verde - blanco - gris, 0, 1)
    if CFG.get('interior'):
        arena = arena + gris; gris = gris * 0
        fuera = co[:, 1] > 66  # el prado de fuera de la cueva
        verde = np.where(fuera, 1, verde * 0); arena = np.where(fuera, 0, arena + blanco); blanco *= 0
    tot = verde + arena + gris + blanco + 1e-6
    for nombre_, arr in (('m_verde', verde), ('m_arena', arena), ('m_gris', gris), ('m_blanco', blanco)):
        at = me.attributes.new(nombre_, 'FLOAT', 'POINT'); at.data.foreach_set('value', (arr / tot).astype(np.float32))
    # UV en coordenadas de mundo (para los mapas normales)
    li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', li)
    ul = me.uv_layers.new(name='mundo'); ul.data.foreach_set('uv', co[li, :2].astype(np.float32).ravel())

    # material del suelo: color de la dirección de arte × detalle de las texturas reales
    m, N, out = mat_nuevo('suelo')
    p = N.nuevo('ShaderNodeBsdfPrincipled')
    vc = N.nuevo('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name='Col').outputs['Color']
    uvn = N.nuevo('ShaderNodeUVMap'); uvn.uv_map = 'mundo'
    col_acc = None; rug_acc = None; nor_acc = None
    for cat in ('verde', 'arena', 'gris', 'blanco'):
        tid = TEX[cat]; tam = TAM_TEX.get(tid, 3.0)
        vec = N.vmath('MULTIPLY', uvn.outputs['UV'], (1 / tam, 1 / tam, 1))
        base_c = N.mix(1.0, vc, {'arena': (0.74, 0.64, 0.52)}.get(cat, (1, 1, 1)), 'MULTIPLY')
        c_, t = detalle(N, tid, vec, base_c, 1.0 if cat == 'arena' else 0.9)
        r_ = nodo_imagen(N, tid, 'rough', vec)
        nm_t = nodo_imagen(N, tid, 'nor_gl', vec)
        nm = N.nuevo('ShaderNodeNormalMap', uv_map='mundo'); nm.inputs['Strength'].default_value = 2.6 if cat == 'arena' else 1.0
        N.link(nm_t.outputs['Color'], nm.inputs['Color'])
        w = N.nuevo('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name='m_' + cat).outputs['Fac']
        cw = N.vmath('SCALE', c_, escala=w); rw = N.math('MULTIPLY', r_.outputs['Color'], w); nw = N.vmath('SCALE', nm.outputs['Normal'], escala=w)
        col_acc = cw if col_acc is None else N.vmath('ADD', col_acc, cw)
        rug_acc = rw if rug_acc is None else N.math('ADD', rug_acc, rw)
        nor_acc = nw if nor_acc is None else N.vmath('ADD', nor_acc, nw)
    N.link(col_acc, p.inputs['Base Color']); N.link(rug_acc, p.inputs['Roughness'])
    N.link(N.vmath('NORMALIZE', nor_acc), p.inputs['Normal'])
    con_niebla(N, p.outputs[0], out)
    me.materials.append(m)

    # mapa de hierba: allí donde three.js puso hierba (respeta caminos, claros de letras, agua…)
    hb = np.array(D['hierba'], dtype=np.float32).reshape(-1, 3)
    peso = np.zeros(nv, dtype=np.float32); esc = np.ones(nv, dtype=np.float32)
    if True:
        kd = None; y_zona = -1e9
        if len(hb):
            hb = a_blender(hb)
            kd = KDTree(len(hb))
            for i, q in enumerate(hb): kd.insert(q, i)
            kd.balance()
            y_zona = float(hb[:, 1].max()) - 3.0   # más allá de aquí three.js ya no ponía hierba
        verde_n = verde / tot
        for i in range(nv):
            p_ = Vector(co[i]); d = (p_ - cam.location).length
            if d > 150: continue
            vista = world_to_camera_view(scene, cam, p_)
            if vista.z <= 0 or not (-0.15 < vista.x < 1.15 and -0.25 < vista.y < 1.1): continue
            if p_.y < y_zona:
                _, _, dn = kd.find(p_)
                R_ = 0.55 + 0.03 * d
                w = float(paso(R_, R_ * 0.45, dn))
            else:
                # hierba lejana: allí donde el suelo es verde (no en caminos, roca, nieve ni arena)
                w = float(paso(0.55, 0.85, verde_n[i])) * (float(paso(y_zona, y_zona + 6, p_.y)) if kd is not None else 1.0)
                if co[i][2] < 0.35 and LUGAR in ('isla-hello', 'lago-colores'): w = 0.0  # nada de hierba en el agua ni en la orilla
            w *= 1.0 - float(paso(0.25, 0.55, arena[i] / tot[i]))  # nunca sobre el camino ni la arena
            if w <= 0: continue
            peso[i] = w * float(np.clip(1.5 - d / 60, 0.22, 1.0)); esc[i] = 1 + d * 0.02
    # alrededor de los objetos apoyados en el suelo (letras, números, granero, caballetes…) la hierba es corta:
    # así nunca tapa una letra ni un número, y no atraviesa los objetos
    bvh_t = bvh_terreno()
    for ob in OBJETOS_SUELO:
        esq = [ob.matrix_world @ Vector(c_) for c_ in ob.bound_box]
        xs, ys, zs = [e.x for e in esq], [e.y for e in esq], [e.z for e in esq]
        x0, x1, y0, y1, z0 = min(xs), max(xs), min(ys), max(ys), min(zs)
        if max(x1 - x0, y1 - y0) > 25: continue
        cx_, cy_ = (x0 + x1) / 2, (y0 + y1) / 2
        hit = bvh_t.ray_cast(Vector((cx_, cy_, z0 + 50)), Vector((0, 0, -1)), 200)
        if hit[0] is None or z0 > hit[0].z + 0.8: continue
        HUELLAS.append((x0, x1, y0, y1))
        dx = np.maximum(np.maximum(x0 - co[:, 0], co[:, 0] - x1), 0); dy = np.maximum(np.maximum(y0 - co[:, 1], co[:, 1] - y1), 0)
        fac = paso(0.3, 2.0, np.hypot(dx, dy))
        esc *= (0.12 + 0.88 * fac).astype(np.float32); peso *= (0.4 + 0.6 * fac).astype(np.float32)
    for nombre_, arr in (('hierba', peso), ('escala', esc)):
        at = me.attributes.new(nombre_, 'FLOAT', 'POINT'); at.data.foreach_set('value', arr)
    log('terreno: %d vértices, %d con hierba' % (nv, int((peso > 0).sum())))

# ------------------------------------------------------------------ hojas de hierba y flores (modelos propios)
rnd = random.Random(7)
col_hierba = bpy.data.collections.new('matas'); scene.collection.children.link(col_hierba); col_hierba.hide_render = True

def mat_hierba():
    m, N, out = mat_nuevo('hierba')
    p = N.nuevo('ShaderNodeBsdfPrincipled')
    suelo = N.nuevo('ShaderNodeAttribute', attribute_type='INSTANCER', attribute_name='Col').outputs['Color']
    alto = N.nuevo('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name='alto').outputs['Fac']
    oi_ = N.nuevo('ShaderNodeObjectInfo')
    # tonos de hierba: el color del suelo de la dirección de arte, más verde y variado
    verdes = N.mix(oi_.outputs['Random'], (0.10, 0.30, 0.045), (0.24, 0.42, 0.06))
    base = N.mix(0.55, suelo, verdes)
    punta = N.mix(1.0, base, (1.35, 1.3, 1.0), 'MULTIPLY')
    raiz = N.mix(1.0, base, (0.35, 0.4, 0.3), 'MULTIPLY')
    col = N.mix(N.math('POWER', alto, 0.7), raiz, punta)
    N.link(col, p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.55
    p.inputs['Subsurface Weight'].default_value = 0.0
    tr = N.nuevo('ShaderNodeBsdfTranslucent'); N.link(col, tr.inputs['Color'])
    ms = N.nuevo('ShaderNodeMixShader'); ms.inputs[0].default_value = 0.3
    N.link(p.outputs[0], ms.inputs[1]); N.link(tr.outputs[0], ms.inputs[2])
    con_niebla(N, ms.outputs[0], out)
    return m
MAT_HIERBA = mat_hierba()

def mata(nombre, n_hojas, alto_min, alto_max, ancho):
    verts, caras, alto = [], [], []
    for h in range(n_hojas):
        a = rnd.uniform(0, 2 * math.pi); r0 = rnd.uniform(0, 0.05); H_ = rnd.uniform(alto_min, alto_max)
        incl = rnd.uniform(0.15, 0.55); giro_ = rnd.uniform(-0.6, 0.6); w0 = ancho * rnd.uniform(0.7, 1.2)
        bx, by = math.cos(a) * r0, math.sin(a) * r0
        dx, dy = math.cos(a + giro_), math.sin(a + giro_)
        px_, py_ = -math.sin(a), math.cos(a)
        segs = 5; i0 = len(verts)
        for s in range(segs + 1):
            t = s / segs
            curva = incl * t * t * H_
            cx_, cy_, cz_ = bx + dx * curva, by + dy * curva, H_ * t * (1 - 0.25 * incl * t)
            wv = w0 * (1 - t) ** 0.8 + 0.0015
            verts.append((cx_ - px_ * wv, cy_ - py_ * wv, cz_)); verts.append((cx_ + px_ * wv, cy_ + py_ * wv, cz_))
            alto += [t, t]
        for s in range(segs):
            a_ = i0 + 2 * s; caras.append((a_, a_ + 1, a_ + 3, a_ + 2))
    me = bpy.data.meshes.new(nombre); me.from_pydata(verts, [], caras); me.update()
    me.polygons.foreach_set('use_smooth', np.ones(len(caras), dtype=bool))
    at = me.attributes.new('alto', 'FLOAT', 'POINT'); at.data.foreach_set('value', np.array(alto, dtype=np.float32))
    me.materials.append(MAT_HIERBA)
    ob = bpy.data.objects.new(nombre, me); col_hierba.objects.link(ob)
    return ob

for i in range(10):
    mata('mata%d' % i, rnd.randint(9, 16), 0.12, 0.34 if i % 3 else 0.46, 0.012)

def grupo_hierba():
    ng = bpy.data.node_groups.new('hierba', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = Nodos(ng)
    gi, go = N.nuevo('NodeGroupInput'), N.nuevo('NodeGroupOutput')
    peso_ = N.nuevo('GeometryNodeInputNamedAttribute', data_type='FLOAT'); peso_.inputs['Name'].default_value = 'hierba'
    esc_ = N.nuevo('GeometryNodeInputNamedAttribute', data_type='FLOAT'); esc_.inputs['Name'].default_value = 'escala'
    cmp_ = N.nuevo('FunctionNodeCompare', data_type='FLOAT', operation='GREATER_THAN'); N.link(peso_.outputs['Attribute'], cmp_.inputs[0]); cmp_.inputs[1].default_value = 0.01
    dist = N.nuevo('GeometryNodeDistributePointsOnFaces', distribute_method='RANDOM')
    N.link(gi.outputs[0], dist.inputs['Mesh']); N.link(cmp_.outputs[0], dist.inputs['Selection'])
    dist.inputs['Density'].default_value = 34.0; dist.inputs['Seed'].default_value = 3
    peso2 = N.nuevo('GeometryNodeInputNamedAttribute', data_type='FLOAT'); peso2.inputs['Name'].default_value = 'hierba'
    rv = N.nuevo('FunctionNodeRandomValue', data_type='FLOAT')
    cmp2 = N.nuevo('FunctionNodeCompare', data_type='FLOAT', operation='GREATER_THAN'); N.link(rv.outputs[1], cmp2.inputs[0]); N.link(peso2.outputs['Attribute'], cmp2.inputs[1])
    dele = N.nuevo('GeometryNodeDeleteGeometry', domain='POINT'); N.link(dist.outputs['Points'], dele.inputs['Geometry']); N.link(cmp2.outputs[0], dele.inputs['Selection'])
    ci = N.nuevo('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = col_hierba
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    iop = N.nuevo('GeometryNodeInstanceOnPoints')
    N.link(dele.outputs[0], iop.inputs['Points']); N.link(ci.outputs[0], iop.inputs['Instance'])
    iop.inputs['Pick Instance'].default_value = True
    ri = N.nuevo('FunctionNodeRandomValue', data_type='INT'); ri.inputs[4].default_value = 0; ri.inputs[5].default_value = 9
    N.link(ri.outputs[2], iop.inputs['Instance Index'])
    rz = N.nuevo('FunctionNodeRandomValue', data_type='FLOAT'); rz.inputs[2].default_value = 0; rz.inputs[3].default_value = 6.283; rz.inputs[8].default_value = 11
    rx = N.nuevo('FunctionNodeRandomValue', data_type='FLOAT'); rx.inputs[2].default_value = -0.12; rx.inputs[3].default_value = 0.12; rx.inputs[8].default_value = 5
    cxyz = N.nuevo('ShaderNodeCombineXYZ'); N.link(rx.outputs[1], cxyz.inputs[0]); N.link(rz.outputs[1], cxyz.inputs[2])
    N.link(cxyz.outputs[0], iop.inputs['Rotation'])
    rs = N.nuevo('FunctionNodeRandomValue', data_type='FLOAT'); rs.inputs[2].default_value = 0.7; rs.inputs[3].default_value = 1.35; rs.inputs[8].default_value = 17
    sc = N.math('MULTIPLY', rs.outputs[1], esc_.outputs['Attribute'])
    N.link(sc, iop.inputs['Scale'])
    j = N.nuevo('GeometryNodeJoinGeometry'); N.link(iop.outputs['Instances'], j.inputs[0]); N.link(gi.outputs[0], j.inputs[0])
    N.link(j.outputs[0], go.inputs[0])
    return ng

if TERRENO is not None and float(TERRENO.data.attributes['hierba'].data[0].value) >= 0 and np.any(peso > 0):
    mod = TERRENO.modifiers.new('hierba', 'NODES'); mod.node_group = grupo_hierba()

# flores: en los mismos sitios y colores que en three.js, con pétalos y tallo
FLORES = np.array(D['flores'], dtype=np.float32).reshape(-1, 6)
if len(FLORES) and TERRENO is not None:
    def mat_petalo():
        m, N, out = mat_nuevo('petalo')
        p = N.nuevo('ShaderNodeBsdfPrincipled')
        c_ = N.nuevo('ShaderNodeAttribute', attribute_type='INSTANCER', attribute_name='col').outputs['Color']
        N.link(c_, p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.5
        p.inputs['Subsurface Weight'].default_value = 0.3; p.inputs['Sheen Weight'].default_value = 0.5
        con_niebla(N, p.outputs[0], out); return m
    def mat_simple(nombre, c_, rug=0.6):
        m, N, out = mat_nuevo(nombre); p = N.nuevo('ShaderNodeBsdfPrincipled')
        p.inputs['Base Color'].default_value = c_ + (1,); p.inputs['Roughness'].default_value = rug
        con_niebla(N, p.outputs[0], out); return m
    MP, MC, MT = mat_petalo(), mat_simple('centro', (0.9, 0.62, 0.05)), mat_simple('tallo', (0.06, 0.2, 0.03))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=1)
    flor = bpy.context.active_object; flor.name = 'flor'
    bm_me = flor.data
    bm_me.materials.append(MP); bm_me.materials.append(MC); bm_me.materials.append(MT)
    # construir pétalos, centro y tallo uniendo primitivas
    partes = []
    for k in range(6):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=1)
        pt = bpy.context.active_object; a = k / 6 * 2 * math.pi
        pt.scale = (0.06, 0.03, 0.012); pt.location = (math.cos(a) * 0.055, math.sin(a) * 0.055, 0.0); pt.rotation_euler = (0, -0.25, a)
        partes.append(pt)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=0.028, location=(0, 0, 0.006)); ce = bpy.context.active_object
    ce.data.materials.append(MC); partes.append(ce)
    bpy.ops.mesh.primitive_cylinder_add(vertices=5, radius=0.006, depth=0.5, location=(0, 0, -0.25)); ta = bpy.context.active_object
    ta.data.materials.append(MT); partes.append(ta)
    for pt in partes[:6]: pt.data.materials.append(MP)
    bpy.data.objects.remove(flor)
    bpy.ops.object.select_all(action='DESELECT')
    for pt in partes: pt.select_set(True)
    bpy.context.view_layer.objects.active = partes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    flor = bpy.context.active_object; flor.name = 'flor_base'
    for c_ in flor.users_collection: c_.objects.unlink(flor)
    coleccion_base.objects.link(flor)
    bvh = bvh_terreno()
    P, R, S, CO = [], [], [], []
    for x, y, z, r_, g_, b_ in FLORES:
        q = b((x, y, z))
        if any(h_[0] - 1.1 < q.x < h_[1] + 1.1 and h_[2] - 1.1 < q.y < h_[3] + 1.1 for h_ in HUELLAS): continue  # nada delante de letras y objetos
        hit = bvh.ray_cast(Vector((q.x, q.y, q.z + 3)), Vector((0, 0, -1)), 10)
        suelo_z = hit[0].z if hit[0] is not None else q.z - 0.25
        d = (q - cam.location).length
        s_ = (1.35 + rnd.random() * 0.55) * (1 + d * 0.012)
        P.append((q.x, q.y, suelo_z + rnd.uniform(0.26, 0.42) * s_))
        R.append((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0, 6.28))); S.append((s_, s_, s_))
        CO.append((r_, g_, b_, 1))
    nube_puntos('flores', P, {'rot': ('FLOAT_VECTOR', R), 'esc': ('FLOAT_VECTOR', S), 'col': ('FLOAT_COLOR', CO)}, flor)
    log('flores:', len(P), 'de', len(FLORES), '· huellas de objetos:', len(HUELLAS))

# ------------------------------------------------------------------ render
r = scene.render; cy = scene.cycles
r.engine = 'CYCLES'; cy.device = 'CPU'
cy.samples = MUESTRAS; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.04 if MUESTRAS >= 64 else 0.06
cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
try: cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
except Exception: pass
cy.max_bounces = 4; cy.diffuse_bounces = 2; cy.glossy_bounces = 2; cy.transmission_bounces = 3; cy.transparent_max_bounces = 8
cy.sample_clamp_indirect = 6.0; cy.blur_glossy = 1.0; cy.caustics_reflective = False; cy.caustics_refractive = False
r.film_transparent = False
vs = scene.view_settings; vs.view_transform = 'AgX'
for look in ('AgX - Medium High Contrast', 'AgX - Base Contrast', 'None'):
    try: vs.look = look; break
    except Exception: continue
vs.exposure = CFG['exp']
scene.display_settings.display_device = 'sRGB'

# desenfoque de campo suave: enfoca los protagonistas de los lados; difumina algo el primer plano y el fondo lejano
foco = float(D['camara'].get('foco', 30.0))
cam_d.dof.use_dof = not CFG.get('interior') or True
cam_d.dof.focus_distance = foco
f_mm = cam_d.lens
coc_px = 2.6  # desenfoque del fondo lejano, en píxeles de la imagen final
cam_d.dof.aperture_fstop = max(0.25, (f_mm * f_mm * ALTO) / ((foco * 1000 - f_mm) * coc_px * cam_d.sensor_height))
log('cámara: %.1f mm, f/%.2f, foco a %.0f' % (f_mm, cam_d.dof.aperture_fstop, foco))

if '--recorte' in argv:  # x0 x1 y0 y1 en fracciones de la imagen (y desde abajo): para revisar un detalle rápido
    i_ = argv.index('--recorte'); r_b = [float(v_) for v_ in argv[i_ + 1:i_ + 5]]
    scene.render.use_border = True; scene.render.use_crop_to_border = True
    scene.render.border_min_x, scene.render.border_max_x, scene.render.border_min_y, scene.render.border_max_y = r_b
if '--sin-render' in argv:
    log('preparada (sin render)'); sys.exit(0)
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)

def guardar_webp(ruta, max_kb):
    img = bpy.data.images['Render Result']
    r.image_settings.file_format = 'WEBP'; r.image_settings.color_mode = 'RGB'
    q = 82
    while True:
        r.image_settings.quality = q
        img.save_render(ruta, scene=scene)
        kb = os.path.getsize(ruta) / 1024
        if kb <= max_kb or q <= 50: return q, kb
        q -= 4

if LUZ:
    # cielo de iluminación para los personajes en vivo: panorama equirectangular 1024×512, centro = hacia donde mira la cámara
    pc_d = bpy.data.cameras.new('pano'); pc_d.type = 'PANO'
    try: pc_d.panorama_type = 'EQUIRECTANGULAR'
    except Exception: pc_d.cycles.panorama_type = 'EQUIRECTANGULAR'
    pc = bpy.data.objects.new('pano', pc_d); scene.collection.objects.link(pc)
    adelante = (mira - pos); adelante.z = 0; adelante.normalize()
    if CFG.get('interior'):
        q = pos + adelante * 10
        hit = bvh_terreno().ray_cast(Vector((q.x, q.y, q.z + 10)), Vector((0, 0, -1)), 50)
        pc.location = Vector((q.x, q.y, (hit[0].z if hit[0] else 0) + 1.2))
    else:
        # cielo del HDRI arriba y, abajo, un suelo uniforme del color medio del lugar iluminado por el sol y el cielo:
        # así los personajes reciben el rebote del prado (o de la arena, o del agua) sin manchas del encuadre
        for ob in scene.objects:
            if ob.type == 'MESH': ob.hide_render = True
        if TERRENO is not None:
            vista_ok = np.array([0 < world_to_camera_view(scene, cam, Vector(c_)).z and (Vector(c_) - pos).length < 80 for c_ in co])
            albedo = cc[vista_ok].mean(axis=0) if vista_ok.any() else cc.mean(axis=0)
        else:
            albedo = np.array([0.2, 0.25, 0.1])
        if LUGAR == 'isla-hello': albedo = albedo * 0.5 + np.array([0.05, 0.25, 0.35]) * 0.5  # mitad mar
        irr = sol.energy * math.sin(alt_sol) + 1.0 * CFG['cielo']
        suelo_rad = [float(a_) * irr / math.pi for a_ in albedo]
        sep = WN.nuevo('ShaderNodeSeparateXYZ'); WN.link(tc.outputs['Generated'], sep.inputs[0])
        mr_ = WN.nuevo('ShaderNodeMapRange'); WN.link(sep.outputs['Z'], mr_.inputs['Value'])
        mr_.inputs['From Min'].default_value = -0.03; mr_.inputs['From Max'].default_value = 0.01
        bg_suelo = WN.nuevo('ShaderNodeBackground'); bg_suelo.inputs['Color'].default_value = tuple(suelo_rad) + (1,)
        ms_ = WN.nuevo('ShaderNodeMixShader'); WN.link(mr_.outputs['Result'], ms_.inputs[0])
        WN.link(bg_suelo.outputs[0], ms_.inputs[1]); WN.link(bg.outputs[0], ms_.inputs[2]); WN.link(ms_.outputs[0], wo.inputs['Surface'])
        log('luz: suelo %s' % ', '.join('%.2f' % x for x in suelo_rad))
        pc.location = pos
    pc.rotation_euler = (math.pi / 2, 0, math.atan2(adelante.y, adelante.x) - math.pi / 2)
    scene.camera = pc; r.resolution_x, r.resolution_y, r.resolution_percentage = 1024, 512, 100
    cy.samples = 64; cam_d.dof.use_dof = False
    bpy.ops.render.render()
    r.image_settings.file_format = 'JPEG'; r.image_settings.quality = 90; r.image_settings.color_mode = 'RGB'
    os.makedirs(os.path.dirname(LUZ), exist_ok=True)
    bpy.data.images['Render Result'].save_render(LUZ, scene=scene)
    log('luz guardada:', LUZ)
else:
    t = time.time()
    bpy.ops.render.render()
    t_render = time.time() - t
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    q, kb = guardar_webp(SALIDA, MAX_KB)
    log('RENDER %s-%s: %dx%d al %d%% · %d muestras · %.0f s · WebP calidad %d · %.0f KB → %s' % (LUGAR, ORI, ANCHO, ALTO, ESCALA, MUESTRAS, t_render, q, kb, SALIDA))
