// Genera las muestras de voz comparables (mismo texto, mismos ajustes) con Piper en este ordenador.
// Uso: node voz/muestras.js   (necesita ..\aventura-juanma-herramientas con piper y las voces)
const {execFileSync}=require('child_process'),fs=require('fs'),path=require('path');
const H=path.resolve(__dirname,'..','..','aventura-juanma-herramientas');
const PIPER=path.join(H,'piper','piper.exe'),OUT=path.join(__dirname,'muestras');
fs.mkdirSync(OUT,{recursive:true});
// Mismo texto para todas: saludo con nombre, instrucción, pista y celebración.
const FRASES=[
  ['saludo','¡Hola, Juanma! ¿Seguimos nuestra aventura?'],
  ['instruccion','Toca el grupo que tiene tres manzanas.'],
  ['pista','Vamos a contarlas juntos: una, dos y tres.'],
  ['celebracion','¡Muy bien! Has encontrado todas las vocales.'],
];
const VOCES=[
  {id:'davefx',nombre:'davefx (hombre)',modelo:'es_ES-davefx-medium.onnx',licencia:'CC0 (dominio público)'},
  {id:'sharvard-mujer',nombre:'sharvard (mujer)',modelo:'es_ES-sharvard-medium.onnx',speaker:1,licencia:'CC BY 3.0 (citar la fuente)'},
  {id:'sharvard-hombre',nombre:'sharvard (hombre)',modelo:'es_ES-sharvard-medium.onnx',speaker:0,licencia:'CC BY 3.0 (citar la fuente)'},
];
// Ajustes iguales para todas: un poco más pausado que el estándar y pausa clara entre frases.
const AJUSTES=['--length_scale','1.08','--sentence_silence','0.35'];
const res=[];
for(const v of VOCES)for(const[id,txt]of FRASES){
  const f=`${v.id}-${id}.wav`,args=['-m',path.join(H,'voces',v.modelo),'-f',path.join(OUT,f),...AJUSTES];
  if(v.speaker!=null)args.push('-s',String(v.speaker));
  const t0=Date.now();execFileSync(PIPER,args,{input:Buffer.from(txt,'utf8'),stdio:['pipe','ignore','ignore']});
  const bytes=fs.statSync(path.join(OUT,f)).size,seg=(bytes-44)/(22050*2);
  res.push({voz:v.id,frase:id,f,seg:+seg.toFixed(2),ms:Date.now()-t0});
}
fs.writeFileSync(path.join(OUT,'muestras.json'),JSON.stringify({FRASES,VOCES,AJUSTES,res},null,1));
// Página para escuchar y comparar
const fila=v=>`<tr><th>${v.nombre}<small>${v.licencia}</small></th>${FRASES.map(([id])=>`<td><audio controls preload="none" src="${v.id}-${id}.wav"></audio></td>`).join('')}</tr>`;
fs.writeFileSync(path.join(OUT,'index.html'),`<!doctype html><meta charset="utf-8"><title>Voces de Pipo · muestras</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui,sans-serif;margin:0;padding:16px;background:#CDEBFF;color:#22306B}h1{margin:0 0 4px}p{max-width:70ch}
.t{overflow-x:auto;background:#fff;border:3px solid #22306B;border-radius:16px;padding:8px}table{border-collapse:collapse}th,td{padding:8px;text-align:left;vertical-align:top}
thead th{font-size:14px}tbody th small{display:block;font-weight:400;font-size:12px;color:#6875A8}audio{width:210px}</style>
<h1>Voces para Pipo</h1>
<p>Mismo texto y mismos ajustes en las tres voces (Piper, sin internet, sin cuotas). Escucha cada columna y elige la que suene más cálida, clara y natural para un niño de 5 a 7 años.</p>
<div class="t"><table><thead><tr><th>Voz</th>${FRASES.map(([,t])=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${VOCES.map(fila).join('')}</tbody></table></div>
<p>Ajustes: velocidad ×1/1.08 (algo más pausada) y 0,35 s de pausa entre frases. Generado con Piper 2023.11.14-2 en este ordenador.</p>`);
console.table(res);
