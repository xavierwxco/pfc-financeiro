/* PFC v4.6 — categorias, perfis e administracao. Nao modifica funcoes financeiras. */
(()=>{'use strict';
const sb=window.PFC_SB,C=window.PFC_CONFIG,$=id=>document.getElementById(id);
if(!sb||!C||!$('p46CategoryList'))return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,isAdmin=false,kind='expense',categories=[],aliases=[],members=[],profileName='';
function status(id,msg,bad=false){const el=$(id);el.textContent=msg;el.classList.toggle('is-error',bad)}
function namemap(){return new Map(categories.map(c=>[c.id,c.name]));}
function categoryFor(k,n){const a=aliases.find(a=>a.kind===k&&a.alias===n);return categories.find(c=>c.id===a?.category_id)?.name||n}
async function loadCategories(){
 const [c,a]=await Promise.all([
 sb.from('pfc_categories').select('id,name,kind,active,sort_order').eq('household_id',C.householdId).order('sort_order').order('name'),
 sb.from('pfc_category_aliases').select('kind,alias,category_id').eq('household_id',C.householdId)
 ]);
 if(c.error)throw c.error;if(a.error)throw a.error;categories=c.data||[];aliases=a.data||[];
 window.PFC_CATEGORY_LABEL=(k,n)=>categoryFor(k,n);renderCategories();refreshSelects();
}
function renderCategories(){
 const list=categories.filter(c=>c.kind===kind).sort((a,b)=>Number(b.active)-Number(a.active)||a.sort_order-b.sort_order||a.name.localeCompare(b.name,'pt-BR'));
 $('p46CategoryList').innerHTML=list.length?list.map(c=>`<div class="p46-category ${c.active?'':'is-inactive'}"><div><div class="p46-category-title">${esc(c.name)}</div><small>${c.active?'Ativa':'Desativada'} · ${c.kind==='expense'?'Despesa':'Receita'}</small></div>${isAdmin?`<div class="p46-actions"><button class="outline-btn" type="button" data-cat-edit="${c.id}" aria-label="Editar ${esc(c.name)}">Editar</button><button class="outline-btn" type="button" data-cat-toggle="${c.id}">${c.active?'Desativar':'Ativar'}</button><button class="outline-btn" type="button" data-cat-delete="${c.id}">Excluir</button></div>`:''}</div>`).join(''):'<p class="p46-note">Nenhuma categoria cadastrada.</p>';
 $('p46AddCategory').hidden=!isAdmin;
 $('p46CategoryHint').textContent=isAdmin?'Renomear não altera registros históricos. Categorias em uso podem ser desativadas, mas não excluídas.':'Categorias gerenciadas pelo administrador da família.';
 document.querySelectorAll('[data-p46-kind]').forEach(b=>b.classList.toggle('is-selected',b.dataset.p46Kind===kind));
}
function refreshSelects(){
 // Select de lançamento: despesas/receitas não podem ser misturadas.
 const f=$('transactionForm');if(f){
  const t=f.elements.type;const sel=f.elements.category;if(t&&sel){
   const previous=sel.value;
   const options=categories.filter(c=>c.kind===t.value&&c.active);
   sel.innerHTML=options.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
   if(options.some(c=>c.name===previous))sel.value=previous;
  }
 }
 const rec=$('recurringForm');if(rec){
  const sel=rec.elements.category;if(sel){const previous=sel.value;
   sel.innerHTML=categories.filter(c=>c.kind==='expense'&&c.active).map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
   if(categories.some(c=>c.name===previous&&c.kind==='expense'&&c.active))sel.value=previous;
   // Se a conta antiga usa categoria desativada, editar continua possivel sem trocar automaticamente.
   if(previous&&!Array.from(sel.options).some(o=>o.value===previous)){
     const o=document.createElement('option');o.value=previous;o.textContent=categoryFor('expense',previous)+' (histórica)';sel.append(o);sel.value=previous;
   }
  }
 }
}
function edit(id){if(!isAdmin)return;const c=categories.find(c=>c.id===id);$('p46CategoryForm').reset();$('p46CategoryForm').elements.id.value=id||'';
 $('p46CategoryForm').elements.name.value=c?.name||'';
 $('p46CategoryEditorTitle').textContent=c?'Editar categoria '+c.name:'Nova categoria de '+(kind==='expense'?'despesa':'receita');
 $('p46CategoryEditor').hidden=false;$('p46CategoryEditor').scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function action(action,id,name=''){
 const {error}=await sb.rpc('pfc_manage_category',{p_household:C.householdId,p_action:action,p_id:id||null,p_kind:kind,p_name:name});
 if(error)throw error;await loadCategories();window.dispatchEvent(new Event('pfc:categoriesChanged'));
}
async function loadAdmin(){
 const {data,error}=await sb.from('household_members').select('user_id,display_name,role').eq('household_id',C.householdId);
 if(error)throw error;members=data||[];
 isAdmin=members.some(m=>m.user_id===user?.id&&m.role==='admin');
 $('p46AdminSettings').hidden=!isAdmin;
 $('p46RoleLabel').textContent=isAdmin?'Administrador':'Membro';
 renderCategories();
 if(!isAdmin)return;
 const uidName=uid=>members.find(m=>m.user_id===uid)?.display_name||uid;
 $('p46Members').innerHTML=members.map(m=>`<div class="p46-member"><div><strong>${esc(m.display_name)}</strong><small>${m.user_id===user.id?'Sua conta':esc(m.user_id)}</small></div><select data-member="${m.user_id}" aria-label="Permissão de ${esc(m.display_name)}"><option value="admin" ${m.role==='admin'?'selected':''}>Administrador</option><option value="member" ${m.role==='member'?'selected':''}>Usuário</option></select></div>`).join('');
 const audit=await sb.from('pfc_admin_audit').select('actor,action,occurred_at').eq('household_id',C.householdId).order('occurred_at',{ascending:false}).limit(15);
 $('p46Audit').innerHTML=audit.error?'Não foi possível carregar a auditoria.':(audit.data||[]).map(a=>`<div>${esc(a.action)} · ${esc(uidName(a.actor))}<br><small>${new Date(a.occurred_at).toLocaleString('pt-BR')}</small></div>`).join('')||'<p class="p46-note">Nenhuma alteração administrativa registrada.</p>';
}
async function loadProfile(){
 $('p46CurrentEmail').value=user?.email||'';
 const r=await sb.from('pfc_profiles').select('display_name').eq('user_id',user.id).maybeSingle();
 if(r.error)throw r.error;
 profileName=r.data?.display_name||members.find(m=>m.user_id===user.id)?.display_name||'';
 $('p46ProfileForm').elements.displayName.value=profileName;
 updateHeader();
}
function updateHeader(){if(!profileName)return;
 const sidebar=document.querySelector('.profile b');if(sidebar)sidebar.textContent=profileName;
 if($('topUserName'))$('topUserName').textContent=profileName;
 if($('topUserAvatar'))$('topUserAvatar').textContent=profileName.slice(0,1).toUpperCase();
 if($('pfc-avatar'))$('pfc-avatar').textContent=profileName.slice(0,1).toUpperCase();
 if($('pageTitle')?.textContent.startsWith('Olá,'))$('pageTitle').textContent=`Olá, ${profileName} 👋`;
}
async function init(){
 const {data:{user:u},error}=await sb.auth.getUser();if(error||!u)return;user=u;
 try{await loadAdmin();await loadCategories();await loadProfile();status('p46ProfileStatus','');}catch(e){console.error(e);status('p46CategoryStatus','Erro ao carregar categorias: '+e.message,true)}
}
document.querySelectorAll('[data-p46-kind]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.p46Kind;renderCategories()}));
$('p46AddCategory').addEventListener('click',()=>edit(''));
$('p46CategoryCancel').addEventListener('click',()=>{$('p46CategoryEditor').hidden=true});
$('p46CategoryForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,id=f.elements.id.value,name=f.elements.name.value.trim(),btn=f.querySelector('[type=submit]');btn.disabled=true;try{
 await action(id?'rename':'create',id,name);$('p46CategoryEditor').hidden=true;status('p46CategoryStatus','Categoria salva com sucesso.');
 }catch(err){status('p46CategoryStatus',err.message,true)}finally{btn.disabled=false}});
$('p46CategoryList').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!isAdmin)return;
 const id=b.dataset.catEdit||b.dataset.catToggle||b.dataset.catDelete,c=categories.find(x=>x.id===id);if(!c)return;
 if(b.dataset.catEdit)return edit(id);
 const operation=b.dataset.catDelete?'delete':(c.active?'deactivate':'activate');
 if(!confirm(operation==='delete'?`Excluir categoria ${c.name}? Categorias utilizadas não podem ser excluídas.`:`${c.active?'Desativar':'Ativar'} categoria ${c.name}?`))return;
 b.disabled=true;try{await action(operation,id);status('p46CategoryStatus','Categoria atualizada.');}
 catch(err){status('p46CategoryStatus',err.message,true)}finally{b.disabled=false}
});
$('transactionForm')?.elements.type.addEventListener('change',refreshSelects);
window.addEventListener('pfc:transactionFormOpened',refreshSelects);
window.addEventListener('pfc:ready',init);
$('p46ProfileForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,name=f.elements.displayName.value.trim();if(name.length<2)return;
 const {error}=await sb.from('pfc_profiles').upsert({user_id:user.id,display_name:name,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error)return status('p46ProfileStatus',error.message,true);profileName=name;updateHeader();window.dispatchEvent(new CustomEvent('pfc:profileUpdated',{detail:name}));status('p46ProfileStatus','Nome de exibição atualizado.');});
