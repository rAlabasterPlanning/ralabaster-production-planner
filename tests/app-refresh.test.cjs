const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('refresh remembers the visible page and restores through its normal navigation',t=>{
 const d=new JSDOM('<button class="navbtn" data-view="queue"></button><main><section id="view-orders" class="hidden"></section><section id="view-queue"></section></main>',{url:'https://planner.test',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;vm.runInContext(fs.readFileSync('assets/app-refresh.js','utf8'),d.getInternalVMContext());
 w.RALAB_APP_REFRESH.remember();assert.equal(w.sessionStorage.getItem('ralabaster-refresh-view'),'queue');let clicked=0;w.document.querySelector('button').addEventListener('click',()=>clicked++);w.RALAB_APP_REFRESH.restore();assert.equal(clicked,1);assert.equal(w.sessionStorage.getItem('ralabaster-refresh-view'),null);w.RALAB_APP_REFRESH.restore();assert.equal(clicked,1);
 w.sessionStorage.setItem('ralabaster-refresh-view','missing');w.RALAB_APP_REFRESH.restore();assert.equal(clicked,1);
});
