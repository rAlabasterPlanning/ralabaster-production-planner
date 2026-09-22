const SUPABASE_URL='https://gspqapzowtktdobltkcl.supabase.co';
const SUPABASE_KEY='sb_publishable_cH7Q_KVdG41QYkp0wvdHVQ_HbaX6VHh';
const WORKSPACE_ID='ralabaster';
const MAX_CONTEXT=1800000;

function tokenFrom(request){
  const authorization=request.headers.authorization||'';
  return authorization.startsWith('Bearer ')?authorization.slice(7):'';
}

async function authenticatedUser(token){
  if(!token)return null;
  try{
    const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:SUPABASE_KEY}});
    return response.ok?await response.json():null;
  }catch{return null}
}

async function rest(token,path,range='0-999',options={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method:options.method||'GET',
    headers:{
      Authorization:`Bearer ${token}`,
      apikey:SUPABASE_KEY,
      Range:range,
      'Range-Unit':'items',
      ...(options.body?{'Content-Type':'application/json'}:{}),
      ...(options.headers||{}),
    },
    body:options.body?JSON.stringify(options.body):undefined,
  });
  if(!response.ok)throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if(response.status===204)return null;
  if(typeof response.text==='function'){
    const text=await response.text();
    return text?JSON.parse(text):null;
  }
  return typeof response.json==='function'?response.json():null;
}

async function allRows(token,table,query){
  const out=[];
  for(let start=0;start<20000;start+=1000){
    const rows=await rest(token,`${table}?${query}`,`${start}-${start+999}`);
    out.push(...rows);
    if(rows.length<1000)break;
  }
  return out;
}

function scrub(value,key='',depth=0){
  if(depth>10)return '[te diep genest]';
  if(value===null||value===undefined||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value==='string'){
    if(/(?:password|secret|access.?token|refresh.?token|api.?key|image.?data|base64)/i.test(key))return '[beveiligde waarde niet gedeeld]';
    if(value.startsWith('data:image/')||value.length>12000)return `[lange inhoud weggelaten: ${value.length} tekens]`;
    return value;
  }
  if(Array.isArray(value))return value.map(v=>scrub(v,key,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(?:password|secret|access.?token|refresh.?token|api.?key)/i.test(k)).map(([k,v])=>[k,scrub(v,k,depth+1)]));
  return String(value);
}

function accessCatalog(data){
  const count=name=>Array.isArray(data[name])?data[name].length:0;
  return [
    ['orders',count('orders')],['taken en planning',count('tasks')],['klanten',count('customers')],
    ['offertes',count('quotes')],['calculaties',count('calculations')],['producten',count('productTemplates')],
    ['werkplekken',count('workplaces')],['onderhoud',count('maintenanceRecords')],['gereedschap',count('toolItems')],
    ['machinekosten',count('toolCostEntries')],['afwezigheid',count('staffAbsences')],['historie',count('history')],
    ['AI-beslissingen',count('aiDecisionLog')],['AI-voorkeuren',count('aiPlannerRules')]
  ].map(([bron,aantal])=>({bron,aantal,toegang:'lezen'}));
}

async function authoritativeSnapshot(token,fallback={}){
  const [metaRows,orderRows,taskRows]=await Promise.all([
    allRows(token,'planner_shared_state',`select=data,updated_at&workspace_id=eq.${WORKSPACE_ID}&limit=1`),
    allRows(token,'planner_orders_v2',`select=data,updated_at&workspace_id=eq.${WORKSPACE_ID}&deleted=eq.false`),
    allRows(token,'planner_tasks_v2',`select=data,updated_at&workspace_id=eq.${WORKSPACE_ID}&deleted=eq.false`),
  ]);
  const meta=metaRows[0]?.data&&typeof metaRows[0].data==='object'?metaRows[0].data:{};
  const data={...meta,orders:orderRows.map(r=>r.data).filter(Boolean),tasks:taskRows.map(r=>r.data).filter(Boolean)};
  if(!data.orders.length&&Array.isArray(fallback.orders))data.orders=fallback.orders;
  if(!data.tasks.length&&Array.isArray(fallback.tasks))data.tasks=fallback.tasks;
  const clean=scrub(data);
  return {
    moment:new Date().toISOString(),
    tijdzone:'Europe/Amsterdam',
    workspace:WORKSPACE_ID,
    rechten:{lezen:'alle gegevens in de productieplanner',schrijven:'alleen na een zichtbaar voorstel en expliciet akkoord van Ralph',machines:'geen directe machinebesturing'},
    databronnen:accessCatalog(clean),
    gegevens:clean,
  };
}

