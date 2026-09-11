// rAlabaster: keep internalExpectedDate current without doing heavy work during render.
(()=>{
const VERSION='20260911-1';
let installed=false, running=false, queued=false, internalSave=false, timer=0;
const signatures=new Map();
const S=()=>{try{return state}catch(_){return null}};
const activeOrders=()=>{const s=S();return (s?.orders||[]).filter(o=>o.active!==false&&o.status!=='completed'&&!o.isGeneralWork)};
const tasksFor=id=>window.RALAB_PERFORMANCE?.getOrderTasks?.(id)||((S()?.tasks||[]).filter(t=>t.orderId===id).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)));
const addDaysSafe=(d,n)=>{try{return addDays(d,n)}catch(_){const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}};
function taskFinishDateFast(t){
 if(!t)return'';
 if(t.type==='external'||(typeof isExternalTask==='function'&&isExternalTask(t))){
   if(t.expectedReturnDate)return String(t.expectedReturnDate).slice(0,10);
   const sent=t.externalSentDate||t.date||'';if(sent)return addDaysSafe(String(sent).slice(0,10),Number(t.externalLeadDays)||14);
   return'';
 }
 if(t.type==='wait'||(typeof isDryTask==='function'&&isDryTask(t))){
   if(t.waitEndAt)return String(t.waitEndAt).slice(0,10);
   if(t.date){const days=Math.max(0,Math.ceil((Number(t.estimate)||540)/1440));return addDaysSafe(String(t.date).slice(0,10),days)}
   return'';
 }
 const segs=Array.isArray(t.planSegments)?t.planSegments:[];let last='';
 for(const g of segs){const d=String(g?.date||'').slice(0,10);if(d>last)last=d}
 if(last)return last;
 if(t.date)return String(t.date).slice(0,10);
 return'';
}
function signature(o,ts){
 let x=`${o.id}|${o.qty||0}|${o.deadline||''}|${o.status||''}|`;
 for(const t of ts)x+=`${t.id}:${t.seq||0}:${t.status||''}:${t.date||''}:${t.start||''}:${t.estimate||0}:${t.employee||''}:${t.machine||''}:${t.externalSentDate||''}:${t.expectedReturnDate||''}:${t.waitStartAt||''}:${t.waitEndAt||''}:${JSON.stringify(t.planSegments||[])}|`;
 return x;
}
function derive(o,ts){
 if(!ts.length)return {date:o.internalExpectedDate||'',exact:false};
 let last='',needsForecast=false;
 for(const t of ts){
   if(t.status==='done'||t.status==='completed'){const d=taskFinishDateFast(t);if(d>last)last=d;continue}
   const d=taskFinishDateFast(t);if(d>last)last=d;
   if(!d)needsForecast=true;
 }
 if(!needsForecast&&last)return {date:last,exact:false};
 return {date:last,exact:true};
}
function exactDate(o,fallback=''){
 try{
   const fn=window.RALAB_EXACT_ORDER_ANALYSIS||window.RALAB_PERFORMANCE?.exactOrderAnalysis;
   if(typeof fn==='function'){
     const r=fn(o)||{};const d=String(r.finish||r.finishOT||'').slice(0,10);
     if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d;
   }
 }catch(e){console.warn('Interne gereeddatum kon niet exact worden berekend',o?.orderNo,e)}
 return fallback||'';
}
function idle(cb){if('requestIdleCallback'in window)return requestIdleCallback(cb,{timeout:120});return setTimeout(()=>cb({timeRemaining:()=>8,didTimeout:true}),0)}
async function refresh(force=false){
 if(running){queued=true;return}running=true;queued=false;
 try{
   const orders=activeOrders(),work=[];
   for(const o of orders){const ts=tasksFor(o.id),sig=signature(o,ts);if(force||signatures.get(o.id)!==sig||!o.internalExpectedDate)work.push({o,ts,sig})}
   let changed=false,index=0;
   await new Promise(resolve=>{
     const step=deadline=>{
       let count=0;
       while(index<work.length&&(count<3||deadline.timeRemaining()>4)){
         const w=work[index++],d=derive(w.o,w.ts);let next=d.date;
         if(d.exact)next=exactDate(w.o,next);
         if(next&&w.o.internalExpectedDate!==next){w.o.internalExpectedDate=next;changed=true}
         signatures.set(w.o.id,w.sig);count++;
       }
       if(index<work.length)idle(step);else resolve();
     };idle(step);
   });
   if(changed){
     internalSave=true;try{window.__RALAB_READY_ORIGINAL_SAVE?.()}finally{internalSave=false}
     const root=document.getElementById('view-orders');if(root&&!root.classList.contains('hidden'))requestAnimationFrame(()=>window.RALAB_ERP?.renderOrders?.());
   }
 }finally{running=false;if(queued){queued=false;schedule(false,120)}}
}
function schedule(force=false,delay=350){clearTimeout(timer);timer=setTimeout(()=>refresh(force),delay)}
function install(){
 if(installed||typeof save!=='function')return installed;
 const original=save;window.__RALAB_READY_ORIGINAL_SAVE=original;
 save=function(){const r=original.apply(this,arguments);if(!internalSave)schedule(false,250);return r};
 window.RALAB_INTERNAL_READY={version:VERSION,refresh:()=>refresh(true),schedule};
 installed=true;
 schedule(true,900);
 setTimeout(()=>schedule(true,0),3500); // catches normalized cloud load after bootstrap
 return true;
}
let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(t)},100);
})();