$('p46PasswordForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,p=f.elements.password.value;
 if(p.length<12||p!==f.elements.confirm.value)return status('p46ProfileStatus','As senhas precisam coincidir e ter pelo menos 12 caracteres.',true);
 const {error}=await sb.auth.updateUser({password:p});
 if(error)return status('p46ProfileStatus',error.message,true);f.reset();status('p46ProfileStatus','Senha atualizada. Se solicitado pelo Supabase, confirme sua sessão.');});
$('p46EmailForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;
 const {error}=await sb.auth.updateUser({email:f.elements.email.value.trim()});
 if(error)return status('p46ProfileStatus',error.message,true);f.reset();status('p46ProfileStatus','Solicitação enviada. Verifique os e-mails de confirmação.');});
$('p46Members').addEventListener('change',async e=>{const sel=e.target.closest('select[data-member]');if(!sel||!isAdmin)return;
 if(!confirm('Alterar o perfil deste usuário? A alteração afeta permissões administrativas.')){await loadAdmin();return}
 sel.disabled=true;const {error}=await sb.rpc('pfc_set_member_role',{p_household:C.householdId,p_user:sel.dataset.member,p_role:sel.value});
 if(error)status('p46AdminStatus',error.message,true);else status('p46AdminStatus','Permissão atualizada. O usuário deverá atualizar a página.');
 await loadAdmin().catch(console.error);
});
})();
