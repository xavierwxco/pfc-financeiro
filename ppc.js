/* PFC 5.0.1 — PPC pessoal. Sem alterações nos lançamentos financeiros do PFC. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const sb=window.PFC_SB, config=window.PFC_CONFIG;
 const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
 const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 const defaultCategories={expense:['Moradia','Comunicação','Alimentação','Saúde','Vestuário','Transporte','Educação','Lazer','Pet','Outros'],income:['Salário','13º salário','Férias','Missão / Curso','Azulzin','Investimento — venda de imóveis','Outros']};
 let owner=null,entries=[],categories={income:[],expense:[]},editId=null,loadEpoch=0;
 const message=msg=>{if($('ppcMessage'))$('ppcMessage').textContent=msg||''};
 function clear(){loadEpoch++;owner=null;entries=[];categories={income:[],expense:[]};editId=null;message('');if($('ppcRows'))$('ppcRows').innerHTML='<tr><td colspan="5">Entre com sua conta para visualizar sua carteira.</td></tr>';for(const id of ['ppcIncome','ppcExpense','ppcBalance'])if($(id))$(id).textContent=brl(0);$('ppcModal')?.classList.remove('open');}
 async function init(){const epoch=++loadEpoch;const user=window.PFC_CURRENT_USER;if(!user?.id||!config?.householdId)return;owner=user.id;message('Carregando sua carteira privada…');
 try{
  const {data:w,error:we}=await sb.from('ppc_wallets').select('user_id,household_id').eq('user_id',owner).maybeSingle();if(we)throw we;
  if(!w){const {error:ce}=await sb.from('ppc_wallets').insert({user_id:owner,household_id:config.householdId});if(ce&&ce.code!=='23505')throw ce;}
  const [t,c]=await Promise.all([
    sb.from('ppc_transactions').select('id,entry_date,kind,description,category,amount,notes').eq('owner_user_id',owner).order('entry_date',{ascending:false}),
    sb.from('pfc_categories').select('kind,name').eq('household_id',config.householdId).eq('active',true).order('sort_order',{ascending:true})
  ]);
  if(t.error)throw t.error;if(c.error)throw c.error;if(epoch!==loadEpoch||owner!==user.id)return;
  entries=t.data||[];categories={income:[],expense:[]};for(const x of c.data||[])if(categories[x.kind])categories[x.kind].push(x.name);
  message('');render();
 }catch(e){if(epoch===loadEpoch)message('Falha ao carregar PPC: '+(e.message||'verifique o SQL de instalação.'));}
 }
 function chooseCategories(){const kind=$('ppcKind').value;const select=$('ppcCategory');const current=select.value;const options=[...new Set((categories[kind]?.length?categories[kind]:defaultCategories[kind]))];if(editId){const row=entries.find(x=>x.id===editId);if(row?.kind===kind&&!options.includes(row.category))options.unshift(row.category);}select.innerHTML='';for(const name of options){const op=document.createElement('option');op.value=name;op.textContent=name;select.append(op);}if(options.includes(current))select.value=current;}
 function render(){if(!owner)return;const period=$('ppcPeriod').value;const subset=entries.filter(x=>!period||x.entry_date.slice(0,7)===period),income=subset.filter(x=>x.kind==='income').reduce((a,x)=>a+Number(x.amount),0),expense=subset.filter(x=>x.kind==='expense').reduce((a,x)=>a+Number(x.amount),0);$('ppcIncome').textContent=brl(income);$('ppcExpense').textContent=brl(expense);$('ppcBalance').textContent=brl(income-expense);
 $('ppcRows').innerHTML=subset.length?subset.map(x=>`<tr><td>${escapeHtml(x.entry_date.split('-').reverse().join('/'))}</td><td>${escapeHtml(x.description)}</td><td><span class="ppc-kind">${x.kind==='income'?'Receita':'Despesa'}</span><div>${escapeHtml(x.category)}</div></td><td class="right">${x.kind==='income'?'+':'−'} ${brl(x.amount)}</td><td><div class="ppc-row-actions"><button type="button" data-ppc-edit="${x.id}">Editar</button><button type="button" data-ppc-delete="${x.id}">Excluir</button></div></td></tr>`).join(''):'<tr><td colspan="5">Nenhum lançamento pessoal neste período.</td></tr>';
 }
 function open(id){message('');editId=id||null;$('ppcModalTitle').textContent=id?'Editar lançamento pessoal':'Novo lançamento pessoal';$('ppcForm').reset();$('ppcForm').elements.entry_date.value=today();if(id){const x=entries.find(e=>e.id===id);if(!x)return;for(const field of ['description','kind','amount','entry_date','notes'])$('ppcForm').elements[field].value=x[field]??'';chooseCategories();$('ppcForm').elements.category.value=x.category;}else chooseCategories();$('ppcModal').classList.add('open');}
 function close(){$('ppcModal').classList.remove('open');editId=null;}
 async function save(ev){ev.preventDefault();if(!owner)return;const button=$('ppcSubmit');button.disabled=true;message('');try{const form=$('ppcForm').elements;const payload={description:form.description.value.trim(),kind:form.kind.value,category:form.category.value,amount:Number(form.amount.value),entry_date:form.entry_date.value,notes:form.notes.value.trim()||null};if(!Number.isFinite(payload.amount)||payload.amount<=0)throw new Error('Informe um valor positivo.');if(payload.description.length<2)throw new Error('Descrição muito curta.');let result;if(editId){result=await sb.from('ppc_transactions').update(payload).eq('owner_user_id',owner).eq('id',editId).select('id').maybeSingle();if(!result.error&&!result.data)throw new Error('Nenhum lançamento alterado.');}else{result=await sb.from('ppc_transactions').insert({...payload,owner_user_id:owner}).select('id').single();}if(result.error)throw result.error;close();await init();}catch(e){message('Não foi possível salvar: '+e.message);}finally{button.disabled=false;}}
 async function remove(id){const x=entries.find(e=>e.id===id);if(!x||!owner)return;if(!confirm(`Excluir o lançamento pessoal "${x.description}" de ${brl(x.amount)}? Esta ação fica registrada em auditoria.`))return;try{const {error,data}=await sb.from('ppc_transactions').delete().eq('owner_user_id',owner).eq('id',id).select('id');if(error)throw error;if(!data?.length)throw new Error('Registro não encontrado ou sem permissão.');await init();}catch(e){message('Não foi possível excluir: '+e.message);}}
 const nav=document.querySelector('[data-view="ppc"]');nav?.addEventListener('click',()=>{if($('pageTitle'))$('pageTitle').textContent='Minha carteira pessoal';if($('pageSubtitle'))$('pageSubtitle').textContent='Receitas e despesas visíveis somente para você.';if($('pageSectionBadge'))$('pageSectionBadge').textContent='PPC · ÁREA PRIVADA';if(owner)render();});
 $('ppcNewButton')?.addEventListener('click',()=>open(null));$('ppcPeriod')?.addEventListener('change',render);$('ppcKind')?.addEventListener('change',chooseCategories);$('ppcModalClose')?.addEventListener('click',close);$('ppcModalCancel')?.addEventListener('click',close);$('ppcForm')?.addEventListener('submit',save);$('ppcModal')?.addEventListener('click',e=>{if(e.target===$('ppcModal'))close()});
 $('ppcRows')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ppcEdit)open(b.dataset.ppcEdit);if(b.dataset.ppcDelete)void remove(b.dataset.ppcDelete);});
 $('ppcPeriod').value=today().slice(0,7);
 window.addEventListener('pfc:ready',()=>{clear();void init();});
 sb?.auth?.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')clear();});
})();
