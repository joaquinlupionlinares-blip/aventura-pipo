/* Solo en la app Android: el WebView no trae speechSynthesis, así que se imita
   sobre el puente nativo AndroidTTS (TextToSpeech del móvil). Fuera de la app no hace nada. */
(function(){
  if(!window.AndroidTTS)return;
  var T=window.AndroidTTS,n=0,map={},live=0,hooks=[];
  function V(name,lang){return{name:name,lang:lang,voiceURI:name,localService:true,default:false}}
  var voices=[V('Voz de Pipo (español)','es-ES'),V('Voz del sistema (inglés)','en-US')];
  window.SpeechSynthesisUtterance=function(t){this.text=t==null?'':String(t);this.lang='';this.voice=null;this.rate=1;this.pitch=1;this.volume=1;this.onend=null;this.onerror=null;this.onstart=null};
  window.__ttsEvent=function(id,ev){var u=map[id];if(!u)return;delete map[id];live=Math.max(0,live-1);
    var f=ev==='error'?(u.onerror||u.onend):u.onend;try{if(f)f({type:ev,utterance:u})}catch(e){}};
  var ss={paused:false,onvoiceschanged:null,
    get speaking(){return live>0},get pending(){return false},
    speak:function(u){var id='u'+(++n);map[id]=u;live++;var lang=(u.voice&&u.voice.lang)||u.lang||'es-ES';
      try{T.speak(id,String(u.text||''),lang,+u.rate||1,+u.pitch||1)}catch(e){window.__ttsEvent(id,'error')}},
    cancel:function(){try{T.stop()}catch(e){}Object.keys(map).forEach(function(id){window.__ttsEvent(id,'end')})},
    getVoices:function(){return voices},pause:function(){},resume:function(){},
    addEventListener:function(t,f){if(t==='voiceschanged')hooks.push(f)},removeEventListener:function(){}};
  try{Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true})}catch(e){window.speechSynthesis=ss}
  window.__ttsReady=function(){hooks.forEach(function(f){try{f()}catch(e){}});try{if(ss.onvoiceschanged)ss.onvoiceschanged()}catch(e){}};
  /* botón Atrás de Android: cierra paneles o vuelve a la pantalla anterior; en el inicio devuelve false */
  window.__back=function(){
    var q=function(s){return document.querySelector(s)};
    if(q('#gate:not([hidden])')){q('#gateNo').click();return true}
    if(q('#newChar:not([hidden])')){q('#newChar').click();return true}
    if(q('#win:not([hidden])')){q('#winHome').click();return true}
    if(q('#adult:not([hidden])')){q('#adultBack').click();return true}
    if(q('#bye:not([hidden])')){q('#byeBack').click();return true}
    var b=q('#game:not([hidden]) #gBack')||q('.screen:not([hidden]) [data-go="home"]');
    if(b){b.click();return true}
    return false};
})();
