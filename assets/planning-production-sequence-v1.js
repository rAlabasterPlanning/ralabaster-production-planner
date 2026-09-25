// Weekly production sequence: one persisted order-level ranking used as the base for daily planning.
(()=>{
const VERSION='20260925-2';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S=()=>{try{return state}catch(_){return null}};
const activeOrders=()=>{
  const s=S(); if(!s?.orders)return [];
  return s.orders.filter(o=>o&&!o.deleted&&o.active!==false&&!o.closed&&o.status!=='completed');
};
const deadlineOf=o=>o.communicatedDeadline||o.maximumReadyDate||o.deadline||'9999-12-31';
const seqOf=o=>Number(o.productionSequence)||0;
function normalizedOrders(){
  return activeOrders().slice().sort((a,b)=>{
    const sa=seqOf(a),sb=seqOf(b);
    if(sa&&sb&&sa!==sb)return sa-sb;
    if(sa&&!sb)return -1;
    if(!sa&&sb)return 1;
    const d=String(deadlineOf(a)).localeCompare(String(deadlineOf(b)));
    if(d)return d;
    return String(a.orderNo||a.id||'').localeCompare(String(b.orderNo||b.id||''));
  });
}
function normalize(saveNow=false){
  const ranked=activeOrders().filter(o=>seqOf(o)>0).sort((a,b)=>seqOf(a)-seqOf(b)||(a.orderNo||'').localeCompare(b.orderNo||''));
  ranked.forEach((o,i)=>o.productionSequence=i+1);
  if(saveNow&&typeof save==='function')save();
  return normalizedOrders();
}
function refreshSequencePanel(focusId=''){
  const listEl=document.querySelector('#view-weeks .prod-seq-list');
  if(!listEl)return decorate();
  const panel=document.querySelector('#view-weeks .production-sequence-panel');
  const panelScroll=listEl.scrollTop;
  listEl.innerHTML=normalizedOrders().map(row).join('')||'<div class="muted">Geen actieve orders.</div>';
  listEl.scrollTop=panelScroll;
  if(focusId){
    const input=listEl.querySelector('[data-prod-seq-input="'+CSS.escape(focusId)+'"]');
    if(input){input.focus({preventScroll:true});input.select?.()}
  }
}
function move(orderId,target){
  const all=activeOrders(),item=all.find(o=>o.id===orderId);if(!item)return;
  const ranked=all.filter(o=>o.id!==orderId&&seqOf(o)>0).sort((a,b)=>seqOf(a)-seqOf(b));
  if(String(target??'').trim()===''||Number(target)<=0){
    delete item.productionSequence;
  }else{
    const to=Math.max(0,Math.min(ranked.length,(Number(target)||1)-1));
    ranked.splice(to,0,item);
    ranked.forEach((o,i)=>o.productionSequence=i+1);
  }
  if(typeof save==='function')save();
  refreshSequencePanel(orderId);
}
function clearSequence(){
  if(!confirm('Productievolgorde wissen?'))return;
  activeOrders().forEach(o=>delete o.productionSequence);
  if(typeof save==='function')save();
  refreshSequencePanel();
}
function row(o){
  const seq=seqOf(o)||'';
  const customer=o.customerName||o.customer||'';
  const deadline=deadlineOf(o)==='9999-12-31'?'—':deadlineOf(o),ready=o.expectedReadyWeek||'';
  return `<div class="prod-seq-row" data-prod-seq-row="${esc(o.id)}">
    <div class="prod-seq-number">
      <label>Volgorde</label>
      <input class="input prod-seq-input" type="number" min="1" step="1" placeholder="auto" value="${esc(seq)}" data-prod-seq-input="${esc(o.id)}" inputmode="numeric">
    </div>
    <label class="prod-seq-owner"><span>Medewerker</span><select class="input" data-prod-owner="${esc(o.id)}"><option value="" ${!o.productionEmployeeOverride?'selected':''}>Auto</option><option value="Kaan" ${o.productionEmployeeOverride==='Kaan'?'selected':''}>Kaan</option><option value="Lance" ${o.productionEmployeeOverride==='Lance'?'selected':''}>Lance</option><option value="Shaffi" ${o.productionEmployeeOverride==='Shaffi'?'selected':''}>Shaffi</option><option value="Peter" ${o.productionEmployeeOverride==='Peter'?'selected':''}>Peter</option></select></label>
    <div class="prod-seq-main">
      <b>${esc(o.orderNo||'Order')} · ${esc(o.product||'')}</b>
      <span>${esc(customer)}${customer?' · ':''}deadline ${esc(deadline)}${ready?' · verwacht '+esc(ready):''}</span>
    </div>
  </div>`;
}
function decorate(){
  const root=document.getElementById('view-weeks');
  if(!root||root.classList.contains('hidden'))return;
  root.querySelector('.production-sequence-panel')?.remove();
  const list=normalize(false);
  const toolbar=root.querySelector('.toolbar');
  if(!toolbar)return;
  const collapsed=localStorage.getItem('ralab-prod-seq-collapsed')==='1';
  const html=`<section class="production-sequence-panel ${collapsed?'collapsed':''}">
    <div class="prod-seq-head">
      <button class="prod-seq-toggle" type="button" data-prod-seq-toggle aria-expanded="${collapsed?'false':'true'}">${collapsed?'▸':'▾'}</button>
      <div><b>Productievolgorde</b><div>Standaard staat de volgorde op deadline. Vul alleen een volgordenummer in als je handmatig wilt overrulen. Kies hier ook de hoofdmedewerker per order.</div></div>
      <button class="btn small" type="button" data-unplan-all>Alle orders ontplannen</button>
      <button class="btn small" type="button" data-prod-seq-clear>Volgorde wissen</button>
    </div>
    <div class="prod-seq-body">
      <div class="prod-seq-list">${list.length?list.map(row).join(''):'<div class="muted">Geen actieve orders.</div>'}</div>
    </div>
  </section>`;
  toolbar.insertAdjacentHTML('afterend',html);
}
function installStyle(){
  if(document.getElementById('prod-seq-style'))return;
  const style=document.createElement('style');style.id='prod-seq-style';
  style.textContent=`
  .production-sequence-panel{margin:10px 0 14px;padding:12px;border:1px solid var(--line,#d9dfdc);border-radius:12px;background:var(--card,#fff)}
  .prod-seq-head{display:flex;gap:10px;align-items:flex-start}.prod-seq-head>div:nth-child(2){flex:1}.prod-seq-toggle{border:0;background:transparent;font-size:18px;line-height:1;padding:4px 2px;cursor:pointer}.production-sequence-panel.collapsed .prod-seq-body{display:none}.prod-seq-head b{font-size:15px}.prod-seq-head div div{font-size:12px;opacity:.72;margin-top:2px}
  .prod-seq-list{display:grid;gap:7px;margin-top:10px;max-height:360px;overflow:auto;padding-right:2px}
  .prod-seq-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(127,127,127,.18);border-radius:9px;background:rgba(127,127,127,.04)}
  .prod-seq-number{width:82px;flex:0 0 82px}.prod-seq-number label{display:block;font-size:10px;opacity:.65;margin-bottom:2px}.prod-seq-input{width:72px;text-align:center;font-weight:800}
  .prod-seq-main{min-width:0;display:flex;flex:1;flex-direction:column;gap:2px}.prod-seq-main b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.prod-seq-main span{font-size:11px;opacity:.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.prod-seq-owner{width:135px;flex:0 0 135px}.prod-seq-owner>span{display:block;font-size:10px;opacity:.65;margin-bottom:2px}.prod-seq-owner select{width:100%}
  @media(max-width:700px){.prod-seq-head{align-items:center}.prod-seq-row{padding:7px;flex-wrap:wrap}.prod-seq-number{width:70px;flex-basis:70px}.prod-seq-input{width:62px}.prod-seq-owner{width:120px;flex-basis:120px}.prod-seq-main{flex-basis:100%}}
  `;
  document.head.appendChild(style);
}
function install(){
  installStyle();
  if(typeof window.renderWeeks!=='function')return setTimeout(install,200);
  const old=window.renderWeeks;
  window.renderWeeks=function(){const r=old.apply(this,arguments);setTimeout(decorate,0);return r};
  document.addEventListener('change',e=>{
    const owner=e.target.closest?.('[data-prod-owner]');
    if(owner){
      const o=activeOrders().find(x=>x.id===owner.dataset.prodOwner);if(!o)return;
      const v=String(owner.value||'').trim();
      if(v)o.productionEmployeeOverride=v;else delete o.productionEmployeeOverride;
      delete o.productionEmployee;
      if(typeof save==='function')save();
      refreshSequencePanel();
      return;
    }
    const input=e.target.closest?.('[data-prod-seq-input]');if(!input)return;
    const raw=String(input.value||'').trim();
    move(input.dataset.prodSeqInput,raw===''?'':Math.max(1,Math.min(activeOrders().length,Number(raw)||1)));
  },true);
  document.addEventListener('click',e=>{
    const toggle=e.target.closest?.('[data-prod-seq-toggle]');
    if(toggle){
      e.preventDefault();
      const panel=toggle.closest('.production-sequence-panel');
      const collapsed=!panel.classList.contains('collapsed');
      panel.classList.toggle('collapsed',collapsed);
      toggle.textContent=collapsed?'▸':'▾';
      toggle.setAttribute('aria-expanded',collapsed?'false':'true');
      localStorage.setItem('ralab-prod-seq-collapsed',collapsed?'1':'0');
      return;
    }
    if(e.target.closest?.('[data-prod-seq-clear]')){e.preventDefault();clearSequence();}
  },true);
  window.RALAB_PRODUCTION_SEQUENCE={version:VERSION,list:()=>normalize(false),move,normalize:()=>normalize(true),decorate};
  setTimeout(decorate,0);
}
install();
})();