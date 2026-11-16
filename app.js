'use strict';
const $=id=>document.getElementById(id);
const BLANK='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const APP='app_name=YUTA_PLAY';
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>{s=Math.floor(s||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
let tt;
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),4500)}

/* ripple en botones */
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest('.rip');if(!b)return;
  const r=b.getBoundingClientRect(),d=Math.max(r.width,r.height);
  const s=document.createElement('span');s.className='r';
  s.style.cssText='width:'+d+'px;height:'+d+'px;left:'+(e.clientX-r.left-d/2)+'px;top:'+(e.clientY-r.top-d/2)+'px';
  b.appendChild(s);setTimeout(()=>s.remove(),700);
});

/* partículas de energía */
(function(){
  const c=$('fx'),x=c.getContext('2d');let w,h;const P=[];
  const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function rs(){w=c.width=innerWidth;h=c.height=innerHeight}
  rs();addEventListener('resize',rs);
  for(let i=0;i<(rm?0:46);i++)P.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*2+.5,v:Math.random()*.5+.15,a:Math.random()*6.283});
  function t(){
    x.clearRect(0,0,w,h);
    for(const p of P){
      p.y-=p.v;p.a+=.01;p.x+=Math.sin(p.a)*.4;
      if(p.y<-5){p.y=h+5;p.x=Math.random()*w}
      x.beginPath();x.fillStyle='rgba(127,196,255,'+(.15+.35*Math.abs(Math.sin(p.a)))+')';
      x.shadowBlur=10;x.shadowColor='#7fc4ff';x.arc(p.x,p.y,p.r,0,6.283);x.fill();
    }
    if(!document.hidden)requestAnimationFrame(t);else setTimeout(t,600);
  }
  t();
})();

/* estado */
const M={list:[],loaded:false,genre:'',q:''};
const H={list:[],loaded:false};
const V={list:[],loaded:false,cat:'feature_films',q:'',cur:null,files:{},ql:store.get('ql','720p'),cq:''};
let host=null,curId=null,queue=[],qi=-1;
const A=new Audio();A.preload='auto';
const ORDER=['1080p','720p','480p','360p'];

/* utilidades de interfaz */
function chips(el,arr,cur,fn){
  el.innerHTML=arr.map(a=>'<button type="button" class="chip rip'+(a[1]===cur?' on':'')+'" data-v="'+esc(a[1])+'">'+esc(a[0])+'</button>').join('');
  el.onclick=e=>{const b=e.target.closest('.chip');if(!b)return;el.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));fn(b.dataset.v)};
}
function rows(el,items,t){
  el.innerHTML=items.map((x,i)=>'<div class="row rip" data-i="'+i+'" data-id="'+esc(x.id)+'" style="--d:'+Math.min(i,12)*45+'ms"><img loading="lazy" alt="" src="'+esc(x.img||BLANK)+'"><div class="tx"><p>'+(x.nuevo?'<em class="nw">NUEVO</em> ':'')+esc(x.title)+'</p><small>'+esc(x.by)+'</small></div>'+(t==='m'?'<span class="eq"><i></i><i></i><i></i></span>':'')+'</div>').join('');
}
function skeleton(el){el.innerHTML='<div class="sk"></div>'.repeat(6)}
function mark(){
  document.querySelectorAll('#mlist .row,#home-list .row,#fl-m .row,#slist .row').forEach(r=>r.classList.toggle('on',curId!==null&&r.dataset.id===String(curId)));
}

/* menú lateral */
function openDrawer(){$('dr').classList.add('open');$('ov').classList.add('on')}
function closeDrawer(){$('dr').classList.remove('open');$('ov').classList.remove('on')}
$('mb').onclick=openDrawer;
$('ov').onclick=closeDrawer;
$('menu').onclick=e=>{const b=e.target.closest('button');if(b)go(b.dataset.v)};
$('av').onclick=()=>go('settings');
let sx=null;
document.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',e=>{
  if(sx===null)return;
  const dx=e.changedTouches[0].clientX-sx;
  if(dx<-60&&$('dr').classList.contains('open'))closeDrawer();
  if(dx>80&&sx<24)openDrawer();
  sx=null;
},{passive:true});

