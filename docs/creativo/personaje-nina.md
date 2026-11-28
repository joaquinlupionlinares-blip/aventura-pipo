# Personaje NIÑA · «Las aventuras de ___ y ___»

Guía de diseño para construirla en three.js con primitivas, material toon y contorno.
Convivencia con el niño: misma familia visual (mismas proporciones, contorno, ojos y material), silueta distinta. **Ella se lee en horizontal** (dos coletas hacia los lados y lupa); conviene que **él se lea en vertical** (tupé, gorra o pelo de punta).

---

## 1 · Nombre

| Nombre | Sílabas | Por qué |
|---|---|---|
| **Alba** ★ | Al-ba | Empieza por **A**, la primera vocal que aprenden. Corriente en España, fácil de decir, sin marca. «Las aventuras de Alba y …» suena bien. |
| Noa | No-a | Muy corto, solo sonidos fáciles (n + vocales). |
| Tina | Ti-na | Rítmico y alegre; sílabas directas (CV-CV), útil para el módulo de sílabas. |
| Vera | Ve-ra | Suave y claro. La «r» simple puede costarle a algún niño de 5 años. |
| Lía | Lí-a | Dulce y corto. Puede confundirse al oído con otros nombres en -ía. |

**Favorito: Alba.** Es la propia letra A que enseña Lengua («¡A de Alba!»), tiene dos sílabas que se distinguen bien, la sílaba tónica va al principio y no se parece a ninguna exploradora con marca. Descarté **Nora** porque rima con «Dora» (otra niña exploradora) y **Lola** porque existe «Charlie y Lola».
Regla de pareja: el nombre del niño no debe empezar por la misma letra ni rimar con el de ella.

## 2 · Personalidad

1. **Curiosa**: todo lo mira con la lupa y siempre pregunta «¿por qué?».
2. **Valiente**: prueba la primera, aunque no sepa si le va a salir.
3. **Ingeniosa**: le encanta construir cosas y encontrar soluciones.
4. **Alegre**: celebra los aciertos del niño más que los suyos.
5. **Paciente**: cuando el niño se equivoca, lo intentan otra vez juntos y sin prisa.

- **Muletilla:** «¡A ver, a ver!» (se usa al empezar a investigar y en la pose «pensando»).
- **Le gusta:** coleccionar piedras y hojas, observar bichitos, contar cosas y construir torres.
- **Le da un poco de miedo:** los truenos. Se tapa las orejas, cuenta «uno, dos, tres» y se le pasa (lo podemos usar en Medio, en el tema del tiempo).

## 3 · Diseño 3D con primitivas

**Unidades:** altura total 100 u (en escena, 1 u = 0,01). Eje y hacia arriba, eje z hacia la cámara y eje x hacia la **derecha de la pantalla**. Los pies están en y = 0.
**Proporciones:** cabeza 42 % (y 56–98) · torso 22 % (y 33–55) · piernas 33 % (y 0–33). El pelo llega hasta y ≈ 100.

### Paleta (contraste calculado en esta sesión, WCAG)

| Uso | Hex | vs cielo #CDEBFF | vs tinta #22306B |
|---|---|---|---|
| Peto (masa principal) | `#E8502F` coral | 3,0 | 3,3 |
| Pelo | `#9B4A22` castaño cobrizo | 5,0 | 2,0 |
| Camiseta y coleteros | `#FFC83D` amarillo | 1,3 | 8,0 |
| Botas y lupa | `#2E9E5B` verde hoja | 2,8 | 3,6 |
| Piel | `#F4C29A` | 1,3 | 7,7 |
| Contorno | `#22306B` tinta del juego | 9,9 | — |

Detalles fuera de la paleta: ojos `#2A1A14`, brillo de ojos `#FFFFFF`, boca `#7A2630`, rubor `#FF9C8A`.
Los colores claros (piel y camiseta) casi no contrastan con el cielo, pero los separa el contorno tinta. **Sobre fondo tinta** el contorno desaparece: hay que cambiarlo a `#FFFFFF` o añadir un halo blanco.

### Piezas

