const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
const search=(f,text)=>{const input=f.w.document.querySelector('[data-order-search]');input.focus();input.value=text;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));return input};
const tap=(w,el)=>{for(const type of ['pointerdown','pointerup']){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:100,clientY:100});Object.defineProperty(e,'pointerType',{value:'touch'});el.dispatchEvent(e)}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:100,clientY:100}))};
test('complete shipped app boots without errors with both loader timings',async t=>{
 for(const loadBaseLast of [false,true]){const f=await fullApp(t,{loadBaseLast});assert.deepEqual(f.errors,[]);assert.equal(typeof f.w.confirmQuickComplete,'function');assert.ok(f.w.RALAB_DATE_TIME_FIELDS);await f.close()}
});
test('selected calculation operations can be reordered and persist in that order',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.alert=()=>{};d.querySelector('.navbtn[data-view="calculation"]').click();await f.wait(180);
 const byName=name=>[...d.querySelectorAll('#view-calculation tbody tr')].find(row=>row.querySelector('td:nth-child(2) b')?.textContent.trim()===name);
 for(const name of ['Ruw materiaal boren','Doppen lijmen','Polijsten']){const box=byName(name).querySelector('[data-opcheck]');box.checked=true;box.dispatchEvent(new w.Event('change',{bubbles:true}))}
 d.querySelector('#cName').value='Volgordetest';d.querySelector('#cName').dispatchEvent(new w.Event('change',{bubbles:true}));
 d.querySelector('#cuiLoadSteps').click();await f.wait(60);
 const polish=byName('Polijsten');polish.querySelector('[data-cui-op-move="up"]').click();polish.querySelector('[data-cui-op-move="up"]').click();
 assert.deepEqual(Array.from(w.RALAB_CALC_UI.products[0].ops,x=>x.name),['Polijsten','Ruw materiaal boren','Doppen lijmen']);
 w.RALAB_CALC.saveDraft();await f.wait(40);
 const saved=f.state().calculations.at(-1),savedOps=saved.ops||saved.products?.[0]?.ops;assert.deepEqual(savedOps.map(x=>x.name),['Polijsten','Ruw materiaal boren','Doppen lijmen']);assert.deepEqual(f.errors,[]);
});
test('existing order calculation shows and live-updates cost, sales and margin',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 vm.runInContext("state.orders.push({id:'margin-order',orderNo:'MARGE-001',product:'Margeproduct',qty:10,saleUnit:100,materialCostUnit:20,active:true,deadline:'2026-10-20'});state.tasks.push({id:'margin-task',orderId:'margin-order',seq:1,name:'Bewerking',machine:'Schuren',estimate:60,orderCalcMinutes:60,calcMode:'batch',rate:30,status:'open',planSegments:[]})",f.ctx);w.RALAB_PERFORMANCE.invalidate();w.RALAB_ORDER_CALC.open('margin-order');await f.wait(60);
 const summary=d.querySelector('#ocMarginSummary');assert.ok(summary);assert.match(summary.textContent,/Inkoop \/ materiaal totaal/);assert.match(summary.textContent,/Kostprijs \/ product/);assert.match(summary.textContent,/23,00/);assert.match(summary.textContent,/770,00/);assert.match(summary.textContent,/77,0%/);
 const sale=d.querySelector('#ocSale');sale.value='120';sale.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(summary.textContent,/970,00/);assert.match(summary.textContent,/80,8%/);assert.deepEqual(f.errors,[]);
});
test('an existing quotation reopens in calculation and updates without creating a duplicate',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.alert=()=>{};
 vm.runInContext("state.customers.push({id:'quote-customer',name:'Offerteklant'});state.quotes.push({id:'quote-edit-1',quoteNo:'20260923-77',orderNo:'20260923-77',quoteGroupId:'quote-edit-group',lineNo:1,customerId:'quote-customer',project:'Edit project',customerReference:'REF-77',name:'Edit product',qty:10,materialCost:20,materialMode:'unit',marginMode:'factor',marginValue:2,ops:[{id:'op20',name:'Schuren',rate:30,mode:'batch',minutes:60,externalBatch:0,externalUnit:0}],costUnit:23,saleUnit:60,total:600,status:'concept',estimatedReadyDate:'2026-10-20'})",f.ctx);
 w.RALAB_QUOTE_INBOX.render();await f.wait(30);d.querySelector('[data-open-quote-row="20260923-77"]').click();await f.wait(60);
 const back=d.querySelector('[data-quote-to-calculation="20260923-77"]');assert.ok(back);back.click();await f.wait(220);
 assert.equal(d.querySelector('#view-calculation').classList.contains('hidden'),false);assert.equal(d.querySelector('#cName').value,'Edit product');assert.equal(d.querySelector('#cMaterial').value,'20');assert.equal(d.querySelector('#cQty').value,'10');assert.equal(d.querySelector('[data-update-quote-calculation]').textContent,'Offerte bijwerken');
 d.querySelector('#cMaterial').value='25';d.querySelector('#cMaterial').dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-update-quote-calculation]').click();await f.wait(140);
 const saved=f.state().quotes.filter(q=>(q.quoteNo||q.orderNo)==='20260923-77');assert.equal(saved.length,1);assert.equal(saved[0].materialCost,25);assert.equal(saved[0].costUnit,28);assert.equal(saved[0].saleUnit,60);assert.ok(d.querySelector('[data-quote-to-calculation="20260923-77"]'));assert.deepEqual(f.errors,[]);
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
test('completed orders reopen all packing slip, email and post-calculation actions',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,documents=[];w.alert=()=>{};
 vm.runInContext("state.customers.push({id:'done-customer',name:'Klant gereed',email:'inkoop@example.test'});state.orders.push({id:'done-order',orderNo:'DONE-001',customerId:'done-customer',customerName:'Klant gereed',product:'Alabaster schaal',qty:12,completedQty:12,active:false,closed:true,status:'completed',completedAt:'2026-09-23T15:20',yieldPct:91.5});state.tasks.push({id:'done-a',orderId:'done-order',seq:1,name:'Draaien',machine:'Mori',employee:'Kaan',estimate:90,actual:105,status:'done',consumption:'12 kg',note:'gereed'})",f.ctx);w.RALAB_PERFORMANCE.invalidate();
 w.open=()=>{const item={html:''};documents.push(item);return{document:{open(){},write(x){item.html=x},close(){},set title(x){item.title=x}},close(){item.closed=true}}};let mail='';w.HTMLAnchorElement.prototype.click=function(){mail=this.href};
 w.RALAB_ERP.show('completed');await f.wait(120);const reopen=d.querySelector('[data-completed-actions="done-order"]');assert.ok(reopen);tap(w,reopen);await f.wait(40);
 assert.ok(d.querySelector('[data-completed-document="report"]'));assert.ok(d.querySelector('[data-completed-document="packing"]'));assert.ok(d.querySelector('[data-completed-email="done-order"]'));const note=d.querySelector('[data-completed-note="done-order"]');assert.ok(note);note.value='Deellevering 1 van 2\nBreekbaar';note.dispatchEvent(new w.Event('input',{bubbles:true}));await f.wait(500);assert.equal(f.state().orders.find(x=>x.id==='done-order').deliveryNote,'Deellevering 1 van 2\nBreekbaar');
 tap(w,d.querySelector('[data-completed-document="report"]'));await f.wait(20);tap(w,d.querySelector('[data-completed-document="packing"]'));await f.wait(20);tap(w,d.querySelector('[data-completed-email="done-order"]'));await f.wait(20);
 assert.match(documents[0].html,/Productierapport \/ nacalculatie/);assert.match(documents[0].html,/1u 45m/);assert.match(documents[1].html,/Pakbon/);assert.match(documents[1].html,/Alabaster schaal/);assert.match(documents[1].html,/Deellevering 1 van 2<br>Breekbaar/);assert.match(mail,/^mailto:inkoop%40example\.test/);
 tap(w,d.querySelector('[data-completed-overview]'));await f.wait(50);assert.equal(d.querySelector('#view-completed').classList.contains('hidden'),false);assert.ok(d.querySelector('[data-completed-actions="done-order"]'));assert.deepEqual(f.errors,[]);
});
test('task completion works through the touch-safe action and complete order closes every remaining task',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.alert=()=>{};w.confirm=()=>true;
 vm.runInContext("state.orders.push({id:'finish-one',orderNo:'FIN-ONE',product:'Alleen taak',qty:2,active:true,deadline:'2026-10-20'},{id:'finish-all',orderNo:'FIN-ALL',product:'Complete order',qty:2,active:true,deadline:'2026-10-20'});state.tasks.push({id:'finish-one-a',orderId:'finish-one',seq:1,name:'Stap 1',machine:'Zaag',estimate:20,status:'open',planSegments:[]},{id:'finish-one-b',orderId:'finish-one',seq:2,name:'Stap 2',machine:'Polijsten',estimate:20,status:'open',planSegments:[]},{id:'finish-all-a',orderId:'finish-all',seq:1,name:'Stap 1',machine:'Zaag',estimate:20,status:'open',planSegments:[]},{id:'finish-all-b',orderId:'finish-all',seq:2,name:'Stap 2',machine:'Polijsten',estimate:20,status:'open',planSegments:[]})",f.ctx);w.RALAB_PERFORMANCE.invalidate();
 w.openQuickComplete('finish-one-a');await f.wait(30);assert.ok(d.querySelector('[data-complete-task="finish-one-a"]'));assert.ok(d.querySelector('[data-complete-entire-order="finish-one-a"]'));tap(w,d.querySelector('[data-complete-task="finish-one-a"]'));await f.wait(40);assert.equal(f.state().tasks.find(x=>x.id==='finish-one-a').status,'done');assert.equal(f.state().tasks.find(x=>x.id==='finish-one-b').status,'open');assert.equal(f.state().orders.find(x=>x.id==='finish-one').active,true);
 w.openQuickComplete('finish-all-a');await f.wait(30);tap(w,d.querySelector('[data-complete-entire-order="finish-all-a"]'));await f.wait(40);const finished=f.state();assert.equal(finished.orders.find(x=>x.id==='finish-all').status,'completed');assert.equal(finished.orders.find(x=>x.id==='finish-all').active,false);assert.ok(finished.tasks.filter(x=>x.orderId==='finish-all').every(x=>x.status==='done'));assert.match(d.querySelector('#modalRoot').textContent,/Order afgerond/);assert.deepEqual(f.errors,[]);
});
test('reordering a planned block repacks the employee day from its earliest possible time',async t=>{
 const f=await fullApp(t),w=f.w;
 vm.runInContext("state.orders.push({id:'drag-a',orderNo:'DRAG-A',product:'Eerste',qty:1,active:true,deadline:'2026-10-20'},{id:'drag-b',orderNo:'DRAG-B',product:'Tweede',qty:1,active:true,deadline:'2026-10-20'},{id:'drag-shelby',orderNo:'SHELBY',product:'Shelby',qty:80,active:true,deadline:'2026-10-20'});state.tasks.push({id:'drag-first',orderId:'drag-a',seq:1,name:'Eerste taak',machine:'Reichenbacher',employee:'Ralph',estimate:60,status:'open',lockedPlanning:true,date:'2026-09-24',start:'10:00',planSegments:[{date:'2026-09-24',employee:'Ralph',start:'10:00',minutes:60}]},{id:'drag-second',orderId:'drag-b',seq:1,name:'Tweede taak',machine:'Reichenbacher',employee:'Ralph',estimate:60,status:'open',lockedPlanning:true,date:'2026-09-24',start:'11:00',planSegments:[{date:'2026-09-24',employee:'Ralph',start:'11:00',minutes:60}]},{id:'drag-shelby-task',orderId:'drag-shelby',seq:1,name:'Shelby instellen',machine:'Teach-in',employee:'Ralph',estimate:45,status:'open',lockedPlanning:true,date:'2026-09-24',start:'12:00',planSegments:[{date:'2026-09-24',employee:'Ralph',start:'12:00',minutes:45}]})",f.ctx);w.RALAB_PERFORMANCE.invalidate();
 const result=w.RALAB_MANUAL_START.reorderBefore('drag-shelby-task','drag-second','2026-09-24','Ralph');assert.equal(result.error,undefined);const tasks=f.state().tasks,first=tasks.find(x=>x.id==='drag-first'),shelby=tasks.find(x=>x.id==='drag-shelby-task'),second=tasks.find(x=>x.id==='drag-second');assert.equal(first.start,'08:15');assert.ok(shelby.start>first.start);assert.ok(second.start>shelby.start);assert.ok(result.moved>=3);assert.deepEqual(f.errors,[]);
});
test('planning backlog keeps the selected order first and open while planning it step by step',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 vm.runInContext("state.orders.push({id:'other-order',orderNo:'A-OTHER',product:'Andere order',customerName:'Andere klant',qty:1,active:true,deadline:'2026-10-20'},{id:'sticky-order',orderNo:'B-STICKY',product:'Stap voor stap',customerName:'Zoekklant',qty:1,active:true,deadline:'2026-10-20'});state.tasks.push({id:'other-a',orderId:'other-order',seq:1,name:'Andere taak',machine:'Polijsten',estimate:30,status:'open',planSegments:[]},{id:'sticky-a',orderId:'sticky-order',seq:1,name:'Stap een',machine:'Polijsten',estimate:30,status:'open',planSegments:[]},{id:'sticky-b',orderId:'sticky-order',seq:2,name:'Stap twee',machine:'Inpakken',estimate:30,status:'open',planSegments:[]})",f.ctx);w.RALAB_PERFORMANCE.invalidate();w.renderWeeks();await f.wait(30);
 assert.equal(d.querySelector('#view-weeks [data-backlog-order]')?.dataset.backlogOrder,'other-order');const search=d.querySelector('#view-weeks [data-backlog-search-input]');assert.ok(search);search.value='zoekklant stap twee';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.deepEqual([...d.querySelectorAll('#view-weeks [data-backlog-order]')].filter(x=>!x.hidden).map(x=>x.dataset.backlogOrder),['sticky-order']);search.value='';search.dispatchEvent(new w.Event('input',{bubbles:true}));w.openTask('sticky-a');await f.wait(20);w.closeModal();vm.runInContext("const x=state.tasks.find(t=>t.id==='sticky-a');x.employee='Kaan';x.date='2026-10-01';x.start='08:15';x.planSegments=[{date:'2026-10-01',employee:'Kaan',start:'08:15',minutes:30}]",f.ctx);w.RALAB_PERFORMANCE.invalidate();w.renderWeeks();await f.wait(30);
 const first=d.querySelector('[data-backlog-order]');assert.equal(first?.dataset.backlogOrder,'sticky-order');assert.equal(first.open,true);assert.match(first.textContent,/Stap twee/);assert.deepEqual(f.errors,[]);
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
 assert.equal(d.querySelectorAll('#view-weeks .week-block').length,4);assert.equal(d.querySelectorAll('#view-weeks .week-scroll').length,4);assert.match(d.querySelector('#view-weeks .weeks-backlog').textContent,/Nog in te plannen/);assert.ok(d.querySelector('.weeks-planner-layout>.weeks-sidebar'));assert.ok(d.querySelector('.weeks-planner-layout>.weeks-timeline'));assert.ok(d.querySelector('#weeksLoadMore'));for(const card of d.querySelectorAll('.weekgrid .task')){assert.ok(card.querySelector('.week-task-time'));assert.ok(card.querySelector('.week-task-icon svg'));assert.ok(card.querySelector('.week-task-order'));assert.equal(card.querySelector('.op'),null);assert.equal(card.querySelector('.machine'),null);assert.equal(card.querySelector('.top'),null);assert.equal(card.querySelector('.deadline'),null)}d.querySelector('#weekDensityToggle').click();await f.wait(30);assert.match(d.querySelector('#weekDensityToggle').textContent,/Beknopt/);assert.equal(vm.runInContext('weekCompactView',f.ctx),false);d.querySelector('#weekDensityToggle').click();await f.wait(30);w.scrollTo=()=>{};w.loadMoreWeeks();await f.wait(30);assert.equal(d.querySelectorAll('#view-weeks .week-block').length,8);assert.deepEqual(f.errors,[]);
});
test('week cells show remaining capacity instead of planned versus available',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.switchView('weeks');await f.wait(30);
 const labels=[...d.querySelectorAll('.weekgrid .daycell>.hours')];assert.ok(labels.length);for(const label of labels){assert.match(label.textContent,/^(Nog |Vol$|Overpland |Geen capaciteit$)/);assert.doesNotMatch(label.textContent,/\//)}assert.deepEqual(f.errors,[]);
});
test('AI planner advises without changing planning and remembers manual choices',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,before=JSON.stringify(f.state().tasks);d.querySelector('.navbtn[data-view="ai"]').click();await f.wait(80);
 assert.match(d.querySelector('#view-ai').textContent,/AI-productieleider/);assert.equal(d.querySelector('#view-ai').classList.contains('hidden'),false);assert.equal(d.querySelector('#view-today').classList.contains('hidden'),true);assert.match(d.querySelector('#view-ai').textContent,/past nooit zelf de planning aan/);assert.ok(d.querySelector('[data-ai-proposal]'));assert.ok(d.querySelector('[data-ai-form]'));
 assert.ok(d.querySelector('[data-ai-voice]'));assert.match(d.querySelector('[data-ai-input]').placeholder,/Typ of spreek/);
 await w.RALAB_AI_PLANNER.ask('Wat moet als eerste en waarom?');await f.wait(30);assert.ok(d.querySelector('.ai-message.assistant'));assert.match(d.querySelector('.ai-message.assistant').textContent,/Voorstel|aandacht/i);assert.equal(JSON.stringify(f.state().tasks),before);
 vm.runInContext("const aiTask=state.tasks.find(x=>x.id==='test-task');aiTask.planningOrigin='manual';aiTask.lockedPlanning=true;aiTask.planSegments=[{date:'2026-09-18',employee:'Ralph',start:'08:15',minutes:60}];save()",f.ctx);assert.ok(f.state().aiDecisionLog.some(x=>x.type==='observed_manual_change'));
 d.querySelector('[data-ai-rule-input]').value='Polijsten liefst bij Shaffi';d.querySelector('[data-ai-add-rule]').click();assert.ok(f.state().aiPlannerRules.some(x=>x.text==='Polijsten liefst bij Shaffi'));assert.deepEqual(f.errors,[]);
});
test('AI task changes stay pending until Ralph applies them explicitly',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.alert=()=>{};w.confirm=()=>true;d.querySelector('.navbtn[data-view="ai"]').click();await f.wait(40);
 vm.runInContext("state.orders.push({id:'ai-order',orderNo:'AI-1',product:'AI test',active:true});state.tasks.push({id:'ai-a',orderId:'ai-order',seq:1,name:'Draaien',machine:'Mori ZL15 #1',estimate:60,status:'open',planSegments:[]},{id:'ai-b',orderId:'ai-order',seq:2,name:'Inpakken',machine:'Inpakken',estimate:30,status:'open',planSegments:[]});state.aiPlannerMessages.push({id:'ai-proposal-message',role:'assistant',mode:'ai',text:'Voorstel klaar.',proposal:{summary:'Polijsten toevoegen en koppelen',status:'pending',actions:[{type:'add_task',orderId:'ai-order',afterTaskId:'ai-a',name:'Polijsten',machine:'Polijsten',estimate:90,taskType:'internal'}]}})",f.ctx);
 w.RALAB_AI_PLANNER.render();assert.equal(f.state().tasks.filter(x=>x.orderId==='ai-order').length,2);assert.ok(d.querySelector('[data-ai-apply-proposal="ai-proposal-message"]'));
 d.querySelector('[data-ai-apply-proposal="ai-proposal-message"]').click();await f.wait(20);const own=f.state().tasks.filter(x=>x.orderId==='ai-order').sort((a,b)=>a.seq-b.seq);assert.deepEqual(own.map(x=>x.name),['Draaien','Polijsten','Inpakken']);assert.equal(f.state().aiPlannerMessages.find(x=>x.id==='ai-proposal-message').proposal.status,'applied');assert.ok(f.state().aiDecisionLog.some(x=>x.type==='ai_task_change'&&x.status==='applied'));assert.deepEqual(f.errors,[]);
});
test('microphone sends Dutch speech to the AI planner',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;let instance;
 w.webkitSpeechRecognition=class{constructor(){instance=this}start(){this.onstart()}stop(){this.onend()}};
 d.querySelector('.navbtn[data-view="ai"]').click();await f.wait(30);d.querySelector('[data-ai-voice]').click();assert.ok(instance);instance.onresult({resultIndex:0,results:Object.assign([[{transcript:'Welke stappen heeft order één?'}]],{0:Object.assign([{transcript:'Welke stappen heeft order één?'}],{isFinal:true})})});instance.onend();await f.wait(50);
 assert.ok(f.state().aiPlannerMessages.some(x=>x.role==='user'&&/Welke stappen/.test(x.text)));assert.deepEqual(f.errors,[]);
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
 vm.runInContext("state.orders.push({id:'context-order',orderNo:'CTX-01',product:'Context product',qty:10,active:true,communicatedDeadline:'2026-10-20',deadline:'2026-10-20'});state.tasks.push({id:'context-a',orderId:'context-order',seq:1,name:'CTX-01 Mori instellen',machine:'Mori ZL15 #1',estimate:60,status:'open',planSegments:[{date:'2026-09-22',employee:'Ralph',start:'08:15',minutes:60}]},{id:'context-b',orderId:'context-order',seq:2,name:'Polijsten',machine:'Polijsten',estimate:90,status:'open',dependsPrev:true,planSegments:[{date:'2026-09-23',employee:'Shaffi',start:'08:15',minutes:90}]},{id:'context-c',orderId:'context-order',seq:3,name:'Inpakken',machine:'Inpakken',estimate:30,status:'open',dependsPrev:true,planSegments:[]})",f.ctx);w.RALAB_PERFORMANCE.invalidate();w.renderWeeks();await f.wait(30);
 const card=d.querySelector('[data-task="context-a"].week-task-compact');assert.ok(card);assert.ok(card.querySelector('.week-task-icon.icon-lathe svg'));assert.equal(card.querySelector('.workplace-number').textContent,'1');assert.equal(card.querySelector('.week-task-order').textContent,'10x Context product');assert.equal(card.querySelector('.op'),null);assert.doesNotMatch(card.textContent,/CTX-01/);assert.equal(w.workplaceNumber('Mori SL25'),'3');const names=['Mori ZL15 #1','KUKA robot','Polijsten','Zaag','Ruw materiaal boren','Doppen lijmen','Assemblage','Inpakken'],icons=names.map(x=>w.planningMachineIcon(x));assert.equal(new Set(icons).size,icons.length,names.map(x=>`${x}: ${w.workplaceKind(x)}`).join(', '));card.click();await f.wait(40);
 const context=d.querySelector('.task-order-context');assert.ok(context);assert.match(context.textContent,/Klantdeadline/);assert.match(context.textContent,/20-10/);assert.match(context.textContent,/Nu verwacht klaar/);assert.match(context.textContent,/Polijsten/);assert.match(context.textContent,/23-9/);assert.match(context.textContent,/Inpakken/);assert.match(context.textContent,/Nog niet gepland/);
 w.openTask('context-c');await f.wait(30);assert.equal(d.querySelector('.task-order-context'),null);assert.deepEqual(f.errors,[]);
});