function fitContext(snapshot){
  let json=JSON.stringify(snapshot);
  if(json.length<=MAX_CONTEXT)return json;
  const data=snapshot.gegevens||{},reduced={...snapshot,waarschuwing:'De volledige dataset is groter dan één AI-verzoek. Alle bronnen zijn toegankelijk; in dit antwoord zijn de meest recente operationele records opgenomen.',gegevens:{...data}};
  for(const key of ['history','aiPlannerMessages','aiDecisionLog','completedOrders','quotes','calculations'])if(Array.isArray(reduced.gegevens[key]))reduced.gegevens[key]=reduced.gegevens[key].slice(-250);
  json=JSON.stringify(reduced);
  if(json.length<=MAX_CONTEXT)return json;
  reduced.gegevens.tasks=(reduced.gegevens.tasks||[]).slice(-1800);
  reduced.gegevens.orders=(reduced.gegevens.orders||[]).slice(-700);
  return JSON.stringify(reduced).slice(0,MAX_CONTEXT);
}

function normalize(value){return String(value??'').trim().toLocaleLowerCase('nl-NL')}
function isComplete(task){return task?.status==='done'||task?.status==='completed'}
function isProtected(task){return !!task&&(!!task.lockedPlanning||['started','in_progress','done','completed'].includes(task.status)||isComplete(task))}
function orderLabel(order){return [order?.orderNo,order?.product].filter(Boolean).join(' – ')||order?.id||'Order'}

function resolveOrder(snapshot,query){
  const orders=snapshot.gegevens.orders||[],needle=normalize(query);
  if(!needle)return {matches:orders.slice(0,20)};
  const exact=orders.filter(o=>[o.id,o.orderNo].some(x=>normalize(x)===needle));
  if(exact.length===1)return {order:exact[0]};
  const matches=orders.filter(o=>[o.id,o.orderNo,o.product,o.customerName,o.customer,o.project].some(x=>normalize(x).includes(needle))).slice(0,20);
  return matches.length===1?{order:matches[0]}:{matches};
}

function orderRoute(snapshot,query){
  const resolved=resolveOrder(snapshot,query);
  if(!resolved.order)return {gevonden:false,matches:(resolved.matches||[]).map(o=>({id:o.id,order:o.orderNo||'',product:o.product||'',klant:o.customerName||o.customer||''}))};
  const order=resolved.order,tasks=(snapshot.gegevens.tasks||[]).filter(t=>t.orderId===order.id).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
  return {gevonden:true,order,taken:tasks.map(t=>({id:t.id,volgorde:t.seq,naam:t.name,machine:t.machine,type:t.type||'internal',duur_minuten:Number(t.estimate)||0,medewerker:t.employee||null,status:t.status||'open',afhankelijk_van_vorige:!!t.dependsPrev,vastgezet:!!t.lockedPlanning,planning:t.planSegments||[]}))};
}

const SCOPE_KEYS={
  orders:['orders'],planning:['tasks'],customers:['customers'],quotes:['quotes'],calculations:['calculations'],
  products:['productTemplates'],workplaces:['workplaces'],maintenance:['maintenanceRecords'],tooling:['toolItems'],
  costs:['toolCostEntries'],staff:['staffAbsences'],history:['history'],decisions:['aiDecisionLog','aiPlannerRules']
};

function readScope(snapshot,scope='overview',query='',limit=100){
  const data=snapshot.gegevens||{},max=Math.min(500,Math.max(1,Number(limit)||100)),needle=normalize(query);
  if(scope==='overview'){
    const active=(data.orders||[]).filter(o=>o.active!==false&&o.status!=='completed'&&!o.closed),open=(data.tasks||[]).filter(t=>!isComplete(t));
    return {moment:snapshot.moment,rechten:snapshot.rechten,databronnen:snapshot.databronnen,samenvatting:{actieve_orders:active.length,open_taken:open.length,niet_geplande_taken:open.filter(t=>!(t.planSegments||[]).length&&!t.date&&!t.waitStartAt&&!t.externalSentDate).length},orders:active.slice(0,max).map(o=>({id:o.id,order:o.orderNo,product:o.product,klant:o.customerName||o.customer,deadline:o.communicatedDeadline||o.maximumReadyDate||o.deadline,status:o.status,sterren:o.planningPriority}))};
  }
  const keys=scope==='all'?Object.keys(data).filter(k=>Array.isArray(data[k])):(SCOPE_KEYS[scope]||[]),out={moment:snapshot.moment,scope};
  for(const key of keys){const values=Array.isArray(data[key])?data[key]:[];out[key]=(needle?values.filter(v=>normalize(JSON.stringify(v)).includes(needle)):values).slice(0,max)}
  return out;
}

