'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','":'&#39;'}[c]));
let tt;
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),3500)}

$('go-link').onclick=()=>$('link').scrollIntoView({behavior:'smooth',block:'start'});

function probarApiStream(){
  const q=$('api-query').value.trim();
  if(!q){toast('Escribe una canción');return}
  const url=location.origin + '/api/stream?q=' + encodeURIComponent(q);
  $('api-result').innerHTML=`<b>Enlace directo generado:</b><br><a href="${url}" target="_blank" style="color:var(--ac);">${url}</a>`;
}

(function(){
  let timer=null,cur='';
  const out=$('lout');
  const stop=()=>{clearInterval(timer);timer=null};
  const show=h=>{out.innerHTML=h};
  async function poll(){
    try{
      const j=await (await fetch('/api/wa/status?phone='+cur)).json();
      if(j.state==='open'){stop();show('<div class="wok">✅ ¡WhatsApp Vinculado Correctamente! Escribe <b>.menu</b> en WhatsApp.</div>')}
      else if(j.state==='none'){stop();show('<p class="msg">El código venció. Pide uno nuevo.</p>')}
    }catch(e){}
  }
  $('lf').onsubmit=async function(e){
    e.preventDefault();stop();
    const phone=$('lp').value.replace(/\D/g,'');
    if(phone.length<8){toast('Escribe tu número completo sin el signo +');return}
    cur=phone;show('<p class="msg">Generando código...</p>');
    try{
      const r=await fetch('/api/wa/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:phone,name:$('ln').value})});
      const j=await r.json().catch(function(){return {}});
      if(!r.ok)throw new Error(j.error||'No se pudo generar el código');
      if(j.state==='open'){show('<div class="wok">✅ Este número ya está vinculado.</div>');return}
      show('<p class="note">Tu código de vinculación:</p><div class="wcode">'+esc(j.code)+'</div><button type="button" id="lcopy" class="btn fill rip" style="width:100%">Copiar código</button>');
      $('lcopy').onclick=function(){
        navigator.clipboard.writeText(j.code.replace(/-/g,''));
        toast('¡Código copiado!');
      };
      timer=setInterval(poll,3000);
    }catch(err){show('<p class="msg">'+esc(err.message)+'</p>')}
  };
})();

let ALL=[];
function drawCmds(cat){
  const l=ALL.filter(c=>!cat||c.cat===cat);
  let h=l.map(c=>'<div class="cmd"><code>.'+esc(c.name)+(c.usage?' <i>'+esc(c.usage)+'</i>':'')+'</code><span>'+esc(c.desc)+'</span></div>').join('');
  $('cl').innerHTML=h||'<p class="msg">Sin comandos.</p>';
}
(async function(){
  try{
    const j=await (await fetch('/api/wa/commands')).json();
    ALL=j.commands||[];
    const cats=[...new Set(ALL.map(c=>c.cat))];
    const chipsEl=$('cc');
    chipsEl.innerHTML='<button type="button" class="chip rip on" data-v="">Todos</button>' + cats.map(c=>'<button type="button" class="chip rip" data-v="'+esc(c)+'">'+esc(c)+'</button>').join('');
    chipsEl.onclick=e=>{const b=e.target.closest('.chip');if(!b)return;chipsEl.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));drawCmds(b.dataset.v)};
    drawCmds('');
  }catch(e){$('cl').innerHTML='<p class="msg">No se pudo cargar la lista.</p>'}
})();
