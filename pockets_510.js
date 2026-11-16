/* PFC/PPC 5.0.10 — Cofrinhos. Reserva e resgate nao mexem no saldo bancario total. */
(()=>{'use strict';
const sb=window.PFC_SB,cfg=window.PFC_CONFIG,$=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
let pockets=[],accounts=[],events=[],balances=new Map(),pocketBalances=new Map(),owner=null,seq=0,busy=false;
function info(msg,error=false){const e=$('p510Status');if(e){e.textContent=msg;e.classList.toggle('bank509-error',error);}}
function name(a){return `${a.bank_name} · ${a.account_label}`;}
function wallet(p){return Number(pocketBalances.get(p.id)||0);}
function renderOptions(id,rows,placeholder){const el=$(id);if(!el)return;const old=el.value;el.replaceChildren(new Option(placeholder,''));rows.forEach(r=>el.add(new Option(r.display,r.id)));if([...el.options].some(o=>o.value===old))el.value=old;}
function reset(){++seq;owner=null;pockets=[];events=[];accounts=[];balances=new Map();pocketBalances=new Map();if($('p510List'))$('p510List').innerHTML='';if($('p510Events'))$('p510Events').innerHTML='';info('Entre para consultar os cofrinhos.');}
async function load(){const user=window.PFC_CURRENT_USER;if(!user?.id||!cfg?.householdId)return;const token=++seq;owner=user.id;info('Atualizando reservas…');try{
const [a,p,e,b,pb]=await Promise.all([
 sb.from('pfc_financial_accounts').select('id,bank_name,account_label,scope,active,opening_date').eq('household_id',cfg.householdId),
 sb.from('pfc510_pockets').select('id,account_id,name,goal_amount,active,created_by,created_at').eq('household_id',cfg.householdId).order('created_at',{ascending:true}),
 sb.from('pfc510_pocket_events').select('id,pocket_id,kind,amount_delta,occurred_on,note,created_by,reverses_event_id,created_at').eq('household_id',cfg.householdId).order('created_at',{ascending:false}).limit(2000),
 sb.rpc('pfc510_balances',{p_household:cfg.householdId}),
 sb.rpc('pfc510_pocket_balances',{p_household:cfg.householdId})
]);for(const x of [a,p,e,b,pb])if(x.error)throw x.error;if(token!==seq||owner!==user.id)return;
accounts=a.data||[];pockets=p.data||[];events=e.data||[];balances=new Map((b.data||[]).map(x=>[x.account_id,x]));pocketBalances=new Map((pb.data||[]).map(x=>[x.pocket_id,Number(x.reserved_amount)]));render();info('Cofrinhos atualizados.');
}catch(error){if(token===seq)info('Falha ao carregar: '+(error.message||String(error)),true);}}
function render(){const visible=accounts.filter(a=>a.active);renderOptions('p510Account',visible.map(a=>({id:a.id,display:name(a)})),'Selecione a conta');renderOptions('p510Pocket',pockets.filter(p=>p.active).map(p=>({id:p.id,display:`${p.name} · ${name(accounts.find(a=>a.id===p.account_id)||{bank_name:'Conta',account_label:''})}`})),'Selecione o cofrinho');
const vals=[...balances.values()];$('p510BankTotal').textContent=fmt(vals.reduce((s,b)=>s+Number(b.bank_balance),0));$('p510ReservedTotal').textContent=fmt(vals.reduce((s,b)=>s+Number(b.reserved_balance),0));$('p510AvailableTotal').textContent=fmt(vals.reduce((s,b)=>s+Number(b.available_balance),0));
$('p510List').innerHTML=pockets.length?pockets.map(p=>{const a=accounts.find(a=>a.id===p.account_id);const v=wallet(p),goal=Number(p.goal_amount||0),pct=goal?Math.min(100,Math.max(0,100*v/goal)):0;
return `<div class="p510-pocket"><div class="p510-pocket-top"><div><strong>${esc(p.name)}</strong><small>${esc(a?name(a):'Conta')} · ${a?.scope==='family'?'Familiar':'Privado'}</small></div><b>${fmt(v)}</b></div>${goal?`<div class="p510-meter"><i style="width:${pct}%"></i></div><small>${Math.round(pct)}% da meta de ${fmt(goal)}</small>`:'<small>Reserva sem meta definida</small>'}</div>`;}).join(''):'<p class="muted">Nenhum cofrinho cadastrado.</p>';
const pocketMap=new Map(pockets.map(p=>[p.id,p]));const reversed=new Set(events.filter(e=>e.reverses_event_id).map(e=>e.reverses_event_id));
$('p510Events').innerHTML=events.slice(0,90).map(e=>{const p=pocketMap.get(e.pocket_id);const eligible=e.created_by===owner&&e.kind!=='reversal'&&!reversed.has(e.id);return `<tr><td>${esc(e.occurred_on)}</td><td>${esc(p?.name||'Cofrinho')}</td><td>${esc(({deposit:'Aporte',withdrawal:'Resgate',yield:'Rendimento',reversal:'Estorno'})[e.kind]||e.kind)}</td><td class="right">${Number(e.amount_delta)>0?'+':'−'} ${fmt(Math.abs(Number(e.amount_delta)))}</td><td>${eligible?`<button class="outline-btn bank509-mini" data-p510-reverse="${e.id}" type="button">Estornar</button>`:''}</td></tr>`;}).join('')||'<tr><td colspan="5">Nenhum movimento de reserva.</td></tr>';
}
async function rpc(fn,args,msg){if(busy)return false;busy=true;info('Registrando operação…');try{const {error}=await sb.rpc(fn,args);if(error)throw error;await load();info(msg);window.dispatchEvent(new CustomEvent('pfc:bank-change'));return true;}catch(error){info('Operação não concluída: '+(error.message||String(error)),true);return false;}finally{busy=false;}}
$('p510Create')?.addEventListener('submit',async evt=>{evt.preventDefault();const f=evt.currentTarget,d=new FormData(f),account=accounts.find(a=>a.id===d.get('account_id'));if(!account)return info('Selecione uma conta.',true);const goal=d.get('goal_amount')?Number(d.get('goal_amount')):null;if(!confirm(`Criar cofrinho “${d.get('name')}” em ${name(account)}? O saldo inicial nao sera alterado.`))return;
const success=await rpc('pfc510_create_pocket',{p_account:account.id,p_name:d.get('name'),p_goal:goal},'Cofrinho cadastrado.');if(success)f.reset();});
$('p510Operation')?.addEventListener('submit',async evt=>{evt.preventDefault();const d=new FormData(evt.currentTarget),p=pockets.find(p=>p.id===d.get('pocket_id'));if(!p)return info('Selecione um cofrinho.',true);const op=d.get('kind'),amount=Number(d.get('amount'));const label=({deposit:'guardar',withdrawal:'resgatar',yield:'creditar rendimento de'})[op];if(!confirm(`Confirmar ${label} ${fmt(amount)} no cofrinho “${p.name}”? ${op==='yield'?'Este rendimento AUMENTA o saldo bancario.':'Aporte ou resgate nao altera o patrimonio total.'}`))return;
await rpc('pfc510_pocket_operation',{p_pocket:p.id,p_kind:op,p_amount:amount,p_date:d.get('occurred_on'),p_note:d.get('note')||''},'Operação registrada e auditada.');});
$('p510Events')?.addEventListener('click',evt=>{const el=evt.target.closest('[data-p510-reverse]');if(!el)return;const why=prompt('Motivo do estorno (5 a 250 caracteres):');if(!why)return;void rpc('pfc510_reverse_event',{p_event:el.dataset.p510Reverse,p_reason:why},'Estorno auditado concluído.');});
$('p510Refresh')?.addEventListener('click',()=>void load());
window.addEventListener('pfc:ready',()=>{if($('p510Date'))$('p510Date').value=today();void load();});
window.addEventListener('pfc:navigate',evt=>{if(evt.detail?.view==='pockets')void load();});
window.addEventListener('pfc:bank-change',()=>{if(document.getElementById('view-pockets')?.classList.contains('active'))void load();});
sb?.auth?.onAuthStateChange(event=>{if(event==='SIGNED_OUT')reset();});
})();
