'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tt;
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),3500)}

document.addEventListener('pointerdown',e=>{
  const b=e.target.closest('.rip');if(!b)return;
  const r=b.getBoundingClientRect(),d=Math.max(r.width,r.height);
  const s=document.createElement('span');s.className='r';
  s.style.cssText='width:'+d+'px;height:'+d+'px;left:'+(e.clientX-r.left-d/2)+'px;top:'+(e.clientY-r.top-d/2)+'px';
  b.appendChild(s);setTimeout(()=>s.remove(),700);
});

(function(){
  const c=$('fx'),x=c.getContext('2d');let w,h;const P=[];
  const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function rs(){w=c.width=innerWidth;h=c.height=innerHeight}
  rs();addEventListener('resize',rs);
  for(let i=0;i<(rm?0:40);i++)P.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*2+.5,v:Math.random()*.5+.15,a:Math.random()*6.283});
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

function chips(el,arr,cur,fn){
  el.innerHTML=arr.map(a=>'<button type="button" class="chip rip'+(a[1]===cur?' on':'')+'" data-v="'+esc(a[1])+'">'+esc(a[0])+'</button>').join('');
  el.onclick=e=>{const b=e.target.closest('.chip');if(!b)return;el.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));fn(b.dataset.v)};
}

$('go-link').onclick=()=>$('link').scrollIntoView({behavior:'smooth',block:'start'});
$('go-cmd').onclick=()=>$('cmds').scrollIntoView({behavior:'smooth',block:'start'});

/* vinculación */
(function(){
  let timer=null,cur='';
  const out=$('lout');
  const stop=()=>{clearInterval(timer);timer=null};
  const show=h=>{out.innerHTML=h};
  async function poll(){
    try{
      const j=await (await fetch('/api/wa/status?phone='+cur)).json();
      if(j.state==='open'){stop();show('<div class="wok">✅ ¡Vinculado! Ya puedes escribir <b>.play</b> y el nombre de una canción en cualquier chat de WhatsApp.</div>')}
      else if(j.state==='none'){stop();show('<p class="msg">El código venció. Pide uno nuevo.</p>')}
    }catch(e){}
  }
  $('lf').onsubmit=async function(e){
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
      show('<p class="note">Tu código de vinculación:</p><div class="wcode">'+esc(j.code)+'</div><button type="button" id="lcopy" class="btn rip">Copiar código</button><p class="note" style="margin-top:10px">Escríbelo en WhatsApp. Vence en unos 3 minutos. Esperando vinculación…</p>');
      $('lcopy').onclick=function(){
        const t=j.code.replace('-','');
        if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){toast('Código copiado')},function(){toast('Copia el código a mano')});
        else toast('Copia el código a mano');
      };
      timer=setInterval(poll,3000);
    }catch(err){show('<p class="msg">'+esc(err.message)+'</p>')}
  };
})();

/* comandos (se leen del propio bot) */
let ALL=[];
function drawCmds(cat){
  const l=ALL.filter(c=>!cat||c.cat===cat);
  const rs=l.filter(c=>c.react),rest=l.filter(c=>!c.react);
  let h=rest.map(c=>'<div class="cmd"><code>.'+esc(c.name)+(c.usage?' <i>'+esc(c.usage)+'</i>':'')+'</code><span>'+esc(c.desc)+'</span></div>').join('');
  if(rs.length)h+='<div class="cmd"><code>Reacciones en GIF</code><span>'+rs.map(c=>'.'+esc(c.name)).join('  ')+' — menciona o responde a alguien.</span></div>';
  $('cl').innerHTML=h||'<p class="msg">Sin comandos.</p>';
}
(async function(){
  try{
    const j=await (await fetch('/api/wa/commands')).json();
    ALL=j.commands||[];
    const order=['General','Música','Grupo','Anime','Juegos','Herramientas','Owner'];
    const cats=order.filter(o=>ALL.some(c=>c.cat===o));
    chips($('cc'),[['Todos','']].concat(cats.map(c=>[c,c])),'',drawCmds);
    drawCmds('');
  }catch(e){$('cl').innerHTML='<p class="msg">No se pudo cargar la lista de comandos.</p>'}
})();

/* animación al aparecer */
(function(){
  const els=document.querySelectorAll('.rv');
  if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
  const io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{threshold:.08});
  els.forEach(e=>io.observe(e));
})();
