// rAlabaster backup and recovery controls.
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x?new Date(x).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'}):'Nog geen back-up';
const client=()=>typeof supabaseClient!=='undefined'?supabaseClient:null;
async function rpc(name,args={}){const c=client();if(!c||typeof cloudUser==='undefined'||!cloudUser)throw new Error('Log eerst in bij Supabase.');const {data,error}=await c.rpc(name,args);if(error)throw error;return data}
function download(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function refresh(){
 const box=document.getElementById('backupRecoveryPanel');if(!box)return;
 const status=box.querySelector('[data-backup-status]'),list=box.querySelector('[data-backup-list]');status.textContent='Back-upstatus laden…';
 try{const x=await rpc('planner_backup_status'),latest=x?.latest||{},rows=x?.snapshots||[];status.innerHTML=`<span class="badge ${x.healthy?'ok':'bad'}">${x.healthy?'Back-up actief':'Back-up controleren'}</span> Laatste herstelpunt: <b>${esc(fmt(latest.createdAt))}</b> · ${Number(latest.orders)||0} orders · ${Number(latest.tasks)||0} taken<br><span class="muted">Ieder uur 7 dagen · dagelijks 90 dagen · dagelijkse taak ${x.dailyActive?'actief':'niet actief'} · uurtaak ${x.hourlyActive?'actief':'niet actief'}</span>`;list.innerHTML=rows.map(r=>`<tr><td>${esc(fmt(r.createdAt))}</td><td>${esc(r.reason)}</td><td>${Number(r.orders)||0}</td><td>${Number(r.tasks)||0}</td><td><button class="btn small" type="button" data-backup-preview="${r.id}">Bekijken</button></td></tr>`).join('')||'<tr><td colspan="5">Nog geen herstelpunten.</td></tr>'}catch(e){status.textContent='Back-upstatus niet beschikbaar: '+(e.message||e);list.innerHTML=''}
}
function install(){
 const root=document.getElementById('view-settings');if(!root||root.classList.contains('hidden')||root.querySelector('#backupRecoveryPanel'))return;
 const panel=document.createElement('div');panel.id='backupRecoveryPanel';panel.className='panel';panel.style.cssText='padding:16px;margin:16px 0;max-width:980px';
 panel.innerHTML=`<div class="toolbar"><h2 style="margin:0">Back-up en herstel</h2></div><div class="notice" data-backup-status>Back-upstatus laden…</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button class="btn primary" type="button" data-backup-download>Volledige back-up maken</button><button class="btn" type="button" data-backup-now>Alleen herstelpunt maken</button></div><div class="muted" style="margin-bottom:10px">Een volledige back-up synchroniseert eerst alle wijzigingen, maakt een herstelpunt en downloadt daarna een los JSON-bestand. Bewaar dat bestand ook buiten Supabase, bijvoorbeeld in OneDrive. Een terugzetactie maakt eerst automatisch een extra herstelpunt.</div><div style="overflow:auto"><table><thead><tr><th>Moment</th><th>Type</th><th>Orders</th><th>Taken</th><th></th></tr></thead><tbody data-backup-list></tbody></table></div>`;
 root.appendChild(panel);refresh();
}
async function makeNow(btn){btn.disabled=true;try{await rpc('planner_create_backup',{p_reason:'manual'});await refresh();alert('Herstelpunt gemaakt.')}catch(e){alert('Herstelpunt maken mislukt: '+(e.message||e))}finally{btn.disabled=false}}
async function exportNow(btn){
 const original=btn.textContent;btn.disabled=true;
 try{
  btn.textContent='Wijzigingen opslaan…';
  const flush=window.RALAB_PERFORMANCE?.flushCloudSave;if(typeof flush!=='function')throw new Error('De veilige synchronisatie is nog niet geladen. Vernieuw de pagina en probeer opnieuw.');
  await flush();
  btn.textContent='Back-up maken…';
  const x=await rpc('planner_export_backup'),stamp=new Date(x?.exportedAt||Date.now()).toISOString().replace(/[:.]/g,'-');
  download(`rAlabaster-volledige-backup-${stamp}.json`,JSON.stringify(x,null,2));
  const orders=Number(x?.data?.orders?.length)||0,tasks=Number(x?.data?.tasks?.length)||0;
  await refresh();
  alert(`Volledige back-up gemaakt: ${orders} orders en ${tasks} taken. Het herstelpunt staat veilig in het systeem en het back-upbestand is gedownload.`);
 }catch(e){alert('Volledige back-up maken mislukt: '+(e.message||e))}finally{btn.disabled=false;btn.textContent=original}
}
async function preview(id){
 try{const x=await rpc('planner_restore_preview',{p_snapshot_id:Number(id)}),root=document.getElementById('modalRoot');root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(640px,94vw)"><div class="modalhead"><h3>Herstelpunt bekijken</h3></div><div class="modalbody"><div class="notice"><b>${esc(fmt(x.createdAt))}</b><br>${Number(x.orders)||0} orders · ${Number(x.tasks)||0} taken · ${Number(x.workers)||0} medewerkers</div><p>Bij terugzetten worden de plannergegevens vervangen door dit moment. Vlak daarvoor wordt automatisch nog een extra herstelpunt gemaakt.</p><label><input type="checkbox" data-restore-check> Ik heb datum en aantallen gecontroleerd.</label><div class="field" style="margin-top:12px"><label>Typ <b>HERSTEL ${x.id}</b></label><input class="input" data-restore-confirm autocomplete="off"></div></div><div class="modalfoot"><button class="btn" type="button" data-backup-close>Annuleren</button><div class="spacer"></div><button class="btn danger" type="button" data-backup-restore="${x.id}">Dit herstelpunt terugzetten</button></div></div></div>`}catch(e){alert('Herstelpunt openen mislukt: '+(e.message||e))}
}
async function restore(id,btn){const root=document.getElementById('modalRoot'),checked=root.querySelector('[data-restore-check]')?.checked,confirmation=root.querySelector('[data-restore-confirm]')?.value.trim();if(!checked||confirmation!==`HERSTEL ${id}`)return alert('Controleer het herstelpunt en typ de bevestiging exact over.');btn.disabled=true;try{await rpc('planner_restore_backup',{p_snapshot_id:Number(id),p_confirmation:confirmation});localStorage.removeItem('ralabaster_planner_v1');localStorage.removeItem('ralabaster_planner_pending_v1');alert('Herstel voltooid. De planner wordt opnieuw geladen.');location.reload()}catch(e){alert('Herstellen mislukt: '+(e.message||e));btn.disabled=false}}
document.addEventListener('click',e=>{const nav=e.target.closest('.navbtn[data-view="settings"]');if(nav)setTimeout(install,80);const now=e.target.closest('[data-backup-now]');if(now){e.preventDefault();makeNow(now);return}const exp=e.target.closest('[data-backup-download]');if(exp){e.preventDefault();exportNow(exp);return}const pre=e.target.closest('[data-backup-preview]');if(pre){e.preventDefault();preview(pre.dataset.backupPreview);return}const close=e.target.closest('[data-backup-close]');if(close){e.preventDefault();document.getElementById('modalRoot').innerHTML='';return}const res=e.target.closest('[data-backup-restore]');if(res){e.preventDefault();restore(res.dataset.backupRestore,res)}});
new MutationObserver(()=>{const root=document.getElementById('view-settings');if(root&&!root.classList.contains('hidden'))install()}).observe(document.querySelector('main')||document.body,{subtree:true,childList:true});
})();
