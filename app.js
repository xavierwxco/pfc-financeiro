(()=>{'use strict';
const C=window.PFC_CONFIG, sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey),$=id=>document.getElementById(id);
window.PFC_SB=sb;
let user=null, memberMap={}, tx=[], transfers=[], charts={}, currentMemberName='';
const currentMonth=String(new Date().getMonth()+1).padStart(2,'0');
const periodSelections={dashboard:'all',transactions:currentMonth,extract:currentMonth};
let activeView='dashboard';
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR');
function visibility(auth){$('pfc-loading').style.display='none';$('pfc-login').style.display=auth?'none':'flex';$('pfc-app').style.display=auth?'':'none';}
function alertLogin(s){$('pfc-login-error').textContent=s||'';}
function ownerName(label){return label||'Não informado';}
async function loginStart(){ $('pfc-loading').style.display='grid'; const {data:{session},error}=await sb.auth.getSession(); if(error)console.error(error); if(session)await enter(session.user); else visibility(false); }
async function enter(u){user=u;try{
 const {data:members,error}=await sb.from('household_members').select('user_id,role,display_name').eq('household_id',C.householdId);if(error)throw error;
 memberMap={};(members||[]).forEach(m=>memberMap[m.user_id]=C.members[m.user_id]||'Membro');
 if(!memberMap[u.id])throw new Error('Este usuário não está vinculado ao PFC Família.');
 const name=memberMap[u.id];currentMemberName=name;window.PFC_CURRENT_USER={id:u.id,role:(members.find(m=>m.user_id===u.id)?.role||'member'),email:u.email};document.querySelector('.profile b').textContent=name;document.querySelector('.profile small').textContent=(members.find(m=>m.user_id===u.id)?.role==='admin'?'Administrador':'Membro');$('pfc-avatar').textContent=name.slice(0,1).toUpperCase(); if($('topUserName'))$('topUserName').textContent=name; if($('topUserRole'))$('topUserRole').textContent=(members.find(m=>m.user_id===u.id)?.role==='admin'?'Administrador':'Membro'); if($('topUserAvatar'))$('topUserAvatar').textContent=name.slice(0,1).toUpperCase();
 await load();visibility(true);render();showView('dashboard');window.dispatchEvent(new Event('pfc:ready'));
 }catch(e){console.error(e);await sb.auth.signOut();visibility(false);alertLogin(e.message||'Falha ao carregar dados.');}}
async function load(){
 const {data,error}=await sb.from('transactions').select('id,description,category,transaction_date,type,amount,person_user_id,expense_scope,payment_method,invoice_payment_allocation_id').eq('household_id',C.householdId).order('transaction_date',{ascending:false});if(error)throw error;
 const tr=await sb.from('settlements').select('id,from_user_id,to_user_id,amount,paid_on,settlement_period,note,created_by,cancelled_at,cancelled_by,cancel_reason').eq('household_id',C.householdId).order('paid_on',{ascending:false});if(tr.error)throw tr.error;transfers=tr.data||[];
 // Estornos auditados da versão 4.3: mantemos as linhas no banco, mas não
 // contamos no extrato e nos cálculos lançamentos ligados a pagamentos estornados.
 const [reversalsResult,allocResult,recurringVoidsResult,categoriesResult,aliasesResult]=await Promise.all([
  sb.from('invoice_payment_reversals').select('invoice_payment_id').eq('household_id',C.householdId),
  sb.from('invoice_payment_allocations').select('id,invoice_payment_id').eq('household_id',C.householdId),
  sb.from('recurring_payments').select('transaction_id,reversed_at').eq('household_id',C.householdId).not('reversed_at','is',null),
  sb.from('pfc_categories').select('id,kind,name').eq('household_id',C.householdId),
  sb.from('pfc_category_aliases').select('kind,alias,category_id').eq('household_id',C.householdId)
 ]);
 if(reversalsResult.error)throw reversalsResult.error;if(allocResult.error)throw allocResult.error;if(recurringVoidsResult.error)throw recurringVoidsResult.error;
 if(categoriesResult.error)throw categoriesResult.error;if(aliasesResult.error)throw aliasesResult.error;
 const newNames=new Map((categoriesResult.data||[]).map(c=>[c.id,c.name]));const oldNames=new Map((aliasesResult.data||[]).map(a=>[a.kind+'|'+a.alias,newNames.get(a.category_id)]));
 const reversedPayments=new Set((reversalsResult.data||[]).map(v=>v.invoice_payment_id));
 const voidAllocations=new Set((allocResult.data||[]).filter(a=>reversedPayments.has(a.invoice_payment_id)).map(a=>a.id));
 const voidRecurringTransactions=new Set((recurringVoidsResult.data||[]).map(p=>p.transaction_id));
 tx=(data||[]).filter(t=>(!t.invoice_payment_allocation_id||!voidAllocations.has(t.invoice_payment_allocation_id))&&!voidRecurringTransactions.has(t.id)).map(t=>({id:t.id,owner:C.members[t.person_user_id]||'Membro',type:t.type,description:t.description,category:oldNames.get(t.type+'|'+t.category)||(t.category||'Outros'),date:t.transaction_date,amount:Number(t.amount),expenseScope:t.expense_scope||'individual',account:t.payment_method||'Conta / cartão'}));
 window.PFC_REPORT_DATA={tx,transfers};
}
async function save(t){const payerId=Object.entries(C.members).find(([,name])=>name===t.owner)?.[0];if(!payerId)throw new Error('Responsável não reconhecido.');const payload={household_id:C.householdId,created_by:user.id,person_user_id:payerId,description:t.description,category:t.category,transaction_date:t.date,type:t.type,amount:t.amount,expense_scope:t.type==='expense'?t.expenseScope:'individual',payment_method:'Conta corrente'};const {error}=await sb.from('transactions').insert(payload);if(error)throw error;await load();}
function tableRow(t,mode){let base=`<td><div class="desc-cell"><span class="transaction-icon">◇</span>${esc(t.description)}</div></td>`;let value=`<td class="right ${t.type==='income'?'amount-in':'amount-out'}">${t.type==='income'?'+':'−'} ${brl(t.amount)}</td>`;if(mode==='recent')return `<tr>${base}<td>${esc(t.category)}</td><td>${fmt(t.date)}</td><td>${esc(t.owner)}</td>${value}</tr>`;if(mode==='extract')return `<tr><td>${fmt(t.date)}</td>${base}<td>${esc(t.category)}</td><td>${esc(t.account)}</td>${value}</tr>`;return `<tr>${base}<td>${esc(t.type==='income'?'Receita':'Despesa')}</td><td>${esc(t.category)}</td><td>${fmt(t.date)}</td><td>${esc(t.owner)}</td>${value}</tr>`;}
function visibleTransactions(){const m=$('monthFilter').value;return m==='all'?tx:tx.filter(t=>t.date.slice(5,7)===m&&t.date.slice(0,4)===String(new Date().getFullYear()));}
 function render(){const visible=visibleTransactions();const sorted=[...visible].sort((a,b)=>b.date.localeCompare(a.date));$('recentRows').innerHTML=sorted.slice(0,5).map(t=>tableRow(t,'recent')).join('')||'<tr><td colspan="5">Nenhum lançamento cadastrado.</td></tr>';$('allRows').innerHTML=sorted.map(t=>tableRow(t,'all')).join('')||'<tr><td colspan="6">Nenhum lançamento cadastrado.</td></tr>';$('extractRows').innerHTML=sorted.map(t=>tableRow(t,'extract')).join('')||'<tr><td colspan="5">Nenhum lançamento cadastrado.</td></tr>';
 const inc=visible.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),out=visible.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);$('incomeTotal').textContent=brl(inc);$('expenseTotal').textContent=brl(out);$('balanceTotal').textContent=brl(inc-out);$('billsTotal').textContent='—';renderSettlement();updateCharts();window.dispatchEvent(new Event('pfc:reportsUpdated'));}
