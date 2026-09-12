// rAlabaster strict chain planning + manual release gate.
// Plan the full chain on expected finish times, but do not allow actual execution before the previous step is released.
(()=>{
  const VERSION='20260912-1';
  const S=()=>{try{return state}catch(_){return null}};
  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const done=t=>['done','completed'].includes(String(t?.status||'').toLowerCase());
  const prev=t=>{const s=S();return (s?.tasks||[]).find(x=>x.orderId===t?.orderId&&Number(x.seq)===Number(t?.seq)-1)||null};
  const isWait=t=>t?.type==='wait'||/droogruimte/i.test((t?.name||'')+' '+(t?.machine||''));
  const isExternal=t=>t?.type==='external'||/\bextern(?:e|al)?\b/i.test((t?.name||'')+' '+(t?.machine||''));

  // Fractional minutes previously produced times such as 09:22.5. Round upward to the next full minute so
  // a dependent task can never overlap its predecessor and all date-time strings remain valid.
  function safeEndTime(start,mins){
    if(!start)return'';
    const [h,m]=(start||'00:00').split(':').map(Number);
    let total=h*60+m+Math.ceil(Math.max(0,Number(mins)||0));
    total=((total%1440)+1440)%1440;
    return pad(Math.floor(total/60))+':'+pad(total%60);
  }
  function safeAddMinutesDT(x,mins){
    if(!x)return'';
    const m=String(x).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if(!m)return'';
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),0,0);
    d.setMinutes(d.getMinutes()+Math.ceil(Math.max(0,Number(mins)||0)));
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if(typeof window.endTime==='function')window.endTime=safeEndTime;
  if(typeof window.addMinutesDT==='function')window.addMinutesDT=safeAddMinutesDT;

  // Make waiting steps a real planning link with a valid expected start + finish cursor.
  window.scheduleDryTask=function(t,startAt){
    const start=startAt&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startAt)?startAt.slice(0,16):`${new Date().toISOString().slice(0,10)}T00:00`;
    t.employee=null;t.planSegments=[];t.waitStartAt=start;
    t.waitEndAt=safeAddMinutesDT(start,Number(t.estimate)||540);
    t.date=start.slice(0,10);t.start=start.slice(11,16);
    t.plannedReleaseAt=t.waitEndAt;
    return t.waitEndAt;
  };

  function previousReleased(t){
    if(!t||!t.dependsPrev||Number(t.seq)<=1)return true;
    const p=prev(t);if(!p)return true;
    // Planning may use expected finish, execution may only use an explicit release/completion.
    return done(p)||!!p.releasedAt;
  }
  function blockReason(t){
    if(previousReleased(t))return'';
    const p=prev(t);return `Vorige stap “${p?.name||'onbekend'}” is nog niet vrijgegeven.`;
  }

  // Hard gate for completion/start-like actions in the planner. No "toch doorgaan" override.
  const baseQuick=window.openQuickComplete;
  if(typeof baseQuick==='function')window.openQuickComplete=function(id){
    const t=S()?.tasks?.find(x=>x.id===id);const reason=blockReason(t);
    if(reason){alert(reason+'\nDe taak blijft wel in de planning staan, maar mag nog niet worden uitgevoerd.');return false}
    return baseQuick.apply(this,arguments);
  };
  const baseExternal=window.markExternalSent;
  if(typeof baseExternal==='function')window.markExternalSent=function(id){
    const t=S()?.tasks?.find(x=>x.id===id);const reason=blockReason(t);
    if(reason){alert(reason+'\nExtern versturen is pas toegestaan na vrijgave van de vorige stap.');return false}
    return baseExternal.apply(this,arguments);
  };

  function releaseWait(id){
    const s=S(),t=s?.tasks?.find(x=>x.id===id);if(!t||!isWait(t))return false;
    const reason=blockReason(t);if(reason){alert(reason);return false}
    const at=(typeof nowLocalDT==='function'?nowLocalDT():new Date().toISOString().slice(0,16));
    t.status='done';t.releasedAt=at;t.completedAtDT=at;t.completedAt=at.slice(0,10);t.actual=Number(t.estimate)||540;
    try{if(typeof addHistoryEvent==='function')addHistoryEvent('wait_released',t,{releasedAt:at})}catch(_){ }
    // The planned chain already exists. On real release, move the dependent chain to the actual release moment.
    try{if(typeof dynamicReplanAfterCompletion==='function')dynamicReplanAfterCompletion(t,at)}catch(e){console.warn('Keten herplannen na vrijgave overgeslagen',e)}
    try{save()}catch(e){console.error(e)}
    try{closeModal()}catch(_){ }
    try{if(typeof render==='function')render()}catch(_){ }
    return true;
  }

  // Clicking a waiting step opens a dedicated manual release dialog.
  const baseOpenTask=window.openTask;
  if(typeof baseOpenTask==='function')window.openTask=function(id){
    const t=S()?.tasks?.find(x=>x.id===id);
    if(!t||!isWait(t))return baseOpenTask.apply(this,arguments);
    const o=S()?.orders?.find(x=>x.id===t.orderId),p=prev(t),released=done(t)||!!t.releasedAt;
    const planned=t.waitStartAt&&t.waitEndAt?`${t.waitStartAt.replace('T',' ')} → ${t.waitEndAt.replace('T',' ')}`:'Nog niet volledig ingepland';
    const can=previousReleased(t);
    if(typeof showModal!=='function')return false;
    showModal(`<div class="modalhead"><h3>${esc(t.name)} · ${esc(o?.orderNo||'')}</h3></div><div class="modalbody"><div class="notice"><b>Gepland:</b> ${esc(planned)}<br><b>Vorige stap:</b> ${esc(p?.name||'geen')} · ${can?'vrijgegeven':'nog niet vrijgegeven'}<br><br>De volgende bewerking staat al in de planning, maar wordt pas startbaar nadat deze wachtstap handmatig is vrijgegeven.</div></div><div class="modalfoot"><button class="btn" onclick="closeModal()">Sluiten</button><button class="btn primary" type="button" data-release-wait="${esc(t.id)}" ${released?'disabled':''}>${released?'Vrijgegeven':'Wachtstap vrijgeven'}</button></div>`);
    return true;
  };
  document.addEventListener('click',e=>{const b=e.target.closest('[data-release-wait]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();releaseWait(b.dataset.releaseWait)},true);

  function auditOrder(orderId){
    const ts=(S()?.tasks||[]).filter(t=>t.orderId===orderId).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
    const missing=[];
    for(const t of ts){
      if(done(t))continue;
      if(isWait(t)){if(!(t.waitStartAt&&t.waitEndAt))missing.push(t);continue}
      if(isExternal(t)){if(!(t.date&&t.expectedReturnDate)||!/^\d{4}-\d{2}-\d{2}/.test(t.expectedReturnDate||''))missing.push(t);continue}
      const segs=Array.isArray(t.planSegments)?t.planSegments:[];
      if(!segs.length&&!t.date)missing.push(t);
    }
    return {ok:missing.length===0,missing};
  }

  window.RALAB_CHAIN_RELEASE={version:VERSION,previousReleased,blockReason,releaseWait,auditOrder};
})();