| Pieza | Forma | Tamaño (u) | Posición (x, y, z) | Color |
|---|---|---|---|---|
| Cabeza | esfera, escala (1,05, 1, 1) | r 21 | (0, 77, 0) | piel |
| Orejas ×2 | esfera | r 3 | (±20, 76, 0) | piel |
| Ojos ×2 | esfera aplanada (1, 1,3, 0,45) | r 4,2 | (±7,5, 76, 19,5) | ojos |
| Brillo ×2 | esfera, sin contorno | r 1,3 | ojo + (1,2, 1,8, 1,5) | blanco |
| Cejas ×2 | cápsula horizontal | r 0,9, l 5 | (±7,5, 84, 19) | pelo |
| Boca sonrisa | toro, arco 180° invertido | R 3, tubo 0,8 | (0, 68, 20) | boca |
| Boca abierta | esfera aplanada (1,3, s, 0,4) | r 3 | (0, 68, 20) | boca |
| Mejillas ×2 | esfera muy aplanada, sin contorno | r 3 | (±12, 70, 17) | rubor |
| Casquete de pelo | esfera, solo la mitad superior y la trasera, inclinada 10° hacia atrás | r 22,5 | (0, 79, -1) | pelo |
| Flequillo de lado | esfera aplanada (1,6, 0,6, 0,7), rotada z 15° | r 8 | (-5, 91, 15) | pelo |
| Coletas ×2 | cápsula, 35° hacia fuera y hacia abajo | r 6, l 10 | raíz en (±22, 80, -4) | pelo |
| Coleteros ×2 | toro | R 3, tubo 1,2 | raíz de la coleta | amarillo |
| Torso | cápsula | r 12, l 10 | (0, 45, 0) | amarillo |
| Mangas ×2 | esfera | r 5 | (±12, 53, 0) | amarillo |
| Peto: cuerpo | cilindro algo ancho por abajo | r 12,5–13,5, alto 15 | (0, 40, 0) | coral |
| Peto: babero | caja redondeada | 12 × 8 × 2 | (0, 49, 12) | coral |
| Tirantes ×2 | cápsula fina | r 1,5, l 10 | del babero a los hombros | coral |
| Botones ×2 | esfera | r 1,3 | (±4, 52, 13,5) | amarillo |
| Brazo y antebrazo ×2 | cápsula + cápsula, con pivote en hombro y codo | r 3,5, l 8 y l 7 | hombro (±13, 53, 0) | piel |
| Manos ×2 | esfera (manopla sin dedos) | r 4 | final del antebrazo | piel |
| Dedo índice | cápsula, **visible solo al señalar** | r 1,2, l 4 | delante de la mano | piel |
| Pantalón corto ×2 | cilindro | r 5,5, alto 11 | (±5,5, 27, 0) | coral |
| Piernas ×2 | cápsula | r 3,5, l 10 | (±5,5, 15, 0) | piel |
| Botas ×2 | cilindro r 5, alto 7, más esfera aplanada como puntera hacia +z | — | (±5,5, 4, 1) | verde |
| **Lupa**: aro | toro | R 5, tubo 1,3 | colgada de la cadera izquierda; en la mano al investigar | verde |
| Lupa: cristal | cilindro fino, opaco, con un brillo blanco | r 5, alto 0,4 | dentro del aro | `#E8F7FF` |
| Lupa: mango | cilindro | r 1,3, l 8 | debajo del aro | verde |

**Objeto característico: la lupa grande.** Es lo que la define: mirar de cerca y descubrir. Encaja con todas las asignaturas: contar bichos, mirar letras, ver animales…
**Ojos felices** (para celebrar y despedirse): se sustituyen los ojos por toros en arco de 180° (∩), R 3,5 y tubo 0,9.
**Icono de 48 px:** solo cabeza y coletas, en vista de 3/4, con el contorno al doble de grosor y los ojos un 15 % más grandes. **Prueba de silueta:** en negro tiene que leerse la cabeza grande, las dos coletas hacia los lados y el aro de la lupa.

**Técnica** (PROPOSED, no está probado en la Tab A8):
- `MeshToonMaterial` con un `gradientMap` de 3 tonos.
- Contorno por casco invertido (`BackSide`, escala 1,035, color tinta).
- Esferas de 24×16 segmentos, menos de 15 000 triángulos en total y geometrías fusionadas por material.

## 4 · Expresiones y gestos

Rotaciones en grados. En el brazo, «arriba» significa rotar en el plano frontal desde la posición de reposo pegado al cuerpo. **Su izquierda queda a la derecha de la pantalla.**

