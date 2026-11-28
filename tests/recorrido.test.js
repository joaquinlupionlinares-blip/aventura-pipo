// Pruebas del recorrido infantil y de los datos. Uso: node tests/recorrido.test.js
// Necesita Playwright (PLAYWRIGHT=ruta del paquete, o el de la caché de npx de este ordenador).
const path=require('path'),fs=require('fs');
const PW=process.env.PLAYWRIGHT||'C:/Users/GAMER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright';
const {chromium}=require(PW);
const URL='file:///'+path.resolve(__dirname,'..','index.html').replace(/\\/g,'/');
const OUT=path.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
const res=[],errs=[];const ok=(c,m)=>{res.push((c?'PASA ':'FALLA')+' · '+m);return c};
const MOB={viewport:{width:390,height:844},isMobile:true,hasTouch:true};

/* voz simulada: registra lo que se dice y cuántas frases suenan a la vez */
const fakeVoice=()=>{const log=[];let active=0,max=0;
  class U{constructor(t){this.text=t;this.lang='';this.voice=null;this.rate=1;this.pitch=1;this.volume=1;this.onend=null;this.onerror=null}}
  const ss={speaking:false,pending:false,q:[],getVoices:()=>[{name:'Voz de prueba',lang:'es-ES'},{name:'Test voice',lang:'en-US'}],
    addEventListener(){},removeEventListener(){},
    speak(u){log.push(u.text);active++;max=Math.max(max,active);this.speaking=true;u._t=setTimeout(()=>{u._t=0;active--;this.speaking=active>0;u.onend&&u.onend({})},15);this.q.push(u)},
    cancel(){for(const u of this.q)if(u._t){clearTimeout(u._t);u._t=0;active--;u.onend&&u.onend({})}this.q=[];active=0;this.speaking=false;window.__cancels=(window.__cancels||0)+1}};
  Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true});window.SpeechSynthesisUtterance=U;
  window.__said=log;window.__maxVoces=()=>max};
async function page(b,opts,init){const c=await b.newContext(opts||MOB);if(init!==false)await c.addInitScript(fakeVoice);if(init&&init!==true)await c.addInitScript(init.fn,init.arg);
  const p=await c.newPage();p.on('pageerror',e=>errs.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts\.g/.test(m.text()))errs.push('console: '+m.text())});return{c,p}}
const said=p=>p.evaluate(()=>window.__said.slice());
const LS=(p,k)=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),k);
const overflow=p=>p.evaluate(()=>{const w=innerWidth;return[...document.querySelectorAll('.screen:not([hidden]),.overlay:not([hidden]) .panel')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.id||e.className).concat(document.documentElement.scrollWidth>w+1?['documento']:[])});
async function shot(p,n){await p.waitForTimeout(250);await p.screenshot({path:path.join(OUT,n+'.png')})}
async function gate(p){const q=await p.textContent('#gateQ');const[a,b]=q.match(/\d+/g).map(Number);await p.fill('#gateIn',String(a+b));await p.click('#gateForm button[type=submit]')}
/* responde una pregunta de «Conoce las vocales»: la opción correcta es la letra grande */
async function vocal(p,bien){await p.waitForSelector('#stage .hero-letter');const L=await p.$eval('#stage .hero-letter .lt',e=>e.textContent.trim()[0]);
  for(const o of await p.$$('#pad .opt:not([disabled])'))if(((await o.textContent()).trim()[0]===L)===bien){await o.click();return true}return false}
async function jugarVocales(p){for(let i=0;i<5;i++){await vocal(p,true);await p.waitForFunction(i=>document.querySelectorAll('#dots i.on').length===i+1||!document.getElementById('win').hidden,i,{timeout:30000})}
  await p.waitForSelector('#win:not([hidden])',{timeout:30000})}

