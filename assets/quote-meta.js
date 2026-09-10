// rAlabaster - offertenummer + klantreferentie zichtbaar en doorzetten naar order
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(+n||0);
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(_){}}
function renderQuotes(){
 const s=S(),root=document.getElementById('view-quotes');if(!s||!root)return;
 const rows=(s.quotes||[]).map(q=>{const c=(s.customers||[]).find(x=>x.id===q.customerId);return`<tr><td><b>${esc(q.quoteNo||'—')}</b></td><td>${esc(c?.name||'—')}</td><td>${esc(q.customerReference||'—')}</td><td><b>${esc(q.name)}</b>${q.project?'<br>'+esc(q.project):''}</td><td>${q.qty}</td><td>${euro(q.saleUnit)}</td><td>${euro(q.total)}</td><td>${esc(q.internalReady||'')}</td><td>${esc(q.communicatedDate||'')}</td><td>${esc(q.status||'concept')}</td><td><button class="btn small" onclick="RALAB_ERP.quoteOrder('${q.id}')">Akkoord → order</button></td></tr>`}).join('');
 root.innerHTML=`<div class="toolbar"><h2>2. Offertes</h2><div class="spacer"></div><button class="btn primary" onclick="RALAB_ERP.show('calculation')">+ Nieuwe calculatie</button></div><div class="panel"><table><thead><tr><th>Offerte</th><th>Klant</th><th>Referentie klant</th><th>Product / project</th><th>Aantal</th><th>Prijs/st</th><th>Totaal</th><th>Intern gereed</th><th>Voorstel klantdatum</th><th>Status</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan=11>Nog geen offertes.</td></tr>'}</tbody></table></div>`;
}
function install(){
 const erp=window.RALAB_ERP;if(!erp||erp.__quoteMeta)return false;
 const oldQuoteOrder=erp.quoteOrder;
 erp.renderQuotes=renderQuotes;
 erp.quoteOrder=function(id){
   const s=S(),q=(s?.quotes||[]).find(x=>x.id===id),before=new Set((s?.orders||[]).map(x=>x.id));
   const r=oldQuoteOrder.apply(this,arguments);
   const created=(s?.orders||[]).find(x=>!before.has(x.id));
   if(created&&q){created.customerReference=q.customerReference||'';created.sourceQuoteNo=q.quoteNo||'';persist();}
   return r;
 };
 erp.__quoteMeta=true;
 return true;
}
if(!install())setTimeout(install,500);setTimeout(install,1400);
})();