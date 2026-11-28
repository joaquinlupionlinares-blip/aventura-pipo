// Genera la hoja de estados de Pipo (docs/personaje/pipo-estados.png) a partir del dibujo real del juego.
// Uso: node docs/personaje/estados.js
const path=require('path');
const PW=process.env.PLAYWRIGHT||'C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright';
const {chromium}=require(PW);
const URL='file:///'+path.resolve(__dirname,'..','..','index.html').replace(/\\/g,'/');
const ESTADOS=[['saludo','Saludo'],['espera','Espera tranquila'],['habla','Habla (boca animada)'],['explica','Explica / señala'],['animo','Ánimo ante una dificultad'],['celebra','Celebración breve'],['despedida','Despedida']];
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:1500,height:560}});
  await p.goto(URL);await p.waitForSelector('#startPipo svg');const svg=await p.$eval('#startPipo',e=>e.innerHTML);
  const css=await p.evaluate(()=>[...document.styleSheets].flatMap(s=>{try{return[...s.cssRules].map(r=>r.cssText)}catch(e){return[]}}).filter(t=>/\.pipo|pp-/.test(t)).join('\n'));
  const cards=ESTADOS.map(([s,t])=>`<figure><div class="w">${svg.replace(/data-s="[a-z]+"/,`data-s="${s==='habla'?'espera':s}"`).replace(/data-talk="\d"/,`data-talk="${s==='habla'?1:0}"`)}</div><figcaption>${t}</figcaption></figure>`).join('');
  await p.setContent(`<style>${css}
    *{animation-play-state:paused!important}body{margin:0;background:#CDEBFF;font:600 18px system-ui,sans-serif;color:#22306B;padding:20px}
    h1{margin:0 0 4px;font-size:26px}p{margin:0 0 16px}.row{display:flex;gap:14px}figure{margin:0;width:190px;background:#fff;border:3px solid #22306B;border-radius:18px;padding:10px;text-align:center}
    .w{width:170px;height:170px}figcaption{margin-top:6px;font-size:15px}.small{display:flex;gap:18px;align-items:flex-end;margin-top:18px}.small div{background:#fff;border:3px solid #22306B;border-radius:12px;padding:6px}</style>
    <h1>Pipo · estados del guía</h1><p>Mismo dibujo en todas las pantallas (monstruo azul explorador con mochila, tirantes y pañuelo). Hablar es una capa que se suma a cualquier estado.</p>
    <div class="row">${cards}</div>
    <div class="small"><span>A tamaño real en el juego:</span><div style="width:64px;height:64px">${svg}</div><div style="width:44px;height:44px">${svg}</div><div style="width:32px;height:32px">${svg}</div></div>`);
  await p.waitForTimeout(500);await p.screenshot({path:path.join(__dirname,'pipo-estados.png'),fullPage:true});await b.close();console.log('docs/personaje/pipo-estados.png')})();
