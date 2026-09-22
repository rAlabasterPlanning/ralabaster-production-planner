import { WORKSPACE_ID,allRows,rest } from './_planner-core.mjs';

function localMinutes(date,start){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(start||'')))return null;
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=start.split(':').map(Number);
  return Math.floor(Date.UTC(y,m-1,d,hh,mm)/60000);
}
function duration(segment){return Math.max(1,Number(segment?.elapsedMinutes)||Number(segment?.minutes)||0)}
function overlaps(a,b){
  const as=localMinutes(a.date,a.start),bs=localMinutes(b.date,b.start);
  if(as===null||bs===null)return false;
  return as<bs+duration(b)&&bs<as+duration(a);
}
function protectedTask(task){return ['started','in_progress','done','completed'].includes(String(task?.status||''))}
function cleanSegments(action,task){
  const employee=action.employee??task.employee??null;
  return (action.segments||[]).map((s,index)=>({
    date:String(s.date||''),start:String(s.start||''),minutes:Number(s.minutes)||0,
    employee:s.employee??employee,
    ...(Number(s.elapsedMinutes)>0?{elapsedMinutes:Number(s.elapsedMinutes)}:{}),
    _index:index,
  }));
}
function previewScheduleChanges(snapshot,actions){
  if(!Array.isArray(actions)||!actions.length||actions.length>30)throw new Error('Geef 1 tot en met 30 planningswijzigingen op.');
  const tasks=snapshot.gegevens.tasks||[],orders=snapshot.gegevens.orders||[],preview=[],conflicts=[],protectedTasks=[];
  const byId=new Map(tasks.map(t=>[t.id,t]));
  for(const action of actions){
    const task=byId.get(action.taskId);
    if(!task||task.orderId!==action.orderId)throw new Error(`Taak ${action.taskId||'(leeg)'} bestaat niet in deze order.`);
    const order=orders.find(o=>o.id===action.orderId);
    if(!order)throw new Error(`Order ${action.orderId||'(leeg)'} bestaat niet meer.`);
    if(protectedTask(task))protectedTasks.push({id:task.id,naam:task.name,status:task.status});
    if(action.type==='unschedule_task'){
      preview.push({actie:'ontplannen',order:order.orderNo||order.id,taak:task.name||task.id,huidige_planning:task.planSegments||[]});
      continue;
    }
    const segments=cleanSegments(action,task),machine=String(action.machine??task.machine??'').trim();
    if(!segments.length)throw new Error('Een ingeplande taak heeft minimaal één plansegment nodig.');
    for(const seg of segments){
      if(localMinutes(seg.date,seg.start)===null)throw new Error(`Ongeldige datum/starttijd in segment ${seg._index+1}.`);
      if(!(seg.minutes>0))throw new Error(`Segment ${seg._index+1} moet meer dan 0 minuten duren.`);
      if(!seg.employee)throw new Error(`Segment ${seg._index+1} heeft een medewerker nodig.`);
      for(const other of tasks){
        if(other.id===task.id||['done','completed'].includes(String(other.status||'')))continue;
        const otherMachine=String(other.assignedMachine||other.machine||'').trim();
        for(const os of other.planSegments||[]){
          if(!overlaps(seg,os))continue;
          const sameEmployee=String(os.employee||other.employee||'')===String(seg.employee||'');
          const sameMachine=machine&&otherMachine&&machine===otherMachine;
          if(sameEmployee||sameMachine)conflicts.push({
            taak:task.name||task.id,segment:{date:seg.date,start:seg.start,minutes:seg.minutes,employee:seg.employee},
            botst_met:other.name||other.id,reden:[sameEmployee?'medewerker':null,sameMachine?'machine':null].filter(Boolean).join(' + '),
            andere_order:other.orderId,otherTaskId:other.id,
          });
        }
      }
    }
    preview.push({actie:'inplannen/verplaatsen',order:order.orderNo||order.id,taak:task.name||task.id,machine,medewerker:action.employee??segments[0].employee,segmenten:segments.map(({_index,...s})=>s)});
  }
  return {
    preview,
    conflicten:conflicts,
    kan_uitvoeren:conflicts.length===0,
    beschermde_taken:[...new Map(protectedTasks.map(x=>[x.id,x])).values()],
    vereist_extra_bevestiging:protectedTasks.length>0,
  };
}

