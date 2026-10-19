// One inbox; original customer submissions remain unchanged.
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={new:'Nieuw',reviewing:'In behandeling',quoted:'Offerte gemaakt',completed:'Afgerond'};
const root=()=>document.getElementById('view-requests'),db=()=>window.RALAB_ADMIN_AUTH?.client;
const S=()=>{try{return state}catch{return null}};
let items=[],reviews=[],customers=[],selected='',filter='open',page=0,busy=false;
const key=x=>`${x.source}:${x.id}`,review=x=>reviews.find(r=>r.source===x.source&&r.request_id===x.id)||{};
function quote(x){const no=review(x).quote_no;return no?(S()?.quotes||[]).find(q=>q.quoteNo===no):null}
function stage(x){return quote(x)?.orderId?'completed':review(x).status||x.status||'new'}
function fields(x){return {...x,...(review(x).data||{})}}
function updateCount(){const n=items.filter(x=>stage(x)==='new').length;document.querySelector('[data-request-count]').textContent=n?`(${n})`:''}
async function all(query){const data=[];for(let start=0;;start+=500){const r=await query().range(start,start+499);if(r.error)throw r.error;data.push(...(r.data||[]));if((r.data||[]).length<500)return {data}}}
async function load(){
 const c=db();if(!c)throw Error('Log eerst in bij de planner.');
 const results=await Promise.all([all(()=>c.from('portal_product_requests').select('*').order('created_at',{ascending:false}).order('id')),all(()=>c.from('acquisition_requests').select('*').eq('kind','quote').order('created_at',{ascending:false}).order('id')),all(()=>c.from('planner_request_reviews').select('*').order('source').order('request_id')),all(()=>c.from('portal_customers').select('customer_id,company_name,contact_name,email').order('customer_id'))]);
 for(const r of results)if(r.error)throw r.error;
 reviews=results[2].data||[];customers=results[3].data||[];
 items=[...(results[0].data||[]).map(x=>({...x,source:'portal',kind:x.request_type||'quote',company:customers.find(c=>c.customer_id===x.customer_id)?.company_name||x.customer_id})),...(results[1].data||[]).map(x=>({...x.data,...x,product_name:x.data.product_name||'Maatwerkproduct',description:x.data.description,quantity:x.data.quantity,company:x.data.company,source:'acquisition'}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 updateCount();
}
function render(){
 const r=root();if(!r)return;
 const visible=items.filter(x=>filter==='all'||(filter==='quote'||filter==='order'?x.kind===filter:!['completed','quoted'].includes(stage(x))));
 page=Math.max(0,Math.min(page,Math.ceil(visible.length/50)-1));const rows=visible.slice(page*50,page*50+50);
 const x=items.find(x=>key(x)===selected),v=x&&fields(x),q=x&&quote(x);
 r.innerHTML=`<div class="toolbar"><div><h2>Nieuwe aanvragen</h2><p class="muted">Bekijk en vul aan → maak een calculatie → offerte of order bevestigen → inplannen.</p></div><div class="spacer"></div><button class="btn" data-inbox-refresh>Vernieuwen</button></div><div class="toolbar">${[['open','Nog behandelen'],['quote','Offerteaanvragen'],['order','Bestelaanvragen'],['all','Alle aanvragen']].map(([k,l])=>`<button class="btn ${filter===k?'primary':''}" data-inbox-filter="${k}">${l}</button>`).join('')}</div><div role="status" data-inbox-message></div><div class="panel" style="overflow:auto;margin-top:12px"><table><thead><tr><th>Ontvangen</th><th>Klant</th><th>Type / product</th><th>Aantal</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(new Date(x.created_at).toLocaleString('nl-NL'))}</td><td>${esc(x.company)}</td><td>${x.kind==='order'?'Bestelaanvraag':'Offerteaanvraag'}<br><b>${esc(fields(x).product_name)}</b><br><small>${x.source==='portal'?'Klantportaal':'Acquisitie'}</small></td><td>${esc(fields(x).quantity??'—')}</td><td>${esc(labels[stage(x)]||stage(x))}</td><td><button class="btn" data-inbox-open="${esc(key(x))}">Bekijken / aanvullen</button></td></tr>`).join('')||'<tr><td colspan="6">Geen aanvragen in deze selectie.</td></tr>'}</tbody></table></div><div class="toolbar"><button class="btn" data-inbox-page="-1" ${page===0?'disabled':''}>Vorige</button><span>Pagina ${page+1} van ${Math.max(1,Math.ceil(visible.length/50))} &middot; ${visible.length} aanvragen</span><button class="btn" data-inbox-page="1" ${(page+1)*50>=visible.length?'disabled':''}>Volgende</button></div>${x?`<form data-inbox-form class="panel" style="padding:18px;margin-top:16px"><h3>${esc(x.company)} · ${x.kind==='order'?'Bestelaanvraag':'Offerteaanvraag'}</h3><details><summary>Oorspronkelijke aanvraag</summary><p style="white-space:pre-wrap">${esc(x.description)}</p><p>${esc(x.dimensions)} ${esc(x.material)} · ${esc(x.quantity)} ${esc(x.unit)}</p></details><div class="grid2">${x.source==='acquisition'?`<label class="field">Klant koppelen<select class="input" name="customer_id"><option value="">Kies een bestaande klant</option>${(S()?.customers||[]).map(c=>`<option value="${esc(c.id)}" ${v.customer_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`:''}${[['product_name','Product','text'],['quantity','Aantal','number'],['dimensions','Afmetingen','text'],['material','Materiaal / afwerking','text'],['requested_delivery_date','Gewenste leverdatum','date']].map(([k,l,t])=>`<label class="field">${l}<input class="input" name="${k}" type="${t}" ${k==='quantity'?'min="0.001" step="any" required':''} value="${esc(v[k]??'')}"></label>`).join('')}<label class="field">Status<select class="input" name="status">${Object.entries(labels).map(([k,l])=>`<option value="${k}" ${stage(x)===k?'selected':''}>${l}</option>`).join('')}</select></label></div><label class="field">Aanvullingen / interne notities<textarea class="input" name="notes" rows="4">${esc(review(x).notes||'')}</textarea></label><p class="muted">Aanvullingen zijn intern. Bevestig de offerte of order via het documentvenster; de planning staat bij de productieorder.</p><button class="btn primary" type="submit">Aanvullingen opslaan</button> <button class="btn" type="button" data-inbox-calculate>${q?'Calculatie aanvullen':'Calculatie / offerte voorbereiden'}</button> ${q?'<button class="btn" type="button" data-inbox-confirm>Offerte bekijken / order bevestigen</button>':''} ${q?.orderId?'<button class="btn primary" type="button" data-inbox-plan>Order bekijken / inplannen</button>':''} ${x.attachment_path?'<button class="btn" type="button" data-inbox-file>Tekening / bijlage</button>':''} ${x.source==='acquisition'&&x.data.file?'<p>De bijlage staat ook bij Acquisitie → Acties.</p>':''}</form>`:''}`;
 r.querySelector('[data-inbox-form]')?.addEventListener('submit',e=>{e.preventDefault();act(()=>saveReview(x))});
}
async function saveReview(x,extra={}){
 const f=root().querySelector('[data-inbox-form]'),fd=new FormData(f),quantity=Number(fd.get('quantity'));
 if(!String(fd.get('product_name')||'').trim()||!Number.isFinite(quantity)||quantity<=0)throw Error('Vul een productnaam en positief aantal in.');
 const data=Object.fromEntries(['product_name','dimensions','material','requested_delivery_date','customer_id'].map(k=>[k,String(fd.get(k)||'').trim()]));data.quantity=quantity;
 const value={source:x.source,request_id:x.id,status:fd.get('status'),notes:String(fd.get('notes')||''),data,quote_no:review(x).quote_no||null,...extra,updated_at:new Date().toISOString()};
 const {error}=await db().from('planner_request_reviews').upsert(value,{onConflict:'source,request_id'});if(error)throw error;
 reviews=reviews.filter(r=>!(r.source===x.source&&r.request_id===x.id));reviews.push(value);updateCount();return value;
}
async function calculate(x){
 await saveReview(x);let q=quote(x);const s=S(),v=fields(x);if(!s)throw Error('Planner is nog niet geladen.');
 if(!q){
  let customerId=x.customer_id||v.customer_id;
  if(!customerId){const matches=(s.customers||[]).filter(c=>String(c.email||'').toLowerCase()===String(x.data.email||'').toLowerCase());if(matches.length===1)customerId=matches[0].id;else throw Error('Koppel eerst de relatie via Acquisitie, of maak een klant met het e-mailadres uit de aanvraag aan.');}
  const no=`AAN-${x.id}`,existing=(s.quotes||[]).find(q=>q.quoteNo===no);
  await saveReview(x,{quote_no:no,status:'reviewing'});
  q=existing||{id:`q_request_${x.id}`,quoteNo:no,orderNo:no,sourceRequest:key(x),lineNo:1,customerId,name:v.product_name,qty:v.quantity,project:[x.description,v.dimensions,v.material].filter(Boolean).join('\n'),deadline:v.requested_delivery_date,customerReadyDate:v.requested_delivery_date,estimatedReadyDate:v.requested_delivery_date,ops:[],materialCost:0,materialMode:'unit',marginMode:'factor',marginValue:3,saleUnit:0,total:0,status:'concept',created:new Date().toISOString().slice(0,10)};
  if(!existing){s.quotes=s.quotes||[];s.quotes.push(q);save();}
 }
 window.RALAB_QUOTE_CALC.open(q.quoteNo);
}
async function refresh(){try{await load();render()}catch(e){root().innerHTML=`<div class="notice">Aanvragen konden niet laden: ${esc(e.message)} <button class="btn" data-inbox-refresh>Opnieuw proberen</button></div>`}}
async function act(fn){if(busy)return;busy=true;try{await fn();if(!root().classList.contains('hidden'))render()}catch(e){const m=root().querySelector('[data-inbox-message]');if(m)m.textContent=e.message;else alert(e.message)}finally{busy=false}}
document.addEventListener('click',e=>{
 const nav=e.target.closest('.navbtn[data-view="requests"]');if(nav){e.preventDefault();e.stopImmediatePropagation();window.RALAB_ERP.show('requests');refresh();return}
 if(!e.target.closest('#view-requests'))return;
 const x=items.find(x=>key(x)===selected),open=e.target.closest('[data-inbox-open]'),f=e.target.closest('[data-inbox-filter]');
 if(open){selected=open.dataset.inboxOpen;render()}if(f){filter=f.dataset.inboxFilter;page=0;render()}const pg=e.target.closest('[data-inbox-page]');if(pg){page+=Number(pg.dataset.inboxPage);render()}
 if(e.target.closest('[data-inbox-refresh]'))refresh();
 if(x&&e.target.closest('[data-inbox-calculate]'))act(()=>calculate(x));
 if(x&&e.target.closest('[data-inbox-confirm]'))window.RALAB_DOCS.openQuote(quote(x).quoteNo);
 if(x&&e.target.closest('[data-inbox-plan]'))window.RALAB_ERP.openOrder(quote(x).orderId);
 if(x&&e.target.closest('[data-inbox-file]'))act(async()=>{const {data,error}=await db().storage.from('portal-files').createSignedUrl(x.attachment_path,60);if(error)throw error;window.open(data.signedUrl,'_blank','noopener')});
},true);
// Read only small counters in the background; never overwrite an open editor.
async function count(){if(!db()||!root().classList.contains('hidden')||document.hidden)return;try{const {data,error}=await db().rpc('planner_new_request_count');if(error)throw error;document.querySelector('[data-request-count]').textContent=Number(data)?`(${Number(data)})`:''}catch{document.querySelector('[data-request-count]').textContent='(!)'}}
setTimeout(count,2500);setInterval(count,60000);
window.RALAB_REQUEST_INBOX={refresh};
})();

