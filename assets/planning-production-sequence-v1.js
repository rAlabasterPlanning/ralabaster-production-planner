// Weekly production sequence: one persisted order-level ranking used as the base for daily planning.
(()=>{
const VERSION='20260924-1';
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
  const list=normalizedOrders();
  list.forEach((o,i)=>o.productionSequence=i+1);
  if(saveNow&&typeof save==='function')save();
  return list;
}
function move(orderId,target){
  const list=normalize(false);
  const from=list.findIndex(o=>o.id===orderId);
  if(from<0)return;
  let to=Math.max(0,Math.min(list.length-1,(Number(target)||1)-1));
  const [item]=list.splice(from,1);
  list.splice(to,0,item);
  list.forEach((o,i)=>o.productionSequence=i+1);
  if(typeof save==='function')save();
  if(typeof renderWeeks==='function')renderWeeks();
}
function clearSequence(){
  if(!confirm('Productievolgorde wissen?'))return;
  activeOrders().forEach(o=>delete o.productionSequence);
  if(typeof save==='function')save();
  if(typeof renderWeeks==='function')renderWeeks();
}
function row(o){
  const seq=seqOf(o)||'';
  const customer=o.customerName||o.customer||'';
  const deadline=deadlineOf(o)==='9999-12-31'?'—':deadlineOf(o);
  return `<div class="prod-seq-row" data-prod-seq-row="${esc(o.id)}">
    <div class="prod-seq-number">
      <label>Volgorde</label>
      <input class="input prod-seq-input" type="number" min="1" step="1" value="${esc(seq)}" data-prod-seq-input="${esc(o.id)}" inputmode="numeric">
    </div>
    <div class="prod-seq-main">
      <b>${esc(o.orderNo||'Order')} · ${esc(o.product||'')}</b>
      <span>${esc(customer)}${customer?' · ':''}deadline ${esc(deadline)}</span>
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
  const html=`<section class="production-sequence-panel">
    <div class="prod-seq-head">
      <div><b>Productievolgorde</b><div>Dit is de hoofdvolgorde voor de week. Zet een order op een andere positie; de rest schuift automatisch door.</div></div>
      <button class="btn small" type="button" data-prod-seq-clear>Volgorde wissen</button>
    </div>
    <div class="prod-seq-list">${list.length?list.map(row).join(''):'<div class="muted">Geen actieve orders.</div>'}</div>
  </section>`;
  toolbar.insertAdjacentHTML('afterend',html);
}
function installStyle(){
  if(document.getElementById('prod-seq-style'))return;
  const style=document.createElement('style');style.id='prod-seq-style';
  style.textContent=`
  .production-sequence-panel{margin:10px 0 14px;padding:12px;border:1px solid var(--line,#d9dfdc);border-radius:12px;background:var(--card,#fff)}
  .prod-seq-head{display:flex;gap:12px;align-items:flex-start}.prod-seq-head>div:first-child{flex:1}.prod-seq-head b{font-size:15px}.prod-seq-head div div{font-size:12px;opacity:.72;margin-top:2px}
  .prod-seq-list{display:grid;gap:7px;margin-top:10px;max-height:360px;overflow:auto;padding-right:2px}
  .prod-seq-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(127,127,127,.18);border-radius:9px;background:rgba(127,127,127,.04)}
  .prod-seq-number{width:82px;flex:0 0 82px}.prod-seq-number label{display:block;font-size:10px;opacity:.65;margin-bottom:2px}.prod-seq-input{width:72px;text-align:center;font-weight:800}
  .prod-seq-main{min-width:0;display:flex;flex-direction:column;gap:2px}.prod-seq-main b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.prod-seq-main span{font-size:11px;opacity:.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  @media(max-width:700px){.prod-seq-head{align-items:center}.prod-seq-row{padding:7px}.prod-seq-number{width:70px;flex-basis:70px}.prod-seq-input{width:62px}}
  `;
  document.head.appendChild(style);
}
function install(){
  installStyle();
  if(typeof window.renderWeeks!=='function')return setTimeout(install,200);
  const old=window.renderWeeks;
  window.renderWeeks=function(){const r=old.apply(this,arguments);setTimeout(decorate,0);return r};
  document.addEventListener('change',e=>{
    const input=e.target.closest?.('[data-prod-seq-input]');if(!input)return;
    const max=Math.max(1,activeOrders().length),value=Math.max(1,Math.min(max,Number(input.value)||1));
    move(input.dataset.prodSeqInput,value);
  },true);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-prod-seq-clear]')){e.preventDefault();clearSequence();}
  },true);
  window.RALAB_PRODUCTION_SEQUENCE={version:VERSION,list:()=>normalize(false),move,normalize:()=>normalize(true),decorate};
  setTimeout(decorate,0);
}
install();
})();