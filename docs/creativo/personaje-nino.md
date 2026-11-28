# Personaje NIÑO · «Las aventuras de ___ y ___»

Compañero de aventura para niños de 5-7 años. Dibujo animado 3D chibi, construido en three.js con primitivas, material toon y contorno.

## 1 · Nombre

| Nombre | Sílabas | Por qué funciona | Riesgo |
|---|---|---|---|
| **Nico** ★ | ni-co | Dos sílabas abiertas, sonidos (n, k) que un niño de 5 años ya dice bien. Se grita fácil: «¡Nicooo!» | Ninguno relevante |
| Hugo | hu-go | Corto, cálido, muy reconocible | La «h» muda puede liar cuando practiquen letras |
| Leo | le-o | Muy corto, alegre | Se confunde con el verbo «leo», justo en un juego de lectura |
| Tomi | to-mi | Suena juguetón, rima fácil | Algo menos común en España |
| Bruno | bru-no | Suena fuerte y aventurero | El grupo «br» cuesta a algunos niños de 5 años |

**Favorito: Nico.** Es el más fácil de pronunciar y de oír, no choca con ninguna palabra que se enseñe en el juego y suena bien en la frase: «Las aventuras de Nico y ___». Coordinar con la niña: que su nombre **no empiece por N** y tenga otra vocal tónica (para que no se confundan al oírlos).

## 2 · Personalidad

1. **Curioso**: todo lo mira con su lupa y pregunta «¿y por qué?».
2. **Valiente**: lo intenta aunque no le salga a la primera.
3. **Paciente**: espera sin prisa; nunca le mete prisa al jugador.
4. **Cariñoso**: celebra los logros del otro antes que los suyos.
5. **Divertido**: hace bromas suaves y a veces se equivoca a propósito.

- **Muletilla:** «¡A ver, a ver!» (y acerca la lupa).
- **Le gusta:** buscar bichos con la lupa, contar cosas (piedras, estrellas, pasos), pintar con muchos colores y tocar el piano.
- **Le da un poco de miedo:** los truenos. Se tapa las orejas… y luego cuenta «uno, dos, tres» para saber si la tormenta está lejos.

## 3 · Diseño 3D

**Proporciones** (altura total H = 1,0; mira hacia +z): cabeza 43 % · torso 25 % · piernas 26 % · pies 6 %. Silueta: **cabeza redonda con un tupé que apunta hacia delante + mochila redonda a la espalda.** Es lo que se reconoce en 48 px y a contraluz.

**Paleta (6 colores + contorno)**

| Uso | Hex | Nota |
|---|---|---|
| Camiseta (color principal) | `#FF8A3D` naranja | Contrasta en tono con el cielo y con el azul tinta |
| Pantalón corto y mochila | `#3E8E5A` verde bosque | Más oscuro: separa bien del cielo |
| Lupa y chapa del pecho | `#FFD23F` amarillo | El acento; siempre en primer plano |
| Pelo y cejas | `#5A3420` castaño oscuro | |
| Piel | `#E8B48A` | Tono medio cálido |
| Zapatillas y ojos | `#FFF6E8` crema | |
| Contorno | `#22306B` azul tinta | Grosor 0,012 con casco invertido. Si el fondo es `#22306B`, usar contorno `#FFF6E8` |

Sin azul en la ropa: el azul se lo quedan el fondo y Pipo. Sugerencia para la niña: que su color principal sea otro (morado, rosa fresa o turquesa), no el naranja.

**Piezas** (medidas relativas a H; x+ = izquierda del personaje = derecha de la pantalla)

