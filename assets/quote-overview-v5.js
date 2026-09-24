// rAlabaster quotation inbox v5: compact search/filter + real Office 365 send status
(()=>{
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(n));
const fmtDT=s=>{if(!s)return'';const d=new Date(s);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(e){console.error(e)}}
function customer(id){return(S()?.customers||[]).find(c=>c.id===id)}
function groups(){const by=new Map();for(const q of S()?.quotes||[]){const no=String(q.quoteNo||q.orderNo||q.id);if(!by.has(no))by.set(no,[]);by.get(no).push(q)}return[...by.entries()].map(([no,lines])=>({no,lines:lines.sort((a,b)=>(a.lineNo||0)-(b.lineNo||0))})).sort((a,b)=>String(b.no).localeCompare(String(a.no)))}
function total(lines){const adj=num(lines[0]?.adjustmentPct),sub=lines.reduce((a,q)=>a+num(q.qty)*num(q.saleUnit),0);return sub*(1+adj/100)}
function estimatedCost(lines){return lines.reduce((a,q)=>a+num(q.qty)*num(q.costUnit),0)}
function estimatedMargin(lines){return total(lines)-estimatedCost(lines)}
function estimatedMarginPct(lines){const revenue=total(lines);return revenue?estimatedMargin(lines)/revenue*100:0}
function statusOf(lines){
 const explicit=String(lines[0]?.quoteStatus||lines[0]?.status||'').toLowerCase();
 if(lines.some(q=>q.orderId)||explicit==='accepted')return'accepted';
 if(['followup','follow_up','opvolgen'].includes(explicit))return'followup';
 if(['lost','verloren'].includes(explicit))return'lost';
 if(['won','gewonnen'].includes(explicit))return'won';
 return'open';
}
function statusLabel(st){return({open:'Open',followup:'Opvolgen',accepted:'Geaccepteerd',won:'Gewonnen',lost:'Verloren'})[st]||'Open'}
function isOpenStatus(st){return !['accepted','won','lost'].includes(st)}
function createdOf(lines){return lines[0]?.created||String(lines[0]?.createdAt||lines[0]?.updatedAt||'').slice(0,10)||''}
function localDate(s){const d=new Date(String(s||'').slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?null:d}
function startOfWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x}
function inPeriod(date,period){
 if(period==='all')return true;
 const d=localDate(date);if(!d)return false;
 const now=new Date();now.setHours(12,0,0,0);
 if(period==='week'){const a=startOfWeek(now),b=new Date(a);b.setDate(b.getDate()+7);return d>=a&&d<b}
 if(period==='month')return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
 if(period==='quarter'){const q=Math.floor(now.getMonth()/3),dq=Math.floor(d.getMonth()/3);return d.getFullYear()===now.getFullYear()&&dq===q}
 return true;
}
function setStatus(no,status){
 const g=groups().find(x=>x.no===no);if(!g)return;
 const normalized=['open','followup','accepted','won','lost'].includes(status)?status:'open';
 g.lines.forEach(q=>{q.quoteStatus=normalized;q.status=normalized==='open'?'concept':normalized;q.statusChangedAt=new Date().toISOString()});
 persist();render();
}
function sentOf(lines){return lines[0]?.sentAt||lines[0]?.quotationSentAt||''}
function cName(q){return customer(q.customerId)?.name||q.customerSnapshot?.company||'—'}
function cEmail(q){return customer(q.customerId)?.email||q.customerSnapshot?.email||''}
function searchText(g){const q=g.lines[0];return[g.no,cName(q),q.customerReference,q.project,...g.lines.map(x=>x.name)].filter(Boolean).join(' ').toLowerCase()}
function render(){
 const root=document.getElementById('view-quotes'),s=S();if(!root||!s)return;
 const all=groups(),openAll=all.filter(g=>isOpenStatus(statusOf(g.lines))),openValue=openAll.reduce((n,g)=>n+total(g.lines),0);
 root.innerHTML=`<div class="toolbar" style="align-items:center;gap:8px;margin-bottom:10px"><h2 style="margin:0 10px 0 0">2. Offertes</h2><input id="quoteSearch" class="input" style="max-width:300px" placeholder="Zoek nummer, klant, referentie of product"><select id="quoteStatusFilter" class="input" style="max-width:175px"><option value="all">Alle statussen</option><option value="open">Open</option><option value="followup">Opvolgen</option><option value="accepted">Geaccepteerd</option><option value="won">Gewonnen</option><option value="lost">Verloren</option></select><select id="quotePeriodFilter" class="input" style="max-width:165px"><option value="all">Alle datums</option><option value="week">Deze week</option><option value="month">Deze maand</option><option value="quarter">Dit kwartaal</option></select><select id="quoteSentFilter" class="input" style="max-width:140px"><option value="all">Alle mail</option><option value="not_sent">Niet verzonden</option><option value="sent">Verzonden</option></select><label style="display:flex;align-items:center;gap:6px;white-space:nowrap"><input id="quoteMarginToggle" type="checkbox"> Geschatte marge tonen</label><div class="spacer"></div><button class="btn primary" type="button" data-new-quote>+ Nieuwe calculatie</button></div>
 <div class="quote-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px">
   <div class="panel" style="padding:12px"><span class="muted">Open offertes totaal</span><div style="font-size:24px;font-weight:800">${money(openValue)}</div><small>${openAll.length} offerte${openAll.length===1?'':'s'}</small></div>
   <div class="panel" style="padding:12px"><span class="muted">Offertes in filterperiode</span><div id="quotePeriodCount" style="font-size:24px;font-weight:800">—</div><small id="quotePeriodLabel">Alle datums</small></div>
   <div class="panel" style="padding:12px"><span class="muted">Waarde in filterperiode</span><div id="quotePeriodValue" style="font-size:24px;font-weight:800">—</div><small>excl. btw</small></div>
   <div class="panel" id="quoteMarginKpi" style="padding:12px;display:none"><span class="muted">Geschatte marge in filter</span><div id="quotePeriodMargin" style="font-size:24px;font-weight:800">—</div><small id="quotePeriodMarginPct">—</small></div>
 </div>
 <div class="panel" style="padding:0;overflow:hidden"><table style="margin:0"><thead><tr><th>Offerte</th><th>Aangemaakt</th><th>Klant</th><th>Referentie / project</th><th>Bedrag excl. btw</th><th class="quote-margin-col" style="display:none">Geschatte marge</th><th>Status</th><th>Mailstatus</th><th style="width:155px"></th></tr></thead><tbody id="quoteInboxBody"></tbody></table></div>`;
 const body=document.getElementById('quoteInboxBody');
 const draw=()=>{
   const term=(document.getElementById('quoteSearch')?.value||'').trim().toLowerCase(),
     sf=document.getElementById('quoteStatusFilter')?.value||'all',
     pf=document.getElementById('quotePeriodFilter')?.value||'all',
     mf=document.getElementById('quoteSentFilter')?.value||'all',
     showMargin=!!document.getElementById('quoteMarginToggle')?.checked;
   const periodGroups=all.filter(g=>inPeriod(createdOf(g.lines),pf));
   document.getElementById('quotePeriodCount').textContent=String(periodGroups.length);
   document.getElementById('quotePeriodValue').textContent=money(periodGroups.reduce((n,g)=>n+total(g.lines),0));
   document.getElementById('quotePeriodLabel').textContent=({all:'Alle datums',week:'Deze week',month:'Deze maand',quarter:'Dit kwartaal'})[pf]||'Alle datums';
   const periodRevenue=periodGroups.reduce((n,g)=>n+total(g.lines),0),periodMargin=periodGroups.reduce((n,g)=>n+estimatedMargin(g.lines),0);
   const marginKpi=document.getElementById('quoteMarginKpi');if(marginKpi)marginKpi.style.display=showMargin?'block':'none';
   const marginValue=document.getElementById('quotePeriodMargin');if(marginValue)marginValue.textContent=money(periodMargin);
   const marginPct=document.getElementById('quotePeriodMarginPct');if(marginPct)marginPct.textContent=(periodRevenue?(periodMargin/periodRevenue*100):0).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})+'% van omzet';
   document.querySelectorAll('.quote-margin-col').forEach(el=>el.style.display=showMargin?'':'none');
   const rows=all.filter(g=>{const st=statusOf(g.lines),sent=!!sentOf(g.lines);return(!term||searchText(g).includes(term))&&(sf==='all'||sf===st)&&inPeriod(createdOf(g.lines),pf)&&(mf==='all'||(mf==='sent'&&sent)||(mf==='not_sent'&&!sent))});
   body.innerHTML=rows.map(g=>{const q=g.lines[0],st=statusOf(g.lines),sent=sentOf(g.lines),email=cEmail(q),created=createdOf(g.lines);return`<tr class="clickrow" data-open-quote-row="${esc(g.no)}" style="cursor:pointer"><td><b>${esc(g.no)}</b><br><span class="muted">${g.lines.length} regel${g.lines.length===1?'':'s'}</span></td><td><b>${esc(created||'—')}</b></td><td><b>${esc(cName(q))}</b>${email?`<br><span class="muted">${esc(email)}</span>`:''}</td><td>${esc(q.customerReference||'—')}${q.project?`<br><span class="muted">${esc(q.project)}</span>`:''}</td><td><b>${money(total(g.lines))}</b></td><td class="quote-margin-col" style="${showMargin?'':'display:none'}"><b>${money(estimatedMargin(g.lines))}</b><br><span class="muted">${estimatedMarginPct(g.lines).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span></td><td><select class="input" data-quote-status="${esc(g.no)}" style="min-width:135px"><option value="open" ${st==='open'?'selected':''}>Open</option><option value="followup" ${st==='followup'?'selected':''}>Opvolgen</option><option value="accepted" ${st==='accepted'?'selected':''}>Geaccepteerd</option><option value="won" ${st==='won'?'selected':''}>Gewonnen</option><option value="lost" ${st==='lost'?'selected':''}>Verloren</option></select></td><td>${sent?`<span class="badge">Verzonden</span><br><span class="muted">${esc(fmtDT(sent))}</span>`:'<span class="badge">Niet verzonden</span>'}</td><td style="text-align:right;white-space:nowrap"><button class="btn small primary" type="button" data-send-office365="${esc(g.no)}">E-mail versturen</button></td></tr>`}).join('')||'<tr><td colspan="9" class="muted" style="padding:16px">Geen offertes binnen de huidige filters.</td></tr>';
 };
 ['quoteSearch','quoteStatusFilter','quotePeriodFilter','quoteSentFilter','quoteMarginToggle'].forEach(id=>document.getElementById(id)?.addEventListener(id==='quoteSearch'?'input':'change',draw));
 draw();
}
function mailData(no){const g=groups().find(x=>x.no===no);if(!g)return null;const q=g.lines[0],to=cEmail(q),amount=money(total(g.lines)),subject=`rAlabaster BV Quotation ${no}`,text=`Hello,\n\nYour quotation ${no} with an amount of ${amount} (excl. VAT) is ready for confirmation.\n\nDo not hesitate to contact us if you have any questions.\n\nKind regards,\n\nRalph Italiaander\nrAlabaster BV\n\n---\n\nThis is an automatically generated message. No rights can be derived from the content of this email and the attached quotation.`;return{g,q,to,subject,text}}
async function sendOffice365(no){const m=mailData(no);if(!m)return;if(!m.to){alert('No customer email address is stored. Open the quotation and add the email address first.');return}if(!confirm(`Send quotation ${no} to ${m.to} from info@ralabaster.com?`))return;const buttons=[...document.querySelectorAll(`[data-send-office365="${CSS.escape(no)}"],[data-send-office365-modal="${CSS.escape(no)}"]`)];buttons.forEach(b=>{b.disabled=true;b.textContent='Sending…'});try{const r=await fetch('/api/send-quotation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:m.to,subject:m.subject,text:m.text,quotationNo:no})});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok){if(j.code==='OFFICE365_NOT_CONFIGURED')throw new Error('Office 365 is not configured yet. Add the Microsoft Entra credentials in Vercel first.');throw new Error(j.error||`Send failed (${r.status})`)}const when=new Date().toISOString();m.g.lines.forEach(q=>{q.sentAt=when;q.quotationSentAt=when;q.sentTo=m.to;q.sentFrom='info@ralabaster.com'});persist();alert(`Quotation ${no} was sent successfully from info@ralabaster.com to ${m.to}.`);try{closeModal()}catch(_){}render()}catch(e){console.error(e);alert(e?.message||String(e));buttons.forEach(b=>{b.disabled=false;b.textContent='Send by email'})}}
function enhanceModal(no){setTimeout(()=>{const foot=document.querySelector('#modalRoot .modalfoot');if(!foot||foot.querySelector('[data-send-office365-modal]'))return;const b=document.createElement('button');b.className='btn primary';b.type='button';b.dataset.sendOffice365Modal=no;b.textContent='Send by email';const spacer=foot.querySelector('.spacer');if(spacer)spacer.insertAdjacentElement('afterend',b);else foot.appendChild(b)},25)}
function install(){if(window.RALAB_ERP)window.RALAB_ERP.renderQuotes=render;if(window.RALAB_DOCS)window.RALAB_DOCS.renderQuotes=render}
document.addEventListener('change',e=>{const st=e.target.closest?.('[data-quote-status]');if(st){e.preventDefault();e.stopPropagation();setStatus(st.dataset.quoteStatus,st.value)}} ,true);
document.addEventListener('click',e=>{const row=e.target.closest('[data-open-quote-row]');if(row&&!e.target.closest('button,select,input,label')){e.preventDefault();const no=row.dataset.openQuoteRow;window.RALAB_DOCS?.openQuote?.(no);enhanceModal(no);return}const send=e.target.closest('[data-send-office365]');if(send){e.preventDefault();e.stopPropagation();sendOffice365(send.dataset.sendOffice365);return}const sendM=e.target.closest('[data-send-office365-modal]');if(sendM){e.preventDefault();sendOffice365(sendM.dataset.sendOffice365Modal);return}const oq=e.target.closest('[data-open-quote]');if(oq)setTimeout(()=>enhanceModal(oq.dataset.openQuote),30);if(e.target.closest('.navbtn[data-view="quotes"]'))setTimeout(render,100)},true);
setTimeout(()=>{install();if(!document.getElementById('view-quotes')?.classList.contains('hidden'))render()},900);setTimeout(install,1800);window.RALAB_QUOTE_INBOX={render,sendOffice365,setStatus};
})();
