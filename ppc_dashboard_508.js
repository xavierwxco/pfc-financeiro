/* PFC/PPC 5.0.8 — Dashboard pessoal consolidado (leitura somente). */
(()=>{'use strict';
const $=id=>document.getElementById(id),sb=window.PFC_SB;
const brl=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const cents=n=>Math.round(Number(n||0)*100);
const month=s=>String(s||'').slice(0,7);
let categoryChart=null,annualChart=null,seq=0;
function reset(){++seq;for(const c of [categoryChart,annualChart])c?.destroy();categoryChart=null;annualChart=null;for(const id of ['p508Income','p508Manual','p508Cards','p508Consolidated'])if($(id))$(id).textContent='—';}
function newChart(old,id,config){old?.destroy();const ctx=$(id);return ctx&&window.Chart?new Chart(ctx,config):null;}
async function update(){if(!$('p508Income'))return;const user=window.PFC_CURRENT_USER;
 if(!user?.id)return;const request=++seq;
 $('p508Status').textContent='Atualizando relatório com os dados pessoais…';
 try{
  const results=await Promise.all([
   sb.from('ppc_transactions').select('id,entry_date,kind,category,amount').eq('owner_user_id',user.id),
   sb.from('ppc_personal_card_purchases').select('id,owner_user_id,purchase_date,category,amount,cancelled_at').eq('owner_user_id',user.id),
   sb.from('ppc_personal_card_expense_links').select('purchase_id,transaction_id').eq('owner_user_id',user.id)
  ]);
  for(const r of results)if(r.error)throw r.error;
  if(request!==seq||window.PFC_CURRENT_USER?.id!==user.id)return;
  const [entries,allPurchases,links]=results.map(r=>r.data||[]);
  const purchases=allPurchases.filter(x=>!x.cancelled_at),linked=new Set(links.map(x=>x.purchase_id));
  const chosen=$('p508Month').value,year=String($('p508Year').value||new Date().getFullYear());
  const incomes=entries.filter(x=>x.kind==='income'&&month(x.entry_date)===chosen).reduce((n,x)=>n+cents(x.amount),0);
  const manual=entries.filter(x=>x.kind==='expense'&&month(x.entry_date)===chosen).reduce((n,x)=>n+cents(x.amount),0);
  const cards=purchases.filter(x=>month(x.purchase_date)===chosen).reduce((n,x)=>n+cents(x.amount),0);
  const duplicate=purchases.filter(x=>month(x.purchase_date)===chosen&&linked.has(x.id)).reduce((n,x)=>n+cents(x.amount),0);
  const con=manual+cards-duplicate;
  $('p508Income').textContent=brl(incomes/100);$('p508Manual').textContent=brl(manual/100);$('p508Cards').textContent=brl(cards/100);$('p508Consolidated').textContent=brl(con/100);
  const groups=new Map();
  for(const e of entries.filter(x=>x.kind==='expense'&&month(x.entry_date)===chosen))groups.set(e.category,(groups.get(e.category)||0)+cents(e.amount));
  for(const x of purchases.filter(x=>month(x.purchase_date)===chosen&&!linked.has(x.id)))groups.set(x.category,(groups.get(x.category)||0)+cents(x.amount));
  const labels=[...groups.keys()].sort((a,b)=>groups.get(b)-groups.get(a));
  categoryChart=newChart(categoryChart,'p508Categories',{type:'doughnut',data:{labels,datasets:[{data:labels.map(x=>groups.get(x)/100)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});
  const monthly=[];for(let m=1;m<=12;m++){const ym=year+'-'+String(m).padStart(2,'0');let total=0;
   for(const t of entries)if(t.kind==='expense'&&month(t.entry_date)===ym)total+=cents(t.amount);
   for(const p of purchases)if(month(p.purchase_date)===ym&&!linked.has(p.id))total+=cents(p.amount);
   monthly.push(total/100);
  }
  annualChart=newChart(annualChart,'p508Annual',{type:'bar',data:{labels:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],datasets:[{label:'Consumo consolidado (R$)',data:monthly}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  $('p508Status').textContent='Atualizado. Faturas pagas não são somadas novamente; rubricas do contracheque permanecem analíticas.';
 }catch(err){if(request===seq){$('p508Status').textContent='Não foi possível consultar o relatório: '+(err.message||err);console.error(err);}}
}
function init(){if(!$('p508Month'))return;const d=new Date(),ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');$('p508Month').value=ym;$('p508Year').value=String(d.getFullYear());void update();}
$('p508Month')?.addEventListener('change',()=>{if($('p508Month').value)$('p508Year').value=$('p508Month').value.slice(0,4);void update();});
$('p508Year')?.addEventListener('change',()=>void update());$('p508Refresh')?.addEventListener('click',()=>void update());
window.addEventListener('pfc:ready',init);
window.addEventListener('pfc:navigate',e=>{if(e.detail?.view==='ppc')void update();});
window.addEventListener('ppc:wallet-changed',()=>void update());
sb?.auth?.onAuthStateChange?.(ev=>{if(ev==='SIGNED_OUT')reset();});
})();
