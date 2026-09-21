const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
const search=(f,text)=>{const input=f.w.document.querySelector('[data-order-search]');input.focus();input.value=text;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));return input};
const tap=(w,el)=>{for(const type of ['pointerdown','pointerup']){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:100,clientY:100});Object.defineProperty(e,'pointerType',{value:'touch'});el.dispatchEvent(e)}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:100,clientY:100}))};
test('complete shipped app boots without errors with both loader timings',async t=>{
 for(const loadBaseLast of [false,true]){const f=await fullApp(t,{loadBaseLast});assert.deepEqual(f.errors,[]);assert.equal(typeof f.w.confirmQuickComplete,'function');assert.ok(f.w.RALAB_DATE_TIME_FIELDS);await f.close()}
});
test('orders search retains focus and filters while all decorators are running',async t=>{
 const f=await fullApp(t),d=f.w.document;let input=d.querySelector('[data-order-search]');
 for(const ch of 'tigermoth'){search(f,input.value+ch);await f.wait(25);assert.equal(d.activeElement,input);assert.equal(d.querySelector('[data-order-search]'),input)}
 assert.equal(d.querySelectorAll('[data-order-card]').length,1);assert.equal(d.querySelector('[data-order-card]').dataset.orderCard,'o75');
 input.value='';input.dispatchEvent(new f.w.Event('search',{bubbles:true}));assert.equal(d.querySelectorAll('[data-order-card]').length,60);assert.deepEqual(f.errors,[]);
});
test('touch star ratings after filtering persist against authoritative order, without changing tasks',async t=>{
 const f=await fullApp(t),d=f.w.document;const before=f.state().tasks;search(f,'tigermoth');
 for(const n of [1,2,3,1]){
  tap(f.w,d.querySelector(`[data-priority-value="${n}"]`));await f.wait(350);
  assert.equal(f.state().orders.find(o=>o.id==='o75').planningPriority,n);
  assert.equal(JSON.parse(f.w.localStorage.getItem('ralabaster_planner_v1')).orders.find(o=>o.id==='o75').planningPriority,n);
  assert.equal(d.querySelectorAll('.priority-star.active').length,n);assert.equal(d.querySelector('[data-order-search]').value,'tigermoth');
 }
 assert.deepEqual(f.state().tasks,before);assert.deepEqual(f.errors,[]);
});
test('order decorations settle instead of replacing buttons forever',async t=>{
 const f=await fullApp(t);search(f,'tigermoth');await f.wait(900);let mutations=0;
 const ob=new f.w.MutationObserver(xs=>mutations+=xs.length);ob.observe(f.w.document.querySelector('#view-orders'),{subtree:true,childList:true});await f.wait(250);ob.disconnect();assert.equal(mutations,0);
});
test('customers navigation keeps commercial fields and customer planning PDF',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 vm.runInContext("state.customers.push({id:'customer-test',name:'Test customer',relationshipType:'customer',baseRevenueYTD:12500,baseMarginYTD:5000,contractType:'annual',contractValue:70000})",f.ctx);
 w.RALAB_ORDERS_INTERACTION_V4.go('customers');await f.wait(80);
 assert.ok(d.querySelector('button[onclick="RALAB_COMMERCIAL.customerForm()"]'));
 assert.ok(d.querySelector('[data-customer-planning-pdf]'));
 const edit=d.querySelector('button[onclick*="RALAB_COMMERCIAL.customerForm(\'"]');assert.ok(edit);edit.click();await f.wait(20);
 assert.ok(d.querySelector('#ccBaseRevenue'));assert.ok(d.querySelector('#ccBaseMargin'));assert.ok(d.querySelector('#ccContractType'));
 assert.deepEqual(f.errors,[]);
});
test('one touch opens date/time editor, release does not dismiss it, apply updates existing inputs once',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.openTask('test-task');await f.wait(80);
 for(const [selector,hour,minute] of [['#mStart','18','30'],['[data-task-day-end]','23','45']]){
  const input=d.querySelector(selector),button=input.nextElementSibling;let changes=0;input.addEventListener('change',()=>changes++);
  tap(w,button);await f.wait(20);assert.ok(d.querySelector('[data-temporal-dialog]'));assert.equal(d.querySelector('#modalRoot').hasAttribute('inert'),true);
  d.querySelector('#temporal-hour').value=hour;d.querySelector('#temporal-minute').value=minute;tap(w,d.querySelector('[data-temporal-apply]'));await f.wait(10);
  assert.equal(input.value,hour+':'+minute);assert.equal(changes,1);assert.ok(d.querySelector('#modalRoot .modal'));assert.equal(d.querySelector('#modalRoot').hasAttribute('inert'),false);
 }
 const date=d.querySelector('#mDate');tap(w,date.nextElementSibling);d.querySelector('#temporal-date').value='22-09-2026';tap(w,d.querySelector('[data-temporal-apply]'));await f.wait(10);assert.equal(date.value,'2026-09-22');assert.deepEqual(f.errors,[]);
});
test('invalid date/time stays open, cancellation keeps draft unchanged and all fields work in later popups',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.openTask('test-task');await f.wait(80);
 const input=d.querySelector('#mDate');tap(w,input.nextElementSibling);d.querySelector('#temporal-date').value='31-02-2026';tap(w,d.querySelector('[data-temporal-apply]'));assert.ok(d.querySelector('[data-temporal-dialog]'));assert.equal(input.value,'2026-09-16');tap(w,d.querySelector('[data-temporal-cancel]'));
 w.closeModal();w.showModal('<div class="modalbody"><label>Nieuw datumveld<input id="future" type="datetime-local" value="2026-09-16T09:05"></label></div>');await f.wait(10);
 const future=d.querySelector('#future');tap(w,future.nextElementSibling);d.querySelector('#temporal-hour').value='25';tap(w,d.querySelector('[data-temporal-apply]'));assert.ok(d.querySelector('[data-temporal-dialog]'));assert.equal(future.value,'2026-09-16T09:05');d.querySelector('#temporal-hour').value='19';tap(w,d.querySelector('[data-temporal-apply]'));assert.equal(future.value,'2026-09-16T19:05');assert.deepEqual(f.errors,[]);
});
test('calendar selection, month navigation and clearing are explicit and usable with one tap',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.openTask('test-task');await f.wait(80);const input=d.querySelector('#mDate');tap(w,input.nextElementSibling);
 tap(w,d.querySelector('[data-calendar-next]'));tap(w,d.querySelector('[data-calendar-day="2026-10-05"]'));tap(w,d.querySelector('[data-temporal-apply]'));assert.equal(input.value,'2026-10-05');await f.wait(10);tap(w,input.nextElementSibling);tap(w,d.querySelector('[data-temporal-clear]'));assert.equal(input.value,'');assert.deepEqual(f.errors,[]);
});
test('an input tap never triggers a coordinate-matching button underneath it',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;const searchInput=d.querySelector('[data-order-search]'),btn=d.querySelector('[data-unplan-all]');
 d.elementsFromPoint=()=>[searchInput,btn];btn.getBoundingClientRect=()=>({left:0,top:0,right:300,bottom:200,width:300,height:200});tap(w,searchInput);assert.equal(d.querySelector('#modalRoot').children.length,0);assert.deepEqual(f.errors,[]);
});
test('planning review shows every task day and overtime consumes later remainder',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,result={state:f.state(),health:{status:'ok',finish:'2026-09-17'}};const task=result.state.tasks.find(x=>x.id==='test-task');
 task.estimate=600;task.planSegments[0].minutes=400;task.planSegments[1].minutes=200;task.planSegments[1].elapsedMinutes=245;
 w.RALAB_ORDER_CONTROLS.openPlanReview(result,'o1','test');await f.wait(40);
 let rows=[...d.querySelectorAll('[data-review-task="test-task"][data-review-segment]')];assert.equal(rows.length,2);assert.match(rows[1].textContent,/Dag 2/);
 const end=rows[0].querySelector('[data-review-end]');end.value='21:00';end.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(w.RALAB_ORDER_CONTROLS.recalculateReview(false),true);const planned=w.__ralabOrderPlanReview.result.state.tasks.find(x=>x.id==='test-task');
 assert.equal(planned.planSegments.length,1);assert.equal(planned.planSegments[0].date,'2026-09-16');assert.equal(planned.planSegments[0].elapsedMinutes,715);assert.deepEqual(f.errors,[]);
});
test('changing intended hours recalculates end time and removes unnecessary days',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,result={state:f.state(),health:{status:'ok',finish:'2026-09-17'}};
 w.RALAB_ORDER_CONTROLS.openPlanReview(result,'o1','test');await f.wait(40);const estimate=d.querySelector('[data-review-task="test-task"] [data-review-estimate]');
 assert.equal(estimate.value,'12,5');estimate.value='5';assert.equal(w.RALAB_ORDER_CONTROLS.recalculateReview(true),true);await f.wait(40);
 const planned=w.__ralabOrderPlanReview.result.state.tasks.find(x=>x.id==='test-task'),rows=[...d.querySelectorAll('[data-review-task="test-task"][data-review-segment]')];
 assert.equal(planned.estimate,300);assert.equal(planned.planSegments.length,1);assert.equal(rows.length,1);assert.equal(rows[0].querySelector('[data-review-end]').value,'14:50',JSON.stringify(planned.planSegments));assert.match(rows[0].textContent,/Beoogd/);assert.deepEqual(f.errors,[]);
});
test('workplaces store preferences, maintenance, editable stock and exact shared machine costs',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.RALAB_WORKPLACES.show('workplaces');await f.wait(20);
 const machine=f.state().workplaces.find(x=>x.name==='Mori ZL15 #1');assert.ok(machine);assert.ok(d.querySelector('[data-new-workplace]'));
 d.querySelector(`[data-edit-workplace="${machine.id}"]`).click();d.querySelector('#wpHourly').value='77.5';d.querySelector('#wpPref1').value='Peter';d.querySelector(`[data-save-workplace="${machine.id}"]`).click();
 const savedMachine=f.state().workplaces.find(x=>x.id===machine.id);assert.equal(savedMachine.hourlyCost,77.5);assert.deepEqual(savedMachine.preferredEmployees,['Peter']);assert.equal(w.RALAB_WORKPLACES.candidateEmployees({machine:machine.name},['Ralph'])[0],'Peter');
 d.querySelector(`[data-add-maintenance="${machine.id}"]`).click();d.querySelector('#mtDescription').value='Preventieve beurt';d.querySelector('#mtHours').value='2.5';d.querySelector('#mtCost').value='180';d.querySelector(`[data-save-maintenance="${machine.id}"]`).click();
 assert.equal(f.state().maintenanceRecords.length,1);assert.match(d.querySelector('#view-workplaces').textContent,/Preventieve beurt/);
 w.RALAB_WORKPLACES.show('tooling');d.querySelector('[data-new-tool]').click();d.querySelector('#tlName').value='Wisselplaat';d.querySelector('#tlQuantity').value='4';d.querySelector('#tlMinimum').value='5';d.querySelector('[data-save-tool]').click();
 const tool=f.state().toolItems[0];assert.equal(tool.quantity,4);assert.match(d.querySelector('#view-tooling').textContent,/Bijbestellen/);d.querySelector(`[data-edit-tool="${tool.id}"]`).click();d.querySelector('#tlQuantity').value='12';d.querySelector(`[data-save-tool="${tool.id}"]`).click();assert.equal(f.state().toolItems.find(x=>x.id===tool.id).quantity,12);
 d.querySelector('[data-new-tool-cost]').click();d.querySelector('#tcDescription').value='Frezen factuur';d.querySelector('#tcAmount').value='100';const boxes=[...d.querySelectorAll('[data-cost-machine]')].slice(0,3);for(const box of boxes){box.checked=true;box.dispatchEvent(new w.Event('change',{bubbles:true}))}d.querySelector('[data-save-tool-cost]').click();
 const entry=f.state().toolCostEntries[0];assert.ok(entry,JSON.stringify(f.errors));assert.equal(entry.allocations.length,3);assert.equal(entry.allocations.reduce((n,x)=>n+x.amount,0),100);assert.deepEqual(f.errors,[]);
});
test('Mori and polishing prefer Shaffi then Peter',async t=>{
 const f=await fullApp(t),workplaces=f.state().workplaces;
 for(const name of ['Mori ZL15 #1','Mori ZL15 #2','Mori SL25','Polijsten'])assert.deepEqual(workplaces.find(x=>x.name===name).preferredEmployees,['Shaffi','Peter']);
 assert.deepEqual(f.errors,[]);
});
test('automatic planning skips a leftover gap shorter than thirty minutes',async t=>{
 const f=await fullApp(t),w=f.w;
 vm.runInContext("state.tasks.push({id:'short-gap',orderId:'o3',seq:1,name:'Polijsten',machine:'Polijsten',employee:'Shaffi',estimate:60,status:'open',planSegments:[]})",f.ctx);
 const task=vm.runInContext("state.tasks.find(x=>x.id==='short-gap')",f.ctx);w.RALAB_DEADLINE_PLANNER.allocateInternal(task,'2026-09-16T16:10');
 const saved=f.state().tasks.find(x=>x.id==='short-gap');assert.equal(saved.planSegments[0].date,'2026-09-17');assert.ok(saved.planSegments.every(x=>x.minutes>=30));assert.deepEqual(f.errors,[]);
});
test('three-week view is vertically continuous and also shows unplanned work',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.switchView('weeks');await f.wait(30);
 assert.equal(d.querySelectorAll('#view-weeks .week-block').length,4);assert.equal(d.querySelectorAll('#view-weeks .week-scroll').length,4);assert.match(d.querySelector('#view-weeks .weeks-backlog').textContent,/Nog in te plannen/);assert.ok(d.querySelector('.weeks-planner-layout>.weeks-sidebar'));assert.ok(d.querySelector('.weeks-planner-layout>.weeks-timeline'));assert.ok(d.querySelector('#weeksLoadMore'));for(const card of d.querySelectorAll('.weekgrid .task')){assert.ok(card.querySelector('.week-task-time'));assert.ok(card.querySelector('.op'));assert.ok(card.querySelector('.machine'));assert.equal(card.querySelector('.top'),null);assert.equal(card.querySelector('.deadline'),null)}d.querySelector('#weekDensityToggle').click();await f.wait(30);assert.match(d.querySelector('#weekDensityToggle').textContent,/Beknopt/);assert.equal(vm.runInContext('weekCompactView',f.ctx),false);d.querySelector('#weekDensityToggle').click();await f.wait(30);w.scrollTo=()=>{};w.loadMoreWeeks();await f.wait(30);assert.equal(d.querySelectorAll('#view-weeks .week-block').length,8);assert.deepEqual(f.errors,[]);
});
test('week proposal stays a draft, can move its chain and only persists on final acceptance',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 vm.runInContext("state.orders.push({id:'proposal-order',orderNo:'P-001',product:'Test batch',qty:10,active:true,planningPriority:3,communicatedDeadline:'2026-10-20',deadline:'2026-10-20'});state.tasks.push({id:'proposal-a',orderId:'proposal-order',seq:1,name:'Polijsten',machine:'Polijsten',estimate:120,status:'open',dependsPrev:false,planSegments:[]},{id:'proposal-b',orderId:'proposal-order',seq:2,name:'Inpakken',machine:'Inpakken',estimate:60,status:'open',dependsPrev:true,planSegments:[]})",f.ctx);
 w.RALAB_PERFORMANCE.invalidate();
 w.renderWeeks();await f.wait(30);assert.ok(d.querySelector('[data-week-proposal="proposal-order"]'));assert.ok(d.querySelector('[data-backlog-edit="proposal-a"]'));assert.ok(d.querySelector('[data-backlog-delete="proposal-a"]'));
 const liveBefore=JSON.stringify(f.state().tasks.find(x=>x.id==='proposal-a').planSegments);d.querySelector('[data-week-proposal="proposal-order"]').click();await f.wait(80);
 assert.ok(w.RALAB_WEEK_PROPOSAL.active());assert.ok(d.querySelector('.proposal-toolbar'));assert.ok(d.querySelector('.proposal-task'));assert.equal(JSON.stringify(f.state().tasks.find(x=>x.id==='proposal-a').planSegments),liveBefore);
 const draft=w.RALAB_WEEK_PROPOSAL.active().draft,first=draft.tasks.find(x=>x.id==='proposal-a'),second=draft.tasks.find(x=>x.id==='proposal-b'),oldSecond=second.planSegments[0].date;w.RALAB_WEEK_PROPOSAL.moveTask(first.id,w.addDays(first.planSegments[0].date,4),first.employee,first.start);await f.wait(50);
 assert.ok(w.RALAB_WEEK_PROPOSAL.active().draft.tasks.find(x=>x.id==='proposal-b').planSegments[0].date>=oldSecond);assert.equal(JSON.stringify(f.state().tasks.find(x=>x.id==='proposal-a').planSegments),liveBefore);
 w.alert=()=>{};w.RALAB_WEEK_PROPOSAL.accept();assert.ok(f.state().tasks.find(x=>x.id==='proposal-a').planSegments.length);assert.equal(w.RALAB_WEEK_PROPOSAL.active(),null);assert.deepEqual(f.errors,[]);
});
test('clicking a planned task shows deadline, current finish and next task planning',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 vm.runInContext("state.orders.push({id:'context-order',orderNo:'CTX-01',product:'Context product',qty:10,active:true,communicatedDeadline:'2026-10-20',deadline:'2026-10-20'});state.tasks.push({id:'context-a',orderId:'context-order',seq:1,name:'CTX-01 Mori instellen',machine:'Mori - Instellen',estimate:60,status:'open',planSegments:[{date:'2026-09-22',employee:'Ralph',start:'08:15',minutes:60}]},{id:'context-b',orderId:'context-order',seq:2,name:'Polijsten',machine:'Polijsten',estimate:90,status:'open',dependsPrev:true,planSegments:[{date:'2026-09-23',employee:'Shaffi',start:'08:15',minutes:90}]},{id:'context-c',orderId:'context-order',seq:3,name:'Inpakken',machine:'Inpakken',estimate:30,status:'open',dependsPrev:true,planSegments:[]})",f.ctx);w.RALAB_PERFORMANCE.invalidate();w.renderWeeks();await f.wait(30);
 const card=d.querySelector('[data-task="context-a"].week-task-compact');assert.ok(card);assert.ok(card.querySelector('.week-task-icon'));assert.doesNotMatch(card.querySelector('.op').textContent,/CTX-01/);card.click();await f.wait(40);
 const context=d.querySelector('.task-order-context');assert.ok(context);assert.match(context.textContent,/Klantdeadline/);assert.match(context.textContent,/20-10/);assert.match(context.textContent,/Nu verwacht klaar/);assert.match(context.textContent,/Polijsten/);assert.match(context.textContent,/23-9/);assert.match(context.textContent,/Inpakken/);assert.match(context.textContent,/Nog niet gepland/);
 w.openTask('context-c');await f.wait(30);assert.equal(d.querySelector('.task-order-context'),null);assert.deepEqual(f.errors,[]);
});
