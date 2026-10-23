const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(process.env.PLANNER_JSDOM_PATH||'jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function fixture(t,{error=null}={}){
 const dom=new JSDOM(read('portal.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://planner.test/portal',runScripts:'dangerously'});t.after(()=>dom.window.close());const w=dom.window,calls=[],scrolls=[];
 w.RALAB_CONFIG={online:{}};w.CSS={escape:v=>v};w.supabase={createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {error}}})};
 w.scrollTo=position=>{scrolls.push({...position});w.scrollX=position.left||0;w.scrollY=position.top};
 vm.runInContext(read('assets/customer-order-tools.js'),dom.getInternalVMContext());
 let source=read('assets/customer-portal.js').replace('boot();',`session={user:{id:'user'}};customer={customer_id:'customer'};member={};orders=[{id:'order-one',order_no:'ONE',status:'confirmed',requested_delivery_date:'2026-11-01',portal_order_lines:[]}];queryData=async()=>{orderChangeRequests=[{order_id:'order-one',status:'pending',requested_delivery_date:'2026-11-02',message:'My note'}]};window.testPortal={nav,inlineDateChange,sendOrderChangeRequest};`);
 vm.runInContext(source,dom.getInternalVMContext());w.testPortal.nav('orders');scrolls.length=0;w.scrollX=12;w.scrollY=1600;
 return {w,d:w.document,calls,scrolls};
}
test('successful inline change refreshes the pending request without scrolling back to the top',async t=>{
 const {w,d,calls,scrolls}=fixture(t),input=d.querySelector('[data-inline-date]');input.value='2026-11-02';d.querySelector('[data-inline-note]').value='My note';
 await w.testPortal.inlineDateChange('order-one',d.querySelector('[data-inline-change]'));
 assert.equal(calls[0].name,'portal_request_order_change');assert.equal(calls[0].args.p_message,'My note');assert.match(d.querySelector('.pending-change').textContent,/My note/);assert.equal(w.scrollY,1600);assert.equal(w.scrollX,12);assert.deepEqual(scrolls,[{left:12,top:1600,behavior:'instant'}]);
 w.testPortal.nav('products');assert.deepEqual(scrolls.at(-1),{top:0,behavior:'smooth'});
});
test('failed inline change keeps position and editable draft without rerendering',async t=>{
 const {w,d,scrolls}=fixture(t,{error:Error('Offline')});d.querySelector('[data-inline-note]').value='Keep this note';const button=d.querySelector('[data-inline-change]');await w.testPortal.inlineDateChange('order-one',button);
 assert.equal(w.scrollY,1600);assert.equal(scrolls.length,0);assert.equal(button.disabled,false);assert.equal(d.querySelector('[data-inline-note]').value,'Keep this note');assert.match(d.getElementById('portalToast').textContent,/Offline/);
});
test('modal change refresh also preserves the underlying order list position',async t=>{
 const {w,d,scrolls}=fixture(t);d.body.insertAdjacentHTML('beforeend','<div class="modal-back"><form data-order-id="order-one"><input name="requested_delivery_date" value="2026-11-02"><textarea name="message">My note</textarea><button type="submit">Send</button><span data-change-status></span></form></div>');await w.testPortal.sendOrderChangeRequest(d.querySelector('.modal-back form'));
 assert.equal(d.querySelector('.modal-back'),null);assert.equal(w.scrollY,1600);assert.deepEqual(scrolls,[{left:12,top:1600,behavior:'instant'}]);
});
