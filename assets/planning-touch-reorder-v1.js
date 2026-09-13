// Swipe a planning card upward to move it one position earlier and recalculate the timeline.
(()=>{
const VERSION='20260913-1';
let gesture=null,suppressClickUntil=0;
function start(e){if(e.pointerType==='mouse'||document.getElementById('modalRoot')?.children?.length)return;const card=e.target.closest?.('.task[data-task]'),slot=card?.closest?.('[data-plan-date][data-plan-employee]');if(!card||!slot)return;gesture={id:card.dataset.task,date:slot.dataset.planDate,employee:slot.dataset.planEmployee,x:e.clientX,y:e.clientY}}
function finish(e){const g=gesture;gesture=null;if(!g)return;const dy=e.clientY-g.y,dx=Math.abs(e.clientX-g.x);if(dy>-45||dx>90)return;e.preventDefault();e.stopImmediatePropagation();const result=window.RALAB_MANUAL_START?.reorderUp?.(g.id,g.date,g.employee);if(!result)return alert('De volgorde kon niet worden aangepast. Ververs de app en probeer opnieuw.');if(result.error)return alert(result.error);try{save()}catch(err){console.error(err)}try{render()}catch(_){ }suppressClickUntil=Date.now()+900;alert(`Taak één positie omhoog verplaatst. ${result.moved||1} taakblok(ken) zijn opnieuw doorgerekend.${result.unplanned?` Let op: ${result.unplanned} minuten konden niet veilig worden ingepland.`:''}`)}
document.addEventListener('pointerdown',start,true);document.addEventListener('pointercancel',()=>{gesture=null},true);document.addEventListener('pointerup',finish,true);document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest?.('.task[data-task]')){e.preventDefault();e.stopImmediatePropagation()}},true);
window.RALAB_TOUCH_REORDER={version:VERSION};
})();