| Pieza | Forma | Tamaño | Posición (x, y, z) | Color |
|---|---|---|---|---|
| Cabeza | esfera | r 0,215 | (0, 0,775, 0) | piel |
| Orejas ×2 | esfera escalada (1, 1, 0,5) | r 0,045 | (±0,21, 0,76, 0) | piel |
| Casco de pelo | media esfera (thetaLength π/2), inclinada 20° hacia atrás | r 0,225 | (0, 0,79, −0,01) | pelo |
| Tupé | cono girado 55° hacia delante | r 0,07 · alto 0,16 | (0, 0,99, 0,08) | pelo |
| Mechones laterales ×2 | cono girado ±40° | r 0,04 · alto 0,08 | (±0,1, 0,95, 0,05) | pelo |
| Ojos ×2 | esfera escalada (0,065, 0,085, 0,03) | — | (±0,075, 0,79, 0,195) | crema |
| Pupilas ×2 | esfera | r 0,035 | delante de cada ojo | `#3A2416` |
| Brillo ×2 | esfera | r 0,012 | arriba-fuera de la pupila | blanco |
| Cejas ×2 | cápsula | r 0,012 · largo 0,05 | (±0,075, 0,875, 0,19) | pelo |
| Nariz | esfera | r 0,02 | (0, 0,74, 0,215) | piel un poco más oscura |
| Boca cerrada | arco de toro (arc π) | R 0,04 · tubo 0,008 | (0, 0,69, 0,2) | `#7A2E2E` |
| Boca abierta | esfera escalada (0,05, var, 0,02) | escala y 0,15-1,0 | igual | `#7A2E2E` |
| Mofletes ×2 | disco (cilindro fino), opacidad 0,5 | r 0,03 | (±0,13, 0,72, 0,18) | `#FF9E9E` |
| Torso | cápsula | r 0,13 · largo 0,12 | (0, 0,45, 0) | naranja |
| Chapa | cilindro fino girado 90° | r 0,035 | (0, 0,5, 0,13) | amarillo |
| Pantalón | cilindro | r 0,135 · alto 0,1 | (0, 0,3, 0) | verde |
| Piernas ×2 | cápsula | r 0,055 · largo 0,1 | (±0,065, 0,16, 0) | piel |
| Zapatillas ×2 | esfera escalada (0,08, 0,05, 0,11) | — | (±0,07, 0,04, 0,02) | crema |
| Brazos ×2 | cápsula, pivote en el hombro (0,53) | r 0,045 · largo 0,16 | (±0,15, 0,44, 0) | naranja (manga) |
| Manos ×2 | esfera (manopla, sin dedos) | r 0,05 | extremo del brazo | piel |
| Mochila | cápsula escalada (1, 1, 0,6) | r 0,1 · largo 0,08 | (0, 0,47, −0,15) | verde |
| Lupa: aro | toro | R 0,07 · tubo 0,015 | en la mano izquierda o colgada de la mochila | amarillo |
| Lupa: cristal | cilindro fino, opacidad 0,35 | r 0,07 | dentro del aro | blanco |
| Lupa: mango | cilindro | r 0,015 · alto 0,09 | bajo el aro | verde |

El tupé y los mechones son hijos del grupo cabeza. Cada brazo es un grupo con el pivote en el hombro; las manos son hijas del brazo.

## 4 · Expresiones y gestos

Abducción del brazo: brazo izquierdo `rotation.z` +θ y brazo derecho −θ (θ = 0 colgando, 180° arriba). Reposo: θ = 10°.

