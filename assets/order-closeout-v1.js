(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=x=>Number(x)||0;
 function S(){try{return state}catch(_){return null}}
 function local(id){return S()?.orders?.find(o=>o.id===id&&!o.deleted)}
 function tasks(id){return (S()?.tasks||[]).filter(t=>t.orderId===id&&!t.deleted).sort((a,b)=>num(a.seq)-num(b.seq))}
 function customer(o){return S()?.customers?.find(c=>c.id===o.customerId)||o.customerSnapshot||{}}
 function open(id){
  if(window.RALAB_CUSTOMER_MODE?.active()){alert('Zet klantmodus uit om interne tijden en verbruik te controleren.');return false}
  const o=local(id);if(!o)return false;
  const ts=tasks(id),pending=ts.filter(t=>!['done','completed'].includes(t.status)).length;
  showModal(`<div class="modalhead"><h3>Order afronden · ${esc(o.orderNo)}</h3></div><form id="orderCloseoutForm" data-closeout-order="${esc(id)}"><div class="modalbody"><p><b>${esc(o.customerName||'')} · ${esc(o.product)}</b></p><div class="notice">Controleer eerst de nacalculatie. Bij afronden worden ${pending} nog openstaande taken gereed gemarkeerd en uit de planning gehaald.</div><div class="grid3"><div class="field"><label>Aantal gereed</label><input class="input" id="closeoutQty" type="number" min="1" max="${num(o.qty)}" step="1" required value="${num(o.completedQty)||num(o.qty)}"></div><div class="field"><label>Beginmateriaal (kg)</label><input class="input" id="closeoutStartWeight" type="number" min="0" step="0.001" value="${num(o.startWeightKg)}"></div><div class="field"><label>Eindgewicht per product (kg)</label><input class="input" id="closeoutUnitWeight" type="number" min="0" step="0.001" value="${num(o.endUnitWeightKg)}"></div></div><div style="overflow:auto"><table><thead><tr><th>Processtap</th><th>Begroot (min)</th><th>Werkelijk (min)</th><th>Verbruik</th><th>Interne opmerking</th></tr></thead><tbody>${ts.map(t=>`<tr data-closeout-task="${esc(t.id)}"><td><b>${esc(t.name)}</b><br>${esc(t.machine||'')}</td><td>${num(t.estimate)}</td><td><input class="input" data-closeout-actual type="number" min="0" step="0.01" required value="${num(t.actual)}"></td><td><input class="input" data-closeout-consumption value="${esc(t.consumption||'')}" placeholder="bijv. 12 kg albast"></td><td><input class="input" data-closeout-note value="${esc(t.note||'')}"></td></tr>`).join('')}</tbody></table></div><div class="field"><label>Opmerking op de pakbon (zichtbaar voor klant)</label><textarea id="closeoutDeliveryNote">${esc(o.deliveryNote||'')}</textarea></div><label><input type="checkbox" id="closeoutChecked" required> Ik heb tijden, verbruik en aantal gecontroleerd.</label></div><div class="modalfoot"><button class="btn" type="button" data-closeout-cancel>Annuleren</button><div class="spacer"></div><button class="btn primary" type="submit">Controle opslaan en order afronden</button></div></form>`);
  return true;
 }
 function finish(form){
  if(!form.reportValidity())return false;
  const o=local(form.dataset.closeoutOrder);if(!o)return false;
  const qty=Number(document.getElementById('closeoutQty').value);
  if(!Number.isInteger(qty)||qty<1||qty>num(o.qty))return false;
  const at=new Date().toISOString(),ts=tasks(o.id),updates=[];
  for(const row of form.querySelectorAll('[data-closeout-task]')){
   const t=ts.find(x=>x.id===row.dataset.closeoutTask),actual=Number(row.querySelector('[data-closeout-actual]').value);
   if(!t||!Number.isFinite(actual)||actual<0)return false;
   updates.push({t,actual,consumption:row.querySelector('[data-closeout-consumption]').value,note:row.querySelector('[data-closeout-note]').value});
  }
  const before=structuredClone({o,tasks:ts});
  try{
   for(const u of updates){Object.assign(u.t,{actual:u.actual,consumption:u.consumption,note:u.note,status:'done',doneQty:qty});u.t.completedAt=u.t.completedAt||at.slice(0,10);u.t.completedAtDT=u.t.completedAtDT||at;clearTaskPlanning(u.t)}
   o.startWeightKg=num(document.getElementById('closeoutStartWeight').value);o.endUnitWeightKg=num(document.getElementById('closeoutUnitWeight').value);o.completedQty=qty;o.endTotalWeightKg=qty*o.endUnitWeightKg;o.yieldPct=o.startWeightKg?o.endTotalWeightKg/o.startWeightKg*100:null;
   o.deliveryNote=document.getElementById('closeoutDeliveryNote').value;o.closed=true;o.active=false;o.status='completed';o.completedAt=o.completedAt||at;o.postCalculationCheckedAt=at;
   S().completedOrders=S().completedOrders||[];if(!S().completedOrders.includes(o.id))S().completedOrders.push(o.id);
   save();window.RALAB_PERFORMANCE?.invalidate?.();window.RALAB_ERP?.renderOrderOverview?.();window.RALAB_COMPLETED_ORDER_ACTIONS?.open?.(o.id);return true;
  }catch(e){Object.assign(o,before.o);for(const t of ts)Object.assign(t,before.tasks.find(x=>x.id===t.id));console.error(e);alert('Afronden kon niet worden opgeslagen. Controleer de verbinding en probeer opnieuw.');return false}
 }
 function pdfText(value){
  return String(value??'').replace(/[\r\n]+/g,' ').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\xff]/g,'?').replace(/[\\()]/g,'\\$&').replace(/[\x80-\xff]/g,c=>'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'));
 }
 function wrap(value){const text=String(value??'').replace(/\r/g,'');return text.split('\n').flatMap(line=>{const result=[];while(line.length>44){let i=line.lastIndexOf(' ',44);if(i<15)i=44;result.push(line.slice(0,i));line=line.slice(i).trimStart()}return [...result,line]})}
 function pdfBytes(o){
  const c=customer(o),lines=['rAlabaster','PAKBON','',`Ordernummer: ${o.orderNo}`,`Datum: ${new Date().toLocaleDateString('nl-NL')}`,`Klant: ${c.name||c.company||o.customerName||''}`,...wrap(c.address||[c.street,c.zip||c.postal,c.city,c.country].filter(Boolean).join(', ')),`Project: ${o.project||'-'}`,`Klantreferentie: ${o.customerReference||'-'}`,'','Omschrijving',...wrap(o.product),'',`Aantal: ${num(o.completedQty)||num(o.qty)}`,'','Opmerking:',...wrap(o.deliveryNote||'-')].flatMap(wrap);
  const pages=[];for(let i=0;i<lines.length;i+=42)pages.push(lines.slice(i,i+42));
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids=[];
  for(const page of pages){const id=objects.length,streamId=id+1;kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);const stream=`0.12 0.32 0.27 rg BT /F1 20 Tf 48 790 Td (${pdfText(page[0]||'')}) Tj ET\n0 0 0 rg BT /F1 12 Tf 48 756 Td 17 TL\n${page.slice(1).map((line,i)=>(i?'T* ':'')+`(${pdfText(line)}) Tj`).join('\n')}\nET\n0.75 G 48 772 m 547 772 l S`;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)}
  objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  let result='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(result.length);result+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
  const start=result.length;result+=`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Uint8Array(Array.from(result,c=>c.charCodeAt(0)));
 }
 function file(o){return new File([pdfBytes(o)],`Pakbon-${String(o.orderNo||o.id).replace(/[^\w.-]/g,'_')}.pdf`,{type:'application/pdf'})}
 function base64(bytes){let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text)}
 function utf8(text){return Uint8Array.from(unescape(encodeURIComponent(text)),c=>c.charCodeAt(0))}
 function emlBytes(o,to){
  const attachment=file(o),boundary='ralabaster_'+Date.now()+'_'+Math.random().toString(36).slice(2),subject=`Pakbon ${o.orderNo} - ${o.product}`,body=`Beste,\n\nHierbij de pakbon voor order ${o.orderNo}.\nProduct: ${o.product}\nAantal: ${num(o.completedQty)||num(o.qty)}\n\nMet vriendelijke groet,\nrAlabaster`;
  const fold=x=>x.match(/.{1,76}/g)?.join('\r\n')||'';
  return `X-Unsent: 1\r\nTo: ${to}\r\nFrom: rAlabaster <info@ralabaster.com>\r\nSubject: =?UTF-8?B?${base64(utf8(subject))}?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${fold(base64(utf8(body)))}\r\n--${boundary}\r\nContent-Type: application/pdf; name="${attachment.name}"\r\nContent-Disposition: attachment; filename="${attachment.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${fold(base64(pdfBytes(o)))}\r\n--${boundary}--\r\n`;
 }
 function download(f){const url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 function delivery(id,share=false,loadedOrder=null){
  const o=loadedOrder||local(id);if(!o)return false;
  const input=document.getElementById('completedCustomerEmail'),to=(input?.value||customer(o).email||'').trim();
  if(!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){alert('Vul eerst een geldig e-mailadres van de klant in.');input?.focus();return false}
  const note=document.getElementById('completedDeliveryNote');if(note)o.deliveryNote=note.value;
  const f=file(o),subject=`Pakbon ${o.orderNo} - ${o.product}`,body=`Beste,\n\nHierbij de pakbon voor order ${o.orderNo}.\nProduct: ${o.product}\nAantal: ${num(o.completedQty)||num(o.qty)}\n\nMet vriendelijke groet,\nrAlabaster`;
  if(share==='outlook'){download(new File([emlBytes(o,to)],`Pakbon-${String(o.orderNo||o.id).replace(/[^\w.-]/g,'_')}.eml`,{type:'message/rfc822'}));const status=document.querySelector('[data-packing-draft-status]');if(status)status.textContent='Open het gedownloade .eml-bestand in Outlook. Het bevat het klantadres, de standaardtekst en de PDF-bijlage. Controleer het concept en klik zelf op Verzenden.';return true}
  if(share&&navigator.canShare?.({files:[f]})&&navigator.share){navigator.share({files:[f],title:subject,text:`Aan: ${to}\n${body}`}).catch(e=>{if(e.name!=='AbortError'){console.error(e);alert('Delen is niet gelukt. Gebruik E-mail openen + PDF downloaden.')}});return true}
  if(share){alert('PDF delen is hier niet beschikbaar. Gebruik E-mail openen + PDF downloaden.');return false}
  download(f);const a=document.createElement('a');a.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;document.body.append(a);a.click();a.remove();return true;
 }
 document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-closeout-order-button],[data-closeout-cancel],[data-packing-mail-pdf],[data-packing-share-pdf],[data-packing-outlook]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();
  if(button.hasAttribute('data-closeout-cancel'))closeModal();else if(button.dataset.closeoutOrderButton)open(button.dataset.closeoutOrderButton);else {const id=button.dataset.packingMailPdf||button.dataset.packingSharePdf||button.dataset.packingOutlook;const mode=button.hasAttribute('data-packing-outlook')?'outlook':button.hasAttribute('data-packing-share-pdf');window.RALAB_COMPLETED_ORDER_ACTIONS.bundle(id).then(b=>delivery(id,mode,b.order))}
 },true);
 document.addEventListener('submit',e=>{if(e.target.id!=='orderCloseoutForm')return;e.preventDefault();finish(e.target)},true);
 window.RALAB_ORDER_CLOSEOUT={open,finish,pdfBytes,file,emlBytes,delivery};
})();