| Gesto | Cuerpo y brazos | Ojos, cejas y boca | Duración |
|---|---|---|---|
| **Saludo** | Brazo izquierdo arriba 150°, codo 30°. El antebrazo oscila ±25° tres veces a unos 3 Hz. Cabeza ladeada 10°. Saltito de +2 en y. | Cejas +1,5 u. Boca abierta (s 0,7). Ojos felices en el pico del gesto. | 1,2 s |
| **Espera tranquila** | Torso en escala y 1 ↔ 1,02 cada 3 s. Cabeza oscila ±3° en z cada 4 s. Coletas con inercia de muelle. Cada 8–12 s, una microacción: mira a los lados (±20° en y) o se mira la lupa. | Parpadeo cada 2,5–5 s, aleatorio: escala y del ojo a 0,1 durante 120 ms. Uno de cada cuatro es doble. Boca en sonrisa. | bucle |
| **Habla** | La cabeza asiente ±4° en x en cada frase. Manos sueltas ±10°. | La boca abierta sigue el volumen del audio (s 0,15–1). Sin audio, alterna 0,15–0,8 a unos 8 Hz con variación y se cierra en los silencios. Cejas +1 u en las sílabas fuertes. | mientras suena |
| **Explica / señala a la derecha** | Gira el cuerpo 20° en y hacia la derecha. Brazo izquierdo en horizontal (90°), codo 0° y dedo índice visible. Cabeza girada 25° a la derecha. Después vuelve la cabeza a cámara: «¿Lo ves?». | Ojos desplazados +1,5 u en x. Ceja izquierda +1,5 u. Sonrisa. | 1,5 s y se mantiene |
| **Ánimo ante un error** | Cabeza ladeada 12°. Puños delante del pecho: hombros 40° hacia delante, codos 90°. Dos botecitos de +1,5 en y. | Durante 0,3 s, cejas en tejadillo (extremos interiores +15°). Luego cejas normales y sonrisa cerrada. «¡Casi! ¡Otra vez!» | 1,2 s |
| **Celebración breve** | Primero se encoge (escala y 0,9 y x 1,05), luego salta +8 estirándose (escala y 1,08). Brazos arriba 160° los dos. Las coletas suben con inercia. Al aterrizar, otro encogimiento. | Ojos felices. Boca abierta (s 1). Cejas +2 u. | 1,0–1,5 s |
| **Despedida** | Como el saludo, pero más lento: dos oscilaciones a 2 Hz, con la cabeza ladeada al otro lado. | Al final, guiño (un ojo en escala y 0,1 durante 300 ms). Sonrisa. | 1,5 s |
| **Pensando** (se equivoca a propósito) | Mano derecha en la barbilla: hombro 60° hacia delante, codo 120°. Cabeza ladeada 15° y mirando arriba (−10° en x). La lupa en la otra mano. Dice la respuesta equivocada con seguridad y luego se encoge de hombros: hombros +2 en y, brazos abiertos 30°, codos 60°. «¿Me ayudas?» | «¡A ver, a ver!». Ojos desplazados (+1, +1,5). Una ceja +2 u y la otra −1 u. Boca en «o» pequeña (esfera r 1,5) desplazada 1,5 u hacia un lado. | 2–3 s |

Todos los gestos parten de la espera tranquila y vuelven a ella. Las transiciones duran 150–250 ms con *ease-in-out*. Nunca se queda congelada.

## 5 · Dirección de voz

- **Edad aparente:** 7 años, un poco mayor que quien juega, como una prima que te ayuda.
- **Tono:** medio y cálido, con la sonrisa en la voz. No debe sonar aguda de dibujo animado.
- **Ritmo:** pausado, unas 110–130 palabras por minuto. Frases de 8 palabras como mucho y medio segundo de pausa entre frases. Las sílabas y letras de Lengua se dicen muy articuladas.
- **Energía:** media al explicar, alta pero corta al celebrar, baja y cercana al animar tras un error.
- **Inglés:** las palabras en inglés se pronuncian bien, despacio y separadas del español. Si la voz no lo consigue, conviene grabar esas palabras aparte. No hay que enseñar una pronunciación equivocada.
- **Evitar:** una adulta imitando a una niña (falsete, ceceo forzado), voz chillona o gritos, habla de bebé, sarcasmo, ironía y tono de profesora que regaña.
- Si se usa una voz real infantil, hace falta autorización de los padres. Si es TTS, como mucho +2 o +3 semitonos sobre una voz natural y velocidad de 0,9.

## 6 · Do / Don't

| Do | Don't |
|---|---|
| Que la reconozcan las coletas, la lupa y el peto coral. | Cambiarle el peinado, el color del peto o quitarle la lupa según la escena. |
| Ojos grandes con brillo y cejas muy expresivas. | Pestañas, pintalabios, maquillaje o joyas. |
| Mostrarla investigando, construyendo y probando la primera. | Que su papel sea ser guapa, ir de compras o necesitar que la rescaten. |
| Animar con «¡casi!» y «¡otra vez!». | Lágrimas, enfado, cabeza gacha más de 10° o la boca hacia abajo. |
| Mantener las proporciones, el contorno y el material del niño. | Darle más detalle o un estilo distinto del suyo. |
| Comprobar cada pose a 48 px y en silueta. | Piezas finas (dedos, mechones, cordones) que desaparecen en pequeño. |
| Probar el contorno sobre cielo y sobre tinta. | Vestirla de azul: se pierde contra el fondo. |
