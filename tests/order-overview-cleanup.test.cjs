const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const erp=fs.readFileSync(path.join(__dirname,'..','assets','erp.js'),'utf8');

test('active overview excludes persisted completed states even with a stale cache',()=>{
 assert.match(erp,/const isFinished=o=>[\s\S]*'completed','closed','done','cancelled','deleted'/);
 assert.match(erp,/getActiveOrders\?perf\(\)\.getActiveOrders\(\):s\.orders\)[\s\S]*filter\(o=>!isFinished\(o\)/);
});

test('unfinished quick orders have a confirmed soft-delete action',()=>{
 assert.match(erp,/data-delete-quick-order/);
 assert.match(erp,/function deleteQuickOrder/);
 assert.match(erp,/o\.deleted=true;o\.active=false;o\.status='deleted'/);
 assert.match(erp,/Snelle order .* verwijderen\?/);
});
