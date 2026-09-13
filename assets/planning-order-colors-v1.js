// A stable visual colour links every planning task belonging to the same order.
(()=>{
const VERSION='20260913-1';
const COLORS=['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#be185d','#4f46e5','#65a30d','#b45309','#0f766e','#7c3aed'];
function colorFor(id){let h=2166136261;for(const c of String(id||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return COLORS[Math.abs(h) % COLORS.length]}
function install(){
 if(typeof window.taskCard!=='function')return setTimeout(install,150);
 if(window.taskCard.__orderColorsWrapped)return;
 const original=window.taskCard;
 const wrapped=function(t){
   let html=original.apply(this,arguments);if(!t||t.isGeneralWork||t.orderId==='__workshop_general__')return html;
   const color=colorFor(t.orderId);
   html=html.replace('<div class="task ','<div class="task order-color-task ').replace(' draggable="true"',` style="--order-color:${color}" draggable="true"`);
   html=html.replace('<div class="top">',`<div class="top order-color-label"><span class="order-color-dot" style="background:${color}" title="Zelfde kleur = dezelfde order" aria-hidden="true"></span>`);
   return html;
 };
 wrapped.__orderColorsWrapped=true;window.taskCard=wrapped;
 const style=document.createElement('style');style.textContent=`.task.order-color-task{border-left:5px solid var(--order-color)!important;padding-left:9px}.order-color-label{display:flex;align-items:flex-start;gap:6px}.order-color-dot{width:11px;height:11px;min-width:11px;border-radius:50%;margin-top:2px;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(0,0,0,.16)}@media(max-width:800px){.task.order-color-task{border-left-width:6px!important}.order-color-dot{width:12px;height:12px;min-width:12px}}`;document.head.appendChild(style);
 try{render()}catch(_){}
 window.RALAB_ORDER_COLORS={version:VERSION,colorFor};
}
install();
})();
