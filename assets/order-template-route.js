// Build a new, unplanned order route from an explicit saved product version.
(()=>{'use strict';
 function build(order,template,at=new Date().toISOString()){
  if(!template||!Array.isArray(template.ops)||!template.ops.length)throw Error('Dit product heeft geen opgeslagen productiestappen.');
  const qty=Number(order.qty);if(order.quantityPending||!Number.isSafeInteger(qty)||qty<1)throw Error('Vul eerst het orderaantal in om de opgeslagen stuktijden over te nemen.');
  const ops=structuredClone(template.ops);
  for(const op of ops)if(!String(op.name||'').trim()||!['batch','unit','wait','external'].includes(op.mode)||op.minutes==null||op.minutes===''||!Number.isFinite(Number(op.minutes))||Number(op.minutes)<0)throw Error('De opgeslagen productiestappen zijn onvolledig. Controleer naam, tijd en tijdsoort in het product.');
  const tasks=ops.map((op,i)=>{const estimate=Number(op.minutes)*(op.mode==='unit'?qty:1);return{
   id:'t_template_'+order.id+'_'+i,orderId:order.id,seq:i+1,name:op.name,machine:op.machine||op.name,
   estimate,orderCalcMinutes:Number(op.minutes),calcMode:op.mode,sourceOpId:op.id||null,
   dependsPrev:op.dependsPrev??i>0,type:['wait','external'].includes(op.mode)?op.mode:'internal',
   externalLeadDays:op.mode==='external'?(op.externalLeadDays??Math.ceil(estimate/1440)):null,
   expectedExternalCostBatch:op.externalBatch??0,expectedExternalCostUnit:op.externalUnit??0,
   employee:null,preferredEmployee:op.preferredEmployee||null,parallelGroupId:op.parallelGroupId||'',
   date:null,start:'',planSegments:[],status:'open',actual:0,doneQty:0,note:'',taskProgressUpdatedAt:at
  }});
  return{tasks,fields:{productTemplateId:template.id,productTemplateVersion:template.version??null,templateOps:ops,
   needsCalculation:false,status:'confirmed',routeLoadedAt:at,routeSource:{templateId:template.id,version:template.version??null,at}}};
 }
 window.RALAB_TEMPLATE_ROUTE={build};
})();