const VIEWS=['home','search','music','video','favs','link','settings'];
function go(v){
  VIEWS.forEach(n=>$('v-'+n).classList.toggle('on',n===v));
  document.querySelectorAll('#menu button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  closeDrawer();
  window.scrollTo({top:0,behavior:'smooth'});
  if(v==='music'&&!M.loaded)loadMusic();
  if(v==='video'&&!V.loaded)loadVideo();
  if(v==='search'&&!SR.list.length)setTimeout(function(){$('sq').focus()},400);
  if(v==='favs')drawFavs();
  if(v==='home')loadHome();
}

/* Audius (música) */
async function getHost(){
  if(host)return host;
  const r=await fetch('https://api.audius.co');
  if(!r.ok)throw new Error('audius');
  const j=await r.json();
  host=j.data[Math.floor(Math.random()*j.data.length)];
  return host;
}
async function audius(path){
  for(let i=0;i<3;i++){
    try{
      const h=await getHost();
      const r=await fetch(h+'/v1/'+path+(path.indexOf('?')>-1?'&':'?')+APP);
      if(!r.ok)throw new Error('http');
      return (await r.json()).data;
    }catch(e){host=null}
  }
  throw new Error('Audius no responde');
}
const mapTrack=t=>({id:t.id,title:t.title,by:(t.user&&t.user.name)||'—',img:(t.artwork&&(t.artwork['150x150']||t.artwork['480x480']))||''});

async function loadHome(){
  if(H.loaded)return;
  const el=$('home-list');skeleton(el);
  try{
    const d=await audius('tracks/trending');
    H.list=d.filter(t=>t.is_streamable!==false).slice(0,6).map(mapTrack);
    H.loaded=true;rows(el,H.list,'m');mark();
  }catch(e){el.innerHTML='<p class="msg">No se pudo cargar la música. Revisa tu conexión.</p>'}
}
const mapApi=x=>({id:x.id,title:x.title,by:(x.by||'')+(x.dur?' · '+x.dur:''),img:x.img,
  src:'/api/stream?'+(x.u?'u='+encodeURIComponent(x.u):'id='+encodeURIComponent(x.id))+'&t='+encodeURIComponent(x.title)});
async function apiGet(url){
  const r=await fetch(url);
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Error del servidor');
  return (j.results||[]).map(mapApi);
}
async function fetchMusic(){
  if(M.q){
    try{const l=await apiGet('/api/search?q='+encodeURIComponent(M.q));if(l.length)return{list:l,head:'Resultados: '+M.q}}catch(e){console.log(e)}
    const d=await audius('tracks/search?query='+encodeURIComponent(M.q));
    return{list:d.filter(t=>t.is_streamable!==false).map(mapTrack),head:'Resultados: '+M.q};
  }
  if(M.feed==='new'){
    try{const l=await apiGet('/api/new');if(l.length)return{list:l,head:'Novedades de YouTube Music'}}catch(e){console.log(e)}
  }
  const d=await audius('tracks/trending');
  return{list:d.filter(t=>t.is_streamable!==false).map(mapTrack),head:'Tendencias'};
}
async function loadMusic(){
  const el=$('mlist');skeleton(el);
  try{
    const r=await fetchMusic();
    M.list=r.list;M.loaded=true;
    $('mh').textContent=r.head;
    if(r.list.length){rows(el,r.list,'m');mark()}else el.innerHTML='<p class="msg">Sin resultados.</p>';
  }catch(e){el.innerHTML='<p class="msg">No se pudo cargar. Intenta de nuevo.</p>'}
}
async function refreshMusic(){
  if(document.hidden||!$('v-music').classList.contains('on')||!M.loaded)return;
  if(!M.q&&M.feed!=='new')return;
  try{
    const r=await fetchMusic();
    const have=new Set(M.list.map(x=>String(x.id)));
    const fresh=r.list.filter(x=>!have.has(String(x.id)));
    if(!fresh.length)return;
    fresh.forEach(x=>{x.nuevo=true});
    const old=M.list;
    M.list=fresh.concat(old);
    if(queue===old){queue=M.list;qi+=fresh.length}
    rows($('mlist'),M.list,'m');mark();
    toast('🎵 '+fresh.length+(fresh.length>1?' canciones nuevas':' canción nueva'));
  }catch(e){}
}
setInterval(refreshMusic,240000);

/* reproductor de música */
async function playSong(list,i){
  const x=list[i];if(!x)return;
  queue=list;qi=i;curId=x.id;
  try{await getHost()}catch(e){toast('Audius no responde');return}
  closeTheater();
  A.src=host+'/v1/tracks/'+x.id+'/stream?'+APP;
  $('player').classList.add('on');
  $('pt').textContent=x.title;$('pa').textContent=x.by;$('pi').src=x.img||BLANK;
  A.play().catch(()=>toast('Toca ▶ para reproducir'));
  if('mediaSession' in navigator){
    navigator.mediaSession.metadata=new MediaMetadata({title:x.title,artist:x.by,artwork:x.img?[{src:x.img}]:[]});
  }
  mark();updateFavBtns();
}
const nextSong=()=>{if(queue.length)playSong(queue,(qi+1)%queue.length)};
const prevSong=()=>{if(queue.length)playSong(queue,(qi-1+queue.length)%queue.length)};
A.onplay=()=>{document.body.classList.add('pl');$('pp').textContent='⏸'};
A.onpause=()=>{document.body.classList.remove('pl');$('pp').textContent='▶'};
A.onended=nextSong;
A.onerror=async()=>{
  const s=A.getAttribute('src');if(!s)return;
  try{
    const r=await fetch(s,{headers:{Range:'bytes=0-1'}});
    if(!r.ok){const j=await r.json().catch(function(){return {}});toast((j.error||'No se pudo reproducir').slice(0,150));return}
    toast('El navegador no pudo reproducir este audio');
  }catch(e){toast('No se pudo conectar con el servidor')}
};
let wd;
A.onloadstart=()=>{clearTimeout(wd);wd=setTimeout(function(){if(A.readyState<3&&!A.paused)toast('Tarda en cargar… si no suena, prueba otra canción')},25000)};
A.oncanplay=()=>clearTimeout(wd);
A.ontimeupdate=()=>{
  const d=A.duration||0;
  $('ct').textContent=fmt(A.currentTime);$('dt').textContent=fmt(d);
  const p=d?A.currentTime/d*1000:0;
  $('pr').value=p;$('pr').style.setProperty('--p',(p/10)+'%');
};
$('pr').oninput=()=>{if(A.duration)A.currentTime=A.duration*$('pr').value/1000};
$('pp').onclick=()=>{A.paused?A.play().catch(()=>{}):A.pause()};
$('pn').onclick=nextSong;
$('pv').onclick=prevSong;
if('mediaSession' in navigator){
  navigator.mediaSession.setActionHandler('play',()=>A.play());
  navigator.mediaSession.setActionHandler('pause',()=>A.pause());
  navigator.mediaSession.setActionHandler('nexttrack',nextSong);
  navigator.mediaSession.setActionHandler('previoustrack',prevSong);
}

/* videos (Internet Archive) */
async function loadVideo(){
  const el=$('vlist');skeleton(el);
  try{
    const base=V.q?'('+V.q+') AND mediatype:movies':'collection:'+V.cat+' AND mediatype:movies';
    const u='https://archive.org/advancedsearch.php?q='+encodeURIComponent(base)+'&fl[]=identifier&fl[]=title&fl[]=creator&rows=30&page=1&output=json&sort[]='+encodeURIComponent('downloads desc');
    const j=await (await fetch(u)).json();
    V.list=(j.response.docs||[]).map(d=>({id:d.identifier,title:d.title||d.identifier,by:Array.isArray(d.creator)?d.creator[0]:(d.creator||'Internet Archive'),img:'https://archive.org/services/img/'+d.identifier}));
    V.loaded=true;
    $('vh').textContent=V.q?'Resultados: '+V.q:'Populares';
    if(V.list.length)rows(el,V.list,'v');else el.innerHTML='<p class="msg">Sin resultados.</p>';
  }catch(e){el.innerHTML='<p class="msg">No se pudo cargar. Intenta de nuevo.</p>'}
}
function qlabel(f){
  const h=parseInt(f.height)||0;
  if(h>=1000)return '1080p';
  if(h>=700)return '720p';
  if(h>=470)return '480p';
  if(h>0)return '360p';
  const fm=f.format||'';
  if(/HD/i.test(fm))return '720p';
  if(/512Kb|ogv|ogg/i.test(fm))return '360p';
  return '480p';
}
function pickFiles(files,id){
  const ok=files.filter(f=>/\.(mp4|m4v|webm)$/i.test(f.name)&&!/thumb|sample|trailer/i.test(f.name+(f.format||''))&&(+f.size||0)>200000);
  const by={};
  for(const f of ok){
    const l=qlabel(f),s=+f.size||0;
    if(!by[l]||s>by[l].size)by[l]={size:s,url:'https://archive.org/download/'+encodeURIComponent(id)+'/'+f.name.split('/').map(encodeURIComponent).join('/')};
  }
  return by;
}
function renderQ(){
  const labels=ORDER.filter(l=>V.files[l]);
  chips($('vqc'),labels.map(l=>[l,l]),V.cq,l=>setQ(l,true,true));
}
function setQ(l,resume,persist){
  const v=$('vp');
  const t=resume?v.currentTime:0,pl=resume?!v.paused:true;
  V.cq=l;
  if(persist){V.ql=l;store.set('ql',l)}
  v.src=V.files[l].url;
  v.onloadedmetadata=()=>{if(t>0){try{v.currentTime=t}catch(e){}}};
  if(pl)v.play().catch(()=>{});
  renderQ();
  if(persist)toast('Calidad '+l);
}
function closeTheater(){
  const v=$('vp');
  v.pause();v.removeAttribute('src');v.load();
  $('theater').classList.remove('on');
}
$('vp').onerror=()=>{if($('vp').getAttribute('src'))toast('No se pudo cargar. Prueba otra calidad.')};
$('vclose').onclick=closeTheater;
async function openVideo(x){
  if(!x)return;
  A.pause();
  V.cur=x;V.files={};
  $('theater').classList.add('on');
  $('vt').textContent=x.title;$('vby').textContent=x.by;
  $('vqc').innerHTML='<span class="msg" style="padding:6px">Buscando calidades…</span>';
  $('vp').removeAttribute('src');
  $('theater').scrollIntoView({behavior:'smooth',block:'start'});
  updateFavBtns();
  try{
    const j=await (await fetch('https://archive.org/metadata/'+encodeURIComponent(x.id))).json();
    const by=pickFiles(j.files||[],x.id);
    const labels=ORDER.filter(l=>by[l]);
    if(!labels.length){toast('Este video no tiene archivo reproducible');closeTheater();return}
    V.files=by;
    let l=by[V.ql]?V.ql:null;
    if(!l){const pi=ORDER.indexOf(V.ql);l=ORDER.slice(Math.max(pi,0)).find(z=>by[z])||labels[0]}
    setQ(l,false,false);
  }catch(e){toast('No se pudo abrir el video');closeTheater()}
}

/* favoritos */
const favs=()=>store.get('fav',[]);
const isFav=(t,id)=>favs().some(f=>f.t===t&&f.id===id);
function toggleFav(it){
  if(!it)return;
  const f=favs();const k=f.findIndex(x=>x.t===it.t&&x.id===it.id);
  if(k>=0){f.splice(k,1);toast('Quitado de favoritos')}else{f.unshift(it);toast('Añadido a favoritos ♥')}
  store.set('fav',f);updateFavBtns();
  if($('v-favs').classList.contains('on'))drawFavs();
}
function updateFavBtns(){
  const s=queue[qi];
  $('pfav').classList.toggle('on',!!s&&isFav('m',s.id));
  const v=V.cur;
  $('vfav').textContent=v&&isFav('v',v.id)?'♥ Guardado':'♡ Guardar';
}
$('pfav').onclick=()=>{const s=queue[qi];if(s)toggleFav({t:'m',id:s.id,title:s.title,by:s.by,img:s.img})};
$('vfav').onclick=()=>{const v=V.cur;if(v)toggleFav({t:'v',id:v.id,title:v.title,by:v.by,img:v.img})};
function drawFavs(){
  const f=favs(),m=f.filter(x=>x.t==='m'),v=f.filter(x=>x.t==='v');
  $('fm').style.display=m.length?'':'none';
  $('fv').style.display=v.length?'':'none';
  $('fe').style.display=f.length?'none':'';
  rows($('fl-m'),m,'m');rows($('fl-v'),v,'v');mark();
}

/* clics en listas */
$('home-list').onclick=e=>{const r=e.target.closest('.row');if(r)playSong(H.list,+r.dataset.i)};
$('mlist').onclick=e=>{const r=e.target.closest('.row');if(r)playSong(M.list,+r.dataset.i)};
$('vlist').onclick=e=>{const r=e.target.closest('.row');if(r){go('video');openVideo(V.list[+r.dataset.i])}};
$('fl-m').onclick=e=>{const r=e.target.closest('.row');if(r)playSong(favs().filter(x=>x.t==='m'),+r.dataset.i)};
$('fl-v').onclick=e=>{const r=e.target.closest('.row');if(r){const x=favs().filter(z=>z.t==='v')[+r.dataset.i];go('video');openVideo(x)}};

/* buscadores y chips */
$('mf').onsubmit=e=>{e.preventDefault();M.q=$('mq').value.trim();loadMusic()};
$('vf').onsubmit=e=>{e.preventDefault();V.q=$('vs').value.trim();loadVideo()};
chips($('mchips'),[['Novedades','__new'],['Tendencias',''],['Phonk','phonk'],['Funk BR','funk brasileiro'],['Reggaetón','reggaeton'],['Pop latino','pop latino'],['Lo-Fi','lofi'],['Rock','rock']],'__new',v=>{
  if(v==='__new'){M.feed='new';M.q='';$('mq').value=''}
  else if(v===''){M.feed='';M.q='';$('mq').value=''}
  else{M.feed='';M.q=v;$('mq').value=v}
  loadMusic();
});
M.feed='new';
chips($('vchips'),[['Películas','feature_films'],['Cine mudo','silent_films'],['Animación','animationandcartoons'],['TV clásica','classic_tv']],V.cat,v=>{V.cat=v;V.q='';$('vs').value='';loadVideo()});
chips($('qset'),[['720p','720p'],['1080p','1080p'],['480p','480p']],V.ql,l=>{V.ql=l;store.set('ql',l);toast('Calidad por defecto: '+l)});
$('hb-m').onclick=$('tile-m').onclick=()=>go('music');
$('hb-v').onclick=$('tile-v').onclick=()=>go('video');

/* imágenes propias */
function applyImages(){
  const a=store.get('avatar',''),b=store.get('banner','');
  ['av','davatar'].forEach(id=>{const e=$(id);e.style.backgroundImage=a?'url('+a+')':'';e.textContent=a?'':'Y'});
  $('hero-img').style.backgroundImage=b?'url('+b+')':'';
  $('hero-img').classList.toggle('has',!!b);
  $('hero').classList.toggle('custom',!!b);
  $('dbanner').style.backgroundImage=b?'url('+b+')':'';
}
function shrink(file,max){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=rej;
    fr.onload=()=>{
      const im=new Image();
      im.onerror=rej;
      im.onload=()=>{
        const k=Math.min(1,max/Math.max(im.width,im.height));
        const c=document.createElement('canvas');
        c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
        c.getContext('2d').drawImage(im,0,0,c.width,c.height);
        res(c.toDataURL('image/jpeg',.82));
      };
      im.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function pickImg(inp,key,max){
  const f=inp.files[0];inp.value='';if(!f)return;
  try{
    const d=await shrink(f,max);
    if(store.set(key,d)){applyImages();toast('Imagen guardada ✔')}
    else toast('No cupo en el navegador, usa una imagen más chica');
  }catch(e){toast('No pude leer esa imagen')}
}
$('set-av').onclick=()=>$('f-av').click();
$('set-bn').onclick=()=>$('f-bn').click();
$('f-av').onchange=()=>pickImg($('f-av'),'avatar',320);
$('f-bn').onchange=()=>pickImg($('f-bn'),'banner',900);
$('set-reset').onclick=()=>{store.set('avatar','');store.set('banner','');applyImages();toast('Imágenes quitadas')};
$('clrfav').onclick=()=>{store.set('fav',[]);updateFavBtns();drawFavs();toast('Favoritos borrados')};

/* buscador de música */
const SR={q:'',list:[],next:null,busy:false,seen:new Set()};
async function runSearch(q,more){
  if(SR.busy)return;
  SR.busy=true;
  const el=$('slist');
  if(!more){
    SR.q=q;SR.list=[];SR.next=null;SR.seen=new Set();
    skeleton(el);$('smore').style.display='none';
    $('sh').textContent='Resultados: '+q;
  }
  try{
    const url='/api/find?q='+encodeURIComponent(SR.q)+(more&&SR.next?'&t='+encodeURIComponent(SR.next):'');
    const r=await fetch(url);
    const j=await r.json().catch(function(){return {}});
    if(!r.ok)throw new Error(j.error||'Error del buscador');
    const add=(j.results||[]).map(mapApi).filter(function(x){return !SR.seen.has(String(x.id))});
    add.forEach(function(x){SR.seen.add(String(x.id))});
    SR.list=SR.list.concat(add);
    SR.next=SR.list.length>=150?null:(j.next||null);
    if(SR.list.length){rows(el,SR.list,'m');mark()}
    else el.innerHTML='<p class="msg">Sin resultados. Prueba con otro nombre.</p>';
    $('smore').style.display=SR.next?'block':'none';
  }catch(e){
    if(!more)el.innerHTML='<p class="msg">'+esc(e.message||'No se pudo buscar')+'</p>';
    else toast('No se pudo cargar más');
  }
  SR.busy=false;
}
function sugChips(arr){
  chips($('ssug'),arr.map(function(x){return [x,x]}),'',function(v){$('sq').value=v;runSearch(v,false)});
}
if($('sf')){
  const IDEAS=['Montagem Apollo','Bad Bunny','Phonk','Peso Pluma','Karol G','Funk','Lo-Fi','Rock en español'];
  sugChips(IDEAS);
  $('slist').innerHTML='<p class="msg">Escribe arriba o toca una sugerencia.</p>';
  $('sf').onsubmit=function(e){
    e.preventDefault();
    const q=$('sq').value.trim();
    if(q){$('sq').blur();runSearch(q,false)}
  };
  let st;
  $('sq').oninput=function(){
    clearTimeout(st);
    const q=$('sq').value.trim();
    if(!q){sugChips(IDEAS);return}
    st=setTimeout(async function(){
      try{
        const r=await fetch('/api/suggest?q='+encodeURIComponent(q));
        const j=await r.json();
        if($('sq').value.trim()===q&&j.suggestions&&j.suggestions.length)sugChips(j.suggestions);
      }catch(e){}
    },280);
  };
  $('slist').onclick=function(e){const r=e.target.closest('.row');if(r)playSong(SR.list,+r.dataset.i)};
  $('smore').onclick=function(){if(SR.next&&!SR.busy)runSearch(SR.q,true)};
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){
      if(en[0].isIntersecting&&SR.next&&!SR.busy)runSearch(SR.q,true);
    },{rootMargin:'300px'}).observe($('smore'));
  }
  if($('tile-s'))$('tile-s').onclick=function(){go('search')};
}

