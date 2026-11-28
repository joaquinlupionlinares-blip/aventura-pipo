# Guiones de Pipo

Pipo no conversa con IA: dice frases preparadas cuando pasa algo concreto en el juego. Todas las frases de guía están juntas en el objeto `LINES` de `index.html` («guiones de Pipo»), para revisarlas o cambiarlas en un solo sitio. Las frases propias de cada actividad (instrucción y frase al acertar) están en cada generador de actividad (`say`, `done`, `hint`).

## Reglas
- El nombre, con moderación: al saludar, al despedirse y en la pronunciación de prueba. Ya no en cada pregunta.
- Al acertar se reconoce lo concreto («¡La a! ¡De abeja!»). Elogio extra solo con tres seguidas o en el 15 % de los aciertos.
- Al fallar no hay reproches ni sonidos desagradables: una pista relacionada y, si vuelve a fallar, un ejemplo guiado.
- Pipo no finge tristeza cuando el niño se va ni le pide que siga.
- Una sola voz a la vez: cada frase nueva corta la anterior, y cambiar de pantalla corta lo que estuviera diciendo.

## Frases por evento

| Evento | Estado de Pipo | Frase (de `LINES`) |
|---|---|---|
| Primera vez que juega | Saludo | «¡Hola, {nombre}! Soy Pipo. Toca el botón grande y empezamos nuestra aventura.» |
| Vuelve otro día | Saludo | «¡Hola, {nombre}! ¿Seguimos nuestra aventura?» / «¡Hola otra vez, {nombre}! ¿Vamos a por la siguiente aventura?» |
| Inicio | Espera | «Toca el botón grande para seguir, o elige otra cosa.» (en el bocadillo) |
| Entra en una asignatura | Espera | «{Asignatura}. Toca «Jugar» en la aventura que quieras.» |
| Nivel cerrado | Espera | «Esa todavía está cerrada. Juega primero la de antes.» |
| 1.er fallo o 1.ª pista | Ánimo | «Esa no es. / Casi. / Uy, esa no.» + pista de la actividad (por ejemplo «Toca los dibujos para contarlos uno a uno.», «Escucha otra vez con atención.», «Dilo despacito conmigo: «ma».») y se quita una opción incorrecta |
| 2.º fallo o 2.ª pista | Explica (señala) | Si hay dibujos que contar: «Vamos a contarlos juntos.» + «uno, dos, tres…». Después: «Mira, es esta. Tócala.» o «Ahora toca «MA».» |
| Parece atascado (configurable, 15 s por defecto) | — | Primero solo se ilumina la bombilla. Al doble de tiempo, una única vez: «Si quieres, toca la bombilla y te ayudo.» |
| Acierta tras el ejemplo guiado | Celebra | «¡Lo hemos conseguido juntos!» / «¡Bien! La próxima la sacas tú solo/sola.» |
| Pipo se equivoca (contar, 3.ª pregunta) | — | «Pipo ha contado 5… ¿Seguro? ¡Ayúdame a contar!» → «¡Tenías razón! Son cuatro. ¡Gracias por ayudarme!» |
| Termina con 3 estrellas | Celebra | «¡Tres estrellas! Has terminado «{nivel}».» |
| Termina con 2 estrellas | Celebra | «¡Dos estrellas! «{nivel}» superada. Si la repites y sacas tres, sumas para un amigo nuevo.» |
| Termina con 1 estrella | Ánimo | «Una estrella. La intentamos otra vez, con calma. ¡Tú puedes!» |
| Amigo nuevo | — | Se presenta el amigo con su frase («¡Sorpresa! Has descubierto a Bigotes…») |
| Lleva N aventuras seguidas (configurable, 4 por defecto) | — | «Llevamos un buen rato jugando. Si quieres, podemos descansar.» (una vez por sesión) |
| Terminar por hoy | Despedida | «¡Hasta pronto, {nombre}! Hoy has completado 3 aventuras. Lo guardo todo para la próxima vez.» |

## Organización del audio
- No hay archivos de audio del juego: la voz se genera en el dispositivo (ver [VOZ.md](VOZ.md)).
- Las muestras para elegir voz están en `voz/muestras/` (WAV, 22 kHz) con su página de escucha.
- Música y efectos: sintetizados en el propio juego (Web Audio). Se atenúan al 35 % mientras Pipo habla.
- Volumen de voz, música y velocidad: en **Para mayores → Sonido**. Se puede apagar la voz; los bocadillos siguen guiando.
