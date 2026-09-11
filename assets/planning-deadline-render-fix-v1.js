// Prevent expensive full-capacity scenario calculations during ordinary Orders rendering.
// Exact scenario/optimization remains available through RALAB_DEADLINE_PLANNER actions.
(()=>{
const VERSION='20260911-1';
function install(){
  if(!window.RALAB_ERP?.renderOrders||!window.RALAB_DEADLINE_PLANNER)return setTimeout(install,100);
  // The ERP Orders view is already the primary Orders UI. Reuse it for any legacy/core renderOrders calls
  // instead of the deadline-v2 wrapper that recalculates 3 complete planning scenarios on every render.
  window.renderOrders=function(){return window.RALAB_ERP.renderOrders()};
  window.RALAB_DEADLINE_RENDER_FIX={version:VERSION};
}
install();
})();
