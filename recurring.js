(()=>{'use strict';
const $=id=>document.getElementById(id), sb=window.PFC_SB, C=window.PFC_CONFIG;
if(!sb||!C||!$('recurringList')){console.error('PFC: dependencias do modulo recorrente ausentes');return;}
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthStart=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
const parseMonth=s=>new Date(Number(s.slice(0,4)),Number(s.slice(5,7))-1,1);
const monthLabel=s=>parseMonth(s).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const formatDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('pt-BR')};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateDue=(period,day)=>{const d=parseMonth(period),last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return `${period.slice(0,7)}-${String(Math.min(Number(day),last)).padStart(2,'0')}`};
const addMonths=(period,offset)=>{const d=parseMonth(period);d.setMonth(d.getMonth()+offset);return monthStart(d)};
let recurring=[],payments=[],reversals=[],userId=null,period=monthStart(new Date()),busy=false;
function message(s,error=false){$('recurringMessage').textContent=s;$('recurringMessage').style.color=error?'#bd3447':'#256a55';}
function eligible(r,p){return r.start_month<=p&&(r.frequency==='monthly'||r.start_month.slice(5,7)===p.slice(5,7));}
function paid(r,p){return payments.find(x=>x.recurring_id===r.id&&x.period_month===p&&!x.reversed_at)};
function status(r,p){if(paid(r,p))return 'paid';const due=dateDue(p,r.due_day),now=today();return due<now?'late':due===now?'today':'future';}
function owner(id){return C.members?.[id]||'Membro'}
function uiStatus(r,p){const st=status(r,p),date=dateDue(p,r.due_day);return `<span class="rec-badge rec-${st}">${st==='paid'?'Pago':st==='late'?'Vencido':st==='today'?'Vence hoje':'Previsto'}</span><small class="rec-due">Vencimento: ${formatDate(date)}</small>`}
function optionsMembers(){return Object.entries(C.members||{}).map(([uid,n])=>`<option value="${esc(uid)}">${esc(n)}</option>`).join('')}
async function load(){const {data:{user}}=await sb.auth.getUser();if(!user)return;userId=user.id;
 const [r,p,rv]=await Promise.all([
  sb.from('recurring_expenses').select('id,household_id,created_by,description,category,amount,payer_user_id,expense_scope,frequency,due_day,start_month,active').eq('household_id',C.householdId).order('description'),
  sb.from('recurring_payments').select('id,recurring_id,period_month,paid_by,paid_on,amount,transaction_id,created_by,reversed_at,reversed_by').eq('household_id',C.householdId).order('period_month',{ascending:false}),
  sb.from('recurring_payment_reversals').select('recurring_payment_id,reason,reversed_by,reversed_at,original_amount').eq('household_id',C.householdId)
 ]);
 if(r.error)throw r.error;if(p.error)throw p.error;if(rv.error)throw rv.error;recurring=r.data||[];payments=p.data||[];reversals=rv.data||[];
 render();
}
function render(){
 const rows=recurring.filter(r=>eligible(r,period)).sort((a,b)=>Number(b.active)-Number(a.active));
 $('recurringList').innerHTML=rows.length?rows.map(r=>{const settled=paid(r,period);const canEdit=r.created_by===userId;const history=payments.filter(x=>x.recurring_id===r.id&&x.period_month===period).sort((a,b)=>String(b.reversed_at||b.id).localeCompare(String(a.reversed_at||a.id)));
 return `<div class="rec-item"><div class="rec-main"><div class="rec-top"><strong>${esc(r.description)}</strong>${r.active?uiStatus(r,period):'<span class="rec-badge rec-off">Desativada</span>'}</div><div class="rec-meta">${esc(r.category)} · ${r.frequency==='monthly'?'Mensal':'Anual'} · ${r.expense_scope==='common'?'Comum 50/50':'Individual'} · Pagador previsto: ${esc(owner(r.payer_user_id))}</div></div><div class="rec-right"><strong>${brl(r.amount)}</strong><div class="rec-actions">${settled?`<span class="rec-paid-note">Pago por ${esc(owner(settled.paid_by))} em ${formatDate(settled.paid_on)}</span>`:r.active?`<button type="button" class="primary-btn rec-action" data-pay="${r.id}">Registrar pagamento</button>`:''}${settled&&settled.created_by===userId?`<button type="button" class="outline-btn rec-action rec-reverse-btn" data-reverse="${settled.id}">Estornar pagamento</button>`:''}${canEdit?`<button type="button" class="outline-btn rec-action" data-edit="${r.id}">Editar</button><button type="button" class="outline-btn rec-action" data-toggle="${r.id}">${r.active?'Desativar':'Reativar'}</button>`:''}</div></div>${history.length?`<details class="rec-history"><summary>Histórico da competência (${history.length})</summary>${history.map(h=>{const audit=reversals.find(z=>z.recurring_payment_id===h.id);return `<div class="rec-history-line"><div><strong>${brl(h.amount)}</strong> · ${formatDate(h.paid_on)} · ${esc(owner(h.paid_by))}<small>Registrado por ${esc(owner(h.created_by))}</small>${audit?`<small>Estornado por ${esc(owner(audit.reversed_by))} em ${new Date(audit.reversed_at).toLocaleString('pt-BR')} · Motivo: ${esc(audit.reason)}</small>`:''}</div><span class="rec-badge ${h.reversed_at?'rec-off':'rec-paid'}">${h.reversed_at?'Estornado':'Ativo'}</span></div>`}).join('')}</details>`:''}</div>`
 }).join(''):'<p class="rec-empty">Nenhuma conta recorrente programada para este mês. Cadastre uma conta fixa ou escolha outro período.</p>';
 let overdue=0, dueSoon=0, outstanding=0;
 const start=monthStart(new Date());
 for(const r of recurring.filter(x=>x.active))for(let i=-11;i<=0;i++){
  const p=addMonths(start,i);if(!eligible(r,p)||paid(r,p))continue;
  const due=dateDue(p,r.due_day),now=today();if(due<now){overdue++;outstanding+=Number(r.amount)}
  else if(due===now || (new Date(due+'T12:00:00')-new Date(now+'T12:00:00'))/86400000<=5){dueSoon++}
 }
 $('recurringOverdue').textContent=String(overdue);
 $('recurringUpcoming').textContent=String(dueSoon);
 $('recurringDueTotal').textContent=brl(outstanding);
 $('recurringPeriodLabel').textContent=monthLabel(period);
 $('recurringPeriod').value=period.slice(0,7);
}
function editForm(id){const r=recurring.find(x=>x.id===id);if(!r)return;if(r.created_by!==userId){message('Somente quem criou esta conta pode alterá-la.',true);return}
 const f=$('recurringForm');f.elements.recurringId.value=r.id;
 f.elements.description.value=r.description;f.elements.amount.value=Number(r.amount);f.elements.category.value=r.category;
 f.elements.payer.value=r.payer_user_id;f.elements.expenseScope.value=r.expense_scope;
 f.elements.frequency.value=r.frequency;f.elements.dueDay.value=r.due_day;
 f.elements.startMonth.value=r.start_month.slice(0,7);
 $('recurringFormTitle').textContent='Editar conta recorrente';$('recurringEditor').hidden=false;
 $('recurringEditor').scrollIntoView({block:'start',behavior:'smooth'});
}
function newForm(){const f=$('recurringForm');f.reset();f.elements.recurringId.value='';f.elements.startMonth.value=monthStart(new Date()).slice(0,7);f.elements.payer.value=userId;f.elements.dueDay.value=10;
 $('recurringFormTitle').textContent='Nova conta recorrente';$('recurringEditor').hidden=false;
 $('recurringEditor').scrollIntoView({block:'start',behavior:'smooth'});
}
async function save(e){e.preventDefault();if(busy)return;busy=true;const f=e.target, b=f.querySelector('[type=submit]');b.disabled=true;
 try{const v=f.elements;const amount=Number(v.amount.value);const start=v.startMonth.value;
 if(!start||!Number.isFinite(amount)||amount<=0)throw Error('Informe valor e mês inicial válidos.');
 const row={description:v.description.value.trim(),amount,category:v.category.value,payer_user_id:v.payer.value,expense_scope:v.expenseScope.value,frequency:v.frequency.value,due_day:Number(v.dueDay.value),start_month:start+'-01'};
 if(!row.description)throw Error('Informe a descrição da conta.');
 const id=v.recurringId.value;
 if(id){const {data,error}=await sb.from('recurring_expenses').update(row).eq('id',id).eq('household_id',C.householdId).eq('created_by',userId).select('id');if(error)throw error;if(!data?.length)throw Error('Alteração não confirmada; confira a autoria e permissões.');}
 else {const {error}=await sb.from('recurring_expenses').insert({...row,household_id:C.householdId,created_by:userId});if(error)throw error;}
 $('recurringEditor').hidden=true;await load();message(id?'Conta atualizada. Pagamentos antigos foram preservados.':'Conta recorrente cadastrada. A despesa só será lançada ao registrar pagamento.');
 }catch(error){message(error.message||'Não foi possível salvar.',true)}finally{busy=false;b.disabled=false;}
}
async function toggle(id){const r=recurring.find(x=>x.id===id);if(!r||r.created_by!==userId)return;
 const verb=r.active?'desativar':'reativar';if(!confirm(`Deseja ${verb} ${r.description}? Os pagamentos anteriores serão preservados.`))return;
 const {data,error}=await sb.from('recurring_expenses').update({active:!r.active}).eq('id',id).eq('household_id',C.householdId).eq('created_by',userId).select('id');
 if(error||!data?.length){message(error?.message||'Não foi possível atualizar a conta.',true);return}await load();message('Situação da conta atualizada.');
}
function openReversal(id){
 const pay=payments.find(p=>p.id===id);
 if(!pay||pay.reversed_at||pay.created_by!==userId){message('Somente o autor pode estornar um pagamento ativo.',true);return}
 const r=recurring.find(x=>x.id===pay.recurring_id);if(!r)return;
 const f=$('recurringReversalForm');f.elements.paymentId.value=pay.id;f.elements.reason.value='';
 $('recurringReversalSummary').textContent=`${r.description} · ${monthLabel(pay.period_month)} · ${brl(pay.amount)}. Este pagamento deixará de contar no extrato e no acerto 50/50. Transferências de acerto já realizadas não serão alteradas.`;
 $('recurringReversalEditor').hidden=false;
 $('recurringReversalEditor').scrollIntoView({block:'start',behavior:'smooth'});
}
async function submitReversal(e){e.preventDefault();if(busy)return;
 const f=e.target,id=f.elements.paymentId.value,reason=f.elements.reason.value.trim();
 const pay=payments.find(p=>p.id===id);
 if(!pay||pay.reversed_at||pay.created_by!==userId){message('Pagamento não autorizado ou já estornado.',true);return}
 if(reason.length<8||reason.length>500){message('Informe motivo com 8 a 500 caracteres.',true);return}
 if(!confirm(`Confirma o estorno de ${brl(pay.amount)}? O histórico será preservado e o acerto recalculado. Transferências já feitas não serão canceladas.`))return;
 busy=true;const button=f.querySelector('[type=submit]');button.disabled=true;
 try{
  const {error}=await sb.rpc('pfc_reverse_recurring_payment',{p_payment_id:id,p_reason:reason});if(error)throw error;
  $('recurringReversalEditor').hidden=true;
  await load();window.dispatchEvent(new Event('pfc:invoicePaid'));
  message('Pagamento estornado com auditoria. A competência está liberada para novo pagamento.');
 }catch(err){await load().catch(()=>{});message(err.message||'Falha ao estornar.',true)}
 finally{busy=false;button.disabled=false}
}
function markPaid(id){const r=recurring.find(x=>x.id===id);if(!r||paid(r,period)||!r.active)return;
 const f=$('recurringPaymentForm');f.elements.recurringId.value=r.id;f.elements.paidOn.value=today();f.elements.paidBy.innerHTML=optionsMembers();f.elements.paidBy.value=r.payer_user_id;
 $('recurringPaymentSummary').textContent=`${r.description} · ${monthLabel(period)} · ${brl(r.amount)} · ${r.expense_scope==='common'?'Despesa comum 50/50':'Despesa individual'}. O pagamento será registrado no extrato.`;
 $('recurringPaymentEditor').hidden=false;
 $('recurringPaymentEditor').scrollIntoView({block:'start',behavior:'smooth'});
}
async function submitPayment(e){e.preventDefault();if(busy)return;
 const f=e.target,id=f.elements.recurringId.value,r=recurring.find(x=>x.id===id),paidOn=f.elements.paidOn.value,paidBy=f.elements.paidBy.value;
 if(!r||paid(r,period)||!r.active){message('Pagamento já registrado ou conta desativada. Atualize a lista.',true);return}
 if(!paidOn||!paidBy){message('Preencha a data e o pagador.',true);return}
 busy=true;const b=f.querySelector('[type=submit]');b.disabled=true;message('Registrando pagamento...');
 try{const {error}=await sb.rpc('pfc_pay_recurring',{p_recurring_id:id,p_period_month:period,p_paid_on:paidOn,p_paid_by:paidBy});if(error)throw error;
  $('recurringPaymentEditor').hidden=true;
  await load();window.dispatchEvent(new Event('pfc:invoicePaid'));message('Pagamento confirmado. Extrato e acerto serão atualizados.');
 }catch(err){await load().catch(()=>{});message(err.message||'Não foi possível registrar pagamento.',true)}finally{busy=false;b.disabled=false}
}
$('recurringPeriod').value=period.slice(0,7);
$('recurringPeriod').addEventListener('change',e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){period=e.target.value+'-01';render()}});
$('newRecurring').addEventListener('click',newForm);
$('recurringCancelEdit').addEventListener('click',()=>{$('recurringEditor').hidden=true});
$('recurringForm').addEventListener('submit',save);
$('recurringPaymentForm').addEventListener('submit',submitPayment);
$('recurringReversalForm').addEventListener('submit',submitReversal);
$('recurringCancelReversal').addEventListener('click',()=>{$('recurringReversalEditor').hidden=true});
$('recurringCancelPayment').addEventListener('click',()=>{$('recurringPaymentEditor').hidden=true});
$('recurringList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.pay)markPaid(b.dataset.pay);else if(b.dataset.reverse)openReversal(b.dataset.reverse);else if(b.dataset.edit)editForm(b.dataset.edit);else if(b.dataset.toggle)toggle(b.dataset.toggle)});
$('recurringRefresh').addEventListener('click',()=>load().catch(err=>message(err.message,true)));
$('recurringForm').elements.payer.innerHTML=optionsMembers();
window.addEventListener('pfc:ready',()=>load().catch(err=>message('Erro ao carregar: '+err.message,true)));
})();
