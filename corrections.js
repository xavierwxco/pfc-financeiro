(()=>{'use strict';
const C=window.PFC_CONFIG, sb=window.PFC_SB;
if(!C||!sb){console.error('PFC Correcoes: dependencias ausentes');return;}
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
let manual=[], users=C.members||{};
const panel=document.createElement('article');panel.className='panel';panel.style.marginTop='16px';
panel.innerHTML='<div class="panel-head"><div><h2>Corrigir lançamentos manuais</h2><p>Compras e pagamentos de cartão não são editáveis aqui.</p></div><button type="button" class="outline-btn" id="editRefresh">Atualizar lista</button></div><div id="editMessage" role="status"></div><div class="table-scroll"><table><thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>PAGADOR</th><th class="right">VALOR</th><th>AÇÃO</th></tr></thead><tbody id="editRows"></tbody></table></div><details style="margin-top:18px"><summary>Histórico das alterações</summary><div id="editHistory"></div></details>';
const container=$('view-transactions');if(!container){console.error('PFC Correcoes: area de lancamentos ausente');return;}container.appendChild(panel);
const overlay=document.createElement('div');overlay.className='modal-backdrop';overlay.id='editModal';
overlay.innerHTML=`<form class="modal" id="editForm"><div class="modal-head"><h2>Editar lançamento manual</h2><button type="button" id="editClose" class="close-btn">×</button></div><input name="id" type="hidden"><label>Descrição<input name="description" required maxlength="200"></label><div class="form-row"><label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Data<input name="transaction_date" type="date" required></label></div><div class="form-row"><label>Tipo<select name="type"><option value="expense">Despesa</option><option value="income">Receita</option></select></label><label>Classificação<select name="expense_scope"><option value="common">Comum (50/50)</option><option value="individual">Individual</option></select></label></div><div class="form-row"><label>Categoria<input name="category" required maxlength="100"></label><label>Quem pagou<select name="person_user_id"></select></label></div><div role="alert" id="editError" style="color:#b42318"></div><div class="modal-actions"><button type="button" class="outline-btn" id="editCancel">Cancelar</button><button type="submit" class="primary-btn" id="editSave">Salvar correção</button></div></form>`;
document.body.appendChild(overlay);
const form=$('editForm');form.elements.person_user_id.innerHTML=Object.entries(users).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
const close=()=>overlay.classList.remove('open');$('editClose').onclick=close;$('editCancel').onclick=close;
overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
form.elements.type.addEventListener('change',()=>{if(form.elements.type.value==='income')form.elements.expense_scope.value='individual';});
async function refresh(){
 const {data:{user}}=await sb.auth.getUser();if(!user){$('editMessage').textContent='Entre na sua conta para editar.';return;}
 const {data,error}=await sb.from('transactions').select('id,description,category,transaction_date,type,amount,person_user_id,expense_scope,card_installment_id,invoice_payment_allocation_id,updated_at').eq('household_id',C.householdId).is('card_installment_id',null).is('invoice_payment_allocation_id',null).order('transaction_date',{ascending:false}).limit(300);
 if(error){$('editMessage').textContent='Não foi possível carregar lançamentos: '+error.message;return;}
 manual=data||[];
 $('editRows').innerHTML=manual.map(t=>`<tr><td>${esc(t.transaction_date)}</td><td>${esc(t.description)}</td><td>${esc(users[t.person_user_id]||'Membro')}</td><td class="right">${brl(t.amount)}</td><td><button type="button" class="outline-btn" data-edit-id="${esc(t.id)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5">Nenhum lançamento manual encontrado.</td></tr>';
 $('editMessage').textContent=`${manual.length} lançamento(s) manual(is) listado(s).`;
 const h=await sb.from('transaction_edit_history').select('edited_at,edited_by,previous_data,updated_data').eq('household_id',C.householdId).order('edited_at',{ascending:false}).limit(30);
 $('editHistory').innerHTML=h.error?`<p>${esc(h.error.message)}</p>`:(h.data||[]).map(e=>`<p><small>${new Date(e.edited_at).toLocaleString('pt-BR')} — ${esc(users[e.edited_by]||'Administrador')}:</small> ${esc(e.previous_data.description||'')} (${brl(e.previous_data.amount)}) → ${esc(e.updated_data.description||'')} (${brl(e.updated_data.amount)})</p>`).join('')||'<p>Nenhuma alteração registrada.</p>';
}
$('editRefresh').addEventListener('click',refresh);
panel.addEventListener('click',e=>{const id=e.target.closest('[data-edit-id]')?.dataset.editId;if(!id)return;const t=manual.find(x=>x.id===id);if(!t)return;
form.elements.id.value=t.id;for(const k of ['description','category','transaction_date','type','amount','person_user_id','expense_scope'])form.elements[k].value=t[k];$('editError').textContent='';overlay.classList.add('open');});
form.addEventListener('submit',async e=>{e.preventDefault();$('editSave').disabled=true;$('editError').textContent='';try{
 const id=form.elements.id.value,old=manual.find(x=>x.id===id);if(!old)throw Error('Lançamento não encontrado.');
 const update={description:form.elements.description.value.trim(),amount:Number(form.elements.amount.value),transaction_date:form.elements.transaction_date.value,type:form.elements.type.value,expense_scope:form.elements.type.value==='income'?'individual':form.elements.expense_scope.value,category:form.elements.category.value.trim(),person_user_id:form.elements.person_user_id.value};
 if(!update.description||!update.category||!Number.isFinite(update.amount)||update.amount<=0)throw Error('Confira os campos antes de salvar.');
 const {data,error}=await sb.from('transactions').update(update).eq('id',id).eq('household_id',C.householdId).eq('updated_at',old.updated_at||'1970-01-01').select('id');
 if(error)throw error;
 // Se o projeto não devolveu a coluna de controle, mantenha o comportamento explícito.
 if(!data?.length)throw Error('Registro não atualizado. Recarregue os dados antes de tentar novamente.');
 close();window.location.reload();
 }catch(err){$('editError').textContent='Não foi possível salvar: '+err.message;}finally{$('editSave').disabled=false;}});
window.addEventListener('pfc:ready',refresh);
})();
