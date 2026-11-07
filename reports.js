(()=>{'use strict';
const $=id=>document.getElementById(id), C=window.PFC_CONFIG;
const names=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const cents=n=>Math.round(Number(n||0)*100);
const idX=Object.keys(C.members).find(k=>C.members[k]==='Xavier');
const idT=Object.keys(C.members).find(k=>C.members[k]==='Talita');
let summary=[];
function getRows(year){
 const {tx=[],transfers=[]}=window.PFC_REPORT_DATA||{};
 return names.map((label,i)=>{
  const month=`${year}-${String(i+1).padStart(2,'0')}`;
  const these=tx.filter(t=>t.date?.slice(0,7)===month);
  const incoming=these.filter(t=>t.type==='income').reduce((s,t)=>s+cents(t.amount),0);
  const expenses=these.filter(t=>t.type==='expense').reduce((s,t)=>s+cents(t.amount),0);
  const common=these.filter(t=>t.type==='expense'&&t.expenseScope==='common');
  const total=common.reduce((s,t)=>s+cents(t.amount),0);
  const x=common.filter(t=>t.owner==='Xavier').reduce((s,t)=>s+cents(t.amount),0);
  const t=total-x;
  const payments=transfers.filter(p=>!p.cancelled_at&&p.settlement_period?.slice(0,7)===month);
  const tToX=payments.filter(p=>p.from_user_id===idT&&p.to_user_id===idX).reduce((s,p)=>s+cents(p.amount),0);
  const xToT=payments.filter(p=>p.from_user_id===idX&&p.to_user_id===idT).reduce((s,p)=>s+cents(p.amount),0);
  return {label,month,incoming,expenses,total,x,t,transferred:tToX+xToT,due:(x-t)/2-tToX+xToT};
 });
}
function availableYears(){
 const {tx=[],transfers=[]}=window.PFC_REPORT_DATA||{};
 const ys=new Set([new Date().getFullYear()]);
 tx.forEach(t=>{const y=Number(t.date?.slice(0,4));if(y>=2000&&y<=2100)ys.add(y)});
 transfers.forEach(t=>{const y=Number(t.settlement_period?.slice(0,4));if(y>=2000&&y<=2100)ys.add(y)});
 return [...ys].sort((a,b)=>b-a);
}
function refresh(){
 if(!$('reportYear')||!window.PFC_REPORT_DATA)return;
 const select=$('reportYear'), old=select.value, years=availableYears();
 select.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
 select.value=years.includes(Number(old))?old:String(new Date().getFullYear());
 render();
}
function render(){
 const year=Number($('reportYear').value);if(!year||!window.PFC_REPORT_DATA)return;
 summary=getRows(year);
 const sum=k=>summary.reduce((s,r)=>s+r[k],0);
 $('reportIncome').textContent=brl(sum('incoming'));
 $('reportExpenses').textContent=brl(sum('expenses'));
 $('reportBalance').textContent=brl(sum('incoming')-sum('expenses'));
 $('reportMonthlyRows').innerHTML=summary.map(r=>`<tr><td>${r.label}</td><td class="right">${brl(r.incoming)}</td><td class="right">${brl(r.expenses)}</td><td class="right">${brl(r.total)}</td><td class="right">${brl(r.x)}</td><td class="right">${brl(r.t)}</td><td class="right">${brl(r.transferred)}</td><td class="right">${r.due<0?'− ':''}${brl(Math.abs(r.due))}</td></tr>`).join('');
}
function exportCSV(){
 if(!summary.length)return;
 const head=['Mes','Receitas','Despesas','Despesas comuns','Xavier pagou comuns','Talita pagou comuns','Transferencias de acerto','Saldo do acerto (positivo Talita deve Xavier)'];
 const data=[head,...summary.map(r=>[r.month,r.incoming,r.expenses,r.total,r.x,r.t,r.transferred,r.due].map((v,i)=>i===0?v:(v/100).toFixed(2).replace('.',',')))];
 const csv='\ufeff'+data.map(row=>row.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`PFC-relatorio-${$('reportYear').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('reportYear').addEventListener('change',render);
$('exportReportCsv').addEventListener('click',exportCSV);
window.addEventListener('pfc:reportsUpdated',refresh);
})();
