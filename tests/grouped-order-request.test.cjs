const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require(process.env.PLANNER_JSDOM_PATH||'jsdom');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
function portal(t,rpc){
 const dom=new JSDOM(read('portal.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://planner.test/portal',runScripts:'dangerously'});t.after(()=>dom.window.close());const w=dom.window;
 w.alert=()=>{};w.scrollTo=()=>{};w.crypto.randomUUID=crypto.randomUUID;
 w.RALAB_PORTAL_CONFIG={};w.RALAB_CONFIG={online:{}};
 const client={rpc,from(){throw Error('Refresh offline')}};w.supabase={createClient:()=>client};
 vm.runInContext(read('assets/customer-request-lines.js'),dom.getInternalVMContext());
 let src=read('assets/customer-portal.js');src=src.replace('boot();',`session={user:{id:'user'}};customer={customer_id:'customer'};window.testRequest={renderGroupedRequest,sendGroupedRequest};`);
 vm.runInContext(src,dom.getInternalVMContext());w.testRequest.renderGroupedRequest();return w;
}
function fill(row,name,qty){for(const [key,v] of Object.entries({product_name:name,description:'Detailed description',dimensions:'100 mm',material:'Albast',quantity:String(qty)}))row.querySelector('[name='+key+']').value=v}
test('multiple product lines submit as one request; failed submission retains fields and retry identity',async t=>{
 const calls=[];let fail=true;const w=portal(t,async(name,args)=>{calls.push({name,args});return {error:fail?Error('Offline'):null}}),d=w.document;
 const form=d.querySelector('#productRequestForm');fill(form.querySelector('fieldset'),'Lamp',2);
 form.elements.customer_reference.value='PO-123';form.elements.requested_delivery_date.value='2026-12-01';
 d.querySelector('[data-add-request-line]').click();fill(form.querySelectorAll('fieldset')[1],'Shade',3);
 await w.testRequest.sendGroupedRequest(form);assert.match(form.textContent,/Offline/);assert.equal(form.querySelectorAll('fieldset').length,2);assert.equal(form.elements.customer_reference.value,'PO-123');
 fail=false;await w.testRequest.sendGroupedRequest(form);
 assert.equal(calls.length,2);assert.equal(calls[0].name,'portal_submit_order_request');assert.equal(calls[0].args.p_request_id,calls[1].args.p_request_id);assert.equal(calls[1].args.p_customer_reference,'PO-123');assert.equal(calls[1].args.p_lines.length,2);assert.equal(calls[1].args.p_lines[1].quantity,3);
 assert.match(d.getElementById('portalMain').textContent,/Bestelaanvraag ontvangen/);assert.equal(d.querySelector('#productRequestForm'),null);
});
test('line removal preserves other values and always retains one product line',t=>{
 const w=portal(t,async()=>({})),d=w.document;fill(d.querySelector('fieldset'),'Lamp',2);d.querySelector('[data-add-request-line]').click();d.querySelectorAll('[data-remove-request-line]')[1].click();assert.equal(d.querySelectorAll('fieldset').length,1);d.querySelector('[data-remove-request-line]').click();assert.equal(d.querySelectorAll('fieldset').length,1);assert.equal(d.querySelector('[name=product_name]').value,'Lamp');
});
test('grouped and legacy request details retain fields and escape customer input',t=>{
 const w=portal(t,async()=>({})),helper=w.RALAB_REQUEST_LINES;
 const html=helper.details({customer_reference:'<script>',product_lines:[{product_name:'A',description:'One',quantity:2,unit:'stuks'},{product_name:'B',description:'Two',dimensions:'20mm',material:'stone',quantity:3,unit:'sets',attachment_path:'a/b.pdf'}]});
 assert.match(html,/&lt;script&gt;/);assert.match(html,/20mm/);assert.match(html,/stone/);assert.match(html,/data-request-attachment/);assert.equal((html.match(/<li>/g)||[]).length,2);assert.match(helper.details({product_name:'Legacy',description:'Original',quantity:1}),/Legacy/);
});

test('per-line uploads are preserved on RPC retries and oversized attachments never submit',async t=>{
 const calls=[],uploads=[];const w=portal(t,async(name,args)=>{calls.push(args);return {error:Error('Retry')}}),d=w.document;
 w.RALAB_REQUEST_CLIENT.storage={from:()=>({upload:async(path,file)=>{uploads.push({path,name:file.name});return {error:null}}})};
 const form=d.querySelector('form#productRequestForm');fill(form.querySelector('fieldset'),'Lamp',2);d.querySelector('[data-add-request-line]').click();fill(form.querySelectorAll('fieldset')[1],'Shade',3);
 const inputs=[...form.querySelectorAll('[type=file]')];for(const [i,input] of inputs.entries())Object.defineProperty(input,'files',{configurable:true,value:[{name:'drawing'+i+'.pdf',size:10}]});
 await w.testRequest.sendGroupedRequest(form);await w.testRequest.sendGroupedRequest(form);
 assert.equal(uploads.length,2);assert.notEqual(calls[0].p_lines[0].attachment_path,calls[0].p_lines[1].attachment_path);assert.deepEqual(calls[0],calls[1]);
 Object.defineProperty(inputs[1],'files',{value:[{name:'big.pdf',size:11*1024*1024}]});await w.testRequest.sendGroupedRequest(form);assert.equal(calls.length,2);assert.match(form.textContent,/groter dan 10 MB/);
});
