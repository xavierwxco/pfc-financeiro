// PFC 4.2: cancelamento auditado. Nao edita transferencias diretamente.
(()=>{'use strict';
 const sb=window.PFC_SB,C=window.PFC_CONFIG;
 const parent=document.getElementById('view-settlement');
 if(!parent||!sb||!C){console.error('PFC 4.2: dependencias ausentes');return;}
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
 const fmt=d=>d?new Date(d.length===10?d+'T12:00:00':d).toLocaleDateString('pt-BR'):'—';
 const section=document.createElement('article');section.className='panel settlement-list';section.style.marginTop='16px';
 section.innerHTML='<div class="panel-head"><div><h2>Gerenciar transferências de acerto</h2><p>Somente o autor pode cancelar. Os dois continuam vendo o histórico.</p></div><button type="button" class="outline-btn" id="scRefresh">Atualizar lista</button></div><p id="scMessage" role="status" aria-live="polite"></p><div class="table-scroll"><table><thead><tr><th>DATA</th><th>DE / PARA</th><th>MÊS</th><th>VALOR</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody id="scRows"></tbody></table></div>';
 parent.appendChild(section);
 const rows=document.getElementById('scRows'),msg=document.getElementById('scMessage'),refreshBtn=document.getElementById('scRefresh');
 let currentUser=null,items=[],busy=false;
 async function refresh(){
  if(busy)return;busy=true;refreshBtn.disabled=true;msg.textContent='Atualizando transferências...';
  try{
   const auth=await sb.auth.getUser();if(auth.error)throw auth.error;
   currentUser=auth.data.user?.id||null;
   if(!currentUser){rows.innerHTML='';msg.textContent='Entre na conta para ver as transferências.';return;}
   const q=await sb.from('settlements').select('id,household_id,created_by,from_user_id,to_user_id,amount,paid_on,settlement_period,cancelled_at,cancelled_by,cancel_reason').eq('household_id',C.householdId).order('paid_on',{ascending:false}).limit(300);
   if(q.error)throw q.error;items=q.data||[];
   rows.innerHTML=items.map(t=>{
    const cancelled=!!t.cancelled_at,own=t.created_by===currentUser;
    const status=cancelled?'Cancelada em '+fmt(t.cancelled_at)+(t.cancel_reason?' — '+esc(t.cancel_reason):''):'Ativa';
    return `<tr><td>${fmt(t.paid_on)}</td><td>${esc(C.members[t.from_user_id]||'Membro')} → ${esc(C.members[t.to_user_id]||'Membro')}</td><td>${esc(t.settlement_period?.slice(0,7)||'—')}</td><td>${brl(t.amount)}</td><td>${status}</td><td>${!cancelled&&own?`<button type="button" class="outline-btn" data-sc-cancel="${esc(t.id)}">Cancelar</button>`:(!cancelled?'Somente quem cadastrou':'—')}</td></tr>`;
   }).join('')||'<tr><td colspan="6">Nenhuma transferência cadastrada.</td></tr>';
   msg.textContent=items.length+' transferência(s) listada(s).';
  }catch(e){console.error('PFC: erro ao listar transferências',e);msg.textContent='Não foi possível atualizar: '+(e.message||e);}
  finally{busy=false;refreshBtn.disabled=false;}
 }
 refreshBtn.addEventListener('click',refresh);
 section.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-sc-cancel]');if(!btn||busy)return;
  const t=items.find(x=>x.id===btn.dataset.scCancel);
  if(!t||t.cancelled_at||t.created_by!==currentUser)return;
  const reason=window.prompt('Motivo do cancelamento (5 a 500 caracteres):');
  if(reason===null)return;
  const note=reason.trim();if(note.length<5||note.length>500){msg.textContent='Informe um motivo de 5 a 500 caracteres.';return;}
  if(!window.confirm('Cancelar esta transferência de '+brl(t.amount)+'? A operação ficará registrada no histórico.'))return;
  busy=true;btn.disabled=true;msg.textContent='Registrando cancelamento...';
  try{
   const result=await sb.rpc('cancel_family_settlement',{p_settlement_id:t.id,p_reason:note});
   if(result.error)throw result.error;
   if(result.data?.id!==t.id||!result.data?.cancelled_at)throw Error('O banco não confirmou o cancelamento. Verifique antes de tentar novamente.');
   msg.textContent='Transferência cancelada e registrada. Atualizando saldos...';
   // O app.js refaz a leitura e atualiza acerto e relatorios neste evento.
   window.dispatchEvent(new Event('pfc:invoicePaid'));
  }catch(err){console.error('PFC: falha ao cancelar',err);msg.textContent='Não foi possível cancelar: '+(err.message||err);}
  finally{busy=false;btn.disabled=false;await refresh();}
 });
 window.addEventListener('pfc:ready',refresh);
 document.querySelectorAll('[data-view="settlement"]').forEach(x=>x.addEventListener('click',refresh));
 sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){currentUser=null;items=[];rows.innerHTML='';msg.textContent='';}});
 sb.auth.getSession().then(({data})=>{if(data.session)refresh();}).catch(console.error);
})();
