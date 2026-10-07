(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=x=>Number(x)||0;
 const COMPANY={name:'rAlabaster / Linck BV',address:'Kasteeldreef 18',postal:'5151 RS',city:'Drunen',country:'Nederland',phone:'+31 418 743101',email:'info@ralabaster.com',vat:'NL863451536B01',coc:'84982101'};
 let packingLogo='';
 const packingLogoReady=fetch('assets/ralabaster-logo.b64.txt').then(r=>r.ok?r.text():Promise.reject(new Error('logo'))).then(s=>{packingLogo=atob(s.replace(/\s+/g,''))}).catch(()=>{});
 function S(){try{return state}catch(_){return null}}
 function local(id){return S()?.orders?.find(o=>o.id===id&&!o.deleted)}
 function tasks(id){return (S()?.tasks||[]).filter(t=>t.orderId===id&&!t.deleted).sort((a,b)=>num(a.seq)-num(b.seq))}
 function customer(o){return S()?.customers?.find(c=>c.id===o.customerId)||o.customerSnapshot||{}}
 function expectedCosts(o,qty){
  const costing=o.costing||{},ops=costing.ops||[],material=num(o.materialCostUnit)*qty||num(costing.materialCost)*(costing.materialMode==='batch'?1:qty),external=ops.reduce((n,x)=>n+num(x.externalBatch)+num(x.externalUnit)*qty,0);
  return{material,external};
 }
 function open(id){
  if(window.RALAB_CUSTOMER_MODE?.active()){alert('Zet klantmodus uit om interne tijden en verbruik te controleren.');return false}
  const o=local(id);if(!o)return false;
  const ts=tasks(id),pending=ts.filter(t=>!['done','completed'].includes(t.status)).length,qty=num(o.completedQty)||num(o.qty),startMode=o.startWeightMode==='unit'?'unit':'batch',startValue=startMode==='unit'?(num(o.startWeightUnitKg)||(qty?num(o.startWeightKg)/qty:0)):num(o.startWeightKg),expected=expectedCosts(o,qty),saleUnit=num(o.saleUnit)||(qty?num(o.totalSale)/qty:0),startTotal=startMode==='unit'?startValue*qty:startValue,materialPrice=num(o.materialPricePerKg)||(startTotal&&expected.material?expected.material/startTotal:0),externalActual=o.actualExternalCostTotal==null?expected.external:num(o.actualExternalCostTotal);
  showModal(`<div class="modalhead"><h3>Order afronden · ${esc(o.orderNo)}</h3></div><form id="orderCloseoutForm" data-closeout-order="${esc(id)}"><div class="modalbody"><p><b>${esc(o.customerName||'')} · ${esc(o.product)}</b></p><div class="notice">Controleer eerst de nacalculatie. Bij afronden worden ${pending} nog openstaande taken gereed gemarkeerd en uit de planning gehaald.</div><div class="grid3"><div class="field"><label>Aantal gereed</label><input class="input" id="closeoutQty" type="number" min="1" max="${num(o.qty)}" step="1" required value="${qty}"></div><div class="field"><label>Beginmateriaal invoeren als</label><select class="input" id="closeoutStartWeightMode"><option value="batch" ${startMode==='batch'?'selected':''}>Totaal voor de batch</option><option value="unit" ${startMode==='unit'?'selected':''}>Per product</option></select><label data-start-weight-label style="display:block;margin-top:7px">${startMode==='unit'?'Beginmateriaal per product (kg)':'Totaal beginmateriaal batch (kg)'}</label><input class="input" id="closeoutStartWeight" data-weight-mode="${startMode}" type="number" min="0" step="0.001" value="${Math.round(startValue*1000)/1000}"><div class="muted" data-start-weight-help></div></div><div class="field"><label>Eindgewicht per product (kg)</label><input class="input" id="closeoutUnitWeight" type="number" min="0" step="0.001" value="${num(o.endUnitWeightKg)}"></div></div><div class="panel" data-internal-finance style="padding:12px;margin:12px 0"><b>Prijzen voor de nacalculatie</b><div class="grid3" style="margin-top:8px"><div class="field"><label>Verkoopprijs per product (€)</label><input class="input" id="closeoutSaleUnit" type="number" min="0" step="0.01" value="${Math.round(saleUnit*100)/100}"></div><div class="field"><label>Materiaalprijs per kg (€)</label><input class="input" id="closeoutMaterialPriceKg" type="number" min="0" step="0.01" value="${Math.round(materialPrice*100)/100}"><div class="muted">Beginmateriaal × prijs/kg</div></div><div class="field"><label>Werkelijke externe / overige kosten totaal (€)</label><input class="input" id="closeoutExternalCost" type="number" min="0" step="0.01" value="${Math.round(externalActual*100)/100}"></div></div><div class="muted">Tijdsverschillen worden automatisch tegen het uurtarief uit de oorspronkelijke calculatie gewaardeerd.</div></div><div style="overflow:auto"><table><thead><tr><th>Processtap</th><th>Begroot (min)</th><th>Werkelijk (min)</th><th>Verbruik</th><th>Interne opmerking</th></tr></thead><tbody>${ts.map(t=>`<tr data-closeout-task="${esc(t.id)}"><td><b>${esc(t.name)}</b><br>${esc(t.machine||'')}</td><td>${num(t.estimate)}</td><td><input class="input" data-closeout-actual type="number" min="0" step="0.01" required value="${num(t.actual)}"></td><td><input class="input" data-closeout-consumption value="${esc(t.consumption||'')}" placeholder="bijv. 12 kg albast"></td><td><input class="input" data-closeout-note value="${esc(t.note||'')}"></td></tr>`).join('')}</tbody></table></div><div class="field"><label>Opmerking op de pakbon (zichtbaar voor klant)</label><textarea id="closeoutDeliveryNote">${esc(o.deliveryNote||'')}</textarea></div><label><input type="checkbox" id="closeoutChecked" required> Ik heb tijden, verbruik, prijzen en aantal gecontroleerd.</label></div><div class="modalfoot"><button class="btn" type="button" data-closeout-cancel>Annuleren</button><div class="spacer"></div><button class="btn primary" type="submit">Controle opslaan en order afronden</button></div></form>`);
  updateStartWeight(false);
  return true;
 }
 function updateStartWeight(convert=true){
  const select=document.getElementById('closeoutStartWeightMode'),input=document.getElementById('closeoutStartWeight'),qty=Math.max(1,num(document.getElementById('closeoutQty')?.value));if(!select||!input)return;
  const next=select.value==='unit'?'unit':'batch',previous=input.dataset.weightMode||next;let value=num(input.value);
  if(convert&&next!==previous&&value)value=next==='unit'?value/qty:value*qty;
  input.value=value?String(Math.round(value*1000)/1000):'';input.dataset.weightMode=next;
  const label=document.querySelector('[data-start-weight-label]'),help=document.querySelector('[data-start-weight-help]'),total=next==='unit'?value*qty:value;
  if(label)label.textContent=next==='unit'?'Beginmateriaal per product (kg)':'Totaal beginmateriaal batch (kg)';
  if(help)help.textContent=value?(next==='unit'?`${Math.round(value*1000)/1000} kg × ${qty} producten = ${Math.round(total*1000)/1000} kg totaal`:`${Math.round(total*1000)/1000} kg totaal voor deze batch`):'';
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
   const startMode=document.getElementById('closeoutStartWeightMode').value==='unit'?'unit':'batch',startEntered=num(document.getElementById('closeoutStartWeight').value);o.startWeightMode=startMode;o.startWeightUnitKg=startMode==='unit'?startEntered:(qty?startEntered/qty:0);o.startWeightKg=startMode==='unit'?startEntered*qty:startEntered;o.endUnitWeightKg=num(document.getElementById('closeoutUnitWeight').value);o.completedQty=qty;o.endTotalWeightKg=qty*o.endUnitWeightKg;o.yieldPct=o.startWeightKg?o.endTotalWeightKg/o.startWeightKg*100:null;
   o.saleUnit=num(document.getElementById('closeoutSaleUnit').value);o.completedRevenue=o.saleUnit*qty;o.materialPricePerKg=num(document.getElementById('closeoutMaterialPriceKg').value);o.actualMaterialCostTotal=o.startWeightKg&&o.materialPricePerKg?o.startWeightKg*o.materialPricePerKg:expectedCosts(o,qty).material;o.actualExternalCostTotal=num(document.getElementById('closeoutExternalCost').value);o.financialCloseoutAt=at;
   o.deliveryNote=document.getElementById('closeoutDeliveryNote').value;o.closed=true;o.active=false;o.status='completed';o.completedAt=o.completedAt||at;o.postCalculationCheckedAt=at;
   S().completedOrders=S().completedOrders||[];if(!S().completedOrders.includes(o.id))S().completedOrders.push(o.id);
   save();window.RALAB_PERFORMANCE?.invalidate?.();window.RALAB_ERP?.renderOrderOverview?.();window.RALAB_COMPLETED_ORDER_ACTIONS?.open?.(o.id);return true;
  }catch(e){Object.assign(o,before.o);for(const t of ts)Object.assign(t,before.tasks.find(x=>x.id===t.id));console.error(e);alert('Afronden kon niet worden opgeslagen. Controleer de verbinding en probeer opnieuw.');return false}
 }
 function pdfText(value){
  return String(value??'').replace(/[\r\n]+/g,' ').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\xff]/g,'?').replace(/[\\()]/g,'\\$&').replace(/[\x80-\xff]/g,c=>'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'));
 }
 function wrap(value,max=44){const text=String(value??'').replace(/\r/g,'');return text.split('\n').flatMap(line=>{const result=[];while(line.length>max){let i=line.lastIndexOf(' ',max);if(i<Math.min(15,max/2))i=max;result.push(line.slice(0,i));line=line.slice(i).trimStart()}return [...result,line]})}
 function pdfBytes(o){
  const c=customer(o),commands=[],dark='0.245 0.255 0.286',green='0.080 0.285 0.245',ink='0.130 0.145 0.150',muted='0.390 0.420 0.420',light='0.945 0.950 0.945';
  const text=(x,y,size,value,bold=false,color=ink)=>commands.push(`${color} rg BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`);
  const line=(x1,y1,x2,y2,width=.6,color='0.75 0.77 0.76')=>commands.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const fill=(x,y,w,h,color)=>commands.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
  const label=(x,y,name,value,width=33)=>{text(x,y,8,name.toUpperCase(),true,green);wrap(value||'-',width).slice(0,2).forEach((v,i)=>text(x,y-15-i*13,10,v,false,ink))};
  fill(0,715,595,127,dark);
  if(packingLogo)commands.push('q 190 0 0 70 42 742 cm /Logo Do Q');else text(45,772,25,'rAlabaster',true,'1 1 1');
  ['rAlabaster / Linck BV',COMPANY.address,`${COMPANY.postal} ${COMPANY.city}`,COMPANY.country,COMPANY.phone,COMPANY.email].forEach((v,i)=>text(392,806-i*13,i?8.2:9,v,i===0,'1 1 1'));
  text(45,672,24,'PAKBON',true,dark);text(45,651,9,'BEGELEIDEND DOCUMENT BIJ LEVERING',false,muted);
  text(410,674,8,'PAKBONNUMMER',true,green);text(410,654,13,String(o.orderNo||o.id||'-'),true,dark);
  line(45,633,550,633,1,green);
  text(45,608,9,'LEVERINGSADRES',true,green);
  const customerName=c.name||c.company||o.customerName||'-',address=[c.address||c.street,[c.zip||c.postal||c.postcode,c.city].filter(Boolean).join(' '),c.country,c.contact?`t.a.v. ${c.contact}`:''].filter(Boolean);
  text(45,586,11,customerName,true,dark);address.flatMap(x=>wrap(x,43)).slice(0,4).forEach((v,i)=>text(45,569-i*14,9.5,v,false,ink));
  text(323,608,9,'DOCUMENTGEGEVENS',true,green);
  label(323,586,'Datum',new Date().toLocaleDateString('nl-NL'));label(438,586,'Ordernummer',o.orderNo||'-',22);
  label(323,536,'Klantreferentie',o.customerReference||'-');label(438,536,'Project',o.project||'-',22);
  text(45,473,9,'GELEVERDE ARTIKELEN',true,green);
  fill(45,438,505,27,dark);text(57,448,9,'OMSCHRIJVING',true,'1 1 1');text(401,448,9,'VERPAKKING',true,'1 1 1');text(516,448,9,'AANTAL',true,'1 1 1');
  fill(45,379,505,59,light);
  wrap(o.product||'-',55).slice(0,3).forEach((v,i)=>text(57,416-i*14,10,v,i===0,dark));
  text(401,416,10,String(o.packages||'-'),false,ink);text(516,416,11,String(num(o.completedQty)||num(o.qty)),true,dark);
  line(45,379,550,379,.8,green);
  text(45,348,9,'OPMERKING BIJ LEVERING',true,green);fill(45,269,505,63,'0.975 0.976 0.972');
  wrap(o.deliveryNote||'Geen bijzonderheden.',78).slice(0,4).forEach((v,i)=>text(57,307-i*14,9.5,v,false,ink));
  text(45,224,9,'ONTVANGSTBEVESTIGING',true,green);text(45,199,8.5,'Naam ontvanger',false,muted);text(244,199,8.5,'Datum',false,muted);text(373,199,8.5,'Handtekening',false,muted);
  line(45,165,220,165,.7);line(244,165,345,165,.7);line(373,165,550,165,.7);
  line(45,77,550,77,.6);
  text(45,58,7.5,`${COMPANY.name}  |  ${COMPANY.address}, ${COMPANY.postal} ${COMPANY.city}  |  ${COMPANY.email}`,false,muted);
  text(45,45,7.5,`BTW ${COMPANY.vat}  |  KvK ${COMPANY.coc}  |  ${COMPANY.phone}`,false,muted);text(531,45,7.5,'1 / 1',false,muted);
  const stream=commands.join('\n'),objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  let logoId=0;if(packingLogo){logoId=objects.length;objects.push(`<< /Type /XObject /Subtype /Image /Width 420 /Height 155 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${packingLogo.length} >>\nstream\n${packingLogo}\nendstream`)}
  const contentId=objects.length;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);const pageId=objects.length,resources=`/Font << /F1 3 0 R /F2 4 0 R >>${logoId?` /XObject << /Logo ${logoId} 0 R >>`:''}`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << ${resources} >> /Contents ${contentId} 0 R >>`);objects[2]=`<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`;
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
  if(share==='outlook'){download(new File([emlBytes(o,to)],`Pakbon-${String(o.orderNo||o.id).replace(/[^\w.-]/g,'_')}.eml`,{type:'message/rfc822'}));window.RALAB_COMPLETED_ORDER_ACTIONS?.markDeliveryDraft?.(o.id,to);const status=document.querySelector('[data-packing-draft-status]');if(status)status.textContent='Concept gemaakt en geregistreerd. Open het .eml-bestand in Outlook, verstuur het en klik daarna op “Markeer pakbon als verzonden”.';return true}
  if(share&&navigator.canShare?.({files:[f]})&&navigator.share){navigator.share({files:[f],title:subject,text:`Aan: ${to}\n${body}`}).catch(e=>{if(e.name!=='AbortError'){console.error(e);alert('Delen is niet gelukt. Gebruik E-mail openen + PDF downloaden.')}});return true}
  if(share){alert('PDF delen is hier niet beschikbaar. Gebruik E-mail openen + PDF downloaden.');return false}
  download(f);const a=document.createElement('a');a.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;document.body.append(a);a.click();a.remove();return true;
 }
 document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-closeout-order-button],[data-closeout-cancel],[data-packing-mail-pdf],[data-packing-share-pdf],[data-packing-outlook]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();
  if(button.hasAttribute('data-closeout-cancel'))closeModal();else if(button.dataset.closeoutOrderButton)open(button.dataset.closeoutOrderButton);else {const id=button.dataset.packingMailPdf||button.dataset.packingSharePdf||button.dataset.packingOutlook;const mode=button.hasAttribute('data-packing-outlook')?'outlook':button.hasAttribute('data-packing-share-pdf');window.RALAB_COMPLETED_ORDER_ACTIONS.bundle(id).then(async b=>{await packingLogoReady;delivery(id,mode,b.order)})}
 },true);
 document.addEventListener('submit',e=>{if(e.target.id!=='orderCloseoutForm')return;e.preventDefault();finish(e.target)},true);
 document.addEventListener('change',e=>{if(e.target.id==='closeoutStartWeightMode')updateStartWeight(true)},true);
 document.addEventListener('input',e=>{if(e.target.id==='closeoutStartWeight'||e.target.id==='closeoutQty')updateStartWeight(false)},true);
 window.RALAB_ORDER_CLOSEOUT={open,finish,pdfBytes,file,emlBytes,delivery};
})();
