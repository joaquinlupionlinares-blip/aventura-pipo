# La Aventura de Juanma

Juego educativo para niños de 5 a 7 años: Lengua, Mates, Medio, Inglés, Artística y Música, con Pipo como guía y amigos para pintar. Funciona sin internet y guarda todo en el propio dispositivo.

- `index.html`: el juego completo (un solo archivo, sin librerías).
- `android/`: la app para Android (un WebView que carga el juego y conecta la voz del dispositivo).
- `tests/`: pruebas del recorrido infantil y de los datos.
- `voz/`: muestras de voz para elegir la de Pipo.
- `docs/`: auditoría, voz, guiones, prueba con familias, personaje y capturas.

## Abrir el juego
- En el ordenador: doble clic en `index.html`.
- En la tablet: instalar `Juanma.apk` (ver más abajo).

## La primera vez (un adulto)
1. Pulsar **Preparar perfil** y resolver la suma.
2. Escribir el nombre, cómo se pronuncia si la voz lo dice mal, chico o chica, y elegir un avatar.
3. Guardar. A partir de ahí el niño solo toca su avatar y **¡Jugar!**.

Si ya había progreso de antes, se convierte solo en el perfil del niño: estrellas, amigos y dibujos se conservan.

## Cambios aplicados (rediseño 5-7 años)

| Antes | Ahora |
|---|---|
| Escribir el nombre para empezar | Perfiles con avatar que prepara un adulto; el niño toca su avatar y «¡Jugar!» |
| Mundo → asignatura → lista de niveles | El inicio propone **la siguiente aventura** en un botón grande; cada tema tiene su «Jugar» y los niveles quedan como opción |
| Fallo = broma | 1.er fallo: pista de la actividad y se quita una opción. 2.º: ejemplo guiado (cuenta con el niño y señala). Se distingue lo hecho con ayuda |
| Sin ayuda | **Bombilla «Pista»** fija en la partida; si no toca nada, la bombilla se ilumina y después Pipo ofrece ayuda una sola vez (tiempo configurable) |
| Panel final con estrellas | Dice qué ha conseguido, las estrellas con texto, el avance hacia el próximo amigo, «Siguiente aventura» destacada y «Terminar por hoy» |
| Sin forma de parar | «Terminar por hoy» en inicio y al terminar; despedida amable; sugerencia de descanso tras N aventuras |
| Pipo estático | Pipo explorador (mochila, tirantes, pañuelo) con 7 estados y boca sincronizada con la voz (`docs/personaje/`) |
| Voz con tono subido, nombre tal cual | Tono natural, pronunciación del nombre configurable, una sola voz a la vez, la música baja mientras habla; voz natural Piper preparada para la tablet |
| Botones de 52 px solo con icono | Botones de 64 px o más con palabra («Inicio», «Repetir», «Pista»); ✓/✗ además del color |
| Pintar sin deshacer | **Deshacer**, paleta más grande, guardado automático, dibujos exportables desde el área de mayores |
| Ajustes mínimos | **Área de mayores** tras una suma: perfiles, sonido, ayuda y calma (movimiento reducido), progreso por asignatura, actividades con ayuda usada, dibujos y borrado de datos |

Detalle del diagnóstico: [docs/AUDITORIA.md](docs/AUDITORIA.md). Voz: [docs/VOZ.md](docs/VOZ.md). Guiones: [docs/GUIONES.md](docs/GUIONES.md).

## Comprobaciones
```
node tests/recorrido.test.js     # 45 comprobaciones: recorrido completo, ayuda, atasco, datos antiguos, pantallas pequeñas…
node android/test-apk.js         # 13 comprobaciones del juego dentro de la app (voz por el puente, Atrás, sin internet)
```
Requieren Playwright (variable `PLAYWRIGHT` con la ruta del paquete si no está en la ruta por defecto de este ordenador).

## Compilar la app (en este ordenador)
```
cd android
node prep.js                     # copia el juego, las fuentes y genera los iconos
gradle assembleDebug --offline   # con JAVA_HOME = Java de Android Studio
```
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Se firma con la clave de depuración de este ordenador (`~/.android/debug.keystore`): **guarda una copia de ese archivo**, porque sin ella las versiones nuevas no se pueden instalar encima sin perder el progreso.

## Pendientes y límites
- **Elegir la voz escuchando las muestras** (`voz/muestras/index.html`) e instalar su motor en la tablet. Nadie la ha escuchado todavía.
- **Probar en la tablet real**: la app solo se ha probado imitando el entorno Android.
- **Prueba con familias** sin hacer: plan en [docs/PRUEBA-FAMILIAS.md](docs/PRUEBA-FAMILIAS.md). La autonomía no se puede dar por conseguida hasta entonces.
- El personaje está dibujado en SVG a mano; no había herramientas de generación de imágenes.
- En Pintar, a 390 px de alto, la última fila de colores queda bajo el borde (en la tablet se ve entera).
- Las pistas concretas existen en varias actividades (vocales, sílabas, inglés, contar); el resto usa una pista general según el tipo de actividad.
- Los niveles de caligrafía, música y piano tienen su propia ayuda, pero no el ejemplo guiado paso a paso.
