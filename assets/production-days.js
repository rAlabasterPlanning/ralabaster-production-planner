(function(root){
'use strict';
const C=root.RALAB_PRODUCTION_CORE||(typeof require==='function'?require('./production-core.js'):null);
function coverage(employee,day,snapshot,at){
 const shift=C.shift(employee,C.wall(day,720)),start=C.wall(day,shift.start),end=Math.min(C.wall(day,shift.end),+new Date(at));
 const attendance=(snapshot.attendance||[]).find(a=>a.employee===employee&&a.day===day),absent=(snapshot.staffAbsences||[]).some(a=>a.employee===employee&&a.startDate<=day&&a.endDate>=day);
 const hasLabor=(snapshot.labor||[]).some(l=>l.employee===employee&&!l.superseded_at&&C.local(l.started_at).day===day);
 if((attendance?.status==='absent'||absent&&attendance?.status!=='present')&&!hasLabor||!shift.scheduled&&attendance?.status!=='present'&&!hasLabor)return{start,end:start,total:0,assigned:0,missing:0,gaps:[]};
 if(end<=start)return{start,end,total:0,assigned:0,missing:0,gaps:[]};
 const busy=(snapshot.labor||[]).filter(l=>l.employee===employee&&!l.superseded_at).map(l=>[Math.max(start,+new Date(l.started_at)),Math.min(end,+new Date(l.ended_at||at),+new Date(l.stop_at))]);
 for(const [a,b] of [[600,615],[735,765]])busy.push([Math.max(start,C.wall(day,a)),Math.min(end,C.wall(day,b))]);
 busy.sort((a,b)=>a[0]-b[0]);let cursor=start;const gaps=[];
 for(const [a,b] of busy){if(b<=a)continue;if(a>cursor)gaps.push({start:cursor,end:a});cursor=Math.max(cursor,b)}
 if(cursor<end)gaps.push({start:cursor,end});
 const missing=gaps.reduce((sum,g)=>sum+C.minutes(g.start,g.end),0),total=C.minutes(start,end);
 return{start,end,total,assigned:total-missing,missing,gaps};
}
const api={coverage};root.RALAB_PRODUCTION_DAYS=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),floor=()=>root.RALAB_PRODUCTION_FLOOR,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let closing=false;
const time=at=>new Date(at).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}),hours=n=>(n/60).toLocaleString('nl-NL',{maximumFractionDigits:2});
function open(employee,close=false,day){closing=close;const s=floor().getSnapshot();day=day||C.local(s.serverNow).day;
 $('floorModal').innerHTML=`<div class="floor-modalback"><div class="floor-dialog" role="dialog" aria-modal="true" aria-labelledby="dayHoursTitle"><div class="floor-dialog-head"><h2 id="dayHoursTitle">Daguren controleren</h2><button class="floor-close" data-close aria-label="Sluiten">×</button></div><div class="floor-dialog-body"><p>Controleer de hele werkdag. Pauzes en reeds geboekte medewerkeruren tellen eenmaal mee. Koppel alleen de ontbrekende tijd aan het project waaraan je hebt gewerkt.</p><div class="backfill-grid"><label>Medewerker<select id="dayEmployee">${C.EMPLOYEES.map(e=>`<option ${e===employee?'selected':''}>${e}</option>`).join('')}</select></label><label>Werkdag<input id="dayDate" type="date" value="${esc(day)}" max="${C.local(s.serverNow).day}" ${close?'disabled':''}></label></div><div id="dayCoverage"></div><p id="dayHoursError" role="alert"></p></div></div></div>`;render();
}
function render(){const s=floor().getSnapshot(),day=$('dayDate').value,emp=$('dayEmployee').value,c=coverage(emp,day,s,Date.parse(s.serverNow));const orders=s.backfillOrders||s.orders;
 $('dayCoverage').innerHTML=`<div class="opening-known">Werkdag: <b>${hours(c.total)} uur</b> · Toegewezen: <b>${hours(c.assigned)} uur</b> · Nog toewijzen: <b>${hours(c.missing)} uur</b></div>${c.gaps.map((g,i)=>`<div class="count-row" data-day-gap="${i}" data-start="${g.start}" data-end="${g.end}"><b>${time(g.start)}–${time(g.end)} · ${hours(C.minutes(g.start,g.end))} uur ontbreekt</b><div class="backfill-grid"><label>Van<input type="time" data-gap-start value="${time(g.start)}"></label><label>Tot<input type="time" data-gap-end value="${time(g.end)}"></label></div><label>Project<select data-gap-order><option value="">Kies project</option>${orders.map(o=>`<option value="${esc(o.id)}">${esc(o.orderNo)} · ${esc(o.product)}</option>`).join('')}</select></label></div>`).join('')}${c.missing>0?'<label>Toelichting<input id="dayHoursReason" value="Ontbrekende daguren toegewezen"></label><button class="action-button" data-day-hours-save>Gekozen uren toewijzen</button>':`<p>Alle uren tot ${time(c.end)} zijn toegewezen.</p>${closing?'<button class="action-button" data-day-hours-close>Dag afsluiten</button>':'<button class="secondary-button" data-close>Klaar</button>'}`}`;
}
document.addEventListener('change',e=>{if(['dayEmployee','dayDate'].includes(e.target.id)){closing=false;render()}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.hasAttribute('data-day-hours-close')){await floor().send('close_day',{employee:$('dayEmployee').value,rows:[]});return}
 if(!b.hasAttribute('data-day-hours-save'))return;
 const employee=$('dayEmployee').value,day=$('dayDate').value,wasClosing=closing,rows=[];
 for(const row of document.querySelectorAll('[data-day-gap]')){const order=row.querySelector('[data-gap-order]').value;if(!order)continue;const toStamp=val=>{const parts=val.split(':').map(Number);return new Date(C.wall(day,parts[0]*60+parts[1])).toISOString()};rows.push({order_id:order,start:row.querySelector('[data-gap-start]').value===time(Number(row.dataset.start))?new Date(Number(row.dataset.start)).toISOString():toStamp(row.querySelector('[data-gap-start]').value),end:row.querySelector('[data-gap-end]').value===time(Number(row.dataset.end))?new Date(Number(row.dataset.end)).toISOString():toStamp(row.querySelector('[data-gap-end]').value)})}
 if(!rows.length)throw Error('Kies minstens één project voor de ontbrekende uren');
 await floor().send('day_allocation',{employee,day,rows,reason:$('dayHoursReason').value});if(!floor().hasPending())open(employee,wasClosing,day);
 }catch(err){if($('dayHoursError'))$('dayHoursError').textContent=err.message;else floor().toast(err.message)}});
api.open=open;
})(typeof window!=='undefined'?window:globalThis);