(async()=>{const b=await chromium.launch();
 /* ===== 1 · recorrido completo desde cero ===== */
 {const{c,p}=await page(b);await p.goto(URL);await p.waitForTimeout(300);
  ok((await p.textContent('#who')).includes('mayor'),'Sin perfil: pide a un mayor que lo prepare');await shot(p,'01-entrada-sin-perfil');
  await p.click('#goBtn');await p.waitForSelector('#gate:not([hidden])');await gate(p);await p.waitForSelector('#adult:not([hidden]) #fName');
  await p.click('#fSave');ok(await p.$eval('#adult',e=>!e.hidden),'No guarda un perfil sin nombre');
  await p.fill('#fName','Thiago');await p.fill('#fSay','Tiago');await p.click('#pform .gbtn[data-g="o"]');await p.click('#pform .avb[data-av="leo"]');
  await shot(p,'02-mayores-perfil');
  await Promise.all([p.waitForNavigation(),p.click('#fSave')]);await p.waitForTimeout(300);
  ok((await p.textContent('#who')).includes('Thiago'),'Tras guardar, la entrada muestra su avatar y nombre');await shot(p,'03-entrada');
  await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');await p.waitForTimeout(300);
  const s1=await said(p);ok(s1.some(t=>/Hola, Tiago/.test(t))&&!s1.some(t=>/Hola, Thiago/.test(t)),'Pipo saluda diciendo el nombre como se pronuncia («Tiago»)');
  ok(/vocales/i.test(await p.textContent('#nextBtn')),'Inicio: propone una siguiente aventura concreta («'+(await p.textContent('#nextBtn .nx-tx b'))+'»)');
  await shot(p,'04-inicio');
  await p.click('#nextBtn');await p.waitForSelector('#game:not([hidden])');await p.waitForTimeout(400);await shot(p,'05-partida');
  // dos fallos: pista y luego ejemplo guiado
  let n0=(await said(p)).length;await vocal(p,false);await p.waitForTimeout(400);
  const t1=(await said(p)).slice(n0).join(' ');ok(/Escucha|Fíjate|Esa no|Casi/.test(t1)&&!/abuela|Jo!/.test(t1),'1.º fallo: pista amable relacionada («'+t1.slice(0,50)+'»)');
  ok(await p.$$eval('#pad .opt.bad',e=>e.length)>=1,'1.º fallo: la opción fallada queda marcada con ✗ (no solo color)');
  await vocal(p,false);await p.waitForTimeout(500);
  ok(await p.$('#pad .opt.aqui')!==null,'2.º fallo: ejemplo guiado, Pipo señala la respuesta');await shot(p,'06-ayuda-guiada');
  await p.click('#pad .opt.aqui');await p.waitForFunction(()=>document.querySelectorAll('#dots i.on').length===1,null,{timeout:20000});
  // bombilla manual
  n0=(await said(p)).length;await p.waitForSelector('#stage .hero-letter');await p.waitForTimeout(300);await p.click('#gHelp');await p.waitForTimeout(400);
  ok((await said(p)).length>n0,'La bombilla «Pista» da una pista hablada');
  for(let i=1;i<5;i++){await vocal(p,true);await p.waitForFunction(i=>document.querySelectorAll('#dots i.on').length===i+1||!document.getElementById('win').hidden,i,{timeout:30000})}
  await p.waitForSelector('#win:not([hidden])');await p.waitForTimeout(1600);await shot(p,'07-fin-aventura');
  ok(/de 3 estrellas/.test(await p.textContent('#winStars')),'Fin: dice cuántas estrellas con texto («'+(await p.textContent('#winStars'))+'»)');
  ok(/Has terminado «Conoce las vocales»/.test(await p.textContent('#winSub')),'Fin: explica qué ha conseguido');
  ok(/próximo amigo|Amigo nuevo/.test(await p.textContent('#winFriend')),'Fin: muestra el avance hacia el próximo amigo');
  const S1=await LS(p,'pipo-aventura-v2');const lg=S1.log&&S1.log[S1.log.length-1];
  ok(lg&&lg.h===1&&lg.n===5,'Se registra la ayuda usada (1 de 5 con ayuda guiada)');
  await p.click('#winNext');await p.waitForSelector('#game:not([hidden])');ok(/Nivel 2/.test(await p.textContent('#gLevel')),'«Siguiente aventura» empieza el nivel 2 sin pasar por menús');
  await p.click('#gBack');await p.waitForSelector('#levels:not([hidden])');await p.waitForTimeout(300);await shot(p,'08-asignatura');
  ok(await p.$$eval('#lvls .tplay',e=>e.length)>=3,'Asignatura: cada tema tiene un botón «Jugar» grande');
  await p.click('#levels [data-go="home"]');await p.click('.wcard.paint');await p.waitForSelector('#paint:not([hidden])');await p.waitForTimeout(400);
  await p.click('#palette .sw[data-i="4"]');await p.click('#paintSvg .rg[data-i="4"]');
  ok(((await LS(p,'pipo-aventura-v2')).colors.pipo||{})['4']==='#4FA3FF','Pintar: el color se guarda solo');
  await p.click('#pUndo');ok(!(((await LS(p,'pipo-aventura-v2')).colors.pipo||{})['4']),'Pintar: «Deshacer» quita el último color');
  await p.click('#paintSvg .rg[data-i="4"]');await p.click('#mBrush');const bb=await p.$eval('#brush',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y}});
  await p.mouse.move(bb.x+60,bb.y+60);await p.mouse.down();for(let k=1;k<8;k++)await p.mouse.move(bb.x+60+k*20,bb.y+60+k*12);await p.mouse.up();await p.waitForTimeout(200);
  await shot(p,'09-pintar');
  await p.click('#paint [data-go="home"]');await p.click('#byeBtn');await p.waitForSelector('#bye:not([hidden])');await p.waitForTimeout(400);await shot(p,'10-despedida');
  ok(/1 aventura/.test(await p.textContent('#byeSum'))&&!/(triste|no te vayas|quédate)/i.test((await said(p)).slice(-1)[0]),'Despedida: resume la sesión sin presionar para seguir');
  const est=Object.values((await LS(p,'pipo-aventura-v2')).stars).reduce((a,b)=>a+b,0);
  await p.reload();await p.waitForTimeout(400);await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');
  ok(est>0&&(await p.textContent('#starCount')).includes('★ '+est),`Al volver: el progreso sigue (★ ${est})`);
  await p.click('.wcard.paint');await p.waitForTimeout(800);
  const px=await p.$eval('#brush',cv=>{const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n});
  ok(px>100&&((await LS(p,'pipo-aventura-v2')).colors.pipo||{})['4'],'Al volver: el dibujo (relleno y pincel) sigue ahí');
  ok(await p.evaluate(()=>window.__maxVoces())===1,'Nunca suenan dos frases de Pipo a la vez');
  // área de mayores: progreso y ayuda
  await p.click('#paint [data-go="home"]');await p.click('#gear');await gate(p);await p.waitForSelector('#adult:not([hidden])');await p.waitForTimeout(300);
  const adult=await p.textContent('#adultBody');ok(/con ayuda en 1 de 5/.test(adult)&&/1 de \d+ superadas/.test(adult),'Mayores: progreso por asignatura y ayuda usada');
  await shot(p,'11-mayores');await p.setViewportSize({width:390,height:2400});await p.screenshot({path:path.join(OUT,'11b-mayores-completo.png')});await c.close()}

 /* ===== 2 · pulsaciones rápidas y cambio de pantalla mientras habla ===== */
 {const{c,p}=await page(b,MOB,{fn:()=>{localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'Lu',say:'',av:'pipo',g:'a'}],cur:'p1'}))}});
  await p.goto(URL);await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');
  for(let i=0;i<6;i++)p.click('#nextBtn').catch(()=>{});await p.waitForSelector('#game:not([hidden])');
  const opts=await p.$$('#pad .opt');for(let r=0;r<3;r++)for(const o of opts)o.click({force:true}).catch(()=>{});
  await p.waitForTimeout(800);ok(await p.evaluate(()=>window.__maxVoces())===1,'Pulsaciones rápidas: no se acumulan voces');
  const c0=await p.evaluate(()=>window.__cancels||0);await p.click('#gSay');await p.click('#gBack');const n1=(await said(p)).length;await p.waitForTimeout(400);
  const after=(await said(p)).slice(n1);
  ok(await p.evaluate(c0=>(window.__cancels||0)>c0,c0)&&!after.some(t=>/vocal|Toca la|abeja/.test(t)),'Al salir mientras habla, la frase de la actividad se corta y no sigue');
  ok(await p.$eval('#levels',e=>!e.hidden),'Volver desde la partida lleva a la asignatura');await c.close()}

 /* ===== 3 · sin voz disponible ===== */
 {const{c,p}=await page(b,MOB,false);await p.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'Lu',say:'',av:'pipo',g:'a'}],cur:'p1'}))});
  await p.goto(URL);await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');await p.click('#nextBtn');
  await p.waitForSelector('#stage .hero-letter');ok(/Toca/.test(await p.textContent('#game .bubble')),'Sin voz: la instrucción se sigue viendo en el bocadillo');
  await jugarVocales(p);ok(true,'Sin voz: se puede completar una aventura entera');await c.close()}

 /* ===== 4 · nombres: largo y con tilde ===== */
 {const{c,p}=await page(b,MOB,{fn:()=>{if(!localStorage.getItem('pipo-perfiles-v1'))localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'María Ángeles',say:'',av:'bruno',g:'a'},{id:'pz',name:'Abcdefghijklmn',say:'',av:'leo',g:'o'}],cur:'p1'}))}});
  await p.goto(URL);await p.waitForTimeout(300);ok(await p.$$eval('.who-card',e=>e.length)===2,'Dos perfiles: se ven dos avatares para elegir');
  ok((await overflow(p)).length===0,'Nombres largos: la entrada no se desborda');await shot(p,'12-entrada-dos-perfiles');
  await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');await p.waitForTimeout(200);
  ok((await said(p)).some(t=>t.includes('María Ángeles')),'Nombre con tilde: se dice completo («María Ángeles»)');
  await p.click('#byeBtn');await p.click('#byeBack');await p.waitForSelector('#start:not([hidden])');
  await Promise.all([p.waitForNavigation(),p.click('.who-card[data-p="pz"]')]);await p.waitForTimeout(300);
  ok((await p.$eval('.who-card.on',e=>e.textContent)).includes('Abcdefghijklmn'),'Cambiar de perfil tocando su avatar');await c.close()}

 /* ===== 5 · recargar a mitad de actividad ===== */
 {const{c,p}=await page(b,MOB,{fn:()=>{if(!localStorage.getItem('pipo-perfiles-v1'))localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'Leo',say:'',av:'pipo',g:'o'}],cur:'p1'}))}});
  await p.goto(URL);await p.click('#goBtn');await p.click('#nextBtn');await vocal(p,true);await p.waitForTimeout(200);await p.reload();await p.waitForTimeout(300);
  ok(await p.$eval('#start',e=>!e.hidden),'Recarga a mitad: vuelve a la entrada sin errores');
  await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');ok(true,'Recarga a mitad: se puede seguir jugando');await c.close()}

 /* ===== 6 · pantalla pequeña y giro ===== */
 for(const[w,hh,tag]of[[320,568,'320'],[844,390,'horizontal']]){const{c,p}=await page(b,{viewport:{width:w,height:hh},isMobile:true,hasTouch:true},{fn:()=>{localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'Thiago',say:'',av:'leo',g:'o'}],cur:'p1'}))}});
  await p.goto(URL);const bad=[];const chk=async n=>{const o=await overflow(p);if(o.length)bad.push(n+':'+o.join('/'))};
  await chk('entrada');await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');await chk('inicio');if(tag==='320')await shot(p,'13-inicio-320');
  await p.click('#nextBtn');await p.waitForSelector('#game:not([hidden])');await p.waitForTimeout(300);await chk('partida');if(tag==='horizontal')await shot(p,'14-partida-horizontal');
  await p.click('#gBack');await chk('asignatura');await p.click('#levels [data-go="home"]');await p.click('.wcard.paint');await p.waitForTimeout(300);await chk('pintar');
  await p.click('#paint [data-go="home"]');await p.click('#gear');await gate(p);await p.waitForSelector('#adult:not([hidden])');await chk('mayores');
  ok(!bad.length,`Pantalla ${tag}: nada se sale por los lados ${bad.join(' ')}`);
  await p.click('#adultBack');await p.click('#goBtn');await p.waitForSelector('#home:not([hidden])');
  const small=await p.evaluate(()=>{return[...document.querySelectorAll('#home button')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return[(e.getAttribute('aria-label')||e.textContent).trim().slice(0,18),Math.round(r.width),Math.round(r.height)]}).filter(([,w,h])=>w<64||h<64)});
  ok(!small.length,`Pantalla ${tag}: botones del inicio de al menos 64 px ${JSON.stringify(small)}`);await c.close()}

 /* ===== 7 · datos antiguos (antes del rediseño) ===== */
 {const OLD={stars:{v0:3,v1:2,e3:3,mc0:1},name:'Juanma',colors:{pipo:{0:'#FF4D4D'}},voice:'',rate:1,pitch:1.2,g:'o',unl:['bigotes'],prog:3};
  const{c,p}=await page(b,MOB,{fn:o=>{if(!localStorage.getItem('pipo-aventura-v2')){localStorage.setItem('pipo-aventura-v2',o.s);localStorage.setItem('pipo-brush-v1',o.b)}},arg:{s:JSON.stringify(OLD),b:JSON.stringify({pipo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='})}});
  await p.goto(URL);await p.waitForTimeout(300);const S=await LS(p,'pipo-aventura-v2'),PP=await LS(p,'pipo-perfiles-v1'),B=await LS(p,'pipo-brush-v1');
  ok(JSON.stringify(S.stars)===JSON.stringify(OLD.stars)&&S.colors.pipo[0]==='#FF4D4D'&&S.prog===3&&S.unl[0]==='bigotes','Datos antiguos: estrellas, colores, amigos y avance intactos');
  ok(PP.list.length===1&&PP.list[0].id==='p1'&&PP.list[0].name==='Juanma','Datos antiguos: se crea el perfil «Juanma» automáticamente');
  ok(B&&B.pipo,'Datos antiguos: los trazos de pincel siguen guardados');
  ok((await p.textContent('#who')).includes('Juanma'),'Datos antiguos: la entrada muestra a Juanma, sin pedir nada');await c.close()}

 /* ===== 8 · atasco: señal discreta y una sola invitación ===== */
 {const{c,p}=await page(b,MOB,{fn:()=>{localStorage.setItem('pipo-perfiles-v1',JSON.stringify({list:[{id:'p1',name:'Lu',say:'',av:'pipo',g:'a'}],cur:'p1',cfg:{ayuda:10}}))}});
  await p.clock.install();await p.goto(URL);await p.click('#goBtn');await p.clock.runFor(2000);await p.click('#nextBtn');await p.clock.runFor(4000);
  const n0=(await said(p)).length;await p.clock.runFor(11000);ok(await p.$eval('#gHelp',e=>e.classList.contains('nudge')),'Atasco: a los 10 s la bombilla se ilumina (sin hablar)');
  ok((await said(p)).length===n0,'Atasco: primero solo señal visual');await p.clock.runFor(11000);
  const st=(await said(p)).slice(n0);ok(st.length===1&&/bombilla/.test(st[0]),'Atasco: después, una sola invitación a pedir ayuda');
  await p.clock.runFor(60000);ok((await said(p)).slice(n0).length===1,'Atasco: no repite el mensaje una y otra vez');await c.close()}

 await b.close();
 console.log(res.join('\n'));console.log('\nErrores de página:',errs.length?'\n'+errs.join('\n'):'ninguno');
 process.exit(res.some(r=>r.startsWith('FALLA'))||errs.length?1:0)})().catch(e=>{console.log(res.join('\n'));console.log('ERROR DE LA PRUEBA:',e.message.split('\n')[0]);console.log(errs.join('\n'));process.exit(2)});
