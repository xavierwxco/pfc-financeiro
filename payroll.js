/* PPC 5.0.3 — demonstrativos privados, snapshots por competencia; NENHUM lancamento automatico no PPC/PFC. */
(()=>{'use strict';
 const $=id=>document.getElementById(id), sb=window.PFC_SB;
 const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n||0);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const yearMonth=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 const monthFirst=s=>s+'-01';
 const rounded=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 const DEFINITIONS=[
  {key:'habilitacao',name:'Adicional de habilitação',pct:45},
  {key:'militar',name:'Adicional militar',pct:16},
  {key:'disponibilidade',name:'Adicional de disponibilidade',pct:12}
 ];
 const BASE_ITEMS=[
  {kind:'income',name:'Soldo militar da ativa',category:'Salário',formula:'base'},
  {kind:'income',name:'Adicional de habilitação',category:'Salário',formula:'habilitacao'},
  {kind:'income',name:'Adicional militar',category:'Salário',formula:'militar'},
  {kind:'income',name:'Adicional de disponibilidade',category:'Salário',formula:'disponibilidade'},
  {kind:'income',name:'Auxílio alimentação',category:'Benefícios',amount:0},
  {kind:'income',name:'Auxílio transporte',category:'Benefícios',amount:0},
  {kind:'income',name:'Adicional natalino (13º)',category:'13º salário',amount:0},
  {kind:'income',name:'Férias',category:'Férias',amount:0},
  {kind:'deduction',name:'FHE - Financiamento imobiliário',category:'Moradia',amount:0},
  {kind:'deduction',name:'Assistência médico-hospitalar',category:'Saúde',amount:0},
  {kind:'deduction',name:'Assistência médico-hospitalar - dependente',category:'Saúde',amount:0},
  {kind:'deduction',name:'HOSPAER AF',category:'Saúde',amount:0},
  {kind:'deduction',name:'Desconto auxílio transporte',category:'Transporte',amount:0},
  {kind:'deduction',name:'Pensão militar',category:'Previdência',amount:0},
  {kind:'deduction',name:'Imposto de renda',category:'Impostos',amount:0},
  {kind:'deduction',name:'IR adicional natalino',category:'Impostos',amount:0}
 ];
 let userId=null,configs=[],slips=[],currentConfig=null,loadedId=null,charts=[],items=[];
 const info=msg=>{if($('payrollMessage'))$('payrollMessage').textContent=msg||''};
 const defaultPaid=m=>{let [y,mm]=m.split('-').map(Number);return new Date(Date.UTC(y,mm,5)).toISOString().slice(0,10)};
 function fillRates(){const c=configs[0];$('payrollRates').innerHTML=DEFINITIONS.map(d=>`<div class="payroll-rate"><label for="payrollRate_${d.key}">${esc(d.name)} (%)</label><input id="payrollRate_${d.key}" type="number" min="0" max="200" step="0.01" value="${c?.rates?.[d.key]??d.pct}" required></div>`).join('');if(c){$('payrollRank').value=c.rank_name;$('payrollBase').value=c.base_salary;}}
 async function load(){const owner=window.PFC_CURRENT_USER?.id;if(!owner)return;userId=owner;
  try{const [c,s]=await Promise.all([
    sb.from('ppc_payroll_configs').select('*').eq('owner_user_id',owner).order('effective_month',{ascending:false}),
    sb.from('ppc_payroll_slips').select('*').eq('owner_user_id',owner).order('competence',{ascending:false})]);
   if(c.error)throw c.error;if(s.error)throw s.error;if(userId!==owner)return;
   configs=c.data||[];slips=s.data||[];fillRates();
   $('payrollConfigHistory').innerHTML=configs.length?'<strong>Histórico imutável de vigências</strong>'+configs.map(x=>`<p>${esc(x.effective_month.slice(0,7))} · ${esc(x.rank_name)} · ${money(Number(x.base_salary))}</p>`).join(''):'Nenhuma configuração cadastrada.';
   drawReports();
  }catch(e){info('Não foi possível carregar contracheques: '+e.message)}
 }
 function applicable(month){return configs.find(x=>x.effective_month<=monthFirst(month))||null}
 function addLine(x){items.push({...x,amount:rounded(x.amount||0)});drawItems()}
 function pullItems(){const root=$('payrollItems');for(const [i,x] of [...root.querySelectorAll('.payroll-line')].entries()){
  items[i]={...items[i],name:x.querySelector('.line-name').value,category:x.querySelector('.line-category').value,amount:rounded(Number(x.querySelector('.line-amount').value))};}
 }
 function drawItems(){const root=$('payrollItems');root.innerHTML=items.map((x,i)=>`<div class="payroll-line" data-i="${i}"><span class="payroll-type">${x.kind==='income'?'RENDIMENTO':'DESCONTO'}</span><input aria-label="Rubrica" class="line-name" maxlength="120" value="${esc(x.name)}"><input aria-label="Categoria" class="line-category" maxlength="80" value="${esc(x.category)}"><input aria-label="Valor" class="line-amount" type="number" min="0" max="99999999999" step="0.01" value="${Number(x.amount||0).toFixed(2)}"><button type="button" aria-label="Remover rubrica" data-remove="${i}">×</button></div>`).join('');calc()}
 function calc(){let inc=0,ded=0;for(const x of items){if(x.kind==='income')inc+=Number(x.amount||0);else ded+=Number(x.amount||0)}
  $('payrollGross').textContent=money(inc);$('payrollDeductions').textContent=money(ded);$('payrollNet').textContent=money(inc-ded);
  const expected=$('payrollExpectedNet').value;
  $('payrollDifference').textContent=expected===''?'Informe o valor líquido do documento para conferir.':`Diferença em relação ao documento: ${money(rounded(inc-ded-Number(expected)))}`;
  return {inc:rounded(inc),ded:rounded(ded),net:rounded(inc-ded)};
 }
 function applyMonth(copy){const month=$('payrollMonth').value;if(!month)return;const existing=slips.find(x=>x.competence===monthFirst(month));loadedId=existing?.id||null;
  if(existing){currentConfig={rank_name:existing.rank_snapshot,base_salary:existing.base_salary_snapshot,rates:existing.rates_snapshot};items=(existing.items||[]).map(x=>({...x}));$('payrollPaid').value=existing.payment_date;$('payrollExpectedNet').value=existing.net_total;
   $('payrollCurrentConfig').textContent=`${existing.status==='confirmed'?'CONFIRMADO · SOMENTE LEITURA':'RASCUNHO'} · ${existing.rank_snapshot} · Soldo ${money(Number(existing.base_salary_snapshot))}. Valores congelados na competência.`;
   lock(existing.status==='confirmed');drawItems();return;
  }
  currentConfig=applicable(month);lock(false);$('payrollPaid').value=defaultPaid(month);$('payrollExpectedNet').value='';
  if(!currentConfig){items=[];drawItems();$('payrollCurrentConfig').textContent='Nenhuma configuração de soldo vigente nessa competência. Cadastre primeiro a vigência.';return;}
  const base=Number(currentConfig.base_salary);
  const prior=copy?slips.find(x=>x.competence<monthFirst(month)):null;
  // Rubricas adicionais copiadas apenas no comando explícito; eventuais não são copiadas por padrão.
  items=BASE_ITEMS.map(x=>({...x,amount: x.formula==='base'?base:x.formula?rounded(base*Number(currentConfig.rates[x.formula]||0)/100):0}));
  if(prior){const map=new Map(prior.items.map(x=>[x.kind+'|'+x.name,x]));items=items.map(x=>{
    if(x.formula)return x;
    if(/natalino|férias/i.test(x.name))return x;
    const previous=map.get(x.kind+'|'+x.name);return previous?{...x,amount:Number(previous.amount)}:x;
  });}
  $('payrollCurrentConfig').textContent=`Vigência ${currentConfig.effective_month.slice(0,7)} · ${currentConfig.rank_name} · Soldo ${money(base)}. Índices usados: ${DEFINITIONS.map(d=>`${d.name}: ${currentConfig.rates[d.key]??0}%`).join(' | ')}`;
  drawItems();
 }
 function lock(locked){for(const x of $('payrollSlipForm').querySelectorAll('input,button'))if(x.id!=='payrollMonth')x.disabled=locked;
  for(const x of [$('payrollAddIncome'),$('payrollAddDeduction'),$('payrollCopy'),$('payrollPrepare')])x.disabled=locked;
 }
 async function saveConfig(e){e.preventDefault();if(!userId)return;
  const month=$('payrollEffective').value,base=Number($('payrollBase').value),rank=$('payrollRank').value.trim();
  const rates=Object.fromEntries(DEFINITIONS.map(d=>[d.key,Number($('payrollRate_'+d.key).value)]));
  if(!month||month<yearMonth(new Date()))return info('A configuração nova deve valer a partir do mês atual ou de uma competência futura.');
  if(!Number.isFinite(base)||base<=0||Object.values(rates).some(v=>!Number.isFinite(v)||v<0||v>200))return info('Confira o soldo e os índices.');
  if(configs.some(x=>x.effective_month===monthFirst(month)))return info('Já existe configuração nessa vigência. Escolha o próximo mês aplicável.');
  if(!confirm(`Criar nova configuração válida a partir de ${month}? Não altera contracheques antigos e não permite editar essa vigência depois.`))return;
  const {error}=await sb.from('ppc_payroll_configs').insert({owner_user_id:userId,effective_month:monthFirst(month),rank_name:rank,base_salary:base,rates});
  if(error)return info('Não foi possível salvar configuração: '+error.message);await load();info('Nova vigência salva. Contracheques anteriores preservados.');
 }
 async function saveSlip(confirmSlip){if(!userId)return;pullItems();const month=$('payrollMonth').value,paid=$('payrollPaid').value;
  if(!month||!paid||!currentConfig)return info('Selecione competência, pagamento e uma configuração válida.');
  if(!items.length)return info('Adicione pelo menos uma rubrica.');
  for(const x of items)if(!x.name.trim()||!x.category.trim()||!Number.isFinite(x.amount)||x.amount<0)return info('Confira as rubricas, categorias e valores.');
  const total=calc(),expected=$('payrollExpectedNet').value;
  if(confirmSlip&&(expected===''||Math.abs(total.net-Number(expected))>0.009))return info('O líquido calculado não confere com o contracheque. Corrija antes de confirmar.');
  const old=slips.find(x=>x.competence===monthFirst(month));if(old?.status==='confirmed')return info('Competência já confirmada. O histórico é imutável.');
  if(confirmSlip&&!confirm(`Confirmar contracheque da competência ${month}, pago em ${paid}? Depois não poderá editar. Não cria lançamento financeiro automaticamente.`))return;
  const payload={owner_user_id:userId,competence:monthFirst(month),payment_date:paid,rank_snapshot:currentConfig.rank_name,base_salary_snapshot:Number(currentConfig.base_salary),rates_snapshot:currentConfig.rates,items:items.map(x=>({kind:x.kind,name:x.name.trim(),category:x.category.trim(),amount:x.amount.toFixed(2)})),status:confirmSlip?'confirmed':'draft'};
  let res;if(old)res=await sb.from('ppc_payroll_slips').update(payload).eq('id',old.id).eq('owner_user_id',userId).select('id');else res=await sb.from('ppc_payroll_slips').insert(payload).select('id');
  if(res.error)return info('Não foi possível salvar contracheque: '+res.error.message);
  await load();applyMonth(false);info(confirmSlip?'Contracheque confirmado e congelado. Nenhuma movimentação criada automaticamente.':'Rascunho salvo.');
 }
 function aggregate(rows){const totals={};for(const slip of rows)for(const item of slip.items||[]){const key=(item.kind==='income'?'Rendimentos: ':'Descontos: ')+item.category;totals[key]=rounded((totals[key]||0)+Number(item.amount||0));}return totals;}
 function graph(id,rows){const el=$(id);if(!el||typeof Chart==='undefined')return;const data=aggregate(rows);if(el._payrollChart)el._payrollChart.destroy();
  el._payrollChart=new Chart(el,{type:'bar',data:{labels:Object.keys(data),datasets:[{label:'Total por categoria (R$)',data:Object.values(data),backgroundColor:Object.keys(data).map(k=>k.startsWith('Rendimentos')?'#3776c5':'#db9762')}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});
 }
 function drawReports(){const month=$('payrollReportMonth').value,year=String($('payrollReportYear').value||'');graph('payrollMonthChart',slips.filter(s=>s.competence.slice(0,7)===month));graph('payrollYearChart',slips.filter(s=>s.competence.slice(0,4)===year));}
 $('payrollEffective').min=yearMonth(new Date());$('payrollEffective').value=yearMonth(new Date());
 const current=new Date(),last=new Date(current.getFullYear(),current.getMonth()-1,1);
 $('payrollMonth').value=yearMonth(last);$('payrollReportMonth').value=yearMonth(last);$('payrollReportYear').value=String(last.getFullYear());
 $('payrollConfigForm').addEventListener('submit',e=>void saveConfig(e));
 $('payrollPrepare').addEventListener('click',()=>applyMonth(false));$('payrollCopy').addEventListener('click',()=>applyMonth(true));
 $('payrollMonth').addEventListener('change',()=>applyMonth(false));
 $('payrollAddIncome').addEventListener('click',()=>{pullItems();addLine({kind:'income',name:'Nova rubrica',category:'Outros',amount:0})});
 $('payrollAddDeduction').addEventListener('click',()=>{pullItems();addLine({kind:'deduction',name:'Novo desconto',category:'Outros',amount:0})});
 $('payrollItems').addEventListener('input',()=>{pullItems();calc()});
 $('payrollItems').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;pullItems();items.splice(Number(b.dataset.remove),1);drawItems()});
 $('payrollExpectedNet').addEventListener('input',calc);
 $('payrollDraft').addEventListener('click',()=>void saveSlip(false));$('payrollSlipForm').addEventListener('submit',e=>{e.preventDefault();void saveSlip(true)});
 $('payrollRefresh').addEventListener('click',()=>void load());$('payrollReportMonth').addEventListener('change',drawReports);$('payrollReportYear').addEventListener('change',drawReports);
 window.addEventListener('pfc:ready',()=>{userId=null;configs=[];slips=[];currentConfig=null;items=[];drawItems();void load()});
 sb?.auth?.onAuthStateChange(e=>{if(e==='SIGNED_OUT'){userId=null;configs=[];slips=[];items=[];currentConfig=null;drawItems();drawReports();}});
})();
