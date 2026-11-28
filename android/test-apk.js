// Prueba el index.html del APK imitando el WebView de Android: sin speechSynthesis y con un AndroidTTS falso.
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT||'C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const URL='file:///'+path.join(__dirname,'app/src/main/assets/index.html').replace(/\\/g,'/');
const res=[],errs=[];const ok=(c,m)=>res.push((c?'PASA ':'FALLA')+' · '+m);
(async()=>{const b=await chromium.launch(),c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await c.route(/^https?:/,r=>{errs.push('petición a internet: '+r.request().url());r.abort()}); // la app no debe necesitar internet
 await c.addInitScript(()=>{try{delete window.speechSynthesis}catch(e){}Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});
   window.__said=[];window.AndroidTTS={speak:(id,t,lang,r,p)=>{window.__said.push({t,lang,r,p});setTimeout(()=>window.__ttsEvent(id,'end'),30)},stop:()=>{},ready:()=>true,engineInfo:()=>'Voz natural de Pipo instalada (prueba)',saveImage:(u,n)=>{window.__saved=n;return true}};
   if(!localStorage.getItem('pipo-perfiles-v1'))localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'Lu',say:'',av:'pipo',g:'a'}],cur:'p1'}));
   setTimeout(()=>window.__ttsReady&&window.__ttsReady(),50)});
 const p=await c.newPage();p.on('pageerror',e=>errs.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
 await p.goto(URL);await p.waitForTimeout(400);
 ok(await p.evaluate(()=>window.speechSynthesis&&window.speechSynthesis.getVoices().length===2),'El puente sustituye a speechSynthesis (2 voces: es/en)');
 await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');await p.waitForTimeout(600);
 const s1=await p.evaluate(()=>window.__said.slice());ok(s1.some(x=>x.lang==='es-ES'&&/Pipo/.test(x.t)),'Pipo habla en español por la voz del móvil: «'+((s1[0]||{}).t||'').slice(0,40)+'…»');
 ok(await p.evaluate(()=>document.fonts.check('800 20px "Baloo 2"')&&document.fonts.check('700 20px Andika')),'Las letras del juego cargan desde dentro de la app');
 // Inglés: nivel 1 de Colors
 await p.click('.wcard[data-w="3"]');await p.waitForSelector('#levels:not([hidden])');await p.click('#lvls .lvl[data-t="0"][data-l="0"]');
 await p.waitForSelector('#game:not([hidden])');await p.waitForTimeout(1500);
 const s2=await p.evaluate(()=>window.__said.slice());ok(s2.some(x=>x.lang==='en-US'&&/red|blue|yellow|green|orange/.test(x.t)),'Las palabras en inglés usan la voz inglesa: «'+((s2.find(x=>x.lang==='en-US')||{}).t||'')+'»');
 // Atrás de Android
 ok(await p.evaluate(()=>window.__back())===true&&await p.$eval('#levels',e=>!e.hidden),'Atrás en una partida vuelve a los niveles');
 ok(await p.evaluate(()=>window.__back())===true&&await p.$eval('#home',e=>!e.hidden),'Atrás en los niveles vuelve al inicio');
 await p.click('#gear');ok(await p.evaluate(()=>window.__back())===true&&await p.$eval('#gate',e=>e.hidden),'Atrás cierra el filtro para mayores');
 ok(await p.evaluate(()=>window.__back())===false,'Atrás en el inicio deja salir de la app');
 await p.click('#gear');{const q=await p.textContent('#gateQ');const[a,b2]=q.match(/\d+/g).map(Number);await p.fill('#gateIn',String(a+b2));await p.click('#gateForm button[type=submit]')}
 await p.waitForSelector('#adult:not([hidden])');ok(/Voz natural de Pipo instalada/.test(await p.textContent('#cVoiceNote')),'Mayores: indica qué voz usa la tablet');
 ok(await p.evaluate(()=>window.__back())===true&&await p.$eval('#start',e=>!e.hidden),'Atrás en mayores vuelve a la entrada');await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');
 // Música: el piano dice las palabras en inglés
 await p.click('.wcard[data-w="5"]');await p.waitForSelector('#levels:not([hidden])');await p.click('#lvls .lvl[data-t="0"][data-l="0"]');await p.waitForSelector('#pad .pkey.glow');
 const before=await p.evaluate(()=>window.__said.length);for(let i=0;i<3;i++){await p.dispatchEvent('#pad .pkey.glow','pointerdown');await p.waitForTimeout(150)}
 const words=await p.evaluate(n=>window.__said.slice(n).filter(x=>x.lang==='en-US').map(x=>x.t),before);ok(words.includes('Twinkle'),'Piano: al tocar suena la palabra en inglés ('+words.join(', ')+')');
 const fit=await p.evaluate(()=>{const k=document.querySelector('#pad .keys8').getBoundingClientRect(),s=document.querySelector('#game').getBoundingClientRect();return k.right<=s.right+0.5&&k.left>=s.left-0.5});
 ok(fit,'El piano cabe entero en la pantalla (390 px)');
 await p.screenshot({path:path.join(__dirname,'apk-musica.png')});
 // Instrumentos: el piano grande también cabe
 await p.evaluate(()=>window.__back());await p.waitForSelector('#levels:not([hidden])');await p.click('#lvls .lvl.paintlink');await p.waitForSelector('#instr:not([hidden]) .keys8');
 ok(await p.evaluate(()=>{const k=document.querySelector('#iarea .keys8').getBoundingClientRect();return k.right<=innerWidth-15.5}),'Instrumentos: el piano grande cabe con su margen');
 await b.close();console.log(res.join('\n'));console.log('\nErrores / peticiones a internet:',errs.length?'\n'+errs.join('\n'):'ninguno');
 process.exit(res.some(r=>r.startsWith('FALLA'))||errs.length?1:0)})().catch(e=>{console.log(res.join('\n'));console.log('ERROR DEL TEST:',e.message.split('\n')[0]);console.log('errores:',errs);process.exit(2)});
