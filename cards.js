// PFC: cadastro de cartões, compras e faturas previstas.
// Compras de cartão NÃO são despesas pagas nesta versão.
(()=>{'use strict';
const C=window.PFC_CONFIG, sb=window.PFC_SB, el=id=>document.getElementById(id);
const fmtMoney=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asDate=s=>new Date(`${s}T12:00:00`);
const brDate=s=>asDate(s).toLocaleDateString('pt-BR');
const two=n=>String(n).padStart(2,'0');
const iso=(y,m,d)=>`${y}-${two(m+1)}-${two(d)}`;
const monthEnd=(y,m)=>new Date(y,m+1,0).getDate();
const safeDay=(y,m,day)=>Math.min(day,monthEnd(y,m));
const shiftMonth=(y,m,count)=>{const d=new Date(y,m+count,1);return [d.getFullYear(),d.getMonth()]};
let cards=[], purchases=[], installments=[], invoicePayments=[], currentUser=null;

// Primeiro fechamento igual ou posterior à compra. A data de vencimento será
// a primeira ocorrência do dia escolhido estritamente após o fechamento.
function firstInvoiceDue(purchasedOn,closingDay,dueDay){
 const d=asDate(purchasedOn);let y=d.getFullYear(),m=d.getMonth();
 let close=safeDay(y,m,closingDay);
 if(d.getDate()>close){[y,m]=shiftMonth(y,m,1);close=safeDay(y,m,closingDay)}
 let dy=y,dm=m,dd=safeDay(dy,dm,dueDay);
 if(dd<=close){[dy,dm]=shiftMonth(dy,dm,1);dd=safeDay(dy,dm,dueDay)}
 return [dy,dm];
}
function installmentDraft(purchaseId,householdId,total,count,purchasedOn,card){
 const cents=Math.round(Number(total)*100),base=Math.floor(cents/count),remainder=cents%count;
 let [y,m]=firstInvoiceDue(purchasedOn,card.closing_day,card.due_day);
 return Array.from({length:count},(_,i)=>{
  const [yy,mm]=shiftMonth(y,m,i);
  return {purchase_id:purchaseId,household_id:householdId,installment_number:i+1,amount:(base+(i<remainder?1:0))/100,invoice_due_on:iso(yy,mm,safeDay(yy,mm,card.due_day))};
 });
}
function setStatus(s){el('cardsStatus').textContent=s||''}
function labelOwner(id){return C.members?.[id]||'Usuário'}
async function fetchAll(){
 const results=await Promise.all([
  sb.from('credit_cards').select('id,label,owner_user_id,closing_day,due_day,credit_limit,active').eq('household_id',C.householdId).order('label'),
  sb.from('card_purchases').select('id,card_id,description,category,purchased_on,total_amount,installment_count,expense_scope').eq('household_id',C.householdId).order('purchased_on',{ascending:false}),
  sb.from('card_installments').select('id,purchase_id,installment_number,amount,invoice_due_on').eq('household_id',C.householdId).order('invoice_due_on'),
  sb.from('invoice_payments').select('id,card_id,invoice_month,amount,paid_on,paid_by').eq('household_id',C.householdId)
 ]);
 for(const r of results) if(r.error) throw r.error;
 [cards,purchases,installments,invoicePayments]=results.map(r=>r.data||[]);
 render();
}
function render(){
 const list=el('cardsList');
 list.innerHTML=cards.map(c=>`<div class="card-item"><strong>${escape(c.label)}</strong><small>Titular: ${escape(labelOwner(c.owner_user_id))}</small><small>Fechamento: dia ${c.closing_day} · Vencimento: dia ${c.due_day}</small><small>Limite cadastrado: ${c.credit_limit==null?'Não informado':fmtMoney(c.credit_limit)}</small><small>${c.active?'Ativo':'Inativo'}</small><button class="outline-btn" data-toggle-card="${c.id}">${c.active?'Desativar':'Reativar'}</button></div>`).join('')||'<div class="card-empty">Nenhum cartão cadastrado.</div>';
 for(const button of list.querySelectorAll('[data-toggle-card]'))button.addEventListener('click',async()=>{
  const c=cards.find(x=>x.id===button.dataset.toggleCard);if(!c)return;
  button.disabled=true;
  try{const {error}=await sb.from('credit_cards').update({active:!c.active}).eq('id',c.id).eq('household_id',C.householdId);if(error)throw error;await fetchAll();setStatus('Cartão atualizado.');}catch(e){setStatus('Não foi possível atualizar: '+e.message)}finally{button.disabled=false}
 });
 const cardMap=new Map(cards.map(c=>[c.id,c]));
 el('cardPurchaseRows').innerHTML=purchases.map(p=>`<tr><td>${escape(p.description)}</td><td>${escape(cardMap.get(p.card_id)?.label||'Cartão')}</td><td>${brDate(p.purchased_on)}</td><td>${p.installment_count}x</td><td>${p.expense_scope==='common'?'Comum':'Individual'}</td><td class="right">${fmtMoney(p.total_amount)}</td></tr>`).join('')||'<tr><td colspan="6">Nenhuma compra cadastrada.</td></tr>';
 const purchaseMap=new Map(purchases.map(p=>[p.id,p]));const grouped=new Map();
 for(const inst of installments){const purchase=purchaseMap.get(inst.purchase_id);if(!purchase)continue;const card=cardMap.get(purchase.card_id);if(!card)continue;const key=card.id+'|'+inst.invoice_due_on.slice(0,7);let v=grouped.get(key);if(!v){v={label:card.label,due:inst.invoice_due_on,amount:0,count:0};grouped.set(key,v)}v.amount+=Number(inst.amount);v.count++;if(inst.invoice_due_on<v.due)v.due=inst.invoice_due_on}
 const paidMap=new Map(invoicePayments.map(p=>[p.card_id+'|'+p.invoice_month.slice(0,7),p]));
 el('invoiceRows').innerHTML=[...grouped.entries()].sort((a,b)=>a[1].due.localeCompare(b[1].due)).map(([key,v])=>{
  const paid=paidMap.get(key),cardId=key.split('|')[0],month=key.split('|')[1];
  return `<tr><td>${escape(v.label)}</td><td>${brDate(v.due)}</td><td>${v.count}</td><td class="right">${fmtMoney(v.amount)}</td><td>${paid?`<strong>Pago em ${brDate(paid.paid_on)}</strong><small style="display:block">Por ${escape(labelOwner(paid.paid_by))}</small>`:`<button class="outline-btn" data-pay-invoice="${cardId}|${month}">Registrar pagamento</button>`}</td></tr>`;
 }).join('')||'<tr><td colspan="5">Nenhuma fatura prevista.</td></tr>';
 for(const btn of el('invoiceRows').querySelectorAll('[data-pay-invoice]')) btn.addEventListener('click',()=>payInvoice(btn.dataset.payInvoice));
}

function payInvoice(key){
 const [cardId,month]=key.split('|');
 const card=cards.find(c=>c.id===cardId);
 const invItems=installments.filter(i=>i.invoice_due_on.slice(0,7)===month && purchases.some(p=>p.id===i.purchase_id&&p.card_id===cardId));
 const total=invItems.reduce((s,i)=>s+Math.round(Number(i.amount)*100),0)/100;
 if(!card||!invItems.length){setStatus('Fatura não encontrada.');return;}
 const owners=Object.entries(C.members).map(([id,name])=>`<option value="${escape(id)}">${escape(name)}</option>`).join('');
 const form=makeModal('Confirmar pagamento integral da fatura',
  `<p class="cards-help">Cartão: <b>${escape(card.label)}</b> · Mês: <b>${escape(month)}</b><br>Valor integral: <b>${fmtMoney(total)}</b>. Só confirme se o dinheiro realmente saiu da conta.</p>`+
  label('Quem efetivamente pagou?',`<select name="paid_by">${owners}</select>`)+
  label('Data em que pagou',input('paid_on','date'))+
  `<p class="cards-help">Cada parcela paga será incluída no extrato. As despesas comuns participarão do acerto familiar; despesas individuais não.</p>`,
  async f=>{
   const {error}=await sb.rpc('pay_card_invoice',{p_card_id:cardId,p_invoice_month:month+'-01',p_paid_on:f.get('paid_on'),p_paid_by:f.get('paid_by')});
   if(error)throw error;
   window.dispatchEvent(new Event('pfc:invoicePaid'));
  });
 form.elements.paid_on.value=new Date().toLocaleDateString('en-CA');
}

function makeModal(title,fields,onSubmit){
 const bg=document.createElement('div');bg.className='card-modal-bg open';
 bg.innerHTML=`<form class="card-modal"><h2>${escape(title)}</h2>${fields}<p class="cards-help" role="alert" data-error></p><div class="card-modal-actions"><button class="outline-btn" type="button" data-cancel>Cancelar</button><button class="primary-btn" type="submit">Salvar</button></div></form>`;
 document.body.append(bg);const form=bg.querySelector('form');
 const close=()=>bg.remove();bg.querySelector('[data-cancel]').onclick=close;bg.addEventListener('click',e=>{if(e.target===bg)close()});
 form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;try{await onSubmit(new FormData(form));close();await fetchAll();setStatus('Dados salvos no Supabase.');}catch(error){form.querySelector('[data-error]').textContent='Erro: '+error.message}finally{btn.disabled=false}});
 return form;
}
const label=(text,field)=>`<label>${text}${field}</label>`;
const input=(name,type,extra='')=>`<input name="${name}" type="${type}" ${extra} required>`;
function addCard(){
 const owners=Object.entries(C.members).map(([id,name])=>`<option value="${escape(id)}">${escape(name)}</option>`).join('');
 const form=makeModal('Cadastrar cartão',label('Nome do cartão',input('label','text','maxlength="80" placeholder="Ex.: Nubank Xavier"'))+label('Titular',`<select name="owner_user_id">${owners}</select>`)+label('Dia de fechamento',input('closing_day','number','min="1" max="31" value="10"'))+label('Dia de vencimento',input('due_day','number','min="1" max="31" value="17"'))+label('Limite do cartão (opcional)','<input name="credit_limit" type="number" min="0" step="0.01" placeholder="Ex.: 3000">'),async f=>{
  const payload={household_id:C.householdId,label:String(f.get('label')).trim(),owner_user_id:f.get('owner_user_id'),closing_day:Number(f.get('closing_day')),due_day:Number(f.get('due_day')),credit_limit:f.get('credit_limit')===''?null:Number(f.get('credit_limit'))};
  if(!payload.label)throw Error('Informe o nome do cartão.');
  const {error}=await sb.from('credit_cards').insert(payload);if(error)throw error;
 });return form;
}
function addPurchase(){
 const available=cards.filter(c=>c.active);
 if(!available.length){setStatus('Cadastre um cartão ativo antes de registrar compras.');return}
 const opts=available.map(c=>`<option value="${c.id}">${escape(c.label)}</option>`).join('');
 const form=makeModal('Registrar compra no cartão',label('Cartão',`<select name="card_id">${opts}</select>`)+label('Descrição',input('description','text','maxlength="160" placeholder="Ex.: Mercado"'))+label('Categoria',`<select name="category"><option>Alimentação</option><option>Moradia</option><option>Transporte</option><option>Saúde</option><option>Educação</option><option>Lazer</option><option>Vestuário</option><option>Outros</option></select>`)+label('Data da compra',input('purchased_on','date'))+label('Valor total',input('total_amount','number','min="0.01" step="0.01"'))+label('Quantidade de parcelas',input('installment_count','number','min="1" max="60" value="1"'))+label('Classificação',`<select name="expense_scope"><option value="common">Despesa comum (50/50)</option><option value="individual">Despesa individual</option></select>`),async f=>{
  const card=available.find(c=>c.id===f.get('card_id'));if(!card)throw Error('Cartão inválido.');
  const total=Number(f.get('total_amount')),count=Number(f.get('installment_count')),day=f.get('purchased_on');
  if(!day||!Number.isInteger(count)||count<1||count>60||!Number.isFinite(total)||total<=0)throw Error('Confira a data, o valor e as parcelas.');
  if(Math.round(total*100)<count)throw Error('O valor é pequeno demais para a quantidade de parcelas.');
  const data={household_id:C.householdId,card_id:card.id,created_by:currentUser.id,description:String(f.get('description')).trim(),category:f.get('category'),purchased_on:day,total_amount:total,installment_count:count,expense_scope:f.get('expense_scope')};
  if(!data.description)throw Error('Informe a descrição.');
  const {data:purchase,error}=await sb.from('card_purchases').insert(data).select('id').single();if(error)throw error;
  const rows=installmentDraft(purchase.id,C.householdId,total,count,day,card);
  const result=await sb.from('card_installments').insert(rows);
  if(result.error){
    const cleanup=await sb.from('card_purchases').delete().eq('id',purchase.id).eq('household_id',C.householdId);
    throw Error('Falha ao criar parcelas. '+result.error.message+(cleanup.error?' A compra pode ter ficado sem parcelas; confira no Supabase.':''));
  }
 });
 form.elements.purchased_on.value=new Date().toLocaleDateString('en-CA');return form;
}
async function onReady(){
 const {data:{user}}=await sb.auth.getUser();if(!user)return;
 currentUser=user;setStatus('');try{await fetchAll()}catch(e){setStatus('Falha ao carregar cartões: '+e.message)}
}
el('addCardBtn').addEventListener('click',addCard);
el('addPurchaseBtn').addEventListener('click',addPurchase);
window.addEventListener('pfc:ready',onReady);
})();
