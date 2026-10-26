// Read-only view of current production phases, shared with the order overview.
(()=>{'use strict';
 const S=()=>{try{return state}catch(_){return null}};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const done=t=>['done','completed'].includes(String(t.status||'').toLowerCase());
 const active=o=>window.RALAB_ORDER_PRINT?.active(o)??(!o.deleted&&o.active!==false&&!o.closed&&o.status!=='completed');
 const name=t=>String(t.assignedMachine||t.machine||t.name||'Werkplek ontbreekt').replace(/\s*-\s*instellen\s*$/i,'').trim();
 const key=n=>window.RALAB_PRODUCTION_CORE?.canonical(n)||String(n).toLowerCase().trim();
 let floor={},freshAt=null,loading=false,problem='',query='';
 function columns(state,snapshot={},search='',at=Date.now()){
  const groups=new Map(),workplaces=state.workplaces||[],rank=new Map(workplaces.map((w,i)=>[key(w.name),i]));
  function add(o,t,label,status,source){const k=key(label);if(!groups.has(k))groups.set(k,{key:k,name:workplaces.find(w=>key(w.name)===k)?.name||label,cards:[]});
   const col=groups.get(k);if(col.cards.some(c=>c.order.id===o.id&&c.task?.id===t?.id))return;col.cards.push({order:o,task:t,status,source});}
  for(const o of (state.orders||[]).filter(active)){
   if(search&&!`${o.orderNo||''} ${o.product||''} ${o.customerName||''}`.toLowerCase().includes(search.toLowerCase()))continue;
   const route=(state.tasks||[]).filter(t=>t.orderId===o.id&&!t.deleted&&!t.isStaffAbsence).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
   if(o.needsCalculation||!route.length){add(o,null,'Route aanvullen','Nog uitwerken','route');continue}
   const selection=window.RALAB_ERP?.overviewCurrent(o,route,snapshot)||{task:route.find(t=>!done(t)),source:'route'};
   if(!selection.task){add(o,null,'Gereed / leveren','Productiestappen gereed','route');continue}
   const F=window.RALAB_PRODUCTION_FORECAST,live=(snapshot.sessions||[]).filter(s=>s.order_id===o.id&&!s.ended_at&&Date.parse(s.auto_end)>at).map(s=>({session:s,task:F?.taskFor(s,route)})).filter(x=>x.task&&!done(x.task));
   const selected=selection.source==='manual'?[]:live;
   if(selected.length){for(const {task,session} of selected)add(o,task,session.workplace_name||name(task),session.phase==='downtime'?'Stilstand':session.phase==='waiting'?'Wachten':'In productie','live');continue}
   const current=selection.task,candidates=route.filter(t=>!done(t)&&(t.id===current.id||current.parallelGroupId&&t.parallelGroupId===current.parallelGroupId));
   for(const t of candidates){const label=t.id===current.id&&selection.workplace?selection.workplace:name(t),status=t.type==='wait'?'Wachten / drogen':t.type==='external'?'Extern':['in_progress','started'].includes(t.status)?'In productie':'Klaar voor deze fase';add(o,t,label,status,selection.source);}
  }
  return [...groups.values()].sort((a,b)=>(rank.get(a.key)??999)-(rank.get(b.key)??999)||a.name.localeCompare(b.name,'nl')).map(g=>({...g,cards:g.cards.sort((a,b)=>String(a.order.communicatedDeadline||a.order.deadline||'9999').localeCompare(String(b.order.communicatedDeadline||b.order.deadline||'9999'))||String(a.order.orderNo).localeCompare(String(b.order.orderNo),'nl'))}));
 }
 function card(c){const o=c.order,t=c.task,reported=t&&!t.stageCorrection&&Number(t.doneQty)>0;
  return `<article class="queue-card" data-queue-order="${esc(o.id)}"><div class="queue-card-top"><b>${esc(o.orderNo||'Ordernummer ontbreekt')}</b><span class="queue-badge ${c.source==='live'?'queue-live':''}">${esc(c.status)}</span></div><h3>${esc(o.product||'Product ontbreekt')}</h3><p>${esc(o.customerName||'Klant ontbreekt')}</p>${t?`<p class="queue-operation">${esc(t.name||t.machine)} · stap ${esc(t.seq||'—')}</p>`:''}<dl><div><dt>Orderaantal</dt><dd>${o.quantityPending?'Nog invullen':esc(o.qty??'Ontbreekt')}</dd></div>${reported?`<div><dt>Gemeld op deze stap</dt><dd>${esc(t.doneQty)}</dd></div>`:''}${o.deliveries?.length?`<div><dt>Geleverd / backorder</dt><dd>${Number(o.deliveredQty)||0} / ${Math.max(0,Number(o.qty)-(Number(o.deliveredQty)||0))}</dd></div>`:''}<div><dt>Bevestigde leverdatum</dt><dd>${esc(o.communicatedDeadline||o.deadline||'Niet vastgelegd')}</dd></div></dl><div class="queue-actions"><button type="button" class="btn small" data-queue-open="${esc(o.id)}">Order openen</button>${t?`<button type="button" class="btn small" data-queue-stage="${esc(o.id)}">Fase bijwerken</button>`:''}</div></article>`;
 }
 function render(){const root=document.getElementById('view-workplacequeue');if(!root)return;const s=S();if(!s){root.textContent='Plannergegevens worden geladen…';return}
  const groups=columns(s,floor,query),count=new Set(groups.flatMap(g=>g.cards.map(c=>c.order.id))).size;
  root.innerHTML=`<div class="toolbar"><div><h2>Werk per werkplek</h2><p>Combineer werk van orders die bij dezelfde productiefase staan.</p></div><div class="spacer"></div><label>Zoek order, product of klant<input class="input" type="search" data-queue-search value="${esc(query)}"></label><button class="btn" type="button" data-queue-refresh ${loading?'disabled':''}>${loading?'Ophalen…':'Vernieuwen'}</button></div><div class="queue-info" role="status">${count} orders · ${groups.length} werkplekken met werk. ${freshAt?`Werkvloer bijgewerkt ${esc(new Date(freshAt).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}))}.`:'Stand volgens orderroute; werkvloer wordt opgehaald.'}${problem?` ${esc(problem)}`:''}<p>Een order staat bij de huidige fase. Parallel werk kan op meerdere werkplekken staan. ‘Klaar voor’ volgt uit de geregistreerde route; ‘In productie’ uit een actieve registratie of taakstatus.</p></div><div class="queue-board" tabindex="0" aria-label="Werkplekken, horizontaal schuiven">${groups.map(g=>`<section class="queue-column" data-queue-workplace="${esc(g.name)}"><header><h3>${esc(g.name)}</h3><span>${new Set(g.cards.map(c=>c.order.id)).size} orders · ${g.cards.length} taken</span></header><div class="queue-cards">${g.cards.map(card).join('')}</div></section>`).join('')||'<div class="panel" style="padding:24px">Geen lopende orders voor deze zoekopdracht.</div>'}</div>`;
 }
 async function refresh(){if(loading)return;loading=true;problem='';render();let timer;
  try{const db=window.RALAB_ADMIN_AUTH?.client;if(!db){problem='Geen online werkvloerverbinding; de orderroute blijft zichtbaar.';return}
   const r=await Promise.race([db.rpc('production_monitor_snapshot'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Werkvloer reageert niet op tijd; de laatst geladen stand blijft zichtbaar.')),15000)})]);
   if(r.error)throw Error(r.error.message);floor=r.data||{};freshAt=Date.now();
  }catch(e){problem=e.message||'Werkvloer niet opgehaald.'}finally{clearTimeout(timer);loading=false;render()}
 }
 function show(){window.RALAB_ERP?.show('workplacequeue');render();refresh()}
 window.addEventListener('click',e=>{const b=e.target.closest?.('[data-view="workplacequeue"],[data-queue-refresh],[data-queue-open],[data-queue-stage]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.dataset.view)show();else if(b.hasAttribute('data-queue-refresh'))refresh();else if(b.dataset.queueOpen)window.RALAB_ERP?.openOrder(b.dataset.queueOpen);else window.RALAB_ERP?.openOverviewStep(b.dataset.queueStage)},true);
 document.addEventListener('input',e=>{if(!e.target.matches?.('[data-queue-search]'))return;query=e.target.value;const start=e.target.selectionStart;render();const field=document.querySelector('[data-queue-search]');field?.focus();field?.setSelectionRange(start,start)});
 setInterval(()=>{const root=document.getElementById('view-workplacequeue');if(root&&!root.classList.contains('hidden'))refresh()},30000);
 window.RALAB_WORKPLACE_QUEUE={columns,render,refresh,show};
})();
