// Product template sequence controls: production order is explicit and authoritative.
(()=>{
function renumber(){try{window.RALAB_MASTER?.renumber?.()}catch(_){}}
function decorate(){const box=document.getElementById('mpSteps');if(!box)return;for(const row of box.querySelectorAll('.md-step')){if(row.querySelector('.seq-move'))continue;const cell=document.createElement('span');cell.className='seq-move';cell.style.cssText='display:flex;gap:3px;align-items:center';cell.innerHTML='<button type="button" class="btn small" data-seq-up title="Stap omhoog">↑</button><button type="button" class="btn small" data-seq-down title="Stap omlaag">↓</button>';row.insertBefore(cell,row.lastElementChild);row.style.gridTemplateColumns='40px minmax(210px,2fr) 120px 130px 115px 115px 115px 74px 70px'}
 const head=box.previousElementSibling;if(head&&head.children.length===8&&!head.querySelector('[data-seq-head]')){const x=document.createElement('span');x.dataset.seqHead='1';x.textContent='Volgorde';head.insertBefore(x,head.lastElementChild);head.style.gridTemplateColumns='40px minmax(210px,2fr) 120px 130px 115px 115px 115px 74px 70px'}
 if(!box.previousElementSibling?.previousElementSibling?.classList?.contains('seq-rule-note')){const n=document.createElement('div');n.className='muted seq-rule-note';n.style.margin='7px 0';n.innerHTML='<b>Deze volgorde is de vaste productievolgorde.</b> De planner mag stappen verschuiven in tijd, maar nooit een vervolgstap vóór zijn voorganger plannen.';box.parentElement.insertBefore(n,box.parentElement.firstChild)}
}
document.addEventListener('click',e=>{const up=e.target.closest('[data-seq-up]'),down=e.target.closest('[data-seq-down]');if(!up&&!down)return;e.preventDefault();const row=e.target.closest('.md-step');if(!row)return;if(up&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);if(down&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);renumber();decorate()},true);
const obs=new MutationObserver(()=>decorate());obs.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(decorate,300);
})();