function renderSettlement(){
 const period=$('settlementPeriod').value,selected=$('settlementMonth').value;
 const rows=tx.filter(t=>t.type==='expense'&&t.expenseScope==='common'&&(period==='all'||t.date.slice(0,7)===selected));
 const pay=transfers.filter(t=>!t.cancelled_at&&(period==='all'||t.settlement_period?.slice(0,7)===selected));
 const totalCents=rows.reduce((s,t)=>s+Math.round(t.amount*100),0),xCents=rows.filter(t=>t.owner==='Xavier').reduce((s,t)=>s+Math.round(t.amount*100),0);
 const taCents=totalCents-xCents;
 const xId=Object.keys(C.members).find(k=>C.members[k]==='Xavier');
 const tId=Object.keys(C.members).find(k=>C.members[k]==='Talita');
 const tToX=pay.filter(p=>p.from_user_id===tId&&p.to_user_id===xId).reduce((s,p)=>s+Math.round(Number(p.amount)*100),0);
 const xToT=pay.filter(p=>p.from_user_id===xId&&p.to_user_id===tId).reduce((s,p)=>s+Math.round(Number(p.amount)*100),0);
 // Valores em centavos preservam as diferencas de arredondamento.
 const diff=xCents-totalCents/2-tToX+xToT;
 $('commonTotal').textContent=brl(totalCents/100);$('eachShare').textContent=brl(totalCents/200);
 $('xavierPaid').textContent=brl(xCents/100);$('talitaPaid').textContent=brl(taCents/100);
 $('settlementsApplied').textContent=brl((tToX+xToT)/100);
 const r=$('settlementResult');r.classList.toggle('owes',Math.abs(diff)>=0.5);
 if(Math.abs(diff)<0.5)r.innerHTML='<span>Acerto equilibrado</span><strong>Ninguem deve nada neste periodo.</strong>';
 else if(diff>0)r.innerHTML=`<span>Saldo apos transferencias</span><strong>Talita deve ${brl(diff/100)} ao Xavier.</strong>`;
 else r.innerHTML=`<span>Saldo apos transferencias</span><strong>Xavier deve ${brl(-diff/100)} a Talita.</strong>`;
 $('commonRows').innerHTML=rows.map(t=>`<tr><td>${esc(t.description)}</td><td>${fmt(t.date)}</td><td>${esc(t.owner)}</td><td class="right">${brl(t.amount)}</td></tr>`).join('')||'<tr><td colspan="4">Nenhuma despesa comum neste periodo.</td></tr>';
 $('settlementsRows').innerHTML=pay.map(p=>`<tr><td>${fmt(p.paid_on)}</td><td>${esc(C.members[p.from_user_id]||'?')}</td><td>${esc(C.members[p.to_user_id]||'?')}</td><td>${esc(p.settlement_period?.slice(0,7)||'')}</td><td class="right">${brl(p.amount)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma transferencia de acerto neste periodo.</td></tr>';
}
async function recordSettlement(){
 const from=$('settlementFrom').value,to=$('settlementTo').value,amount=Number($('settlementAmount').value),paidOn=$('settlementPaidOn').value,month=$('settlementTargetMonth').value;
 if(from===to)throw Error('Pagador e recebedor devem ser diferentes.');
 if(!Number.isFinite(amount)||amount<=0||!paidOn||!month)throw Error('Preencha valor, data e mes de referencia.');
 const {error}=await sb.from('settlements').insert({household_id:C.householdId,from_user_id:from,to_user_id:to,amount,paid_on:paidOn,settlement_period:month+'-01',created_by:user.id});
 if(error)throw error;await load();render();
}
function updateCharts(){
  if(!window.Chart)return;
  const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const inc=Array(12).fill(0),out=Array(12).fill(0),cats={};
  const fixedColors={
    'moradia':'#e24d49','comunicação':'#0891b2','alimentação':'#ee963f',
    'saúde':'#16a085','vestuário':'#8360ce','transporte':'#3876da',
    'educação':'#ad62ca','lazer':'#db5192','pet':'#83a52d',
    'outros':'#65758b'
  };
  const fallbackColors=['#c65d34','#316aa8','#45965f','#aa7243','#8260af',
    '#bd4a65','#1b8d97','#857c38','#7d6696','#ab6669'];
  const normalizeCategory=n=>String(n||'Outros').trim().toLocaleLowerCase('pt-BR');
  tx.filter(t=>t.date.slice(0,4)===String(new Date().getFullYear())).forEach(t=>{
    const d=new Date(t.date+'T12:00:00');
    if(t.type==='income')inc[d.getMonth()]+=t.amount;
    else{
      out[d.getMonth()]+=t.amount;
      const name=String(t.category||'Outros').trim()||'Outros';
      cats[name]=(cats[name]||0)+t.amount;
    }
  });
  const sortedCats=Object.entries(cats).filter(([,v])=>v>0)
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
  const totalAll=Object.values(cats).reduce((a,b)=>a+b,0);
  // Com mais de seis categorias, mostramos as cinco maiores e agrupamos as restantes.
  // Nunca descartamos valores: o total do gráfico continua igual à soma de todas as despesas.
  const shouldGroup=sortedCats.length>6;
  const extra=shouldGroup?sortedCats.slice(5):[];
  const visibleCats=shouldGroup?sortedCats.slice(0,5).concat([['Outras categorias',extra.reduce((s,[,v])=>s+v,0)]]):sortedCats;
  const usedColors=new Set();
  const colorByName={};
  const pickColor=(name,idx)=>{
    const normalized=normalizeCategory(name);
    if(shouldGroup&&name==='Outras categorias')return '#64748b';
    let color=fixedColors[normalized];
    if(!color||usedColors.has(color)){
      const palette=[...fallbackColors,'#b45c9a','#3c8d80','#b17e25','#6e72c5'];
      color=palette.find(c=>!usedColors.has(c))||`hsl(${(idx*137.508)%360} 58% 47%)`;
    }
    usedColors.add(color);
    return color;
  };
  // Reservar a cor cinza exclusivamente para a fatia agrupada.
  if(shouldGroup)usedColors.add('#64748b');
  visibleCats.forEach(([n],i)=>{colorByName[n]=pickColor(n,i);});
  const catLabels=visibleCats.map(([n])=>n);
  const catValues=visibleCats.map(([,v])=>v);
  const catColors=catLabels.map(n=>colorByName[n]);
  if($('categoryTotal'))$('categoryTotal').textContent=brl(totalAll);
  if($('categoryLegend'))$('categoryLegend').innerHTML=visibleCats.map(([n,v],i)=>{
    const percentage=totalAll?(v/totalAll*100).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:0}):'0';
    const rank= i<3?`<span class="pfc-cat-rank">${i+1}º</span>`:'';
    const detail=shouldGroup&&n==='Outras categorias'?`<small class="pfc-cat-meta">${extra.length} categorias agrupadas</small>`:'';
    return `<div class="pfc-cat-legend-item${i<3?' pfc-cat-top':''}"><i class="dot" style="background:${colorByName[n]}"></i>${rank}<span class="pfc-cat-name">${esc(n)}${detail}</span><span class="pfc-cat-value">${brl(v)}</span><b>${percentage}%</b></div>`;
  }).join('')||'<div>Sem despesas registradas</div>';
  if(!charts.flow&&$('flowChart'))charts.flow=new Chart($('flowChart'),{
    type:'bar',data:{labels:months,datasets:[
      {label:'Receitas',data:inc,backgroundColor:'#5b83d6'},
      {label:'Despesas',data:out,backgroundColor:'#e6a0a5'}]},
    options:{responsive:true,maintainAspectRatio:false}
  });
  else if(charts.flow){
    charts.flow.data.datasets[0].data=inc;
    charts.flow.data.datasets[1].data=out;
    charts.flow.update();
  }
  if(!charts.cat&&$('categoryChart'))charts.cat=new Chart($('categoryChart'),{
    type:'doughnut',
    data:{labels:catLabels,datasets:[{data:catValues,backgroundColor:catColors,borderWidth:0,hoverOffset:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'76%',
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{
          const value=Number(c.parsed)||0;
          const pct=totalAll?(value/totalAll*100).toLocaleString('pt-BR',{maximumFractionDigits:1}):'0';
          return `${c.label}: ${brl(value)} (${pct}%)`;
        },
        afterLabel:c=>shouldGroup&&c.label==='Outras categorias'
          ?extra.map(([name,value])=>`${name}: ${brl(value)}`):[]
      }}}
    }
  });
  else if(charts.cat){
    charts.cat.data.labels=catLabels;
    charts.cat.data.datasets[0].data=catValues;
    charts.cat.data.datasets[0].backgroundColor=catColors;
    charts.cat.options.plugins.tooltip.callbacks.label=c=>{
      const value=Number(c.parsed)||0;
      const pct=totalAll?(value/totalAll*100).toLocaleString('pt-BR',{maximumFractionDigits:1}):'0';
      return `${c.label}: ${brl(value)} (${pct}%)`;
    };
    charts.cat.options.plugins.tooltip.callbacks.afterLabel=c=>shouldGroup&&c.label==='Outras categorias'
      ?extra.map(([name,value])=>`${name}: ${brl(value)}`):[];
    charts.cat.update();
  }
  if(!charts.report&&$('reportChart'))charts.report=new Chart($('reportChart'),{
    type:'line',data:{labels:months,datasets:[
      {label:'Saldo',data:inc.map((v,i)=>v-out[i]),borderColor:'#4776d3',fill:false}]},
    options:{responsive:true,maintainAspectRatio:false}
  });
  else if(charts.report){
    charts.report.data.datasets[0].data=inc.map((v,i)=>v-out[i]);
    charts.report.update();
  }
}
function showView(n){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+n));document.querySelectorAll('.nav-item').forEach(a=>a.classList.toggle('active',a.dataset.view===n));const labels={dashboard:'Dashboard',transactions:'Lançamentos',extract:'Extrato',settlement:'Acerto de contas',cards:'Cartões e faturas',recurring:'Recorrentes',reports:'Relatórios',categories:'Categorias',settings:'Configurações'};const subs={dashboard:'Aqui está um panorama atualizado das finanças da família.',transactions:'Cadastre, acompanhe e corrija lançamentos manuais.',extract:'Consulte todas as movimentações em ordem contínua.',settlement:'Acompanhe quem pagou mais e os acertos entre Xavier e Talita.',cards:'Gerencie cartões, compras parceladas e pagamentos.',recurring:'Organize contas fixas e lançamentos programados.',reports:'Compare meses, totais e resultados do acerto familiar.',categories:'Organize receitas e despesas sem perder o histórico.',settings:'Seu perfil, segurança, usuários e preferências do aplicativo.'};$('crumb').textContent=labels[n]||n;if($('pageTitle')) $('pageTitle').textContent=n==='dashboard'?`Olá, ${currentMemberName} 👋`:(labels[n]||n);if($('pageSubtitle')) $('pageSubtitle').textContent=subs[n]||'';if($('pageSectionBadge')) $('pageSectionBadge').textContent=n==='dashboard'?'VISÃO DA FAMÍLIA':'PFC · FINANCEIRA COMPLETA';activeView=n;const showPeriod=['dashboard','transactions','extract'].includes(n);if($('periodFilterControl'))$('periodFilterControl').hidden=!showPeriod;if(showPeriod){$('monthFilter').value=periodSelections[n];render();}$('sidebar').classList.remove('open');if(n==='settlement')renderSettlement();}
document.querySelectorAll('[data-view]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showView(a.dataset.view)}));document.querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click',()=>showView(a.dataset.go)));$('menuBtn').onclick=()=>$('sidebar').classList.toggle('open');$('settlementPeriod').addEventListener('change',()=>{ $('settlementMonth').disabled=$('settlementPeriod').value==='all';renderSettlement();});$('settlementMonth').value=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0')].join('-');$('settlementMonth').addEventListener('change',renderSettlement);$('monthFilter').addEventListener('change',()=>{periodSelections[activeView]=$('monthFilter').value;render();});
$('settlementTargetMonth').value=$('settlementMonth').value;
$('settlementPaidOn').value=new Date().toLocaleDateString('en-CA');
for(const id of ['settlementFrom','settlementTo']) $(id).innerHTML=Object.entries(C.members).map(([uid,name])=>`<option value="${esc(uid)}">${esc(name)}</option>`).join('');
$('settlementTo').selectedIndex=1;
$('settlementForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('settlementSubmit');b.disabled=true;try{await recordSettlement();$('settlementMessage').textContent='Transferencia registrada. Saldo recalculado.';$('settlementAmount').value='';}catch(err){$('settlementMessage').textContent='Erro: '+err.message;}finally{b.disabled=false;}});
window.addEventListener('pfc:invoicePaid',async()=>{await load();render();});window.addEventListener('pfc:profileUpdated',e=>{currentMemberName=e.detail||currentMemberName;if(activeView==='dashboard')showView('dashboard')});
const modal=$('modal');function close(){modal.classList.remove('open')}function open(){window.dispatchEvent(new Event('pfc:transactionFormOpened'));modal.classList.add('open');$('transactionForm').elements.date.value=new Date().toISOString().slice(0,10)}['newTransaction','newTransaction2','newTransactionBar'].forEach(id=>{const el=$(id); if(el) el.addEventListener('click',open)});$('closeModal').onclick=close;$('cancelModal').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});$('transactionForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),btn=e.target.querySelector('[type=submit]');btn.disabled=true;try{await save({description:f.get('description'),type:f.get('type'),amount:Number(f.get('amount')),category:f.get('category'),date:f.get('date'),owner:f.get('owner'),expenseScope:f.get('expenseScope')});render();close();e.target.reset();}catch(err){alert('Falha ao gravar no Supabase: '+err.message);}finally{btn.disabled=false;}});
function exportCsv(){const lines=[['Data','Descrição','Categoria','Tipo','Responsável','Valor'],...tx.map(t=>[t.date,t.description,t.category,t.type,t.owner,t.amount])].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';'));const a=document.createElement('a'),u=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}));a.href=u;a.download='PFC-extrato.csv';a.click();URL.revokeObjectURL(u);}$('exportCsv').onclick=exportCsv;if($('exportCsv2'))$('exportCsv2').onclick=exportCsv;
$('pfc-login-form').addEventListener('submit',async e=>{e.preventDefault();alertLogin('');const f=new FormData(e.target),b=$('pfc-login-submit');b.disabled=true;b.textContent='Entrando…';const {data,error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});b.disabled=false;b.textContent='Entrar';if(error){alertLogin('E-mail ou senha inválidos, ou serviço indisponível.');return;}await enter(data.user);});$('pfc-logout').onclick=async()=>{await sb.auth.signOut();tx=[];visibility(false);};sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){transfers=[];visibility(false);}});
if($('dismissNotice')) $('dismissNotice').onclick=()=>$('demoNotice').remove();
$('workbookInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const w=XLSX.read(await f.arrayBuffer(),{type:'array'});$('importStatus').textContent=`Arquivo reconhecido (${w.SheetNames.length} abas). A importação ainda não foi executada; os registros precisam de conferência antes de gravar.`;}catch{$('importStatus').textContent='Não foi possível ler o arquivo Excel.';}});
loginStart();})();
