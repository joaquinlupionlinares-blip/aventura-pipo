// Capturas de las pantallas principales (tableta vertical/horizontal y móvil). Uso: node docs/capturas.js
const path=require('path'),fs=require('fs');
const PW=process.env.PLAYWRIGHT||'C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright';
const {chromium}=require(PW);
const URL='file:///'+path.resolve(__dirname,'..','index.html').replace(/\\/g,'/');
const OUT=path.join(__dirname,'capturas');fs.mkdirSync(OUT,{recursive:true});
const SAVE={list:[{id:'p1',name:'Juanma',say:'',av:'pipo',g:'o'}],cur:'p1'};
const DATOS={stars:{v0:3,v1:2,n0:3,ic0:2},name:'Juanma',g:'o',colors:{pipo:{0:'#3CCF91',4:'#FF9F43',5:'#FFD93D'}},unl:['bigotes'],prog:2,
  log:[{k:'v0',si:0,ti:0,li:0,st:3,err:0,h:0,n:5,d:Date.now()-86400000},{k:'v1',si:0,ti:0,li:1,st:2,err:2,h:1,n:5,d:Date.now()-3600000}]};
const SIZES=[['tableta-vertical',800,1280],['tableta-horizontal',1280,800],['movil',390,844]];
(async()=>{const b=await chromium.launch();
 for(const[tag,w,h]of SIZES){const c=await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true});
  await c.addInitScript(o=>{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});
    if(!localStorage.getItem('pipo-perfiles-v1')){localStorage.setItem('pipo-perfiles-v1',JSON.stringify(o.p));localStorage.setItem('pipo-aventura-v2',JSON.stringify(o.s))}},{p:SAVE,s:DATOS});
  const p=await c.newPage();const s=async n=>{await p.waitForTimeout(450);await p.screenshot({path:path.join(OUT,`${tag}-${n}.png`)})};
  await p.goto(URL);await s('1-entrada');await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');await s('2-inicio');
  await p.click('#nextBtn');await p.waitForSelector('#game:not([hidden])');await s('3-actividad');
  await p.click('#gHelp');await p.waitForTimeout(300);await p.click('#gHelp');await s('4-ayuda');
  await p.click('#gBack');await s('5-asignatura');await p.click('#levels [data-go="home"]');
  await p.click('.wcard.paint');await s('6-pintar');await p.click('#paint [data-go="home"]');
  await p.click('#byeBtn');await s('7-despedida');await c.close()}
 await b.close();console.log('capturas en docs/capturas/')})();
