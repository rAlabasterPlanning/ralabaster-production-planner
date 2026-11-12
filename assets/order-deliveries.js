// Each delivery owns an immutable packing snapshot. The production order stays open.
(()=>{'use strict';
 const S=()=>{try{return state}catch(_){return null}},find=id=>S()?.orders?.find(o=>o.id===id&&!o.deleted);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const delivered=o=>Number(o.deliveredQty)||0,remaining=o=>Math.max(0,Number(o.qty)-delivered(o));
 const unitPrice=o=>o.saleUnit!=null?Number(o.saleUnit):Number(o.totalSale)/Number(o.qty),money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n);
 let current=null,busy=false;
 function controls(o){if(!Number.isSafeInteger(Number(o.qty))||Number(o.qty)<1||o.quantityPending||o.deleted)return'';
  return `<button class="btn small" type="button" data-deliver-order="${esc(o.id)}">Deellevering / pakbonnen</button>${o.deliveries?.length?`<small style="display:block">${delivered(o)} van ${o.qty} geleverd · ${remaining(o)} in backorder${delivered(o)>Number(o.qty)?` · ${delivered(o)-Number(o.qty)} extra geleverd · te factureren: ${delivered(o)} stuks (${money(Number(o.billableRevenue)||delivered(o)*unitPrice(o))} excl. btw)`:""}</small>`:''}`;
 }
 function open(id,loaded=false,initialQty=null,receipt=false){if(busy)return;const o=find(id);if(!o)return;
  const db=window.RALAB_ADMIN_AUTH?.client;
  if(!loaded&&db?.from){showModal('<div class="modalbody"><p role="status">Actuele leveringen ophalen…</p><button class="btn" type="button" data-delivery-close>Sluiten</button></div>');
   const marker=document.querySelector('#modalRoot [role="status"]');
   Promise.resolve(db.from('planner_orders_v2').select('data').eq('workspace_id','ralabaster').eq('order_id',id).eq('deleted',false).maybeSingle()).then(r=>{
    if(!marker?.isConnected)return;if(r.error)throw Error(r.error.message);if(!r.data?.data)throw Error('Order niet gevonden.');
    const s=S(),i=s.orders.findIndex(x=>x.id===id);if(i>=0)s.orders[i]=r.data.data;window.RALAB_PERFORMANCE?.invalidate?.();open(id,true,initialQty,receipt);
   }).catch(error=>{if(marker?.isConnected){marker.setAttribute('role','alert');marker.textContent=error.message||'Leveringen niet opgehaald. Probeer opnieuw.'}});return;
  }
  current={id,requestId:crypto.randomUUID(),expected:delivered(o)};
  const left=remaining(o),openOrder=o.active!==false&&!o.closed&&o.status!=='completed',canDeliver=!receipt&&openOrder;
  showModal(`<div class="modalhead"><h3>Deellevering · ${esc(o.orderNo)}</h3></div><form data-delivery-form><div class="modalbody"><p><b>${esc(o.product)}</b></p><div class="notice">Besteld: ${o.qty} · Eerder geleverd: ${delivered(o)} · Backorder: ${left}</div>${canDeliver?`<p>Meld alleen het aantal voor deze levering gereed. De rest blijft op dezelfde order staan. Productiestappen, tijden en planning blijven behouden. Rond na de laatste levering de order apart af voor de nacalculatie.</p><label>Aantal in deze levering<input class="input" type="number" min="1" max="${left}" step="1" required value="${Number.isSafeInteger(initialQty)&&initialQty>0?initialQty:(left||1)}" data-delivery-qty></label><label style="display:block;margin-top:12px"><input type="checkbox" data-delivery-over> Overlevering toestaan — extra stuks factureren tegen de orderstukprijs</label><label style="display:block;margin-top:12px">Opmerking op deze pakbon<textarea class="input" maxlength="2000" data-delivery-note></textarea></label><p data-delivery-preview></p>`:'<p>Er kan geen nieuwe levering worden toegevoegd. De bestaande pakbonnen blijven hieronder beschikbaar.</p>'}<h3>Pakbonnen per levering</h3>${(o.deliveries||[]).map(d=>`<p><button class="btn" type="button" ${d.voidedAt?'disabled aria-disabled="true"':''} data-delivery-pdf="${esc(d.id)}">${esc(d.packing.orderNo)} · ${d.qty} stuks · ${d.voidedAt?'Geannuleerd':'PDF downloaden'}</button></p>`).join('')||'<p>Nog geen leveringen opgeslagen.</p>'}<p role="status" data-delivery-status></p></div><div class="modalfoot"><button class="btn" type="button" data-delivery-close>Sluiten</button><div class="spacer"></div>${receipt&&openOrder?'<button class="btn" type="button" data-delivery-new>Nieuwe deellevering</button>':''}${canDeliver?'<button class="btn primary" type="submit">Gereedmelden en pakbon maken</button>':''}</div></form>`);preview();
 }
 function preview(){
  const o=current&&find(current.id),field=document.querySelector('[data-delivery-qty]'),out=document.querySelector('[data-delivery-preview]'),allow=!!document.querySelector('[data-delivery-over]')?.checked;if(!o||!field||!out)return;
  if(allow)field.removeAttribute('max');else field.max=String(remaining(o));
  const n=Number(field.value),total=delivered(o)+n,extra=Math.max(0,total-Number(o.qty))-Math.max(0,delivered(o)-Number(o.qty)),price=unitPrice(o);
  if(!Number.isSafeInteger(n)||n<1||total>2147483647){out.textContent='Vul een geldig positief geheel aantal in.';return;}
  if(extra>0&&!allow){out.textContent='Dit zijn '+extra+' extra stuks. Vink overlevering toestaan aan om deze te leveren en te factureren.';return;}
  if(extra>0&&(!Number.isFinite(price)||price<0)){out.textContent='Vul eerst een geldige verkoopprijs per stuk in bij de order.';return;}
  out.textContent=extra>0?'Besteld: '+o.qty+' · Totaal geleverd na deze levering: '+total+' · Extra in deze levering: '+extra+' stuks ('+money(extra*price)+' excl. btw). Te factureren totaal: '+total+' × '+money(price)+' = '+money(total*price)+' excl. btw.':'Pakbon voor '+n+' stuks. Daarna blijven '+Math.max(0,remaining(o)-n)+' stuks in backorder op deze order.';
 }

 function pdf(delivery){const file=window.RALAB_ORDER_CLOSEOUT?.file(delivery.packing);if(!file)throw Error('Pakbon is nog niet geladen. Herlaad de planner.');const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function submit(form){if(busy||!current||!form?.isConnected||!form.querySelector('[data-delivery-qty]')||!form.reportValidity())return false;const o=find(current.id),qty=Number(form.querySelector('[data-delivery-qty]').value);const allow=!!form.querySelector("[data-delivery-over]")?.checked;if(!o||!Number.isSafeInteger(qty)||qty<1||delivered(o)+qty>2147483647||(qty>remaining(o)&&!allow))return false;
  const note=form.querySelector('[data-delivery-note]').value,status=form.querySelector('[data-delivery-status]'),controls=[...form.querySelectorAll('input,textarea,button')];busy=true;controls.forEach(e=>e.disabled=true);status.textContent='Levering en pakbon worden opgeslagen…';let timer;
  try{const db=window.RALAB_ADMIN_AUTH?.client||(typeof supabaseClient!=='undefined'?supabaseClient:null);if(!db)throw Error('Log online in om een levering op te slaan.');
   const result=await Promise.race([db.rpc('planner_record_delivery_v2',{p_order_id:o.id,p_qty:qty,p_expected_delivered:current.expected,p_request_id:current.requestId,p_note:note,p_allow_overdelivery:allow}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Nog geen bevestiging ontvangen. Probeer opnieuw met dezelfde gegevens; deze levering wordt niet verdubbeld.')),30000)})]);
   if(result.error)throw Error(result.error.message);const data=result.data;if(!data?.order||!data.delivery?.packing)throw Error('De database heeft deze levering niet bevestigd.');
   const s=S(),i=s.orders.findIndex(x=>x.id===o.id);s.orders[i]=data.order;window.RALAB_PERFORMANCE?.invalidate?.();
   // The server has already saved it. Do not flush unrelated local changes here.
   try{save()}catch(_){}window.RALAB_DIRTY?.allowClose?.();busy=false;open(o.id,true,null,true);document.querySelector('[data-delivery-status]').textContent=`Opgeslagen: ${qty} stuks. Download de pakbon bij de leveringen hierboven.`;window.RALAB_ERP?.renderOrderOverview?.();return true;
  }catch(error){status.setAttribute('role','alert');status.textContent=error.message||String(error);status.scrollIntoView?.({block:'nearest'});return false}
  finally{clearTimeout(timer);busy=false;controls.forEach(e=>e.disabled=false);}
 }
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-deliver-order],[data-delivery-pdf],[data-delivery-close],[data-delivery-new]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;if(b.hasAttribute('data-deliver-order'))open(b.dataset.deliverOrder);else if(b.hasAttribute('data-delivery-new'))open(current.id,true);else if(b.hasAttribute('data-delivery-close')){current=null;closeModal()}else{const d=find(current?.id)?.deliveries?.find(d=>d.id===b.dataset.deliveryPdf);try{if(d&&!d.voidedAt)pdf(d)}catch(error){alert(error.message)}}},true);
 document.addEventListener('input',e=>{if(e.target.matches?.('[data-delivery-qty]'))preview()});
 document.addEventListener('change',e=>{if(e.target.matches?.('[data-delivery-over]'))preview()});
 document.addEventListener('submit',e=>{if(!e.target.matches?.('[data-delivery-form]'))return;e.preventDefault();e.stopImmediatePropagation();submit(e.target)},true);
 window.RALAB_DELIVERIES={open,controls,submit,pdf};
})();
