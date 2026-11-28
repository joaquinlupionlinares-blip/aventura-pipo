// Prepara app/src/main/assets (juego + voz + fuentes) y los iconos a partir del HTML del juego.
const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const SRC=path.resolve(__dirname,'..','pipo4.html'),A=path.join(__dirname,'app/src/main/assets'),RES=path.join(__dirname,'app/src/main/res');
fs.mkdirSync(path.join(A,'fonts'),{recursive:true});
(async()=>{
  let h=fs.readFileSync(SRC,'utf8');
  // 1) fuentes locales (latin + latin-ext) en lugar de Google Fonts
  const FONTS='https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Baloo+2:wght@600;800&display=swap';
  const css=await (await fetch(FONTS,{headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'}})).text();
  const blocks=[...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)].filter(m=>m[1]==='latin'||m[1]==='latin-ext');
  let local='',i=0;
  for(const[,sub,face]of blocks){const url=/url\((https:[^)]+)\)/.exec(face)[1];const fam=/font-family:\s*'([^']+)'/.exec(face)[1].replace(/\s+/g,'');const w=/font-weight:\s*(\d+)/.exec(face)[1];
    const f=`fonts/${fam}-${w}-${sub}.woff2`;fs.writeFileSync(path.join(A,f),Buffer.from(await (await fetch(url)).arrayBuffer()));i++;local+=face.replace(url,f)+'\n'}
  if(!i)throw new Error('No se encontraron fuentes en la CSS de Google');
  const links=/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/;
  if(!links.test(h))throw new Error('No encuentro los <link> de Google Fonts');
  h=h.replace(links,()=>`<style>\n${local}</style>`);
  // 2) puente de voz, antes del script del juego
  const shim=fs.readFileSync(path.join(__dirname,'android-shim.js'),'utf8');
  if(h.split('<script>').length!==2)throw new Error('Esperaba un solo <script>');
  h=h.replace('<script>',()=>`<script>\n${shim}</script>\n<script>`);
  fs.writeFileSync(path.join(A,'index.html'),h);
  console.log('assets: index.html',(h.length/1024).toFixed(0)+'KB ·',i,'fuentes');
  // 3) iconos desde el dibujo de Pipo del propio juego
  const b=await chromium.launch(),p=await b.newPage();
  await p.goto('file:///'+SRC.replace(/\\/g,'/'));await p.waitForSelector('#startPipo svg');
  const svg=await p.$eval('#startPipo',e=>e.innerHTML);
  const page=(bg,shape,scale)=>`<html><body style="margin:0;background:transparent"><div id="i" style="width:100vw;height:100vh;display:grid;place-items:center;${bg?`background:${bg};`:''}${shape}">
    <div style="width:${scale}%;height:${scale}%">${svg.replace('<svg ','<svg width="100%" height="100%" ')}</div></div></body></html>`;
  const D={mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4};
  async function render(file,size,html){await p.setViewportSize({width:size,height:size});await p.setContent(html);await p.screenshot({path:file,omitBackground:true})}
  for(const[k,f]of Object.entries(D)){const dir=path.join(RES,'mipmap-'+k);fs.mkdirSync(dir,{recursive:true});
    await render(path.join(dir,'ic_launcher.png'),Math.round(48*f),page('#CDEBFF','border-radius:22%;',82));
    await render(path.join(dir,'ic_launcher_round.png'),Math.round(48*f),page('#CDEBFF','border-radius:50%;',78));
    await render(path.join(dir,'ic_launcher_foreground.png'),Math.round(108*f),page('','',58))}
  await b.close();
  const any=path.join(RES,'mipmap-anydpi-v26');fs.mkdirSync(any,{recursive:true});fs.mkdirSync(path.join(RES,'values'),{recursive:true});
  const adaptive='<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  fs.writeFileSync(path.join(any,'ic_launcher.xml'),adaptive);fs.writeFileSync(path.join(any,'ic_launcher_round.xml'),adaptive);
  fs.writeFileSync(path.join(RES,'values','colors.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#CDEBFF</color>\n</resources>\n');
  console.log('iconos: 5 densidades + icono adaptativo');
})().catch(e=>{console.error('ERROR',e.message);process.exit(1)});