| Pose | Cuerpo y brazos | Cabeza | Ojos · cejas · boca | Duración |
|---|---|---|---|---|
| **Saludo** | Brazo derecho θ 150°, oscila ±20° a 3 Hz; saltito de 0,03 | roll 8° hacia la mano | Ojos abiertos; cejas +0,01; boca abierta 0,6 | 1,2 s |
| **Espera** | Torso escala y 1 → 1,02 (ciclo 3 s) | yaw ±4° lento (ciclo 6 s) | Parpadeo: ojo escala y 1 → 0,1 → 1 en 120 ms, cada 2,5-5 s al azar (1 de cada 4, doble). Pupilas: miradas cortas al azar. Boca: sonrisa cerrada | en bucle |
| **Habla** | Manos ±5° al ritmo | pitch ±3° en las frases | Boca con 3 aperturas (escala y 0,15 / 0,5 / 1,0), 8-12 cambios por segundo, siguiendo el volumen del audio pregrabado; cejas +0,008 en las sílabas fuertes | lo que dure el audio |
| **Explica (a la derecha)** | Cuerpo yaw +15°; brazo izquierdo θ 80°, rotation.x −10° (señala) | yaw +20° | Pupilas x +0,015 (miran hacia donde señala); cejas arriba; sonrisa | mientras explica |
| **Ánimo ante error** | Brazo derecho θ 40° y x −60° (puño «¡tú puedes!»), dos botecitos | asiente 2 veces (pitch 8°), roll 6° | Cejas interiores +0,006 (empatía, no pena); sonrisa cerrada pequeña. Hombros como mucho 5° abajo | 1,5 s |
| **Celebración** | Agacharse (escala 1,1 / 0,9) → salto de 0,08; ambos brazos θ 160°; el tupé rebota | pitch −8° (mira arriba) | Ojos «felices»: se cambian por un arco de toro ^ ^; boca abierta 1,0 | 1,2 s como máximo |
| **Despedida** | Brazo derecho θ 130°, ±15° a 1,5 Hz; pasito atrás de 0,05 | roll 6° | Sonrisa cerrada; parpadeo lento al final | 1,5 s |
| **Pensando** | Mano derecha a la barbilla (θ 20°, x −110°); lupa en la otra mano | roll −10°, yaw −10° | Pupilas arriba a la izquierda (+0,02 y, −0,01 x); **solo una ceja arriba**; boca torcida (rotation.z 15°, escala x 0,6). Remate «¿me ayudas?»: brazos θ ±35°, x −40°, palmas arriba, hombros +0,02 | 2 s + remate |

Transiciones siempre suavizadas (ease-in-out, 150-250 ms) y vuelta a «espera».

## 5 · Dirección de voz

- **Edad aparente:** 7-8 años. Un poco mayor que el jugador: un amigo que sabe un poco más, no un profesor.
- **Tono:** medio, cálido, sonriente. **Ritmo:** pausado, frases de 3-8 palabras y una pausa breve después de cada instrucción. **Energía:** 6/10 de normal y 8/10 solo al celebrar.
- **Con Piper** (ver `docs/VOZ.md`): voz base con el tono subido un poco (+2/+3 semitonos, como mucho ×1,15) y velocidad `length_scale` ≈ 1,08. Para las frases fijas (saludo, ánimo, celebración) lo ideal es grabar a un niño real de 8-10 años, con permiso de sus tutores.
- **Evitar:** un adulto haciendo de niño (falsete, voz de dibujos exagerada), voz chillona o acelerada (tono ×1,3 o más), tono infantilizado de «cosita», gritar al celebrar y suspirar o ponerse triste al fallar.

## 6 · Do / Don't

| Do | Don't |
|---|---|
| Cabeza ≈ 43 %, tupé hacia delante y mochila: siempre visibles | Quitarle el tupé o la mochila: pierde la silueta |
| Camiseta naranja y lupa amarilla en todas las escenas | Ropa azul o colores que se pierdan sobre `#CDEBFF` |
| Mirar al niño o a lo que se explica | Mirar a la nada mientras habla |
| Celebrar el esfuerzo («¡Lo has intentado!») | Burlarse, suspirar o enfadarse ante un error |
| Equivocarse a propósito y pedir ayuda | Saberlo todo y corregir al niño con superioridad |
| Mismo contorno, toon y escala que la niña | Detalles finos (dedos, cordones, logotipos, mechones sueltos) |
| Gustos variados: bichos, pintar, música | Encasillarlo en «cosas de chicos» (solo fuerza, coches, fútbol) |
| Una pose cada vez, corta y clara | Gesticular sin parar mientras el niño piensa |
