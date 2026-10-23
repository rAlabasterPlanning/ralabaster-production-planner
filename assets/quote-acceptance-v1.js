// Accept a saved quotation without editing its commercial document.
(()=>{
const S=()=>{try{return state}catch(_){return null}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n);
let session=null,busy=false;
function tiers(q){
 const rows=q.includeTierPricing?(q.priceTiers||[]).filter(t=>q.tierVisibility?.[String(t.qty)]!==false):[];
 // The main product line is also a quoted price, even when its quantity is
 // absent from the optional quantity-pricing table.
 const all=[...rows];if(!all.some(t=>Number(t.qty)===Number(q.qty)))all.push({qty:q.qty,saleUnit:q.saleUnit});
 return all.filter(t=>Number.isSafeInteger(Number(t.qty))&&Number(t.qty)>0&&Number.isFinite(Number(t.saleUnit))&&Number(t.saleUnit)>=0).sort((a,b)=>Number(a.qty)-Number(b.qty));
}
function open(no){
 if(busy)return;
 const lines=(S()?.quotes||[]).filter(q=>(q.quoteNo||q.orderNo)===no).slice().sort((a,b)=>(a.lineNo||0)-(b.lineNo||0));
 if(!lines.length)return;
 if(lines.some(q=>q.orderId)||(S().orders||[]).some(o=>o.sourceQuoteNo===no))return alert('Deze offerte is al aan een order gekoppeld. Open die order om de staffel te wijzigen.');
 session={no,lines:structuredClone(lines)};
 const first=lines[0],reference=first.customerReference||'',requested=first.customerReadyDate||first.deadline||'',confirmed=first.communicatedDeadline||first.estimatedReadyDate||first.deadline||'';
 showModal(`<div class="modalhead"><h3>Offerte ${esc(no)} accepteren</h3></div><div class="modalbody"><div class="notice">Kies per product de geaccepteerde staffel en bevestig het definitieve orderaantal. Vul 0 in bij producten die je niet bestelt. Minstens één product moet een positief aantal hebben. De opgeslagen offerte en alle staffels blijven ongewijzigd. Niet-opgeslagen wijzigingen in het vorige scherm worden niet overgenomen.</div><section class="panel" style="padding:14px;margin-top:12px"><label style="display:block">PO-nummer klant<input class="input" data-accept-reference maxlength="200" value="${esc(reference)}" placeholder="Bijv. PO-2026-123"></label><div class="grid2" style="margin-top:12px"><label>Gevraagde leverdatum klant<input class="input" type="date" data-accept-requested value="${esc(requested)}"></label><label>Door ons bevestigde leverdatum<input class="input" type="date" data-accept-confirmed value="${esc(confirmed)}"></label></div><small>Deze gegevens gelden voor alle producten in deze order en worden op de documenten vermeld.</small></section>${lines.map((q,i)=>`<section class="panel" style="padding:14px;margin-top:12px" data-accept-line="${i}"><h4>${esc(q.name)}</h4><div class="grid2"><label>Geaccepteerde staffel<select class="input" data-accept-tier="${i}">${tiers(q).map(t=>`<option value="${t.qty}" ${Number(t.qty)===Number(q.qty)?'selected':''}>${t.qty} stuks · ${money(Number(t.saleUnit))} / stuk</option>`).join('')}</select></label><label>Definitief orderaantal<input class="input" type="number" min="0" max="2147483647" step="1" data-accept-qty="${i}" value="${Number(q.qty)}"></label></div><div data-accept-price="${i}" style="margin-top:10px"></div><div data-accept-deviation="${i}" hidden style="margin-top:10px"><div class="notice">Dit aantal wijkt af van de gekozen staffel. Controleer de prijsafspraak met de klant. De gekozen staffelprijs wordt alleen na expliciete bevestiging toegepast.</div><label><input type="checkbox" data-accept-confirm="${i}"> De klant heeft dit aantal tegen deze staffelprijs bevestigd</label><label style="display:block;margin-top:8px">Toelichting op de prijsafspraak<input class="input" data-accept-reason="${i}" maxlength="1000" placeholder="Bijvoorbeeld akkoord per e-mail op …"></label></div></section>`).join('')}<div class="notice" data-accept-total style="margin-top:14px"></div><div role="alert" data-accept-error style="color:#a12622;margin-top:10px"></div></div><div class="modalfoot"><button class="btn" data-accept-cancel>Terug naar offerte</button><div class="spacer"></div><button class="btn primary" data-accept-submit>Bevestigen en order aanmaken</button></div>`);
 refresh();
}
function choices(){return(session?.lines||[]).map((q,i)=>{
 const tierQty=Number(document.querySelector(`[data-accept-tier="${i}"]`)?.value),qtyValue=document.querySelector(`[data-accept-qty="${i}"]`)?.value??'',qty=qtyValue.trim()===''?NaN:Number(qtyValue),tier=tiers(q).find(t=>Number(t.qty)===tierQty);
 return{lineId:q.id,tierQty,qty,saleUnit:Number(tier?.saleUnit),confirmed:!!document.querySelector(`[data-accept-confirm="${i}"]`)?.checked,reason:document.querySelector(`[data-accept-reason="${i}"]`)?.value.trim()||''};
})}
function validate(rows){
 if(!rows.length)return'Geen offerteregels gevonden.';
 for(const r of rows){if(!Number.isSafeInteger(r.qty)||r.qty<0||r.qty>2147483647)return'Vul voor elk product een geheel aantal vanaf 0 in.';
 if(r.qty===0)continue;
 if(!Number.isFinite(r.saleUnit)||r.saleUnit<0)return'Kies voor elk product een geldige staffel.';
 if(r.qty!==r.tierQty&&(!r.confirmed||!r.reason))return'Bevestig bij een afwijkend aantal de prijsafspraak en vul een toelichting in.';}
 if(!rows.some(r=>r.qty>0))return'Kies minstens één product met een positief orderaantal.';
 return'';
}
function refresh(){
 const rows=choices();let total=0;
 rows.forEach((r,i)=>{const valid=Number.isSafeInteger(r.qty)&&r.qty>0&&r.qty<=2147483647,adj=Number(session.lines[i].adjustmentPct||0),price=r.saleUnit*(1+adj/100),amount=valid?r.qty*price:0;total+=amount;
 document.querySelector(`[data-accept-deviation="${i}"]`).hidden=r.qty===0||r.qty===r.tierQty;
 document.querySelector(`[data-accept-price="${i}"]`).textContent=r.qty===0?'Niet besteld — deze regel wordt overgeslagen.':valid?`${r.qty} stuks × ${money(price)} = ${money(amount)}${adj?` (inclusief ${adj}% korting/toeslag)` :''}`:'Vul een positief geheel aantal in.';
 });
 document.querySelector('[data-accept-total]').textContent=`Ordertotaal excl. btw: ${money(total)}`;
 document.querySelector('[data-accept-submit]').disabled=busy||!!validate(rows);
}
async function submit(){
 if(busy||!session)return;
 const rows=choices(),reference=document.querySelector('[data-accept-reference]').value.trim(),requested=document.querySelector('[data-accept-requested]').value||null,confirmed=document.querySelector('[data-accept-confirmed]').value||null,error=reference.length>200?'Het PO-nummer mag maximaal 200 tekens bevatten.':validate(rows),message=document.querySelector('[data-accept-error]');if(error){message.textContent=error;return}
 busy=true;document.querySelectorAll('#modalRoot input,#modalRoot select,#modalRoot button').forEach(e=>e.disabled=true);
 try{
  if(typeof supabaseClient==='undefined'||!supabaseClient)throw Error('Log eerst online in. Een order wordt alleen aangemaakt als de database dit kan bevestigen.');
  await window.RALAB_PERFORMANCE?.flushCloudSave?.();
  const {data,error:rpcError}=await supabaseClient.rpc('planner_accept_quote_v2',{p_workspace_id:typeof WORKSPACE_ID==='undefined'?'ralabaster':WORKSPACE_ID,p_quote_no:session.no,p_customer_reference:reference||null,p_requested_delivery_date:requested,p_confirmed_delivery_date:confirmed,p_expected_lines:session.lines,p_choices:rows.map(({saleUnit,...r})=>r)});
  if(rpcError)throw Error(rpcError.message);
  if(!data?.orders?.length||!Array.isArray(data.tasks))throw Error('De database heeft de order niet bevestigd. Probeer opnieuw; een reeds aangemaakte order wordt niet verdubbeld.');
  const s=S();s.orders||=[];s.tasks||=[];
  for(const o of data.orders){const i=s.orders.findIndex(x=>x.id===o.id);if(i<0)s.orders.push(o);else s.orders[i]=o;}
  for(const t of data.tasks){const i=s.tasks.findIndex(x=>x.id===t.id);if(i<0)s.tasks.push(t);else s.tasks[i]=t;}
  window.RALAB_PERFORMANCE?.invalidate?.();save();session=null;closeModal();window.RALAB_ERP?.show?.('orders');
 }catch(e){message.textContent=e?.message||String(e);}
 finally{busy=false;if(session){document.querySelectorAll('#modalRoot input,#modalRoot select,#modalRoot button').forEach(e=>e.disabled=false);refresh();}}
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-accept-submit]')){e.preventDefault();submit()}if(e.target.closest?.('[data-accept-cancel]')&&!busy){const no=session?.no;session=null;window.RALAB_DOCS?.openQuote(no)}},true);
document.addEventListener('change',e=>{if(!session||busy)return;if(e.target.matches?.('[data-accept-tier]')){const i=e.target.dataset.acceptTier;document.querySelector(`[data-accept-qty="${i}"]`).value=e.target.value;document.querySelector(`[data-accept-confirm="${i}"]`).checked=false;document.querySelector(`[data-accept-reason="${i}"]`).value='';}if(e.target.matches?.('[data-accept-tier],[data-accept-confirm]'))refresh()},true);
document.addEventListener('input',e=>{if(session&&!busy&&e.target.matches?.('[data-accept-qty],[data-accept-reason]')){if(e.target.matches('[data-accept-qty]'))document.querySelector(`[data-accept-confirm="${e.target.dataset.acceptQty}"]`).checked=false;refresh()}},true);
// Render accepted order details on regenerated quotation documents without changing the saved quotation.
window.RALAB_ACCEPTED_DETAILS={forQuote(q){const o=(S()?.orders||[]).find(o=>o.sourceQuoteLineId===q.id)||(S()?.orders||[]).find(o=>o.sourceQuoteNo===(q.quoteNo||q.orderNo));return o?{...q,customerReference:o.customerReference||q.customerReference||'',customerReadyDate:o.requestedDeliveryDate||o.customerReadyDate||q.customerReadyDate||'',communicatedDeadline:o.communicatedDeadline||''}:q}};
window.RALAB_QUOTE_ACCEPT={open,tiers,validate};
})();
