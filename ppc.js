/* PFC 5.0.1 — PPC pessoal. Sem alterações nos lançamentos financeiros do PFC. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const sb=window.PFC_SB, config=window.PFC_CONFIG;
 const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
 const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 const defaultCategories={expense:['Moradia','Comunicação','Alimentação','Saúde','Vestuário','Transporte','Educação','Lazer','Pet','Outros'],income:['Salário','13º salário','Férias','Missão / Curso','Azulzin','Investimento — venda de imóveis','Outros']};
 let owner=null,entries=[],categories={income:[],expense:[]},editId=null,loadEpoch=0,ownShares=new Set(),familyShares=[],payrollLinked=new Set();
 const message=msg=>{if($('ppcMessage'))$('ppcMessage').textContent=msg||''};
 function clear(){loadEpoch++;owner=null;entries=[];ownShares=new Set();familyShares=[],payrollLinked=new Set();categories={income:[],expense:[]};editId=null;message('');if($('ppcRows'))$('ppcRows').innerHTML='<tr><td colspan="5">Entre com sua conta para visualizar sua carteira.</td></tr>';for(const id of ['ppcIncome','ppcExpense','ppcBalance'])if($(id))$(id).textContent=brl(0);$('ppcModal')?.classList.remove('open');if($('ppcFamilyRows'))$('ppcFamilyRows').innerHTML='<tr><td colspan="5">Entre com sua conta.</td></tr>';if($('ppcDashRows'))$('ppcDashRows').innerHTML='<tr><td colspan="5">Entre com sua conta.</td></tr>';}
 async function init(){const epoch=++loadEpoch;const user=window.PFC_CURRENT_USER;if(!user?.id||!config?.householdId)return;owner=user.id;message('Carregando sua carteira privada…');
 try{
  const {data:w,error:we}=await sb.from('ppc_wallets').select('user_id,household_id').eq('user_id',owner).maybeSingle();if(we)throw we;
  if(!w){const {error:ce}=await sb.from('ppc_wallets').insert({user_id:owner,household_id:config.householdId});if(ce&&ce.code!=='23505')throw ce;}
  const [t,c,s,linked]=await Promise.all([
    sb.from('ppc_transactions').select('id,entry_date,kind,description,category,amount,notes').eq('owner_user_id',owner).order('entry_date',{ascending:false}),
    sb.from('pfc_categories').select('kind,name').eq('household_id',config.householdId).eq('active',true).order('sort_order',{ascending:true}),
    sb.from('ppc_shares').select('transaction_id,owner_user_id,entry_date,kind,description,category,amount').eq('household_id',config.householdId).order('entry_date',{ascending:false}),
    sb.from('ppc_payroll_wallet_links').select('transaction_id').eq('owner_user_id',owner)
  ]);
  if(t.error)throw t.error;if(c.error)throw c.error;if(s.error)throw s.error;if(linked.error)throw linked.error;if(epoch!==loadEpoch||owner!==user.id)return;
  entries=t.data||[];familyShares=s.data||[];payrollLinked=new Set((linked.data||[]).map(x=>x.transaction_id));ownShares=new Set(familyShares.filter(x=>x.owner_user_id===owner).map(x=>x.transaction_id));renderShares();categories={income:[],expense:[]};for(const x of c.data||[])if(categories[x.kind])categories[x.kind].push(x.name);
  message('');render();
 }catch(e){if(epoch===loadEpoch)message('Falha ao carregar PPC: '+(e.message||'verifique o SQL de instalação.'));}
 }
 function chooseCategories(){const kind=$('ppcKind').value;const select=$('ppcCategory');const current=select.value;const options=[...new Set((categories[kind]?.length?categories[kind]:defaultCategories[kind]))];if(editId){const row=entries.find(x=>x.id===editId);if(row?.kind===kind&&!options.includes(row.category))options.unshift(row.category);}select.innerHTML='';for(const name of options){const op=document.createElement('option');op.value=name;op.textContent=name;select.append(op);}if(options.includes(current))select.value=current;}
 function render(){if(!owner)return;const period=$('ppcPeriod').value;const subset=entries.filter(x=>!period||x.entry_date.slice(0,7)===period),income=subset.filter(x=>x.kind==='income').reduce((a,x)=>a+Number(x.amount),0),expense=subset.filter(x=>x.kind==='expense').reduce((a,x)=>a+Number(x.amount),0);$('ppcIncome').textContent=brl(income);$('ppcExpense').textContent=brl(expense);$('ppcBalance').textContent=brl(income-expense);renderShares();
 $('ppcRows').innerHTML=subset.length?subset.map(x=>`<tr><td>${escapeHtml(x.entry_date.split('-').reverse().join('/'))}</td><td>${escapeHtml(x.description)}</td><td><span class="ppc-kind">${x.kind==='income'?'Receita':'Despesa'}</span><div>${escapeHtml(x.category)}</div></td><td class="right">${x.kind==='income'?'+':'−'} ${brl(x.amount)}</td><td><span class="ppc-share-status">${ownShares.has(x.id)?'Visível para família':'Somente meu PPC'}</span><div class="ppc-row-actions"><button type="button" class="ppc-share-btn ${ownShares.has(x.id)?'is-shared':''}" data-ppc-share="${x.id}">${ownShares.has(x.id)?'Tornar privado':'Compartilhar'}</button>${payrollLinked.has(x.id)?'<small>Vinculado ao contracheque · protegido</small>':`<button type="button" data-ppc-edit="${x.id}">Editar</button><button type="button" data-ppc-delete="${x.id}">Excluir</button>`}</div></td></tr>`).join(''):'<tr><td colspan="5">Nenhum lançamento pessoal neste período.</td></tr>';
 }

 function renderShares(){const rows=$('ppcFamilyRows');if(!rows)return;
  const period=$('ppcPeriod')?.value||'';
  const list=familyShares.filter(x=>!period||x.entry_date.slice(0,7)===period);
  const status=$('ppcShareStatus');if(status)status.textContent=`${list.length} lançamento(s) compartilhado(s) neste período. Não participam do acerto familiar.`;
  rows.innerHTML=list.length?list.map(x=>`<tr><td>${escapeHtml(x.entry_date.split('-').reverse().join('/'))}</td><td>${escapeHtml(x.description)}</td><td>${x.owner_user_id===owner?'Você':'Outro membro da família'}</td><td>${x.kind==='income'?'Receita':'Despesa'} · ${escapeHtml(x.category)}</td><td class="right">${x.kind==='income'?'+':'−'} ${brl(x.amount)}</td></tr>`).join(''):'<tr><td colspan="5">Nenhum lançamento foi compartilhado neste período.</td></tr>';
  const dash=$('ppcDashRows');
  if(dash)dash.innerHTML=familyShares.length?familyShares.slice(0,12).map(x=>`<tr><td>${escapeHtml(x.entry_date.split('-').reverse().join('/'))}</td><td>${escapeHtml(x.description)}</td><td>${x.owner_user_id===owner?'Você':'Outro membro da família'}</td><td>${x.kind==='income'?'Receita':'Despesa'} · ${escapeHtml(x.category)}</td><td class="right">${x.kind==='income'?'+':'−'} ${brl(x.amount)}</td></tr>`).join(''):'<tr><td colspan="5">Nenhum lançamento PPC compartilhado com a família.</td></tr>';
 }
 async function toggleShare(id){if(!owner)return;const x=entries.find(e=>e.id===id);if(!x)return;
  const share=!ownShares.has(id);
  if(!confirm(share?`Compartilhar com a família a descrição, categoria, data e valor de "${x.description}" (${brl(x.amount)})? Não entrará no acerto 50/50.`:`Retirar "${x.description}" dos compartilhamentos da família? O histórico de auditoria permanecerá.`))return;
  const button=$('ppcRows')?.querySelector(`[data-ppc-share="${id}"]`);if(button)button.disabled=true;
  try{const {error}=await sb.rpc('ppc_set_share',{p_transaction_id:id,p_share:share});if(error)throw error;await init();message(share?'Compartilhado com a família, sem alterar o acerto 50/50.':'Lançamento voltou a ser privado.');}
  catch(e){message('Não foi possível atualizar o compartilhamento: '+e.message);if(button)button.disabled=false;}
 }
 function open(id){if(id&&payrollLinked.has(id)){message('Receita vinculada a contracheque confirmado. Não pode ser editada pela carteira.');return;}message('');editId=id||null;$('ppcModalTitle').textContent=id?'Editar lançamento pessoal':'Novo lançamento pessoal';$('ppcForm').reset();$('ppcForm').elements.entry_date.value=today();if(id){const x=entries.find(e=>e.id===id);if(!x)return;for(const field of ['description','kind','amount','entry_date','notes'])$('ppcForm').elements[field].value=x[field]??'';chooseCategories();$('ppcForm').elements.category.value=x.category;}else chooseCategories();$('ppcModal').classList.add('open');}
 function close(){$('ppcModal').classList.remove('open');editId=null;}
 async function save(ev){ev.preventDefault();if(!owner)return;const button=$('ppcSubmit');button.disabled=true;message('');try{const form=$('ppcForm').elements;const payload={description:form.description.value.trim(),kind:form.kind.value,category:form.category.value,amount:Number(form.amount.value),entry_date:form.entry_date.value,notes:form.notes.value.trim()||null};if(!Number.isFinite(payload.amount)||payload.amount<=0)throw new Error('Informe um valor positivo.');if(payload.description.length<2)throw new Error('Descrição muito curta.');let result;if(editId){result=await sb.from('ppc_transactions').update(payload).eq('owner_user_id',owner).eq('id',editId).select('id').maybeSingle();if(!result.error&&!result.data)throw new Error('Nenhum lançamento alterado.');}else{result=await sb.from('ppc_transactions').insert({...payload,owner_user_id:owner}).select('id').single();}if(result.error)throw result.error;close();await init();}catch(e){message('Não foi possível salvar: '+e.message);}finally{button.disabled=false;}}
 async function remove(id){if(payrollLinked.has(id)){message('Receita de contracheque protegida contra exclusão.');return;}const x=entries.find(e=>e.id===id);if(!x||!owner)return;if(!confirm(`Excluir o lançamento pessoal "${x.description}" de ${brl(x.amount)}? Esta ação fica registrada em auditoria.`))return;try{const {error,data}=await sb.from('ppc_transactions').delete().eq('owner_user_id',owner).eq('id',id).select('id');if(error)throw error;if(!data?.length)throw new Error('Registro não encontrado ou sem permissão.');await init();}catch(e){message('Não foi possível excluir: '+e.message);}}
 const nav=document.querySelector('[data-view="ppc"]');nav?.addEventListener('click',()=>{if($('pageTitle'))$('pageTitle').textContent='Minha carteira pessoal';if($('pageSubtitle'))$('pageSubtitle').textContent='Receitas e despesas visíveis somente para você.';if($('pageSectionBadge'))$('pageSectionBadge').textContent='PPC · ÁREA PRIVADA';if(owner)render();});
 $('ppcNewButton')?.addEventListener('click',()=>open(null));$('ppcPeriod')?.addEventListener('change',render);$('ppcKind')?.addEventListener('change',chooseCategories);$('ppcModalClose')?.addEventListener('click',close);$('ppcModalCancel')?.addEventListener('click',close);$('ppcForm')?.addEventListener('submit',save);$('ppcModal')?.addEventListener('click',e=>{if(e.target===$('ppcModal'))close()});
 $('ppcRefreshShares')?.addEventListener('click',()=>void init());$('ppcDashRefresh')?.addEventListener('click',()=>void init());
 $('ppcRows')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ppcShare)void toggleShare(b.dataset.ppcShare);if(b.dataset.ppcEdit)open(b.dataset.ppcEdit);if(b.dataset.ppcDelete)void remove(b.dataset.ppcDelete);});
 $('ppcPeriod').value=today().slice(0,7);
 window.addEventListener('pfc:ready',()=>{clear();void init();});
 window.addEventListener('ppc:wallet-changed',()=>void init());
 sb?.auth?.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')clear();});
})();