/* vinculación con WhatsApp */
(function(){
  const form=$('lf');if(!form)return;
  let timer=null,cur='';
  const out=$('lout');
  function stop(){clearInterval(timer);timer=null}
  function show(x){out.innerHTML=x}
  async function poll(){
    try{
      const r=await fetch('/api/wa/status?phone='+cur);const j=await r.json();
      if(j.state==='open'){stop();show('<div class="wok">✅ ¡Vinculado! Ya puedes escribir <b>.play</b> y el nombre de una canción en cualquier chat de WhatsApp.</div>')}
      else if(j.state==='none'){stop();show('<p class="msg">El código venció. Pide uno nuevo.</p>')}
    }catch(e){}
  }
  form.onsubmit=async function(e){
    e.preventDefault();stop();
    const phone=$('lp').value.replace(/\D/g,'');
    if(phone.length<8){toast('Escribe tu número completo con código de país');return}
    cur=phone;show('<div class="sk"></div>');
    try{
      const r=await fetch('/api/wa/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:phone})});
      const j=await r.json().catch(function(){return {}});
      if(!r.ok)throw new Error(j.error||'No se pudo generar el código');
      if(j.state==='open'){show('<div class="wok">✅ Este número ya está vinculado.</div>');return}
      if(j.state==='connecting'){show('<p class="msg">Este número ya estaba vinculado y se está reconectando. Espera un momento.</p>');timer=setInterval(poll,3000);return}
      show('<p class="note">Tu código de vinculación:</p><div class="wcode" id="lcode">'+esc(j.code)+'</div><button type="button" id="lcopy" class="btn rip">Copiar código</button><p class="note" style="margin-top:10px">Escríbelo en WhatsApp. Vence en unos 3 minutos. Esperando vinculación…</p>');
      $('lcopy').onclick=function(){
        const t=j.code.replace('-','');
        if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){toast('Código copiado')},function(){toast('Copia el código a mano')});
        else toast('Copia el código a mano');
      };
      timer=setInterval(poll,3000);
    }catch(err){show('<p class="msg">'+esc(err.message)+'</p>')}
  };
})();

applyImages();
go('home');