function previewTaskChanges(snapshot,actions){
  if(!Array.isArray(actions)||!actions.length||actions.length>20)throw new Error('Geef 1 tot en met 20 taakwijzigingen op.');
  const orders=snapshot.gegevens.orders||[],tasks=snapshot.gegevens.tasks||[],preview=[],protectedTasks=[];
  for(const action of actions){
    const order=orders.find(o=>o.id===action.orderId);
    if(!order)throw new Error(`Order ${action.orderId||'(leeg)'} bestaat niet meer.`);
    if(action.type==='add_task'){
      if(!String(action.name||'').trim())throw new Error('Een nieuwe taak heeft een naam nodig.');
      if(action.afterTaskId&&!tasks.some(t=>t.id===action.afterTaskId&&t.orderId===order.id))throw new Error('De gekozen voorgaande taak bestaat niet in deze order.');
      preview.push({actie:'toevoegen',order:orderLabel(order),na:tasks.find(t=>t.id===action.afterTaskId)?.name||'achteraan',taak:action.name,machine:action.machine||'',duur_minuten:Number(action.estimate)||0});
    }else if(action.type==='remove_task'||action.type==='update_task'){
      const task=tasks.find(t=>t.id===action.taskId&&t.orderId===order.id);
      if(!task)throw new Error(`Taak ${action.taskId||'(leeg)'} bestaat niet in deze order.`);
      if(isProtected(task))protectedTasks.push({id:task.id,naam:task.name,status:task.status||'open'});
      preview.push({actie:action.type==='remove_task'?'verwijderen':'bijwerken',order:orderLabel(order),taak:task.name,wijzigingen:action.fields||undefined});
    }else if(action.type==='link_tasks'){
      const first=tasks.find(t=>t.id===action.firstTaskId&&t.orderId===order.id),next=tasks.find(t=>t.id===action.nextTaskId&&t.orderId===order.id);
      if(!first||!next||first.id===next.id)throw new Error('De gekozen taakkoppeling is niet geldig.');
      for(const task of [first,next])if(isProtected(task))protectedTasks.push({id:task.id,naam:task.name,status:task.status||'open'});
      preview.push({actie:'koppelen',order:orderLabel(order),eerst:first.name,daarna:next.name});
    }else throw new Error(`Actie ${action.type||'(leeg)'} is niet toegestaan.`);
  }
  return {preview,beschermde_taken:[...new Map(protectedTasks.map(x=>[x.id,x])).values()],vereist_extra_bevestiging:protectedTasks.length>0};
}

async function executeTaskChanges(token,actions,{confirmationText='',allowProtected=false}={}){
  const result=await rest(token,'rpc/apply_ai_task_changes','0-0',{
    method:'POST',
    headers:{Prefer:'return=representation'},
    body:{p_workspace_id:WORKSPACE_ID,p_actions:actions,p_confirmation_text:String(confirmationText||'Expliciet bevestigd in ChatGPT'),p_allow_protected:!!allowProtected},
  });
  return result;
}

function previewOrderStatusChange(snapshot,orderId,status){
  const order=(snapshot.gegevens.orders||[]).find(o=>o.id===orderId);
  if(!order)throw new Error(`Order ${orderId||'(leeg)'} bestaat niet meer.`);
  const target=String(status||'').trim();
  if(!target)throw new Error('Orderstatus ontbreekt.');
  const completed=['completed','done','afgerond','complete'].includes(target.toLowerCase());
  return {
    order:{id:order.id,orderNo:order.orderNo||'',product:order.product||'',klant:order.customerName||order.customer||''},
    huidige_status:order.status||'',
    nieuwe_status:target,
    wordt_afgerond:completed,
    nieuwe_active_status:!completed,
  };
}

async function executeOrderStatusChange(token,orderId,status,confirmationText=''){
  const result=await rest(token,'rpc/apply_ai_order_status_change','0-0',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:{p_workspace_id:WORKSPACE_ID,p_order_id:orderId,p_status:status,p_confirmation_text:String(confirmationText||'Expliciet bevestigd in ChatGPT')},
  });
  const verify=await allRows(token,'planner_orders_v2',`select=order_id,order_no,status,active,completed_at,data,updated_at&workspace_id=eq.${WORKSPACE_ID}&order_id=eq.${encodeURIComponent(orderId)}&deleted=eq.false&limit=1`);
  return {resultaat:result,verificatie:verify[0]||null};
}

export {
  SUPABASE_KEY,SUPABASE_URL,WORKSPACE_ID,accessCatalog,allRows,authenticatedUser,authoritativeSnapshot,
  executeTaskChanges,executeOrderStatusChange,fitContext,orderRoute,previewOrderStatusChange,previewTaskChanges,readScope,resolveOrder,rest,scrub,tokenFrom,
};
