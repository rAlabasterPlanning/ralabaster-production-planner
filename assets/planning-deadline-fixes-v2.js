// Small follow-up for deadline planner v2: apply +14/+11 buffer model to newly accepted quotations before rendering orders.
(()=>{
const S=()=>{try{return state}catch(_){return null}};
function migrateNewQuoteOrders(){const s=S();if(!s)return false;let changed=false;for(const o of s.orders||[]){if(o.isGeneralWork||o.bufferModelVersion)continue;if(o.sourceQuoteNo&&o.communicatedDeadline&&(!o.deadline||o.deadline===o.communicatedDeadline)){o.quotedEstimatedReadyDate=o.communicatedDeadline;o.maximumReadyDate=addDays(o.communicatedDeadline,14);o.internalTargetDate=addDays(o.maximumReadyDate,-3);o.deadline=o.maximumReadyDate;o.bufferModelVersion=2;changed=true}else if(o.deadline){o.maximumReadyDate=o.maximumReadyDate||o.deadline;o.internalTargetDate=o.internalTargetDate||addDays(o.maximumReadyDate,-3);o.bufferModelVersion=2;changed=true}}if(changed)save();return changed}
function install(){if(typeof window.renderOrders!=='function')return setTimeout(install,250);const old=window.renderOrders;window.renderOrders=function(){migrateNewQuoteOrders();return old.apply(this,arguments)};migrateNewQuoteOrders();window.RALAB_DEADLINE_BUFFER={migrateNewQuoteOrders};}
install();
})();
