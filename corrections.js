(()=>{'use strict';
const C=window.PFC_CONFIG, sb=window.PFC_SB;
if(!C||!sb){console.error('PFC Correções: dependências ausentes');return;}
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const users=C.members||{};
let manual=[], currentUserId=null, busy=false;
const container=$('view-transactions');if(!container){console.error('PFC Correções: área de lançamentos ausente');return;}
const existing=$('editPanel');if(existing)existing.remove();
const panel=document.createElement('article');panel.className='panel';panel.id='editPanel';panel.style.marginTop='16px';
panel.innerHTML=`<div class="panel-head"><div><h2>Corrigir lançamentos manuais</h2><p>Os dois veem os lançamentos, mas cada pessoa edita somente os que cadastrou. Pagamentos de cartões não são editáveis aqui.</p></div><button type="button" class="outline-btn" id="editRefresh">Atualizar lista</button></div><p id="editMessage" role="status" aria-live="polite"></p><div class="table-scroll"><table><thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>CADASTRADO POR</th><th>QUEM PAGOU</th><th class="right">VALOR</th><th>AÇÃO</th></tr></thead><tbody id="editRows"></tbody></table></div><details style="margin-top:18px"><summary>Histórico das alterações</summary><div id="editHistory"></div></details>`;
container.appendChild(panel);
const prevModal=$('editModal');if(prevModal)prevModal.remove();
const overlay=document.createElement('div');overlay.className='modal-backdrop';overlay.id='editModal';
overlay.innerHTML=`<form class="modal" id="editForm"><div class="modal-head"><h2>Corrigir lançamento manual</h2><button type="button" id="editClose" class="close-btn">×</button></div><input name="id" type="hidden"><label>Descrição<input name="description" required maxlength="200"></label><div class="form-row"><label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Data<input name="transaction_date" type="date" required></label></div><div class="form-row"><label>Tipo<select name="type"><option value="expense">Despesa</option><option value="income">Receita</option></select></label><label>Classificação<select name="expense_scope"><option value="common">Comum (50/50)</option><option value="individual">Individual</option></select></label></div><div class="form-row"><label>Categoria<input name="category" required maxlength="100"></label><label>Quem pagou<select name="person_user_id"></select></label></div><p role="alert" id="editError" style="color:#b42318;white-space:pre-wrap"></p><div class="modal-actions"><button type="button" class="outline-btn" id="editCancel">Cancelar</button><button type="submit" class="primary-btn" id="editSave">Salvar correção</button></div></form>`;
document.body.appendChild(overlay);
const form=$('editForm');
form.elements.namedItem('person_user_id').innerHTML=Object.entries(users).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
const val=name=>form.elements.namedItem(name);
const close=()=>overlay.classList.remove('open');
$('editClose').onclick=close;$('editCancel').onclick=close;
overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
val('type').addEventListener('change',()=>{if(val('type').value==='income')val('expense_scope').value='individual';});
async function refresh(){
 if(busy)return;
 busy=true;const button=$('editRefresh');button.disabled=true;
 $('editMessage').textContent='Atualizando lançamentos...';
 try{
  const auth=await sb.auth.getUser();if(auth.error)throw auth.error;
  currentUserId=auth.data.user?.id||null;
  if(!currentUserId){manual=[];$('editRows').innerHTML='';$('editMessage').textContent='Entre na sua conta para visualizar os lançamentos.';return;}
  const response=await sb.from('transactions')
   .select('id,created_by,description,category,transaction_date,type,amount,person_user_id,expense_scope,card_installment_id,invoice_payment_allocation_id,updated_at')
   .eq('household_id',C.householdId).is('card_installment_id',null)
   .is('invoice_payment_allocation_id',null)
   .order('transaction_date',{ascending:false}).limit(300);
  if(response.error)throw response.error;
  manual=response.data||[];
  $('editRows').innerHTML=manual.map(t=>{
   const own=t.created_by===currentUserId;
   return `<tr><td>${esc(t.transaction_date)}</td><td>${esc(t.description)}</td><td>${esc(users[t.created_by]||'Outro integrante')}</td><td>${esc(users[t.person_user_id]||'Membro')}</td><td class="right">${brl(t.amount)}</td><td>${own?`<button type="button" class="outline-btn" data-edit-id="${esc(t.id)}">Editar</button>`:'<small>Somente quem cadastrou</small>'}</td></tr>`;
  }).join('')||'<tr><td colspan="6">Nenhum lançamento manual encontrado.</td></tr>';
  $('editMessage').textContent=`${manual.length} lançamento(s) manual(is) listado(s). Você só pode editar os que cadastrou.`;
  const history=await sb.from('transaction_edit_history')
   .select('edited_at,edited_by,previous_data,updated_data')
   .eq('household_id',C.householdId).order('edited_at',{ascending:false}).limit(30);
  if(history.error)throw new Error('Falha ao carregar histórico: '+history.error.message);
  $('editHistory').innerHTML=(history.data||[]).map(e=>`<p><small>${new Date(e.edited_at).toLocaleString('pt-BR')} — ${esc(users[e.edited_by]||'Integrante')}:</small> ${esc(e.previous_data?.description||'')} (${brl(e.previous_data?.amount)}) → ${esc(e.updated_data?.description||'')} (${brl(e.updated_data?.amount)})</p>`).join('')||'<p>Nenhuma alteração registrada.</p>';
 }catch(err){console.error('PFC: erro ao atualizar edições',err);$('editMessage').textContent='Não foi possível atualizar a lista: '+(err.message||String(err));}
 finally{busy=false;button.disabled=false;}
}
$('editRefresh').addEventListener('click',()=>{void refresh();});
panel.addEventListener('click',e=>{
 const id=e.target.closest('[data-edit-id]')?.dataset.editId;if(!id)return;
 const t=manual.find(x=>x.id===id);if(!t||t.created_by!==currentUserId)return;
 for(const k of ['id','description','category','transaction_date','type','amount','person_user_id','expense_scope'])val(k).value=t[k]??'';
 $('editError').textContent='';overlay.classList.add('open');
});
form.addEventListener('submit',async e=>{
 e.preventDefault();const button=$('editSave');button.disabled=true;$('editError').textContent='';
 try{
  const id=val('id').value,old=manual.find(x=>x.id===id);
  if(!old)throw new Error('Lançamento não encontrado. Atualize a lista.');
  const auth=await sb.auth.getUser();if(auth.error)throw auth.error;
  const uid=auth.data.user?.id;
  if(!uid||old.created_by!==uid)throw new Error('Somente quem cadastrou o lançamento pode editá-lo.');
  const update={description:val('description').value.trim(),amount:Number(val('amount').value),transaction_date:val('transaction_date').value,type:val('type').value,expense_scope:val('type').value==='income'?'individual':val('expense_scope').value,category:val('category').value.trim(),person_user_id:val('person_user_id').value};
  if(!update.description||!update.category||!Number.isFinite(update.amount)||update.amount<=0)throw new Error('Confira os campos antes de salvar.');
  // A restrição de autoria existe também no banco (RLS), não apenas na tela.
  let req=sb.from('transactions').update(update).eq('id',id).eq('household_id',C.householdId).eq('created_by',uid);
  // Comparação otimista: compara a versão lida, sem transformar NULL em uma data inventada.
  if(old.updated_at)req=req.eq('updated_at',old.updated_at);
  else req=req.is('updated_at',null);
  const saved=await req.select('id,description,amount,transaction_date,person_user_id,updated_at');
  if(saved.error)throw saved.error;
  if(!saved.data?.length)throw new Error('Nenhuma linha foi atualizada. O lançamento pode ter mudado desde a leitura; clique em Atualizar lista e tente novamente.');
  const verify=await sb.from('transactions').select('id,description,amount,transaction_date').eq('id',id).eq('household_id',C.householdId).single();
  if(verify.error)throw verify.error;
  const changed=verify.data;
  if(changed.description!==update.description||Number(changed.amount)!==update.amount||changed.transaction_date!==update.transaction_date)
   throw new Error('O banco não confirmou o novo valor. Não tente novamente antes de verificar o lançamento.');
  close();await refresh();
  // O app principal já escuta este evento para recarregar os totais do extrato e acerto.
  window.dispatchEvent(new Event('pfc:invoicePaid'));
  $('editMessage').textContent='Alteração salva e confirmada no Supabase. Histórico e valores atualizados.';
 }catch(err){console.error('PFC: falha ao salvar correção',err);$('editError').textContent='Não foi possível salvar: '+(err.message||String(err));}
 finally{button.disabled=false;}
});
window.addEventListener('pfc:ready',()=>{void refresh();});
// Também carrega quando a aba é aberta, mesmo que o evento inicial já tenha ocorrido.
document.querySelectorAll('[data-view="transactions"]').forEach(button=>button.addEventListener('click',()=>{void refresh();}));
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){manual=[];currentUserId=null;$('editRows').innerHTML='';$('editHistory').innerHTML='';}});
// Cobre o caso em que app.js terminou o login antes de este script ser carregado.
sb.auth.getSession().then(({data})=>{if(data.session)void refresh();}).catch(console.error);
})();
