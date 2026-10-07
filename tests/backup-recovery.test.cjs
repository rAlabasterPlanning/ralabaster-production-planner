const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

test('volledige back-up is direct bereikbaar vanuit beide orderoverzichten',async t=>{
 const f=await fullApp(t),{w}=f,d=w.document;
 assert.equal(d.querySelectorAll('#view-orders [data-backup-download]').length,1);
 w.RALAB_ERP.show('orderoverview');await f.wait(80);
 assert.equal(d.querySelectorAll('#view-orderoverview [data-backup-download]').length,1);
});

test('volledige back-up wacht op synchronisatie en downloadt daarna de export',async t=>{
 const f=await fullApp(t),{w,ctx}=f,d=w.document;
 vm.runInContext(`
  window.__backupEvents=[];
  window.__resolveBackupFlush=null;
  RALAB_PERFORMANCE.flushCloudSave=()=>new Promise(resolve=>{
   window.__backupEvents.push('flush');
   window.__resolveBackupFlush=resolve;
  });
  supabaseClient={rpc:async name=>{
   window.__backupEvents.push(name);
   return {data:{format:'ralabaster-full-backup-v1',exportedAt:'2026-10-07T10:00:00.000Z',data:{orders:[{}],tasks:[{},{}]}},error:null};
  }};
  cloudUser={id:'backup-admin'};
  URL.createObjectURL=()=>{window.__backupEvents.push('download');return 'blob:test'};
  URL.revokeObjectURL=()=>{};
  HTMLAnchorElement.prototype.click=function(){};
 `,ctx);
 d.querySelector('#view-orders [data-backup-download]').click();await f.wait(20);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(window.__backupEvents)',ctx)),['flush']);
 vm.runInContext('window.__resolveBackupFlush()',ctx);await f.wait(80);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(window.__backupEvents)',ctx)),['flush','planner_export_backup','download']);
 assert.ok(f.errors.some(x=>x.includes('Volledige back-up gemaakt: 1 orders en 2 taken')));
});