function persistedSegments(data){
  return (Array.isArray(data?.planSegments)?data.planSegments:[]).map(segment=>({
    date:String(segment?.date||''),
    start:String(segment?.start||''),
    minutes:Number(segment?.minutes)||0,
    employee:segment?.employee??null,
    ...(Number(segment?.elapsedMinutes)>0?{elapsedMinutes:Number(segment.elapsedMinutes)}:{}),
  }));
}

function expectedSegments(action,data){
  if(action.type==='unschedule_task')return [];
  const first=action.segments?.[0]||{};
  const employee=action.employee??first.employee??data?.employee??null;
  return (action.segments||[]).map(segment=>({
    date:String(segment?.date||''),
    start:String(segment?.start||''),
    minutes:Number(segment?.minutes)||0,
    employee:segment?.employee??employee,
    ...(Number(segment?.elapsedMinutes)>0?{elapsedMinutes:Number(segment.elapsedMinutes)}:{}),
  }));
}

function comparePersistedScheduleChanges(actions,rows){
  const byId=new Map((rows||[]).map(row=>[String(row.task_id||row.data?.id||''),row]));
  const tasks=(actions||[]).map(action=>{
    const row=byId.get(String(action.taskId||'')),data=row?.data||{};
    const expected=expectedSegments(action,data),actual=persistedSegments(data);
    const verified=!!row&&String(row.order_id||data.orderId||'')===String(action.orderId||'')&&JSON.stringify(actual)===JSON.stringify(expected);
    return {
      taskId:action.taskId,orderId:action.orderId,actie:action.type,
      geverifieerd:verified,planSegments:actual,verwacht:expected,updatedAt:row?.updated_at||null,
    };
  });
  return {geverifieerd:tasks.length===actions.length&&tasks.every(task=>task.geverifieerd),taken:tasks};
}

async function verifyPersistedScheduleChanges(token,actions){
  const rows=[];
  for(const action of actions){
    const found=await allRows(token,'planner_tasks_v2',`select=task_id,order_id,data,updated_at&workspace_id=eq.${WORKSPACE_ID}&task_id=eq.${encodeURIComponent(action.taskId)}&deleted=eq.false&limit=1`);
    if(found[0])rows.push(found[0]);
  }
  return comparePersistedScheduleChanges(actions,rows);
}

async function executeScheduleChanges(token,actions,{confirmationText='',allowProtected=false}={}){
  const result=await rest(token,'rpc/apply_ai_schedule_changes','0-0',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:{p_workspace_id:WORKSPACE_ID,p_actions:actions,p_confirmation_text:String(confirmationText||'Expliciet bevestigd in ChatGPT'),p_allow_protected:!!allowProtected},
  });
  let verification;
  try{verification=await verifyPersistedScheduleChanges(token,actions)}
  catch(cause){
    const error=new Error(`De planning is naar Supabase gestuurd, maar kon niet opnieuw worden uitgelezen: ${cause?.message||cause}`);
    error.code='SCHEDULE_PERSISTENCE_UNCERTAIN';error.result=result;error.verification={geverifieerd:false,taken:[]};throw error;
  }
  if(!verification.geverifieerd){
    const error=new Error('Supabase accepteerde de planning, maar de opnieuw uitgelezen planSegments wijken af. De uitvoering wordt daarom niet als geslaagd gemeld.');
    error.code='SCHEDULE_PERSISTENCE_MISMATCH';error.result=result;error.verification=verification;throw error;
  }
  return {resultaat:result,verificatie:verification};
}
export {comparePersistedScheduleChanges,executeScheduleChanges,previewScheduleChanges,verifyPersistedScheduleChanges};
