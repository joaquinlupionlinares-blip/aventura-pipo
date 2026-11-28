# La voz de Pipo

## Qué había
La voz del sistema: `speechSynthesis` en el navegador y el TextToSpeech de Android en la app, con el tono subido a 1,2. Suena distinta en cada aparato y, en la tablet, depende de la voz de Samsung o Google que tenga instalada.

## Opciones evaluadas

| Opción | Naturalidad | Sin internet | Coste | Uso comercial | Veredicto |
|---|---|---|---|---|---|
| Voz del sistema (Samsung/Google) | Variable según el aparato | Sí | 0 € | Depende del fabricante | Se queda como respaldo y para el inglés |
| **Piper · davefx (hombre)** | Neuronal | Sí | 0 € | **CC0** (sin condiciones) | Candidata |
| **Piper · sharvard (mujer)** | Neuronal | Sí | 0 € | **CC BY 3.0** (citar la fuente) | Candidata |
| **Piper · sharvard (hombre)** | Neuronal | Sí | 0 € | **CC BY 3.0** (citar la fuente) | Candidata |
| Piper · miro (alta calidad) | Neuronal | Sí | 0 € | **CC BY-NC-SA: no comercial** | Descartada por la licencia |
| Piper · carlfm, MLS | Neuronal, calidad baja | Sí | 0 € | Dominio público / CC BY | No se ha muestreado: calidad «x_low»/«low» |
| Voces en la nube (Azure, Google, ElevenLabs…) | Muy alta | No | Pago por uso o pruebas temporales | Según contrato | Descartadas: cuotas, datos fuera del aparato |

## Muestras comparables
Carpeta [`voz/muestras/`](../voz/muestras/): abre `index.html` para escucharlas.

- Mismo texto en las tres voces: saludo con nombre («¡Hola, Juanma! ¿Seguimos nuestra aventura?»), instrucción, pista y celebración.
- Mismos ajustes: velocidad algo más pausada (`length_scale 1.08`) y 0,35 s de pausa entre frases.
- Generadas en este ordenador con Piper 2023.11.14-2 (`node voz/muestras.js`).

**Límite importante:** quien preparó las muestras no puede escuchar audio. La elección de voz, el ritmo y las pausas tienen que decidirse escuchándolas. No se afirma que ninguna sea «la buena» hasta que alguien la escuche.

## Cómo llega la voz elegida al juego (sin cuotas y sin internet)
En la tablet se instala un **motor de voz** gratuito y de código abierto (sherpa-onnx, licencia Apache 2.0) que lleva dentro la voz Piper elegida. La app de Juanma lo detecta sola:

- **Español** → la voz natural (el motor `com.k2fsa.sherpa.onnx.tts.engine`).
- **Inglés** (palabras en inglés y canciones) → la voz del sistema, porque la voz española no sabe inglés.
- Si el motor no está instalado, todo sigue funcionando con la voz del sistema.

Así cualquier frase, incluido el nombre del niño, se dice completa con la misma voz. No hay empalmes de audios grabados con voces distintas.

### Instalar el motor en la tablet
Los motores descargados están en `aventura-juanma-herramientas/motor-tablet/` (uno por voz; solo se puede tener uno instalado):

- `…es_ES-davefx-medium.apk` (83 MB)
- `…es_ES-sharvard-medium.apk` (96 MB; tiene voz de hombre y de mujer)

1. Copia a la tablet el de la voz elegida e instálalo como Juanma.apk.
2. Ábrelo una vez («TTS Engine: Next-gen Kaldi») y prueba la voz. En la versión sharvard hay dos hablantes (0 = hombre, 1 = mujer). No he podido comprobar si la app del motor deja elegir el hablante; si no lo permite, la voz de mujer no se podrá usar así y conviene elegir davefx.
3. Abre el juego: en **Para mayores → Sonido** debe poner «Voz natural de Pipo instalada».

No hace falta cambiar el motor de voz por defecto de la tablet.

### Por qué no audios pregrabados
Se valoró guardar las frases como archivos de audio. Pero el juego dice muchas frases que cambian: números, palabras de cada actividad, el nombre… Haría falta grabar miles de combinaciones o empalmar trozos de voces distintas. El motor en la tablet da la misma voz natural para todo, sin conexión y gratis.

## Pronunciación del nombre
En **Para mayores → Perfiles → Editar → «Cómo se pronuncia»** se escribe el nombre tal como debe sonar (por ejemplo «Juanmá»). El juego muestra el nombre real y dice la versión escrita para la voz. Con «Escuchar el saludo» se comprueba al momento.

## Atribución
Si se publica el juego usando una voz sharvard, hay que citar: «Voz basada en el corpus Sharvard (Universidad de Edimburgo), CC BY 3.0». La voz davefx (CC0) no lo exige.
