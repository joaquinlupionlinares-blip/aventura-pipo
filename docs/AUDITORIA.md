# Auditoría previa al rediseño (versión 12, noviembre de 2026)

Juego auditado: `index.html` de la versión publicada «La Aventura de Juanma» (commit `128b39e`), más el envoltorio Android de `android/`.
Medido con Playwright a 390 px (móvil) y revisado leyendo el código.

## Cómo estaba hecho

| Aspecto | Situación |
|---|---|
| Tecnología | Un solo HTML con CSS y JavaScript sin librerías. En Android, un WebView que carga ese HTML. |
| Navegación | Entrada (escribir nombre, chico/chica) → mundos → asignatura (lista de todos los niveles) → nivel → panel de victoria. |
| Contenido | 6 asignaturas, 21 temas, 62 niveles. 21 amigos para pintar (uno cada 3 niveles con 3 estrellas). |
| Guardado | `localStorage`: `pipo-aventura-v2` (progreso, colores), `pipo-brush-v1` (pincel). Un único perfil. |
| Voz | Voz del sistema (navegador o TextToSpeech de Android) con el tono subido a 1,2 por defecto. Las palabras inglesas, con la voz inglesa. |
| Nombre | Se dice tal como se escribe; no hay forma de corregir la pronunciación. |

## Problemas encontrados, por prioridad

### Alta · el niño no sabe qué hacer sin ayuda
1. **Para empezar hay que escribir el nombre y elegir chico/chica.** Un niño de 5 años no lee ni escribe con soltura.
2. **Demasiados pasos para jugar:** mundo → asignatura → elegir entre una lista larga (19 niveles en Lengua, 5 temas) → nivel.
3. **No hay botón de ayuda.** Al fallar, Pipo dice una broma («Mi abuela dice que a la tercera va la vencida») que no ayuda con el ejercicio. Solo en contar había un «truco» al segundo fallo.
4. **No hay «siguiente aventura».** Al terminar un nivel, el panel no explica qué se ha conseguido ni ofrece una salida para dejar de jugar.

### Alta · voz y textos
5. **Voz de adulto imitando a un niño:** el tono se subía a 1,2 («más gracioso»). La calidad depende del dispositivo.
6. **Frases largas:** el bocadillo llegaba a 30 palabras («¡Bienvenido a Lengua, Thiago! ¿Cuál te apetece? Recuerda: …»).
7. **El nombre se repetía en casi cada frase** (hasta un 40 % de las preguntas empezaban con él).
8. **Elogios vacíos en el 65 % de los aciertos** («¡Me tiro un pedete de alegría!»), sin relación con lo que se ha hecho.

### Media · manejo y accesibilidad
9. **Botones pequeños y solo con icono:** inicio, volver, repetir y ajustes de 52 × 52 px. Colores de Pintar de 53 × 53 px. Modos de Pintar de 45 px de alto.
10. **Aciertos y fallos solo por color** (verde / atenuado).
11. **Pintar sin «deshacer».**
12. **Un solo perfil:** si juegan dos hermanos, comparten progreso.
13. **Área de mayores mínima:** voz, velocidad, tono y borrar. Sin progreso por asignatura ni registro de ayudas.
14. **Animaciones constantes** (Pipo de la portada botando sin parar).

### Baja
15. Pipo no tenía brazos ni expresiones: no podía señalar ni celebrar.
16. El juego dentro de la app no tenía forma de guardar los dibujos fuera del juego.

## Qué se ha resuelto
Ver la tabla «Cambios aplicados» del [README](../README.md). Los puntos 1-16 se han abordado todos; los límites que quedan están en «Pendientes».
