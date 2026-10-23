const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
test('real customer-list clicks open scoped all-time login history and dossier exposes the same action',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,queries=[];
 vm.runInContext("state.customers.push({id:'activity-customer',name:'Activity Customer'})",f.ctx);
 w.RALAB_ADMIN_AUTH={client:{from(table){const filters=[];let head=false;const q={select(columns,options){head=options?.head;return q},eq(k,v){filters.push([k,v]);return q},gte(k,v){filters.push([k,v]);return q},order(){return q},range(){return q},limit(){return q},then(resolve){queries.push({table,filters});return Promise.resolve({count:filters.some(x=>x[1]==='login')?7:0,data:head?null:[]}).then(resolve)}};return q}}};
 for(const render of [()=>w.RALAB_ERP.show('customers'),()=>w.RALAB_COMMERCIAL.renderCustomers()]){
 render();await f.wait(60);
 const b=d.querySelector('[data-customer-portal-activity="activity-customer"]');assert.ok(b);
 b.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:10,clientY:10}));await f.wait(30);
 assert.match(d.querySelector('#modalRoot').textContent,/7 inlogsessies/);
 assert.equal(d.querySelector('[data-activity-days]').value,'0');
 d.querySelector('[data-customer-activity-close]').click();
 }
 assert.ok(queries.length>=8);for(const q of queries){assert.equal(q.table,'portal_activity_log');assert.ok(q.filters.some(([k,v])=>k==='customer_id'&&v==='activity-customer'));assert.ok(!q.filters.some(([k])=>k==='created_at'))}
 w.RALAB_ERP.openCustomer('activity-customer');assert.ok(d.querySelector('#modalRoot [data-customer-portal-activity="activity-customer"]'));
});
