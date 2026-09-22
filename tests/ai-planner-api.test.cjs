const {test}=require('node:test'),assert=require('node:assert/strict');

function response(){return{code:0,body:null,status(n){this.code=n;return this},json(x){this.body=x;return this}}}

test('AI planner endpoint rejects unsupported methods and anonymous use',async()=>{
 const {default:handler}=await import('../api/ai-planner.mjs');
 let res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.code,405);
 res=response();await handler({method:'POST',headers:{},body:{message:'Plan dit'}},res);assert.equal(res.code,401);assert.match(res.body.error,/Supabase/);
});

test('AI planner reads normalized records and all metadata with the signed-in user token',async()=>{
 const mod=await import('../api/ai-planner.mjs'),originalFetch=global.fetch;
 global.fetch=async url=>{
  if(String(url).includes('/auth/v1/user'))return{ok:true,json:async()=>({id:'ralph'})};
  if(String(url).includes('/planner_shared_state?'))return{ok:true,json:async()=>[{data:{customers:[{id:'c1'}],quotes:[{id:'q1'}],calculations:[{id:'calc1'}],productTemplates:[{id:'p1'}],workplaces:[{id:'w1'}],maintenanceRecords:[{id:'m1'}],toolItems:[{id:'tool1'}],toolCostEntries:[{id:'cost1'}],staffAbsences:[{id:'a1'}],history:[{id:'h1'}]}}]};
  if(String(url).includes('/planner_orders_v2?'))return{ok:true,json:async()=>[{data:{id:'o1',product:'Shelby'}}]};
  if(String(url).includes('/planner_tasks_v2?'))return{ok:true,json:async()=>[{data:{id:'t1',orderId:'o1'}}]};
  throw new Error('unexpected fetch '+url);
 };
 try{
  const snapshot=await mod.authoritativeSnapshot('valid-token',{}),names=snapshot.databronnen.map(x=>x.bron);
  assert.equal(snapshot.gegevens.orders[0].id,'o1');assert.equal(snapshot.gegevens.tasks[0].id,'t1');
  for(const name of ['klanten','offertes','calculaties','producten','werkplekken','onderhoud','gereedschap','machinekosten','afwezigheid','historie'])assert.ok(names.includes(name),name);
  assert.equal(snapshot.rechten.lezen,'alle gegevens in de productieplanner');
  assert.match(snapshot.rechten.schrijven,/akkoord van Ralph/);
 }finally{global.fetch=originalFetch}
});

test('AI planner extracts a safe task proposal without exposing the control block',async()=>{
 const {extractProposal}=await import('../api/ai-planner.mjs');
 const result=extractProposal('Ik stel voor polijsten toe te voegen.\n<planner_actions>{"summary":"Polijsten toevoegen","actions":[{"type":"add_task","orderId":"o1","afterTaskId":"t1","name":"Polijsten","machine":"Polijsten","estimate":90,"taskType":"internal"}]}</planner_actions>');
 assert.equal(result.answer,'Ik stel voor polijsten toe te voegen.');
 assert.equal(result.proposal.status,'pending');
 assert.equal(result.proposal.actions[0].type,'add_task');
 assert.equal(result.proposal.actions[0].estimate,90);
 assert.doesNotMatch(result.answer,/planner_actions/);
});

test('AI planner ignores malformed and unsupported action blocks',async()=>{
 const {extractProposal}=await import('../api/ai-planner.mjs');
 assert.equal(extractProposal('Antwoord zonder wijziging').proposal,null);
 assert.equal(extractProposal('Voorstel<planner_actions>{geen json}</planner_actions>').proposal,null);
 assert.equal(extractProposal('Voorstel<planner_actions>{"actions":[{"type":"delete_everything"}]}</planner_actions>').proposal,null);
});
